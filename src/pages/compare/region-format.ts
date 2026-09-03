/**
 * تنسيق نصوص المناطق ونسبة الفرق، والتنقّل بينها — منطق خالص لا DOM.
 *
 * **الأرقام مفصولة صنفين بدقّة (`Rasd_Plan.md §17`، معيار الاكتمال):**
 * ترقيم المناطق **عدٌّ بشري هندي** (`formatHuman`)، ونسبة الاختلاف وعدّ
 * البكسلات المقارَنة **قياس غربي** إلا عدّ البكسلات المختلفة نفسها فهو عدٌّ
 * بشري أيضًا («٣٬٤١٢ بكسل مختلف») — القسمة هنا بين «كم عنصرًا/بكسلًا» (هندي)
 * و«أيّ نسبة/كسر» (غربي)، لا بين الحقلين حرفيًّا.
 */

import { formatHuman, formatPercent } from '@/shared/bidi/numerals'

import type { DiffRegion } from '@/modules/compare/regions'

export interface RegionItem {
  readonly region: DiffRegion
  /** ترقيم بشري هندي — `region.id` نفسه، منسَّقًا للعرض. */
  readonly label: string
}

/** يبني قائمة عرض من مناطق `groupDiffRegions` — ترتيبها كما وصلت (راستر، تصاعدي). */
export function buildRegionItems(regions: readonly DiffRegion[]): RegionItem[] {
  return regions.map((region) => ({ region, label: formatHuman(region.id) }))
}

/** الفهرس التالي، بتدوير — `-1` حين لا مناطق أصلًا. */
export function nextRegionIndex(current: number, count: number): number {
  if (count <= 0) return -1
  return (current + 1 + count) % count
}

/** الفهرس السابق، بتدوير — `-1` حين لا مناطق أصلًا. */
export function prevRegionIndex(current: number, count: number): number {
  if (count <= 0) return -1
  return (current - 1 + count) % count
}

/** «٣٤١٢ بكسل مختلف من ١٢٩٦٠٠٠» — عدّ بشري هنديّ للحقلين معًا، لا نسبة (`formatHuman` بلا تجميع أرقام). */
export function pixelCountSummary(diffPixelCount: number, comparedPixels: number): string {
  return `${formatHuman(diffPixelCount)} بكسل مختلف من ${formatHuman(comparedPixels)}`
}

/**
 * إعلان طريقة الحساب — «معلَنة الطريقة» في معيار الاكتمال: عتبة `pixelmatch`
 * الحالية بنسبة مئوية غربية، وتسمية فضاء المقارنة الإدراكي (YIQ) الذي
 * يستعمله `pixelmatch` داخليًّا (`modules/compare/diff.ts`، تعليق الملفّ).
 */
export function diffMethodSummary(thresholdFraction: number): string {
  return `فرق إدراكي بفضاء YIQ (pixelmatch) — عتبة الحساسية الحالية ${formatPercent(thresholdFraction)}`
}
