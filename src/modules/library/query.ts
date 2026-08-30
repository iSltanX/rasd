/**
 * تجميع التصفية والترتيب في خط أنابيب واحد — تبويب اللقطات وحده (§10.5).
 *
 * **البحث ليس هنا عمدًا**: `search.ts` يُطبَّق أوّلًا على كل التبويبات
 * الخمسة (طبقة `pages/library/context.ts` تستدعيه بذاته)، وهذا الملفّ
 * يستقبل نتيجته فيُضيّقه بالتصفية ثم يرتِّبه — لا يُعيد البحث مرّتين.
 *
 * **التصفية والترتيب مقصوران على تبويب اللقطات عمدًا لا سهوًا**: أبعادهما
 * الستّة في §10.5 (التاريخ، المشروع، الموقع، النوع، اللون، حالة المراجعة)
 * كلّها حقول `CaptureRecord` — لا نظير لها في `ColorRecord` أو
 * `PaletteRecord` أو `ReferenceRecord` أو `GuideRecord`. التبويبات الأربعة
 * الأخرى تُبحَث فقط وتُرتَّب بالأحدث أوّلًا افتراضيًا، بلا شريط تصفية —
 * اختراع حقول تصفية لها غير موصوفة في الخطة يُخمِّن مواصفة لا يقرأها.
 *
 * **الترتيب يقع بعد التصفية دومًا** — تبديلهما لا يغيِّر أعضاء النتيجة
 * (التصفية تقاطعٌ لا يهتمّ بترتيب سابقيه)، لكنه يهدر عملًا لو رُتِّب قبل أن
 * يُستبعَد ما لن يُعرض أصلًا.
 */

import { filterRecords, type LibraryFilters } from './filters'
import {
  sortRecords,
  type LibrarySortKey,
  type ProjectNameLookup,
  type SortDirection,
} from './sort'

import type { CaptureRecord } from '@/shared/storage/schema'

export interface CaptureQuery {
  readonly filters: LibraryFilters
  readonly sortKey: LibrarySortKey
  readonly sortDirection: SortDirection
}

/** يستقبل لقطات **مبحوثة سلفًا** (أو كل اللقطات إن كان الاستعلام فارغًا)، يصفّي ثم يرتِّب. */
export function queryCaptures(
  searched: readonly CaptureRecord[],
  query: CaptureQuery,
  projectNameLookup: ProjectNameLookup,
): CaptureRecord[] {
  const filtered = filterRecords(searched, query.filters)
  return sortRecords(filtered, query.sortKey, query.sortDirection, projectNameLookup)
}
