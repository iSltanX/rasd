/**
 * حذف نهائي دفعةً — للأنواع الأربعة غير اللقطات (المرحلة 18، سدّ فجوة
 * التسليم لِـ§4/§8 في ملفّ المرحلة 18 السابق (تاريخ Git)).
 *
 * **لا دورة مهملات هنا خلافًا للقطات**: لا حقل `trashedAt` على أيٍّ من
 * `ColorRecord`/`PaletteRecord`/`ReferenceRecord`/`GuideRecord` (انظر
 * `schema.ts`) — الحذف فوريّ لا ناعم، لأن التصميم البنيوي نفسه لا يملك
 * حالة «مهملة» وسيطة لهذه الأنواع. التأكيد (حوار `DeleteConfirm`) طبقة فوق
 * هذا الملفّ في `SimpleSelectionBar.tsx` — لا يسأل هذا الملفّ عن شيء.
 *
 * كل دالّة **تقرأ قبل أن تحذف**، فتُرجع عدد ما وُجد وحُذف فعلًا لا عدد ما
 * طُلب — نفس نمط `moveCapturesToProject` في `projects.ts` المجاور: سجلٌّ
 * اختفى بين التحديد والتنفيذ (تبويب آخر أزاله، أو تعارض) يُتجاوَز بصمت، لا
 * يُفشل الدفعة كلّها.
 */

import { ok, type Result } from '@/shared/result'
import {
  colors,
  deleteReferenceWithBlob,
  guides,
  palettes,
  references,
} from '@/shared/storage/repository'

export async function deleteColors(ids: readonly string[]): Promise<Result<number>> {
  let deleted = 0
  for (const id of ids) {
    const found = await colors.get(id)
    if (!found.ok) continue
    const removed = await colors.remove(id)
    if (removed.ok) deleted += 1
  }
  return ok(deleted)
}

export async function deletePalettes(ids: readonly string[]): Promise<Result<number>> {
  let deleted = 0
  for (const id of ids) {
    const found = await palettes.get(id)
    if (!found.ok) continue
    const removed = await palettes.remove(id)
    if (removed.ok) deleted += 1
  }
  return ok(deleted)
}

/** يجلب المرجع أوّلًا ليعرف `blobId` — لا سبيل لحذف بايتاته بلا قراءته أوّلًا. */
export async function deleteReferences(ids: readonly string[]): Promise<Result<number>> {
  let deleted = 0
  for (const id of ids) {
    const found = await references.get(id)
    if (!found.ok) continue
    const removed = await deleteReferenceWithBlob(id, found.value.blobId)
    if (removed.ok) deleted += 1
  }
  return ok(deleted)
}

export async function deleteGuides(ids: readonly string[]): Promise<Result<number>> {
  let deleted = 0
  for (const id of ids) {
    const found = await guides.get(id)
    if (!found.ok) continue
    const removed = await guides.remove(id)
    if (removed.ok) deleted += 1
  }
  return ok(deleted)
}
