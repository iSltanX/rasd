import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface PermissionProps {
  origin: string
  onAllowOrigin: () => void
  onAllowOnce: () => void
}

/**
 * `permission` — صلاحية مضيف مطلوبة لهذا الأصل.
 *
 * الالتقاط والفحص الأساسيان لا يحتاجانها (`activeTab` وحدها تكفيهما)؛ تُطلب لميزة
 * واحدة: **بقاء مرجع المقارنة فوق الصفحة بعد إعادة تحميلها** (`background/resume.ts`)
 * — و`Popup.tsx` يطلبها فعلًا في هذه الحالة عبر `requestHostPermission`. ونصّها لا يعد
 * بفتح أوراق الأنماط الخارجية: القياس أثبت أن المنح لا يفتحها (`Docs/Engineering.md
 * §6` الصفّان 42 و43).
 */
export function Permission({ origin, onAllowOrigin, onAllowOnce }: PermissionProps): JSX.Element {
  return (
    <MessageState
      icon="shield"
      tone="warning"
      title="رصد يحتاج إذنًا لهذا الموقع"
      primary={{ label: `اسمح في ${origin}`, onClick: onAllowOrigin }}
      secondary={{ label: 'اسمح مرة واحدة', onClick: onAllowOnce }}
    >
      يُطلب الإذن لكل موقع، وعند استخدام أداة فقط. لا يُقرأ شيء قبل منحه.
    </MessageState>
  )
}
