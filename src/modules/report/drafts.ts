/**
 * مسودة البلاغ — تُحفظ حين لا يصل (فشلٌ أو إلغاء)، وتُقرأ حين يعود المستخدم، وتُحذف بعد نجاح الإرسال.
 *
 * في مخزن `reportDrafts` (النسخة 6، [ADR 0050](../../../Docs/ADR/0050-problem-reports.md)) خلف حارسَي القاعدة
 * نفسيهما: قفل المكتبة (`withDb`) والتصفّح الخاص والحصّة (`guardWrite`). فمكتبةٌ مقفلة لا تُقرأ مسوداتها كما لا
 * تُقرأ لقطاتها — صورة البلاغ من بيانات المستخدم.
 */

import { ok, type Result } from '@/shared/result'
import { guardWrite, withDb } from '@/shared/storage/db'

import type { ReportDraftRecord } from '@/shared/storage/schema'

export async function saveDraft(draft: ReportDraftRecord): Promise<Result<null>> {
  const allowed = await guardWrite(draft.image?.blob.size ?? 0)
  if (!allowed.ok) return allowed
  return withDb(async (db) => {
    await db.put('reportDrafts', draft)
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

/** بعد نجاح الإرسال: لا تبقى مسودةٌ لبلاغٍ وصل. وإن تعذّر الحذف فالبلاغ وصل، والمسودة تُحذف يدويًّا. */
export async function clearSentDraft(id: string): Promise<Result<null>> {
  const removed = await deleteDraft(id)
  return removed.ok ? ok(null) : removed
}
