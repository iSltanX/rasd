import { describe, expect, it } from 'vitest'

import {
  applyCheck,
  countByStatus,
  currentValue,
  statusFor,
  withManualStatus,
} from '@/modules/issues/status'
import {
  CHECK_OUTCOMES,
  MAX_ISSUE_HISTORY,
  type CheckOutcome,
  type IssueRecord,
  type IssueStatus,
} from '@/shared/issue-schema'

import { issueFixture } from './fixture'

/**
 * قاعدة الحالة (ADR 0030 §2): النتائج الخمس تعطي الحالات الثلاث، والتاريخ يحفظ ما جرى.
 */

describe('statusFor — النتائج الخمس ⟵ الحالات الثلاث', () => {
  const table: [CheckOutcome, IssueStatus][] = [
    ['match', 'resolved'],
    ['mismatch', 'open'],
    ['not-found', 'needs-verification'],
    ['changed', 'needs-verification'],
    ['unreliable', 'needs-verification'],
  ]

  it.each(table)('%s ⟵ %s', (outcome, status) => {
    expect(statusFor(outcome)).toBe(status)
  })

  it('الجدول يغطّي كل النتائج ويعطي الحالات الثلاث كلّها', () => {
    expect(table.map(([o]) => o).sort()).toEqual([...CHECK_OUTCOMES].sort())
    expect(new Set(CHECK_OUTCOMES.map(statusFor))).toEqual(
      new Set(['open', 'needs-verification', 'resolved']),
    )
  })
})

describe('applyCheck', () => {
  it('المطابقة تحلّ المشكلة وتكتب القيمة المرصودة في آخر فحص وفي التاريخ', () => {
    const issue = issueFixture()
    const next = applyCheck(
      issue,
      { id: issue.id, outcome: 'match', observed: '12px 24px', reason: null },
      5_000,
    )
    expect(next.status).toBe('resolved')
    expect(next.updatedAt).toBe(5_000)
    expect(next.lastCheck).toEqual({
      at: 5_000,
      outcome: 'match',
      observed: '12px 24px',
      reason: null,
    })
    expect(next.history[0]).toEqual({
      kind: 'check',
      at: 5_000,
      status: 'resolved',
      outcome: 'match',
      observed: '12px 24px',
      reason: null,
    })
    // القيمة وقت التسجيل تبقى كما هي — «الآن» في آخر فحص.
    expect(next.check.actual).toBe(issue.check.actual)
    expect(currentValue(next)).toBe('12px 24px')
    expect(currentValue(issue)).toBe(issue.check.actual)
  })

  it('غياب العنصر يجعلها تحتاج تحققًا بسببه ولا قيمة مرصودة', () => {
    const issue = issueFixture()
    const next = applyCheck(
      issue,
      { id: issue.id, outcome: 'not-found', observed: null, reason: 'missing' },
      6_000,
    )
    expect(next.status).toBe('needs-verification')
    expect(next.lastCheck?.reason).toBe('missing')
    expect(currentValue(next)).toBeNull()
  })

  it('التاريخ يقف عند حدّه والأحدث أوّلًا', () => {
    let issue: IssueRecord = issueFixture()
    for (let i = 0; i < MAX_ISSUE_HISTORY + 7; i++) {
      issue = applyCheck(
        issue,
        { id: issue.id, outcome: i % 2 ? 'match' : 'mismatch', observed: `${i}px`, reason: null },
        10_000 + i,
      )
    }
    expect(issue.history).toHaveLength(MAX_ISSUE_HISTORY)
    expect(issue.history[0]?.at).toBe(10_000 + MAX_ISSUE_HISTORY + 6)
    expect(issue.history.some((h) => h.kind === 'created')).toBe(false)
  })
})

describe('withManualStatus', () => {
  it('يغيّر الحالة ويكتب حدثًا يدويًّا', () => {
    const issue = issueFixture()
    const next = withManualStatus(issue, 'resolved', 7_000)
    expect(next.status).toBe('resolved')
    expect(next.history[0]).toEqual({ kind: 'manual', at: 7_000, status: 'resolved' })
    expect(next.history).toHaveLength(issue.history.length + 1)
  })

  it('الحالة نفسها لا تكتب حدثًا', () => {
    const issue = issueFixture()
    expect(withManualStatus(issue, issue.status, 7_000)).toBe(issue)
  })
})

describe('countByStatus', () => {
  it('يعدّ كل حالة ويبدأ الغائبة بصفر', () => {
    expect(countByStatus([{ status: 'open' }, { status: 'open' }, { status: 'resolved' }])).toEqual(
      { open: 2, 'needs-verification': 0, resolved: 1 },
    )
  })
})
