/**
 * عميل خيط الطمس — ومسار السقوط المتزامن.
 *
 * **السقوط ليس تحسين أداء بل شرط صحّة.** الـworker قد لا يُنشأ أصلًا (سياسة
 * مؤسّسية، أو ملفّ مفقود بعد تحديث جزئي)، وقد يموت. ومحرّرٌ يعرض منطقة
 * حسّاسة **بلا طمس** لأن خيطًا ثانويًّا لم يردّ هو أسوأ فشل ممكن في هذه
 * المرحلة: فشلٌ **مفتوح** يبدو سليمًا.
 *
 * فالمسار المتزامن ينادي `applyOps` نفسها التي يناديها الـworker، من الوحدة
 * نفسها. لا نسخة ثانية من الخوارزمية، ولا «تقريب سريع للمعاينة».
 *
 * **ونسخةٌ واحدة تُحتجَز قبل النقل — وهي شبكة الأمان لا حمولة الرسالة.**
 * النقل يفصل مخزن المُرسِل: `byteLength` يصير صفرًا. فلو نُقل المخزن الوحيد
 * ثمّ مات الـworker في منتصف الطلب، لما بقي ما يُحسب عليه، ولَخرجت رقعة
 * سوداء تدّعي أنها ضباب. فالمنقول هو **مخزن المستدعي**، والنسخة تبقى عندنا:
 * تُهمَل عند النجاح، وتُحسَب عليها العملية عند الفشل.
 *
 * **والمخزن المُمرَّر مستهلَك في المسارين.** لا فرق في العقد بين مسار نجح
 * وآخر سقط، وإلّا صار سلوك المستدعي معتمدًا على أيّهما عمل.
 */

import {
  isFailure,
  type BlurMessage,
  type BlurRequest,
  type ObscureOp,
  type WorkerLike,
} from '@/modules/editor/blur-protocol'
import { applyOps } from '@/modules/editor/redact'

/** لماذا وقع الحساب على الخيط الرئيسي. `null` يعني لم يقع. */
export type FallbackReason =
  'unsupported' | 'spawn-failed' | 'ready-timeout' | 'worker-error' | 'reply-timeout' | 'disposed'

export interface BlurOutcome {
  readonly buffer: ArrayBuffer
  readonly path: 'worker' | 'main'
  readonly reason: FallbackReason | null
  readonly ms: number
}

/** مهلة إشعار الجهوز — تحميل ملفّ من أصل الإضافة نفسه، لا من الشبكة. */
export const READY_TIMEOUT_MS = 2000

/** مهلة الردّ على طلب واحد. تتجاوز أسوأ رقعة مقيسة بأضعاف. */
export const REPLY_TIMEOUT_MS = 8000

export interface BlurClient {
  run(
    buffer: ArrayBuffer,
    width: number,
    height: number,
    ops: readonly ObscureOp[],
  ): Promise<BlurOutcome>
  /** المسار الذي عمل آخر مرّة — تقرؤه أداة الفحص الحيّ. */
  readonly lastPath: 'worker' | 'main' | null
  dispose(): void
}

export interface ClientDeps {
  /** يُنشئ الخيط. يُحقن في الاختبار؛ ويرمي أو يُعيد `null` حين لا يمكن. */
  readonly spawn?: () => WorkerLike | null
  readonly now?: () => number
  /** مؤقّت يُحقن كي تكون المهل حتمية في الاختبار. */
  readonly timer?: (fn: () => void, ms: number) => () => void
}

/**
 * الشكل الحرفي الذي يعرفه vite.
 *
 * `new URL` **داخل** `new Worker` بسلسلة نصّية ثابتة: مقيس أن رفعه إلى
 * متغيّر يُسقط المكوّن إلى مسار الأصول العامّ، فيخرج ملفّ `.ts` خامًا إلى
 * `dist/` وتسقط بوّابة الحزمة على «تسرّبت ملفات مصدر». والنوع `'module'`
 * كائنٌ حرفي كذلك — vite يرمي على خيار غير ثابت.
 */
function spawnDefault(): WorkerLike | null {
  try {
    return new Worker(new URL('../../workers/blur.worker.ts', import.meta.url), {
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

export function createBlurClient(deps: ClientDeps = {}): BlurClient {
  const now = deps.now ?? (() => performance.now())
  const timer = deps.timer ?? defaultTimer
  const spawn = deps.spawn ?? (typeof Worker === 'undefined' ? null : spawnDefault)

  let worker: WorkerLike | null = null
  let ready: Promise<boolean> | null = null
  let dead: FallbackReason | null = spawn === null ? 'unsupported' : null
  let nextId = 1
  let lastPath: 'worker' | 'main' | null = null

  const pending = new Map<number, (m: BlurMessage) => void>()

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
        const msg = e.data as BlurMessage
        const waiting = typeof msg?.id === 'number' ? pending.get(msg.id) : undefined
        if (waiting) {
          pending.delete(msg.id)
          waiting(msg)
        }
      })

      /*
       * **السقوط يُقاد بوصول الحدث لا بمحتواه.** مقيس على ملفّ مفقود: يصل
       * `error` و`message` و`filename` و`lineno` كلّها `null` — فقراءة
       * الرسالة لتقرير الفشل تعني ألّا يُقرَّر شيء.
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

  /** الحساب على الخيط الرئيسي — الدوالّ نفسها، بلا نسخة ثانية. */
  const runHere = (
    copy: ArrayBuffer,
    width: number,
    height: number,
    ops: readonly ObscureOp[],
    reason: FallbackReason,
    started: number,
  ): BlurOutcome => {
    applyOps({ data: new Uint8ClampedArray(copy), width, height }, ops)
    lastPath = 'main'
    return { buffer: copy, path: 'main', reason, ms: now() - started }
  }

  return {
    get lastPath() {
      return lastPath
    },

    async run(buffer, width, height, ops) {
      const started = now()
      // شبكة الأمان: نسخة تبقى عندنا مهما وقع للمنقول.
      const copy = buffer.slice(0)

      const live = await ensureReady()
      if (!live || !worker) {
        return runHere(copy, width, height, ops, dead ?? 'unsupported', started)
      }

      const id = nextId++
      // المنقول مخزن المستدعي، لا النسخة.
      const request: BlurRequest = { id, buffer, width, height, ops }

      const message = await new Promise<BlurMessage>((resolve) => {
        const cancel = timer(() => {
          if (!pending.has(id)) return
          pending.delete(id)
          kill('reply-timeout')
          resolve({ id, error: 'reply-timeout' })
        }, REPLY_TIMEOUT_MS)

        pending.set(id, (m: BlurMessage) => {
          cancel()
          resolve(m)
        })

        try {
          worker?.postMessage(request, [buffer])
        } catch (error) {
          pending.delete(id)
          cancel()
          kill('worker-error')
          resolve({ id, error: error instanceof Error ? error.message : String(error) })
        }
      })

      if (isFailure(message)) {
        // النسخة نجت من النقل — تُحسَب عليها العملية فتخرج بكسلات صحيحة
        // لا رقعةً سوداء تدّعي أنها ضباب.
        return runHere(copy, width, height, ops, dead ?? 'worker-error', started)
      }

      lastPath = 'worker'
      const reply = message
      return { buffer: reply.buffer, path: 'worker', reason: null, ms: now() - started }
    },

    dispose() {
      kill('disposed')
      ready = null
    },
  }
}
