/**
 * اشتقاق مُتحقِّق الرمز — PBKDF2-SHA256 بـ`crypto.subtle`، بملحٍ عشوائي ودوراتٍ مقيسة على الجهاز
 * ([ADR 0043](../../../Docs/ADR/0043-library-lock.md) §2).
 *
 * المُتحقِّق لا يحمي المكتبة — الحارس في `withDb` يفعل، وحدوده في الـADR. يحمي **الرمز نفسه**: من يقرأ التخزين لا
 * يستعيد رمزًا قد يستعمله المستخدم في مكانٍ آخر إلا بتخمينٍ كلّفته كل محاولة منه نحو 300ms.
 */

/** أقلّ طول للرمز بالمحارف — «ثمانية أحرف على الأقل» في `lock / setup`. */
export const MIN_CODE_LENGTH = 8

/** توصية OWASP لـPBKDF2-SHA256 — لا يُنزَل عنها ولو كان الجهاز بطيئًا. */
export const ITERATIONS_FLOOR = 600_000
/** سقفٌ يحمي جهازًا سريعًا اليوم من فكٍّ يستغرق ثواني على جهازٍ أبطأ غدًا بالسجلّ نفسه. */
export const ITERATIONS_CEILING = 5_000_000
/** ما يُستهدف لاشتقاقٍ واحد على الجهاز الذي فُعّل عليه القفل. */
export const TARGET_MS = 300

const SALT_BYTES = 16
const VERIFIER_BITS = 256
const PROBE_ITERATIONS = 100_000

/**
 * لوحاتٌ عربية تكتب الحرف المهموز حرفًا واحدًا أو حرفًا وعلامة — والتطبيع يجعل الرمز المكتوب على لوحتين رمزًا
 * واحدًا. لا تطبيع أوسع: «احذف» في تأكيد الحذف تُطابَق بتسامح، أمّا الرمز فدقيق.
 */
export function normalizeCode(code: string): string {
  return code.normalize('NFC')
}

/** الطول بالمحارف لا بوحدات UTF-16 — رمزٌ من رموز تعبيرية لا يُعدّ ضعف طوله. */
export function codeLength(code: string): number {
  return [...normalizeCode(code)].length
}

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

export async function deriveVerifier(
  code: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizeCode(code)),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    VERIFIER_BITS,
  )
  return new Uint8Array(bits)
}

/**
 * عدد الدورات الذي يستغرق نحو `TARGET_MS` هنا: اشتقاقٌ تجريبي يُقاس ويُمدّ خطّيًّا، مقرَّبًا إلى عشرة آلاف، بين
 * الأرضية والسقف. ويُحفظ العدد مع السجلّ، فلا يُعاد القياس عند الفكّ.
 */
export async function calibrateIterations(
  now: () => number = () => performance.now(),
): Promise<number> {
  const started = now()
  await deriveVerifier('rasd-calibration', randomSalt(), PROBE_ITERATIONS)
  const elapsed = Math.max(now() - started, 1)
  const scaled = Math.round((PROBE_ITERATIONS * TARGET_MS) / elapsed / 10_000) * 10_000
  return Math.min(ITERATIONS_CEILING, Math.max(ITERATIONS_FLOOR, scaled))
}

/** مقارنةٌ بزمنٍ ثابت على البايتات كلّها — لا خروج عند أوّل اختلاف. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
