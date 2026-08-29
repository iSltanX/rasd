import { cx } from '@/ui/cx'

import styles from './SegmentedControl.module.css'

import type { JSX } from 'preact'

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: readonly SegmentedOption[]
  /** الفهرس المحدَّد — يطابق محور Figma `Selected: 1 | 2 | 3`. */
  selected?: number
  onChange?: (index: number) => void
  class?: string | undefined
  'aria-label': string
}

/**
 * `Segmented Control` — 3 variant: العنصر المحدَّد 1 أو 2 أو 3.
 *
 * تنقّل بالأسهم كعنصر واحد قابل للتركيز (نمط `radiogroup`)، و`Home`/`End` إلى
 * الطرفين.
 */
export function SegmentedControl({
  options,
  selected = 0,
  onChange,
  class: className,
  'aria-label': ariaLabel,
}: SegmentedControlProps): JSX.Element {
  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length
    onChange?.(next)
  }

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    // `currentTarget.dir` يعكس خاصية `dir` على العنصر نفسه فقط، لا الاتجاه
    // المُورَّث من `<html dir="rtl">` — يبقى فارغًا دومًا في الاستخدام
    // الفعلي فيُسقط عكس اتجاه الأسهم صامتًا. `getComputedStyle` يقرأ
    // الاتجاه الفعلي بعد التوريث.
    const isRtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    if (e.key === 'ArrowRight') move(selected, isRtl ? -1 : 1)
    else if (e.key === 'ArrowLeft') move(selected, isRtl ? 1 : -1)
    else if (e.key === 'Home') onChange?.(0)
    else if (e.key === 'End') onChange?.(options.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div
      class={cx(styles.group, className)}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={i === selected}
          tabIndex={i === selected ? 0 : -1}
          class={cx(styles.segment, i === selected && styles.active)}
          onClick={() => onChange?.(i)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
