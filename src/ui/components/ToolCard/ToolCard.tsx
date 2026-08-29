import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './ToolCard.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ToolCardTool = 'capture' | 'inspect'
export type ToolCardState = 'default' | 'hover' | 'pressed' | 'focused' | 'selected' | 'disabled'

export interface ToolCardProps {
  icon: IconName
  title: string
  hint?: ComponentChildren
  tool?: ToolCardTool
  state?: ToolCardState
  onClick?: () => void
  class?: string | undefined
}

/**
 * `Tool Card` — 12 variant: 2 أداة × 6 حالة.
 *
 * **قاعدة تداخل نصف القطر:** البطاقة `radius/lg` (12px) بحشوة `space/8`،
 * فأيقونتها الداخلية `radius/md` (8px) — الداخلي = الخارجي − الحشوة، لا نصفا
 * قطر متطابقان متداخلان.
 */
export function ToolCard({
  icon,
  title,
  hint,
  tool = 'capture',
  state = 'default',
  onClick,
  class: className,
}: ToolCardProps): JSX.Element {
  const disabled = state === 'disabled'
  const selected = state === 'selected'

  return (
    <button
      type="button"
      class={cx(
        styles.card,
        styles[`tool-${tool}`],
        state === 'hover' && styles.forceHover,
        state === 'pressed' && styles.forcePressed,
        state === 'focused' && styles.forceFocus,
        selected && styles.selected,
        className,
      )}
      disabled={disabled}
      aria-pressed={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span class={styles.iconWrap}>
        <Icon name={icon} size="md" />
      </span>
      <span class={styles.body}>
        <span class={styles.title}>{title}</span>
        {hint ? <span class={styles.hint}>{hint}</span> : null}
      </span>
    </button>
  )
}
