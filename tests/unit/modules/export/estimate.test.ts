import { describe, expect, it } from 'vitest'

import {
  estimateSize,
  QUALITY_LEVELS,
  qualityApplies,
  qualityValue,
} from '@/modules/export/estimate'

describe('الحجم التقديري', () => {
  it('**`max` غيابُ الوسيط لا القيمة `1`**', () => {
    expect(qualityValue('max')).toBeNull()
    expect(qualityValue('high')).toBe(0.92)
    expect(qualityValue('balanced')).toBe(0.82)
    expect(qualityValue('compact')).toBe(0.6)
  })

  it('وPNG لا تقرأ الجودة أصلًا', () => {
    expect(qualityApplies('png')).toBe(false)
    expect(qualityApplies('webp')).toBe(true)

    const a = estimateSize(1000, 1000, 'png', 'max')
    for (const level of QUALITY_LEVELS) {
      expect(estimateSize(1000, 1000, 'png', level).bytes).toBe(a.bytes)
    }
  })

  /**
   * **القياس نقض «أصغر» عند الجودة القصوى.**
   *
   * على لقطات واجهة حقيقية خرج `VP8L` أكبر من PNG في أربع عشرة حالة من
   * ستّ عشرة (وسيط 0.1564 مقابل 0.0789 بايت/بكسل). والاختبار يثبّت اتّجاه
   * النتيجة لا رقمَها، فتحديث المعاملات لا يكسره ما دام الاتّجاه صادقًا.
   */
  it('WebP بلا فقد **أكبر** من PNG — لا أصغر', () => {
    const png = estimateSize(2000, 1000, 'png', 'max')
    const webp = estimateSize(2000, 1000, 'webp', 'max')
    expect(webp.bytes).toBeGreaterThan(png.bytes)
    expect(png.lossless).toBe(true)
    expect(webp.lossless).toBe(true)
  })

  it('**وأصغر فعلًا عند خفض الجودة** — وهو ما تَعِد به الرقاقة', () => {
    const png = estimateSize(2000, 1000, 'png', 'max')
    for (const level of ['high', 'balanced', 'compact'] as const) {
      const webp = estimateSize(2000, 1000, 'webp', level)
      expect(webp.bytes).toBeLessThan(png.bytes)
      expect(webp.lossless).toBe(false)
    }
  })

  it('والأصغر جودةً أصغر حجمًا — ترتيبٌ رتيب', () => {
    const sizes = QUALITY_LEVELS.map((q) => estimateSize(2000, 1000, 'webp', q).bytes)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!)
    }
  })

  /**
   * **التقدير يُحسب على سطح التصدير لا على الصورة الخام.**
   *
   * تصدير `2×` يضاعف الضلعين فيربّع المساحة؛ وتقديرٌ على الأبعاد قبل الضرب
   * كان يخطئ بمعامل أربعة بالضبط.
   */
  it('مضاعفة الضلعين تربّع التقدير', () => {
    const one = estimateSize(800, 600, 'png', 'max').bytes
    const two = estimateSize(1600, 1200, 'png', 'max').bytes
    expect(two).toBe(one * 4)
  })
})
