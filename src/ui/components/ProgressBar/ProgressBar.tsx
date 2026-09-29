import { cx } from '@/ui/cx'

import styles from './ProgressBar.module.css'

import type { JSX } from 'preact'

export type ProgressBarTone = 'primary' | 'warning' | 'danger'

export interface ProgressBarProps {
  /** 0–100. */
  value: number
  label?: string
  class?: string | undefined
  /**
   * درجة تعبئة الشريط — `primary` افتراضًا (لون الأداة، كما كانت التعبئة
   * دومًا). `Docs/Engineering.md §6` صفّ 73: `Figma` لا يُظهر تنويعة درجة لهذا
   * المكوّن، فـ`warning`/`danger` أُضيفا لحاجة منتجية حقيقية (حالتا تحذير
   * ومنع `QuotaIndicator`) لا اختراعًا — والافتراضي يُبقي كل مستهلك آخر بلا
   * أثر.
   */
  tone?: ProgressBarTone
}

/** `Progress Bar` — 4 variant: قيم 0 · 35 · 65 · 100. */
export function ProgressBar({
  value,
  label,
  class: className,
  tone = 'primary',
}: ProgressBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div
      class={cx(styles.track, styles[`tone-${tone}`], className)}
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
