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
 * تُطلب فقط لميزة متقدّمة — تتبّع متغيّرات CSS عبر أوراق أنماط خارجية،
 * المرحلة 11 (`HOST_PERMISSION_RATIONALE`). لا مسار في هذه المرحلة يطلبها
 * تلقائيًا؛ الحالة مبنيّة وأزرارها حقيقية (`requestHostPermission`) لتصل
 * إليها المرحلة 11 بلا عمل واجهة إضافي.
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
