/**
 * تحويل طبقة المرجع — رياضيات محضة بين فضاء المرجع وفضاء `viewport`
 * (المرحلة 16، §8.3 «التحكّم»).
 *
 * **تشابهيّ كامل لا تحجيمٌ بلا دوران كحال `editor/camera.ts`.** ذاك يفرض
 * «بلا دوران» صراحةً لأن دوران المشهد كلّه ليس في `Rasd_Ar.md §5`. وهنا
 * العكس بالضبط: نصّ المرحلة يذكر «تدويرها عند الحاجة» صراحةً، واختبار
 * المرحلة المفروض «رياضيات التحويل (إزاحة/تكبير/تدوير) ذهابًا وإيابًا» —
 * فالتحويل الكامل T(P) = R(θ)·(P·scale) + (tx,ty) لازمٌ لا اختياري.
 *
 * **ترتيب التركيب مقصود ومطابقٌ لقراءة CSS**: `transform:
 * translate() rotate() scale()` (يسار إلى يمين في السلسلة) يُطبَّق يمينًا
 * إلى يسار على نقطة محلّية — أي: تحجيم أوّلًا، ثم دوران، ثم إزاحة. هذا
 * يعني أن `toCssTransform` أدناه يعيد إنتاج هذه الرياضيات حرفيًّا بلا حساب
 * مصفوفة منفصل.
 *
 * **بلا حدود تحجيم هنا عمدًا** — خلافًا لـ`MIN_ZOOM`/`MAX_ZOOM` في
 * `camera.ts` المُشتقَّين من حدّ حقيقي (إظهار لقطة صفحة كاملة في مسرح
 * بمقاس معروف). مرجع المقارنة صورة مرفوعة بأي مقاس، ولا حدّ مماثل يُقاس
 * الآن؛ القصّ سياسة واجهة تُقرَّر حين تُبنى (دفعة لاحقة) لا رقمًا يُختلَق
 * هنا بلا مصدر.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  referencePoint,
  viewportPoint,
  type ReferencePoint,
  type ViewportPoint,
} from '@/shared/geometry'

/**
 * أنماط العرض والمزج ومحور التقسيم — أنواع بيانات محضة لا حالة، **هنا لا
 * في `content/tools/compare.ts`** رغم أن ذلك الملفّ مالكها الفعلي منطقيًا:
 * `ui/overlay/compare/ReferenceOverlay.tsx` يحتاجها لكتابة أنواع خصائصه.
 * `eslint.config.js` (`architectureZones`) لا يمنع `ui/` من استيراد
 * `content/` صراحةً بعد — فجوة في القاعدة لا إذنًا — لكن تعليق
 * `shared/geometry.ts` نفسه يُسمّي هذا الاتجاه «عكس اتجاه الاعتماد
 * الصحيح» حين نُقلت مفردات الأوضاع من `content/coords.ts` لهذا السبب
 * تحديدًا؛ فلا يُكرَّر هنا ولو مرّ من البوّابة الآلية بلا اعتراض.
 * `content/tools/compare.ts` يعيد تصديرها بلا تكرار — نفس نمط `export {
 * pxToRem, SNAP_THRESHOLD_PX }` في `content/tools/measure.ts`.
 */
export type CompareDisplayMode = 'blink' | 'opacity' | 'blend' | 'split'
export type CompareBlendMode = 'difference' | 'multiply' | 'overlay'
export type SplitAxis = 'vertical' | 'horizontal'

export interface OverlayTransform {
  readonly scale: number
  readonly tx: number
  readonly ty: number
  /** درجات — موجبةٌ نحو دوران الساعة، مطابقةً لـCSS `rotate()` على شاشة محورها y نازل. */
  readonly rotation: number
}

export const identityOverlayTransform: OverlayTransform = { scale: 1, tx: 0, ty: 0, rotation: 0 }

/** خطوتا التحريك بالسهم — §8.3: بكسل واحد عاديًا، عشرة مع ⇧. */
export const NUDGE_STEP_PX = 1
export const NUDGE_STEP_FAST_PX = 10

