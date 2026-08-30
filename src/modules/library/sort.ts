/**
 * ترتيب المكتبة (§10.5).
 *
 * **بُعدان من الأربعة المذكورة نصًّا لا يقابلهما حقل في `CaptureRecord` بعد:
 * «اللون» و«حالة المراجعة»** — الأول ينتمي لتبويب الألوان لا للّقطات (لا
 * `color` على السجلّ)، والثاني يحتاج مرجعًا يُقارَن به وهو من عمل المرحلتين
 * 16 و17 اللتين تُنفَّذان بعد 18 في هذا الترتيب التنفيذي (ADR 0013) — فلا
 * بيانات مرجعية توجد بعد ليُرتَّب عليها شيء. البُعدان مؤجَّلان صراحةً لا
 * مُسقَطان صمتًا: يُضافان حين يوجد الحقل الذي يرتّبان عليه.
 *
 * `modules/` منطق خالص: لا DOM ولا مؤقّتات.
 */

import type { CaptureRecord } from '@/shared/storage/schema'

export type LibrarySortKey = 'date' | 'project' | 'origin' | 'kind'
export type SortDirection = 'asc' | 'desc'

/** يحلّ اسم مشروع بمعرِّفه. */
export type ProjectNameLookup = (projectId: string) => string

/**
 * **الاتجاه يُمرَّر إلى المقارنة نفسها لا يُطبَّق بـ`.reverse()` بعدها.**
 *
 * محاولة أولى استُبدلت: ترتيب تصاعديًا ثم عكس المصفوفة بالكامل يبدو
 * مكافئًا، لكنه يكسر مرساة «لا مشروع أخيرًا دومًا» — العكس الكامل يقلب هذه
 * المرساة أيضًا فيضع «لا مشروع» أوّلًا عند `desc`، رغم أن القرار المصمَّم أن
 * تبقى أخيرًا في الاتجاهين. فالإشارة (`sign`) تُضرَب في المقارنة **الحقيقية**
 * فقط (التاريخ، الاسم)، ومرساة `null` تبقى ثابتة الاتجاه بصرف النظر عنها —
 * كشفه اختبار `sort.test.ts` قبل أن يصل لمستخدم.
 */
function compareRecords(
  a: CaptureRecord,
  b: CaptureRecord,
  key: LibrarySortKey,
  direction: SortDirection,
  lookup: ProjectNameLookup,
): number {
  const sign = direction === 'asc' ? 1 : -1
  switch (key) {
    case 'date':
      return sign * (a.createdAt - b.createdAt)
    case 'origin':
      return sign * a.origin.localeCompare(b.origin, 'ar')
    case 'kind':
      return sign * a.kind.localeCompare(b.kind)
    case 'project': {
      if (a.projectId === null && b.projectId === null) return 0
      if (a.projectId === null) return 1
      if (b.projectId === null) return -1
      return sign * lookup(a.projectId).localeCompare(lookup(b.projectId), 'ar')
    }
  }
}

/**
 * يرتِّب نسخةً جديدة من `records` — **لا يُبدِّل المصفوفة المُمرَّرة**، لأنها
 * غالبًا حالة مُدارة (state) يُتوقَّع بقاؤها ثابتة المرجع بين إعادات العرض.
 */
export function sortRecords(
  records: readonly CaptureRecord[],
  key: LibrarySortKey,
  direction: SortDirection,
  lookup: ProjectNameLookup,
): CaptureRecord[] {
  return [...records].sort((a, b) => compareRecords(a, b, key, direction, lookup))
}

/** ترتيب افتراضي: الأحدث أوّلًا. */
export const DEFAULT_SORT_KEY: LibrarySortKey = 'date'
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc'
