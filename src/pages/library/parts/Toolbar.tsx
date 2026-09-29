/**
 * شريط أدوات المكتبة — `toolbar` في `library / grid` (`66:20`): في بدايته البحث (340)
 * ومرشّحات اللقطات (النوع، والتاريخ، والوسوم)، وفي نهايته لوحة المشاريع.
 *
 * **المرشّحات للقطات وحدها** (`captureFilters`): البحث يعمل عبر `searchTab` على الأنواع
 * الخمسة كلّها، لكن النوع والتاريخ والوسم حقول `CaptureRecord` — إظهارها لنوع لا
 * يستهلكها يوهم بتأثير لا يقع.
 *
 * **ما في الإطار ولا يُعرض:** مبدّل القائمة/الشبكة (لا عرض قائمة في المحرّك)، و«تصدير»
 * (لا تصدير جماعيًّا — التصدير لقطةً لقطة من المحرّر). في موضعهما زرّ لوحة المشاريع:
 * إدارتها (إنشاء وتسمية ولون وحذف بنقل المحتوى) قائمة، ولا موضع لها في الإطار.
 *
 * و`SortSelect` هنا أيضًا لأنه من العائلة نفسها، ومكانه رأس الشبكة: «مرتّبة من الأحدث».
 */

import {
  DEFAULT_SORT_DIRECTION,
  type LibrarySortKey,
  type SortDirection,
} from '@/modules/library/sort'
import { Button } from '@/ui/components/Button/Button'
import { Select } from '@/ui/components/Select/Select'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { KIND_LABEL } from './Card'
import styles from './Toolbar.module.css'

import type { CaptureKind } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/** أنواع الالتقاط التي يُنتجها المنتج فعلًا — `window` مؤجَّل إلى 1.1 فلا يُعرض مرشّحًا. */
const KIND_FILTERS: readonly CaptureKind[] = ['area', 'element', 'viewport', 'full-page']

export type KindFilter = CaptureKind | 'all'
export type DateFilter = 'any' | 'today' | 'week' | 'month'

const DATE_LABEL: Record<DateFilter, string> = {
  any: 'أي تاريخ',
  today: 'اليوم',
  week: 'آخر ٧ أيام',
  month: 'آخر ٣٠ يومًا',
}
const DATE_FILTERS = Object.keys(DATE_LABEL) as DateFilter[]

const DAY_MS = 24 * 60 * 60 * 1000

/** بداية المدى الزمني بتوقيت الجهاز — «اليوم» من منتصف الليل لا آخر 24 ساعة. */
export function dateFromFor(filter: DateFilter, now: number): number | undefined {
  if (filter === 'any') return undefined
  if (filter === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  return now - (filter === 'week' ? 7 : 30) * DAY_MS
}

export interface CaptureFilters {
  kind: KindFilter
  onKindChange: (kind: KindFilter) => void
  date: DateFilter
  onDateChange: (date: DateFilter) => void
  tagsOpen: boolean
  onToggleTags: () => void
}

export interface ToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  searchPlaceholder: string
  /** `null` خارج عروض اللقطات. */
  captureFilters: CaptureFilters | null
  projectsOpen: boolean
  onToggleProjects: () => void
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  captureFilters,
  projectsOpen,
  onToggleProjects,
}: ToolbarProps): JSX.Element {
  return (
    <div class={styles.toolbar}>
      <div class={styles.start} role="search" aria-label="البحث والتصفية">
        <label class={styles.search}>
          <Icon name="search" size="sm" class={styles.searchIcon} />
          <input
            type="search"
            class={cx(styles.searchInput, 't-arabic-ui-s')}
            value={searchQuery}
            placeholder={searchPlaceholder}
            aria-label="ابحث في المكتبة"
            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
              onSearchChange(e.currentTarget.value)
            }
          />
        </label>
        {captureFilters ? (
          <>
            <Select
              aria-label="نوع اللقطة"
              value={captureFilters.kind}
              options={[
                { value: 'all', label: 'كل الأنواع' },
                ...KIND_FILTERS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
              ]}
              onChange={(v) => captureFilters.onKindChange(v as KindFilter)}
            />
            <Select
              aria-label="تاريخ الالتقاط"
              value={captureFilters.date}
              options={DATE_FILTERS.map((d) => ({ value: d, label: DATE_LABEL[d] }))}
              onChange={(v) => captureFilters.onDateChange(v as DateFilter)}
            />
            <button
              type="button"
              class={cx(
                styles.filterButton,
                captureFilters.tagsOpen && styles.filterOpen,
                't-arabic-ui-xs-strong',
              )}
              aria-label={captureFilters.tagsOpen ? 'إغلاق لوحة الوسوم' : 'فتح لوحة الوسوم'}
              aria-expanded={captureFilters.tagsOpen}
              onClick={captureFilters.onToggleTags}
            >
              الوسوم
              <Icon name="filter" size="xs" class={styles.filterIcon} />
            </button>
          </>
        ) : null}
      </div>
      <div class={styles.end}>
        <Button
          variant="secondary"
          size="m"
          icon="folder"
          aria-label={projectsOpen ? 'إغلاق لوحة المشاريع' : 'فتح لوحة المشاريع'}
          aria-expanded={projectsOpen}
          onClick={onToggleProjects}
        >
          المشاريع
        </Button>
      </div>
    </div>
  )
}

/** مفاتيح الترتيب مع اتجاهها في قائمة واحدة — التاريخ في الاتجاهين، والباقي أبجديًّا. */
const SORT_OPTIONS: readonly { key: LibrarySortKey; direction: SortDirection; label: string }[] = [
  { key: 'date', direction: 'desc', label: 'مرتّبة من الأحدث' },
  { key: 'date', direction: 'asc', label: 'مرتّبة من الأقدم' },
  { key: 'project', direction: 'asc', label: 'حسب المشروع' },
  { key: 'origin', direction: 'asc', label: 'حسب الموقع' },
  { key: 'kind', direction: 'asc', label: 'حسب النوع' },
]

export interface SortSelectProps {
  sortKey: LibrarySortKey
  sortDirection: SortDirection
  onChange: (key: LibrarySortKey, direction: SortDirection) => void
}

export function SortSelect({ sortKey, sortDirection, onChange }: SortSelectProps): JSX.Element {
  const current =
    SORT_OPTIONS.find((o) => o.key === sortKey && o.direction === sortDirection) ??
    SORT_OPTIONS.find((o) => o.key === sortKey) ??
    SORT_OPTIONS[0]
  return (
    <Select
      aria-label="ترتيب حسب"
      class={styles.sort}
      value={`${current?.key}:${current?.direction}`}
      options={SORT_OPTIONS.map((o) => ({ value: `${o.key}:${o.direction}`, label: o.label }))}
      onChange={(value) => {
        const [key, direction] = value.split(':') as [LibrarySortKey, SortDirection | undefined]
        onChange(key, direction ?? DEFAULT_SORT_DIRECTION)
      }}
    />
  )
}
