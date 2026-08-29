import { cx } from '@/ui/cx'

import styles from './Toggle.module.css'

import type { JSX } from 'preact'

export type ToggleState = 'default' | 'hover' | 'focus' | 'disabled'

export interface ToggleProps {
  on?: boolean
  state?: ToggleState
  label?: string
  onChange?: (on: boolean) => void
  class?: string | undefined
  'aria-label'?: string
}

/**
 * `Toggle` — 8 variant: تشغيل/إيقاف × 4 حالة.
 *
 * **مِرآة الاتجاه:** نقطة التشغيل تقف عند اليسار في RTL — نفس المكان الذي
 * تقف فيه في LTR على الشاشة، لأن `inset-inline-end` يتبع اتجاه الكتابة.
 */
export function Toggle({
  on = false,
  state = 'default',
  label,
  onChange,
  class: className,
  'aria-label': ariaLabel,
}: ToggleProps): JSX.Element {
  const disabled = state === 'disabled'

  return (
    <label
      class={cx(
        styles.wrap,
        disabled && styles.disabled,
        state === 'hover' && styles.forceHover,
        state === 'focus' && styles.forceFocus,
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        class={styles.native}
        checked={on}
        disabled={disabled}
        onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => onChange?.(e.currentTarget.checked)}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      />
      <span class={cx(styles.track, on && styles.on)} aria-hidden="true">
        <span class={styles.knob} />
      </span>
      {label ? <span class={styles.label}>{label}</span> : null}
    </label>
  )
}
