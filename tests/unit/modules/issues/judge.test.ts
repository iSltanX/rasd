import { afterEach, describe, expect, it } from 'vitest'

import { completeDraft, evidenceRect, EVIDENCE_MARGIN_CSS } from '@/modules/issues/build'
import { lastCheckedLabel, valueLine, valueLines } from '@/modules/issues/labels'
import { judge, readIssue } from '@/modules/issues/observe'
import { parseObservations } from '@/modules/issues/schema'
import { applyCheck } from '@/modules/issues/status'

import { draftFixture, issueFixture } from './fixture'

import type { IssueObservation } from '@/shared/issue-schema'

/**
 * الحدّ بين الصفحة والخلفية (ADR 0031 §3): الصفحة تقرأ ولا تحكم، والخلفية تحكم على المتوقَّعة المخزَّنة وتبني
 * أسطر العرض ومستطيل اللقطة.
 */

const seen = (observed: string | null, over: Partial<IssueObservation> = {}): IssueObservation => ({
  id: 'i1',
  outcome: null,
  observed,
  reason: null,
  context: { rootFontPx: 16, fontPx: 16 },
  ...over,
})

describe('judge — الحكم على قراءة', () => {
  const check = issueFixture().check // padding: المتوقَّعة 12px 24px

  it('المرصودة تطابق المتوقَّعة المخزَّنة ⟵ match، وتختلف ⟵ mismatch', () => {
    expect(judge(check, seen('12px 24px'))).toEqual({
      id: 'i1',
      outcome: 'match',
      observed: '12px 24px',
      reason: null,
    })
    expect(judge(check, seen('14px 24px')).outcome).toBe('mismatch')
  })

  it('ما حسمته الصفحة يبقى كما هو بسببه', () => {
    expect(judge(check, seen(null, { outcome: 'not-found', reason: 'missing' }))).toEqual({
      id: 'i1',
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
    })
    expect(judge(check, seen('14px', { outcome: 'unreliable', reason: 'unlaid' })).outcome).toBe(
      'unreliable',
    )
  })

  it('قراءة بلا قيمة ولا حكم ⟵ unreliable لا match', () => {
    expect(judge(check, seen(null))).toMatchObject({ outcome: 'unreliable', reason: 'unreadable' })
  })

  it('مقاما rem/em من الصفحة: 1rem يطابق 20px على جذر 20 وحده', () => {
    const rem = { ...check, expected: '1rem', property: 'font-size' }
    expect(judge(rem, seen('20px', { context: { rootFontPx: 20, fontPx: 20 } })).outcome).toBe(
      'match',
    )
    expect(judge(rem, seen('20px')).outcome).toBe('mismatch')
    // بلا مقامين: الجذر 16 افتراضًا.
    expect(judge(rem, seen('16px', { context: null })).outcome).toBe('match')
  })

  it('متوقَّعةٌ مخزَّنة لا تُفهم لنوعها ⟵ unreliable بسبب القراءة لا mismatch', () => {
    const colour = { ...check, kind: 'colour' as const, expected: 'أزرق' }
    expect(judge(colour, seen('#3B82F6'))).toMatchObject({
      outcome: 'unreliable',
      reason: 'unreadable',
    })
  })
})

describe('readIssue — القراءة بلا حكم', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('عنصرٌ غائب ⟵ الصفحة تحسم not-found، ولا مقامات', () => {
    const observation = readIssue(issueFixture(), document)
    expect(observation).toEqual({
      id: 'i1',
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
      context: null,
    })
  })
})

describe('parseObservations — الصفحة لا تعلن مطابقة', () => {
  it('يقبل ثلاث نتائج تحسمها الصفحة وقراءةً بلا نتيجة', () => {
    const list = [
      seen('12px'),
      seen(null, { outcome: 'not-found', reason: 'missing', context: null }),
      seen(null, { outcome: 'changed', reason: 'multiple', context: null }),
      seen('3px', { outcome: 'unreliable', reason: 'animating' }),
    ]
    expect(parseObservations(list)).toEqual({ ok: true, value: list })
  })

  it.each(['match', 'mismatch', 'resolved'])('يرفض نتيجة «%s» من الصفحة', (outcome) => {
    const parsed = parseObservations([{ ...seen('12px'), outcome }])
    expect(parsed.ok).toBe(false)
  })

  it('يرفض مقامًا غير موجب ويقبل غيابه', () => {
    expect(parseObservations([seen('1px', { context: { rootFontPx: 0, fontPx: 16 } })]).ok).toBe(
      false,
    )
    expect(parseObservations([seen('1px', { context: null })]).ok).toBe(true)
  })
})

describe('evidenceRect و completeDraft — مستطيل اللقطة في الخلفية', () => {
  it('العنصر وحوله الهامش بكثافته، مقصوصًا إلى النافذة', () => {
    const margin = EVIDENCE_MARGIN_CSS * 2
    const rect = evidenceRect(
      { space: 'device', x: 200, y: 400, width: 368, height: 96 },
      { width: 1440, height: 900 },
      2,
    )
    expect(rect).toEqual({
      space: 'device',
      x: 200 - margin,
      y: 400 - margin,
      width: 368 + margin * 2,
      height: 96 + margin * 2,
    })
  })

  it('عند حافّة النافذة لا يخرج منها ولا يصير سالبًا', () => {
    const rect = evidenceRect(
      { space: 'device', x: 10, y: 1780, width: 50, height: 40 },
      { width: 1440, height: 900 },
      2,
    )
    expect(rect.x).toBe(0)
    expect(rect.y + rect.height).toBe(1800)
    expect(rect.width).toBeGreaterThan(0)
  })

  it('completeDraft يضيف المستطيل ولا يمسّ غيره', () => {
    const { rect: _rect, ...shot } = draftFixture().shot
    const input = { ...draftFixture(), shot }
    const complete = completeDraft(input)
    expect(complete.shot.rect).toEqual(evidenceRect(shot.element, input.viewport, shot.dpr))
    expect({ ...complete, shot: input.shot }).toEqual(input)
  })
})

describe('أسطر العرض — تبنيها الخلفية', () => {
  it('المفتوحة بالقيمتين، والمحلولة «يطابق المتوقَّع»، والتي تحتاج تحققًا بسببها', () => {
    const open = issueFixture()
    expect(valueLine(open)).toBe('الآن 14px 24px · المتوقَّع 12px 24px')

    const resolved = applyCheck(
      open,
      { id: 'i1', outcome: 'match', observed: '12px 24px', reason: null },
      5,
    )
    expect(valueLine(resolved)).toBe('الآن 12px 24px — يطابق المتوقَّع')

    const missing = applyCheck(
      open,
      { id: 'i1', outcome: 'not-found', observed: null, reason: 'missing' },
      6,
    )
    expect(valueLine(missing)).toBe('لم يُعثر على العنصر في آخر فحص')
    expect(valueLines([open, { ...resolved, id: 'i2' }])).toEqual({
      i1: valueLine(open),
      i2: valueLine(resolved),
    })
  })

  it('«آخر فحص» من أحدث فحصٍ محفوظ، أو «لم تُفحص بعد»', () => {
    const open = issueFixture()
    expect(lastCheckedLabel([open])).toBe('لم تُفحص بعد')
    const at = 1_000_000
    const checked = applyCheck(
      open,
      { id: 'i1', outcome: 'mismatch', observed: '1px', reason: null },
      at,
    )
    expect(lastCheckedLabel([open, checked], at + 3 * 60_000)).toBe('آخر فحص قبل ٣ دقائق')
  })
})
