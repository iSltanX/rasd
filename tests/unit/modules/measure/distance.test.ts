import { describe, expect, it } from 'vitest'

import { fourWayGap } from '@/modules/measure/distance'
import { viewportRect } from '@/shared/geometry'

/**
 * رياضيات المسافة بين مستطيلين — البند المنصوص في المرحلة 12: «متداخلان،
 * متجاوران، متباعدان، أحدهما يحتوي الآخر».
 */

describe('fourWayGap — متباعدان', () => {
  it('(ب) يمين (أ) بمحاذاة رأسية: right موجبة وحدها هي الأقرب', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(150, 0, 50, 100)
    const g = fourWayGap(a, b)
    expect(g.right).toBe(50)
    expect(g.left).toBe(-200) // a.x(0) - (b.x+b.w)(200)
    expect(g.nearest).toBe('right')
    expect(g.nearestValue).toBe(50)
    expect(g.relation).toBe('separate')
  })

  it('(ب) فوق (أ): top موجبة وحدها', () => {
    const a = viewportRect(0, 200, 100, 100)
    const b = viewportRect(0, 0, 100, 60)
    const g = fourWayGap(a, b)
    expect(g.top).toBe(140) // a.y(200) - (b.y+b.h)(60)
    expect(g.nearest).toBe('top')
  })

  it('(ب) قطريًّا أعلى-يمين (أ): اتجاهان موجبان معًا، الأقرب أصغرهما', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(150, -80, 40, 40) // فوق ويمين (أ) معًا
    const g = fourWayGap(a, b)
    expect(g.top).toBeGreaterThan(0)
    expect(g.right).toBeGreaterThan(0)
    expect(g.bottom).toBeLessThan(0)
    expect(g.left).toBeLessThan(0)
    expect(g.nearest).toBe(g.top < g.right ? 'top' : 'right')
    expect(g.nearestValue).toBe(Math.min(g.top, g.right))
  })
})

describe('fourWayGap — متجاوران (حافّتان متلامستان)', () => {
  it('حافّة (ب) تلامس حافّة (أ) تمامًا: الفجوة صفر و relation = adjacent', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(100, 0, 50, 100) // يبدأ حيث ينتهي (أ) بالضبط
    const g = fourWayGap(a, b)
    expect(g.right).toBe(0)
    expect(g.nearest).toBe('right')
    expect(g.nearestValue).toBe(0)
    expect(g.relation).toBe('adjacent')
  })
})

describe('fourWayGap — متداخلان (بلا احتواء كامل)', () => {
  it('تراكب جزئي على المحورين: nearest يصير null و relation = overlapping', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(50, 50, 100, 100) // يتراكب مع (أ) في ربعه السفليّ الأيمن
    const g = fourWayGap(a, b)
    expect(g.nearest).toBeNull()
    expect(g.nearestValue).toBeNull()
    expect(g.relation).toBe('overlapping')
  })
})

describe('fourWayGap — أحدهما يحتوي الآخر', () => {
  it('(أ) يحتوي (ب) كاملًا: a-contains-b', () => {
    const a = viewportRect(0, 0, 200, 200)
    const b = viewportRect(50, 50, 20, 20)
    expect(fourWayGap(a, b).relation).toBe('a-contains-b')
  })

  it('(ب) يحتوي (أ) كاملًا: b-contains-a', () => {
    const a = viewportRect(50, 50, 20, 20)
    const b = viewportRect(0, 0, 200, 200)
    expect(fourWayGap(a, b).relation).toBe('b-contains-a')
  })

  it('تطابق تامّ: كلٌّ يحتوي الآخر — يُحسَم لصالح a-contains-b', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(0, 0, 100, 100)
    expect(fourWayGap(a, b).relation).toBe('a-contains-b')
  })

  it('الاحتواء يسبق حكم adjacent حتى لو تلامست حافّة', () => {
    // (ب) يحتوي (أ) ويشارك حافّته العلوية معه — الاحتواء أهمّ من التلامس.
    const a = viewportRect(20, 0, 20, 20)
    const b = viewportRect(0, 0, 100, 100)
    expect(fourWayGap(a, b).relation).toBe('b-contains-a')
  })
})

describe('fourWayGap — القيم الأربع صحيحة دائمًا بصرف النظر عن العلاقة', () => {
  it('تُحسب الأربعة معًا حتى حين تكون النتيجة تداخلًا', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(50, 50, 100, 100)
    const g = fourWayGap(a, b)
    expect(g.top).toBe(-150) // a.y(0) - (b.y+b.h)(150)
    expect(g.right).toBe(-50) // b.x(50) - (a.x+a.w)(100)
    expect(g.bottom).toBe(-50) // b.y(50) - (a.y+a.h)(100)
    expect(g.left).toBe(-150) // a.x(0) - (b.x+b.w)(150)
  })
})
