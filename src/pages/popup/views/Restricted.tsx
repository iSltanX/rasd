import { restrictionMessage, type RestrictionReason } from '@/shared/restricted'

import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface RestrictedProps {
  reason: RestrictionReason
  onManageSites: () => void
  onWhy: () => void
}

/** `restricted` — `isInjectable()` رفضت هذا العنوان؛ السبب يُشرح لا يُعمَّم. */
export function Restricted({ reason, onManageSites, onWhy }: RestrictedProps): JSX.Element {
  return (
    <MessageState
      icon="lock"
      tone="danger"
      title="لا يمكن تشغيل رصد هنا"
      primary={{ label: 'إدارة المواقع المستثناة', onClick: onManageSites }}
      primaryVariant="secondary"
      secondary={{ label: 'لماذا؟', onClick: onWhy }}
    >
      {restrictionMessage(reason)}
    </MessageState>
  )
}
