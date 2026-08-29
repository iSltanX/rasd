import { cx } from '@/ui/cx'

import styles from './ProgressBar.module.css'

import type { JSX } from 'preact'

export interface ProgressBarProps {
  /** 0–100. */
  value: number
  label?: string
  class?: string | undefined
}

/** `Progress Bar` — 4 variant: قيم 0 · 35 · 65 · 100. */
export function ProgressBar({ value, label, class: className }: ProgressBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div
      class={cx(styles.track, className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(label ? { 'aria-label': label } : {})}
    >
      <div class={styles.fill} style={{ inlineSize: `${clamped}%` }} />
    </div>
  )
}
