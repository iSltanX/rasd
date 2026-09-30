/**
 * «خطوات إعادة المشكلة»: القائمة المرقَّمة، ونموذج تحريرها.
 *
 * الخطوات تُكتب هنا لا في نموذج التسجيل بالصفحة: النموذج لم يعد يجمعها. خطوةٌ في كل سطر، والحدّان (عشرون
 * خطوة، خمسمئة حرف للواحدة) حدّا مخطّط `parseIssue` — يُقالان قبل الكتابة بدل أن تسقط الكتابة برسالة غامضة.
 */

import { useState } from 'preact/hooks'

import { formatHuman } from '@/shared/bidi/numerals'
import { ISSUE_LIMITS, type IssueRecord } from '@/shared/issue-schema'
import { Button } from '@/ui/components/Button/Button'
import { Field } from '@/ui/components/Field/Field'
import { cx } from '@/ui/cx'

import { parseSteps, setSteps } from '../issues'

import { DetailCard } from './IssueCard'
import styles from './IssueSteps.module.css'

import type { JSX } from 'preact'

const FIELD_ID = 'issue-steps-field'

export interface IssueStepsProps {
  issue: IssueRecord
  onSaved: (issue: IssueRecord) => void
}

export function IssueSteps({ issue, onSaved }: IssueStepsProps): JSX.Element {
  const saved = issue.steps.join('\n')
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = draft !== saved

  const save = async () => {
    const parsed = parseSteps(draft)
    if (!parsed.ok) return setError(parsed.error.message)
    setBusy(true)
    setError(null)
    const result = await setSteps(issue.id, parsed.value)
    setBusy(false)
    if (!result.ok) return setError(result.error.message)
    // ما كُتب هو المطبَّع (بلا أسطر فارغة) — فيعود النموذج إلى حالة «لا تغيير».
    setDraft(result.value.steps.join('\n'))
    onSaved(result.value)
  }

  return (
    <DetailCard title="خطوات إعادة المشكلة" wide>
      {issue.steps.length > 0 ? (
        <ol class={cx(styles.steps, 't-arabic-ui-s')}>
          {issue.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : (
        <p class={cx(styles.none, 't-arabic-ui-s')}>لم تُسجَّل خطوات بعد.</p>
      )}
      <Field
        id={FIELD_ID}
        label="عدّل الخطوات"
        multiline
        value={draft}
        onInput={setDraft}
        state={error ? 'error' : 'default'}
        disabled={busy}
        hint={
          error ??
          `خطوة في كل سطر — حتى ${formatHuman(ISSUE_LIMITS.steps)} خطوة، وكل خطوة حتى ${formatHuman(ISSUE_LIMITS.step)} حرف.`
        }
      />
      <div class={styles.actions}>
        <Button
          variant="primary"
          size="m"
          state={busy ? 'loading' : dirty ? 'default' : 'disabled'}
          onClick={() => void save()}
        >
          احفظ الخطوات
        </Button>
      </div>
    </DetailCard>
  )
}
