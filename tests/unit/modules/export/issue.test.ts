import { describe, expect, it } from 'vitest'

import { toBase64 } from '@/modules/export/integrations/github'
import {
  assetTargets,
  BODY_LIMIT,
  checkIssue,
  composeBody,
  DEFAULT_ISSUE_OPTIONS,
  defaultIntro,
  defaultTitle,
  inlineTargets,
  planIssue,
  TITLE_LIMIT,
  withImageTargets,
  type IssueInput,
  type IssueOptions,
} from '@/modules/export/integrations/issue'
import { markdownImages, renderEntries } from '@/modules/handoff/markdown'
import { buildHandoff } from '@/modules/handoff/model'
import { FSI, LRI, PDI } from '@/shared/bidi/isolate'

import { COLOUR_ISSUE, KNOWN_ISSUE, META, OPTIONS, SPACING_ISSUE } from '../handoff/fixture'

/**
 * نصّ الـIssue — `STAGES/12`، معيار القبول الأوّل: **كل الحقول المطلوبة في النصّ وبترتيبها.**
 *
 * يُبنى بعارض Markdown الذي تبني به الحزمة (`renderEntries`): الاختبار الأخير يثبت أن النصّ جزءٌ من مخرَج الحزمة
 * حرفًا — فلا صياغةَ موازية تنحرف عنها.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 251, 252])

const input = (over: Partial<IssueInput> = {}): IssueInput => ({
  issues: [KNOWN_ISSUE],
  source: 'لقطة في المحرّر',
  generatedAt: META.generatedAt,
  version: META.version,
  baked: new Map([['capture-cta', PNG]]),
  ...over,
})

const visible = (text: string): string =>
  text.replaceAll(LRI, '⟨').replaceAll(FSI, '⟪').replaceAll(PDI, '⟩')

const plan = (over: Partial<IssueOptions> = {}, i: IssueInput = input()) => {
  const planned = planIssue(i, { ...DEFAULT_ISSUE_OPTIONS, ...over })
  if (!planned.ok) throw new Error(planned.error.message)
  return planned.value
}

describe('الحقول المطلوبة وترتيبها', () => {
  const body = visible(
    composeBody('مقدّمة المستخدم.', plan(), (name) => `https://example.test/${name}`),
  )

  it('المقدّمة، ثمّ عنوان المشكلة، ثمّ الحالة والصفحة والمقاس والمحدِّد والفحص والقيمتان، ثمّ الملاحظة والخطوات والدليل', () => {
    const order = [
      'مقدّمة المستخدم.',
      '## ١. حشوة الزرّ الرئيسي أكبر من التصميم',
      '- الحالة:',
      '- الصفحة:',
      '- المقاس:',
      '- المحدِّد:',
      '- الفحص:',
      '- الآن:',
      '- المتوقَّع:',
      '> الحشوة الرأسية',
      '### خطوات الإعادة',
      '### الدليل',
      '![مقتطع حول',
    ]
    const positions = order.map((needle) => body.indexOf(needle))
    expect(
      positions.every((p) => p >= 0),
      order.filter((_, i) => positions[i]! < 0).join(),
    ).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('رابط الصفحة بلا معاملاته، ولا رأس حزمةٍ في البلاغ', () => {
    expect(body).toContain('⟨`https://northwind.com/pricing`⟩')
    expect(body).not.toContain('utm_source')
    expect(body).not.toContain('# حزمة التسليم')
    expect(body).not.toContain('### الخصائص')
  })

  it('النصّ جزءٌ حرفيٌّ من مخرَج الحزمة نفسه — لا صياغة موازية', () => {
    const model = buildHandoff([KNOWN_ISSUE], { ...OPTIONS, properties: false }, META)
    const markdown = renderEntries(model.entries)
    expect(plan().markdown).toBe(markdown)
  })

  it('العنوان المقترَح أوّل مشكلة، وعدد الباقي إن زادت', () => {
    expect(defaultTitle([KNOWN_ISSUE])).toBe('حشوة الزرّ الرئيسي أكبر من التصميم')
    expect(defaultTitle([KNOWN_ISSUE, SPACING_ISSUE, COLOUR_ISSUE])).toBe(
      'حشوة الزرّ الرئيسي أكبر من التصميم (+2)',
    )
    expect(defaultIntro([KNOWN_ISSUE, SPACING_ISSUE], 'لقطة في المحرّر')).toBe(
      'مشكلتان من لقطة في المحرّر.',
    )
  })
})

describe('ما يُضمَّن', () => {
  it('«الملاحظات» مطفأة: لا نصّ ولا خطوات، وبقية الأقسام باقية', () => {
    const md = plan({ notes: false }).markdown
    expect(md).not.toContain('> الحشوة الرأسية')
    expect(md).not.toContain('### خطوات الإعادة')
    expect(md).toContain('- المحدِّد:')
    expect(md).toContain('### الدليل')
  })

  it('«رابط الصفحة» مطفأ: لا رابط ولا عنوان تبويب — ويبقى المقاس', () => {
    const md = plan({ pageLink: false }).markdown
    expect(md).not.toContain('northwind.com')
    expect(md).not.toContain('Pricing')
    expect(md).not.toContain('- الصفحة:')
    expect(md).toContain('- المقاس:')
  })

  it('بيانات الدخول في الرابط لا تخرج ولو أُبقي الرابط', () => {
    const withAuth = {
      ...KNOWN_ISSUE,
      page: { ...KNOWN_ISSUE.page, url: 'https://user:secret@northwind.com/p?token=abc' },
    }
    const md = plan({}, input({ issues: [withAuth] })).markdown
    expect(md).not.toContain('secret')
    expect(md).not.toContain('token=abc')
  })
})

describe('الصورة: خياران صريحان', () => {
  const issueBody = (resolve: (name: string) => string) => composeBody('', plan(), resolve)

  it('base64 في النصّ: البايتات نفسها داخل الرابط، وبلا رفع', () => {
    const p = plan()
    const text = composeBody('', p, inlineTargets(p.images))
    const [target] = markdownImages(text)
    expect(target).toBe(`data:image/png;base64,${toBase64(PNG)}`)
    expect(atob(target!.split(',')[1]!).length).toBe(PNG.length)
  })

  it('أصل في المستودع: مسارٌ بلحظة البلاغ، وعنوانٌ مثبَّت على الالتزام', () => {
    const p = plan()
    expect(p.images).toEqual([
      {
        name: 'images/issue-01.png',
        bytes: PNG,
        path: '.rasd/issues/20260930-120000/issue-01.png',
      },
    ])
    const commits = new Map([[p.images[0]!.path, 'abc1234def']])
    const text = composeBody('', p, assetTargets('northwind', 'web', p.images, commits))
    expect(markdownImages(text)).toEqual([
      'https://github.com/northwind/web/blob/abc1234def/.rasd/issues/20260930-120000/issue-01.png?raw=true',
    ])
  })

  it('لقطتان مختلفتان صورتان، ومشكلتان من لقطة واحدة صورة واحدة', () => {
    const second = { ...SPACING_ISSUE, evidence: { ...SPACING_ISSUE.evidence, captureId: 'other' } }
    const twin = { ...COLOUR_ISSUE, evidence: { ...KNOWN_ISSUE.evidence } }
    const baked = new Map([
      ['capture-cta', PNG],
      ['other', PNG],
    ])
    expect(plan({}, input({ issues: [KNOWN_ISSUE, second], baked })).images).toHaveLength(2)
    expect(plan({}, input({ issues: [KNOWN_ISSUE, twin], baked })).images).toHaveLength(1)
  })

  it('صورةٌ يذكرها النصّ ولم تُخبَز تُرفض باسمها — لا مرجع مكسور', () => {
    const planned = planIssue(input({ baked: new Map() }), DEFAULT_ISSUE_OPTIONS)
    expect(planned.ok).toBe(false)
    expect(!planned.ok && planned.error.detail).toBe('images/issue-01.png')
  })

  it('الاستبدال يمسّ أسطر الصور وحدها', () => {
    const text = withImageTargets(
      'نصّ ![ليس صورة](images/x.png) في سطر\n![حقيقية](images/a.png)',
      () => 'U',
    )
    expect(text).toBe('نصّ ![ليس صورة](images/x.png) في سطر\n![حقيقية](U)')
    expect(issueBody(() => 'U')).toContain('(U)')
  })
})

describe('حدود GitHub', () => {
  it('عنوانٌ فارغ أو أطول من 256 مرفوض', () => {
    expect(checkIssue('  ', 'نصّ')).toBe('title-empty')
    expect(checkIssue('ع'.repeat(TITLE_LIMIT + 1), 'نصّ')).toBe('title-too-long')
    expect(checkIssue('ع'.repeat(TITLE_LIMIT), 'نصّ')).toBeNull()
  })

  it('نصٌّ فوق 65536 مرفوض قبل الإرسال — وصورة base64 كبيرة تبلغه، والأصل لا', () => {
    expect(checkIssue('عنوان', 'ن'.repeat(BODY_LIMIT + 1))).toBe('body-too-long')
    expect(checkIssue('عنوان', 'ن'.repeat(BODY_LIMIT))).toBeNull()

    const big = new Uint8Array(60_000).map((_, i) => i % 251)
    const p = plan({}, input({ baked: new Map([['capture-cta', big]]) }))
    const inline = composeBody('', p, inlineTargets(p.images))
    const asset = composeBody('', p, () => 'https://github.com/o/r/blob/abc1234/x.png?raw=true')
    expect(checkIssue('عنوان', inline)).toBe('body-too-long')
    expect(checkIssue('عنوان', asset)).toBeNull()
  })
})
