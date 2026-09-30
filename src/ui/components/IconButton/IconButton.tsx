import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './IconButton.module.css'

import type { JSX } from 'preact'

export type IconButtonVariant = 'ghost' | 'solid'
export type IconButtonSize = 's' | 'm' | 'l'
export type IconButtonState = 'default' | 'hover' | 'pressed' | 'disabled' | 'focused' | 'selected'

export interface IconButtonProps {
  icon: IconName
  /** إلزامي — الأيقونة وحدها بلا نصّ تحتاج اسمًا لقارئ الشاشة. */
  'aria-label': string
  variant?: IconButtonVariant
  size?: IconButtonSize
  state?: IconButtonState
  onClick?: (event: MouseEvent) => void
  class?: string | undefined
}

/** `Icon Button` — 36 variant: 2 نمط × 3 مقاس × 6 حالة. */
export function IconButton({
  icon,
  'aria-label': ariaLabel,
  variant = 'ghost',
  size = 's',
  state = 'default',
  onClick,
  class: className,
}: IconButtonProps): JSX.Element {
  const disabled = state === 'disabled'
  const selected = state === 'selected'
  // مقاس الأيقونة من مكوّن `Icon Button` (`45:122`): S ← 16 · M ← 20 · L ← 20. كان M يأخذ 16 فصغُرت
  // كل أيقونة في زرّ M (الإعدادات في النافذة، وإغلاق الحوارات) عن إطارها (`STAGES/04`).
  const iconSize = size === 's' ? 'sm' : 'md'

  return (
    <button
      type="button"
      class={cx(
        styles.button,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        state === 'hover' && styles.forceHover,
        state === 'pressed' && styles.forcePressed,
        state === 'focused' && styles.forceFocus,
        selected && styles.selected,
        className,
      )}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
