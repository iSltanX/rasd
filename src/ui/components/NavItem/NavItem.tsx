import { formatHuman } from '@/shared/bidi'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './NavItem.module.css'

import type { JSX } from 'preact'

export type NavItemState = 'default' | 'hover' | 'active' | 'focus'

export interface NavItemProps {
  icon: IconName
  label: string
  /** العدّاد اختياري، ويُعرض بالأرقام الهندية لأنه عدّ بشري. */
  count?: number | undefined
  /** العنصر الحالي في تنقّله — يُعلَن `aria-current` لا بالّلون وحده. */
  active?: boolean
  /** حالة مفروضة للمعرض (`hover` و`focus`)؛ في الصفحات تأتي من المؤشّر والتركيز. */
  state?: NavItemState
  /** رابط لصفحة أخرى، وإلّا فزرّ داخل الصفحة. */
  href?: string
  onClick?: (event: MouseEvent) => void
  class?: string | undefined
}

/**
 * `Nav Item` — 8 variant: العدّاد × 4 حالة. عنصر تنقّل في الشريط الجانبي وتنقّل
 * الأقسام: الأيقونة والعنوان في بداية السطر (يمينًا في RTL) والعدّاد في نهايته.
 *
 * النشط يُعلَن بثلاث إشارات لا بواحدة: سطح `surface/brand-subtle`، ووزن أثقل، ولون
 * `text/brand` — فيبقى مفهومًا لمن لا يميّز الألوان.
 */
export function NavItem({
  icon,
  label,
  count,
  active = false,
  state = 'default',
  href,
  onClick,
  class: className,
}: NavItemProps): JSX.Element {
  const isActive = active || state === 'active'
  const classes = cx(
    styles.item,
    isActive && styles.active,
    state === 'hover' && styles.forceHover,
    state === 'focus' && styles.forceFocus,
    className,
  )
  const content = (
    <>
      <span class={styles.labelGroup}>
        <Icon name={icon} size="sm" />
        <span class={styles.label}>{label}</span>
      </span>
      {count === undefined ? null : <span class={styles.count}>{formatHuman(count)}</span>}
    </>
  )
  const current = isActive ? 'page' : undefined

  return href ? (
    <a class={classes} href={href} aria-current={current} onClick={onClick}>
      {content}
    </a>
  ) : (
    <button type="button" class={classes} aria-current={current} onClick={onClick}>
      {content}
    </button>
  )
}
