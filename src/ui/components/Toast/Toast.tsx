import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './Toast.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'
export type ToastAction = 'with-action' | 'plain'

export interface ToastProps {
  /** السطر الأوّل — ما حدث. */
  children: ComponentChildren
  /** سطر ثانٍ اختياري أخفّ — التفصيل أو الخطوة التالية. */
  detail?: ComponentChildren
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

/**
 * `Toast` — 8 variant: 4 درجة × إجراء/بلا إجراء، بمواصفة مكوّنه في Figma: سطح زجاجي،
 * ودائرة الدرجة، وسطران، وزرّ إجراء ثانوي، وإغلاق. ترتيب DOM هو ترتيب القراءة RTL:
 * الدائرة فالنصّ فالإجراء فالإغلاق.
 */
export function Toast({
  children,
  detail,
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
      <span class={styles.badge}>
        <Icon name={TONE_ICON[tone]} size="xs" />
      </span>
      <span class={styles.text}>
        <span class={cx(styles.title, 't-arabic-ui-s-strong')}>{children}</span>
        {detail ? <span class={cx(styles.detail, 't-arabic-ui-xs')}>{detail}</span> : null}
      </span>
      {action === 'with-action' && actionLabel ? (
        <button type="button" class={cx(styles.action, 't-arabic-ui-xs-strong')} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" class={styles.close} aria-label="إغلاق" onClick={onDismiss}>
          <Icon name="close" size="xs" />
        </button>
      ) : null}
    </div>
  )
}
