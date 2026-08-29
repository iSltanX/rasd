import { cx } from '@/ui/cx'

import styles from './Spinner.module.css'

import type { JSX } from 'preact'

export type SpinnerSize = 's' | 'm' | 'l'
export type SpinnerTone = 'brand' | 'neutral' | 'inverse'

export interface SpinnerProps {
  size?: SpinnerSize
  tone?: SpinnerTone
  class?: string | undefined
  /** نصّ للقارئ الشاشة. الافتراضي عربي عام. */
  label?: string
}

/** `Spinner` — 9 variant: 3 مقاس × 3 درجة لون. */
export function Spinner({
  size = 'm',
  tone = 'brand',
  class: className,
  label,
}: SpinnerProps): JSX.Element {
  return (
    <span
      class={cx(styles.spinner, styles[`size-${size}`], styles[`tone-${tone}`], className)}
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" fill="none" class={styles.svg} aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" class={styles.track} stroke-width="2.5" />
        <circle
          cx="12"
          cy="12"
          r="9.5"
          class={styles.arc}
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </svg>
      <span class="rasd-sr-only">{label ?? 'جارٍ التحميل'}</span>
    </span>
  )
}
