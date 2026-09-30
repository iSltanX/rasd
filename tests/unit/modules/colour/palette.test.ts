import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PALETTE_OPTIONS,
  extractPalette,
  NEUTRAL_CHROMA,
  type PixelSource,
} from '@/modules/colour/palette'

type Rgba = readonly [number, number, number, number]

/** يبني صورة من دالّة تُعطي لون كل بكسل — أوضح من مصفوفات مكتوبة يدويًّا. */
function image(width: number, height: number, at: (x: number, y: number) => Rgba): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(at(x, y), (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

/** صورة من شرائط رأسية متساوية بألوان معطاة. */
function stripes(width: number, height: number, colours: readonly Rgba[]): PixelSource {
  return image(
    width,
    height,
    (x) => colours[Math.floor((x / width) * colours.length)] ?? colours[0]!,
  )
}

const RED = [220, 30, 30, 255] as const
const GREEN = [30, 190, 60, 255] as const
const BLUE = [40, 70, 210, 255] as const
const WHITE = [255, 255, 255, 255] as const
const BLACK = [0, 0, 0, 255] as const
const GREY = [128, 128, 128, 255] as const

const hexes = (src: PixelSource, count: number): string[] =>
  extractPalette(src, { count })
    .entries.map((e) => e.colour.rgb)
    .map((c) => `${c.r},${c.g},${c.b}`)

describe('extractPalette — الحتمية (شرط المرحلة 14 الصريح)', () => {
  it('المدخل نفسه يعطي الناتج نفسه بالضبط، مرّتين متتاليتين', () => {
    const src = stripes(64, 16, [RED, GREEN, BLUE, WHITE])
    const a = extractPalette(src, { count: 4 })
    const b = extractPalette(src, { count: 4 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('**بلا بذرة أصلًا** — لا عشوائية تُدار، فالحتمية أقوى ممّا يطلبه النصّ', () => {
    // النصّ يطلب «نتائج ثابتة عند البذرة نفسها»؛ median-cut لا يقبل بذرة
    // إطلاقًا، فلا يوجد مدخل ثانٍ يمكن أن يغيّر الناتج.
    const src = stripes(50, 10, [RED, BLUE])
    const runs = [0, 1, 2, 3, 4].map(() => hexes(src, 2))
    for (const r of runs) expect(r).toEqual(runs[0])
  })
})

describe('extractPalette — الاستخراج على صور مرجعية', () => {
  it('صورة من لونين تعطي اللونين بحصّتين متساويتين', () => {
    const src = stripes(40, 10, [RED, BLUE])
    const result = extractPalette(src, { count: 2 })
    expect(result.entries).toHaveLength(2)
    for (const e of result.entries) expect(e.share).toBeCloseTo(0.5, 2)
  })

  it('اللون الأغلب يتصدّر الترتيب', () => {
    // ثلاثة أرباع أحمر، ربع أزرق.
    const src = image(40, 10, (x) => (x < 30 ? RED : BLUE))
    const result = extractPalette(src, { count: 2 })
    expect(result.entries[0]?.share).toBeCloseTo(0.75, 2)
    expect(result.entries[0]?.colour.rgb.r).toBeGreaterThan(150)
  })

  it('**لا تُختلَق ألوان لملء العدد**: صورة من لونين تُطلَب منها ثمانية فتعطي اثنين', () => {
    const src = stripes(40, 10, [RED, BLUE])
    expect(extractPalette(src, { count: 8 }).entries.length).toBeLessThanOrEqual(2)
  })

  it('الحصص تجمع إلى واحد', () => {
    const src = stripes(60, 10, [RED, GREEN, BLUE])
    const result = extractPalette(src, { count: 3 })
    const sum = result.entries.reduce((acc, e) => acc + e.share, 0)
    expect(sum).toBeCloseTo(1, 6)
  })

  it('يفصل الألوان الثلاثة المتمايزة بعضها عن بعض', () => {
    const src = stripes(60, 10, [RED, GREEN, BLUE])
    const result = extractPalette(src, { count: 3 })
    expect(result.entries).toHaveLength(3)
    // كل لون ناتج أقرب إلى أحد الأصول الثلاثة، وثلاثتها مغطّاة.
    const dominant = result.entries.map((e) => {
      const { r, g, b } = e.colour.rgb
      if (r > g && r > b) return 'r'
      if (g > r && g > b) return 'g'
      return 'b'
    })
    expect(new Set(dominant)).toEqual(new Set(['r', 'g', 'b']))
  })
})

describe('extractPalette — مرشِّح الحياديات (§6.3)', () => {
  const NEUTRALS: readonly Rgba[] = [WHITE, BLACK, GREY, [64, 64, 64, 255], [200, 200, 200, 255]]
  const CHROMATIC: readonly Rgba[] = [RED, GREEN, BLUE, [230, 180, 20, 255], [150, 40, 190, 255]]

  it('يسم الرماديات والأبيض والأسود حياديةً — خمس صور', () => {
    for (const n of NEUTRALS) {
      const result = extractPalette(
        image(8, 8, () => n),
        { count: 1 },
      )
      expect(result.entries[0]?.neutral, `${n.join(',')} يجب أن يكون حياديًّا`).toBe(true)
    }
  })

  it('لا يسم الألوان المميّزة حياديةً — خمس صور', () => {
    for (const c of CHROMATIC) {
      const result = extractPalette(
        image(8, 8, () => c),
        { count: 1 },
      )
      expect(result.entries[0]?.neutral, `${c.join(',')} يجب ألّا يكون حياديًّا`).toBe(false)
    }
  })

  it('`dropNeutrals` يُسقط الحياديات ويُبقي المميّزة، ويُعلن كم أُسقط', () => {
    const src = stripes(60, 10, [RED, GREY, BLUE])
    const result = extractPalette(src, { count: 3, dropNeutrals: true })
    expect(result.droppedNeutrals).toBeGreaterThan(0)
    for (const e of result.entries) expect(e.neutral).toBe(false)
  })

  it('العتبة مأخوذة من سلّم `ink` في نظام رصد — 0.03', () => {
    expect(NEUTRAL_CHROMA).toBe(0.03)
    expect(DEFAULT_PALETTE_OPTIONS.neutralChroma).toBe(NEUTRAL_CHROMA)
  })
})

describe('extractPalette — الحدود', () => {
  it('صورة شفّافة بالكامل تعطي لوحة فارغة بلا رمي', () => {
    const src = image(10, 10, () => [255, 0, 0, 0])
    const result = extractPalette(src)
    expect(result.entries).toEqual([])
    expect(result.countedPixels).toBe(0)
  })

  it('البكسلات الشفّافة لا تدخل الحساب', () => {
    // نصف أحمر معتم، ونصف أزرق شفّاف تمامًا — الأزرق لا يظهر.
    const src = image(20, 10, (x) => (x < 10 ? RED : [40, 70, 210, 0]))
    const result = extractPalette(src, { count: 2 })
    expect(result.countedPixels).toBe(100)
    for (const e of result.entries) expect(e.colour.rgb.b).toBeLessThan(120)
  })

  it('صورة أحادية اللون تعطي لونًا واحدًا مهما طُلب', () => {
    const result = extractPalette(
      image(16, 16, () => GREEN),
      { count: 12 },
    )
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.share).toBe(1)
  })

  it('`count` صفري أو سالب يُعامَل كواحد لا يرمي', () => {
    const src = stripes(20, 4, [RED, BLUE])
    expect(extractPalette(src, { count: 0 }).entries.length).toBe(1)
    expect(extractPalette(src, { count: -3 }).entries.length).toBe(1)
  })

  it('العيّنة تُخطّى على الصور الكبيرة، والمرّة الثانية تعدّ الكلّ', () => {
    // 200×200 = 40,000 بكسل، دون سقف العيّنة — فلا تخطٍّ.
    const small = extractPalette(stripes(200, 200, [RED, BLUE]), { count: 2 })
    expect(small.sampledPixels).toBe(40_000)
    expect(small.countedPixels).toBe(40_000)

    // سقف منخفض مفروض يدويًّا يُظهر التخطّي — والعدّ الكامل لا يتأثّر.
    const strided = extractPalette(stripes(200, 200, [RED, BLUE]), {
      count: 2,
      sampleTarget: 1000,
    })
    expect(strided.sampledPixels).toBeLessThan(2000)
    expect(strided.countedPixels).toBe(40_000)
  })
})

describe('extractPalette — الشفافية وحدّها', () => {
  it('ألفا عند العتبة بالضبط تُحسَب، ودونها بواحد تُهمَل', () => {
    // العتبة الافتراضية 128: «دون» تعني `<` لا `<=`.
    const at = extractPalette(
      image(4, 4, () => [220, 30, 30, 128]),
      { count: 1 },
    )
    expect(at.countedPixels).toBe(16)

    const below = extractPalette(
      image(4, 4, () => [220, 30, 30, 127]),
      { count: 1 },
    )
    expect(below.entries).toEqual([])
    expect(below.countedPixels).toBe(0)
  })

  it('`minAlpha` مخصَّصة تغيّر ما يُحسَب', () => {
    // نصف الصورة بألفا 200: تُقبل عند عتبة 100 وتُرفض عند 220.
    const src = image(10, 2, (x) => (x < 5 ? RED : [40, 70, 210, 200]))
    expect(extractPalette(src, { count: 2, minAlpha: 100 }).countedPixels).toBe(20)
    expect(extractPalette(src, { count: 2, minAlpha: 220 }).countedPixels).toBe(10)
  })
})

describe('extractPalette — مدخل ناقص وعناقيد متكرّرة المركز', () => {
  it('مخزن بيانات أقصر من الأبعاد لا يرمي ولا يعدّ بكسلًا لا بيانات له', () => {
    // الأبعاد تدّعي أربعة بكسلات والمخزن يحمل ثلاثة — فالرابع ألفاه غائبة أي شفّاف.
    const data = new Uint8ClampedArray([...RED, ...RED, ...BLUE])
    const result = extractPalette({ data, width: 4, height: 1 }, { count: 2 })
    expect(result.countedPixels).toBe(3)
    expect(result.sampledPixels).toBe(3)
    expect(result.entries.reduce((n, e) => n + e.count, 0)).toBe(3)
  })

  it('عنقودان بمركز واحد لا يُنتجان مدخلًا فارغًا ثانيًا', () => {
    /*
     * أزرقان وأحمر يُطلَب لهم ثلاثة ألوان: الفرز على محور الإضاءة يضع الأزرقين
     * أوّلًا، فتنتج القسمة صندوقين بأزرق واحد لكل منهما ومركزاهما متطابقان.
     * البكسل الأزرق يذهب إلى أوّلهما (الأقرب بالأسبقية)، والثاني يبقى بلا بكسل
     * فيُسقَط — لا يظهر في اللوحة بعدد صفر.
     */
    const src = image(3, 1, (x) => (x < 2 ? BLUE : RED))
    const result = extractPalette(src, { count: 3 })
    expect(result.entries).toHaveLength(2)
    expect(result.entries.every((e) => e.count > 0)).toBe(true)
    expect(result.entries.map((e) => e.count)).toEqual([2, 1])
    // الأكثر حصّةً أوّلًا: الأزرق (بكسلان) ثم الأحمر (بكسل).
    expect(result.entries[0]?.colour.rgb.b).toBeGreaterThan(result.entries[0]!.colour.rgb.r)
    expect(result.entries[1]?.colour.rgb.r).toBeGreaterThan(result.entries[1]!.colour.rgb.b)
    expect(result.entries.reduce((s, e) => s + e.share, 0)).toBeCloseTo(1, 10)
  })
})

describe('extractPalette — الحياديات بلا إسقاط', () => {
  it('بلا `dropNeutrals` تبقى الحياديات موسومةً ولا يُعدّ شيء مُسقَطًا', () => {
    const src = stripes(60, 10, [RED, GREY, BLUE])
    const result = extractPalette(src, { count: 3, dropNeutrals: false })
    expect(result.droppedNeutrals).toBe(0)
    expect(result.entries).toHaveLength(3)
    expect(result.entries.filter((e) => e.neutral)).toHaveLength(1)
  })

  it('الحصص بعد الإسقاط تبقى نسبةً من كل البكسلات المحسوبة لا من الباقي', () => {
    // الثلث الرمادي يُسقَط، فيبقى لكل من الباقيين ثلث لا نصف — والمُسقَط يُعلَن.
    const src = stripes(60, 10, [RED, GREY, BLUE])
    const result = extractPalette(src, { count: 3, dropNeutrals: true })
    expect(result.droppedNeutrals).toBe(1)
    expect(result.entries).toHaveLength(2)
    for (const e of result.entries) expect(e.share).toBeCloseTo(1 / 3, 2)
  })
})
