import { STATUS_LABEL } from '@/modules/issues/labels'
import { countText, formatHuman, type CountForms } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'

import styles from './PageIssuesCard.module.css'

import type { PageIssueCounts } from '../context'
import type { JSX } from 'preact'

export interface PageIssuesCardProps {
  counts: PageIssueCounts
  onRecheck: () => void
}

/** «مشكلة واحدة» · «مشكلتان» · «٤ مشكلات» · «١١ مشكلة» · «١٠٠ مشكلة». */
const ISSUE_FORMS: CountForms = {
  one: 'مشكلة واحدة',
  two: 'مشكلتان',
  many: 'مشكلات',
  accusative: 'مشكلة',
  singular: 'مشكلة',
}

/**
 * السطر تحت العدد: ما يحتاج الفريق أن يعرفه وحده — المفتوحة وما تحتاج تحققًا، بلا صفر يُملأ به السطر.
 * وإن لم يبقَ من الاثنتين شيء فالمشكلات كلّها محلولة، فيُقال ذلك بدل سطرٍ فارغ.
 */
export function issuesDetail(counts: PageIssueCounts): string {
  const parts: string[] = []
  if (counts.open > 0) parts.push(`${formatHuman(counts.open)} ${STATUS_LABEL.open}`)
  if (counts['needs-verification'] > 0) {
    parts.push(`${formatHuman(counts['needs-verification'])} ${STATUS_LABEL['needs-verification']}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'كلّها محلولة'
}

/**
 * بطاقة «مشكلات هذه الصفحة» في `popup / page-issues`: العدد، فتفصيله، فزرّ «أعد الفحص».
 *
 * الزرّ يبدأ الفحص من النافذة بنقرة المستخدم (ADR 0031 §4) ونتيجته تُعرض في لوحة الطبقة، لا هنا.
 */
export function PageIssuesCard({ counts, onRecheck }: PageIssuesCardProps): JSX.Element {
  const total = counts.open + counts['needs-verification'] + counts.resolved
  return (
    <div class={styles.card}>
      <div class={styles.summary}>
        <p class={styles.count}>{countText(total, ISSUE_FORMS)}</p>
        <p class={styles.detail}>{issuesDetail(counts)}</p>
      </div>
      <Button variant="primary" size="m" icon="refresh" class={styles.action} onClick={onRecheck}>
        أعد الفحص
      </Button>
    </div>
  )
}
