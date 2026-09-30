import { describe, expect, it } from 'vitest'

import {
  CONTRAST_LEVELS,
  KIND_LABEL,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  displayExpected,
  displayTolerance,
  displayValue,
  propertyLabel,
  subjectLine,
} from '@/modules/issues/labels'
import { ratioOf } from '@/modules/issues/values'
import {
  CHECK_KINDS,
  CONTRAST_PROPERTY,
  ISSUE_STATUSES,
  RECHECK_REASONS,
  SPACING_PROPERTIES,
  type CheckKind,
  type IssueCheck,
} from '@/shared/issue-schema'

import { identityFixture, issueFixture } from './fixture'

/**
 * التسميات في موضع واحد (ADR 0030): الطبقة والنافذة والمكتبة والمحرّر تعرض الحالة نفسها والسبب نفسه.
 */

const check = (kind: CheckKind, property: string, over: Partial<IssueCheck> = {}): IssueCheck => ({
  kind,
  property,
  actual: '14px',
  expected: '12px',
  tolerance: 0,
  ...over,
})

describe('الحالة', () => {
  it('لكل حالةٍ تسميةٌ عربية غير فارغة، والمفاتيح هي الحالات نفسها', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...ISSUE_STATUSES].sort())
    for (const status of ISSUE_STATUSES) {
      expect(STATUS_LABEL[status].trim()).not.toBe('')
    }
    expect(new Set(ISSUE_STATUSES.map((s) => STATUS_LABEL[s])).size).toBe(ISSUE_STATUSES.length)
  })

  it('لكل حالةٍ درجة، ولكل حالةٍ درجتها هي لا درجة غيرها', () => {
    expect(Object.keys(STATUS_TONE).sort()).toEqual([...ISSUE_STATUSES].sort())
    expect(STATUS_TONE).toEqual({
      open: 'danger',
      'needs-verification': 'warning',
      resolved: 'success',
    })
    expect(new Set(ISSUE_STATUSES.map((s) => STATUS_TONE[s])).size).toBe(ISSUE_STATUSES.length)
  })

  it('النصوص كما تُعرض للمستخدم', () => {
    expect(STATUS_LABEL).toEqual({
      open: 'مفتوحة',
      'needs-verification': 'تحتاج تحققًا',
      resolved: 'محلولة',
    })
  })
})

describe('سبب «تحتاج تحققًا»', () => {
  it('كل سببٍ في `RECHECK_REASONS` له سطرٌ غير فارغ، ولا سطرَ بلا سبب', () => {
    for (const reason of RECHECK_REASONS) {
      expect(REASON_LABEL[reason].trim(), reason).not.toBe('')
    }
    expect(Object.keys(REASON_LABEL).sort()).toEqual([...RECHECK_REASONS].sort())
  })

  it('لا سببان بسطرٍ واحد — وإلا لم يقل السطر شيئًا يميّزه', () => {
    const lines = RECHECK_REASONS.map((r) => REASON_LABEL[r])
    expect(new Set(lines).size).toBe(lines.length)
  })
})

describe('نوع الفحص', () => {
  it('لكل نوعٍ تسميةٌ غير فارغة', () => {
    expect(Object.keys(KIND_LABEL).sort()).toEqual([...CHECK_KINDS].sort())
    for (const kind of CHECK_KINDS) expect(KIND_LABEL[kind].trim()).not.toBe('')
  })
})

describe('propertyLabel', () => {
  it('المسافة بالعربية: `dx` ⟵ الفرق الأفقي', () => {
    expect(propertyLabel(check('spacing', 'dx'))).toBe('الفرق الأفقي')
    expect(propertyLabel(check('spacing', 'dy'))).toBe('الفرق الرأسي')
  })

  it('كل خاصّيات المسافة الست لها تسميةٌ غير اسمها التقني', () => {
    for (const property of SPACING_PROPERTIES) {
      const label = propertyLabel(check('spacing', property))
      expect(label, property).not.toBe(property)
      expect(label.trim(), property).not.toBe('')
    }
    expect(propertyLabel(check('spacing', 'gap-left'))).toBe('الفجوة (يسار)')
  })

  it('مسافةٌ بخاصّية لا تعرفها القائمة تُعرض كما هي', () => {
    expect(propertyLabel(check('spacing', 'gap-diagonal'))).toBe('gap-diagonal')
  })

  it('التباين: زوجه `color / background` أيًّا كانت الخاصّية المخزَّنة', () => {
    expect(propertyLabel(check('contrast', CONTRAST_PROPERTY))).toBe('color / background')
    expect(propertyLabel(check('contrast', 'أي شيء'))).toBe('color / background')
  })

  it('النمط واللون: خاصّية CSS كما هي', () => {
    expect(propertyLabel(check('style', 'padding'))).toBe('padding')
    expect(propertyLabel(check('style', 'font-size'))).toBe('font-size')
    expect(propertyLabel(check('colour', 'background-color'))).toBe('background-color')
  })
})

