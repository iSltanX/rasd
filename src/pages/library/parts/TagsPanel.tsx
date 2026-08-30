/**
 * لوحة الوسوم (§10.3) — تصفح، وتصفية الشبكة بالنقر على وسم.
 *
 * **لا نموذج إنشاء هنا** خلافًا لـ`ProjectsPanel.tsx`: الوسوم تُنشأ ضمنًا
 * عند أوّل إضافة على لقطة (`addTagToCaptures`، عبر `SelectionBar`) لا
 * بفعل مستقلّ مسبق — نفس فكرة الوسم الحرّ في أي نظام وسوم: يُكتَب حين
 * يُستعمَل لا حين يُعرَّف.
 */

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { cx } from '@/ui/cx'

import styles from './TagsPanel.module.css'

import type { TagRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface TagsPanelProps {
  tags: readonly TagRecord[]
  activeTag: string | null
  onSelectTag: (name: string | null) => void
  onClose: () => void
}

export function TagsPanel({ tags, activeTag, onSelectTag, onClose }: TagsPanelProps): JSX.Element {
  const sorted = [...tags].sort((a, b) => b.count - a.count)

  return (
    <aside class={styles.panel} aria-label="الوسوم">
      <div class={styles.header}>
        <h2 class={styles.title}>الوسوم</h2>
        <IconButton icon="close" aria-label="إغلاق لوحة الوسوم" onClick={onClose} />
      </div>

      {sorted.length === 0 ? (
        <p class={styles.empty}>لا وسوم بعد — أضِف وسمًا من شريط التحديد.</p>
      ) : (
        <ul class={styles.list} role="list">
          {sorted.map((tag) => (
            <li key={tag.name}>
              <button
                type="button"
                class={cx(styles.tagButton, activeTag === tag.name && styles.tagActive)}
                aria-pressed={activeTag === tag.name}
                onClick={() => onSelectTag(activeTag === tag.name ? null : tag.name)}
                data-tag-name={tag.name}
              >
                <span class={styles.tagName}>{tag.name}</span>
                <span class={styles.tagCount}>{formatHuman(tag.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
