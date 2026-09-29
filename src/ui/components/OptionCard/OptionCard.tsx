import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './OptionCard.module.css'

import type { JSX } from 'preact'

export type OptionCardState = 'default' | 'hover' | 'selected' | 'focus' | 'disabled'

export interface OptionCardProps {
  icon: IconName
  title: string
  /** سطر تحت العنوان. للمعطَّلة يُكتب فيه سبب التعطيل. */
  hint?: string | undefined
  /** اسم المجموعة — البطاقات خيارات متنافية كأزرار راديو. */
  name: string
  value: string
  selected?: boolean
  disabled?: boolean
  state?: OptionCardState
  onSelect?: (value: string) => void
  /** سبب التعطيل أو التلميح — `title` على البطاقة والراديو معًا. */
  reason?: string | undefined
  class?: string | undefined
  /** سمات `data-*` تُمرَّر إلى الراديو الأصليّ — هو ما يُنقر ويُقرأ. */
  [data: `data-${string}`]: string | undefined
}

/**
 * `Option Card` — 5 variant. بطاقة خيار: صيغة تصدير أو مسار مشاركة. تحتها زرّ راديو
 * أصليّ، فالأسهم تتنقّل داخل المجموعة ويقرأ قارئ الشاشة «محدَّد» — والمحدَّدة تُعلَن
 * بسطح `surface/brand-subtle` وحدّ `border/brand` ولون `text/brand` معًا.
 */
export function OptionCard({
  icon,
  title,
  hint,
  name,
  value,
  selected = false,
  disabled = false,
  state = 'default',
  onSelect,
  reason,
  class: className,
  ...data
}: OptionCardProps): JSX.Element {
  const isSelected = selected || state === 'selected'
  const isDisabled = disabled || state === 'disabled'
  return (
    <label
      class={cx(
        styles.card,
        isSelected && styles.selected,
        isDisabled && styles.disabled,
        state === 'hover' && styles.forceHover,
        state === 'focus' && styles.forceFocus,
        className,
      )}
      title={reason}
    >
      <input
        type="radio"
        class={styles.native}
        name={name}
        value={value}
        checked={isSelected}
        disabled={isDisabled}
        title={reason}
        onChange={() => onSelect?.(value)}
        {...data}
      />
      <Icon name={icon} size="sm" class={styles.icon} />
      <span class={styles.title}>{title}</span>
      {hint ? <span class={styles.hint}>{hint}</span> : null}
    </label>
  )
}
