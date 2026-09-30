import { describe, expect, it } from 'vitest'

import { parseDraft, parseIssue, parseRecheck } from '@/modules/issues/schema'
import {
  CHECK_OUTCOMES,
  ISSUE_LIMITS,
  MAX_ISSUE_HISTORY,
  MAX_RECHECK,
  RECHECK_REASONS,
  type IssueHistoryEntry,
  type RecheckResult,
} from '@/shared/issue-schema'
import { type RasdError, type Result } from '@/shared/result'

import { draftFixture, identityFixture, issueFixture } from './fixture'

/**
 * حدّ الثقة (ADR 0030 §4): ما يُقرأ من القاعدة وما يصل من الصفحة يُتحقَّق منه قبل أن يُكتب.
 * الحمولة الفاسدة تُبنى هنا بنشر كائنٍ سليم مع تغيير حقلٍ واحد، فيُنسب السقوط إلى ذلك الحقل وحده.
 */

/** الخطأ من نتيجةٍ فاشلة — يفشل الاختبار إن نجحت. */
function errorOf<T>(result: Result<T>): RasdError {
  if (result.ok) throw new Error('توقّعنا رفضًا فنجحت القراءة')
  return result.error
}

/** حدثٌ يدوي واحد — أصغر عنصر صالح في التاريخ. */
const manual = (at: number): IssueHistoryEntry => ({ kind: 'manual', at, status: 'open' })

