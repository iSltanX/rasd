import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface CancelledProps {
  onRestart: () => void
  onClose: () => void
}

/** `popup / cancelled` — أُلغي الالتقاط قبل اكتماله، ولم يُحفظ شيء. */
export function Cancelled({ onRestart, onClose }: CancelledProps): JSX.Element {
  return (
    <MessageState
      icon="close"
      tone="warning"
      title="لم تُحفظ لقطة"
      primary={{ label: 'التقط من جديد', onClick: onRestart }}
      primaryVariant="secondary"
      secondary={{ label: 'أغلق', onClick: onClose }}
    >
      ألغيت الالتقاط قبل اكتماله. الصفحة كما هي.
    </MessageState>
  )
}
