import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './Select.module.css'

import type { JSX } from 'preact'

export type SelectState = 'default' | 'hover' | 'focus' | 'open' | 'disabled'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value: string
  options: readonly SelectOption[]
  onChange?: (value: string) => void
  /** حالة مفروضة للمعرض؛ `disabled` تعطّل الضابط فعلًا. */
  state?: SelectState
  disabled?: boolean
  id?: string | undefined
  'aria-label'?: string | undefined
  'aria-describedby'?: string | undefined
  class?: string | undefined
}

/**
 * `Select` — 5 variant. قائمة منسدلة مدمجة لصفوف الإعدادات: `<select>` أصليّ مكسوّ
 * بمظهر المكوّن، فتبقى لوحة المفاتيح وقارئ الشاشة والقائمة المنبثقة للمتصفّح نفسه.
 * القيمة في بداية السطر والسهم في نهايته — على اليسار في RTL كما في الإطار.
 */
export function Select({
  value,
  options,
  onChange,
  state = 'default',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  class: className,
}: SelectProps): JSX.Element {
  const isDisabled = disabled || state === 'disabled'
  return (
    <span
      class={cx(
        styles.wrap,
        state === 'hover' && styles.forceHover,
        state === 'focus' && styles.forceFocus,
        state === 'open' && styles.forceOpen,
        isDisabled && styles.disabled,
        className,
      )}
    >
      <select
        class={styles.native}
        value={value}
        disabled={isDisabled}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onChange={(e: JSX.TargetedEvent<HTMLSelectElement>) => onChange?.(e.currentTarget.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size="xs" class={styles.chevron} />
    </span>
  )
}
