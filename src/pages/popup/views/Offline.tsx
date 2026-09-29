import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface OfflineProps {
  onContinue: () => void
  onRetry: () => void
}

/**
 * `offline` — لا اتصال. الوظائف المحلّية كلّها تعمل، ويتوقّف ما يحتاج الشبكة وحده.
 * نصّ الإطار يسمّي GitHub والإبلاغ عن مشكلة، ومحرّكاهما في `STAGES/12` و`STAGES/13`
 * — فالنصّ هنا يصف القاعدة لا ميزتين لم تُبنيا بعد.
 */
export function Offline({ onContinue, onRetry }: OfflineProps): JSX.Element {
  return (
    <MessageState
      icon="offline"
      tone="info"
      title="أنت دون اتصال"
      primary={{ label: 'تابع بلا اتّصال', onClick: onContinue }}
      secondary={{ label: 'أعد المحاولة', onClick: onRetry }}
    >
      الالتقاط والفحص والقياس والمكتبة تعمل كلها بلا اتّصال. يتوقّف ما يحتاج الشبكة وحده.
    </MessageState>
  )
}
