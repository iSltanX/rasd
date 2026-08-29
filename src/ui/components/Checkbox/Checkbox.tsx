import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './Checkbox.module.css'

import type { JSX } from 'preact'

export type CheckboxChecked = 'off' | 'on' | 'mixed'
export type CheckboxState = 'default' | 'hover' | 'focus' | 'disabled'

export interface CheckboxProps {
  checked?: CheckboxChecked
  state?: CheckboxState
  label?: string
  onChange?: (checked: boolean) => void
  class?: string | undefined
  'aria-label'?: string
}

/** `Checkbox` — 12 variant: 3 حالة تحديد × 4 حالة. */
export function Checkbox({
  checked = 'off',
  state = 'default',
  label,
  onChange,
  class: className,
  'aria-label': ariaLabel,
}: CheckboxProps): JSX.Element {
  const disabled = state === 'disabled'
  const mixed = checked === 'mixed'
  const on = checked === 'on'

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
        class={styles.native}
        checked={on}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = mixed
        }}
        onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => onChange?.(e.currentTarget.checked)}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      />
      <span class={cx(styles.box, (on || mixed) && styles.filled)} aria-hidden="true">
        {on ? <Icon name="check" size="xs" class={styles.mark} /> : null}
        {mixed ? <Icon name="minus" size="xs" class={styles.mark} /> : null}
      </span>
      {label ? <span class={styles.label}>{label}</span> : null}
    </label>
  )
}
