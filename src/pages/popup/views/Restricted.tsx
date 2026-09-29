import { useState } from 'preact/hooks'

import { gateMessage, type GateReason } from '@/shared/injection-gate'

import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface RestrictedProps {
  reason: GateReason
  onManageSites: () => void
}

/**
 * `restricted` — البوّابة رفضت هذا التبويب. الوصف عامّ كما في الإطار، و«لماذا؟» يكشف
 * السبب الفعلي لهذا التبويب من `gateMessage` في مكانه — كان الزرّ صامتًا بلا وجهة.
 */
export function Restricted({ reason, onManageSites }: RestrictedProps): JSX.Element {
  const [why, setWhy] = useState(false)
  return (
    <MessageState
      icon="lock"
      tone="danger"
      title="لا يمكن تشغيل رصد هنا"
      primary={{ label: 'إدارة المواقع المستثناة', onClick: onManageSites }}
      primaryVariant="secondary"
      secondary={why ? undefined : { label: 'لماذا؟', onClick: () => setWhy(true) }}
    >
      <p>
        المتصفّح يمنع الإضافات من صفحاته الداخلية، والمواقع المستثناة لا يعمل رصد فيها. افتح صفحة
        أخرى لتكمل.
      </p>
      {why ? <p data-gate-reason={reason}>{gateMessage(reason)}</p> : null}
    </MessageState>
  )
}
