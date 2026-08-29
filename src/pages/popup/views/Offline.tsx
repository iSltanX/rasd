import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface OfflineProps {
  onContinue: () => void
  onRetry: () => void
}

/** `offline` — لا اتصال؛ الوظائف المحلّية كلّها تعمل، والمشاركة وحدها تنتظر. */
export function Offline({ onContinue, onRetry }: OfflineProps): JSX.Element {
  return (
    <MessageState
      icon="offline"
      tone="warning"
      title="أنت دون اتصال"
      primary={{ label: 'تابع دون اتصال', onClick: onContinue }}
      secondary={{ label: 'أعد المحاولة', onClick: onRetry }}
    >
      الالتقاط والفحص والقياس والمكتبة المحلية تعمل كلها. روابط المشاركة ستُصفّ حتى تعود الشبكة.
    </MessageState>
  )
}
