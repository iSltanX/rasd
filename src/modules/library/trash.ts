/**
 * دورة حياة المهملات — حذف ناعم باحتفاظ 30 يومًا، ثم حذف نهائي صريح (§10).
 *
 * ثلاث حالات لا حالتان: **حيّة** (`trashedAt: null`)، **في المهملات** (منذ
 * وقتٍ معلوم، قابلة للاستعادة)، **محذوفة نهائيًا** (لا سجلّ). والانتقال من
 * الثانية إلى الثالثة يقع بفعلين لا فعل واحد: انقضاء 30 يومًا يجعل السجلّ
 * *مؤهَّلًا* للحذف النهائي، لا محذوفًا تلقائيًا — التطهير فعلٌ صريح
 * (`purgeExpired`) يُشغَّل عند فتح المكتبة، لا مؤقّت خلفي صامت يمحو بيانات
 * المستخدم بلا أن يراقبه أحد.
 *
 * **وحدُّ هذه القاعدة، مكتوبًا لا مضمَرًا (الوحدة 20.3):** هي عن **سياسة
 * النظام** — مهلة الثلاثين يومًا التي لم يطلبها أحد. وهي لا تحكم مدّةً
 * **اختارها المستخدم بنفسه** في شاشة الخصوصية: تلك وعدٌ نصُّه «احذف تلقائيًا»،
 * وتنفيذه عند فتح المكتبة وحدها يعني ألّا يُحذف شيء أبدًا عمّن لا يفتحها —
 * أي وعدٌ معروض لا يُنفَّذ. فلذلك يملك `retention.ts` منبّهًا خلفيًّا، وهذا
 * الملفّ لا يملكه؛ والفارق هو مصدر القرار لا موضع الكود.
 *
 * `now` مُمرَّر لا مُشتقّ من `Date.now()` داخل الدوال — نفس نمط `autosave.ts`
 * بالمرحلة 15 — لتبقى كل دالة هنا قابلة للاختبار بلا مؤقّتات مزيَّفة.
 */

import { ok, type Result } from '@/shared/result'
import { captures, deleteCaptureWithBlob } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

export const TRASH_RETENTION_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * MS_PER_DAY

/** هل تجاوز عنصرٌ حُذف عند `trashedAt` مدّة الاحتفاظ عند اللحظة `now`؟ */
export function isExpired(trashedAt: number, now: number): boolean {
  return now - trashedAt >= TRASH_RETENTION_MS
}

/** أيام متبقّية قبل التأهّل للحذف النهائي — لا تنزل عن صفر، ولا تُقرَّب لأعلى زائفًا. */
export function daysRemaining(trashedAt: number, now: number): number {
  const remainingMs = TRASH_RETENTION_MS - (now - trashedAt)
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / MS_PER_DAY)
}

/** ينقل لقطة إلى المهملات — لا يحذف شيئًا، يعلِّم فقط. */
export async function moveToTrash(id: string, now: number): Promise<Result<null>> {
  const found = await captures.get(id)
  if (!found.ok) return found
  const written = await captures.put({ ...found.value, trashedAt: now })
  if (!written.ok) return written
  return ok(null)
}

/** يستعيد لقطة من المهملات. */
export async function restoreFromTrash(id: string): Promise<Result<null>> {
  const found = await captures.get(id)
  if (!found.ok) return found
  const written = await captures.put({ ...found.value, trashedAt: null })
  if (!written.ok) return written
  return ok(null)
}

/**
 * حذف نهائي صريح — لقطة واحدة، بطلب مستخدم مباشر (زرّ «حذف نهائيًا»).
 *
 * يعيد استعمال `deleteCaptureWithBlob` من المرحلة 15 نفسه: يحذف الوصف
 * والبايتات ومشهد التعليق معًا في معاملة واحدة — لا مسار حذف ثانٍ يُعاد فيه
 * ابتكار نفس الذرّية بأخطاء جديدة محتملة.
 */
export async function purgeCapture(id: string): Promise<Result<null>> {
  return deleteCaptureWithBlob(id)
}

/**
 * يطهِّر كل ما تجاوز مدّة الاحتفاظ — يُستدعى عند فتح المكتبة لا بمؤقّت خلفي.
 *
 * التسلسل لا يتوازى: `Promise.all` على حذوفات متعدّدة يعني أن فشل واحدة
 * وسط الطريق يترك حالة الحذف غامضة (أيّها نجح؟). هنا كل حذف يُنتظَر قبل
 * التالي، ويتوقّف التطهير عند أول فشل ويُرجعه — العدد المُرجَع في النجاح هو
 * ما طُهِّر فعلًا لا ما كان مؤهَّلًا.
 */
export async function purgeExpired(now: number): Promise<Result<number>> {
  const all = await captures.getAll()
  if (!all.ok) return all

  const expired = all.value.filter(
    (record): record is CaptureRecord & { trashedAt: number } =>
      record.trashedAt !== null && isExpired(record.trashedAt, now),
  )

  let purged = 0
  for (const record of expired) {
    const removed = await purgeCapture(record.id)
    if (!removed.ok) return removed
    purged += 1
  }
  return ok(purged)
}
