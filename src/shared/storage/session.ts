/**
 * حالة الجلسة — `chrome.storage.session`.
 *
 * لا تُكتب على القرص وتُمحى بإغلاق المتصفح. هنا تعيش الحالة التي لا يجوز أن
 * تنجو من الجلسة: الوضع النشط، ومهمة الالتقاط الجارية. حفظها في `local`
 * يعني أن انهيارًا يترك رصد في وضع فحص عالق بعد إعادة التشغيل.
 */

import { attempt, ok, type Result } from '../result'

const KEY = 'rasd:session'

export type ActiveMode =
  'idle' | 'area' | 'element' | 'inspect' | 'measure' | 'colour' | 'compare' | 'issues'

export interface SessionState {
  /** الوضع النشط في كل تبويب على حدة. */
  modes: Record<number, ActiveMode>
  /** مهمة طويلة جارية، إن وُجدت. */
  job: {
    id: string
    kind: string
    tabId: number
    startedAt: number
    /**
     * آخر تقدّم كُتب — منه يقيس الحارس الركود لا من `startedAt` (`sweepStalledJobs`). وغيابه في مهمّةٍ
     * كُتبت قبل وجوده يُقرأ «لا تقدّم منذ البدء».
     */
    updatedAt?: number
    /**
     * كتبها عاملُ التصفّح الخاص. الجلسة **مشتركةٌ بين عاملَي الوضع المنفصل** (قِيس في Chrome 155)، فلا يحكم
     * عاملٌ على مهمّة السياق الآخر بأنها يتيمة (`recoverOrphanedJob`). وغيابه يُقرأ «السياق العادي».
     */
    incognito?: boolean
    done: number
    total: number
  } | null
}

export function defaultSession(): SessionState {
  return { modes: {}, job: null }
}

/** يقرأ الجلسة **ويُبلغ عن تعذّر القراءة** — للكتابة، التي لا تُبنى على افتراضٍ عند الفشل. */
async function readSession(): Promise<Result<SessionState>> {
  const stored = await attempt(async () => (await chrome.storage.session.get(KEY))[KEY])
  if (!stored.ok) return stored
  if (!stored.value || typeof stored.value !== 'object') return ok(defaultSession())
  const value = stored.value as Partial<SessionState>
  return ok({ modes: value.modes ?? {}, job: value.job ?? null })
}

/** القراءة للعرض تتسامح: الجلسة الفارغة افتراضٌ آمن حين تتعذّر. */
export async function getSession(): Promise<SessionState> {
  const read = await readSession()
  return read.ok ? read.value : defaultSession()
}

/**
 * طابور الكتابات — **كاتبٌ واحد في كل لحظة**، في سياق الخلفية الذي يملك الجلسة.
 *
 * كل كتابة قراءةٌ ثمّ تعديلٌ ثمّ كتابة. بلا طابور تقرأ الكتابات المتزامنة الحال نفسه ويمحو آخرها ما
 * كتبه ما قبلها: قِيس في كروم أن `tool/activate` إلى أربعة تبويبات معًا ضيّع وضعًا إلى ثلاثة في كل
 * جولة، فتعرض النافذة «خاملًا» لتبويب فيه أداة نشطة (تدقيق Copilot، D1). والكاتب الساقط لا يوقف من بعده.
 */
let queue: Promise<unknown> = Promise.resolve()

function serial<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op)
  queue = next.catch(() => undefined)
  return next
}

/**
 * قراءةٌ **تنتظر دورها في الطابور** فترى كل كتابةٍ طُلبت قبلها — لمن يقرأ في سياق الخلفية نفسه.
 *
 * الرسالة التي توقظ العامل تُخدَم قبل أن يأتي دور ما طلبه الإقلاع (استعادة مهمّةٍ يتيمة)، فقراءةٌ مباشرة
 * تعيد ما سيُمحى بعد لحظة: قِيس في كروم أن `session/get` بعد إيقاف العامل ردّ باليتيمة والصفحةُ قد استُعيدت.
 */
export function getSessionInOrder(): Promise<SessionState> {
  return serial(getSession)
}

/**
 * يعدّل الجلسة بدالّةٍ من حالها **ساعةَ دورها في الطابور** — لا من حالٍ قُرئ قبله.
 *
 * `mutate` يعيد الحال نفسه (المرجع نفسه) ⇒ لا كتابة: هكذا تُكتب الشروط («امسح المهمّة إن كانت هي
 * نفسها») بلا سباق بين الفحص والكتابة. و**قراءةٌ فاشلة لا تُكتب فوقها الجلسة الافتراضية**: الخطأ يُعاد
 * والمخزَّن لا يُمسّ — وإلا محت كتابةُ وضعٍ واحد أوضاعَ كل التبويبات.
 */
export function updateSession(
  mutate: (current: SessionState) => SessionState,
): Promise<Result<SessionState>> {
  return serial(async () => {
    const current = await readSession()
    if (!current.ok) return current
    const next = mutate(current.value)
    if (next === current.value) return current
    const written = await attempt(() => chrome.storage.session.set({ [KEY]: next }))
    if (!written.ok) return written
    return ok(next)
  })
}

export function patchSession(patch: Partial<SessionState>): Promise<Result<SessionState>> {
  return updateSession((current) => ({ ...current, ...patch }))
}

export function setTabMode(tabId: number, mode: ActiveMode): Promise<Result<SessionState>> {
  return updateSession((current) => {
    const modes = { ...current.modes }
    if (mode === 'idle') delete modes[tabId]
    else modes[tabId] = mode
    return { ...current, modes }
  })
}

export function clearSession(): Promise<Result<null>> {
  return serial(async () => {
    const removed = await attempt(() => chrome.storage.session.remove(KEY))
    return removed.ok ? ok(null) : removed
  })
}
