import { describe, expect, it } from 'vitest'

import { computeDiff, type RasterImage } from '@/modules/compare/diff'
import { groupDiffRegions, type DiffRegion } from '@/modules/compare/regions'
import { createDiffClient, READY_TIMEOUT_MS, REPLY_TIMEOUT_MS } from '@/pages/compare/worker-client'

import type { DiffReply, DiffRequest, WorkerLike } from '@/modules/compare/diff-protocol'

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
function fakeWorker(options: { ready?: boolean; failRequest?: boolean; swallow?: boolean } = {}): {
  worker: WorkerLike
  posted: DiffRequest[]
  /** أطوال المخازن المُمرَّرة في قائمة النقل، مقروءةً **بعد** الإرسال. */
  transferred: number[][]
} {
  const chan = new MessageChannel()
  const handlers = {
    message: [] as ((e: { data: unknown }) => void)[],
    error: [] as ((e: unknown) => void)[],
  }
  const posted: DiffRequest[] = []
  const transferred: number[][] = []

  // جانب الخيط: يستقبل الطلب، ويحسب الفرق والمناطق، ويردّ ناقلًا.
  chan.port2.onmessage = (e: MessageEvent) => {
    const req = e.data as DiffRequest
    posted.push(req)
    if (options.swallow) return
    if (options.failRequest) {
      chan.port2.postMessage({ id: req.id, error: 'فشل مصطنع' })
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
  return { worker, posted, transferred }
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
