import { describe, expect, it } from 'vitest'

import { computeDiff, type DiffOptions, type RasterImage } from '@/modules/compare/diff'
import {
  isReply,
  type DiffReply,
  type DiffRequest,
  type WorkerLike,
} from '@/modules/compare/diff-protocol'
import { groupDiffRegions, type DiffRegion, type RegionOptions } from '@/modules/compare/regions'
import { createDiffClient, READY_TIMEOUT_MS, REPLY_TIMEOUT_MS } from '@/pages/compare/worker-client'
import { deviceRect } from '@/shared/geometry'

/**
 * عقد الرسائل والسقوط المتزامن — مرآة `blur-worker-client.test.ts` (المرحلة
 * 15) بنفس الصرامة، ودمية `WorkerLike` فوق `MessageChannel` حقيقية لنفس
 * السبب: `postMessage` عادية تُمرّر المخزن بالمرجع فتُخفي بالضبط ما جاء هذا
 * الاختبار ليُثبته — أن النقل يفصل مخزن المُرسِل فعلًا.
 *
 * **وهنا مخزنان يُنقلان في نداء واحد لا مخزن واحد.** فالاختبار المميِّز لهذا
 * الملفّ عن نظيره في المحرر هو التحقّق من أن **كليهما** يُفصلان معًا، وأن
 * السقوط بعد فشل أو مهلة يستعمل النسختين المحتجَزتين لا الأصليتين
 * المفصولتين — فيُنتج `diffPixelCount`/`diffRatio` صحيحين من بيانات حقيقية،
 * لا صفرًا يوهم بتطابق لم يقع.
 */

const W = 20
const H = 20

/** صورة صلبة اللون — كل بكسل بنفس القيمة (نفس نمط `diff.test.ts`). */
function solid(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { data, width, height }
}

function clone(img: RasterImage): RasterImage {
  return { data: Uint8ClampedArray.from(img.data), width: img.width, height: img.height }
}

/** كتلة مربّعة من بكسلات مختلفة — أكبر من `minPixels` الافتراضي (4) كي تنجو من الترشيح. */
function setBlock(
  img: RasterImage,
  x: number,
  y: number,
  size: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      img.data.set(rgba, ((y + dy) * img.width + (x + dx)) * 4)
    }
  }
}

const GRAY = [100, 100, 100, 255] as const
const RED = [250, 10, 10, 255] as const

/** زوج صورتين بفرق حقيقي واحد بحجم 3×3 — ينجو من الترشيح الافتراضي. */
function makeImages(): { a: RasterImage; b: RasterImage } {
  const a = solid(W, H, GRAY)
  const b = clone(a)
  setBlock(b, 5, 5, 3, RED)
  return { a, b }
}

/** الحقيقة المرجعية: الدالّتان نفساهما على نسخ مستقلّة، متزامنةً. */
function expected(
  a: RasterImage,
  b: RasterImage,
): { diff: ReturnType<typeof computeDiff>; regions: DiffRegion[] } {
  const diff = computeDiff(clone(a), clone(b))
  const regions = groupDiffRegions(diff.mask, diff.overlap.width, diff.overlap.height)
  return { diff, regions }
}

/**
 * خيط دمية **على `MessageChannel` حقيقية** — يستدعي `computeDiff` ثم
 * `groupDiffRegions` فعليًّا على ما يصله كي يُحاكي ردًّا صحيحًا من
 * `diff.worker.ts`، لا بيانات مصطنعة.
 */
