/**
 * مسودة البلاغ — تُحفظ حين لا يصل (فشلٌ أو إلغاء)، وتُقرأ حين يعود المستخدم، وتُحذف بعد نجاح الإرسال.
 *
 * في مخزن `reportDrafts` (النسخة 6، [ADR 0050](../../../Docs/ADR/0050-problem-reports.md)) خلف حارسَي القاعدة
 * نفسيهما: قفل المكتبة (`withDb`) والتصفّح الخاص والحصّة (`guardWrite`). فمكتبةٌ مقفلة لا تُقرأ مسوداتها كما لا
 * تُقرأ لقطاتها — صورة البلاغ من بيانات المستخدم.
 *
 * **مسودةٌ واحدة في كل مرّة:** الحفظ يستبدل ما قبله في معاملةٍ واحدة، ونجاح الإرسال يمسح المخزن. فبلاغٌ فُتح من
 * رسالة خطأ ثمّ وصل لا يترك خلفه مسودةً أقدم بصورتها على القرص بلا سقف (المراجعة المستقلّة).
 */

import { type Result } from '@/shared/result'
import { guardWrite, withDb } from '@/shared/storage/db'

import type { ReportDraftRecord } from '@/shared/storage/schema'

export async function saveDraft(draft: ReportDraftRecord): Promise<Result<null>> {
  const allowed = await guardWrite(draft.image?.blob.size ?? 0)
  if (!allowed.ok) return allowed
  return withDb(async (db) => {
    const tx = db.transaction('reportDrafts', 'readwrite')
    await Promise.all([tx.store.clear(), tx.store.put(draft), tx.done])
    return null
  })
}

/** بعد نجاح الإرسال: لا يبقى في المخزن شيء. */
export async function clearDrafts(): Promise<Result<null>> {
  return withDb(async (db) => {
    await db.clear('reportDrafts')
    return null
  })
}

/** أحدث مسودة — النموذج يعرض واحدةً في كل مرّة. */
export async function latestDraft(): Promise<Result<ReportDraftRecord | null>> {
  return withDb(async (db) => {
    const tx = db.transaction('reportDrafts', 'readonly')
    const cursor = await tx.store.index('updatedAt').openCursor(null, 'prev')
    const value = cursor?.value ?? null
    await tx.done
    return value
  })
}

export async function deleteDraft(id: string): Promise<Result<null>> {
  return withDb(async (db) => {
    await db.delete('reportDrafts', id)
    return null
  })
}
