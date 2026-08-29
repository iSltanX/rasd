import { cx } from '@/ui/cx'

import styles from './Avatar.module.css'

import type { JSX } from 'preact'

export type AvatarSize = 'xs' | 's' | 'm' | 'l'
export type AvatarType = 'initials' | 'colour'

export interface AvatarProps {
  name: string
  size?: AvatarSize
  type?: AvatarType
  /** لون خلفية ثابت لنمط `colour` — يُختار من سلّم اللون لا حرفيًا. */
  hue?: 'capture' | 'annotate' | 'inspect' | 'measure' | 'compare'
  class?: string | undefined
}

/** يستخرج أول حرفين — يعمل مع العربية والإنجليزية بلا افتراض لاتيني. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  const first = [...(parts[0] ?? '')][0] ?? ''
  const second = parts.length > 1 ? ([...(parts[1] ?? '')][0] ?? '') : ''
  return (first + second).toUpperCase()
}

/** `Avatar` — 8 variant: 4 مقاس × 2 نوع. */
export function Avatar({
  name,
  size = 'm',
  type = 'initials',
  hue = 'capture',
  class: className,
}: AvatarProps): JSX.Element {
  return (
    <span
      class={cx(styles.avatar, styles[`size-${size}`], styles[`hue-${hue}`], className)}
      title={name}
      role="img"
      aria-label={name}
    >
      {type === 'initials' ? initialsOf(name) : null}
    </span>
  )
}
