import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Chip.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ChipTone =
  | 'neutral'
  | 'brand'
  | 'capture'
  | 'annotate'
  | 'inspect'
  | 'measure'
  | 'success'
  | 'warning'
  | 'danger'
export type ChipStyleVariant = 'soft' | 'solid'

export interface ChipProps {
  children: ComponentChildren
  tone?: ChipTone
  style?: ChipStyleVariant
  icon?: IconName
  onRemove?: () => void
  class?: string | undefined
}

/** `Chip` — 18 variant: 9 درجة × 2 نمط. */
export function Chip({
  children,
  tone = 'neutral',
  style: styleVariant = 'soft',
  icon,
  onRemove,
  class: className,
}: ChipProps): JSX.Element {
  return (
    <span
      class={cx(styles.chip, styles[`tone-${tone}`], styles[`style-${styleVariant}`], className)}
    >
      {icon ? <Icon name={icon} size="xs" /> : null}
      <span class={styles.label}>{children}</span>
      {onRemove ? (
        <button type="button" class={styles.remove} onClick={onRemove} aria-label="إزالة الوسم">
          <Icon name="close" size="xs" />
        </button>
      ) : null}
    </span>
  )
}
