import { cx } from '@/ui/cx'

import styles from './Tabs.module.css'

import type { JSX } from 'preact'

export interface TabItem {
  value: string
  label: string
}

export interface TabsProps {
  items: readonly TabItem[]
  /** الفهرس المحدَّد — يطابق محور Figma `Selected: 1 | 2 | 3 | 4`. */
  selected?: number
  onChange?: (index: number) => void
  class?: string | undefined
}

/** `Tabs` — 4 variant: التبويب المحدَّد 1 إلى 4. */
export function Tabs({ items, selected = 0, onChange, class: className }: TabsProps): JSX.Element {
  const move = (from: number, delta: number) => {
    const next = (from + delta + items.length) % items.length
    onChange?.(next)
  }

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    // `currentTarget.dir` يعكس خاصية `dir` على العنصر نفسه فقط، لا الاتجاه
    // المُورَّث من `<html dir="rtl">` — يبقى فارغًا دومًا في الاستخدام
    // الفعلي فيُسقط عكس اتجاه الأسهم صامتًا. `getComputedStyle` يقرأ
    // الاتجاه الفعلي بعد التوريث.
    const isRtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    if (e.key === 'ArrowRight') move(selected, isRtl ? -1 : 1)
    else if (e.key === 'ArrowLeft') move(selected, isRtl ? 1 : -1)
    else if (e.key === 'Home') onChange?.(0)
    else if (e.key === 'End') onChange?.(items.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div class={cx(styles.list, className)} role="tablist" onKeyDown={onKeyDown}>
      {items.map((item, i) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={`rasd-tab-${item.value}`}
          aria-selected={i === selected}
          aria-controls={`rasd-panel-${item.value}`}
          tabIndex={i === selected ? 0 : -1}
          class={cx(styles.tab, i === selected && styles.active)}
          onClick={() => onChange?.(i)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