describe('parseIssue', () => {
  it('يقبل السجلّ الذي بناه `buildIssue` كما هو', () => {
    const issue = issueFixture()
    const parsed = parseIssue(issue)
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.value).toEqual(issue)
  })

  it('يقبل سجلًّا بآخر فحصٍ وتاريخٍ من الأنواع الثلاثة', () => {
    const issue = issueFixture({
      status: 'resolved',
      lastCheck: { at: 5_000, outcome: 'match', observed: '12px 24px', reason: null },
      history: [
        {
          kind: 'check',
          at: 5_000,
          status: 'resolved',
          outcome: 'match',
          observed: '12px 24px',
          reason: null,
        },
        { kind: 'manual', at: 3_000, status: 'needs-verification' },
        { kind: 'created', at: 1_000, status: 'open', observed: '14px 24px' },
      ],
    })
    expect(parseIssue(issue).ok).toBe(true)
  })

  it('نسخةٌ أحدث من قارئها تُرفض برسالتها لا بقراءة ناقصة', () => {
    const error = errorOf(parseIssue({ ...issueFixture(), schemaVersion: 2 }))
    expect(error.code).toBe('invalid-data')
    expect(error.message).toContain('نسخة أحدث')
    expect(error.detail).toBe('schemaVersion 2 > 1')
  })

  it('النسخة الأحدث تُرفض ولو كان باقي السجلّ فارغًا — الفحص قبل المخطّط', () => {
    const error = errorOf(parseIssue({ schemaVersion: 7 }))
    expect(error.code).toBe('invalid-data')
    expect(error.message).toContain('نسخة أحدث')
  })

  it('نسخةٌ أقدم أو غير رقمية سجلٌّ غير مقروء لا «أحدث»', () => {
    for (const schemaVersion of [0, '1', null]) {
      const error = errorOf(parseIssue({ ...issueFixture(), schemaVersion }))
      expect(error.code).toBe('invalid-data')
      expect(error.message).toBe('سجلّ مشكلة غير مقروء.')
    }
  })

  it('ما ليس كائنًا لا يسقط القارئ ويُرفض', () => {
    for (const raw of [null, undefined, 'issue', 42, []]) {
      const error = errorOf(parseIssue(raw))
      expect(error.code).toBe('invalid-data')
    }
  })

  it('يرفض السجلّ بلا عنوان أو بعنوان فارغ أو فوق الحدّ', () => {
    const { title: _title, ...untitled } = issueFixture()
    expect(errorOf(parseIssue(untitled)).detail).toContain('title')
    expect(parseIssue({ ...issueFixture(), title: '' }).ok).toBe(false)
    expect(parseIssue({ ...issueFixture(), title: 'ا'.repeat(ISSUE_LIMITS.title + 1) }).ok).toBe(
      false,
    )
    expect(parseIssue({ ...issueFixture(), title: 'ا'.repeat(ISSUE_LIMITS.title) }).ok).toBe(true)
  })

  it('التاريخ يقف عند حدّه: العشرون تُقبل والواحدة والعشرون تُرفض', () => {
    const history = (n: number) => Array.from({ length: n }, (_, i) => manual(i))
    expect(parseIssue(issueFixture({ history: history(MAX_ISSUE_HISTORY) })).ok).toBe(true)

    const error = errorOf(parseIssue(issueFixture({ history: history(MAX_ISSUE_HISTORY + 1) })))
    expect(error.code).toBe('invalid-data')
    expect(error.detail).toContain('history')
  })

  it('حالةٌ مجهولة تُرفض في السجلّ وفي التاريخ وفي حدث الإنشاء', () => {
    const unknown = 'closed' as unknown as 'open'
    expect(errorOf(parseIssue(issueFixture({ status: unknown }))).detail).toContain('status')
    expect(
      parseIssue(issueFixture({ history: [{ kind: 'manual', at: 1, status: unknown }] })).ok,
    ).toBe(false)
    expect(
      parseIssue(
        issueFixture({ history: [{ kind: 'created', at: 1, status: unknown, observed: '1px' }] }),
      ).ok,
    ).toBe(false)
  })

  it('نوع حدثٍ مجهول في التاريخ يُرفض', () => {
    const odd = { kind: 'deleted', at: 1, status: 'open' } as unknown as IssueHistoryEntry
    expect(parseIssue(issueFixture({ history: [odd] })).ok).toBe(false)
  })

  it('بصمةٌ بلا ثماني خانات ستّ عشرية صغيرة تُرفض', () => {
    for (const textHash of ['XYZ', '0A1B2C3D', '0a1b2c3', '0a1b2c3d0', '']) {
      const element = identityFixture({
        fingerprint: { tag: 'button', attrs: [], textHash, textLength: 3 },
      })
      const error = errorOf(parseIssue(issueFixture({ element })))
      expect(error.detail).toContain('textHash')
    }
  })

  it('محدِّدٌ فارغ ومقاسٌ سالب في الهوية يُرفضان', () => {
    expect(parseIssue(issueFixture({ element: identityFixture({ selector: '' }) })).ok).toBe(false)
    expect(
      parseIssue(
        issueFixture({ element: identityFixture({ rect: { x: 0, y: 0, width: -1, height: 1 } }) }),
      ).ok,
    ).toBe(false)
  })

  it('يرفض النتيجة والسبب المجهولين في آخر فحص', () => {
    const at = 1
    const badOutcome = { at, outcome: 'maybe', observed: null, reason: null }
    const badReason = { at, outcome: 'unreliable', observed: null, reason: 'because' }
    expect(parseIssue({ ...issueFixture(), lastCheck: badOutcome }).ok).toBe(false)
    expect(parseIssue({ ...issueFixture(), lastCheck: badReason }).ok).toBe(false)
  })

  it('كثافة البكسل الصفرية في صفحة السجلّ تُرفض', () => {
    const issue = issueFixture()
    const page = { ...issue.page, viewport: { ...issue.page.viewport, dpr: 0 } }
    expect(parseIssue({ ...issue, page }).ok).toBe(false)
  })

  it('الملاحظة والمشروع يقبلان `null` ويرفضان معرّفًا فارغًا', () => {
    expect(parseIssue(issueFixture({ note: null, projectId: null })).ok).toBe(true)
    expect(parseIssue(issueFixture({ projectId: '' })).ok).toBe(false)
    expect(parseIssue(issueFixture({ note: { captureId: 'c1', noteId: '' } })).ok).toBe(false)
  })
})

