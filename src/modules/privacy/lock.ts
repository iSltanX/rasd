/**
 * قفل المكتبة: التفعيل والفكّ والإيقاف و«نسيت الرمز» — [ADR 0043](../../../Docs/ADR/0043-library-lock.md).
 *
 * يجري في صفحات الإضافة (المكتبة والإعدادات) لا في الخلفية: كلّها تملك `chrome.storage`، والحارس في `withDb` يقرأ
 * ما يُكتب هنا من أيّ سياق. فلا رسالة جديدة في العقد.
 *
 * **ترتيب الكتابات مقصود في كل مسار** — فشلٌ في منتصفه يترك الأأمن:
 * - التفعيل يكتب «مفكوك لهذا الملح» **قبل** السجلّ: سجلٌّ بلا فكٍّ كان سيقفل الجلسة التي فعّلته للتوّ.
 * - الإيقاف يُزيل السجلّ **أوّلًا**: هو الإيقاف، وما بعده تنظيف.
 * - النسيان يُفرغ القاعدة **ثمّ** يُزيل السجلّ: إفراغٌ تعثّر يُبقي القفل على ما بقي، لا مكتبةً نصف محذوفة مفتوحة.
 */

import { base64ToBytes, bytesToBase64 } from '@/shared/base64'
import { attempt, err, ok, type Result } from '@/shared/result'
import {
  ATTEMPTS_KEY,
  forgetLockSnapshot,
  LOCK_KEY,
  lockMode,
  parseLockRecord,
  UNLOCK_KEY,
  type LockMode,
  type LockRecord,
} from '@/shared/storage/lock-state'
import { clearAllStores } from '@/shared/storage/repository'

import {
  calibrateIterations,
  codeLength,
  deriveVerifier,
  equalBytes,
  MIN_CODE_LENGTH,
  randomSalt,
} from './kdf'

/** خمس محاولات خاطئة ثمّ مهلة (ADR 0043 §5). */
export const ATTEMPTS_PER_ROUND = 5
export const BASE_COOLDOWN_MS = 60_000
export const MAX_COOLDOWN_MS = 30 * 60_000

export type LockError =
  | { readonly kind: 'too-short' }
  | { readonly kind: 'already-enabled' }
  | { readonly kind: 'not-enabled' }
  /** `remaining` قبل المهلة التالية، و`until` نهاية مهلةٍ بدأت بهذه المحاولة. */
  | { readonly kind: 'wrong-code'; readonly remaining: number; readonly until: number | null }
  | { readonly kind: 'cooling-down'; readonly until: number }
  | { readonly kind: 'storage' }

export interface LockStatus {
  readonly mode: LockMode
  /** نهاية مهلةٍ جارية، أو `null`. */
  readonly cooldownUntil: number | null
  /** المحاولات الباقية قبل المهلة التالية. */
  readonly remaining: number
}

interface Attempts {
  readonly failures: number
  readonly until: number
}

async function readRecord(): Promise<Result<LockRecord | null, LockError>> {
  const read = await attempt(async () => (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY])
  if (!read.ok) return err({ kind: 'storage' })
  if (read.value === undefined) return ok(null)
  const record = parseLockRecord(read.value)
  // سجلٌّ لا يُقرأ لا يُفتح برمز (`lock-state.ts`) — ومخرجه «نسيت الرمز».
  return record ? ok(record) : err({ kind: 'storage' })
}

async function readAttempts(): Promise<Attempts> {
  const read = await attempt(
    async () => (await chrome.storage.local.get(ATTEMPTS_KEY))[ATTEMPTS_KEY],
  )
  const value = (read.ok ? read.value : null) as Partial<Attempts> | null | undefined
  const failures = Number.isSafeInteger(value?.failures) ? Math.max(0, value?.failures ?? 0) : 0
  const until = Number.isFinite(value?.until) ? (value?.until ?? 0) : 0
  return { failures, until }
}

const remainingOf = (failures: number) => ATTEMPTS_PER_ROUND - (failures % ATTEMPTS_PER_ROUND)

/** المهلة بعد الجولة `round` (من 1): دقيقة، ثمّ تتضاعف حتى السقف. */
export function cooldownFor(round: number): number {
  return Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** Math.max(0, round - 1))
}

export async function lockStatus(now = Date.now()): Promise<LockStatus> {
  const mode = await lockMode()
  if (mode !== 'locked') return { mode, cooldownUntil: null, remaining: ATTEMPTS_PER_ROUND }
  const { failures, until } = await readAttempts()
  return { mode, cooldownUntil: until > now ? until : null, remaining: remainingOf(failures) }
}

/**
 * يتحقّق من الرمز ويعدّ الخطأ — للفكّ والإيقاف معًا، فالإيقاف لا يصير بابًا لتخمينٍ بلا مهلة.
 * المهلة تُفحص **قبل** الاشتقاق: لا 300ms تُنفق على محاولةٍ مرفوضة سلفًا.
 */
