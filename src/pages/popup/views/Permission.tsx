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
 * الالتقاط والفحص الأساسيان لا يحتاجانها (`activeTab` وحدها تكفيهما)؛
 * تُطلب لميزة واحدة: **بقاء مرجع المقارنة فوق الصفحة بعد إعادة تحميلها**
 * (`background/resume.ts`، المرحلة 16) — و`Popup.tsx` يطلبها فعلًا في هذه
 * الحالة عبر `requestHostPermission`.
 *
 * **صُحِّح نصّان هنا في الوحدة 20.3، وكلاهما كان منقوضًا بالقياس:** كان
 * يقول إنها تُطلب «لتتبّع متغيّرات CSS عبر أوراق أنماط خارجية» — وقياس
 * المرحلة 11 أثبت أن المنح **لا** يفتح الورقة أصلًا (`Rasd_Plan.md §6`
 * الصفّان 42 و43، والنصّ المصدر في `HOST_PERMISSION_RATIONALE`)؛ وكان يقول
 * «لا مسار يطلبها تلقائيًا» وذاك صار خطأً منذ بُني مسار الطلب في `Popup.tsx`.
 */
export function Permission({ origin, onAllowOrigin, onAllowOnce }: PermissionProps): JSX.Element {
  return (
    <MessageState
      icon="shield"
      tone="brand"
      title="رصد يحتاج إذنًا لهذا الموقع"
      primary={{ label: `اسمح في ${origin}`, onClick: onAllowOrigin }}
      secondary={{ label: 'اسمح مرة واحدة', onClick: onAllowOnce }}
    >
      يُطلب الإذن لكل موقع، وعند استخدام أداة فقط. لا يُقرأ شيء قبل منحه.
    </MessageState>
  )
}
