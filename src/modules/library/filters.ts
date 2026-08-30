/**
 * تصفية المكتبة — تجميع المرشِّحات **تقاطعًا لا اتحادًا** (§10.5).
 *
 * كل مرشِّح مُسنَد إلى بُعد واحد (المشروع، الموقع، النوع، التفضيل، الأرشفة،
 * المهملات، المدى الزمني، الوسم). تفعيل أكثر من مرشِّح معًا **يُضيّق** النتيجة
 * لا يُوسِّعها — فمعنى «تصفية» أن كل شرط إضافي يُبقي على الأقل بقدر ما كان،
 * لا أكثر. لو جُمعت بالاتحاد لأظهر تفعيل مرشِّحين نتائج أكثر من أحدهما وحده،
 * وهو عكس ما يتوقّعه من يضيف شرطًا.
 *
 * الحقول غير المُمرَّرة (`undefined`) لا تُقيِّد شيئًا — فمرشِّحٌ لا يهتمّ به
 * المستخدم لا يُسقط سجلًّات كان سيراها بلا التصفية أصلًا.
 *
 * `modules/` منطق خالص: لا DOM ولا مؤقّتات — لا قراءة تخزين هنا.
 */

import type { CaptureRecord } from '@/shared/storage/schema'

export interface LibraryFilters {
  readonly projectId?: string | null
  readonly origin?: string
  readonly kind?: CaptureRecord['kind']
  readonly favorite?: boolean
  /** الأرشيف يُخفي من الشبكة دون حذف — القيمة الافتراضية للعرض الرئيسي `false`. */
  readonly archived?: boolean
  /** `true` لعرض المهملات، `false` للعرض الحيّ — القيمتان صريحتان دومًا في الاستدعاء. */
  readonly trashed?: boolean
  readonly dateFrom?: number
  readonly dateTo?: number
  readonly tag?: string
}

export function matchesFilters(record: CaptureRecord, filters: LibraryFilters): boolean {
  if (filters.projectId !== undefined && record.projectId !== filters.projectId) return false
  if (filters.origin !== undefined && record.origin !== filters.origin) return false
  if (filters.kind !== undefined && record.kind !== filters.kind) return false
  if (filters.favorite !== undefined && record.favorite !== filters.favorite) return false
  if (filters.archived !== undefined && record.archived !== filters.archived) return false
  if (filters.trashed !== undefined && (record.trashedAt !== null) !== filters.trashed) return false
  if (filters.dateFrom !== undefined && record.createdAt < filters.dateFrom) return false
  if (filters.dateTo !== undefined && record.createdAt > filters.dateTo) return false
  if (filters.tag !== undefined && !record.tags.includes(filters.tag)) return false
  return true
}

export function filterRecords(
  records: readonly CaptureRecord[],
  filters: LibraryFilters,
): CaptureRecord[] {
  return records.filter((record) => matchesFilters(record, filters))
}

/** المرشِّحات الافتراضية للشبكة الرئيسية: لا أرشيف، لا مهملات. */
export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = { archived: false, trashed: false }

/** مرشِّحات عرض الأرشيف. */
export const ARCHIVE_FILTERS: LibraryFilters = { archived: true, trashed: false }

/** مرشِّحات عرض المهملات — تتجاوز الأرشفة عمدًا: عنصر مؤرشَف يُحذَف ويظهر هنا أيضًا. */
export const TRASH_FILTERS: LibraryFilters = { trashed: true }
