import { describe, expect, it } from 'vitest'

import {
  buildRegionItems,
  diffMethodSummary,
  nextRegionIndex,
  pixelCountSummary,
  prevRegionIndex,
} from '@/pages/compare/region-format'

import type { DiffRegion } from '@/modules/compare/regions'

const region = (id: number): DiffRegion => ({
  id,
  rect: { space: 'device', x: 0, y: 0, width: 10, height: 10 },
  pixels: 42,
})

describe('buildRegionItems', () => {
  it('يبني تسمية هندية من ترقيم المنطقة، بنفس الترتيب', () => {
    const items = buildRegionItems([region(1), region(2), region(3)])
    expect(items.map((i) => i.label)).toEqual(['١', '٢', '٣'])
    expect(items.map((i) => i.region.id)).toEqual([1, 2, 3])
  })

  it('قائمة فارغة لمناطق فارغة', () => {
    expect(buildRegionItems([])).toEqual([])
  })
})

describe('nextRegionIndex / prevRegionIndex', () => {
  it('يدوران عند الطرفين', () => {
    expect(nextRegionIndex(2, 3)).toBe(0)
    expect(prevRegionIndex(0, 3)).toBe(2)
  })

  it('يتقدّمان/يتراجعان بخطوة واحدة داخل النطاق', () => {
    expect(nextRegionIndex(0, 3)).toBe(1)
    expect(prevRegionIndex(1, 3)).toBe(0)
  })

  it('-1 حين لا مناطق أصلًا', () => {
    expect(nextRegionIndex(0, 0)).toBe(-1)
    expect(prevRegionIndex(0, 0)).toBe(-1)
  })
})

describe('pixelCountSummary', () => {
  it('يعرض العددين بأرقام هندية بلا فواصل تجميع', () => {
    expect(pixelCountSummary(3412, 1_296_000)).toBe('٣٤١٢ بكسل مختلف من ١٢٩٦٠٠٠')
  })
})

describe('diffMethodSummary', () => {
  it('يعرض العتبة بنسبة مئوية غربية', () => {
    expect(diffMethodSummary(0.1)).toBe(
      'فرق إدراكي بفضاء YIQ (pixelmatch) — عتبة الحساسية الحالية 10%',
    )
  })
})
