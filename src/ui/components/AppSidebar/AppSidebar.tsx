import { Button } from '@/ui/components/Button/Button'
import { Footer } from '@/ui/components/Footer/Footer'
import { NavItem } from '@/ui/components/NavItem/NavItem'
import { StorageMeter } from '@/ui/components/StorageMeter/StorageMeter'
import { cx } from '@/ui/cx'
import { RasdLockup } from '@/ui/RasdMark'

import styles from './AppSidebar.module.css'

import type { IconName } from '@/ui/icons/Icon'
import type { JSX } from 'preact'

export interface SidebarEntry {
  id: string
  icon: IconName
  label: string
  count?: number | undefined
  href?: string | undefined
  onClick?: (() => void) | undefined
}

export interface SidebarGroup {
  /** عنوان المجموعة — المجموعة الأولى بلا عنوان. */
  title?: string | undefined
  entries: readonly SidebarEntry[]
}

export interface AppSidebarProps {
  groups: readonly SidebarGroup[]
  /** العنصر الحالي، ويُطابَق بـ`id` في المجموعات والعنصر السفلي. */
  activeId?: string | undefined
  /** الإجراء الأساسي أعلى الشريط. غيابه يُخفي الزرّ — لا زرّ بلا محرّك. */
  primaryAction?: { label: string; icon: IconName; onClick: () => void } | undefined
  storage: { usage: number | null; quota: number | null }
  /** عنصر الإعدادات أسفل الشريط. */
  settings: SidebarEntry
  /** وجهة الشعار — المكتبة. */
  homeHref?: string | undefined
  class?: string | undefined
}

/**
 * `App Sidebar` — الشريط الجانبي لصفحات الإضافة: الشعار، والإجراء الأساسي، ومجموعات
 * التنقّل، ثمّ في الأسفل مؤشّر المساحة والإعدادات والتذييل. لا حساب ولا «مساحة عمل»:
 * المنتج محلّي (`Docs/Design.md` §7 القرار 1). يقف في بداية الصفحة — يمينًا في RTL.
 */
export function AppSidebar({
  groups,
  activeId,
  primaryAction,
  storage,
  settings,
  homeHref,
  class: className,
}: AppSidebarProps): JSX.Element {
  const item = (entry: SidebarEntry) => (
    <NavItem
      key={entry.id}
      icon={entry.icon}
      label={entry.label}
      count={entry.count}
      active={entry.id === activeId}
      {...(entry.href ? { href: entry.href } : {})}
      {...(entry.onClick ? { onClick: entry.onClick } : {})}
    />
  )
  return (
    <aside class={cx(styles.sidebar, className)}>
      <div class={styles.top}>
        <a class={styles.brand} href={homeHref} aria-label="رصد — المكتبة">
          <RasdLockup size="xl" />
        </a>
        {primaryAction ? (
          <Button
            variant="primary"
            size="m"
            icon={primaryAction.icon}
            class={styles.primary}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        ) : null}
        <nav class={styles.nav} aria-label="المكتبة">
          {groups.map((group, i) => (
            <div class={styles.group} key={group.title ?? `group-${i}`}>
              {group.title ? <p class={styles.groupTitle}>{group.title}</p> : null}
              {group.entries.map(item)}
            </div>
          ))}
        </nav>
      </div>
      <div class={styles.bottom}>
        <StorageMeter usage={storage.usage} quota={storage.quota} />
        {item(settings)}
        <Footer layout="stacked" />
      </div>
    </aside>
  )
}
