import { isMacPlatform } from '@/shared/platform'
import { RasdMark } from '@/ui/RasdMark'
import { KeyCap } from '@/ui/TechnicalValue'

import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface FirstRunProps {
  /** يُتمّ الجولة الأولى ويعرض الأدوات. */
  onStart: () => void
}

/**
 * `first-run` — أوّل فتح للنافذة، قبل أن تُحفظ `settings.onboarding.completed`.
 *
 * **زرّ «جولة سريعة» المرسوم لا يُعرض قبل `STAGES/09`:** وجهته صفحة التأهيل، وهي اليوم
 * صفحة نائبة («قيد التطوير») — وزرّ يقود إلى لا شيء زرّ صامت. فالإجراء الأساسي «ابدأ»
 * يُتمّ الجولة ويعرض الأدوات، والتلميح يسمّي الاختصار الحقيقي لبدء الالتقاط.
 */
export function FirstRun({ onStart }: FirstRunProps): JSX.Element {
  return (
    <MessageState
      tone="brand"
      badge={<RasdMark size="2xl" title="رصد" />}
      title="مرحبًا بك في رصد"
      primary={{ label: 'ابدأ', onClick: onStart }}
      hint={
        <>
          <span>اضغط</span>
          <KeyCap>{isMacPlatform() ? '⇧⌘T' : 'Ctrl+Shift+Q'}</KeyCap>
          <span>في أي مكان للبدء</span>
        </>
      }
    >
      <p>فحص بصري للويب، من داخل الصفحة</p>
      <p>التقط وافحص وقِس وقارن — دون مغادرة الصفحة التي تراجعها.</p>
    </MessageState>
  )
}
