import type {
  CompareBlendMode,
  CompareDisplayMode,
  OverlayTransform,
  SplitAxis,
} from '@/modules/compare/overlay'
import type { JSX } from 'preact'

/**
 * صورة المرجع العائمة — `compare / split-reference` (`69:2`) و`compare /
 * viewports` (`127:315`، مصغَّرة). **تعرض ولا تحسب**، كبقيّة بدائيّات
 * الطبقة: تستقبل `OverlayTransform` جاهزًا من `content/tools/compare.ts`
 * ولا تلمس `window.scrollX` ولا أي حالة حيّة بنفسها.
 *
 * **بلا `naturalWidth`/`naturalHeight` عمدًا**: الصورة تُعرَض بمقاسها
 * الطبيعي فعليًا (المتصفّح يقرأه من الملفّ نفسه)، والتحجيم التفاعلي طبقة
 * `scale` منفصلة فوقه — فلا حاجة لتمرير المقاس يدويًا هنا؛ `matchWidth`
 * في `compare.ts` هو من يحتاجه، وهو موجود هناك بالفعل.
 *
 * **`pointer-events: none`** — نفس مبدأ `.rasd-ov-place` في كل الطبقة:
 * زينة لا سطح التقاط. السحب يُلتقَط على الطبقة نفسها (`data-rasd-interactive`)
 * لا على الصورة تحديدًا، فيعمل السحب حتى حين تكون الصورة أصغر من
 * `viewport` أو خارج حدوده جزئيًا بعد التصغير أو الإزاحة.
 *
 * **`alt=""` مقصودة لا سهو**: الصورة زخرفة أداة تحقّق بصري تطفو فوق صفحة
 * لا علاقة لها بها — قارئ شاشة يتصفّح الصفحة المضيفة لا يستفيد من مقاطعة
 * بوصف صورة مرجع تصميم لا يراها هو أصلًا. لوحة التحكّم (دفعة لاحقة) هي ما
 * يحمل التسميات المتاحة فعليًا للتفاعل.
 */

export interface ReferenceOverlayProps {
  readonly imageUrl: string
  readonly transform: OverlayTransform
  readonly displayMode: CompareDisplayMode
  readonly blendMode: CompareBlendMode
  /** 0–100 — يُطبَّق في كل الأنماط، لا وضع «شفافية» وحده (يظهر في اللوحة بمعزل عن التبويب النشط). */
  readonly opacity: number
  /** 0–100 — يُهمَل إلا في وضع `split`. */
  readonly splitPosition: number
  readonly splitAxis: SplitAxis
  /** وضع `blink` فقط: `true` أثناء الضغط المطوَّل يُخفي المرجع فيكشف الصفحة الحيّة تحته. */
  readonly blinkShowingLive: boolean
}

/**
 * قصّ نصف الصورة في وضع التقسيم — المرجع يظهر في **النصف الذي يبدأ منه
 * اتجاه واجهتنا** (يمين في RTL) بصرف النظر عن اتجاه الصفحة المضيفة، وفق
 * بند القبول الصريح في نصّ المرحلة 16 في الخطّة السابقة (تاريخ Git عند `63a0966`): «اتجاه مقبض العرض
 * المنقسم ووجهته الافتراضية يتبعان اتجاه واجهتنا لا اتجاه الصفحة المضيفة».
 * `inset()` فيزيائي الاتجاه دومًا (لا `inset-inline`)، فيُكتب `right`
 * حرفيًّا هنا — لا اعتماد على `direction` الموروث من الصفحة.
 */
function splitClipPath(position: number, axis: SplitAxis): string {
  const clamped = Math.min(100, Math.max(0, position))
  return axis === 'vertical'
    ? `inset(0 0 0 ${clamped}%)` // المرجع يظهر من splitPosition% حتى اليمين (100%).
    : `inset(${clamped}% 0 0 0)` // أفقيًا: المرجع في النصف السفلي — انظر التوثيق أعلاه، افتراضٌ لا تصميمًا مصدره.
}

export function ReferenceOverlay({
  imageUrl,
  transform,
  displayMode,
  blendMode,
  opacity,
  splitPosition,
  splitAxis,
  blinkShowingLive,
}: ReferenceOverlayProps): JSX.Element | null {
  if (displayMode === 'blink' && blinkShowingLive) return null

  const style: JSX.CSSProperties & Record<string, string | number> = {
    '--rasd-ov-x': `${transform.tx}px`,
    '--rasd-ov-y': `${transform.ty}px`,
    '--rasd-ov-rotate': `${transform.rotation}deg`,
    '--rasd-ov-scale': `${transform.scale}`,
    opacity: opacity / 100,
  }

  if (displayMode === 'blend') style.mixBlendMode = blendMode
  if (displayMode === 'split') style.clipPath = splitClipPath(splitPosition, splitAxis)

  return (
    <img
      src={imageUrl}
      alt=""
      draggable={false}
      class="rasd-ov-place rasd-ov-reference"
      data-rasd-ov="compare-reference"
      style={style}
    />
  )
}
