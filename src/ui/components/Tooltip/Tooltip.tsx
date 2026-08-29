import { cx } from '@/ui/cx'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './Tooltip.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'
export type TooltipType = 'plain' | 'shortcut'

export interface TooltipProps {
  children: ComponentChildren
  side?: TooltipSide
  type?: TooltipType
  shortcut?: string
  class?: string | undefined
  /** للمعرض: يُثبَّت مفتوحًا للعرض الثابت بدل انتظار hover. */
  forceOpen?: boolean
}

/**
 * `Tooltip` — 8 variant: 4 جهة × 2 نوع.
 *
 * `left`/`right` في Figma تصبح `start`/`end` منطقيًا — الجهة نفسها تنعكس
 * تلقائيًا بين RTL وLTR.
 */
export function Tooltip({
  children,
  side = 'top',
  type = 'plain',
  shortcut,
  class: className,
  forceOpen,
}: TooltipProps): JSX.Element {
  const logicalSide = side === 'left' ? 'start' : side === 'right' ? 'end' : side

  return (
    <span
      role="tooltip"
      class={cx(styles.tooltip, styles[`side-${logicalSide}`], forceOpen && styles.open, className)}
    >
      <span class={styles.content}>{children}</span>
      {type === 'shortcut' && shortcut ? <KeyCap>{shortcut}</KeyCap> : null}
    </span>
  )
}