function fakeWorker(
  options: {
    ready?: boolean
    failRequest?: boolean
    swallow?: boolean
    /** ينهار الخيط وهو يعالج الطلب: حدث `error` بدل ردٍّ أو فشلٍ مُصاغ. */
    errorOnRequest?: boolean
    /** `postMessage` نفسها ترمي — خيطٌ مات قبل الإرسال أو مخزنٌ لا يُنقل. */
    throwOnPost?: boolean
    /** ردٌّ بلا `error` وبلا حقول الردّ — لا يُعرَف فشلًا بالنفي وحده. */
    malformed?: boolean
  } = {},
): {
  worker: WorkerLike
  posted: DiffRequest[]
  /** أطوال المخازن المُمرَّرة في قائمة النقل، مقروءةً **بعد** الإرسال. */
  transferred: number[][]
  /** يُطلق حدث `error` من الخارج — لفحص انهيارٍ **قبل** الجهوز. */
  fireError: () => void
} {
  const chan = new MessageChannel()
  const handlers = {
    message: [] as ((e: { data: unknown }) => void)[],
    error: [] as ((e: unknown) => void)[],
  }
  const posted: DiffRequest[] = []
  const transferred: number[][] = []
  // نسخة من القائمة: أوّل مستمع يستدعي `kill` فيُفرِغ `handlers` أثناء الدوران.
  const fireError = (): void => {
    for (const h of [...handlers.error]) h({ type: 'error' })
  }

  // جانب الخيط: يستقبل الطلب، ويحسب الفرق والمناطق، ويردّ ناقلًا.
  chan.port2.onmessage = (e: MessageEvent) => {
    const req = e.data as DiffRequest
    posted.push(req)
    if (options.errorOnRequest) {
      fireError()
      return
    }
    if (options.swallow) return
    if (options.failRequest) {
      chan.port2.postMessage({ id: req.id, error: 'فشل مصطنع' })
      return
    }
    // ردٌّ بلا `error` وبلا حقول الردّ — خيطٌ من نسخة أقدم، أو خطأ برمجي
    // فيه يردّ كائنًا ناقصًا. لا يُعرَف فشلًا بالنفي وحده.
    if (options.malformed) {
      chan.port2.postMessage({ id: req.id, ok: true, whatever: 'شكل غير معروف' })
      return
    }
    const a: RasterImage = {
      data: new Uint8ClampedArray(req.a.buffer),
      width: req.a.width,
      height: req.a.height,
    }
    const b: RasterImage = {
      data: new Uint8ClampedArray(req.b.buffer),
      width: req.b.width,
      height: req.b.height,
    }
    const diff = computeDiff(a, b, req.diffOptions)
    const regions = groupDiffRegions(
      diff.mask,
      diff.overlap.width,
      diff.overlap.height,
      req.regionOptions,
    )
    const reply: DiffReply = {
      id: req.id,
      diffBuffer: diff.diff.data.buffer as ArrayBuffer,
      diffWidth: diff.diff.width,
      diffHeight: diff.diff.height,
      overlap: diff.overlap,
      diffPixelCount: diff.diffPixelCount,
      comparedPixels: diff.comparedPixels,
      excludedPixels: diff.excludedPixels,
      diffRatio: diff.diffRatio,
      extraInA: diff.extraInA,
      extraInB: diff.extraInB,
      regions,
      ms: 1,
    }
    chan.port2.postMessage(reply, [reply.diffBuffer])
  }
  chan.port2.start?.()

  chan.port1.onmessage = (e: MessageEvent) => {
    for (const h of handlers.message) h({ data: e.data })
  }
  chan.port1.start?.()

  const worker: WorkerLike = {
    postMessage(message: unknown, transfer?: Transferable[]) {
      if (options.throwOnPost) throw new Error('نقل مرفوض')
      chan.port1.postMessage(message, transfer ?? [])
      // بعد الإرسال: مخزنٌ نُقل فعلًا يقرأ صفرًا هنا، ومخزنٌ نُسخ لا يقرأه.
      transferred.push((transfer ?? []).map((t) => (t as ArrayBuffer).byteLength))
    },
    addEventListener(type: 'message' | 'error', handler: never) {
      if (type === 'message') {
        handlers.message.push(handler)
        if (options.ready !== false) {
          queueMicrotask(() =>
            (handler as (e: { data: unknown }) => void)({ data: { id: -1, ready: true } }),
          )
        }
      } else {
        handlers.error.push(handler)
      }
    },
    terminate() {
      handlers.message.length = 0
      handlers.error.length = 0
      chan.port1.close()
      chan.port2.close()
    },
  }
  return { worker, posted, transferred, fireError }
}

