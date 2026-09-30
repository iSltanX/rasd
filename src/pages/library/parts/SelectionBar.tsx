/**
 * شريط إجراءات التحديد المتعدّد — `selection-bar` في `library / selection` (`94:738`):
 * شريط عائم زجاجي أسفل الشبكة، يبدأ بالعدّاد ثمّ فاصل ثمّ الأفعال نصوصًا بأيقوناتها،
 * والحذف بدرجة الخطر، والإغلاق آخرًا.
 *
 * العدّاد **هندي** (`formatHuman`) لأنه عدٌّ بشري لا قياس — نفس قاعدة §3.5
 * المطبَّقة في كل صفحات الواجهة.
 *
 * **الإجراءات تتبع `viewMode`**: أرشفة عنصر مؤرشَف أصلًا، أو استعادة عنصر
 * لم يُحذَف، أفعالٌ بلا معنى — فكل وضع يعرض ما ينطبق عليه فقط، لا كل
 * الأيقونات دومًا بصرف النظر عن الحالة الفعلية للعناصر المحدَّدة.
 *
 * **«تصدير» و«مشاركة» المرسومان لا يُعرضان**: لا تصدير جماعيًّا في المحرّك (التصدير لقطةً
 * لقطة من المحرّر)، والمشاركة في `STAGES/10`. والاسم المقروء لكل زرّ يحوي نصّه المرئي،
 * فمن ينطق ما يراه يصل إليه.
 */

import { useState } from 'preact/hooks'

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { CAPTURE_FORMS, DeleteConfirm } from './DeleteConfirm'
import styles from './SelectionBar.module.css'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { ComponentChildren, JSX } from 'preact'

const NO_PROJECT_VALUE = '__none__'

export type LibraryViewMode = 'live' | 'archived' | 'trashed'

export interface SelectionBarProps {
  count: number
  viewMode: LibraryViewMode
  /** لملء «نقل إلى مشروع» — §10.2 «نقل عناصر». */
  projects: readonly ProjectRecord[]
  onFavorite: () => void
  /** ينقل إلى الأرشيف — وضع `live` فقط. */
  onArchive: () => void
  /** يستعيد من الأرشيف — وضع `archived` فقط. */
  onUnarchive: () => void
  /** ينقل إلى المهملات — وضعا `live` و`archived`. */
  onTrash: () => void
  /** يستعيد من المهملات — وضع `trashed` فقط. */
  onRestore: () => void
  /** حذف نهائي بلا رجعة — وضع `trashed` فقط، يُطلَب تأكيدٌ صريح قبله. */
  onPurge: () => void
  onMoveToProject: (projectId: string | null) => void
  onAddTag: (name: string) => void
  onClear: () => void
}

/** الشريط في مرساه العائم أسفل منتصف المحتوى — والمحتوى حاوية `position: relative`. */
export function SelectionDock({ children }: { children: ComponentChildren }): JSX.Element {
  return (
    <div class={styles.dock}>
      <div class={styles.bar} role="toolbar" aria-label="إجراءات التحديد">
        {children}
      </div>
    </div>
  )
}

/** العدّاد والفاصل — رأس الشريطين معًا. */
export function SelectionCount({ count }: { count: number }): JSX.Element {
  return (
    <>
      <span class={styles.countGroup}>
        <span class={cx(styles.countChip, 't-arabic-ui-xs-strong')}>{formatHuman(count)}</span>{' '}
        <span class={cx(styles.countLabel, 't-arabic-ui-s')}>محدَّدة</span>
      </span>
      <span class={styles.divider} aria-hidden="true" />
    </>
  )
}

