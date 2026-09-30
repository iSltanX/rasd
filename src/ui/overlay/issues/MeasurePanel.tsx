import { Icon } from '@/ui/icons/Icon'

import { LogIssueButton } from './IssueForm'

import type { JSX } from 'preact'

/**
 * لوحة القياس بين عنصرين — مدخل «سجّل مشكلة» في `measure / two-elements`.
 *
 * **العنصر الثاني يُثبَّت بـ`⇧` مع النقر.** بلاه يتبع الهدفُ المؤشِّرَ، فالطريق إلى زرّ اللوحة يمرّ فوق عناصر
 * أخرى ويغيّر ما يُقاس قبل أن يُضغط. والزرّ معطَّل بسببٍ مكتوب حتى يُثبَّت الثاني — لا صامت.
 */

const PIN_HINT = 'ثبّت العنصر الثاني بـ⇧ والنقر.'

/**
 * **الفجوة وحدها صفًّا** — المقاسان وخطوط الفجوة مرسومة على الصفحة نفسها بجوار العنصرين، وتكرارها في اللوحة
 * وزنٌ في `content.js` بلا معلومة جديدة. الفرق عن `measure / two-elements` مكتوب في `Docs/Design.md` §5.
 */
export function MeasurePanel({
  gap,
  pinned,
  onLogIssue,
}: {
  readonly gap: string
  /** العنصر الثاني مثبَّت — القياس بين عنصرين محدّدين لا بين مرجعٍ ومؤشِّر. */
  readonly pinned: boolean
  readonly onLogIssue?: () => void
}): JSX.Element {
  return (
    <section
      class="rasd-ov-insp rasd-ov-iss-measure"
      aria-label="قياس"
      data-rasd-ov="measure-panel"
    >
      <div class="rasd-ov-insp-head">
        <span class="rasd-ov-iss-h">
          <Icon name="dimension-h" size="sm" /> قياس
        </span>
      </div>
      <div class="rasd-ov-insp-group">
        <div class="rasd-ov-insp-row">
          <span class="rasd-ov-insp-label">الفجوة</span>
          <bdi class="rasd-ov-iss-mono rasd-ov-insp-var">{gap}</bdi>
        </div>
        {pinned ? null : <p class="rasd-ov-iss-muted">{PIN_HINT}</p>}
      </div>
      {onLogIssue ? (
        <LogIssueButton onClick={onLogIssue} disabledReason={pinned ? null : PIN_HINT} />
      ) : null}
    </section>
  )
}
