import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface CaptureErrorProps {
  title: string
  message: string
  onRetry: () => void
  /** «أبلغ عن المشكلة» — يفتح نافذة البلاغ مملوءةً بالأداة ورمز الخطأ (ADR 0050). */
  onReport: () => void
}

/**
 * `popup / error` — لم تكتمل العملية. «أعد المحاولة»، وتحتها «أبلغ عن المشكلة» كما في الإطار: تفتح نافذة البلاغ
 * في الإعدادات بالأداة ورمز الخطأ، ولا يُرسَل شيء قبل أن يراجعه المستخدم ويؤكّده.
 */
export function CaptureError({
  title,
  message,
  onRetry,
  onReport,
}: CaptureErrorProps): JSX.Element {
  return (
    <MessageState
      icon="alert"
      tone="danger"
      title={title}
      primary={{ label: 'أعد المحاولة', onClick: onRetry }}
      primaryVariant="secondary"
      secondary={{ label: 'أبلغ عن المشكلة', onClick: onReport }}
    >
      {message}
    </MessageState>
  )
}
