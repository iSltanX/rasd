import { describe, expect, it } from 'vitest'

import { computeVirtualGrid } from '@/modules/library/virtualize'

const BASE = { rowHeight: 200, rowGap: 12, overscanRows: 0 }

describe('computeVirtualGrid', () => {
  it('صفر عناصر ⇒ كل شيء صفر بلا قسمة على صفر', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 0,
      columns: 4,
      scrollTop: 0,
      viewportHeight: 800,
    })
    expect(result).toEqual({
      totalRows: 0,
      totalHeight: 0,
      startRow: 0,
      endRow: 0,
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
    })
  })

  it('عمود واحد يُقرَّب لأعلى ولا ينزل عن 1 حتى بمُدخَل غير صحيح', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 10,
      columns: 0,
      scrollTop: 0,
      viewportHeight: 800,
    })
    expect(result.totalRows).toBe(10) // عمود واحد فِعليًّا رغم columns:0
  })

  it('يحسب totalRows وtotalHeight بلا فاصل زائد بعد آخر صفّ', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 20,
      columns: 4,
      scrollTop: 0,
      viewportHeight: 800,
    })
    // 20 عنصرًا ÷ 4 أعمدة = 5 صفوف؛ الارتفاع = 5×(200+12) − 12 (لا فاصل بعد الأخير)
    expect(result.totalRows).toBe(5)
    expect(result.totalHeight).toBe(5 * 212 - 12)
  })

  it('عند أعلى التمرير، النافذة تبدأ من الصفّ صفر', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 5000,
      columns: 5,
      scrollTop: 0,
      viewportHeight: 800,
    })
    expect(result.startRow).toBe(0)
    expect(result.startIndex).toBe(0)
    expect(result.offsetTop).toBe(0)
  })

  it('5000 عنصر لا تُرسِل إلّا نافذة صغيرة — لا 5000 كلّها', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 5000,
      columns: 5,
      scrollTop: 10_000,
      viewportHeight: 800,
      overscanRows: 2,
    })
    const rendered = result.endIndex - result.startIndex
    // 800px ÷ 212px ≈ 4 صفوف مرئية + هامشا overscan (2+2) = 8 صفوف × 5 أعمدة = 40 عنصرًا كحدّ أقصى تقريبي
    expect(rendered).toBeLessThan(60)
    expect(rendered).toBeGreaterThan(0)
  })

  it('التمرير لمنتصف القائمة يحرّك startRow وoffsetTop معًا بالتناسب', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 1000,
      columns: 4,
      scrollTop: 2120, // 10 صفوف بالضبط (212 لكلّ صفّ)
      viewportHeight: 424, // صفّان
      overscanRows: 0,
    })
    expect(result.startRow).toBe(10)
    expect(result.offsetTop).toBe(10 * 212)
    expect(result.startIndex).toBe(40)
  })

  it('overscan يوسّع المدى في الاتجاهين دون تجاوز حدود القائمة', () => {
    const withOverscan = computeVirtualGrid({
      ...BASE,
      itemCount: 100,
      columns: 4,
      scrollTop: 2120,
      viewportHeight: 424,
      overscanRows: 3,
    })
    const noOverscan = computeVirtualGrid({
      ...BASE,
      itemCount: 100,
      columns: 4,
      scrollTop: 2120,
      viewportHeight: 424,
      overscanRows: 0,
    })
    expect(withOverscan.startRow).toBeLessThanOrEqual(noOverscan.startRow)
    expect(withOverscan.endRow).toBeGreaterThanOrEqual(noOverscan.endRow)
    expect(withOverscan.endRow).toBeLessThanOrEqual(withOverscan.totalRows)
    expect(withOverscan.startRow).toBeGreaterThanOrEqual(0)
  })

  it('نهاية القائمة: endIndex لا يتجاوز itemCount أبدًا', () => {
    const result = computeVirtualGrid({
      ...BASE,
      itemCount: 17, // لا يقبل القسمة على 4 بالتمام
      columns: 4,
      scrollTop: 0,
      viewportHeight: 10_000, // نافذة أكبر من القائمة كاملة
      overscanRows: 5,
    })
    expect(result.endIndex).toBe(17)
  })
})
