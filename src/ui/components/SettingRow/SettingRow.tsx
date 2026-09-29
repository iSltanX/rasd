import { cx } from '@/ui/cx'

import styles from './SettingRow.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface SettingRowProps {
  label: string
  hint?: ComponentChildren
  /** الضابط: `Toggle` أو `Select` أو `KeyCap` أو `Chip` أو زرّ — أو لا شيء. */
  control?: ComponentChildren
  divider?: boolean
  /**
   * أساس المعرّفين `${id}-label` و`${id}-hint`، فيربط الضابط نفسه بهما عبر
   * `aria-labelledby` و`aria-describedby` — العنوان المرئي هو الاسم المقروء.
   */
  id?: string | undefined
  class?: string | undefined
}

/**
 * `Setting Row` — 12 variant: الضابط × الفاصل. العنوان والتلميح في بداية السطر
 * (يمينًا في RTL)، والضابط الواحد في نهايته (يسارًا) كما في الإطار.
 */
export function SettingRow({
  label,
  hint,
  control,
  divider = false,
  id,
  class: className,
}: SettingRowProps): JSX.Element {
  return (
    <div class={cx(styles.row, divider && styles.divider, className)}>
      <div class={styles.text}>
        <span class={styles.label} id={id ? `${id}-label` : undefined}>
          {label}
        </span>
        {hint ? (
          <span class={styles.hint} id={id ? `${id}-hint` : undefined}>
            {hint}
          </span>
        ) : null}
      </div>
      {control ? <div class={styles.control}>{control}</div> : null}
    </div>
  )
}
