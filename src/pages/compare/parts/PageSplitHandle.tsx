/**
 * مقبض الفاصل القابل بالسحب — لوضع «متجاور» في صفحة المقارنة.
 *
 * **إعادة بناء لا استيراد من `ui/overlay/compare/SplitHandle.tsx`.** ذاك
 * المكوّن يشارك فضاء `OverlayTransform` (إزاحة/دوران/تحجيم) الخاصّ بطبقة
 * التركيب فوق صفحة مضيفة حيّة — ولا معنى لدوران أو تحويل هنا: هذه صفحة
 * إضافة عادية تعرض صورتين ثابتتين داخل حاوية DOM طبيعية بلا تحويل. حساب
 * السحب هنا أبسط عمدًا: دلتا المؤشِّر مقسومة على عرض الحاوية الفعلي وقت
 * البدء، لا مقسومة على `scale` مرجع.
 *
 * **المحور رأسي فقط** — يطابق إطار Figma `127:196` («compare / two-captures»)
 * الذي يعرض خطًّا رأسيًّا واحدًا لا خيار محور؛ خلافًا لـ`SplitHandle.tsx`
 * الذي يخدم مرجعًا حرّ الدوران في المرحلة 16.
 *
 * **`measureExtent` مُحقَن لا مقروء من `ref` داخليًّا** — نفس مبدأ حَقن
 * `ThumbnailEncoder`: يجعل حساب السحب قابلًا للاختبار بلا تخطيط حقيقي
 * (happy-dom لا يقيس `getBoundingClientRect` فعليًّا).
 */

import { useRef } from 'preact/hooks'

import { Icon } from '@/ui/icons/Icon'

import styles from './PageSplitHandle.module.css'

import type { JSX } from 'preact'

export interface PageSplitHandleProps {
  /** 0–100. */
  readonly position: number
  readonly onPositionChange: (percent: number) => void
  /** عرض الحاوية بالبكسل وقت بدء السحب. */
  readonly measureExtent: () => number
}

export function PageSplitHandle({
  position,
  onPositionChange,
  measureExtent,
}: PageSplitHandleProps): JSX.Element {
  const dragRef = useRef<{ startClient: number; startPosition: number; extent: number } | null>(
    null,
  )
  const clamped = Math.min(100, Math.max(0, position))

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // happy-dom لا يطبّق setPointerCapture — تدهور لا فشل، نفس نمط area-select.ts.
    }
    dragRef.current = { startClient: e.clientX, startPosition: position, extent: measureExtent() }
  }

  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.extent <= 0) return
    const deltaPercent = ((e.clientX - drag.startClient) / drag.extent) * 100
    onPositionChange(drag.startPosition + deltaPercent)
  }

  const endDrag = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // المؤشِّر أُفلت أصلًا أو العنصر أُزيل.
    }
  }

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onPositionChange(position + step)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onPositionChange(position - step)
    }
  }

  // متغيّر CSS مخصَّص — الموضع فيزيائي مقصود (نسبة عبر عرض الصورة، لا اتجاه
  // قراءة)؛ نفس تعليل `SplitHandle.tsx` حرفيًّا.
  const positionStyle: JSX.CSSProperties & Record<string, string> = {
    '--rasd-cmp-split-pos': `${clamped}%`,
  }

  return (
    <div class={styles.frame} style={positionStyle}>
      <div class={styles.line} />
      <div
        class={styles.handle}
        role="slider"
        tabIndex={0}
        aria-label="موضع الفاصل"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <Icon name="chevron-left" size="xs" />
        <Icon name="chevron-right" size="xs" />
      </div>
    </div>
  )
}
