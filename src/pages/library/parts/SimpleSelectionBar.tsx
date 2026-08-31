/**
 * شريط إجراءات التحديد — للتبويبات الأربعة غير اللقطات (مراجع/ألوان/
 * لوحات/أدلة). يقابل `SimpleGrid.tsx`: بسيطٌ لأن أفعال هذه الأنواع أبسط
 * — لا مفضّلة ولا أرشيف ولا مهملات (لا حقول لها في `schema.ts`)، فعلان
 * فقط: نقل إلى مشروع، وحذف نهائي. سدّ فجوة التسليم في `Phase_18.md §4/§8`
 * — كانت هذه الحالة تعرض شريطًا بلا فعل حقيقي سوى الإلغاء.
 *
 * العدّاد **هندي** (`formatHuman`) — نفس قاعدة `SelectionBar.tsx` و§3.5.
 */

import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'

import styles from './SimpleSelectionBar.module.css'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const NO_PROJECT_VALUE = '__none__'

export interface SimpleSelectionBarProps {
  count: number
  /** لملء «نقل إلى مشروع» — §10.2 «نقل عناصر»، الآن ممتدّة إلى هذه الأنواع. */
  projects: readonly ProjectRecord[]
  onMoveToProject: (projectId: string | null) => void
  /** حذف نهائي بلا رجعة — لا مهملات لهذه الأنواع، يُطلَب تأكيدٌ صريح قبله. */
  onDelete: () => void
  onClear: () => void
}

export function SimpleSelectionBar({
  count,
  projects,
  onMoveToProject,
  onDelete,
  onClear,
}: SimpleSelectionBarProps): JSX.Element {
  const onMoveChange = (e: JSX.TargetedEvent<HTMLSelectElement>) => {
    const value = e.currentTarget.value
    onMoveToProject(value === NO_PROJECT_VALUE ? null : value)
    // يُعاد الاختيار إلى «انقل إلى مشروع» بعد التنفيذ — القائمة أمرٌ لا حالة دائمة.
    e.currentTarget.selectedIndex = 0
  }

  const onDeleteClick = () => {
    // نفس نمط `SelectionBar.tsx`: تأكيدٌ من المتصفّح نفسه لفعل نادر شديد
    // الأثر بلا تراجع، لا مكوّن حوار مبنيّ خصّيصًا لعملية واحدة.
    if (window.confirm(`حذف ${count} عنصرًا نهائيًا — لا يمكن التراجع. متابعة؟`)) onDelete()
  }

  return (
    <div class={styles.bar} role="toolbar" aria-label="إجراءات التحديد">
      <span class={styles.count}>{formatHuman(count)} محدَّدة</span>
      <span class={styles.actions}>
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
        <IconButton icon="trash" aria-label="حذف المحدَّد نهائيًا" onClick={onDeleteClick} />
      </span>
      <IconButton icon="close" aria-label="إلغاء التحديد" onClick={onClear} class={styles.clear} />
    </div>
  )
}
