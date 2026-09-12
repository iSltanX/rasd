/**
 * الحجم التقديري — قبل الخبز، وبمعاملات مقيسة لا مخترعة.
 *
 * صفّ «الحجم التقديري» في إطار Figma `73:2` يعرض رقمًا **قبل** أن يجري
 * التصدير. والرقم الذي لا مصدر له أسوأ من غيابه، فمعاملات هذا الملفّ قِيست
 * على **لقطات الواجهة الحقيقية** في `artifacts/` — ستّ لقطات في مقياسَين،
 * ستّ عشرة حالة، في Chrome 152.0.7977.83.
 *
 * | الصيغة | بايت/بكسل (وسيط) | النسبة إلى PNG |
 * | --- | --- | --- |
 * | PNG | 0.0789 | 1.00 |
 * | WebP بلا فقد | 0.1564 | **1.98** |
 * | WebP جودة 0.92 | 0.0150 | 0.19 |
 * | WebP جودة 0.82 | 0.0112 | 0.14 |
 * | WebP جودة 0.60 | 0.0090 | 0.11 |
 *
 * **والقياس نقض رقاقة «أصغر» التي يكتبها التصميم تحت WebP**: بلا فقد — وهو
 * ما تعنيه الجودة «الأقصى» المعروضة افتراضًا في الإطار نفسه — خرج WebP
 * **أكبر** من PNG في أربع عشرة حالة من ستّ عشرة. والعلّة بنيوية لا عرَضية:
 * لقطات الواجهة مساحاتٌ مسطّحة وحوافّ حادّة، وهي أفضل ما يعالجه مرشِّح PNG
 * مع DEFLATE، وأسوأ ما يعالجه الترميز الإنتروبي في `VP8L`. فالرقاقة صُحِّحت
 * في `format.ts` ومُسجَّلة في `§6`.
 *
 * **وهذا تقديرٌ يُعلَن تقديرًا.** الانحراف حقيقي (المدى 0.0515 → 0.1078
 * لـPNG وحدها)، فالواجهة تسبقه بعلامة تقريب، والرقم اليقيني هو ما يعرضه
 * `export / done` بعد الخبز من `report.bytes`.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { ExportFormat } from './format'

/**
 * درجات الجودة المعروضة.
 *
 * **`max` ليست رقمًا** — هي غياب وسيط الجودة أصلًا، وعندها يُنتج المتصفّح
 * `VP8L` بلا فقد (مقيس). وتمرير `1` ليس مكافئًا لغيابها في كل المتصفّحات،
 * فالتمييز محفوظ في النوع لا مطويّ في رقم.
 */
export type QualityLevel = 'max' | 'high' | 'balanced' | 'compact'

export const QUALITY_LEVELS: readonly QualityLevel[] = ['max', 'high', 'balanced', 'compact']

export const QUALITY_LABEL: Readonly<Record<QualityLevel, string>> = {
  max: 'الأقصى — بلا فقد',
  high: 'عالية',
  balanced: 'متوازنة',
  compact: 'مضغوطة',
}

/** القيمة المُمرَّرة إلى المُرمِّز، أو `null` لغياب الوسيط (بلا فقد). */
export function qualityValue(level: QualityLevel): number | null {
  switch (level) {
    case 'max':
      return null
    case 'high':
      return 0.92
    case 'balanced':
      return 0.82
    case 'compact':
      return 0.6
  }
}

/** وسيط «بايت لكل بكسل» المقيس — انظر جدول الترويسة. */
const BYTES_PER_PIXEL: Readonly<Record<ExportFormat, Readonly<Record<QualityLevel, number>>>> = {
  png: { max: 0.0789, high: 0.0789, balanced: 0.0789, compact: 0.0789 },
  webp: { max: 0.1564, high: 0.015, balanced: 0.0112, compact: 0.009 },
}

/**
 * **PNG لا تقرأ الجودة.** المُرمِّز يتجاهل الوسيط، فأربع قيم متطابقة في
 * الجدول أعلاه ليست تكرارًا سهوًا — هي التصريح بأن المفتاح بلا أثر هنا،
 * وهو ما تعرضه الواجهة بتعطيل الضابط بدل إخفائه.
 */
export function qualityApplies(format: ExportFormat): boolean {
  return format === 'webp'
}

export interface SizeEstimate {
  /** بايتات — قيمة مقيسة، تُنسَّق بأرقام غربية وفق `§3.5`. */
  readonly bytes: number
  /** هل الناتج بلا فقد؟ يحكم ما إذا كان «أصغر» صادقًا. */
  readonly lossless: boolean
}

/**
 * يقدّر حجم الملفّ الناتج من أبعاد **سطح التصدير** (بعد ضرب المقياس).
 *
 * يُمرَّر الناتج من `planExport` لا أبعاد الصورة الخام: تصدير `2×` يضاعف
 * الضلعين فيربّع المساحة، وتقديرٌ على الأبعاد قبل الضرب يخطئ بمعامل أربعة.
 */
export function estimateSize(
  width: number,
  height: number,
  format: ExportFormat,
  quality: QualityLevel,
): SizeEstimate {
  const effective = qualityApplies(format) ? quality : 'max'
  const bytes = Math.round(width * height * BYTES_PER_PIXEL[format][effective])
  return {
    bytes,
    lossless: format === 'png' || effective === 'max',
  }
}
