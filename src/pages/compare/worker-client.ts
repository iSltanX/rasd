/**
 * عميل محرك الفرق — خيط ثانوي حين يتيسّر، وسقوط متزامن حين لا. نمط
 * `pages/editor/worker-client.ts` بالمرحلة 15 حرفيًّا: المسار المتزامن ينادي
 * **الدالّتين نفسيهما** (`computeDiff`، `groupDiffRegions`) لا نسخة موازية،
 * فالمسارّان يُنتجان البايتات والمناطق نفسها لا مثيلها.
 *
 * **هذا الملفّ عقدٌ عامّ ثابت لصفحة المقارنة** — تُبنى الواجهة فوقه، وإضافة
 * الخيط توسيعٌ داخليّ لا يُغيّر توقيع
 * `createDiffClient`/`DiffClient`/`DiffOutcome`/`ClientDeps`/`FallbackReason`.
 *
 * **نسختان تُحتجَزان قبل النقل — لا واحدة.** الطلب يحمل صورتين، وكلتاهما
 * تُنقَل في نداء `postMessage` واحد؛ فلو مات الخيط في منتصف الطلب ولم
 * تُحتجَز نسخة كلّ صورة على حدة، لَخرج فرقٌ على صورةٍ واحدة سليمة وأخرى
 * مفصولة (`byteLength === 0`) — لا رقعة سوداء فحسب بل استثناء أو فرقٌ كاذب.
 *
 * **`DiffReply` لا يحمل `mask`.** البروتوكول عمدًا لا ينقل القناع البكسلي
 * لتفادي رحلة سلكية ثانية لبيانات مشتقّة آليًّا من قناة ألفا في `diffBuffer`
 * الواصل بالفعل (`diff-protocol.ts`) — فالعميل يشتقّه محليًّا هنا بنفس صيغة
 * `diff.ts` الموثَّقة في تعليق `DiffResult.mask`، لا حسابًا موازيًا لمعنى
 * مختلف.
 */

import {
  computeDiff,
  type DiffOptions,
  type DiffResult,
  type RasterImage,
} from '@/modules/compare/diff'
import {
  isFailure,
  type DiffMessage,
  type DiffReply,
  type DiffRequest,
  type WorkerLike,
} from '@/modules/compare/diff-protocol'
import { groupDiffRegions, type DiffRegion, type RegionOptions } from '@/modules/compare/regions'

/** لماذا وقع الحساب على الخيط الرئيسي. `null` يعني عبر خيط ثانوي ناجح. */
export type FallbackReason =
  'unsupported' | 'spawn-failed' | 'ready-timeout' | 'worker-error' | 'reply-timeout' | 'disposed'

export interface DiffOutcome extends DiffResult {
  readonly regions: readonly DiffRegion[]
  readonly path: 'worker' | 'main'
  readonly reason: FallbackReason | null
  readonly ms: number
}

export interface DiffClient {
  run(
    a: RasterImage,
    b: RasterImage,
    diffOptions?: Partial<DiffOptions>,
    regionOptions?: Partial<RegionOptions>,
  ): Promise<DiffOutcome>
  /** المسار الذي عمل آخر مرّة — تقرؤه أداة الفحص الحيّ. */
  readonly lastPath: 'worker' | 'main' | null
  dispose(): void
}

export interface ClientDeps {
  readonly now?: () => number
  /** يُنشئ الخيط. يُحقن في الاختبار؛ ويرمي أو يُعيد `null` حين لا يمكن. */
  readonly spawn?: () => WorkerLike | null
  /** مؤقّت يُحقن كي تكون المهل حتمية في الاختبار. */
  readonly timer?: (fn: () => void, ms: number) => () => void
}

/** مهلة إشعار الجهوز — تحميل ملفّ من أصل الإضافة نفسه، لا من الشبكة. */
export const READY_TIMEOUT_MS = 2000

/**
 * مهلة الردّ على طلب واحد — أعلى من نظيرتها في `pages/editor/worker-client.ts`
 * (8000) عمدًا. طلب الفرق يحمل **صورتين** كاملتي الدقّة لا واحدة، ويمرّان
 * معًا بمقارنة `pixelmatch` ثم تمريرتي انتفاخ واتصال ثماني في تجميع المناطق
 * — عبء أثقل بأضعاف من تمرير بكسل ضبابي واحد على نفس المقاس، فمهلة بنفس
 * الرقم كانت ستُطلق سقوطًا زائفًا (`reply-timeout`) على لقطات كبيرة سليمة.
 */
export const REPLY_TIMEOUT_MS = 15000

