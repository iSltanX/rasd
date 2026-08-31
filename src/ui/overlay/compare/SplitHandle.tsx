import { useRef } from 'preact/hooks'

import { Icon } from '@/ui/icons/Icon'

import type { OverlayTransform, SplitAxis } from '@/modules/compare/overlay'
import type { JSX } from 'preact'

/**
 * مقبض التقسيم القابل بالسحب — `compare / split-reference` (`69:91` الخطّ،
 * `69:92` المقبض بسهميه). **الفجوة الأخيرة المعلَنة في `ComparePanel.tsx`**:
 * منزلق «موضع الفاصل» يمنح تحكّمًا رقميًا كاملًا منذ بنائه، لكن السحب
 * المباشر على الخطّ نفسه — كما يرسمه الإطار — لم يكن موصولًا.
 *
 * **يشارك فضاء المرجع لا فضاء `viewport`**: يُرسَم بنفس `translate`/`rotate`/
 * `scale` التي يرسم بها `ReferenceOverlay`، ومقاسه الطبيعي نفسه
 * (`naturalWidth`/`naturalHeight`) — فموضع الخطّ عند `splitPosition%` هنا
 * يطابق بالضبط ما يقصّه `clip-path` في `ReferenceOverlay` (نسبة من عرض/
 * ارتفاع **الصورة** لا من `viewport`)، لأن كلاهما يقرأ الرقم نفسه بالطريقة
 * نفسها. هذا يعني: تغيير حجم المرجع بالعجلة يحرّك المقبض معه تلقائيًّا بلا
 * أي حساب إضافي هنا.
 *
 * **بلا `stopPropagation`**: طبقة `onDown`/`onMove`/`onUp` في
 * `overlay-app.tsx` تفحص بالفعل `e.target === layer` (`onBackground`) قبل
 * استدعاء `compare.onPointerDown` — وهدف الحدث هنا هذا المقبض لا الطبقة،
 * فيسقط ذلك الفرع تلقائيًّا بلا حاجة لإيقاف انتشار. `compare.onPointerMove`/
 * `onPointerUp` يُستدعيان دون شرط في وضع المقارنة (تعليقهما هناك يشرح
 * السبب: سحبٌ بدأ فوق الخلفية يجب أن يتابع فوق اللوحة)، لكنهما بلا أثر هنا
 * لأن `dragStart` الداخلي في `compare.ts` يبقى `null` — لم يُستدعَ
 * `onPointerDown` أصلًا.
 *
 * **`setPointerCapture` لازم هنا خلافًا للسحب الخلفي**: هدف السحب الخلفي
 * طبقة كاملة تغطّي الشاشة تقريبًا فتبقى الأحداث تصيبها عمليًّا؛ هذا المقبض
 * صغير (`48×31` في الإطار)، وحركة سريعة تُخرج المؤشِّر منه بسهولة بلا أسر
 * صريح.
 *
 * **بلا دوران في حساب السحب**: `transform.rotation` لا تُضبَط من أي واجهة
 * اليوم (لا زرّ ولا مقبض — فجوة معلَنة منفصلة في `ComparePanel.tsx`)، فتحويل
 * دلتا الشاشة إلى نسبة يفترض محورًا غير مُدار — لو فُعِّل الدوران يومًا
 * يحتاج هذا الحساب إسقاطًا على المحور المحلّي، وهو عملٌ لا مبرِّر لبنائه
 * لميزة لا مدخل حيّ لها بعد.
 *
 * **`tabIndex` وأسهم لوحة المفاتيح — لا زخرفة `role="slider"` وحدها**:
 * منزلق «موضع الفاصل» الرقمي في `ComparePanel` يغطّي هذه القيمة أيضًا،
 * لكن دورًا كـ`slider` بلا تركيز فعلي مخالفة توثَّق في WAI-ARIA (سطرٌ
 * أُصلح بعد مراجعة عدائية وجدته حرفيًّا) — عنصر لا يُركَّز لا يجوز أن
 * يَعِد بدور تفاعلي. الأسهم هنا خطوة ١٪ عاديًّا و١٠٪ مع ⇧، نفس أرقام
 * `NUDGE_STEP_PX`/`NUDGE_STEP_FAST_PX` في `modules/compare/overlay.ts`
 * ولو بوحدة مختلفة (نسبة لا بكسل) — لا سابقة نسبةٍ مخصَّصة لِتُخالَف.
 */

export interface SplitHandleProps {
  readonly transform: OverlayTransform
  readonly naturalWidth: number
  readonly naturalHeight: number
  /** 0–100. */
  readonly splitPosition: number
  readonly splitAxis: SplitAxis
  readonly onSplitPositionChange: (percent: number) => void
}

