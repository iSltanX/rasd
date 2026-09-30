import { describe, expect, it } from 'vitest'

import {
  BREAK_WINDOW,
  estimateImagePages,
  isQuietRow,
  MAX_SCALE,
  MIN_QUIET_RUN,
  orientationFor,
  PAGE_MARGIN,
  pageBox,
  pickBreak,
  planImagePages,
  rowsPerPage,
  scaleFor,
  textPagePixels,
} from '@/modules/export/pdf-layout'

/**
 * تخطيط الصفحات — المقاس والاتجاه والقسمة، ووعد «بلا قطع سطر» بحدوده.
 */

describe('المقاس والاتجاه', () => {
  it('A4 وLetter بالنقاط، والاتجاه يبدّل الضلعين لا يغيّرهما', () => {
    expect(pageBox('a4', 'portrait')).toEqual({ width: 595.28, height: 841.89 })
    expect(pageBox('a4', 'landscape')).toEqual({ width: 841.89, height: 595.28 })
    expect(pageBox('letter', 'portrait')).toEqual({ width: 612, height: 792 })
    expect(pageBox('letter', 'landscape')).toEqual({ width: 792, height: 612 })
  })

  it('الاتجاه الافتراضي من شكل الصورة: الأعرض أفقي، والمربّع والأطول عمودي', () => {
    expect(orientationFor(1440, 900)).toBe('landscape')
    expect(orientationFor(900, 900)).toBe('portrait')
    expect(orientationFor(1440, 9000)).toBe('portrait')
  })
})

describe('المقياس', () => {
  const box = pageBox('a4', 'portrait')
  const contentWidth = box.width - PAGE_MARGIN * 2
  const contentHeight = box.height - PAGE_MARGIN * 2

  it('متعدّد الصفحات يملأ عرض المحتوى', () => {
    expect(scaleFor(2880, 9000, box, 'multi')).toBeCloseTo(contentWidth / 2880, 6)
  })

  it('صفحة واحدة تسع الطول والعرض معًا', () => {
    expect(scaleFor(2880, 9000, box, 'single')).toBeCloseTo(contentHeight / 9000, 6)
  })

  it('**ولا يُكبِّر فوق 96 بكسلًا في البوصة** — لقطة عنصرٍ صغير تبقى بحجمها لا ضبابيةً ممطوطة', () => {
    expect(scaleFor(200, 100, box, 'multi')).toBe(MAX_SCALE)
    expect(scaleFor(200, 100, box, 'single')).toBe(MAX_SCALE)
  })
})

describe('القسمة على الصفحات', () => {
  const box = pageBox('a4', 'portrait')

  it('صفحة واحدة: نافذة بالصورة كلّها، في وسط العرض', async () => {
    const [only, ...rest] = await planImagePages(1440, 9000, box, 'single')
    expect(rest).toEqual([])
    expect(only!.top).toBe(0)
    expect(only!.rows).toBe(9000)
    const drawn = 1440 * only!.scale
    expect(only!.x).toBeCloseTo((box.width - drawn) / 2, 6)
  })

  it('متعدّد بلا قاطع: نوافذ متلاصقة تغطّي الصورة كلّها بلا تداخل ولا فجوة', async () => {
    const pages = await planImagePages(1440, 9000, box, 'multi')
    let next = 0
    for (const page of pages) {
      expect(page.top).toBe(next)
      expect(page.rows).toBeGreaterThan(0)
      next = page.top + page.rows
    }
    expect(next).toBe(9000)
    expect(pages).toHaveLength(
      estimateImagePages(1440, 9000, { size: 'a4', orientation: 'portrait', split: 'multi' }),
    )
  })

  it('القاطع يُسأل داخل نافذته وحدها — ثُمن الصفحة قبل الحدّ', async () => {
    const asked: [number, number][] = []
    const scale = scaleFor(1440, 9000, box, 'multi')
    const per = rowsPerPage(scale, box)
    await planImagePages(1440, 9000, box, 'multi', (earliest, ideal) => {
      asked.push([earliest, ideal])
      return Promise.resolve(ideal - 10)
    })
    const [first] = asked
    expect(first![1]).toBe(per)
    expect(first![0]).toBe(per - Math.floor(per * BREAK_WINDOW))
  })

  it('**قاطعٌ معيب لا يكسر التخطيط**: ما يقع خارج نافذته يُقصّ، و`NaN` يعني الحدّ المثالي', async () => {
    const wild = await planImagePages(1440, 9000, box, 'multi', () => Promise.resolve(-5))
    const nan = await planImagePages(1440, 9000, box, 'multi', () => Promise.resolve(Number.NaN))
    for (const pages of [wild, nan]) {
      expect(pages.every((p) => p.rows > 0)).toBe(true)
      expect(pages.at(-1)!.top + pages.at(-1)!.rows).toBe(9000)
    }
  })

  it('صورةٌ تسعها صفحة تبقى صفحة واحدة في الوضعين', async () => {
    expect(await planImagePages(1440, 300, box, 'multi')).toHaveLength(1)
    expect(
      estimateImagePages(1440, 300, { size: 'a4', orientation: 'portrait', split: 'multi' }),
    ).toBe(1)
    expect(
      estimateImagePages(1440, 90000, { size: 'a4', orientation: 'portrait', split: 'single' }),
    ).toBe(1)
  })
})

