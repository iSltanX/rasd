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

/**
 * `Tabs` — الشيفرة بلا حدّ عدد: تُخطِط فوق `items` أيًّا كان طولها، ولا شكل
 * فيها ولا في `Tabs.module.css` يفترض عددًا (تخطيط `inline-flex` بفجوة، لا
 * `grid-template-columns` بعدد ثابت).
 *
 * **محور Figma «Selected: 1 إلى 4» لا يوثِّق حدًّا في الشيفرة — بل حدًّا في
 * عدد الحالات التي رسمها المكوّن.** صفحة الإعدادات تستعمل خمسة تبويبات منذ
 * الوحدة 20.2 (المظهر + أربعة `§12`)، وهي انحرافٌ مُسجَّل لا صامت —
 * `Rasd_Plan.md §6` صفّ 111 — تحسمه الوحدة **26.1** بإضافة الحالة الخامسة
 * في Figma نفسه، لا بتقييد هذا المكوّن.
 */
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
