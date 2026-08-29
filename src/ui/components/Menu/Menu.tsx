import { useEffect, useRef } from 'preact/hooks'

import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Menu.module.css'

import type { JSX } from 'preact'

export interface MenuItem {
  value: string
  label: string
  icon?: IconName
  disabled?: boolean
}

export interface MenuSection {
  title?: string
  items: readonly MenuItem[]
}

export type MenuType = 'default' | 'with-sections'

export interface MenuProps {
  sections: readonly MenuSection[]
  type?: MenuType
  onSelect?: (value: string) => void
  onClose?: () => void
  class?: string | undefined
}

/**
 * `Menu` — 2 variant: بلا أقسام أو بأقسام.
 *
 * إدارة تركيز كاملة: يفتح مركِّزًا على أول عنصر، الأسهم تنقل بين العناصر
 * القابلة للتفعيل متجاوزةً المعطَّلة، و`Esc` يغلق ويعيد التركيز إلى المُطلِق.
 */
export function Menu({ sections, onSelect, onClose, class: className }: MenuProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)

  const flatItems = sections.flatMap((s) => s.items)

  useEffect(() => {
    const first = rootRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    )
    first?.focus()
  }, [])

  const focusIndex = (index: number) => {
    const enabled = flatItems.filter((i) => !i.disabled)
    if (enabled.length === 0) return
    const target = enabled[((index % enabled.length) + enabled.length) % enabled.length]
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-value="${target?.value}"]`)
    el?.focus()
  }

  const currentEnabledIndex = () => {
    const active = document.activeElement as HTMLElement | null
    const value = active?.dataset.value
    return flatItems.filter((i) => !i.disabled).findIndex((i) => i.value === value)
  }

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      focusIndex(currentEnabledIndex() + 1)
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      focusIndex(currentEnabledIndex() - 1)
      e.preventDefault()
    } else if (e.key === 'Home') {
      focusIndex(0)
      e.preventDefault()
    } else if (e.key === 'End') {
      focusIndex(-1)
      e.preventDefault()
    } else if (e.key === 'Escape') {
      onClose?.()
      e.preventDefault()
    }
  }

  return (
    <div ref={rootRef} class={cx(styles.menu, className)} role="menu" onKeyDown={onKeyDown}>
      {sections.map((section, si) => (
        <div
          key={section.title ?? `section-${si}`}
          class={styles.section}
          role="group"
          aria-label={section.title}
        >
          {section.title ? <div class={styles.sectionTitle}>{section.title}</div> : null}
          {section.items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitem"
              data-value={item.value}
              disabled={item.disabled}
              aria-disabled={item.disabled ? 'true' : undefined}
              tabIndex={-1}
              class={styles.item}
              onClick={() => !item.disabled && onSelect?.(item.value)}
            >
              {item.icon ? <Icon name={item.icon} size="sm" /> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
