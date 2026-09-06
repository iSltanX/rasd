import { describe, expect, it } from 'vitest'

import {
  buildRegionItems,
  diffMethodSummary,
  nextRegionIndex,
  pixelCountSummary,
  prevRegionIndex,
} from '@/pages/compare/region-format'
import { hasIsolates, LRI, PDI, stripIsolates } from '@/shared/bidi'

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
    // قياسٌ غربي بطرفيه: البكسل وحدة لا شيء يُعدّ باليد (`§17`: أبعاد غربية).
    expect(pixelCountSummary(3412, 1_296_000)).toBe('3412 بكسل مختلف من 1296000')
  })
})

describe('diffMethodSummary', () => {
  it('يعرض العتبة بنسبة مئوية غربية', () => {
    expect(stripIsolates(diffMethodSummary(0.1))).toBe(
      'فرق إدراكي بفضاء YIQ (pixelmatch) — عتبة التجاهل الحالية 10%',
    )
  })

  /*
   * `YIQ (pixelmatch)` مقطعٌ لاتيني داخل عربية؛ بلا عزل يتسرّب اتّجاهه إلى
   * ما حوله — نفس علّة قلب الأبعاد المقيسة في هذه المرحلة. يُثبَّت صراحةً
   * كي لا يُنزَع سهوًا.
   */
  it('**المقطع التقني معزول اتجاهيًّا**', () => {
    const out = diffMethodSummary(0.1)
    expect(hasIsolates(out)).toBe(true)
    expect(out).toContain(`${LRI}YIQ (pixelmatch)${PDI}`)
  })

  /*
   * التسمية تصف ما تفعله القيمة: رفع **العتبة** تغاضٍ عن فروق أكبر، وهو
   * عكس «الحساسية». والشريط في `Sidebar` يقود الحساسية ويشتقّ العتبة منها.
   */
  it('يسمّيها «عتبة التجاهل» لا «عتبة الحساسية» — الاسم يصف الأثر', () => {
    expect(diffMethodSummary(0.4)).toContain('عتبة التجاهل')
    expect(diffMethodSummary(0.4)).toContain('40%')
  })
})
