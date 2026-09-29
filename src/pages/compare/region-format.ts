/**
 * تنسيق نصوص المناطق ونسبة الفرق، والتنقّل بينها — منطق خالص لا DOM.
 *
 * **الأرقام مفصولة صنفين بدقّة (نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`)، معيار الاكتمال):**
 * ترقيم المناطق **عدٌّ بشري هندي** (`formatHuman`) — رقمٌ يقوله المستخدم
 * لزميله («المنطقة الثالثة»). وكل ما عداه **قياس غربي**: النسبة، وعدّ
 * البكسلات بطرفيه.
 *
 * **وكان عدّ البكسلات هنديًّا بتبريرٍ مقلوب**: «كم بكسلًا ⇒ عدٌّ بشري».
 * والبكسل **وحدة قياس** لا شيءٌ يُعدّ باليد — ولذلك `formatUnit(14)` تُخرج
 * `14px` غربيًّا في هذا المستودع نفسه. ونصّ `§17` يحسمها بلا تأويل: «نسبة
 * الاختلاف وأبعاد المستطيلات **غربية**»، وعدّ البكسلات من صنف الأبعاد لا
 * من صنف الترقيم.
 */

import { isolate } from '@/shared/bidi/isolate'
import { formatHuman, formatMeasure, formatPercent } from '@/shared/bidi/numerals'

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

/** «3412 بكسل مختلف من 1296000» — قياسٌ غربي بطرفيه، لا عدٌّ بشري. */
export function pixelCountSummary(diffPixelCount: number, comparedPixels: number): string {
  return `${formatMeasure(diffPixelCount)} بكسل مختلف من ${formatMeasure(comparedPixels)}`
}

/**
 * إعلان طريقة الحساب — «معلَنة الطريقة» في معيار الاكتمال: عتبة `pixelmatch`
 * الحالية بنسبة مئوية غربية، وتسمية فضاء المقارنة الإدراكي (YIQ) الذي
 * يستعمله `pixelmatch` داخليًّا (`modules/compare/diff.ts`، تعليق الملفّ).
 */
export function diffMethodSummary(thresholdFraction: number): string {
  // `YIQ (pixelmatch)` مقطعٌ لاتيني داخل عربية — يُعزَل وإلّا تسرّب اتّجاهه
  // إلى ما حوله. نفس علّة قلب الأبعاد المقيسة في هذه المرحلة.
  return `فرق إدراكي بفضاء ${isolate('YIQ (pixelmatch)')} — عتبة التجاهل الحالية ${formatPercent(thresholdFraction)}`
}
