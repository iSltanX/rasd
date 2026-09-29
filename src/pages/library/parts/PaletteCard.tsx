/**
 * بطاقة شبكة المكتبة — لوحة ألوان واحدة.
 *
 * حالة `selectionMode` تُقرَّر بمركز الحالة (`Library.tsx`، `selection.size
 * > 0`) لا محليًّا: عندها كل بطاقة تُظهر مربّع اختيارها وتُبدِّل بدل أن
 * تفتح — سلوكٌ موحَّد لا يختلف من بطاقة لأخرى وسط تحديد جارٍ. راجع
 * `Card.tsx` (بطاقة اللقطات) — نفس البنية والسلوك حرفيًا لسجلّ مختلف.
 */

import { formatHuman, formatRelativeTime, plural } from '@/shared/bidi/numerals'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './PaletteCard.module.css'
import chrome from './SimpleCard.module.css'

import type { PaletteRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/**
 * أقصى عدد مربّعات لونية تُعرض في الشريط. تجاوزها يُستبدل بمؤشّر «+N» نصّي
 * بدل ازدحام الشريط — البطاقة معاينة لا عرض كامل للوحة.
 */
const MAX_SWATCHES = 8

export interface PaletteCardProps {
  record: PaletteRecord
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  now?: number | undefined
}

export function PaletteCard({
  record,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  now = Date.now(),
}: PaletteCardProps): JSX.Element {
  const activate = () => (selectionMode ? onToggleSelect(record.id) : onOpen(record.id))

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  const shown = record.colors.slice(0, MAX_SWATCHES)
  const extra = record.colors.length - shown.length
  const colorCountText = plural(record.colors.length, 'لون', 'لونين', 'ألوان')

  return (
    <button
      type="button"
      class={cx(chrome.card, selected && chrome.selected)}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-pressed={selectionMode ? selected : undefined}
      data-palette-id={record.id}
    >
      <span class={cx(chrome.media, styles.media)}>
        {shown.length > 0 ? (
          <span class={styles.strip} aria-hidden="true">
            {shown.map((hex, i) => (
              <span key={i} class={styles.swatch} style={{ backgroundColor: hex }} />
            ))}
            {extra > 0 ? <span class={styles.more}>+{formatHuman(extra)}</span> : null}
          </span>
        ) : (
          <Icon name="palette" size="xl" class={chrome.fallback} />
        )}
        <span
          class={cx(chrome.checkboxWrap, selectionMode && chrome.checkboxVisible)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected ? 'on' : 'off'}
            onChange={() => onToggleSelect(record.id)}
            aria-label={selected ? 'إلغاء تحديد اللوحة' : 'تحديد اللوحة'}
          />
        </span>
      </span>
      <span class={cx(chrome.body, styles.body)}>
        <span class={cx(chrome.title, 't-arabic-ui-m-strong')}>{record.name}</span>
        <span class={cx(chrome.row, 't-arabic-ui-xs')}>
          <span class={chrome.sub}>{colorCountText}</span>
          <span class={chrome.time}>{formatRelativeTime(record.createdAt, now)}</span>
        </span>
      </span>
    </button>
  )
}
