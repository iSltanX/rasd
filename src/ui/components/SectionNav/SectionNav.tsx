import { NavItem } from '@/ui/components/NavItem/NavItem'
import { cx } from '@/ui/cx'

import styles from './SectionNav.module.css'

import type { IconName } from '@/ui/icons/Icon'
import type { JSX } from 'preact'

export interface SectionNavEntry {
  id: string
  label: string
  icon: IconName
}

export interface SectionNavProps {
  entries: readonly SectionNavEntry[]
  activeId: string
  onSelect: (id: string) => void
  'aria-label': string
  class?: string | undefined
}

/**
 * `Section Nav` — تنقّل أقسام الإعدادات عموديًّا، يسع الأقسام كلّها بدل شريط تبويبات
 * أفقي محدود (`Docs/Design.md` §7 القرار 15). القسم النشط `aria-current`.
 */
export function SectionNav({
  entries,
  activeId,
  onSelect,
  'aria-label': ariaLabel,
  class: className,
}: SectionNavProps): JSX.Element {
  return (
    <nav class={cx(styles.nav, className)} aria-label={ariaLabel}>
      {entries.map((entry) => (
        <NavItem
          key={entry.id}
          icon={entry.icon}
          label={entry.label}
          active={entry.id === activeId}
          onClick={() => onSelect(entry.id)}
        />
      ))}
    </nav>
  )
}
