import { describe, expect, it } from 'vitest'

import { pxToRem, remToPx } from '@/modules/measure/units'

describe('pxToRem', () => {
  it('يحوّل بناءً على الجذر المُمرَّر — لا 16 مفترضة', () => {
    expect(pxToRem(32, 16)).toBe(2)
    expect(pxToRem(32, 20)).toBe(1.6)
  })

  it('جذر صفري: صفر لا Infinity', () => {
    expect(pxToRem(32, 0)).toBe(0)
  })

  it('جذر سالب أو غير منتهٍ: صفر بأمان', () => {
    expect(pxToRem(32, -16)).toBe(0)
    expect(pxToRem(32, Number.NaN)).toBe(0)
    expect(pxToRem(32, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('صفر بكسل يعطي صفر rem دائمًا', () => {
    expect(pxToRem(0, 16)).toBe(0)
  })
})

describe('remToPx — عكس pxToRem', () => {
  it('يحوّل بناءً على الجذر المُمرَّر', () => {
    expect(remToPx(2, 16)).toBe(32)
  })

  it('جولة كاملة px → rem → px تعيد القيمة الأصلية', () => {
    const root = 18
    const original = 45
    expect(remToPx(pxToRem(original, root), root)).toBeCloseTo(original)
  })

  it('جذر غير صالح: صفر بأمان', () => {
    expect(remToPx(2, 0)).toBe(0)
    expect(remToPx(2, Number.NaN)).toBe(0)
  })
})
