import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Button.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 's' | 'm' | 'l'
export type ButtonState = 'default' | 'hover' | 'pressed' | 'disabled' | 'focused' | 'loading'

export interface ButtonProps {
  children: ComponentChildren
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * حالة مفروضة للعرض الثابت (المعرض، لقطات الانحدار). التفاعل الحقيقي
   * (hover/pressed/focus) يأتي من CSS `:hover`/`:active`/`:focus-visible` —
   * هذا الخيار لا يمنعها، بل يضيف تراكبًا فوقها للعرض التوضيحي فقط.
   */
  state?: ButtonState
  icon?: IconName
  iconPosition?: 'start' | 'end'
  type?: 'button' | 'submit'
  onClick?: (event: MouseEvent) => void
  class?: string | undefined
  'aria-label'?: string
  /** لزرّ يفتح لوحة ويغلقها. */
  'aria-expanded'?: boolean | undefined
  /**
   * تلميحٌ بعد النصّ خارج كتلته — مفتاح اختصار مثلًا (`<KeyCap>`). خارج كتلة النصّ كي يبقى
   * نصّ الزرّ نصَّه وحده لمن يقرؤه.
   */
  trailing?: ComponentChildren
}

/** `Button` — 72 variant: 4 نمط × 3 مقاس × 6 حالة. */
export function Button({
  children,
  variant = 'primary',
  size = 's',
  state = 'default',
  icon,
  iconPosition = 'start',
  type = 'button',
  onClick,
  class: className,
  trailing,
  ...aria
}: ButtonProps): JSX.Element {
  const disabled = state === 'disabled'
  const loading = state === 'loading'
  const forcedPressed = state === 'pressed'
  const forcedHover = state === 'hover'
  const forcedFocus = state === 'focused'

  const iconSize = size === 'l' ? 'md' : 'sm'

  return (
    <button
      type={type}
      class={cx(
        styles.button,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        forcedHover && styles.forceHover,
        forcedPressed && styles.forcePressed,
        forcedFocus && styles.forceFocus,
        loading && styles.loading,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      onClick={onClick}
      {...aria}
    >
      {loading ? (
        <span class={styles.spinnerSlot} aria-hidden="true">
          <Spinner
            size={size === 'l' ? 'm' : 's'}
            tone={variant === 'primary' ? 'inverse' : 'brand'}
          />
        </span>
      ) : null}
      <span class={cx(styles.content, loading && styles.contentHidden)}>
        {icon && iconPosition === 'start' ? <Icon name={icon} size={iconSize} /> : null}
        <span class={styles.label}>{children}</span>
        {icon && iconPosition === 'end' ? <Icon name={icon} size={iconSize} /> : null}
      </span>
      {trailing ?? null}
    </button>
  )
}
