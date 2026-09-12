/**
 * بطاقة شبكة المكتبة — لقطة واحدة.
 *
 * حالة `selectionMode` تُقرَّر بمركز الحالة (`Library.tsx`، `selection.size
 * > 0`) لا محليًّا: عندها كل بطاقة تُظهر مربّع اختيارها وتُبدِّل بدل أن
 * تفتح — سلوكٌ موحَّد لا يختلف من بطاقة لأخرى وسط تحديد جارٍ.
 */

import { formatRelativeTime } from '@/shared/bidi/numerals'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Card.module.css'

import type { CaptureKind, CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const KIND_ICON: Record<CaptureKind, IconName> = {
  area: 'capture-area',
  element: 'capture-element',
  viewport: 'capture-viewport',
  'full-page': 'capture-full',
  window: 'capture-window',
}

export interface CardProps {
  record: CaptureRecord
  /** `null` يعني «لا مصغَّرة بعد» — تُعرض أيقونة النوع بدلها لا فراغ. */
  thumbnailUrl: string | null
  projectName: string | null
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  now?: number | undefined
}

export function Card({
  record,
  thumbnailUrl,
  projectName,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  now = Date.now(),
}: CardProps): JSX.Element {
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
      class={cx(styles.card, selected && styles.selected)}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-pressed={selectionMode ? selected : undefined}
      data-capture-id={record.id}
    >
      <span class={styles.thumb}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" class={styles.thumbImg} />
        ) : (
          <Icon name={KIND_ICON[record.kind]} size="xl" class={styles.thumbFallback} />
        )}
        {record.favorite ? (
          <span class={styles.favoriteBadge}>
            <Icon name="star" size="xs" title="مفضَّلة" />
          </span>
        ) : null}
        <span
          class={cx(styles.checkboxWrap, selectionMode && styles.checkboxVisible)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected ? 'on' : 'off'}
            onChange={() => onToggleSelect(record.id)}
            aria-label={selected ? 'إلغاء تحديد اللقطة' : 'تحديد اللقطة'}
          />
        </span>
      </span>
      <span class={styles.title}>{record.title || record.url}</span>
      <span class={styles.meta}>
        {formatRelativeTime(record.createdAt, now)}
        {projectName ? ` · ${projectName}` : ''}
      </span>
    </button>
  )
}