/** يحسب على الخيط الرئيسي — الدالّتان نفساهما، بلا نسخة ثانية من الخوارزمية. */
function runHere(
  a: RasterImage,
  b: RasterImage,
  diffOptions: Partial<DiffOptions>,
  regionOptions: Partial<RegionOptions>,
  reason: FallbackReason,
  started: number,
  now: () => number,
): DiffOutcome {
  const diff = computeDiff(a, b, diffOptions)
  const regions = groupDiffRegions(
    diff.mask,
    diff.overlap.width,
    diff.overlap.height,
    regionOptions,
  )
  return { ...diff, regions, path: 'main', reason, ms: now() - started }
}

/**
 * `Uint8ClampedArray.buffer` مكتوب `ArrayBuffer | SharedArrayBuffer` في
 * تعريفات TypeScript الحديثة — لكن `RasterImage.data` هنا لا يأتي إلا من
 * `ImageData` أو تخصيص طازج، فلا `SharedArrayBuffer` واردة فعلًا على
 * الإطلاق (لا `postMessage` ولا `Atomics` في هذه الشجرة). تضييقٌ صريح في
 * نقطة واحدة بدل تكراره عند كل استخدام لـ`.buffer`.
 */
function bufferOf(data: Uint8ClampedArray): ArrayBuffer {
  return data.buffer as ArrayBuffer
}

/**
 * يشتقّ القناع من قناة ألفا في مخزن الفرق الواصل من الخيط — نفس صيغة
 * `diff.ts` الموثَّقة في تعليق `DiffResult.mask` («مُشتقّة من قناة ألفا في
 * `diff` مباشرةً») لا حسابًا موازيًا. البروتوكول لا ينقل القناع نفسه عمدًا
 * (انظر ترويسة الملفّ)، فهذا هو موضع اشتقاقه محليًّا.
 */
function maskFromDiffBuffer(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = (data[i * 4 + 3] ?? 0) > 0 ? 1 : 0
  }
  return mask
}

/** يبني `DiffOutcome` من ردّ الخيط — `overlap`/`extraIn*`/`regions` متوافقة بنيويًّا مع أشكال `modules/compare/` وقت التشغيل، فلا تحويل فعليّ. */
function outcomeFromReply(reply: DiffReply, started: number, now: () => number): DiffOutcome {
  const data = new Uint8ClampedArray(reply.diffBuffer)
  return {
    diff: { data, width: reply.diffWidth, height: reply.diffHeight },
    mask: maskFromDiffBuffer(data, reply.diffWidth, reply.diffHeight),
    overlap: reply.overlap,
    diffPixelCount: reply.diffPixelCount,
    comparedPixels: reply.comparedPixels,
    diffRatio: reply.diffRatio,
    extraInA: reply.extraInA,
    extraInB: reply.extraInB,
    regions: reply.regions,
    path: 'worker',
    reason: null,
    ms: now() - started,
  }
}

/**
 * الشكل الحرفي الذي يعرفه vite.
 *
 * `new URL` **داخل** `new Worker` بسلسلة نصّية ثابتة: رفعه إلى متغيّر يُسقط
 * المكوّن إلى مسار الأصول العامّ، فيخرج ملفّ `.ts` خامًا إلى `dist/` وتسقط
 * بوّابة الحزمة على «تسرّبت ملفات مصدر» (نفس قيد `pages/editor/worker-client.ts`).
 */
function spawnDefault(): WorkerLike | null {
  try {
    return new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return null
  }
}

const defaultTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

