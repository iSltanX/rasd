import { describe, expect, it } from 'vitest'

import {
  canvasBytes,
  CANVAS_BYTES_PER_PIXEL,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  withinCanvasLimits,
} from '@/shared/canvas-limits'

import { fc } from './fc'

/**
 * خصائص حدود القماش — الحارس الوحيد قبل «نجاحٍ» يحفظ صورةً فارغة.
 *
 * ملفّ الوحدة (`tests/unit/shared/canvas-limits.test.ts`) يثبت النقاط الحدّية المقيسة؛ وهذا
 * يثبت شكل المنطقة المقبولة كلّها: أنها **مغلقة نحو الأصغر** (ما قُبل يُقبَل أصغر منه)،
 * ومتناظرة في الضلعين، ولا يدخلها ما يتجاوز حدًّا واحدًا من الثلاثة.
 */

/** ضلعٌ يتجاوز الحدّ أحيانًا — كي تُختبَر الحافّتان لا الداخل وحده. */
const side = fc.integer({ min: 1, max: MAX_CANVAS_SIDE + 1024 })
/** ضلعٌ حول جذر المساحة القصوى، حيث يتقايض الضلعان. */
const nearRoot = fc.integer({ min: 16_000, max: 17_000 })

describe('withinCanvasLimits', () => {
  it('القبول يستلزم الحدود الثلاثة معًا، ورفض المقبول لا يقع', () => {
    fc.assert(
      fc.property(fc.oneof(side, nearRoot), fc.oneof(side, nearRoot), (w, h) => {
        const expected = w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA
        expect(withinCanvasLimits(w, h)).toBe(expected)
      }),
    )
  })

  it('متناظرة: تبديل العرض والارتفاع لا يغيّر الحكم', () => {
    fc.assert(
      fc.property(fc.oneof(side, nearRoot), fc.oneof(side, nearRoot), (w, h) => {
        expect(withinCanvasLimits(w, h)).toBe(withinCanvasLimits(h, w))
      }),
    )
  })

  it('مغلقة نحو الأصغر: ما قُبل يُقبَل أي قماشٍ أصغر منه في الضلعين', () => {
    fc.assert(
      fc.property(
        fc.oneof(side, nearRoot),
        fc.oneof(side, nearRoot),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (w, h, pw, ph) => {
          if (!withinCanvasLimits(w, h)) return
          const smallerW = Math.max(1, Math.floor((w * pw) / 1000))
          const smallerH = Math.max(1, Math.floor((h * ph) / 1000))
          expect(withinCanvasLimits(smallerW, smallerH)).toBe(true)
        },
      ),
    )
  })

  it('ما ليس عددًا منتهيًا موجبًا مرفوضٌ أيًّا كان الضلع الآخر', () => {
    const bad = fc.oneof(
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0),
      fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
    )
    fc.assert(
      fc.property(bad, side, fc.boolean(), (b, other, first) => {
        const [w, h] = first ? [b, other] : [other, b]
        expect(withinCanvasLimits(w, h)).toBe(false)
      }),
    )
  })

  it('لكل عرضٍ مقبول ارتفاعٌ أقصى واحد: ما تحته مقبول وما فوقه مرفوض', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CANVAS_SIDE }), (w) => {
        const maxH = Math.min(MAX_CANVAS_SIDE, Math.floor(MAX_CANVAS_AREA / w))
        expect(withinCanvasLimits(w, maxH)).toBe(true)
        expect(withinCanvasLimits(w, maxH + 1)).toBe(false)
      }),
    )
  })
})

describe('canvasBytes', () => {
  it('أربعة بايتات لكل بكسل، ولا قماش مقبول يتجاوز غيغابايت واحدًا', () => {
    fc.assert(
      fc.property(fc.oneof(side, nearRoot), fc.oneof(side, nearRoot), (w, h) => {
        expect(canvasBytes(w, h)).toBe(w * h * CANVAS_BYTES_PER_PIXEL)
        if (withinCanvasLimits(w, h)) expect(canvasBytes(w, h)).toBeLessThanOrEqual(2 ** 30)
      }),
    )
  })
})
