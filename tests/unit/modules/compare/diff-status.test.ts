import { describe, expect, it } from 'vitest'

import { classifyDiffStatus, DIFF_STATUS_LABELS } from '@/modules/compare/diff-status'

describe('classifyDiffStatus — النقطتان المرجعيتان من إطار Figma 127:315', () => {
  it('٧٫٩٪ (بطاقة «فروق كبيرة» في الإطار) ⇒ major', () => {
    expect(classifyDiffStatus(0.079)).toBe('major')
  })

  it('لا قياس (بطاقة «لم يُقارَن» + «—» في الإطار) ⇒ unmeasured', () => {
    expect(classifyDiffStatus(null)).toBe('unmeasured')
  })
})

describe('classifyDiffStatus — الصفر بالضبط', () => {
  it('صفرٌ تامّ وحده «مطابق» — لا تقريب إليه', () => {
    expect(classifyDiffStatus(0)).toBe('identical')
  })

  it('أدنى فرق فوق الصفر يخرج من «مطابق» إلى «طفيفة»', () => {
    expect(classifyDiffStatus(Number.MIN_VALUE)).toBe('minor')
    expect(classifyDiffStatus(0.0001)).toBe('minor')
  })

  it('«مطابق» و«لم يُقارَن» ليسا الشيء نفسه', () => {
    expect(classifyDiffStatus(0)).not.toBe(classifyDiffStatus(null))
  })
})

describe('classifyDiffStatus — الحدّ المستدير 5%', () => {
  it('ما دون 5% «فروق طفيفة»', () => {
    expect(classifyDiffStatus(0.0499)).toBe('minor')
  })

  it('5% بالضبط أوّل «فروق كبيرة» — الحدّ شامل', () => {
    expect(classifyDiffStatus(0.05)).toBe('major')
  })

  it('الحدّ يقع دون نقطة التصميم الوحيدة فتبقى في جانب «كبيرة» بوضوح', () => {
    expect(classifyDiffStatus(0.05)).toBe(classifyDiffStatus(0.079))
  })
})

describe('classifyDiffStatus — القيم الشاذّة', () => {
  it('كسرٌ سالب (مستحيل من computeDiff) يُقصّ إلى «مطابق» لا يُرفض', () => {
    expect(classifyDiffStatus(-0.2)).toBe('identical')
  })

  it('ما فوق الواحد يبقى «فروق كبيرة» — لا حدّ علوي', () => {
    expect(classifyDiffStatus(1)).toBe('major')
    expect(classifyDiffStatus(12)).toBe('major')
  })

  it('NaN واللانهائي: قياسٌ لم يقع ⇒ «لم يُقارَن» لا تصنيفًا كاذبًا', () => {
    expect(classifyDiffStatus(Number.NaN)).toBe('unmeasured')
    expect(classifyDiffStatus(Number.POSITIVE_INFINITY)).toBe('unmeasured')
    expect(classifyDiffStatus(Number.NEGATIVE_INFINITY)).toBe('unmeasured')
  })
})

describe('DIFF_STATUS_LABELS', () => {
  it('نصوص الإطار حرفيًّا للحالات الأربع', () => {
    expect(DIFF_STATUS_LABELS).toEqual({
      unmeasured: 'لم يُقارَن',
      identical: 'مطابق',
      minor: 'فروق طفيفة',
      major: 'فروق كبيرة',
    })
  })
})
