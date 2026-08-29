import { cx } from '@/ui/cx'

import styles from './Radio.module.css'

import type { JSX } from 'preact'

export type RadioSelected = 'off' | 'on'
export type RadioState = 'default' | 'hover' | 'focus' | 'disabled'

export interface RadioProps {
  selected?: RadioSelected
  state?: RadioState
  label?: string
  name?: string
  onChange?: (selected: boolean) => void
  class?: string | undefined
  'aria-label'?: string
}

/** `Radio` — 8 variant: 2 تحديد × 4 حالة. */
export function Radio({
  selected = 'off',
  state = 'default',
  label,
  name,
  onChange,
  class: className,
  'aria-label': ariaLabel,
}: RadioProps): JSX.Element {
  const disabled = state === 'disabled'
  const on = selected === 'on'

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
        type="radio"
        class={styles.native}
        checked={on}
        disabled={disabled}
        name={name}
        onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => onChange?.(e.currentTarget.checked)}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      />
      <span class={cx(styles.dot, on && styles.on)} aria-hidden="true" />
      {label ? <span class={styles.label}>{label}</span> : null}
    </label>
  )
}
