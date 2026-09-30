import { describe, expect, it } from 'vitest'

import {
  compareValue,
  isValidExpected,
  lengthPx,
  ratioOf,
  splitTokens,
  type ComparedCheck,
} from '@/modules/issues/values'

/**
 * التطبيع والمقارنة: المتوقَّعة يكتبها إنسان، والمرصودة يقرؤها المتصفّح — والمقارنة على المعنى.
 */

const style = (expected: string, property = 'color', tolerance = 0): ComparedCheck => ({
  kind: 'style',
  property,
  expected,
  tolerance,
})

const root16 = { rootFontPx: 16, fontPx: 16 }

describe('الألوان', () => {
  it('`#3b82f6` يساوي `rgb(59 130 246)` ويساوي صيغة الفواصل', () => {
    expect(compareValue(style('#3b82f6'), 'rgb(59 130 246)')).toBe('match')
    expect(compareValue(style('#3B82F6'), 'rgb(59, 130, 246)')).toBe('match')
    expect(compareValue({ ...style('rgb(59 130 246)'), kind: 'colour' }, '#3b82f6')).toBe('match')
  })

  it('لونٌ آخر اختلاف، والسماح بفرق OKLab ×100 يقبل القريب', () => {
    expect(compareValue(style('#3b82f6'), 'rgb(59 130 247)')).toBe('mismatch')
    expect(compareValue(style('#3b82f6', 'color', 2), 'rgb(59 130 247)')).toBe('match')
    expect(compareValue(style('#3b82f6', 'color', 2), '#ef4444')).toBe('mismatch')
  })

  it('الشفافية المختلفة اختلاف ولو تطابقت القنوات', () => {
    expect(compareValue(style('#3b82f6'), 'rgba(59, 130, 246, 0.5)')).toBe('mismatch')
    expect(compareValue(style('#3b82f6', 'color', 5), 'rgba(59, 130, 246, 0.5)')).toBe('mismatch')
  })

  it('نوع اللون بقيمة لا تُفهم لونًا: غير صالحة لا «مفتوحة»', () => {
    expect(compareValue({ ...style('أزرق'), kind: 'colour' }, '#3b82f6')).toBe('invalid')
  })
})

describe('الأطوال', () => {
  it('`16px` يساوي `1rem` على جذر 16، ولا يساويه على جذر 20', () => {
    expect(compareValue(style('1rem', 'font-size'), '16px', root16)).toBe('match')
    expect(compareValue(style('16px', 'font-size'), '1rem', root16)).toBe('match')
    expect(compareValue(style('1rem', 'font-size'), '16px', { rootFontPx: 20, fontPx: 16 })).toBe(
      'mismatch',
    )
  })

  it('`em` على خطّ العنصر لا على الجذر', () => {
    expect(compareValue(style('1.5em', 'padding'), '21px', { rootFontPx: 16, fontPx: 14 })).toBe(
      'match',
    )
  })

  it('سماح المسافات يُحترم في حدّيه', () => {
    const gap = (tolerance: number): ComparedCheck => ({
      kind: 'spacing',
      property: 'gap-left',
      expected: '24px',
      tolerance,
    })
    expect(compareValue(gap(1), '23px')).toBe('match')
    expect(compareValue(gap(1), '25px')).toBe('match')
    expect(compareValue(gap(1), '25.5px')).toBe('mismatch')
    expect(compareValue(gap(0), '24px')).toBe('match')
    expect(compareValue(gap(0), '24.01px')).toBe('mismatch')
    expect(compareValue(gap(2), '1.5rem')).toBe('match')
  })

  it('الاختصار يُوسَّع على الجوانب الأربعة: `12px 24px` = `12px 24px 12px 24px`', () => {
    expect(compareValue(style('12px 24px', 'padding'), '12px 24px 12px 24px')).toBe('match')
    expect(compareValue(style('12px', 'padding'), '12px 12px')).toBe('match')
    expect(compareValue(style('12px 24px', 'padding'), '14px 24px')).toBe('mismatch')
    expect(compareValue(style('0', 'margin'), '0px')).toBe('match')
    expect(compareValue(style('1px 2px 3px 4px 5px', 'padding'), '1px')).toBe('mismatch')
  })

  it('المسافة بقيمة ليست طولًا غير صالحة', () => {
    expect(
      compareValue({ kind: 'spacing', property: 'dx', expected: 'واسعة', tolerance: 0 }, '16px'),
    ).toBe('invalid')
  })
})