/** «انقل إلى مشروع» — قائمة أصلية بمظهر زرّ الشريط؛ أمرٌ يُنفَّذ ثمّ تعود إلى أوّلها. */
export function MoveToProject({
  projects,
  onMoveToProject,
}: {
  projects: readonly ProjectRecord[]
  onMoveToProject: (projectId: string | null) => void
}): JSX.Element | null {
  if (projects.length === 0) return null
  const onChange = (e: JSX.TargetedEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value
    onMoveToProject(value === NO_PROJECT_VALUE ? null : value)
    // يُعاد الاختيار إلى «انقل إلى مشروع» بعد التنفيذ — القائمة أمرٌ لا حالة دائمة.
    e.currentTarget.selectedIndex = 0
  }
  return (
    <span class={cx(styles.action, styles.selectAction)}>
      <Icon name="folder" size="xs" class={styles.actionIcon} />
      <select
        class={cx(styles.select, 't-arabic-ui-xs-strong')}
        aria-label="انقل المحدَّد إلى مشروع"
        value=""
        onChange={onChange}
      >
        <option value="" disabled>
          انقل إلى مشروع
        </option>
        <option value={NO_PROJECT_VALUE}>بلا مشروع</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </span>
  )
}

interface BarButtonProps {
  icon: 'star' | 'folder' | 'refresh' | 'trash'
  label: string
  'aria-label': string
  danger?: boolean
  onClick: () => void
}

function BarButton({ icon, label, danger = false, onClick, ...aria }: BarButtonProps) {
  return (
    <button
      type="button"
      class={cx(styles.action, danger && styles.danger, 't-arabic-ui-xs-strong')}
      onClick={onClick}
      {...aria}
    >
      <Icon name={icon} size="xs" class={styles.actionIcon} />
      {label}
    </button>
  )
}

export function SelectionBar({
  count,
  viewMode,
  projects,
  onFavorite,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onPurge,
  onMoveToProject,
  onAddTag,
  onClear,
}: SelectionBarProps): JSX.Element {
  // حذف نهائي بلا رجعة يمرّ بحوار الإطار (`library / delete-confirm`) — كان تأكيد المتصفّح.
  const [confirming, setConfirming] = useState(false)

  const onTagSubmit = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('tag') as HTMLInputElement | null
    const value = input?.value.trim()
    if (value) onAddTag(value)
    if (input) input.value = ''
  }

  return (
    <SelectionDock>
      {confirming ? (
        <DeleteConfirm
          count={count}
          forms={CAPTURE_FORMS}
          note="تُحذف نهائيًّا مع تعليقاتها، ولا تُسترجع من المهملات."
          onConfirm={() => {
            setConfirming(false)
            onPurge()
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      <SelectionCount count={count} />
      <span class={styles.actions}>
        {viewMode === 'trashed' ? (
          <>
            <BarButton
              icon="refresh"
              label="استعادة"
              aria-label="استعادة المحدَّد"
              onClick={onRestore}
            />
            <BarButton
              icon="trash"
              label="حذف"
              aria-label="حذف المحدَّد نهائيًا"
              danger
              onClick={() => setConfirming(true)}
            />
          </>
        ) : (
          <>
            <MoveToProject projects={projects} onMoveToProject={onMoveToProject} />
            <form class={cx(styles.action, styles.tagForm)} onSubmit={onTagSubmit}>
              <Icon name="tag" size="xs" class={styles.actionIcon} />
              <input
                type="text"
                name="tag"
                placeholder="وسم…"
                aria-label="أضِف وسمًا للمحدَّد"
                class={cx(styles.tagInput, 't-arabic-ui-xs-strong')}
              />
            </form>
            <BarButton icon="star" label="تفضيل" aria-label="تفضيل المحدَّد" onClick={onFavorite} />
            {viewMode === 'archived' ? (
              <BarButton
                icon="refresh"
                label="استعادة"
                aria-label="استعادة المحدَّد من الأرشيف"
                onClick={onUnarchive}
              />
            ) : (
              <BarButton
                icon="folder"
                label="أرشفة"
                aria-label="أرشفة المحدَّد"
                onClick={onArchive}
              />
            )}
            <BarButton
              icon="trash"
              label="إلى المهملات"
              aria-label="نقل المحدَّد إلى المهملات"
              danger
              onClick={onTrash}
            />
          </>
        )}
      </span>
      <IconButton icon="close" size="s" aria-label="إلغاء التحديد" onClick={onClear} />
    </SelectionDock>
  )
}

export { BarButton }
