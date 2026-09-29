/**
 * شريط إجراءات التحديد — للتبويبات الأربعة غير اللقطات (مراجع/ألوان/
 * لوحات/أدلة). يقابل `SimpleGrid.tsx`: بسيطٌ لأن أفعال هذه الأنواع أبسط
 * — لا مفضّلة ولا أرشيف ولا مهملات (لا حقول لها في `schema.ts`)، فعلان
 * فقط: نقل إلى مشروع، وحذف نهائي. سدّ فجوة التسليم في ملفّ المرحلة 18 السابق (تاريخ Git) §4/§8`
 * — كانت هذه الحالة تعرض شريطًا بلا فعل حقيقي سوى الإلغاء.
 *
 * مظهره مظهر `SelectionBar` نفسه (`94:738`) — العدّاد والقائمة والزرّ منه.
 * العدّاد **هندي** (`formatHuman`) — نفس قاعدة `SelectionBar.tsx` و§3.5.
 */

import { IconButton } from '@/ui/components/IconButton/IconButton'

import { BarButton, MoveToProject, SelectionCount, SelectionDock } from './SelectionBar'

import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

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
  const onDeleteClick = () => {
    // نفس نمط `SelectionBar.tsx`: تأكيد المتصفّح نفسه لفعل بلا تراجع — والحارس الحاجب
    // `verify:library` يقود حذف هذه الأنواع عبر `window.confirm`.
    if (window.confirm(`حذف ${count} عنصرًا نهائيًا — لا يمكن التراجع. متابعة؟`)) onDelete()
  }

  return (
    <SelectionDock>
      <SelectionCount count={count} />
      <MoveToProject projects={projects} onMoveToProject={onMoveToProject} />
      <BarButton
        icon="trash"
        label="حذف"
        aria-label="حذف المحدَّد نهائيًا"
        danger
        onClick={onDeleteClick}
      />
      <IconButton icon="close" size="s" aria-label="إلغاء التحديد" onClick={onClear} />
    </SelectionDock>
  )
}
