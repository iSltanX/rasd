/**
 * شبكة بسيطة — بلا تمرير افتراضي، للتبويبات الأربعة غير اللقطات.
 *
 * `Grid.tsx` (المرحلة 18، الدفعة الرابعة) افتراضيّ عمدًا لأن اللقطات وحدها
 * قد تبلغ الآلاف. الألوان واللوحات والمراجع والأدلة مجموعات أصغر بطبيعتها
 * (تُنشأ يدويًّا لا بالتقاط جماعي) — فشبكة CSS عادية تكفي، وتفادي تعقيد
 * القياس والتمرير الافتراضي حيث لا حاجة له اختيارٌ لا نقص.
 *
 * عامّة على نوع السجلّ ومكوّن البطاقة معًا — لا تكرار لمنطق «حاوية + دور
 * القائمة + تمرير خصائص التحديد» أربع مرّات بأربعة أنواع مختلفة.
 */

import styles from './SimpleGrid.module.css'

import type { JSX } from 'preact'

export interface SimpleCardProps<T> {
  record: T
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
}

export interface SimpleGridProps<T extends { id: string }> {
  records: readonly T[]
  selection: ReadonlySet<string>
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  CardComponent: (props: SimpleCardProps<T>) => JSX.Element
  'aria-label': string
}

export function SimpleGrid<T extends { id: string }>({
  records,
  selection,
  onToggleSelect,
  onOpen,
  CardComponent,
  'aria-label': ariaLabel,
}: SimpleGridProps<T>): JSX.Element {
  return (
    <div class={styles.grid} role="list" aria-label={ariaLabel}>
      {records.map((record) => (
        <div role="listitem" key={record.id}>
          <CardComponent
            record={record}
            selectionMode={selection.size > 0}
            selected={selection.has(record.id)}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  )
}