describe('«بلا قطع سطر» — القطع في الفراغ', () => {
  it('يقطع في منتصف أقرب شريطٍ هادئ إلى الحدّ', () => {
    // صفوف 80–89 هادئة، والحدّ 100: القطع 85 — منتصف الشريط.
    const quiet = (row: number) => row >= 80 && row < 90
    expect(pickBreak(quiet, 50, 100)).toBe(85)
  })

  it('يفضّل الأقرب إلى الحدّ حين يوجد شريطان', () => {
    const quiet = (row: number) => (row >= 60 && row < 70) || (row >= 90 && row < 96)
    expect(pickBreak(quiet, 50, 100)).toBe(93)
  })

  it(`**صفٌّ هادئ منفرد ليس فراغًا** — أقلّ من ${MIN_QUIET_RUN} صفوف لا تُعدّ شريطًا`, () => {
    const quiet = (row: number) => row === 95 || row === 70
    expect(pickBreak(quiet, 50, 100)).toBe(100)
  })

  it('شريطٌ يبدأ عند أوّل النافذة يُقبل، ولا يُقرأ ما قبلها', () => {
    const seen: number[] = []
    const quiet = (row: number) => {
      seen.push(row)
      return row < 55
    }
    expect(pickBreak(quiet, 50, 100)).toBe(52)
    expect(Math.min(...seen)).toBe(50)
  })

  it('بلا فراغ أصلًا يقطع عند الحدّ المثالي — لا يدّعي ما لم يجد', () => {
    expect(pickBreak(() => false, 50, 100)).toBe(100)
  })
})

describe('الصفّ الهادئ من البكسلات', () => {
  const W = 400
  const row = (fill: (x: number) => readonly [number, number, number]) => {
    const data = new Uint8ClampedArray(W * 4)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fill(x)
      data.set([r, g, b, 255], x * 4)
    }
    return data
  }

  it('لونٌ واحد هادئ، وضجيج ضغطٍ خفيف لا يكسره', () => {
    expect(
      isQuietRow(
        row(() => [255, 255, 255]),
        W,
        0,
      ),
    ).toBe(true)
    expect(
      isQuietRow(
        row((x) => [250 + (x % 3), 250, 250]),
        W,
        0,
      ),
    ).toBe(true)
  })

  it('**حدود ثلاث بطاقات متجاورة لا تكسر الفراغ** — ستّة انتقالات', () => {
    const borders = new Set([100, 101, 200, 201, 300, 301])
    expect(
      isQuietRow(
        row((x) => (borders.has(x) ? [200, 200, 200] : [255, 255, 255])),
        W,
        0,
      ),
    ).toBe(true)
  })

  it('صفٌّ يمرّ بسطر نصّ ليس هادئًا', () => {
    expect(
      isQuietRow(
        row((x) => (x % 6 < 2 ? [20, 20, 20] : [255, 255, 255])),
        W,
        0,
      ),
    ).toBe(false)
  })

  it('يقرأ الصفّ المطلوب لا الأوّل', () => {
    const two = new Uint8ClampedArray(W * 4 * 2)
    two.set(
      row(() => [255, 255, 255]),
      0,
    )
    two.set(
      row((x) => (x % 6 < 2 ? [0, 0, 0] : [255, 255, 255])),
      W * 4,
    )
    expect(isQuietRow(two, W, 0)).toBe(true)
    expect(isQuietRow(two, W, 1)).toBe(false)
  })
})

describe('الصفحة النصّية', () => {
  it('ضعف النقاط بكسلًا — 144 نقطة في البوصة', () => {
    expect(textPagePixels(pageBox('a4', 'portrait'))).toEqual({ width: 1191, height: 1684 })
  })
})