async function verify(code: string, now: number): Promise<Result<LockRecord, LockError>> {
  const read = await readRecord()
  if (!read.ok) return read
  const record = read.value
  if (!record) return err({ kind: 'not-enabled' })

  const attempts = await readAttempts()
  if (attempts.until > now) return err({ kind: 'cooling-down', until: attempts.until })

  const derived = await attempt(() =>
    deriveVerifier(code, base64ToBytes(record.salt), record.iterations),
  )
  if (!derived.ok) return err({ kind: 'storage' })
  if (equalBytes(derived.value, base64ToBytes(record.verifier))) {
    await attempt(() => chrome.storage.local.remove(ATTEMPTS_KEY))
    return ok(record)
  }

  const failures = attempts.failures + 1
  const cooled = failures % ATTEMPTS_PER_ROUND === 0
  const until = cooled ? now + cooldownFor(failures / ATTEMPTS_PER_ROUND) : 0
  await attempt(() => chrome.storage.local.set({ [ATTEMPTS_KEY]: { failures, until } }))
  return err({
    kind: 'wrong-code',
    remaining: cooled ? 0 : remainingOf(failures),
    until: cooled ? until : null,
  })
}

export interface EnableOptions {
  /** للاختبارات: يتخطّى القياس. الإنتاج يقيس دائمًا. */
  readonly iterations?: number
}

/** يفعّل القفل برمزٍ جديد. الجلسة التي فعّلته تبقى مفكوكة. */
export async function enableLock(
  code: string,
  options: EnableOptions = {},
): Promise<Result<null, LockError>> {
  if (codeLength(code) < MIN_CODE_LENGTH) return err({ kind: 'too-short' })
  const existing = await readRecord()
  if (!existing.ok) return existing
  if (existing.value) return err({ kind: 'already-enabled' })

  const built = await attempt(async () => {
    const iterations = options.iterations ?? (await calibrateIterations())
    const salt = randomSalt()
    const verifier = await deriveVerifier(code, salt, iterations)
    const record: LockRecord = {
      v: 1,
      salt: bytesToBase64(salt),
      iterations,
      verifier: bytesToBase64(verifier),
    }
    return record
  })
  if (!built.ok) return err({ kind: 'storage' })

  const unlocked = await attempt(() =>
    chrome.storage.session.set({ [UNLOCK_KEY]: built.value.salt }),
  )
  if (!unlocked.ok) return err({ kind: 'storage' })
  const written = await attempt(() =>
    chrome.storage.local
      .set({ [LOCK_KEY]: built.value })
      .then(() => chrome.storage.local.remove(ATTEMPTS_KEY)),
  )
  forgetLockSnapshot()
  return written.ok ? ok(null) : err({ kind: 'storage' })
}

/** يفتح المكتبة لهذه الجلسة. */
export async function unlockLibrary(
  code: string,
  now = Date.now(),
): Promise<Result<null, LockError>> {
  const verified = await verify(code, now)
  if (!verified.ok) return verified
  const unlocked = await attempt(() =>
    chrome.storage.session.set({ [UNLOCK_KEY]: verified.value.salt }),
  )
  forgetLockSnapshot()
  return unlocked.ok ? ok(null) : err({ kind: 'storage' })
}

/** «اقفل الآن» — الرمز يُطلب في الفتح التالي. */
export async function lockNow(): Promise<Result<null, LockError>> {
  const removed = await attempt(() => chrome.storage.session.remove(UNLOCK_KEY))
  forgetLockSnapshot()
  return removed.ok ? ok(null) : err({ kind: 'storage' })
}

/** يوقف القفل بالرمز الحاليّ — المكتبة تُفتح بلا رمز بعده. */
export async function disableLock(
  code: string,
  now = Date.now(),
): Promise<Result<null, LockError>> {
  const verified = await verify(code, now)
  if (!verified.ok) return verified
  const removed = await attempt(() => chrome.storage.local.remove([LOCK_KEY, ATTEMPTS_KEY]))
  if (!removed.ok) {
    forgetLockSnapshot()
    return err({ kind: 'storage' })
  }
  await attempt(() => chrome.storage.session.remove(UNLOCK_KEY))
  forgetLockSnapshot()
  return ok(null)
}

/**
 * «نسيت الرمز»: يحذف المكتبة كلّها ثمّ يُزيل القفل — **لا يفتحها**؛ نسيانٌ يفتح المكتبة بابٌ يتجاوز القفل لكل من
 * يضغطه. والإعدادات تبقى. ويمرّ والمكتبة مقفلة، فـ`clearAllStores` وحدها بلا حارس (ADR 0043 §4).
 */
export async function forgetCodeAndErase(): Promise<Result<null, LockError>> {
  const cleared = await clearAllStores()
  if (!cleared.ok) return err({ kind: 'storage' })
  const removed = await attempt(() => chrome.storage.local.remove([LOCK_KEY, ATTEMPTS_KEY]))
  await attempt(() => chrome.storage.session.remove(UNLOCK_KEY))
  forgetLockSnapshot()
  return removed.ok ? ok(null) : err({ kind: 'storage' })
}