describe('عميل خيط الفرق', () => {
  it('يمرّ على الخيط حين يجهز، ويُعيد DiffOutcome الصحيح من ردّ حقيقي', async () => {
    const { worker, posted } = fakeWorker()
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('worker')
    expect(out.reason).toBeNull()
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.comparedPixels).toBe(ref.diff.comparedPixels)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.overlap).toEqual(ref.diff.overlap)
    expect(out.extraInA).toEqual(ref.diff.extraInA)
    expect(out.extraInB).toEqual(ref.diff.extraInB)
    expect(out.diff.width).toBe(ref.diff.diff.width)
    expect(out.diff.height).toBe(ref.diff.diff.height)
    expect(out.diff.data).toEqual(ref.diff.diff.data)
    expect(Array.from(out.mask)).toEqual(Array.from(ref.diff.mask))
    expect(out.regions).toEqual(ref.regions)
    expect(out.regions.length).toBeGreaterThan(0)
    expect(posted).toHaveLength(1)
    client.dispose()
  })

  /*
   * كان هذا الاختبار يؤكّد أنّ مخزنَي المستدعي **يُفصلان** بعد النداء —
   * فيحرس كسرًا بدل أن يكشفه: `ComparePage` تعيد النداء على `raster` نفسه
   * كلّما تحرّك شريط الحساسية، فكان أوّل تحريك يرمي على مخزن مفصول.
   * صار العقد مقلوبًا: المنقول نسختان، والأصل يبقى لمالكه.
   */
  it('**مخزنا المستدعي يبقيان سليمين** — المنقول نسختاهما لا هما', async () => {
    const { worker, transferred } = fakeWorker()
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()

    await client.run(a, b)

    expect(a.data.buffer.byteLength).toBeGreaterThan(0)
    expect(b.data.buffer.byteLength).toBeGreaterThan(0)
    // والنسختان نُقلتا فعلًا لا نُسختا ثانيةً على الرسالة: مخزنٌ منقول
    // يقرأ صفرًا بعد الإرسال، ومنسوخٌ يبقى بطوله.
    expect(transferred).toHaveLength(1)
    expect(transferred[0]).toEqual([0, 0])
    client.dispose()
  })

  /*
   * `isFailure` تنفي وجود `error` فقط. رسالةٌ بشكل غير متوقَّع تعبر ذلك
   * النفي فتُقرأ نجاحًا، ثمّ يقرأ `outcomeFromReply` حقولًا غير موجودة
   * فيرمي داخل معالج رسالة — والصفحة تبيضّ بلا رسالة يفهمها أحد.
   */
  it('**ردٌّ بشكل غير معروف يسقط إلى الحساب المتزامن** — لا يُقبَل نجاحًا', async () => {
    const { worker } = fakeWorker({ malformed: true })
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    // والنتيجة صحيحة لا صفرٌ ولا رقعةٌ فارغة — انحدارٌ في الأداء لا في الصحّة.
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.regions).toEqual(ref.regions)
    client.dispose()
  })

  it('**نداءان متتاليان على الصورتين نفسيهما** — وهو ما يفعله شريط الحساسية', async () => {
    const { worker } = fakeWorker()
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const first = await client.run(a, b, { threshold: 0.1 })
    const second = await client.run(a, b, { threshold: 0.3 })

    expect(first.path).toBe('worker')
    expect(second.path).toBe('worker')
    expect(second.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(second.comparedPixels).toBe(ref.diff.comparedPixels)
    client.dispose()
  })

  it('**والنداء الثاني يعمل في مسار السقوط أيضًا** — لا فرق بين المسارين', async () => {
    const client = createDiffClient({ spawn: () => null })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    await client.run(a, b)
    const second = await client.run(a, b)

    expect(second.path).toBe('main')
    expect(second.diffPixelCount).toBe(ref.diff.diffPixelCount)
    client.dispose()
  })

  it('**وبيئةٌ بلا Worker تسقط إلى الخيط الرئيسي بفرقٍ صحيح** — لا صفر ولا عشوائي', async () => {
    const client = createDiffClient({ spawn: () => null })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('spawn-failed')
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.regions).toEqual(ref.regions)
  })

  it('**وخيطٌ لا يجهز يسقط بعد مهلة الجهوز** — بفرقٍ صحيح لا انتظار بلا نهاية', async () => {
    const { worker } = fakeWorker({ ready: false })
    const fired: number[] = []
    const client = createDiffClient({
      spawn: () => worker,
      timer: (fn, ms) => {
        fired.push(ms)
        queueMicrotask(fn)
        return () => undefined
      },
    })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('ready-timeout')
    expect(fired).toContain(READY_TIMEOUT_MS)
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.regions).toEqual(ref.regions)
  })

  it('**وخيطٌ لا يردّ يسقط بعد مهلة الردّ** — بفرقٍ صحيح على النسختين المحتجَزتين', async () => {
    const { worker } = fakeWorker({ swallow: true })
    const fired: number[] = []
    const client = createDiffClient({
      spawn: () => worker,
      timer: (fn, ms) => {
        fired.push(ms)
        // مهلة الجهوز لا تُطلَق يدويًّا — الجهوز يصل عبر رسالة حقيقية
        // فيُلغيها أوّلًا؛ إطلاقها هنا أيضًا يفتح سباقًا زائفًا مع الجهوز.
        if (ms === REPLY_TIMEOUT_MS) queueMicrotask(fn)
        return () => undefined
      },
    })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('reply-timeout')
    expect(fired).toContain(REPLY_TIMEOUT_MS)
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.regions).toEqual(ref.regions)
    client.dispose()
  })

  it('**وفشلٌ بعد النقل يُنقَذ بالنسختين** — لا رقعة فارغة تدّعي أنها فرق', async () => {
    const { worker } = fakeWorker({ failRequest: true })
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.regions).toEqual(ref.regions)
    client.dispose()
  })

  it('و`lastPath` يُعلن أي مسار عمل — تقرؤه أداة الفحص الحيّ', async () => {
    const client = createDiffClient({ spawn: () => null })
    expect(client.lastPath).toBeNull()
    const { a, b } = makeImages()
    await client.run(a, b)
    expect(client.lastPath).toBe('main')
  })

  it('والخيط يُنشأ مرّة واحدة مهما تعدّدت الطلبات', async () => {
    const { worker } = fakeWorker()
    let spawnCount = 0
    const client = createDiffClient({
      spawn: () => {
        spawnCount++
        return worker
      },
    })
    const first = makeImages()
    const second = makeImages()
    await client.run(first.a, first.b)
    await client.run(second.a, second.b)
    expect(spawnCount).toBe(1)
    client.dispose()
  })

  it('**وبعد `dispose` يبقى الحساب صحيحًا على الخيط الرئيسي**', async () => {
    const { worker } = fakeWorker()
    const client = createDiffClient({ spawn: () => worker })
    const first = makeImages()
    await client.run(first.a, first.b)
    client.dispose()

    const second = makeImages()
    const ref = expected(second.a, second.b)
    const out = await client.run(second.a, second.b)
    expect(out.path).toBe('main')
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
  })
})

