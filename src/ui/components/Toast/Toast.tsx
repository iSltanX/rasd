import { IconButton } from '@/ui/components/IconButton/IconButton'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './Toast.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'
export type ToastAction = 'with-action' | 'plain'

export interface ToastProps {
  children: ComponentChildren
  tone?: ToastTone
  action?: ToastAction
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  class?: string | undefined
}

const TONE_ICON = {
  success: 'check',
  info: 'info',
  warning: 'alert',
  danger: 'alert',
} as const

/** `Toast` — 8 variant: 4 درجة × إجراء/بلا إجراء. */
export function Toast({
  children,
  tone = 'success',
  action = 'plain',
  actionLabel,
  onAction,
  onDismiss,
  class: className,
}: ToastProps): JSX.Element {
  return (
    <div
      class={cx(styles.toast, styles[`tone-${tone}`], className)}
      role="status"
      aria-live="polite"
    >
      <Icon name={TONE_ICON[tone]} size="sm" class={styles.icon} />
      <span class={styles.message}>{children}</span>
      {action === 'with-action' && actionLabel ? (
        <button type="button" class={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <IconButton icon="close" size="s" aria-label="إغلاق" onClick={onDismiss} />
      ) : null}
    </div>
  )
}
