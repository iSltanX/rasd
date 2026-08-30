/**
 * قياس النصّ — الجسر بين تخطيط `modules/` الخالص وقماش المتصفّح.
 *
 * `text-layout.ts` تحقن القياس ولا تملكه، لأن happy-dom **لا تملك سياق
 * ثنائي الأبعاد أصلًا** — لا `measureText` ناقصة، بل لا سياق. فالوحدة الخالصة
 * تُختبَر بقياس صناعي، والقماش يعيش هنا.
 *
 * وثلاثة قرارات تجعل القياس يطابق الرسم:
 *
 * **١. قماش قياس واحد مشترك.** إنشاء قماش لكل قياس يخصّص سطحًا ويهدمه آلاف
 * المرّات أثناء الكتابة. وواحدٌ يكفي: القياس لا يرسم شيئًا.
 *
 * **٢. `family` المنطقية تُحلّ هنا.** المشهد يحمل `'ui'` لا سلسلة
 * `font-family` كاملة، والعائلة الفعلية من `RenderStyle`. فلو قِيس بعائلة
 * ورُسم بأخرى لانفصل اللفّ عن الشكل — وهو أسوأ من الخطأ الظاهر، لأنه يبدو
 * صحيحًا حتى تُقرأ الحافّة.
 *
 * **٣. `letterSpacing` يُضبَط صفرًا في القياس كما في الرسم.** خاصية السياق
 * لزجة: نداءٌ سابق ضبطها يُفسد كل قياس بعده.
 */

import { estimateMetrics, type FontMetrics, type MeasureFont, type MeasureText } from '@/modules/editor/text-layout'

import type { FontSpec } from '@/modules/editor/scene'

/** يبني سلسلة `font` بالعائلة الفعلية. */
export function cssFont(font: FontSpec, family: string): string {
  return `${font.weight} ${font.sizePx}px ${family}`
}

export interface Measurer {
  readonly measure: MeasureText
  readonly measureFont: MeasureFont
}

/**
 * يبني قيّاسًا مربوطًا بعائلة خطّ.
 *
 * `ctx` يُحقن في الاختبار؛ وفي المتصفّح يُنشأ قماشٌ بمقاس 1×1 — القياس لا
 * يحتاج سطحًا، والمقاس الافتراضي 300×150 يخصّص 180 كيلوبايت بلا سبب.
 */
export function createMeasurer(
  family: string,
  ctx?: CanvasRenderingContext2D | null,
): Measurer {
  const context =
    ctx ?? document.createElement('canvas').getContext('2d')

  if (!context) {
    // سياقٌ مرفوض (ذاكرة، أو بيئة بلا قماش): التقدير أفضل من الانهيار.
    return { measure: (line, font) => line.length * font.sizePx * 0.55, measureFont: estimateMetrics }
  }

  const measure: MeasureText = (line, font) => {
    context.font = cssFont(font, family)
    context.letterSpacing = '0px'
    return context.measureText(line).width
  }

  const measureFont: MeasureFont = (font) => {
    context.font = cssFont(font, family)
    context.letterSpacing = '0px'
    const m = context.measureText('لمشقٰgQ')
    const ascent = m.actualBoundingBoxAscent
    const descent = m.actualBoundingBoxDescent
    /*
     * الاحتياط ليس تجميلًا: `actualBoundingBox*` تُعيد صفرًا على نصٍّ لم
     * يجهز خطّه بعد، فارتفاع السطر يصير صفرًا وتتراكم كل الأسطر على واحد.
     */
    if (!(ascent > 0) || !(descent > 0)) return estimateMetrics(font)
    return {
      ascent,
      descent,
      // ١٫٤٥ نسبة سطر ملفّ التصميم للنصّ العربي — أوسع من اللاتيني للتشكيل.
      lineHeight: font.sizePx * 1.45,
    } satisfies FontMetrics
  }

  return { measure, measureFont }
}