/**
 * الاختبارات أعلاه تقارن مسار الخيط بمسار السقوط على **الخيارات الافتراضية**
 * وحدها. وذلك يترك ادّعاء الترويسة — «الدالّتان نفساهما لا نسختان» — بلا
 * إثبات: لو أسقط `runHere` خيارات المستدعي كلّها (`computeDiff(a, b)` بلا
 * معامل ثالث) لبقيت المقارنة خضراء، لأن الافتراضي هو ما كان يُقاس أصلًا.
 *
 * وهذا ليس افتراضًا نظريًّا: `ComparePage` تمرّر عتبةً من شريط الحساسية
 * وألوانًا مقروءةً من التوكنز في كل نداء، فإسقاطها في مسار السقوط يعني أن
 * شريط الحساسية يتوقّف عن العمل عند أوّل بيئة بلا `Worker` — بلا أي إشارة.
 */
describe('عميل خيط الفرق — الخيارات غير الافتراضية عبر المسارين', () => {
  /** عتبة أعلى، ولونان متمايزان — لا شيء منها افتراضيّ. */
  const CUSTOM_DIFF: Partial<DiffOptions> = {
    threshold: 0.45,
    removedColor: [7, 11, 13],
    addedColor: [19, 23, 29],
  }
  /** عكس الافتراضي (4 و4) في الحقلين معًا. */
  const CUSTOM_REGIONS: Partial<RegionOptions> = { dilate: 0, minPixels: 1 }

  /**
   * زوجٌ مصمَّم كي **تُحدث** كل مجموعة خيارات أثرًا مقيسًا، بأرقام مشتقّة لا
   * منسوخة. الرماديات وحدها كي ينعدم المركّبان I وQ فيبقى
   * `delta = 0.5053 × d²`:
   *
   * - كتلة 3×3 عند (5,5) بفرق `d = 60` ⇐ `delta = 1819`.
   * - كتلة 3×3 عند (12,12) بفرق `d = 155` ⇐ `delta = 12140`.
   * - بكسل معزول واحد عند (17,2) بفرق `d = 155`.
   *
   * وسقفا العتبتين: `35215 × 0.1² = 352.15` و`35215 × 0.45² = 7131.04`.
   * فبالعتبة الافتراضية تُعدّ الثلاثة (9 + 9 + 1 = 19)، وبعتبة 0.45 تسقط
   * كتلة الـ60 وحدها (9 + 1 = 10).
   */
  function makeTunedImages(): { a: RasterImage; b: RasterImage } {
    const a = solid(W, H, GRAY)
    const b = clone(a)
    setBlock(b, 5, 5, 3, [160, 160, 160, 255])
    setBlock(b, 12, 12, 3, [255, 255, 255, 255])
    setBlock(b, 17, 2, 1, [255, 255, 255, 255])
    return { a, b }
  }

  const pixelAt = (out: { diff: RasterImage }, x: number, y: number): number[] =>
    Array.from(out.diff.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4))

  it('**مسار السقوط يحترم خيارات المستدعي حرفيًّا — بايتًا ببايت كمسار الخيط**', async () => {
    const { worker, posted } = fakeWorker()
    const viaWorker = createDiffClient({ spawn: () => worker })
    const viaMain = createDiffClient({ spawn: () => null })
    const onThread = makeTunedImages()
    const onMain = makeTunedImages()

    const w = await viaWorker.run(onThread.a, onThread.b, CUSTOM_DIFF, CUSTOM_REGIONS)
    const m = await viaMain.run(onMain.a, onMain.b, CUSTOM_DIFF, CUSTOM_REGIONS)

    expect(w.path).toBe('worker')
    expect(m.path).toBe('main')
    expect(m.diffPixelCount).toBe(w.diffPixelCount)
    expect(m.comparedPixels).toBe(w.comparedPixels)
    expect(m.diffRatio).toBe(w.diffRatio)
    expect(Array.from(m.diff.data)).toEqual(Array.from(w.diff.data))
    expect(Array.from(m.mask)).toEqual(Array.from(w.mask))
    expect(m.regions).toEqual(w.regions)
    // والطلب حمل الخيارات إلى الخيط كما هي — لا افتراضيًّا مُعاد بناؤه هناك.
    expect(posted[0]?.diffOptions).toEqual(CUSTOM_DIFF)
    expect(posted[0]?.regionOptions).toEqual(CUSTOM_REGIONS)

    viaWorker.dispose()
    viaMain.dispose()
  })

  it('وهذه الخيارات مُميِّزة فعلًا: العدّ والألوان والمناطق كلّها تخالف الافتراضي', async () => {
    // بلا هذه الحالة تبقى المساواة أعلاه قابلةً للتحقّق حتى لو أُسقطت
    // الخيارات في **المسارين** معًا.
    const client = createDiffClient({ spawn: () => null })
    const tuned = makeTunedImages()
    const plain = makeTunedImages()

    const custom = await client.run(tuned.a, tuned.b, CUSTOM_DIFF, CUSTOM_REGIONS)
    const fallback = await client.run(plain.a, plain.b)

    // العتبة: 19 بالافتراضية، و10 بـ0.45 (الاشتقاق في تعليق `makeTunedImages`).
    expect(fallback.diffPixelCount).toBe(19)
    expect(custom.diffPixelCount).toBe(10)

    /*
     * الألوان: ب أفتح من أ في كل بكسل مختلف (160 و255 فوق 100)، أي أن أ
     * **أغمق** — فالبكسل يأخذ `removedColor` بالقاعدة المقيسة في
     * `diff.test.ts`. الافتراضي أحمر `[255, 0, 0]`، والمخصّص `[7, 11, 13]`.
     */
    expect(pixelAt(fallback, 12, 12)).toEqual([255, 0, 0, 255])
    expect(pixelAt(custom, 12, 12)).toEqual([7, 11, 13, 255])

    /*
     * المناطق: بالافتراضي (dilate 4، minPixels 4) تنتفخ الكتلتان
     * (5..7 و12..14 في المحورين) إلى مربّعين متداخلين فتندمجان في منطقة
     * واحدة، ويسقط البكسل المعزول لأنه دون الحدّ الأدنى ⇐ منطقة واحدة.
     * وبالمخصّص (0 و1) لا انتفاخ ولا ترشيح: كتلة (12,12) والبكسل المعزول
     * ⇐ منطقتان.
     */
    expect(fallback.regions).toHaveLength(1)
    expect(custom.regions).toHaveLength(2)
    expect(custom.regions.map((r) => [r.rect.x, r.rect.y, r.rect.width, r.rect.height])).toEqual([
      [17, 2, 1, 1],
      [12, 12, 3, 3],
    ])
  })

  it('**والخيارات تصل مسار السقوط بعد فشل الخيط أيضًا** — لا نداءً افتراضيًّا للإنقاذ', async () => {
    // موضعا نداء `runHere` اثنان: قبل الجهوز وبعد فشل الردّ. الأوّل مقيس
    // أعلاه، وهذا الثاني كان بلا حراسة على الخيارات.
    const { worker } = fakeWorker({ failRequest: true })
    const client = createDiffClient({ spawn: () => worker })
    const rescued = makeTunedImages()
    const reference = createDiffClient({ spawn: () => null })
    const plain = makeTunedImages()

    const out = await client.run(rescued.a, rescued.b, CUSTOM_DIFF, CUSTOM_REGIONS)
    const ref = await reference.run(plain.a, plain.b, CUSTOM_DIFF, CUSTOM_REGIONS)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    expect(out.diffPixelCount).toBe(ref.diffPixelCount)
    expect(Array.from(out.diff.data)).toEqual(Array.from(ref.diff.data))
    expect(out.regions).toEqual(ref.regions)
    // ولا يساوي ما كان الافتراضي سيعطيه — فالمساواة أعلاه ليست مصادفة.
    expect(out.diffPixelCount).not.toBe(19)

    client.dispose()
    reference.dispose()
  })
})

