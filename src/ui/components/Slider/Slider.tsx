import { cx } from '@/ui/cx'

import styles from './Slider.module.css'

import type { JSX } from 'preact'

export type SliderState = 'default' | 'hover' | 'focus' | 'disabled'

export interface SliderProps {
  /** 0–100. */
  value: number
  state?: SliderState
  onChange?: (value: number) => void
  class?: string | undefined
  'aria-label': string
}

/**
 * `Slider` — 16 variant: 4 قيمة × 4 حالة.
 *
 * `input[type=range]` أصلي — يمنح تنقّل الأسهم و`Home`/`End` مجانًا من المتصفح،
 * ويعكس اتجاهه تلقائيًا في `dir="rtl"`.
 */
export function Slider({
  value,
  state = 'default',
  onChange,
  class: className,
  'aria-label': ariaLabel,
}: SliderProps): JSX.Element {
  const disabled = state === 'disabled'
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <span
      class={cx(
        styles.wrap,
        state === 'hover' && styles.forceHover,
        state === 'focus' && styles.forceFocus,
        className,
      )}
      style={{ '--rasd-slider-value': `${clamped}%` }}
    >
      <input
        type="range"
        class={styles.native}
        min={0}
        max={100}
        value={clamped}
        disabled={disabled}
        aria-label={ariaLabel}
        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
          onChange?.(Number(e.currentTarget.value))
        }
      />
      <span class={styles.track} aria-hidden="true">
        <span class={styles.fill} />
        <span class={styles.thumb} />
      </span>
    </span>
  )
}