describe('الأرقام والنصوص', () => {
  it('`line-height` بلا وحدة يُحلّ على خطّ العنصر', () => {
    expect(compareValue(style('1.6', 'line-height'), '25.6px', root16)).toBe('match')
    expect(compareValue(style('1.5', 'line-height'), '25.6px', root16)).toBe('mismatch')
  })

  it('الأرقام المجرّدة بالسماح', () => {
    expect(compareValue(style('600', 'font-weight'), '600')).toBe('match')
    expect(compareValue(style('0.5', 'opacity', 0.1), '0.45')).toBe('match')
    expect(compareValue(style('0.5', 'opacity'), '0.45')).toBe('mismatch')
  })

  it('الكلمات بلا حالة أحرف ولا علامات اقتباس ولا فرق مسافات', () => {
    expect(compareValue(style('inline-flex', 'display'), 'inline-flex')).toBe('match')
    expect(compareValue(style('Inter, sans-serif', 'font-family'), '"Inter",sans-serif')).toBe(
      'match',
    )
    expect(compareValue(style('flex', 'display'), 'block')).toBe('mismatch')
  })
})

describe('التباين', () => {
  const contrast = (expected: string): ComparedCheck => ({
    kind: 'contrast',
    property: 'color/background-color',
    expected,
    tolerance: 0,
  })

  it('المتوقَّعة حدٌّ أدنى بأي صيغة كُتبت', () => {
    expect(compareValue(contrast('4.5'), '4.50')).toBe('match')
    expect(compareValue(contrast('4.5:1'), '7.12')).toBe('match')
    expect(compareValue(contrast('≥ 4.5 : 1'), '3.68')).toBe('mismatch')
    expect(compareValue(contrast('4.5'), 'غير مقروءة')).toBe('invalid')
  })

  it('`ratioOf` يرفض ما دون 1 وما ليس رقمًا', () => {
    expect(ratioOf('0.5')).toBeNull()
    expect(ratioOf('AA')).toBeNull()
    expect(ratioOf('3 : 1')).toBe(3)
  })
})

describe('isValidExpected — النموذج يمنع الحفظ بدونها', () => {
  it.each([
    ['contrast', '4.5', true],
    ['contrast', 'AA', false],
    ['colour', '#6D28D9', true],
    ['colour', 'بنفسجي', false],
    ['spacing', '24px', true],
    ['spacing', '24px 8px', false],
    ['style', 'inline-flex', true],
    ['style', '   ', false],
  ] as const)('%s «%s» ⟵ %s', (kind, value, valid) => {
    expect(isValidExpected(kind, value)).toBe(valid)
  })
})

describe('المساعدات', () => {
  it('التقسيم لا يكسر ما بين الأقواس', () => {
    expect(splitTokens('0 1px 2px rgb(0 0 0 / .06)')).toEqual([
      '0',
      '1px',
      '2px',
      'rgb(0 0 0 / .06)',
    ])
    expect(splitTokens('  ')).toEqual([])
  })

  it('`lengthPx` يعرف px وrem وem والصفر المجرّد وحده', () => {
    expect(lengthPx('2rem', root16)).toBe(32)
    expect(lengthPx('0', root16)).toBe(0)
    expect(lengthPx('12', root16)).toBeNull()
    expect(lengthPx('50%', root16)).toBeNull()
  })
})