export function SplitHandle({
  transform,
  naturalWidth,
  naturalHeight,
  splitPosition,
  splitAxis,
  onSplitPositionChange,
}: SplitHandleProps): JSX.Element | null {
  const dragRef = useRef<{ startClient: number; startPosition: number } | null>(null)

  // صورة لم تُفكّ أبعادها بعد (لحظة عابرة بين تعيين المرجع وتحميله) — لا مقبض بلا مقاس صالح.
  if (naturalWidth <= 0 || naturalHeight <= 0) return null

  const extentPx = (splitAxis === 'vertical' ? naturalWidth : naturalHeight) * transform.scale

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    // الزرّ الأيسر وحده — نفس حارس `area-select.ts` حرفيًّا: الأيمن يفتح
    // قائمة سياق، والأوسط يلصق على Linux، وكلاهما لا يجوز أن يبدأ سحبًا.
    if (e.button !== 0) return
    // نفس نمط `area-select.ts` حرفيًّا — `happy-dom` لا يطبّق `setPointerCapture`،
    // وبلا التقاط يبقى السحب يعمل داخل النافذة (تدهور لا فشل).
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // كذلك.
    }
    dragRef.current = {
      startClient: splitAxis === 'vertical' ? e.clientX : e.clientY,
      startPosition: splitPosition,
    }
  }

  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || extentPx <= 0) return
    const client = splitAxis === 'vertical' ? e.clientX : e.clientY
    const deltaPercent = ((client - drag.startClient) / extentPx) * 100
    onSplitPositionChange(drag.startPosition + deltaPercent)
  }

  const endDrag = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // المؤشِّر أُفلت أصلًا أو العنصر أُزيل — إنهاء السحب لا يرمي.
    }
  }

  /**
   * الأسهم موازية للسحب لا مستقلّة عنه — `ArrowRight`/`ArrowDown` تزيد
   * الموضع (نفس اتجاه سحب يمينًا/أسفل)، والمحور يحدِّد الزوج الفاعل
   * (يمين/يسار للرأسي، أعلى/أسفل للأفقي) مطابقةً لِـ`onPointerMove` أعلاه.
   */
  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 10 : 1
    const positiveKey = splitAxis === 'vertical' ? 'ArrowRight' : 'ArrowDown'
    const negativeKey = splitAxis === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
    if (e.key === positiveKey) {
      e.preventDefault()
      onSplitPositionChange(splitPosition + step)
    } else if (e.key === negativeKey) {
      e.preventDefault()
      onSplitPositionChange(splitPosition - step)
    }
  }

  const frameStyle: JSX.CSSProperties & Record<string, string> = {
    '--rasd-ov-x': `${transform.tx}px`,
    '--rasd-ov-y': `${transform.ty}px`,
    '--rasd-ov-rotate': `${transform.rotation}deg`,
    '--rasd-ov-scale': `${transform.scale}`,
    '--rasd-ov-w': `${naturalWidth}px`,
    '--rasd-ov-h': `${naturalHeight}px`,
  }

  /**
   * نفس منطق `splitClipPath` في `ReferenceOverlay.tsx` حرفيًّا — فيزيائي
   * (`left`/`top`) لا منطقي، ونفس القيمة المُشبَعة بين 0 و100.
   *
   * **متغيّر CSS مخصَّص لا خاصّية `left`/`top` مباشرة**: `no-restricted-syntax`
   * يمنع `left`/`right` كخاصّية سطرية (الواجهة RTL) — والاستثناء هنا نفس
   * سبب `splitClipPath`: الموضع الفيزيائي **مقصود** لا سهوًا. الفرق أن ذلك
   * الملفّ يبني سلسلة `clip-path` نصًّا فيفلت من مطابقة القاعدة الاسمية بلا
   * حيلة، وهذا مكوّن يحتاج خاصّيتين فيزيائيّتين مختلفتين حسب المحور — فيُمرَّر
   * متغيّر واحد، وCSS (خارج نطاق هذه القاعدة أصلًا) هو من يقرِّر `left` أم
   * `top` حسب `[data-axis]`، على نمط `--rasd-ov-x`/`--rasd-ov-w` أعلاه تمامًا.
   */
  const clamped = Math.min(100, Math.max(0, splitPosition))
  const positionStyle: JSX.CSSProperties & Record<string, string> = {
    '--rasd-ov-split-pos': `${clamped}%`,
  }

  return (
    <div class="rasd-ov-split-frame" style={frameStyle} data-rasd-ov="split-frame">
      <div class="rasd-ov-split-line" data-axis={splitAxis} style={positionStyle} />
      <div
        class="rasd-ov-split-handle"
        data-axis={splitAxis}
        style={positionStyle}
        role="slider"
        tabIndex={0}
        aria-label="موضع الفاصل"
        // اتجاه القيمة نفسه — عمودي للمقبض الرأسي (المحور `vertical` يسمّي
        // الخطّ الفاصل، وحركة المقبض عمودية على ذلك الخطّ: أفقيّة) وبالعكس.
        aria-orientation={splitAxis === 'vertical' ? 'horizontal' : 'vertical'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {splitAxis === 'vertical' ? (
          <>
            <Icon name="chevron-left" size="xs" />
            <Icon name="chevron-right" size="xs" />
          </>
        ) : (
          <>
            <Icon name="chevron-up" size="xs" />
            <Icon name="chevron-down" size="xs" />
          </>
        )}
      </div>
    </div>
  )
}
