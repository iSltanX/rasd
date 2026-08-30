/**
 * شريط إجراءات التحديد المتعدّد — حالة `selection` المصمَّمة (§10 المرحلة 18).
 *
 * العدّاد **هندي** (`formatHuman`) لأنه عدٌّ بشري لا قياس — نفس قاعدة §3.5
 * المطبَّقة في كل صفحات الواجهة.
 */

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'

import styles from './SelectionBar.module.css'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const NO_PROJECT_VALUE = '__none__'

export interface SelectionBarProps {
  count: number
  /** لملء «نقل إلى مشروع» — §10.2 «نقل عناصر». */
  projects: readonly ProjectRecord[]
  onFavorite: () => void
  onArchive: () => void
  onTrash: () => void
  onMoveToProject: (projectId: string | null) => void
  onClear: () => void
}

export function SelectionBar({
  count,
  projects,
  onFavorite,
  onArchive,
  onTrash,
  onMoveToProject,
  onClear,
}: SelectionBarProps): JSX.Element {
  const onMoveChange = (e: JSX.TargetedEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value
    onMoveToProject(value === NO_PROJECT_VALUE ? null : value)
    // يُعاد الاختيار إلى «انقل إلى مشروع» بعد التنفيذ — القائمة أمرٌ لا حالة دائمة.
    e.currentTarget.selectedIndex = 0
  }

  return (
    <div class={styles.bar} role="toolbar" aria-label="إجراءات التحديد">
      <span class={styles.count}>{formatHuman(count)} محدَّدة</span>
      <span class={styles.actions}>
        <IconButton icon="star" aria-label="تفضيل المحدَّد" onClick={onFavorite} />
        <IconButton icon="folder" aria-label="أرشفة المحدَّد" onClick={onArchive} />
        <IconButton icon="trash" aria-label="نقل المحدَّد إلى المهملات" onClick={onTrash} />
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
      </span>
      <IconButton icon="close" aria-label="إلغاء التحديد" onClick={onClear} class={styles.clear} />
    </div>
  )
}
