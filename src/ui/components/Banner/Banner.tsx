import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './Banner.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type BannerTone = 'info' | 'warning' | 'danger' | 'success'

export interface BannerProps {
  children: ComponentChildren
  tone?: BannerTone
  onDismiss?: () => void
  class?: string | undefined
}

const TONE_ICON = { info: 'info', warning: 'alert', danger: 'alert', success: 'check' } as const

/** `Banner` — 4 variant: درجة واحدة لكل من info/warning/danger/success. */
export function Banner({
  children,
  tone = 'info',
  onDismiss,
  class: className,
}: BannerProps): JSX.Element {
  return (
    <div class={cx(styles.banner, styles[`tone-${tone}`], className)} role="status">
      <Icon name={TONE_ICON[tone]} size="sm" class={styles.icon} />
      <span class={styles.message}>{children}</span>
      {onDismiss ? (
        <button type="button" class={styles.dismiss} onClick={onDismiss} aria-label="إغلاق">
          <Icon name="close" size="xs" />
        </button>
      ) : null}
    </div>
  )
}
