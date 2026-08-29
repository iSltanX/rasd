/**
 * رياضيات القصّ — تحويل مستطيل تحديد إلى معاملات `drawImage` صالحة.
 *
 * **لماذا وحدة منفصلة عن منفّذ القصّ:** الرياضيات هي ما ينكسر، لا نداء
 * `drawImage` نفسه. فصلها يجعلها قابلة للاختبار عند `dpr` = 1 و2 و3 وعند
 * تحديد يتجاوز حدود اللقطة — وهي الحالات الثلاث التي تفرض المرحلة اختبارها —
 * بلا `OffscreenCanvas` ولا متصفّح.
 *
 * **الفضاء `device` حصرًا.** اللقطة القادمة من `captureVisibleTab` بأبعاد
 * الجهاز (منطقي × dpr)، والتحديد يصل بفضاء النافذة فيُحوَّل مرّة واحدة عبر
 * `viewportRectToDevice` — الذي يقرّب الحوافّ لا الأصل والمقاس. تمرير مستطيل
 * نافذة إلى هنا يعطي قصًّا مصغَّرًا بمقدار dpr، وهو خطأ صامت على شاشة عادية
 * (dpr = 1) يظهر فقط على شاشة ريتينا.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا DOM.
 */

import { deviceRect, intersect, type DeviceRect } from '@/shared/geometry'

/** أبعاد الصورة المصدر، بالبكسل الفيزيائي. */
export interface SourceSize {
  readonly width: number
  readonly height: number
}

/**
 * معاملات `drawImage` التسعة، مسمّاة.
 *
 * `sx…sh` من المصدر و`dw,dh` مقاس الوجهة. لا `dx,dy`: الوجهة قماش بمقاس
 * القصّ بالضبط، فالرسم يبدأ دائمًا من (0,0). تسميتها هنا تمنع الخلط الشائع
 * بين ثلاثيات الأرقام التسعة في النداء الخام.
 */
export interface CropPlan {
  readonly sx: number
  readonly sy: number
  readonly sw: number
  readonly sh: number
  readonly dw: number
  readonly dh: number
}

/**
 * يحصر مستطيل القصّ داخل حدود المصدر.
 *
 * التحديد قد يتجاوز اللقطة لسببين واقعيين: تمرير حدث بعد أخذ لقطة الإحداثيات،
 * أو فرق تقريب عند `dpr` كسري (1.5 مثلًا) بين ما رسمه المتصفّح وما أعاده
 * `captureVisibleTab`. القصّ خارج الحدود لا يرمي في Canvas — يعطي حافّة
 * شفّافة صامتة. الحصر يجعلها مستحيلة بدل الاعتماد على ألّا تقع.
 *
 * يُرجع `null` حين لا تقاطع إطلاقًا: ذلك خطأ يستحقّ رسالة لا صورة فارغة.
 */
export function clampToSource(crop: DeviceRect, source: SourceSize): DeviceRect | null {
  const bounds = deviceRect(0, 0, source.width, source.height)
  const clipped = intersect(crop, bounds)
  if (!clipped) return null

  // التقريب إلى عدد صحيح **بعد** التقاطع: Canvas يقبل الكسور ويُنتج حافّة
  // مموّهة (interpolated)، وهي أوّل ما يُلاحَظ على لقطة نصّية.
  const x1 = Math.round(clipped.x)
  const y1 = Math.round(clipped.y)
  const x2 = Math.round(clipped.x + clipped.width)
  const y2 = Math.round(clipped.y + clipped.height)
  if (x2 <= x1 || y2 <= y1) return null

  return deviceRect(x1, y1, x2 - x1, y2 - y1)
}

/**
 * يبني خطّة قصّ، أو يُرجع `null` إن لم يبقَ شيء.
 *
 * الوجهة بمقاس المصدر المقصوص **بلا إعادة تحجيم**: اللقطة تُحفَظ بدقّة
 * الجهاز كما التُقطت. تصغيرها هنا يفقد تفاصيل النصّ على شاشة ريتينا، وهو
 * عكس الغرض من أداة فحص بصري.
 */
export function planCrop(crop: DeviceRect, source: SourceSize): CropPlan | null {
  const clamped = clampToSource(crop, source)
  if (!clamped) return null
  return {
    sx: clamped.x,
    sy: clamped.y,
    sw: clamped.width,
    sh: clamped.height,
    dw: clamped.width,
    dh: clamped.height,
  }
}

/** هل يغطّي التحديد المصدر كاملًا؟ عندها لا حاجة إلى قصّ إطلاقًا. */
export function isFullSource(crop: DeviceRect, source: SourceSize): boolean {
  return (
    Math.round(crop.x) <= 0 &&
    Math.round(crop.y) <= 0 &&
    Math.round(crop.x + crop.width) >= source.width &&
    Math.round(crop.y + crop.height) >= source.height
  )
}