/**
 * مسارا الفشل الحقيقيّان — حدث `error` من الخيط، ورمي `postMessage` نفسه —
 * كانا بلا تغطية بينما المهلتان مغطّاتان. والفرق جوهري: المهلة تُنقذ الطلب
 * بعد ثوانٍ، أمّا هذان فيقعان فورًا وبلا مؤقّت ينقذهما إن لم يعالجهما العميل.
 *
 * ولهذا يُحقَن هنا **مؤقّت لا يُطلق أبدًا**: لو لم يكن معالج الخطأ هو ما
 * يُنهي الطلب، لعلّق الوعد إلى ما لا نهاية وسقط الاختبار بمهلته — لا بمرور
 * صامت.
 */
describe('عميل خيط الفرق — المناطق المستثناة تعبر الرسالة (ADR 0034)', () => {
  it('**`exclude` يصل الخيط كما هو، والنتيجة بايتًا ببايت كمسار السقوط**', async () => {
    const { worker, posted } = fakeWorker()
    const viaWorker = createDiffClient({ spawn: () => worker })
    const viaMain = createDiffClient({ spawn: () => null })
    // المنطقة تغطّي الرقعة الحمراء (5..7 × 5..7) كلّها ومعها عمودٌ خالٍ.
    const options: Partial<DiffOptions> = { exclude: [deviceRect(4, 4, 5, 4)] }

    const onThread = makeImages()
    const onMain = makeImages()
    const w = await viaWorker.run(onThread.a, onThread.b, options)
    const m = await viaMain.run(onMain.a, onMain.b, options)

    expect(w.path).toBe('worker')
    expect(posted[0]?.diffOptions).toEqual(options)
    for (const out of [w, m]) {
      expect(out.diffPixelCount).toBe(0)
      expect(out.diffRatio).toBe(0)
      expect(out.excludedPixels).toBe(20)
      expect(out.comparedPixels).toBe(W * H - 20)
      expect(out.regions).toEqual([])
    }
    // والقناع المشتقّ من ألفا المخزن المنقول خالٍ هو الآخر — العميل لا يعيد عدّ ما صُفِّر.
    expect(Array.from(w.mask)).toEqual(Array.from(m.mask))
    expect(Array.from(w.diff.data)).toEqual(Array.from(m.diff.data))

    viaWorker.dispose()
    viaMain.dispose()
  })

  it('وردٌّ بلا `excludedPixels` لا يُقبل نجاحًا — يسقط إلى الحساب المتزامن', () => {
    const reply = { ...expectedReply(), excludedPixels: undefined }
    expect(isReply(reply)).toBe(false)
    expect(isReply(expectedReply())).toBe(true)
  })
})