export function createDiffClient(deps: ClientDeps = {}): DiffClient {
  const now = deps.now ?? ((): number => performance.now())
  const timer = deps.timer ?? defaultTimer
  const spawn = deps.spawn ?? (typeof Worker === 'undefined' ? null : spawnDefault)

  let worker: WorkerLike | null = null
  let ready: Promise<boolean> | null = null
  let dead: FallbackReason | null = spawn === null ? 'unsupported' : null
  let nextId = 1
  let lastPath: 'worker' | 'main' | null = null

  const pending = new Map<number, (m: DiffMessage) => void>()

  /** يقتل الخيط ويعلن السبب — كل طلب بعده يقع على الخيط الرئيسي. */
  const kill = (reason: FallbackReason): void => {
    dead = reason
    for (const resolve of pending.values()) resolve({ id: -1, error: reason })
    pending.clear()
    try {
      worker?.terminate()
    } catch {
      // خيطٌ ميّت أصلًا — لا شيء يُنقَذ بمعالجة هذا.
    }
    worker = null
  }

  /** ينشئ الخيط وينتظر إشعار جهوزه مرّة واحدة. */
  const ensureReady = (): Promise<boolean> => {
    if (ready) return ready
    ready = new Promise<boolean>((resolve) => {
      if (dead || !spawn) return resolve(false)

      const made = spawn()
      if (!made) {
        dead = 'spawn-failed'
        return resolve(false)
      }
      worker = made

      let settled = false
      const cancel = timer(() => {
        if (settled) return
        settled = true
        kill('ready-timeout')
        resolve(false)
      }, READY_TIMEOUT_MS)

      made.addEventListener('message', (e: { data: unknown }) => {
        const data = e.data as { id?: number; ready?: boolean } | undefined
        if (data?.ready === true) {
          if (settled) return
          settled = true
          cancel()
          return resolve(true)
        }
        const msg = e.data as DiffMessage
        const waiting = typeof msg?.id === 'number' ? pending.get(msg.id) : undefined
        if (waiting) {
          pending.delete(msg.id)
          waiting(msg)
        }
      })

      /*
       * **السقوط يُقاد بوصول الحدث لا بمحتواه** — نفس سابقة
       * `pages/editor/worker-client.ts` (مقيسة هناك على ملفّ مفقود:
       * `error`/`message`/`filename`/`lineno` كلّها `null`).
       */
      made.addEventListener('error', () => {
        if (!settled) {
          settled = true
          cancel()
          kill('worker-error')
          return resolve(false)
        }
        kill('worker-error')
      })
    })
    return ready
  }

  return {
    get lastPath() {
      return lastPath
    },

    async run(a, b, diffOptions = {}, regionOptions = {}) {
      const started = now()

      const live = await ensureReady()
      if (!live || !worker) {
        const outcome = runHere(a, b, diffOptions, regionOptions, dead ?? 'unsupported', started, now)
        lastPath = outcome.path
        return outcome
      }

      const id = nextId++
      /*
       * **المنقول نسختان، ومخزنا المستدعي يبقيان سليمين.**
       *
       * كان المنقول مخزنَي المستدعي نفسيهما، والنسختان تُحتجزان لمسار
       * السقوط. وذلك يعطب النداء **الثاني**: `ComparePage` تعيد النداء
       * على `raster` نفسه كلّما تحرّك شريط الحساسية (تبعيّة `threshold`
       * في `useEffect`)، فيلقى مخزنًا مفصولًا و`slice(0)` عليه يرمي
       * `TypeError` — مقيسًا. فكانت «العتبة القابلة للضبط» التي ينصّ
       * عليها `§17` معطَّلةً من أوّل تحريك.
       *
       * وقلبُ الاتّجاه لا يكلّف شيئًا: النسخة كانت تُؤخذ في كل نداء أصلًا،
       * والفرق أنّ الذاهب إلى الخيط صار هو النسخة (نقلٌ بلا نسخ كما كان)
       * بينما يبقى الأصل عند مالكه — فيخدم النداء التالي ومسار السقوط معًا،
       * ولا حاجة لاحتجاز شيء.
       */
      const request: DiffRequest = {
        id,
        a: { buffer: bufferOf(a.data).slice(0), width: a.width, height: a.height },
        b: { buffer: bufferOf(b.data).slice(0), width: b.width, height: b.height },
        diffOptions,
        regionOptions,
      }

      const message = await new Promise<DiffMessage>((resolve) => {
        const cancel = timer(() => {
          if (!pending.has(id)) return
          pending.delete(id)
          kill('reply-timeout')
          resolve({ id, error: 'reply-timeout' })
        }, REPLY_TIMEOUT_MS)

        pending.set(id, (m: DiffMessage) => {
          cancel()
          resolve(m)
        })

        try {
          worker?.postMessage(request, [request.a.buffer, request.b.buffer])
        } catch (error) {
          pending.delete(id)
          cancel()
          kill('worker-error')
          resolve({ id, error: error instanceof Error ? error.message : String(error) })
        }
      })

      if (isFailure(message)) {
        // مخزنا المستدعي لم يُمسّا — المنقول نسختاهما — فيُحسَب عليهما
        // الفرق مباشرةً بلا احتجاز ولا استثناء على مخزن مفصول.
        const outcome = runHere(a, b, diffOptions, regionOptions, dead ?? 'worker-error', started, now)
        lastPath = outcome.path
        return outcome
      }

      lastPath = 'worker'
      return outcomeFromReply(message, started, now)
    },

    dispose() {
      kill('disposed')
      ready = null
    },
  }
}
