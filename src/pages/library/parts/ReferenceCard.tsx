/**
 * بطاقة شبكة المكتبة — مرجع تصميم واحد (`ReferenceRecord`).
 *
 * لا مصغَّرة تُعرض من `blobId` هنا — خارج نطاق هذه البطاقة، فأيقونة 'overlay'
 * تكفي بديلًا مرئيًا ثابتًا (قِس على `Card.tsx` حين لا تتوفّر مصغَّرة للقطة).
 *
 * حالة `selectionMode` تُقرَّر بمركز الحالة لا محليًّا، تمامًا كما في `Card.tsx`.
 */

import { formatRelativeTime } from '@/shared/bidi/numerals'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { Chip } from '@/ui/components/Chip/Chip'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './ReferenceCard.module.css'

import type { SimpleCardProps } from './SimpleGrid'
import type { ReferenceRecord, Viewport } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const VIEWPORT_LABEL: Record<Viewport, string> = {
  desktop: 'سطح المكتب',
  tablet: 'جهاز لوحي',
  phone: 'هاتف',
  custom: 'مخصّص',
}

export interface ReferenceCardProps extends SimpleCardProps<ReferenceRecord> {
  now?: number | undefined
}

export function ReferenceCard({
  record,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  now = Date.now(),
}: ReferenceCardProps): JSX.Element {
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
      data-reference-id={record.id}
    >
      <span class={styles.thumb}>
        <Icon name="overlay" size="xl" class={styles.thumbFallback} />
        <span
          class={cx(styles.checkboxWrap, selectionMode && styles.checkboxVisible)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected ? 'on' : 'off'}
            onChange={() => onToggleSelect(record.id)}
            aria-label={selected ? 'إلغاء تحديد المرجع' : 'تحديد المرجع'}
          />
        </span>
      </span>
      <span class={styles.title}>
        <bdi dir="ltr">{record.origin}</bdi>
      </span>
      <span class={styles.path}>
        <bdi dir="ltr">{record.path}</bdi>
      </span>
      <span class={styles.meta}>
        <Chip>{VIEWPORT_LABEL[record.viewport]}</Chip>
        <span class={styles.time}>{formatRelativeTime(record.createdAt, now)}</span>
      </span>
    </button>
  )
}