/** ردٌّ كامل الشكل من الدالّتين نفسيهما — لاختبار `isReply` وحده. */
function expectedReply(): DiffReply {
  const { a, b } = makeImages()
  const { diff, regions } = expected(a, b)
  return {
    id: 1,
    diffBuffer: diff.diff.data.buffer as ArrayBuffer,
    diffWidth: diff.diff.width,
    diffHeight: diff.diff.height,
    overlap: diff.overlap,
    diffPixelCount: diff.diffPixelCount,
    comparedPixels: diff.comparedPixels,
    excludedPixels: diff.excludedPixels,
    diffRatio: diff.diffRatio,
    extraInA: diff.extraInA,
    extraInB: diff.extraInB,
    regions,
    ms: 1,
  }
}

describe('عميل خيط الفرق — انهيار الخيط ورفض النقل', () => {
  /** يسجّل المهل المطلوبة ولا يُطلق أيًّا منها. */
  const frozenTimer = (fired: number[]) => (_fn: () => void, ms: number) => {
    fired.push(ms)
    return () => undefined
  }

  it('**حدث `error` قبل الجهوز ← سقوط بـ`worker-error` بلا انتظار مهلة الجهوز**', async () => {
    const { worker, fireError } = fakeWorker({ ready: false })
    const fired: number[] = []
    const client = createDiffClient({ spawn: () => worker, timer: frozenTimer(fired) })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    // `run` يسجّل مستمعي الخيط تزامنيًّا قبل أوّل `await`، فالحدث يجد مستمعه.
    const pending = client.run(a, b)
    fireError()
    const out = await pending

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    // مهلة الجهوز طُلبت ولم تُطلق: الإنقاذ جاء من الحدث لا من المؤقّت.
    expect(fired).toEqual([READY_TIMEOUT_MS])
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.regions).toEqual(ref.regions)
  })

  it('**وحدث `error` على طلبٍ معلَّق بعد الجهوز ← نفس السقوط، والخيط يبقى ميّتًا**', async () => {
    const { worker } = fakeWorker({ errorOnRequest: true })
    const fired: number[] = []
    const client = createDiffClient({ spawn: () => worker, timer: frozenTimer(fired) })
    const first = makeImages()
    const ref = expected(first.a, first.b)

    const out = await client.run(first.a, first.b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    // المهلتان معًا طُلبتا ولم تُطلق واحدة — الطلب المعلَّق حُلّ بالحدث.
    expect(fired).toEqual([READY_TIMEOUT_MS, REPLY_TIMEOUT_MS])
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.regions).toEqual(ref.regions)

    // وما بعده لا يعود إلى خيط منهار: نداء ثانٍ على الخيط الرئيسي مباشرةً.
    const second = makeImages()
    const after = await client.run(second.a, second.b)
    expect(after.path).toBe('main')
    expect(after.reason).toBe('worker-error')
    expect(after.diffPixelCount).toBe(ref.diff.diffPixelCount)
  })

  it('**ورمي `postMessage` نفسه لا يُسرّب استثناءً إلى المستدعي**', async () => {
    // بلا الْتقاطٍ حول `postMessage` يُرفَض وعد `run`، و`ComparePage` تُعلن
    // «تعذّر حساب الفرق» بدل أن تعرض فرقًا صحيحًا حُسب على الخيط الرئيسي.
    const { worker } = fakeWorker({ throwOnPost: true })
    const client = createDiffClient({ spawn: () => worker })
    const { a, b } = makeImages()
    const ref = expected(a, b)

    const out = await client.run(a, b)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    expect(out.diffPixelCount).toBe(ref.diff.diffPixelCount)
    expect(out.diffPixelCount).toBeGreaterThan(0)
    expect(out.diffRatio).toBeCloseTo(ref.diff.diffRatio, 10)
    expect(out.regions).toEqual(ref.regions)
    // والمخزنان اللذان بقيا عند مالكهما هما ما حُسب عليهما الفرق.
    expect(a.data.buffer.byteLength).toBeGreaterThan(0)
    expect(b.data.buffer.byteLength).toBeGreaterThan(0)
    expect(client.lastPath).toBe('main')
  })
})