describe('displayValue', () => {
  it('التباين بصيغته `3.68 : 1`', () => {
    expect(displayValue('contrast', '3.68')).toBe('3.68 : 1')
  })

  it('ما عداه كما هو', () => {
    expect(displayValue('style', '12px 24px')).toBe('12px 24px')
    expect(displayValue('spacing', '16px')).toBe('16px')
    expect(displayValue('colour', '#3b82f6')).toBe('#3b82f6')
  })

  it('لا قيمة ⟵ شرطة، لكل نوعٍ', () => {
    for (const kind of CHECK_KINDS) expect(displayValue(kind, null)).toBe('—')
  })

  it('القيمة الفارغة نصًّا ليست «لا قيمة»', () => {
    expect(displayValue('style', '')).toBe('')
  })
})

describe('displayExpected', () => {
  it('التباين حدٌّ أدنى `≥ 4.5 : 1`', () => {
    expect(displayExpected({ kind: 'contrast', expected: '4.5' })).toBe('≥ 4.5 : 1')
  })

  it('ما عداه كما كُتب', () => {
    expect(displayExpected({ kind: 'style', expected: '12px 24px' })).toBe('12px 24px')
    expect(displayExpected({ kind: 'colour', expected: '#6D28D9' })).toBe('#6D28D9')
    expect(displayExpected({ kind: 'spacing', expected: '24px' })).toBe('24px')
  })
})

describe('displayTolerance', () => {
  it('التباين بلا سماح: المتوقَّعة فيه حدٌّ أدنى', () => {
    expect(displayTolerance({ kind: 'contrast', tolerance: 3 })).toBe('—')
  })

  it('اللون بفرق الإدراك ΔE', () => {
    expect(displayTolerance({ kind: 'colour', tolerance: 2 })).toBe('ΔE 2')
    expect(displayTolerance({ kind: 'colour', tolerance: 0 })).toBe('ΔE 0')
  })

  it('النمط والمسافة بالبكسل', () => {
    expect(displayTolerance({ kind: 'style', tolerance: 0 })).toBe('±0px')
    expect(displayTolerance({ kind: 'style', tolerance: 1.5 })).toBe('±1.5px')
    expect(displayTolerance({ kind: 'spacing', tolerance: 1 })).toBe('±1px')
  })
})

describe('subjectLine', () => {
  it('النمط: المحدِّد والخاصّية', () => {
    expect(subjectLine(issueFixture())).toBe('.cta-btn · padding')
  })

  it('المسافة: المحدِّد و`gap` أيًّا كان الاتجاه', () => {
    const issue = issueFixture({ check: check('spacing', 'gap-left'), pair: identityFixture() })
    expect(subjectLine(issue)).toBe('.cta-btn · gap')
    expect(subjectLine({ ...issue, check: check('spacing', 'dx') })).toBe('.cta-btn · gap')
  })

  it('التباين: المحدِّد والزوج بنقطة وسطى بدل الشرطة المائلة', () => {
    const issue = issueFixture({ check: check('contrast', CONTRAST_PROPERTY) })
    expect(subjectLine(issue)).toBe('.cta-btn · color · background-color')
  })

  it('اللون: المحدِّد والخاصّية', () => {
    const issue = issueFixture({ check: check('colour', 'background-color') })
    expect(subjectLine(issue)).toBe('.cta-btn · background-color')
  })

  it('المحدِّد من هوية العنصر نفسه', () => {
    const issue = issueFixture({ element: identityFixture({ selector: '#hero > h1' }) })
    expect(subjectLine(issue)).toBe('#hero > h1 · padding')
  })
})

describe('CONTRAST_LEVELS', () => {
  it('كل مستوى بعنوانٍ وحدٍّ أدنى صالحٍ نسبةً', () => {
    expect(CONTRAST_LEVELS.length).toBeGreaterThan(0)
    for (const level of CONTRAST_LEVELS) {
      expect(level.label.trim()).not.toBe('')
      expect(ratioOf(level.min), level.label).not.toBeNull()
    }
  })

  it('الحدود من WCAG: 4.5 و3 و7', () => {
    expect(new Set(CONTRAST_LEVELS.map((l) => l.min))).toEqual(new Set(['4.5', '3', '7']))
  })
})
