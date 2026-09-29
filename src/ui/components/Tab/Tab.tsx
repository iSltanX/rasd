import { cx } from '@/ui/cx'

import styles from './Tab.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type TabState = 'default' | 'hover' | 'selected' | 'focus'

export interface TabProps {
  label: string
  selected?: boolean
  /** حالة مفروضة للمعرض. */
  state?: TabState
  /** معرّف اللوح الذي يتحكّم به — يربط `aria-controls`. */
  controls?: string | undefined
  id?: string | undefined
  onClick?: (event: MouseEvent) => void
  class?: string | undefined
}

/**
 * `Tab` — تبويب مفرد بشكل الحبّة، 4 variant. يُركَّب أي عدد منه داخل `TabRow`، فلا
 * يتقيّد بأربعة تبويبات كمكوّن `Tabs` المسطَّر (`Docs/Engineering.md §6` الصفّ 111).
 * المحدَّد سطح `surface/brand-subtle` ووزن أثقل ولون `text/brand`.
 */
export function Tab({
  label,
  selected = false,
  state = 'default',
  controls,
  id,
  onClick,
  class: className,
}: TabProps): JSX.Element {
  const isSelected = selected || state === 'selected'
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={isSelected}
      aria-controls={controls}
      tabIndex={isSelected ? 0 : -1}
      class={cx(
        styles.tab,
        isSelected && styles.selected,
        state === 'hover' && styles.forceHover,
        state === 'focus' && styles.forceFocus,
        className,
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export interface TabRowProps {
  children: ComponentChildren
  'aria-label': string
  class?: string | undefined
}

/**
 * صفّ التبويبات: `tablist` بالأسهم. السهم الأيمن إلى السابق في RTL لأن السابق يمينًا،
 * و`Home`·`End` إلى الطرفين. التركيز ينتقل ولا يُفعَّل التبويب إلّا بالنقر أو الإدخال.
 */
export function TabRow({
  children,
  'aria-label': ariaLabel,
  class: className,
}: TabRowProps): JSX.Element {
  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    const isRtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = (delta: number) => tabs[(at + delta + tabs.length) % tabs.length]
    let next: HTMLButtonElement | undefined
    if (e.key === 'ArrowRight') next = step(isRtl ? -1 : 1)
    else if (e.key === 'ArrowLeft') next = step(isRtl ? 1 : -1)
    else if (e.key === 'Home') next = tabs[0]
    else if (e.key === 'End') next = tabs[tabs.length - 1]
    if (!next) return
    e.preventDefault()
    next.focus()
  }
  return (
    <div
      class={cx(styles.row, className)}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}
