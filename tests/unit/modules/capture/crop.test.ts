import { describe, expect, it } from 'vitest'

import { clampToSource, isFullSource, planCrop } from '@/modules/capture/crop'
import {
  viewportRect,
  viewportRectToDevice,
  type CoordSpace,
  type DeviceRect,
} from '@/shared/geometry'

/**
 * رياضيات القصّ عند كل `dpr`، وعند تحديد يتجاوز الحدود.
 *
 * هذان بالضبط ما تفرض المرحلة اختبارهما: الأوّل لأن الخطأ فيه **لا يظهر
 * إطلاقًا** على شاشة عادية (dpr = 1) ويظهر مضاعفًا على ريتينا؛ والثاني لأن
 * القصّ خارج الحدود لا يرمي في Canvas بل يعطي حافّة شفّافة صامتة.
 */

const space = (dpr: number): CoordSpace => ({
  scrollX: 0,
  scrollY: 0,
  layoutWidth: 1280,
  layoutHeight: 720,
  pageWidth: 1280,
  pageHeight: 4000,
  dpr,
  rtl: false,
  rootScaleX: 1,
  rootScaleY: 1,
  rootDistorted: false,
})

/** لقطة الجهاز بأبعاد النافذة × dpr — ما يُرجعه `captureVisibleTab` فعلًا. */
const sourceFor = (dpr: number) => ({ width: 1280 * dpr, height: 720 * dpr })

const DPRS = [1, 1.5, 2, 3]

// ─────────────────────────────────────────────────────────────────

describe('القصّ عند كل dpr', () => {
  it.each(DPRS)('dpr = %s — التحديد يُقصّ بأبعاد الجهاز لا المنطقية', (dpr) => {
    const selection = viewportRect(100, 50, 400, 300)
    const crop = viewportRectToDevice(selection, space(dpr))
    const plan = planCrop(crop, sourceFor(dpr))

    expect(plan).not.toBeNull()
    expect(plan?.sx).toBe(100 * dpr)
    expect(plan?.sy).toBe(50 * dpr)
    expect(plan?.sw).toBe(400 * dpr)
    expect(plan?.sh).toBe(300 * dpr)
  })

  it.each(DPRS)('dpr = %s — الوجهة بمقاس المصدر بلا إعادة تحجيم', (dpr) => {
    const crop = viewportRectToDevice(viewportRect(0, 0, 200, 100), space(dpr))
    const plan = planCrop(crop, sourceFor(dpr))
    expect(plan?.dw).toBe(plan?.sw)
    expect(plan?.dh).toBe(plan?.sh)
  })

  it('dpr كسري يعطي أعدادًا صحيحة — لا حافّة مموّهة', () => {
    // 1.5 × 333 = 499.5 — لا يجوز أن يصل إلى `drawImage` كسرًا.
    const crop = viewportRectToDevice(viewportRect(0, 0, 333, 111), space(1.5))
    const plan = planCrop(crop, sourceFor(1.5))
    for (const v of [plan?.sx, plan?.sy, plan?.sw, plan?.sh]) {
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('تحديدان متلاصقان يتشاركان الحافّة بالضبط عند dpr كسري', () => {
    const s = space(1.5)
    const left = viewportRectToDevice(viewportRect(0, 0, 333, 100), s)
    const right = viewportRectToDevice(viewportRect(333, 0, 333, 100), s)
    // خاصية `viewportRectToDevice`: تقريب الحوافّ لا الأصل والمقاس.
    expect(left.x + left.width).toBe(right.x)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('تحديد يتجاوز حدود اللقطة', () => {
  const source = sourceFor(2)

  it('يتجاوز يمينًا وأسفل — يُحصر لا يُقصّ صامتًا', () => {
    const crop = viewportRectToDevice(viewportRect(1200, 700, 400, 300), space(2))
    const plan = planCrop(crop, source)
    expect(plan?.sx).toBe(2400)
    expect(plan?.sy).toBe(1400)
    expect(plan?.sw).toBe(source.width - 2400)
    expect(plan?.sh).toBe(source.height - 1400)
  })

  it('يتجاوز يسارًا وأعلى — الأصل يُدفَع إلى الصفر والمقاس يُنقَص', () => {
    const crop = viewportRectToDevice(viewportRect(-100, -50, 400, 300), space(2))
    const plan = planCrop(crop, source)
    expect(plan?.sx).toBe(0)
    expect(plan?.sy).toBe(0)
    expect(plan?.sw).toBe((400 - 100) * 2)
    expect(plan?.sh).toBe((300 - 50) * 2)
  })

  it('أكبر من اللقطة من كل جهة — يساوي اللقطة كاملة', () => {
    const crop = viewportRectToDevice(viewportRect(-500, -500, 3000, 3000), space(2))
    const plan = planCrop(crop, source)
    expect(plan?.sx).toBe(0)
    expect(plan?.sy).toBe(0)
    expect(plan?.sw).toBe(source.width)
    expect(plan?.sh).toBe(source.height)
  })

  it('خارج الحدود كليًّا يُرجع null لا صورة فارغة', () => {
    const crop = viewportRectToDevice(viewportRect(5000, 5000, 100, 100), space(2))
    expect(planCrop(crop, source)).toBeNull()
    expect(clampToSource(crop, source)).toBeNull()
  })

  it('ملامس للحافّة بلا تداخل يُرجع null', () => {
    const crop = viewportRectToDevice(viewportRect(1280, 0, 100, 100), space(2))
    expect(clampToSource(crop, source)).toBeNull()
  })

  it('تحديد صفري يُرجع null', () => {
    const crop = viewportRectToDevice(viewportRect(100, 100, 0, 0), space(2))
    expect(planCrop(crop, source)).toBeNull()
  })

  it('تحديد أقلّ من بكسل واحد بعد التقريب يُرجع null', () => {
    // 0.4 × 1 = 0.4 → يُقرَّب إلى صفر عرضًا.
    const crop = viewportRectToDevice(viewportRect(10, 10, 0.4, 0.4), space(1))
    expect(planCrop(crop, source)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────

describe('اللقطة الكاملة', () => {
  it.each(DPRS)('dpr = %s — تحديد النافذة كلّها يُعدّ لقطة كاملة', (dpr) => {
    const crop = viewportRectToDevice(viewportRect(0, 0, 1280, 720), space(dpr))
    expect(isFullSource(crop, sourceFor(dpr))).toBe(true)
  })

  it('تحديد جزئي ليس لقطة كاملة', () => {
    const crop = viewportRectToDevice(viewportRect(0, 0, 1279, 720), space(1))
    expect(isFullSource(crop, sourceFor(1))).toBe(false)
  })

  it('تحديد أكبر من اللقطة يُعدّ كاملًا — لا قصّ ينفع', () => {
    const crop = viewportRectToDevice(viewportRect(-10, -10, 2000, 2000), space(1))
    expect(isFullSource(crop, sourceFor(1))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('حراسة الفضاء', () => {
  it('الفضاء محفوظ في الناتج', () => {
    const crop: DeviceRect = viewportRectToDevice(viewportRect(0, 0, 100, 100), space(2))
    expect(crop.space).toBe('device')
    expect(clampToSource(crop, sourceFor(2))?.space).toBe('device')
  })
})
