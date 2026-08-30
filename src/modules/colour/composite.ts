/**
 * تركيب الطبقات شبه الشفافة — الجواب على «ما اللون الفعلي خلف هذا؟».
 *
 * **لماذا يلزم أصلًا:** `getComputedStyle(el).backgroundColor` يُرجع
 * `rgba(0, 0, 0, 0)` لأغلب العناصر — أي «لا خلفية هنا»، لا «الخلفية
 * شفّافة». واللون الذي يراه المستخدم خلف نصّ ما قد يكون على جدٍّ يبعد ستّ
 * درجات. وفحص التباين بين نصّ وخلفية **معدومة** بلا معنى: النتيجة إمّا
 * انهيار أو رقم مخترَع.
 *
 * والمركَّب ليس آخر طبقة غير شفّافة وحدها: طبقتان بنصف شفافية فوق أبيض
 * تعطيان لونًا ثالثًا لا يساوي أيًّا منهما. فالمشي يجمع الطبقات ثم يركّبها
 * بالترتيب الصحيح — من الأبعد إلى الأقرب.
 *
 * `modules/` منطق خالص هنا: الحساب لا يلمس DOM. جمع الطبقات من الشجرة
 * يقع في `background.ts` المجاور.
 */

import { fromPixel, type ColourReading, type Rgb255 } from './formats'

/** طبقة واحدة في المكدّس: لون بقناة ألفا. */
export interface Layer {
  readonly rgb: Rgb255
  /** 0..1 */
  readonly alpha: number
}

/**
 * تركيب `source-over` لطبقتين — القاعدة نفسها التي يستعملها المتصفّح.
 *
 * `Co = Cs·αs + Cb·αb·(1 − αs)` ثم القسمة على ألفا الناتج. القسمة لازمة
 * لأن الحساب يجري **مضروبًا بالألفا** (premultiplied)، وإهمالها يعطي لونًا
 * داكنًا زورًا كلّما كانت الخلفية شبه شفّافة.
 */
export function over(source: Layer, backdrop: Layer): Layer {
  const as = source.alpha
  const ab = backdrop.alpha
  const ao = as + ab * (1 - as)

  // ناتج شفّاف تمامًا: لا لون له، والقسمة على صفر تعطي NaN.
  if (ao <= 0) return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 }

  const mix = (s: number, b: number): number => Math.round((s * as + b * ab * (1 - as)) / ao)

  return {
    rgb: {
      r: mix(source.rgb.r, backdrop.rgb.r),
      g: mix(source.rgb.g, backdrop.rgb.g),
      b: mix(source.rgb.b, backdrop.rgb.b),
    },
    alpha: ao,
  }
}

/**
 * يركّب مكدّسًا كاملًا مرتَّبًا **من الأبعد إلى الأقرب**.
 *
 * الترتيب مقصود ومطابق لترتيب المشي في الشجرة (الجدّ أوّلًا)، فلا يُعكَس
 * عند الاستدعاء. مكدّس فارغ يعطي شفّافًا لا أبيض: «لا أعرف» لا «أبيض».
 */
export function compositeStack(layers: readonly Layer[]): Layer {
  let result: Layer = { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 }
  for (const layer of layers) result = over(layer, result)
  return result
}

/** الأبيض المعتم — سطح المتصفّح الافتراضي خلف كل شيء. */
export const CANVAS_WHITE: Layer = { rgb: { r: 255, g: 255, b: 255 }, alpha: 1 }

/**
 * يحوّل مكدّسًا إلى لون معتم صالح لفحص التباين.
 *
 * **الأبيض يُوضَع أسفل المكدّس لا يُفترَض.** حين لا تُغلَق السلسلة بطبقة
 * معتمة (صفحة بلا `background` على `html`)، فالمتصفّح يرسم على سطحه
 * الأبيض — فيُضاف صراحةً ويُعلَن أنه افتراض لا قراءة، عبر `assumedWhite`.
 */
export function flatten(layers: readonly Layer[]): {
  readonly colour: ColourReading
  readonly assumedWhite: boolean
} {
  const stacked = compositeStack(layers)
  const opaque = stacked.alpha >= 1
  const final = opaque ? stacked : over(stacked, CANVAS_WHITE)
  return {
    colour: fromPixel(final.rgb.r, final.rgb.g, final.rgb.b),
    assumedWhite: !opaque,
  }
}

/** يبني طبقة من قراءة لون. */
export function layerOf(reading: ColourReading): Layer {
  return { rgb: reading.rgb, alpha: reading.alpha }
}
