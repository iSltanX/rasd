import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface CaptureErrorProps {
  title: string
  message: string
  onRetry: () => void
}

/**
 * `popup / error` — لم تكتمل العملية. زرّ «أبلغ عن المشكلة» المرسوم تحت «أعد المحاولة»
 * لا يُعرض قبل محرّكه في `STAGES/13`، ولا يَعِد النصّ به.
 */
export function CaptureError({ title, message, onRetry }: CaptureErrorProps): JSX.Element {
  return (
    <MessageState
      icon="alert"
      tone="danger"
      title={title}
      primary={{ label: 'أعد المحاولة', onClick: onRetry }}
      primaryVariant="secondary"
    >
      {message}
    </MessageState>
  )
}
