import { describe, expect, it } from 'vitest'

import { nearestSnap, snapPoint, SNAP_THRESHOLD_PX } from '@/modules/measure/snap'

/** الالتقاط اللحظي — «ضمن 4px، مع تعطيله بـ⌥». */

describe('nearestSnap', () => {
  it('يلتقط أقرب مرشَّح ضمن العتبة', () => {
    expect(nearestSnap(100, [80, 102, 150])).toBe(102)
  })

  it('لا يلتقط شيئًا خارج العتبة', () => {
    expect(nearestSnap(100, [80, 150])).toBeNull()
  })

  it(`عند العتبة بالضبط (${SNAP_THRESHOLD_PX}px) لا يزال يلتقط`, () => {
    expect(nearestSnap(100, [100 + SNAP_THRESHOLD_PX])).toBe(100 + SNAP_THRESHOLD_PX)
  })

  it('يتجاوز العتبة بمقدار واحد فلا يلتقط', () => {
    expect(nearestSnap(100, [100 + SNAP_THRESHOLD_PX + 1])).toBeNull()
  })

  it('قائمة فارغة: لا التقاط', () => {
    expect(nearestSnap(100, [])).toBeNull()
  })

  it('يختار الأقرب من مرشَّحين كلاهما ضمن العتبة', () => {
    expect(nearestSnap(100, [97, 102])).toBe(102) // 102 أقرب (فرق 2 مقابل 3)
  })

  it('تطابق تامّ يلتقط بمسافة صفر', () => {
    expect(nearestSnap(100, [100])).toBe(100)
  })
})

describe('snapPoint', () => {
  it('يلتقط المحورين كلًّا على حدة', () => {
    const p = snapPoint(100, 200, [98], [202])
    expect(p).toEqual({ x: 98, y: 202, snappedX: true, snappedY: true })
  })

  it('محور واحد يلتقط والآخر لا — كلٌّ مستقلّ عن الآخر', () => {
    const p = snapPoint(100, 200, [98], [500])
    expect(p.x).toBe(98)
    expect(p.snappedX).toBe(true)
    expect(p.y).toBe(200)
    expect(p.snappedY).toBe(false)
  })

  it('⌥ (`disabled`) يعطّل الالتقاط حتى مع مرشَّح مطابق تمامًا', () => {
    const p = snapPoint(100, 200, [100], [200], true)
    expect(p).toEqual({ x: 100, y: 200, snappedX: false, snappedY: false })
  })
})
