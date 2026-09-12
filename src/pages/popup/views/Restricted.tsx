import { gateMessage, type GateReason } from '@/shared/injection-gate'

import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface RestrictedProps {
  reason: GateReason
  onManageSites: () => void
  onWhy: () => void
}

/** `restricted` — البوّابة رفضت هذا التبويب؛ السبب يُشرح لا يُعمَّم. */
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
      {gateMessage(reason)}
    </MessageState>
  )
}