describe('parseDraft', () => {
  it('يقبل المسودّة السليمة ولا يغيّر شيئًا منها — إلا مستطيل اللقطة: تحسبه الخلفية لا الصفحة', () => {
    const draft = draftFixture()
    const parsed = parseDraft(draft)
    expect(parsed.ok).toBe(true)
    const { rect: _rect, ...shot } = draft.shot
    expect(parsed.ok && parsed.value).toEqual({ ...draft, shot })
  })

  it('يقصّ العنوان من طرفيه', () => {
    const parsed = parseDraft(draftFixture({ title: '   حشوة الزرّ  \n' }))
    expect(parsed.ok && parsed.value.title).toBe('حشوة الزرّ')
  })

  it('عنوانٌ كلّه مسافات يُرفض — القصّ قبل فحص الفراغ', () => {
    for (const title of ['', '   ', '\t\n ']) {
      const error = errorOf(parseDraft(draftFixture({ title })))
      expect(error.code).toBe('invalid-data')
      expect(error.detail).toContain('title')
    }
  })

  it('العنوان فوق حدّه يُرفض، وعلى الحدّ يُقبل، والمسافات حوله لا تُحتسب', () => {
    const atLimit = 'ا'.repeat(ISSUE_LIMITS.title)
    expect(errorOf(parseDraft(draftFixture({ title: `${atLimit}ا` }))).detail).toContain('title')
    expect(parseDraft(draftFixture({ title: atLimit })).ok).toBe(true)
    expect(parseDraft(draftFixture({ title: `  ${atLimit}  ` })).ok).toBe(true)
  })

  it('الوصف فوق حدّه يُرفض', () => {
    expect(parseDraft(draftFixture({ body: 'ب'.repeat(ISSUE_LIMITS.body) })).ok).toBe(true)
    expect(parseDraft(draftFixture({ body: 'ب'.repeat(ISSUE_LIMITS.body + 1) })).ok).toBe(false)
  })

  it('الخطوات فوق حدّ عددها تُرفض، والخطوة فوق حدّ طولها تُرفض', () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => `خطوة ${i}`)
    expect(parseDraft(draftFixture({ steps: steps(ISSUE_LIMITS.steps) })).ok).toBe(true)

    const error = errorOf(parseDraft(draftFixture({ steps: steps(ISSUE_LIMITS.steps + 1) })))
    expect(error.detail).toContain('steps')

    expect(parseDraft(draftFixture({ steps: ['خ'.repeat(ISSUE_LIMITS.step)] })).ok).toBe(true)
    expect(parseDraft(draftFixture({ steps: ['خ'.repeat(ISSUE_LIMITS.step + 1)] })).ok).toBe(false)
  })

  it('اللقطة بأكثر من الحدّ من المفاتيح تُرفض بحدّها، وعلى الحدّ تُقبل', () => {
    const snapshot = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`prop-${i}`, `${i}px`]))
    expect(parseDraft(draftFixture({ snapshot: snapshot(ISSUE_LIMITS.snapshot) })).ok).toBe(true)

    const error = errorOf(
      parseDraft(draftFixture({ snapshot: snapshot(ISSUE_LIMITS.snapshot + 1) })),
    )
    expect(error.code).toBe('invalid-data')
    expect(error.detail).toContain('لقطة فحص أكبر من حدّها')
  })

  it('قيمةٌ في اللقطة فوق حدّ الطول تُرفض', () => {
    const long = 'x'.repeat(ISSUE_LIMITS.value + 1)
    expect(parseDraft(draftFixture({ snapshot: { padding: long } })).ok).toBe(false)
  })

  it('مستطيل العنصر بفضاء `viewport` يُرفض — بفضاء الجهاز وحده', () => {
    const shot = draftFixture().shot
    const rect = { space: 'viewport', x: 0, y: 0, width: 10, height: 10 }
    const error = errorOf(parseDraft({ ...draftFixture(), shot: { ...shot, element: rect } }))
    expect(error.detail).toContain('shot.element.space')
  })

  it('كثافة اللقطة خارج (0.1 … 16] تُرفض', () => {
    const shot = draftFixture().shot
    for (const dpr of [0, 0.05, 17, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseDraft({ ...draftFixture(), shot: { ...shot, dpr } }).ok).toBe(false)
    }
    expect(parseDraft({ ...draftFixture(), shot: { ...shot, dpr: 16 } }).ok).toBe(true)
  })

  describe('فحص المسافة وحده يحمل عنصرًا ثانيًا', () => {
    const spacing = {
      kind: 'spacing',
      property: 'gap-left',
      actual: '16px',
      expected: '24px',
      tolerance: 1,
    } as const
    const pair = identityFixture({ selector: '.icon' })

    it('مسافةٌ بلا عنصر ثانٍ تُرفض برسالة القاعدة', () => {
      const error = errorOf(parseDraft(draftFixture({ check: spacing, pair: null })))
      expect(error.code).toBe('invalid-data')
      expect(error.detail).toContain('فحص المسافة وحده يحمل عنصرًا ثانيًا')
    })

    it('مسافةٌ بعنصر ثانٍ تُقبل', () => {
      const parsed = parseDraft(draftFixture({ check: spacing, pair }))
      expect(parsed.ok && parsed.value.pair?.selector).toBe('.icon')
    })

    it('نمطٌ بعنصر ثانٍ يُرفض', () => {
      const error = errorOf(parseDraft(draftFixture({ pair })))
      expect(error.detail).toContain('فحص المسافة وحده يحمل عنصرًا ثانيًا')
    })

    it.each(['colour', 'contrast'] as const)('%s بعنصر ثانٍ يُرفض كذلك', (kind) => {
      const check = { ...draftFixture().check, kind }
      expect(parseDraft(draftFixture({ check, pair })).ok).toBe(false)
      expect(parseDraft(draftFixture({ check, pair: null })).ok).toBe(true)
    })
  })

  it('الفحص بلا متوقَّعة أو بسماحٍ سالب أو فوق ألف يُرفض', () => {
    const check = draftFixture().check
    expect(parseDraft(draftFixture({ check: { ...check, expected: '' } })).ok).toBe(false)
    expect(parseDraft(draftFixture({ check: { ...check, tolerance: -1 } })).ok).toBe(false)
    expect(parseDraft(draftFixture({ check: { ...check, tolerance: 1001 } })).ok).toBe(false)
    expect(parseDraft(draftFixture({ check: { ...check, tolerance: 1000 } })).ok).toBe(true)
    expect(parseDraft(draftFixture({ check: { ...check, kind: 'layout' as 'style' } })).ok).toBe(
      false,
    )
  })

  it('مسودّةٌ ناقصة أو ليست كائنًا تُرفض ولا تُسقط القارئ', () => {
    const { withNote: _withNote, ...partial } = draftFixture()
    expect(parseDraft(partial).ok).toBe(false)
    for (const raw of [null, undefined, 'draft', 7]) {
      expect(errorOf(parseDraft(raw)).message).toBe('بيانات المشكلة غير صالحة.')
    }
  })
})

