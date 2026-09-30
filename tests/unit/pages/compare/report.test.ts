import { describe, expect, it } from 'vitest'

import { computeDiff, type RasterImage } from '@/modules/compare/diff'
import { groupDiffRegions } from '@/modules/compare/regions'
import {
  DEFAULT_INCLUDE,
  MAX_LISTED_REGIONS,
  reportBlocks,
  reportMarks,
  reportMetadata,
  type ReportInput,
  type ReportOutcome,
} from '@/pages/compare/report'
import { formatPercent } from '@/shared/bidi/numerals'
import { deviceRect } from '@/shared/geometry'

import type { DocBlock } from '@/modules/export/pdf-document'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * تقرير المقارنة — معيار القبول في `STAGES/05`: «تقريرٌ لمرجعٍ بمنطقة مستثناة يطابق نسبته المقنَّعة» (`STAGES/34`).
 *
 * صورتان حقيقيتان تختلفان في مكانين: داخل منطقة مستثناة وخارجها. المحرّك يحسب بالقناع، والتقرير يجب أن
 * يحمل **ذلك الرقم** لا نسبة الصورة كلّها — ويسمّي المنطقة ويُخطّطها برقمها.
 */

const W = 100
const H = 60

function raster(paint: (x: number, y: number) => number): RasterImage {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = paint(x, y)
      data.set([v, v, v, 255], (y * W + x) * 4)
    }
  }
  return { data, width: W, height: H }
}

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

// فرقٌ كبير داخل المنطقة (ساعة متغيّرة)، وفرقٌ صغير خارجها (تغيّر حقيقي).
const CLOCK = { x: 10, y: 10, w: 40, h: 30 }
const REAL = { x: 70, y: 40, w: 10, h: 10 }
const a = raster(() => 255)
const b = raster((x, y) => (inside(x, y, CLOCK) || inside(x, y, REAL) ? 0 : 255))
const zone = deviceRect(CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h)

const masked = computeDiff(a, b, { exclude: [zone] })
const unmasked = computeDiff(a, b)

const outcomeOf = (d: typeof masked): ReportOutcome => ({
  ...d,
  regions: groupDiffRegions(d.mask, d.overlap.width, d.overlap.height),
})

const capture = (id: string, title: string): CaptureRecord => ({
  id,
  createdAt: Date.UTC(2026, 8, 30, 10, 0),
  origin: 'https://shop.example',
  url: `https://shop.example/checkout?v=${id}`,
  title,
  kind: 'viewport',
  status: 'ready',
  projectId: 'p1',
  tags: [],
  width: W,
  height: H,
  devicePixelRatio: 1,
  favorite: false,
  archived: false,
  trashedAt: null,
})

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  a: capture('a', 'الدفع v1'),
  b: capture('b', 'الدفع v2'),
  outcome: outcomeOf(masked),
  zones: [{ id: 1, rect: zone }],
  threshold: 0.1,
  include: DEFAULT_INCLUDE,
  strip: false,
  ...over,
})

const rowsOf = (blocks: readonly DocBlock[]) =>
  blocks.flatMap((b) => (b.kind === 'rows' ? [...b.rows] : []))
const valueOf = (blocks: readonly DocBlock[], label: string) =>
  rowsOf(blocks).find((r) => r.label === label)?.value

