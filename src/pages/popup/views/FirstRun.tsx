import { isMacPlatform } from '@/shared/platform'
import { RasdMark } from '@/ui/RasdMark'
import { KeyCap } from '@/ui/TechnicalValue'

import { MessageState } from '../parts/MessageState'

import type { JSX } from 'preact'

export interface FirstRunProps {
  /** يُتمّ الجولة الأولى ويعرض الأدوات. */
  onStart: () => void
  /** يفتح جولة التعريف في تبويب. */
  onTour: () => void
}

/**
 * `first-run` — أوّل فتح للنافذة، قبل أن تُحفظ `settings.onboarding.completed`.
 *
 * «ابدأ» يُتمّ الجولة الأولى ويعرض الأدوات، و«جولة سريعة» يفتح صفحة التأهيل — الخطوات الأربع
 * نفسها التي تُفتح عند التثبيت، لمن أغلقها قبل آخرها. والتلميح يسمّي الاختصار الحقيقي للالتقاط.
 */
export function FirstRun({ onStart, onTour }: FirstRunProps): JSX.Element {
  return (
    <MessageState
      tone="brand"
      badge={<RasdMark size="2xl" title="رصد" />}
      title="مرحبًا بك في رصد"
      primary={{ label: 'ابدأ', onClick: onStart }}
      secondary={{ label: 'جولة سريعة', onClick: onTour }}
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
