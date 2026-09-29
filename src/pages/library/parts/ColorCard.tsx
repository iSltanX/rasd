/**
 * بطاقة شبكة المكتبة — لون واحد (`ColorRecord`).
 *
 * تتبع بنية `Card.tsx` (بطاقة اللقطات) حرفيًّا: زرّ قابل للنقر، مربّع
 * اختيار يظهر عند hover أو selectionMode، عنوان، سطر معلومات ثانوي. حالة
 * `selectionMode` تُقرَّر بمركز الحالة لا محليًّا — انظر تعليق `Card.tsx`.
 */

import { formatRelativeTime } from '@/shared/bidi/numerals'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { Chip } from '@/ui/components/Chip/Chip'
import { cx } from '@/ui/cx'

import styles from './ColorCard.module.css'
import chrome from './SimpleCard.module.css'

import type { ColorRecord, ColorSource } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const SOURCE_LABEL: Record<ColorSource, string> = {
  pixel: 'بكسل',
  css: 'CSS',
  manual: 'يدوي',
}

export interface ColorCardProps {
  record: ColorRecord
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  now?: number | undefined
}

export function ColorCard({
  record,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  now = Date.now(),
}: ColorCardProps): JSX.Element {
  const activate = () => (selectionMode ? onToggleSelect(record.id) : onOpen(record.id))

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  return (
    <button
      type="button"
      class={cx(chrome.card, selected && chrome.selected)}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-pressed={selectionMode ? selected : undefined}
      data-color-id={record.id}
    >
      <span class={cx(chrome.media, styles.media)} style={{ backgroundColor: record.hex }}>
        <span
          class={cx(chrome.checkboxWrap, selectionMode && chrome.checkboxVisible)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected ? 'on' : 'off'}
            onChange={() => onToggleSelect(record.id)}
            aria-label={selected ? 'إلغاء تحديد اللون' : 'تحديد اللون'}
          />
        </span>
      </span>
      <span class={chrome.body}>
        <span class={cx(chrome.title, 't-arabic-ui-s-strong')}>
          {record.name || <bdi dir="ltr">{record.hex}</bdi>}
        </span>
        <span class={cx(chrome.row, 't-arabic-ui-xs')}>
          <Chip tone="neutral">{SOURCE_LABEL[record.source]}</Chip>
          <span class={chrome.time}>{formatRelativeTime(record.createdAt, now)}</span>
        </span>
      </span>
    </button>
  )
}