/** نقطة مرجع تدور بزاوية θ درجة حول الأصل، بإحداثيات محور y نازل (قياسي على الشاشة). */
function rotateXY(x: number, y: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** فضاء المرجع → `viewport`: تحجيمٌ ثم دورانٌ ثم إزاحة — نفس ترتيب `toCssTransform`. */
export function referenceToViewport(p: ReferencePoint, t: OverlayTransform): ViewportPoint {
  const rotated = rotateXY(p.x * t.scale, p.y * t.scale, t.rotation)
  return viewportPoint(rotated.x + t.tx, rotated.y + t.ty)
}

/** `viewport` → فضاء المرجع: معكوس `referenceToViewport` تمامًا — إزاحة عكسية ثم دوران عكسي ثم قسمة على التحجيم. */
export function viewportToReference(p: ViewportPoint, t: OverlayTransform): ReferencePoint {
  const dx = p.x - t.tx
  const dy = p.y - t.ty
  const rotated = rotateXY(dx, dy, -t.rotation)
  return referencePoint(rotated.x / t.scale, rotated.y / t.scale)
}

/** يزيح التحويل بدلتا **في فضاء `viewport` مباشرة** — سحب المؤشِّر دلتاه بهذا الفضاء أصلًا، فلا تحويل وسيط. */
export function translate(
  t: OverlayTransform,
  dxViewport: number,
  dyViewport: number,
): OverlayTransform {
  return { ...t, tx: t.tx + dxViewport, ty: t.ty + dyViewport }
}

/**
 * يعيد تعيين التحجيم مع إبقاء `anchor` (عادة موضع المؤشِّر) ثابتًا بصريًا —
 * تكبيرٌ «نحو المؤشِّر» لا نحو زاوية المرجع الخفية. الطريقة: نقرأ أيّ نقطة
 * مرجع تقع تحت `anchor` بالتحويل الحالي، نطبّق التحجيم الجديد، ثم نُصحِّح
 * الإزاحة كي تعود تلك النقطة نفسها إلى مكانها.
 */
export function scaleAt(
  t: OverlayTransform,
  newScale: number,
  anchor: ViewportPoint,
): OverlayTransform {
  const refUnderAnchor = viewportToReference(anchor, t)
  const scaled: OverlayTransform = { ...t, scale: newScale }
  const anchorAfter = referenceToViewport(refUnderAnchor, scaled)
  return translate(scaled, anchor.x - anchorAfter.x, anchor.y - anchorAfter.y)
}

/** نفس مبدأ `scaleAt` — لكن للدوران: `anchor` يبقى ثابتًا بصريًا بعد الدوران. */
export function rotateAt(
  t: OverlayTransform,
  newRotationDegrees: number,
  anchor: ViewportPoint,
): OverlayTransform {
  const refUnderAnchor = viewportToReference(anchor, t)
  const rotated: OverlayTransform = { ...t, rotation: newRotationDegrees }
  const anchorAfter = referenceToViewport(refUnderAnchor, rotated)
  return translate(rotated, anchor.x - anchorAfter.x, anchor.y - anchorAfter.y)
}

/**
 * معامل «طابق العرض» — التحجيم الذي يجعل عرض المرجع الطبيعي مساويًا تمامًا
 * لعرض حاوية مستهدَف. عرضٌ طبيعي غير موجب (صورة لم تُحمَّل بعد) يُعيد 1 —
 * لا قسمة على صفر ولا NaN يتسرّب إلى حالة الواجهة.
 */
export function matchWidthScale(referenceNaturalWidth: number, containerWidth: number): number {
  if (referenceNaturalWidth <= 0) return 1
  return containerWidth / referenceNaturalWidth
}

/**
 * قيمة CSS `transform` تُعيد إنتاج `T` حرفيًّا فوق عنصر مرساته أصل فضاء
 * المرجع (0,0) — أي بلا `transform-origin` مُزاح. الترتيب `translate
 * rotate scale` يُطبَّق يمينًا إلى يسار على النقطة (تحجيم أوّلًا) — طابِق
 * `referenceToViewport` أعلاه تمامًا لا صدفة.
 */
export function toCssTransform(t: OverlayTransform): string {
  return `translate(${t.tx}px, ${t.ty}px) rotate(${t.rotation}deg) scale(${t.scale})`
}
