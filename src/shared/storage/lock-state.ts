/**
 * حالة قفل المكتبة كما يقرؤها حارس `withDb` — [ADR 0043](../../../Docs/ADR/0043-library-lock.md).
 *
 * **مفعَّل؟** سجلّ `rasd:lock` في `chrome.storage.local`. **مفكوك؟** `rasd:unlocked` في `chrome.storage.session` يحمل
 * ملح السجلّ الحاليّ: الجلسة في الذاكرة وتُمحى بإغلاق المتصفّح، ولا يقرؤها سكربت المحتوى، والربط بالملح يجعل فكًّا
 * قديمًا لا يفتح قفلًا أُعيد تفعيله برمزٍ جديد.
 *
 * كل سياقٍ (صفحة أو عامل) يحفظ الحالة في ذاكرته ويُبطلها من `onChanged`، فالحارس لا يقرأ التخزين في كل نداء.
 * **وتعذُّر القراءة يُغلق ولا يفتح**، ولا يُحفظ — النداء التالي يحاول ثانيةً.
 *
 * الاشتقاق والفكّ والإيقاف في `modules/privacy/` — هنا ما يحتاجه الحارس وحده، فـ`shared/` لا يستورد ممّا فوقه.
 */

import { attempt } from '../result'

export const LOCK_KEY = 'rasd:lock'
export const UNLOCK_KEY = 'rasd:unlocked'
export const ATTEMPTS_KEY = 'rasd:lock-attempts'

/** مُتحقِّق الرمز — لا الرمز ولا مفتاحٌ قابل للاستعمال (ADR 0043 §2). القيم الثنائية base64. */
export interface LockRecord {
  readonly v: 1
  readonly salt: string
  readonly iterations: number
  readonly verifier: string
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function parseLockRecord(value: unknown): LockRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Partial<Record<keyof LockRecord, unknown>>
  if (r.v !== 1) return null
  if (typeof r.salt !== 'string' || !BASE64.test(r.salt)) return null
  if (typeof r.verifier !== 'string' || !BASE64.test(r.verifier)) return null
  if (typeof r.iterations !== 'number' || !Number.isSafeInteger(r.iterations) || r.iterations < 1) {
    return null
  }
  return { v: 1, salt: r.salt, iterations: r.iterations, verifier: r.verifier }
}

/**
 * سجلٌّ موجود لا يُقرأ يُعدّ قفلًا لا يفتحه رمز — لا «بلا قفل»: المفتاح لا يكتبه غير رصد، ووجوده يقول إن المستخدم
 * أراد القفل. ومخرجه «نسيت الرمز».
 */
const UNREADABLE = '\u0000unreadable'

interface Snapshot {
  readonly lockId: string | null
  readonly unlockedFor: string | null
}

let snapshot: Snapshot | null = null
/** يتقدّم مع كل تغيير — قراءةٌ بدأت قبله لا تُحفظ نتيجتها فوقه. */
let generation = 0

function onChanged(changes: Record<string, unknown>, area: string): void {
  if ((area === 'local' && LOCK_KEY in changes) || (area === 'session' && UNLOCK_KEY in changes)) {
    forgetLockSnapshot()
  }
}

/** المستمع يُعاد تركيبه إن زال، والحالة المحفوظة قبله لا يُوثق بها. */
function listen(): void {
  const event = chrome.storage?.onChanged
  if (!event || event.hasListener(onChanged)) return
  event.addListener(onChanged)
  forgetLockSnapshot()
}

/** يُبطل ما في الذاكرة — بعد كتابةٍ من هذا السياق نفسه، فلا ينتظر `onChanged`. */
export function forgetLockSnapshot(): void {
  generation += 1
  snapshot = null
}

const isLocked = (s: Snapshot) => s.lockId !== null && s.unlockedFor !== s.lockId

export type LockMode = 'off' | 'locked' | 'unlocked'

/** حالة القفل الآن — `locked` حين تتعذّر القراءة. */
export async function lockMode(): Promise<LockMode> {
  listen()
  if (snapshot) return snapshot.lockId === null ? 'off' : isLocked(snapshot) ? 'locked' : 'unlocked'

  const started = generation
  const read = await attempt(async () => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(LOCK_KEY),
      chrome.storage.session.get(UNLOCK_KEY),
    ])
    return { record: local[LOCK_KEY], unlocked: session[UNLOCK_KEY] }
  })
  if (!read.ok) return 'locked'

  const { record, unlocked } = read.value
  const next: Snapshot = {
    lockId: record === undefined ? null : (parseLockRecord(record)?.salt ?? UNREADABLE),
    unlockedFor: typeof unlocked === 'string' ? unlocked : null,
  }
  if (started === generation) snapshot = next
  return next.lockId === null ? 'off' : isLocked(next) ? 'locked' : 'unlocked'
}

/** ما يسأله الحارس: هل تُمنع القراءة والكتابة الآن؟ */
export async function libraryLocked(): Promise<boolean> {
  return (await lockMode()) === 'locked'
}
