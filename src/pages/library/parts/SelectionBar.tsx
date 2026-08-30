/**
 * شريط إجراءات التحديد المتعدّد — حالة `selection` المصمَّمة (§10 المرحلة 18).
 *
 * العدّاد **هندي** (`formatHuman`) لأنه عدٌّ بشري لا قياس — نفس قاعدة §3.5
 * المطبَّقة في كل صفحات الواجهة.
 *
 * **الإجراءات تتبع `viewMode`**: أرشفة عنصر مؤرشَف أصلًا، أو استعادة عنصر
 * لم يُحذَف، أفعالٌ بلا معنى — فكل وضع يعرض ما ينطبق عليه فقط، لا كل
 * الأيقونات دومًا بصرف النظر عن الحالة الفعلية للعناصر المحدَّدة.
 */

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'

import styles from './SelectionBar.module.css'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

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
  const onMoveChange = (e: JSX.TargetedEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value
    onMoveToProject(value === NO_PROJECT_VALUE ? null : value)
    // يُعاد الاختيار إلى «انقل إلى مشروع» بعد التنفيذ — القائمة أمرٌ لا حالة دائمة.
    e.currentTarget.selectedIndex = 0
  }

  const onPurgeClick = () => {
    // حذف نهائي بلا رجعة — تأكيدٌ من المتصفّح نفسه لا مكوّن مبنيّ خصّيصًا
    // لفعل نادر شديد الأثر؛ نمط مقبول لعملية لا تراجع عنها إطلاقًا.
    if (window.confirm(`حذف ${count} عنصرًا نهائيًا — لا يمكن التراجع. متابعة؟`)) onPurge()
  }

  const onTagSubmit = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('tag') as HTMLInputElement | null
    const value = input?.value.trim()
    if (value) onAddTag(value)
    if (input) input.value = ''
  }

  return (
    <div class={styles.bar} role="toolbar" aria-label="إجراءات التحديد">
      <span class={styles.count}>{formatHuman(count)} محدَّدة</span>
      <span class={styles.actions}>
        {viewMode === 'trashed' ? (
          <>
            <IconButton icon="refresh" aria-label="استعادة المحدَّد" onClick={onRestore} />
            <IconButton icon="trash" aria-label="حذف المحدَّد نهائيًا" onClick={onPurgeClick} />
          </>
        ) : (
          <>
            <IconButton icon="star" aria-label="تفضيل المحدَّد" onClick={onFavorite} />
            {viewMode === 'archived' ? (
              <IconButton
                icon="refresh"
                aria-label="استعادة المحدَّد من الأرشيف"
                onClick={onUnarchive}
              />
            ) : (
              <IconButton icon="folder" aria-label="أرشفة المحدَّد" onClick={onArchive} />
            )}
            <IconButton icon="trash" aria-label="نقل المحدَّد إلى المهملات" onClick={onTrash} />
            <form class={styles.tagForm} onSubmit={onTagSubmit}>
              <input
                type="text"
                name="tag"
                placeholder="أضِف وسمًا…"
                aria-label="أضِف وسمًا للمحدَّد"
                class={styles.tagInput}
              />
            </form>
            {projects.length > 0 ? (
              <select
                class={styles.moveSelect}
                aria-label="انقل المحدَّد إلى مشروع"
                value=""
                onChange={onMoveChange}
              >
                <option value="" disabled>
                  انقل إلى مشروع…
                </option>
                <option value={NO_PROJECT_VALUE}>بلا مشروع</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        )}
      </span>
      <IconButton icon="close" aria-label="إلغاء التحديد" onClick={onClear} class={styles.clear} />
    </div>
  )
}
