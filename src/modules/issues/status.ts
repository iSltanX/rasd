/**
 * قاعدة الحالة وتاريخها — الموضع الوحيد لجدول ADR 0030 §2.
 *
 * **النتيجة تقرّر والحالة لا تُرسَل.** الصفحة تبلّغ ما رأت (`outcome` وقيمته)، والخلفية تشتقّ الحالة
 * هنا. ولو قبلت حالةً من الحمولة لصار الجدول نسختين تتباعدان، ولأعلنت صفحةٌ معادية «محلولة».
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  MAX_ISSUE_HISTORY,
  type CheckOutcome,
  type IssueHistoryEntry,
  type IssueRecord,
  type IssueStatus,
  type RecheckResult,
} from '@/shared/issue-schema'

/** نتائج الفحص الخمس ⟵ الحالات الثلاث. */
const STATUS_OF: Readonly<Record<CheckOutcome, IssueStatus>> = {
  match: 'resolved',
  mismatch: 'open',
  'not-found': 'needs-verification',
  changed: 'needs-verification',
  unreliable: 'needs-verification',
}

export function statusFor(outcome: CheckOutcome): IssueStatus {
  return STATUS_OF[outcome]
}

/** يضيف حدثًا إلى التاريخ، الأحدث أوّلًا، ويُسقط ما جاوز الحدّ. */
function pushHistory(
  history: readonly IssueHistoryEntry[],
  entry: IssueHistoryEntry,
): IssueHistoryEntry[] {
  return [entry, ...history].slice(0, MAX_ISSUE_HISTORY)
}

/**
 * يطبّق نتيجة فحص على مشكلة: الحالة من `statusFor`، والقيمة المرصودة في `lastCheck` وفي التاريخ.
 *
 * `check.actual` لا يتغيّر: هو القيمة **وقت التسجيل**، وما رُصد بعدها في `lastCheck` — فتبقى المشكلة تقول
 * ما رآه المستخدم حين سجّلها ولو صارت محلولة.
 */
export function applyCheck(issue: IssueRecord, result: RecheckResult, at: number): IssueRecord {
  const status = statusFor(result.outcome)
  return {
    ...issue,
    status,
    updatedAt: at,
    lastCheck: { at, outcome: result.outcome, observed: result.observed, reason: result.reason },
    history: pushHistory(issue.history, {
      kind: 'check',
      at,
      status,
      outcome: result.outcome,
      observed: result.observed,
      reason: result.reason,
    }),
  }
}

/** تغيير الحالة يدويًّا بعد تحقّق المستخدم — يُكتب في التاريخ حدثًا مستقلًّا. */
export function withManualStatus(issue: IssueRecord, status: IssueStatus, at: number): IssueRecord {
  if (issue.status === status) return issue
  return {
    ...issue,
    status,
    updatedAt: at,
    history: pushHistory(issue.history, { kind: 'manual', at, status }),
  }
}

/** القيمة المعروضة «الآن»: آخر ما رُصد إن رُصد شيء، وإلا القيمة وقت التسجيل. */
export function currentValue(issue: IssueRecord): string | null {
  if (!issue.lastCheck) return issue.check.actual
  return issue.lastCheck.observed
}

/** عدد كل حالة — للرقاقات في النافذة والطبقة والمكتبة. */
export function countByStatus(
  list: readonly Pick<IssueRecord, 'status'>[],
): Record<IssueStatus, number> {
  const out: Record<IssueStatus, number> = { open: 0, 'needs-verification': 0, resolved: 0 }
  for (const issue of list) out[issue.status] += 1
  return out
}
