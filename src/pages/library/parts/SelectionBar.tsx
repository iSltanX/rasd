/**
 * شريط إجراءات التحديد المتعدّد — حالة `selection` المصمَّمة (§10 المرحلة 18).
 *
 * العدّاد **هندي** (`formatHuman`) لأنه عدٌّ بشري لا قياس — نفس قاعدة §3.5
 * المطبَّقة في كل صفحات الواجهة.
 */

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'

import styles from './SelectionBar.module.css'

import type { JSX } from 'preact'

export interface SelectionBarProps {
  count: number
  onFavorite: () => void
  onArchive: () => void
  onTrash: () => void
  onClear: () => void
}

export function SelectionBar({
  count,
  onFavorite,
  onArchive,
  onTrash,
  onClear,
}: SelectionBarProps): JSX.Element {
  return (
    <div class={styles.bar} role="toolbar" aria-label="إجراءات التحديد">
      <span class={styles.count}>{formatHuman(count)} محدَّدة</span>
      <span class={styles.actions}>
        <IconButton icon="star" aria-label="تفضيل المحدَّد" onClick={onFavorite} />
        <IconButton icon="folder" aria-label="أرشفة المحدَّد" onClick={onArchive} />
        <IconButton icon="trash" aria-label="نقل المحدَّد إلى المهملات" onClick={onTrash} />
      </span>
      <IconButton icon="close" aria-label="إلغاء التحديد" onClick={onClear} class={styles.clear} />
    </div>
  )
}
