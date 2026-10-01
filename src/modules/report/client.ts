/**
 * **إرسال البلاغ** — طلبٌ واحد إلى نقطة الاستقبال المسمّاة، من مخرج الشبكة الواحد (`shared/egress.ts`)، بعد تأكيد
 * المستخدم وحده ([ADR 0050](../../../Docs/ADR/0050-problem-reports.md)).
 *
 * - **المخرج يقرّر هل يُطلب أصلًا:** الأصل مسمًّى، و«الوضع المحلّي فقط» مطفأ مقروءًا من القرص لحظة الطلب، وصلاحية
 *   المضيف ممنوحة. وما سوى ذلك يُرفض قبل `fetch` بسببه المسمّى.
 * - **مفتاح عدم التكرار معرّف المسودة:** يُولد مرّة لكل بلاغ ويُعاد في كل محاولة، فردٌّ ضاع بعد أن فُتح البلاغ
 *   يُجاب في المحاولة التالية بالرقم نفسه (`200`) لا ببلاغٍ ثانٍ. ولا يعرّف المستخدم ولا جهازه.
 * - **كل فشلٍ سببٌ مسمّى** يقابل رسالةً في الواجهة لا رسالةً عامّة، ومعه هل تنفع إعادة المحاولة (العقد).
 */

import { egressFetch, type EgressRefusal } from '@/shared/egress'
import { NETWORK_SERVICES } from '@/shared/permission-policy'

import { serialise, type ReportPayload } from './payload'

const SERVICE = NETWORK_SERVICES.find((s) => s.id === 'reports')
if (!SERVICE) throw new Error('نقطة استقبال البلاغات غائبة عن NETWORK_SERVICES')

/** العنوان الوحيد الذي يُرسل إليه البلاغ — الأصل من القائمة المسمّاة، والمسار من العقد. */
export const REPORTS_ENDPOINT = `${SERVICE.origin}/v1/reports`
export const REPORTS_HOST_PATTERN = SERVICE.hostPattern

/** مهلة الطلب — صورةٌ بثلاثة ميغابايت على اتّصالٍ بطيء تكفيها، ومعلَّقٌ أطول منها فشلُ شبكة. */
export const SEND_TIMEOUT_MS = 60_000

export type SendFailure =
  | Exclude<EgressRefusal, 'network'>
  /** انقطاعٌ أو مهلةٌ أو رفضٌ من المتصفّح — يُعاد. */
  | 'network'
  /** ألغاه المستخدم أثناء الإرسال. */
  | 'cancelled'
  /** 400 — حقلٌ غير صالح أو منتَجٌ غير مسجَّل: لا يُعاد كما هو. */
  | 'invalid'
  /** 413 */
  | 'too-large'
  /** 415 */
  | 'unsupported'
  /** 429 — ومعه متى. */
  | 'rate-limited'
  /** 5xx — من جهة الدعم لا من الجهاز: يُعاد. */
  | 'server'
  /** ردٌّ لا يطابق العقد. */
  | 'unexpected'

export interface SendError {
  readonly failure: SendFailure
  readonly retryAfterSeconds?: number
  /** للسجلّ وحده — رمز الحالة أو اسم الخطأ، لا جسم الطلب. */
  readonly detail?: string | undefined
}

export type SendOutcome =
  | { readonly ok: true; readonly id: number; readonly replayed: boolean }
  | { readonly ok: false; readonly error: SendError }

/** هل تنفع إعادة المحاولة بالبلاغ نفسه؟ (جدول الردود في العقد.) */
export function retryable(failure: SendFailure): boolean {
  return (
    failure === 'network' ||
    failure === 'server' ||
    failure === 'rate-limited' ||
    failure === 'cancelled' ||
    failure === 'host-permission' ||
    failure === 'settings-unreadable' ||
    failure === 'unexpected'
  )
}

/** `Retry-After` بالثواني أو بتاريخ HTTP — وما لا يُفهم يُهمَل. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined
}

/** يفسّر الردّ بجدول العقد. */
export async function classify(response: Response): Promise<SendOutcome> {
  const { status } = response
  if (status === 201 || status === 200) {
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null
    const id = body?.id
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
      return { ok: true, id, replayed: status === 200 }
    }
    return { ok: false, error: { failure: 'unexpected', detail: `${status} بلا رقم` } }
  }
  const fail = (failure: SendFailure, extra: Partial<SendError> = {}): SendOutcome => ({
    ok: false,
    error: { failure, detail: String(status), ...extra },
  })
  if (status === 400) return fail('invalid')
  if (status === 413) return fail('too-large')
  if (status === 415) return fail('unsupported')
  if (status === 429) {
    const after = parseRetryAfter(response.headers.get('Retry-After'))
    return fail('rate-limited', after === undefined ? {} : { retryAfterSeconds: after })
  }
  if (status >= 500) return fail('server')
  return fail('unexpected')
}

export interface SendOptions {
  /** معرّف المسودة — `Idempotency-Key`. */
  readonly key: string
  /** إلغاء المستخدم. */
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** للاختبار: بديل `fetch` يمرّ من المخرج نفسه. */
  readonly fetcher?: (input: string, init: RequestInit) => Promise<Response>
}

export async function sendReport(
  payload: ReportPayload,
  options: SendOptions,
): Promise<SendOutcome> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? SEND_TIMEOUT_MS)
  const onCancel = () => controller.abort()
  options.signal?.addEventListener('abort', onCancel, { once: true })
  if (options.signal?.aborted) controller.abort()

  try {
    const sent = await egressFetch(
      REPORTS_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': options.key },
        body: serialise(payload),
        signal: controller.signal,
      },
      ...(options.fetcher ? [options.fetcher] : []),
    )
    if (!sent.ok) {
      const { refusal, detail } = sent.error
      if (refusal === 'network') {
        const cancelled = options.signal?.aborted === true && !timedOut
        return {
          ok: false,
          error: {
            failure: cancelled ? 'cancelled' : 'network',
            detail: timedOut ? 'timeout' : detail,
          },
        }
      }
      return { ok: false, error: { failure: refusal, ...(detail ? { detail } : {}) } }
    }
    return await classify(sent.value)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onCancel)
  }
}
