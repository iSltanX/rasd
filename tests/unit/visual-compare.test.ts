// @vitest-environment node
// مقارن اللقطات خالص: يفكّ PNG ويقيس، فلا علاقة له بالـDOM.

import { deflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
import * as raw from '../../scripts/lib/visual-compare.mjs'

/**
 * الانحدار البصري الآلي (`STAGES/26`، ADR 0052). المقارن هو الحارس الفعلي: خطؤه إمّا يُسقط البناء بلا عطل
 * (متصفّح يغيّر تنعيم حرف) أو يمرّر عطلًا (لونٌ تغيّر). فلكل رقم فيه حالة موجبة يمرّ عليها وسالبة يسقط عليها.
 */

interface Img {
  width: number
  height: number
  data: Uint8Array
}
interface Metrics {
  sameSize: boolean
  width: number
  height: number
  fraction: number
  tile: number
  diffPixels: number
  mask?: Uint8Array
}
interface Limits {
  fraction: number
  tile: number
}
/** تعريفات المكتبة غير المكتوبة — تُعلَن هنا مرّة فلا يتسرّب `any` إلى الاختبارات. */
const { decodePng, encodePng, judge, LIMITS, measureDiff, TILE } = raw as unknown as {
  decodePng: (buf: Buffer) => Img
  encodePng: (img: Img) => Buffer
  judge: (m: Metrics, limits: Limits) => string | null
  LIMITS: Limits
  measureDiff: (a: Img, b: Img, o?: { wantMask?: boolean }) => Metrics
  TILE: number
}

/** صورة بلون واحد. */
function solid(width: number, height: number, rgb: [number, number, number]): Img {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

/** يرسم مستطيلًا بلونٍ — على نسخة، لا على الأصل. */
function paint(img: Img, x0: number, y0: number, w: number, h: number, rgb: number[]): Img {
  const data = img.data.slice()
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * img.width + x) * 4
      data[o] = rgb[0] ?? 0
      data[o + 1] = rgb[1] ?? 0
      data[o + 2] = rgb[2] ?? 0
    }
  }
  return { ...img, data }
}

describe('decodePng — يفكّ ما يكتبه كروم', () => {
  it('ذهابٌ وإيابٌ مع المُرمِّز: البكسلات كما هي', () => {
    const src = paint(solid(7, 5, [10, 20, 30]), 2, 1, 3, 2, [200, 100, 50])
    const back = decodePng(encodePng(src))
    expect(back.width).toBe(7)
    expect(back.height).toBe(5)
    expect(Array.from(back.data)).toEqual(Array.from(src.data))
  })

  it.each([
    ['Sub', 1],
    ['Up', 2],
    ['Average', 3],
    ['Paeth', 4],
  ])('مرشّح %s يُعكس صحيحًا', (_name, filter) => {
    const width = 5
    const height = 4
    // بيانات ذات تدرّج حتى لا يتساوى المرشّحان صدفة.
    const pixels = new Uint8Array(width * height * 4)
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + (i >> 3) * 11) & 0xff
    const bpp = 4
    const stride = width * bpp
    const raw = Buffer.alloc((stride + 1) * height)
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = filter
      for (let i = 0; i < stride; i++) {
        const cur = pixels[y * stride + i]!
        const a = i >= bpp ? pixels[y * stride + i - bpp]! : 0
        const b = y > 0 ? pixels[(y - 1) * stride + i]! : 0
        const c = y > 0 && i >= bpp ? pixels[(y - 1) * stride + i - bpp]! : 0
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        const predicted = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth
        raw[y * (stride + 1) + 1 + i] = (cur - predicted) & 0xff
      }
    }
    const png = withIdat(width, height, 6, deflateSync(raw))
    expect(Array.from(decodePng(png).data)).toEqual(Array.from(pixels))
  })

  it('RGB بلا ألفا يُقرأ معتمًا — ما يكتبه كروم حين لا شفافية', () => {
    const raw = Buffer.from([0, 9, 8, 7, 6, 5, 4])
    const img = decodePng(withIdat(2, 1, 2, deflateSync(raw)))
    expect(Array.from(img.data)).toEqual([9, 8, 7, 255, 6, 5, 4, 255])
  })

  it('ما ليس PNG ثماني البتّ غير المتشابك يُرمى به بصوتٍ عالٍ', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('ليس ملفّ PNG')
    expect(() => decodePng(withIdat(1, 1, 6, deflateSync(Buffer.alloc(5)), { depth: 16 }))).toThrow(
      'عمق بتّ',
    )
    expect(() => decodePng(withIdat(1, 1, 3, deflateSync(Buffer.alloc(2))))).toThrow('نوع لون')
    expect(() =>
      decodePng(withIdat(1, 1, 6, deflateSync(Buffer.alloc(5)), { interlace: 1 })),
    ).toThrow('متشابك')
  })
})

