/**
 * بطاقة شبكة المكتبة — لقطة واحدة، بمواصفة `capture-card` في إطار `library / grid`
 * (`66:20`): مصغَّرة فوقها رقاقة النوع في بدايتها ومربّع التحديد في نهايتها، ثمّ العنوان،
 * ثمّ سطر الموقع والزمن.
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

/** أسماء الأنواع كما في رقاقة الإطار ونافذة الالتقاط. */
export const KIND_LABEL: Record<CaptureKind, string> = {
  area: 'منطقة',
  element: 'عنصر',
  viewport: 'الظاهر',
  'full-page': 'صفحة كاملة',
  window: 'نافذة',
}

/** اسم المضيف وحده — `example.com` لا `https://example.com`. أصل تالف يُعرض كما هو. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host || origin
  } catch {
    return origin
  }
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

  // الحاوية تلتقط النقر في أيّ موضع منها، والزرّ داخلها للوحة المفاتيح وقارئ الشاشة — نقره
  // يصعد إليها، و`Enter`/`Space` عليه نقرٌ أصليّ. والمربّع شقيقه لا ابنه (`Card.module.css`).
  return (
    <div
      class={cx(styles.card, selected && styles.selected)}
      onClick={activate}
      data-capture-id={record.id}
    >
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
      <button type="button" class={styles.hit} aria-pressed={selectionMode ? selected : undefined}>
        <span class={styles.thumb}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" class={styles.thumbImg} />
          ) : (
            <Icon name={KIND_ICON[record.kind]} size="xl" class={styles.thumbFallback} />
          )}
          <span class={cx(styles.kind, 't-arabic-ui-xs')}>{KIND_LABEL[record.kind]}</span>
        </span>
        <span class={styles.meta}>
          <span class={styles.titleRow}>
            <span class={cx(styles.title, 't-arabic-ui-s-strong')}>
              {record.title || record.url}
            </span>
            {record.favorite ? (
              <Icon name="star" size="xs" title="مفضَّلة" class={styles.favorite} />
            ) : null}
          </span>
          <span class={cx(styles.row, 't-arabic-ui-xs')}>
            <span class={styles.origin}>
              <bdi dir="ltr">{hostOf(record.origin)}</bdi>
              {projectName ? ` · ${projectName}` : ''}
            </span>
            <span class={styles.time}>{formatRelativeTime(record.createdAt, now)}</span>
          </span>
        </span>
      </button>
    </div>
  )
}
