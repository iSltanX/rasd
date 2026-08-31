import { describe, expect, it } from 'vitest'

import {
  identityOverlayTransform,
  matchWidthScale,
  referenceToViewport,
  rotateAt,
  scaleAt,
  toCssTransform,
  translate,
  viewportToReference,
  type OverlayTransform,
} from '@/modules/compare/overlay'
import { referencePoint, viewportPoint } from '@/shared/geometry'

/** تسامحٌ عائم — دوال مثلّثية لا تُنتج مساواة تامّة، والاختبار «ذهابًا وإيابًا» يُراكم خطأين. */
function closePoint(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps)
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps)
}

const SAMPLE_TRANSFORMS: readonly OverlayTransform[] = [
  identityOverlayTransform,
  { scale: 1, tx: 120, ty: -40, rotation: 0 },
  { scale: 2.5, tx: 0, ty: 0, rotation: 0 },
  { scale: 1, tx: 0, ty: 0, rotation: 90 },
  { scale: 1, tx: 0, ty: 0, rotation: 37 },
  { scale: 0.4, tx: 50, ty: 200, rotation: 180 },
  { scale: 3, tx: -75, ty: 33, rotation: -25 },
]

describe('referenceToViewport / viewportToReference — الهوية والتحجيم والدوران', () => {
  it('التحويل المحايد لا يغيّر الإحداثيات', () => {
    const p = referencePoint(10, 20)
    const v = referenceToViewport(p, identityOverlayTransform)
    expect(v.x).toBe(10)
    expect(v.y).toBe(20)
    expect(v.space).toBe('viewport')
  })

  it('التحجيم وحده يضرب الإحداثيات', () => {
    const t: OverlayTransform = { scale: 2, tx: 0, ty: 0, rotation: 0 }
    const v = referenceToViewport(referencePoint(10, 5), t)
    closePoint(v, { x: 20, y: 10 })
  })

  it('الإزاحة وحدها تُضاف بعد التحجيم والدوران', () => {
    const t: OverlayTransform = { scale: 1, tx: 100, ty: 50, rotation: 0 }
    const v = referenceToViewport(referencePoint(0, 0), t)
    closePoint(v, { x: 100, y: 50 })
  })

  it('الدوران 90° يحوِّل (1,0) إلى (0,1) — دوران الساعة على محور y نازل', () => {
    const t: OverlayTransform = { scale: 1, tx: 0, ty: 0, rotation: 90 }
    const v = referenceToViewport(referencePoint(1, 0), t)
    closePoint(v, { x: 0, y: 1 })
  })

  it.each(SAMPLE_TRANSFORMS)('ذهابًا وإيابًا من فضاء المرجع: %o', (t) => {
    const points = [
      referencePoint(0, 0),
      referencePoint(37, -12),
      referencePoint(-500, 340),
      referencePoint(1.5, 2.25),
    ]
    for (const p of points) {
      const roundTripped = viewportToReference(referenceToViewport(p, t), t)
      closePoint(roundTripped, p)
    }
  })

  it.each(SAMPLE_TRANSFORMS)('ذهابًا وإيابًا من فضاء viewport: %o', (t) => {
    const points = [viewportPoint(0, 0), viewportPoint(64, 900), viewportPoint(-120, -8)]
    for (const p of points) {
      const roundTripped = referenceToViewport(viewportToReference(p, t), t)
      closePoint(roundTripped, p)
    }
  })
})

describe('translate', () => {
  it('يزيح tx/ty فقط — بلا مسّ التحجيم أو الدوران', () => {
    const t: OverlayTransform = { scale: 2, tx: 10, ty: 20, rotation: 45 }
    const moved = translate(t, 5, -3)
    expect(moved).toEqual({ scale: 2, tx: 15, ty: 17, rotation: 45 })
  })

  it('صفرٌ لا يغيّر شيئًا', () => {
    const t: OverlayTransform = { scale: 1.3, tx: 1, ty: 2, rotation: 10 }
    expect(translate(t, 0, 0)).toEqual(t)
  })
})

describe('scaleAt — التكبير نحو نقطة ثابتة', () => {
  it('نقطة الارتكاز تبقى في مكانها بصريًا بعد تغيير التحجيم', () => {
    const t: OverlayTransform = { scale: 1, tx: 30, ty: 40, rotation: 0 }
    const anchor = viewportPoint(200, 150)
    const before = viewportToReference(anchor, t)

    const scaled = scaleAt(t, 3, anchor)
    expect(scaled.scale).toBe(3)

    const refPointNowAtAnchor = viewportToReference(anchor, scaled)
    closePoint(refPointNowAtAnchor, before)
    // والاتجاه الآخر: تحويل نقطة المرجع الأصلية بالتحويل الجديد يعيدها فوق anchor بالضبط.
    closePoint(referenceToViewport(before, scaled), anchor)
  })

  it('يعمل أيضًا مع تحويل يحمل دورانًا سابقًا', () => {
    const t: OverlayTransform = { scale: 1.5, tx: -20, ty: 60, rotation: 33 }
    const anchor = viewportPoint(400, 300)
    const before = viewportToReference(anchor, t)
    const scaled = scaleAt(t, 0.6, anchor)
    closePoint(referenceToViewport(before, scaled), anchor)
  })
})

describe('rotateAt — الدوران نحو نقطة ثابتة', () => {
  it('نقطة الارتكاز تبقى في مكانها بصريًا بعد تغيير الدوران', () => {
    const t: OverlayTransform = { scale: 2, tx: 10, ty: 10, rotation: 0 }
    const anchor = viewportPoint(150, 90)
    const before = viewportToReference(anchor, t)

    const rotated = rotateAt(t, 60, anchor)
    expect(rotated.rotation).toBe(60)
    closePoint(referenceToViewport(before, rotated), anchor)
  })
})

describe('matchWidthScale — «طابق العرض»', () => {
  it('يحسب معامل التحجيم الصحيح لأعراض مختلفة', () => {
    expect(matchWidthScale(1200, 600)).toBeCloseTo(0.5, 10)
    expect(matchWidthScale(400, 1200)).toBeCloseTo(3, 10)
    expect(matchWidthScale(800, 800)).toBe(1)
  })

  it('عرض طبيعي غير موجب يُعيد 1 — لا قسمة على صفر ولا NaN', () => {
    expect(matchWidthScale(0, 500)).toBe(1)
    expect(matchWidthScale(-10, 500)).toBe(1)
  })
})

describe('toCssTransform', () => {
  it('يبني سلسلة CSS بالترتيب translate ثم rotate ثم scale', () => {
    const t: OverlayTransform = { scale: 1.25, tx: 12, ty: -8, rotation: 15 }
    expect(toCssTransform(t)).toBe('translate(12px, -8px) rotate(15deg) scale(1.25)')
  })

  it('التحويل المحايد ينتج سلسلة هوية', () => {
    expect(toCssTransform(identityOverlayTransform)).toBe(
      'translate(0px, 0px) rotate(0deg) scale(1)',
    )
  })
})
