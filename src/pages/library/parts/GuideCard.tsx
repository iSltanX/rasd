/**
 * بطاقة شبكة المكتبة — دليل واحد.
 *
 * تتبع بنية `Card.tsx` (بطاقة اللقطات) حرفيًّا: زرّ قابل للنقر، مربّع اختيار
 * يظهر عند hover أو `selectionMode`، عنوان، سطر معلومات. الفرق أن الدليل لا
 * مصغَّرة له — أيقونة كبيرة ثابتة (`list-view`، دليل خطوات = قائمة مرقَّمة)
 * تشغل مكان الصورة دائمًا، ولا حقل `favorite` في `GuideRecord` فلا شارة.
 *
 * حالة `selectionMode` تُقرَّر بمركز الحالة (`Library.tsx`، عبر `SimpleGrid`)
 * لا محليًّا — نفس اتفاقية `Card.tsx`.
 */

import { formatRelativeTime, plural } from '@/shared/bidi/numerals'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './GuideCard.module.css'

import type { GuideRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface GuideCardProps {
  record: GuideRecord
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  now?: number | undefined
}

export function GuideCard({
  record,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  now = Date.now(),
}: GuideCardProps): JSX.Element {
  const activate = () => (selectionMode ? onToggleSelect(record.id) : onOpen(record.id))

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  const captureCount = record.captureIds.length

  return (
    <button
      type="button"
      class={cx(styles.card, selected && styles.selected)}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-pressed={selectionMode ? selected : undefined}
      data-guide-id={record.id}
    >
      <span class={styles.iconArea}>
        <Icon name="list-view" size="2xl" class={styles.iconAreaIcon} />
        <span
          class={cx(styles.checkboxWrap, selectionMode && styles.checkboxVisible)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected ? 'on' : 'off'}
            onChange={() => onToggleSelect(record.id)}
            aria-label={selected ? 'إلغاء تحديد الدليل' : 'تحديد الدليل'}
          />
        </span>
      </span>
      <span class={styles.title}>{record.title}</span>
      <span class={styles.meta}>{plural(captureCount, 'لقطة', 'لقطتين', 'لقطات')}</span>
      <span class={styles.time}>{formatRelativeTime(record.createdAt, now)}</span>
    </button>
  )
}