describe('النسبة المقنَّعة', () => {
  it('المحرّك نفسه يعطي رقمين مختلفين — فالاختبار يستطيع أن يفرّق', () => {
    expect(masked.diffRatio).toBeCloseTo(100 / (W * H - CLOCK.w * CLOCK.h), 6)
    expect(unmasked.diffRatio).toBeCloseTo((100 + CLOCK.w * CLOCK.h) / (W * H), 6)
    expect(formatPercent(masked.diffRatio)).not.toBe(formatPercent(unmasked.diffRatio))
  })

  it('**التقرير يحمل النسبة المقنَّعة** لا نسبة الصورة كلّها، ويقول على ماذا حُسبت', () => {
    const blocks = reportBlocks(input())
    expect(valueOf(blocks, 'نسبة الفرق')).toBe(formatPercent(masked.diffRatio))
    expect(valueOf(blocks, 'نسبة الفرق')).not.toBe(formatPercent(unmasked.diffRatio))
    expect(valueOf(blocks, 'تُحسب على')).toContain('المناطق المهمّة')
  })

  it('**والمنطقة المستثناة مسمّاةٌ برقمها وموضعها**، وعدد بكسلاتها', () => {
    const blocks = reportBlocks(input())
    const heading = blocks.find(
      (b) => b.kind === 'heading' && b.text.startsWith('المناطق المستثناة'),
    )
    expect(heading).toBeDefined()
    const items = blocks.flatMap((b) => (b.kind === 'items' ? [...b.items] : []))
    const named = items.find((i) => i.title === 'منطقة مستثناة ١')
    expect(named?.lines[0]?.text).toContain('40 × 30 عند 10, 10')
    const note = blocks.find((b) => b.kind === 'text')
    expect(note && note.kind === 'text' ? note.text : '').toContain(String(CLOCK.w * CLOCK.h))
  })

  it('**ومخطّطةٌ في الصورة بالرقم نفسه**: علامات الرسم تحمل المنطقة ومستطيلها', () => {
    const marks = reportMarks(outcomeOf(masked), [{ id: 7, rect: zone }])
    expect(marks.zones).toEqual([{ label: '١', rect: zone }])
    // المنطقة المختلفة الوحيدة هي الحقيقية خارج الاستثناء — لا منطقة الساعة.
    expect(marks.regions).toHaveLength(1)
    expect(marks.regions[0]!.rect.x).toBeGreaterThanOrEqual(REAL.x - 4)
  })

  it('بلا مناطق مستثناة: لا قسم لها ولا سطر «تُحسب على»', () => {
    const blocks = reportBlocks(input({ zones: [], outcome: outcomeOf(unmasked) }))
    expect(valueOf(blocks, 'تُحسب على')).toBeUndefined()
    expect(blocks.some((b) => b.kind === 'heading' && b.text.startsWith('المناطق المستثناة'))).toBe(
      false,
    )
  })
})

describe('ما يتضمّنه التقرير', () => {
  it('المناطق واللقطتان والرابط بمفاتيحها', () => {
    const none = reportBlocks(
      input({ include: { diffImage: true, regions: false, captures: false, pageLink: false } }),
    )
    const all = reportBlocks(
      input({ include: { diffImage: true, regions: true, captures: true, pageLink: true } }),
    )
    const headings = (bs: readonly DocBlock[]) =>
      bs.flatMap((b) => (b.kind === 'heading' ? [b.text.split(' · ')[0]] : []))
    expect(headings(none)).toEqual(['النتيجة', 'المناطق المستثناة'])
    expect(headings(all)).toEqual([
      'النتيجة',
      'المناطق المستثناة',
      'المناطق المختلفة',
      'اللقطتان',
      'رابط الصفحة',
    ])
    expect(valueOf(all, 'الحالية')).toBe('https://shop.example/checkout?v=b')
  })

  it('**مع الحذف: لا عنوان لقطة ولا رابط في الورقة ولا قاموس Info** — حتى لو طُلب الرابط', () => {
    const strip = input({
      strip: true,
      include: { diffImage: true, regions: true, captures: true, pageLink: true },
    })
    const text = JSON.stringify(reportBlocks(strip))
    expect(text).not.toContain('الدفع v1')
    expect(text).not.toContain('الدفع v2')
    expect(text).not.toContain('shop.example')
    expect(text).toContain('اللقطة أ')
    expect(reportMetadata(strip, 'منصّة', new Date(0))).toBeNull()
  })

  it('وقاموس Info بلا حذف: العنوانان والرابط والمشروع', () => {
    expect(reportMetadata(input(), 'منصّة', new Date(0))).toEqual({
      title: 'تقرير المقارنة — الدفع v2 مقابل الدفع v1',
      subject: 'https://shop.example/checkout?v=b',
      keywords: ['منصّة'],
      createdAt: new Date(0),
    })
  })

  it(`المناطق فوق ${MAX_LISTED_REGIONS} يُقال عددها ولا تُسرد`, () => {
    const regions = Array.from({ length: MAX_LISTED_REGIONS + 5 }, (_, i) => ({
      id: i + 1,
      rect: deviceRect(0, 0, 1, 1),
      pixels: 1,
    }))
    const blocks = reportBlocks(input({ outcome: { ...outcomeOf(masked), regions } }))
    const items = blocks.flatMap((b) => (b.kind === 'items' ? [...b.items] : []))
    expect(
      items.filter((i) => i.title.startsWith('منطقة ') && !i.title.includes('مستثناة')),
    ).toHaveLength(MAX_LISTED_REGIONS)
    expect(JSON.stringify(blocks)).toContain('أخرى')
  })
})