describe('parseRecheck', () => {
  const result = (over: Partial<RecheckResult> = {}): RecheckResult => ({
    id: 'i1',
    outcome: 'match',
    observed: '12px 24px',
    reason: null,
    ...over,
  })

  it('يقبل قائمةً سليمة كما هي، وفارغةً كذلك', () => {
    const list = [
      result(),
      result({ id: 'i2', outcome: 'not-found', observed: null, reason: 'missing' }),
    ]
    const parsed = parseRecheck(list)
    expect(parsed.ok && parsed.value).toEqual(list)
    expect(parseRecheck([]).ok).toBe(true)
  })

  it('يقبل كل نتيجةٍ من الخمس وكل سببٍ من الأسباب ولا سبب', () => {
    for (const outcome of CHECK_OUTCOMES) expect(parseRecheck([result({ outcome })]).ok).toBe(true)
    for (const reason of RECHECK_REASONS) expect(parseRecheck([result({ reason })]).ok).toBe(true)
    expect(parseRecheck([result({ observed: null, reason: null })]).ok).toBe(true)
  })

  it('المئة تُقبل وما فوقها يُرفض', () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => result({ id: `i${i}` }))
    expect(parseRecheck(list(MAX_RECHECK)).ok).toBe(true)

    const error = errorOf(parseRecheck(list(MAX_RECHECK + 1)))
    expect(error.code).toBe('invalid-data')
    expect(error.message).toBe('نتائج الفحص غير صالحة.')
  })

  it('نتيجةٌ مجهولة تُرفض ويُنسب الرفض إلى حقلها', () => {
    const error = errorOf(parseRecheck([result({ outcome: 'resolved' as 'match' })]))
    expect(error.detail).toContain('outcome')
  })

  it('سببٌ خارج قائمة الأسباب يُرفض', () => {
    const error = errorOf(parseRecheck([result({ reason: 'because' as 'missing' })]))
    expect(error.detail).toContain('reason')
  })

  it('القيمة المرصودة فوق حدّها ومعرّفٌ فارغ يُرفضان، والحالة ليست من الحمولة', () => {
    expect(parseRecheck([result({ observed: 'x'.repeat(ISSUE_LIMITS.value + 1) })]).ok).toBe(false)
    expect(parseRecheck([result({ id: '' })]).ok).toBe(false)

    // حقلٌ زائدٌ اسمه `status` لا يصل إلى الخرج: الحالة تُشتقّ في الخلفية وحدها.
    const parsed = parseRecheck([{ ...result(), status: 'resolved' }])
    expect(parsed.ok && Object.keys(parsed.value[0] ?? {})).not.toContain('status')
  })

  it('ما ليس مصفوفةً يُرفض', () => {
    for (const raw of [null, undefined, {}, 'list']) expect(parseRecheck(raw).ok).toBe(false)
  })
})
