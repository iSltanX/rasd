/**
 * شريط أدوات المكتبة — بحث في كل التبويبات، وترتيب وتفضيل للقطات وحدها.
 *
 * **لا مرشِّحات مشروع/نوع/مدى زمني هنا بعد**: `query.ts` يوثِّق لماذا
 * التصفية والترتيب الكاملان مقصوران على تبويب اللقطات — تفضيل واحد فقط،
 * والباقي يصل مع لوحة المشاريع حين توجد واجهة تختار منها مشروعًا لا
 * معرِّفًا مطبوعًا يدويًّا.
 *
 * **`showSortAndFilter=false` لغير تبويب اللقطات**: البحث يعمل عبر
 * `searchTab` على التبويبات الخمسة كلّها (المرحلة 18، الدفعة الثالثة)،
 * لكن الترتيب والتفضيل مبنيّان على حقول `CaptureRecord` فقط — إظهارهما
 * لتبويب لا يستهلكهما يوهم بتأثير لا يقع.
 */

import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  type LibrarySortKey,
  type SortDirection,
} from '@/modules/library/sort'
import { Input } from '@/ui/components/Input/Input'
import { SegmentedControl } from '@/ui/components/SegmentedControl/SegmentedControl'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import styles from './Toolbar.module.css'

import type { JSX } from 'preact'

const SORT_KEYS: readonly LibrarySortKey[] = ['date', 'project', 'origin', 'kind']
const SORT_KEY_LABELS: Record<LibrarySortKey, string> = {
  date: 'التاريخ',
  project: 'المشروع',
  origin: 'الموقع',
  kind: 'النوع',
}

const SORT_DIRECTIONS: readonly SortDirection[] = ['desc', 'asc']
const SORT_DIRECTION_LABELS: Record<SortDirection, string> = {
  desc: 'تنازليًا',
  asc: 'تصاعديًا',
}

export interface ToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  sortKey: LibrarySortKey
  onSortKeyChange: (key: LibrarySortKey) => void
  sortDirection: SortDirection
  onSortDirectionChange: (direction: SortDirection) => void
  favoriteOnly: boolean
  onFavoriteOnlyChange: (value: boolean) => void
  /** افتراضيًا `true` — يُطفَأ خارج تبويب اللقطات. */
  showSortAndFilter?: boolean
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  sortDirection,
  onSortDirectionChange,
  favoriteOnly,
  onFavoriteOnlyChange,
  showSortAndFilter = true,
}: ToolbarProps): JSX.Element {
  return (
    <div class={styles.toolbar} role="search">
      <Input
        type="search"
        value={searchQuery}
        onInput={onSearchChange}
        placeholder="ابحث بالعنوان أو الرابط أو الوسم…"
        aria-label="ابحث في المكتبة"
        class={styles.search}
      />

      {showSortAndFilter ? (
        <>
          <SegmentedControl
            options={SORT_KEYS.map((key) => ({ value: key, label: SORT_KEY_LABELS[key] }))}
            selected={SORT_KEYS.indexOf(sortKey)}
            onChange={(index) => onSortKeyChange(SORT_KEYS[index] ?? DEFAULT_SORT_KEY)}
            aria-label="ترتيب حسب"
          />

          <SegmentedControl
            options={SORT_DIRECTIONS.map((d) => ({ value: d, label: SORT_DIRECTION_LABELS[d] }))}
            selected={SORT_DIRECTIONS.indexOf(sortDirection)}
            onChange={(index) =>
              onSortDirectionChange(SORT_DIRECTIONS[index] ?? DEFAULT_SORT_DIRECTION)
            }
            aria-label="اتجاه الترتيب"
          />

          <label class={styles.favoriteToggle}>
            <Toggle on={favoriteOnly} onChange={onFavoriteOnlyChange} aria-label="المفضَّلة فقط" />
            <span>المفضَّلة فقط</span>
          </label>
        </>
      ) : null}
    </div>
  )
}
