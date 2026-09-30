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
import chrome from './SimpleCard.module.css'

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

  const captureCount = record.captureIds.length

  return (
    // الحاوية تلتقط النقر في أيّ موضع منها، والزرّ داخلها للوحة المفاتيح وقارئ الشاشة، والمربّع
    // شقيقه لا ابنه — `SimpleCard.module.css`.
    <div
      class={cx(chrome.card, selected && chrome.selected)}
      onClick={activate}
      data-guide-id={record.id}
    >
      <span
        class={cx(chrome.checkboxWrap, selectionMode && chrome.checkboxVisible)}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected ? 'on' : 'off'}
          onChange={() => onToggleSelect(record.id)}
          aria-label={selected ? 'إلغاء تحديد الدليل' : 'تحديد الدليل'}
        />
      </span>
      <button type="button" class={chrome.hit} aria-pressed={selectionMode ? selected : undefined}>
        <span class={cx(chrome.media, styles.media)}>
          <Icon name="list-view" size="2xl" class={chrome.fallback} />
        </span>
        <span class={chrome.body}>
          <span class={cx(chrome.title, 't-arabic-ui-s-strong')}>{record.title}</span>
          <span class={cx(chrome.row, 't-arabic-ui-xs')}>
            <span class={chrome.sub}>{plural(captureCount, 'لقطة', 'لقطتين', 'لقطات')}</span>
            <span class={chrome.time}>{formatRelativeTime(record.createdAt, now)}</span>
          </span>
        </span>
      </button>
    </div>
  )
}
