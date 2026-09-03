import { describe, expect, it } from 'vitest'

import { percentBox, percentBoxStyle, stageSize } from '@/pages/compare/layout'

describe('stageSize', () => {
  it('يأخذ أكبر عرض وأكبر ارتفاع بين الصورتين', () => {
    expect(stageSize({ width: 1000, height: 500 }, { width: 800, height: 700 })).toEqual({
      width: 1000,
      height: 700,
    })
  })

  it('لا يقلّ عن 1×1 حتى مع مدخل صفري', () => {
    expect(stageSize({ width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({
      width: 1,
      height: 1,
    })
  })
})

describe('percentBox', () => {
  const stage = { width: 1000, height: 500 }

  it('يحوِّل مستطيلًا كامل المسرح إلى 0/0/100/100', () => {
    expect(percentBox({ x: 0, y: 0, width: 1000, height: 500 }, stage)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })
  })

  it('يحوِّل مستطيلًا فرعيًّا بنسبته الصحيحة', () => {
    expect(percentBox({ x: 100, y: 50, width: 200, height: 100 }, stage)).toEqual({
      left: 10,
      top: 10,
      width: 20,
      height: 20,
    })
  })

  it('فيزيائي لا يُقلَب: مستطيل قرب الحافّة اليمنى يبقى قرب اليمين رقميًّا بصرف النظر عن اتجاه الصفحة', () => {
    // x=150 من عرض 200 — 75% من اليسار الفعلي، لا 75% من «بداية القراءة»
    // (التي كانت ستعني اليمين في صفحة RTL فتقلب الموضع بالكامل).
    const box = percentBox({ x: 150, y: 0, width: 30, height: 20 }, { width: 200, height: 150 })
    expect(box.left).toBeCloseTo(75)
  })

  it('لا تشويه: نسبة عرض:ارتفاع الصورة الفرعية تبقى كما هي عبر مسرح غير مربّع', () => {
    // صورة 800×700 داخل مسرح 1000×700 — أعرض بمقدار مختلف عن الارتفاع.
    const box = percentBox({ x: 0, y: 0, width: 800, height: 700 }, { width: 1000, height: 700 })
    // العرض 80% من مسرح عرضه 1000، والارتفاع 100% من مسرح ارتفاعه 700 — نفس أصل الصورة 800×700.
    expect(box.width).toBeCloseTo(80)
    expect(box.height).toBeCloseTo(100)
  })

  it('صندوق صفري حين المسرح صفري الأبعاد', () => {
    expect(percentBox({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })
  })
})

describe('percentBoxStyle', () => {
  it('يحوِّل الأرقام إلى نصوص بوحدة ٪ — خصائص فيزيائية لا منطقية', () => {
    expect(percentBoxStyle({ left: 10, top: 20, width: 30, height: 40 })).toEqual({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
    })
  })
})