/** PNG يدوي: ترويسة + IDAT + IEND — لحالات لا يكتبها المُرمِّز. */
function withIdat(
  width: number,
  height: number,
  colourType: number,
  idat: Buffer,
  o: { depth?: number; interlace?: number } = {},
): Buffer {
  // الـCRC لا يُتحقَّق منه في المفكّك، فتُترك أصفارًا.
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, body, Buffer.alloc(4)])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = o.depth ?? 8
  header[9] = colourType
  header[12] = o.interlace ?? 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

describe('measureDiff وjudge — الحالات الموجبة', () => {
  const W = 1440
  const H = 900
  const base = paint(solid(W, H, [16, 24, 32]), 100, 100, 600, 300, [30, 45, 60])

  it('صورتان متطابقتان: صفر فرق، ويمرّ', () => {
    const m = measureDiff(base, base)
    expect(m).toMatchObject({ sameSize: true, fraction: 0, tile: 0, diffPixels: 0 })
    expect(judge(m, LIMITS)).toBeNull()
  })

  it('فرقٌ تحت عتبة اللون (ضجيج تنعيم) لا يُعدّ', () => {
    const near = base.data.slice()
    for (let i = 0; i < near.length; i += 4) near[i] = (near[i] ?? 0) + 2
    const m = measureDiff(base, { ...base, data: near })
    expect(m.diffPixels).toBe(0)
    expect(judge(m, LIMITS)).toBeNull()
  })

  it('بكسلاتٌ متفرّقة أقلّ من العتبتين تمرّ — ضجيج التقاط', () => {
    // 60 بكسلًا موزَّعة على سطرٍ واحد: 0.0046% من الصورة، وفي بلاطتها 60 من 1024 = 5.9%.
    const noisy = paint(base, 800, 500, 60, 1, [255, 255, 255])
    const m = measureDiff(base, noisy)
    expect(m.diffPixels).toBe(60)
    expect(judge(m, LIMITS)).toBeNull()
  })
})

describe('measureDiff وjudge — الحالات السالبة: كل رقمٍ يسقط على ما صُمّم له', () => {
  const W = 1440
  const H = 900
  const base = paint(solid(W, H, [16, 24, 32]), 100, 100, 600, 300, [30, 45, 60])

  it('لونٌ تغيّر في مساحةٍ كبيرة ⇐ انحرافٌ منتشر (النسبة الكلّية)', () => {
    const m = measureDiff(base, paint(base, 100, 100, 600, 300, [0, 200, 180]))
    expect(m.fraction).toBeGreaterThan(LIMITS.fraction)
    expect(judge(m, LIMITS)).toMatch(/^انحراف منتشر/u)
  })

  it('شارةٌ صغيرة بلونٍ آخر ⇐ تُسقطها البلاطة لا النسبة', () => {
    // 24×24 = 576 بكسلًا = 0.044% — تحت عتبة النسبة، وتملأ نصف بلاطتها: لولا البلاطة لمرّت.
    const m = measureDiff(base, paint(base, 1000, 600, 24, 24, [255, 0, 80]))
    expect(m.fraction).toBeLessThan(LIMITS.fraction)
    expect(m.tile).toBeGreaterThan(LIMITS.tile)
    expect(judge(m, LIMITS)).toMatch(/^انحراف موضعي/u)
  })

  it('البلاطة تُحسب على حدّ الصورة بمساحتها الفعلية لا بـ32×32', () => {
    // عرض 40 = بلاطة 32 وبلاطة 8: مستطيل 8×8 على حافّتها ملأ بلاطةً كاملةً مساحتها 8×32 → 25%.
    const small = solid(40, 32, [16, 24, 32])
    const m = measureDiff(small, paint(small, 32, 0, 8, 8, [255, 0, 80]))
    expect(m.tile).toBeCloseTo(64 / (8 * TILE), 5)
  })

  it('تغيّر الأبعاد ⇐ يسقط بسببه لا بنسبة بكسلات', () => {
    const m = measureDiff(base, solid(W, H + 8, [16, 24, 32]))
    expect(m.sameSize).toBe(false)
    expect(judge(m, LIMITS)).toBe(`الأبعاد تغيّرت إلى ${W}×${H + 8}`)
  })

  it('ويُكتب قناع الفرق عند الطلب وحده: المختلف أحمر قاطع', () => {
    const changed = paint(base, 10, 10, 4, 4, [255, 0, 80])
    expect(measureDiff(base, changed).mask).toBeUndefined()
    const m = measureDiff(base, changed, { wantMask: true })
    const o = (11 * W + 11) * 4
    expect(Array.from(m.mask!.slice(o, o + 3))).toEqual([255, 0, 0])
  })
})
