import { describe, expect, it } from 'vitest'

import { over, type Layer } from '@/modules/colour/composite'
import { contrastRatio, relativeLuminance } from '@/modules/colour/contrast'
import { deltaE, oklabOfBytes } from '@/modules/colour/distance'
import {
  formatColour,
  fromOklch,
  fromPixel,
  readColour,
  type Rgb255,
} from '@/modules/colour/formats'

import { fc } from './fc'

/**
 * تحويلات الألوان ذهابًا وإيابًا — على فضاء sRGB كلّه لا على مئة لون مختارة.
 *
 * `formats.ts` تَعِد بأن الدقّة المختارة لكل صيغة **كافية لإعادة البايتات نفسها**، وأن مسار
 * البكسل لا يُعلَن خارج المدى أبدًا. الخاصّية الأولى تعني أن ما تنسخه الأداة من أي صيغة ثمّ
 * يُلصَق في CSS يرسم البكسل الذي أُخذت منه العيّنة؛ والثانية أن الأزرق الخالص لا يُوصَف بما ليس فيه.
 */

const byte = fc.integer({ min: 0, max: 255 })
const rgb = fc.record({ r: byte, g: byte, b: byte })

const hex = (c: Rgb255) =>
  `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** أكبر فرق قناة بين لونين — صفرٌ يعني البايتات نفسها. */
const channelDelta = (a: Rgb255 | undefined, b: Rgb255) =>
  a ? Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) : Infinity

/**
 * **مثالٌ مضادّ وجدته البذرة الثابتة — الصفّ 207 في `Docs/Engineering.md §6`.**
 *
 * صيغة OKLCH بدقّتها الحالية (خانتان للإضاءة، وأربع للتشبّع، وخانتان للزاوية) لا تعيد كل لون
 * إلى بايتاته: `#fdf307` ← `oklch(94.16% 0.2008 106.63)` ← `#fdf306`. وقِيس الفضاء كلّه
 * (16,777,216 لونًا): 13,616 لونًا (0.081%) تعود بفرق بايتٍ واحد في قناةٍ واحدة على الأكثر، والصيغ
 * الأخرى كلّها دقيقة. فخاصّية OKLCH هنا تثبت الحدّ المقيس، والجولة الدقيقة `it.fails` أدناه:
 * تسقط يوم تُصلَح الدقّة فتُقلَب خاصّيةً كاملة.
 */
const OKLCH_COUNTEREXAMPLE: Rgb255 = { r: 253, g: 243, b: 7 }

describe('الصيغ المعتمة — كل صيغة تعيد البايتات نفسها', () => {
  it('السداسي ← قراءة ← سداسي هوية، والقراءة داخل المدى دائمًا', () => {
    fc.assert(
      fc.property(rgb, (c) => {
        const reading = readColour(hex(c))
        expect(reading?.rgb).toEqual(c)
        expect(reading?.inSrgb).toBe(true)
        expect(formatColour(reading!).hex).toBe(hex(c))
      }),
    )
  })

  it('بكسل ← hex · rgb · hsl · css ← قراءة: البايتات نفسها والشفافية كاملة', () => {
    fc.assert(
      fc.property(rgb, (c) => {
        const formats = formatColour(fromPixel(c.r, c.g, c.b))
        for (const text of [formats.hex, formats.rgb, formats.hsl, formats.css]) {
          const back = readColour(text)
          expect(back?.rgb, text).toEqual(c)
          expect(back?.alpha, text).toBe(1)
        }
      }),
    )
  })

  it('بكسل ← oklch ← قراءة: بايتٌ واحد على الأكثر في كل قناة (الصفّ 207)', () => {
    fc.assert(
      fc.property(rgb, (c) => {
        const text = formatColour(fromPixel(c.r, c.g, c.b)).oklch
        const back = readColour(text)
        expect(channelDelta(back?.rgb, c), text).toBeLessThanOrEqual(1)
        expect(back?.alpha, text).toBe(1)
      }),
      { examples: [[OKLCH_COUNTEREXAMPLE]] },
    )
  })

  it.fails('بكسل ← oklch ← قراءة بالبايتات نفسها — عطلٌ معروف (الصفّ 207)', () => {
    const { r, g, b } = OKLCH_COUNTEREXAMPLE
    expect(readColour(formatColour(fromPixel(r, g, b)).oklch)?.rgb).toEqual(OKLCH_COUNTEREXAMPLE)
  })

  it('مسار البكسل لا يُعلَن خارج sRGB أبدًا — ولا الأزرق الخالص', () => {
    fc.assert(
      fc.property(rgb, (c) => {
        expect(fromPixel(c.r, c.g, c.b).inSrgb).toBe(true)
      }),
      {
        examples: [[{ r: 0, g: 0, b: 255 }], [{ r: 255, g: 255, b: 255 }], [{ r: 0, g: 0, b: 0 }]],
      },
    )
  })
})

describe('الشفافية', () => {
  const alphaByte = fc.integer({ min: 0, max: 254 })

  it('rgba و hsla و oklch بشرطة: البايتات، والشفافية إلى ثلاث خانات', () => {
    fc.assert(
      fc.property(rgb, alphaByte, (c, a) => {
        const formats = formatColour(fromPixel(c.r, c.g, c.b, a))
        const expected = Math.round((a / 255) * 1000) / 1000
        for (const text of [formats.rgb, formats.hsl, formats.oklch, formats.css]) {
          const back = readColour(text)
          // OKLCH بحدّها المقيس — الصفّ 207؛ وما سواها بالبايتات نفسها.
          const tolerance = text === formats.oklch ? 1 : 0
          expect(channelDelta(back?.rgb, c), text).toBeLessThanOrEqual(tolerance)
          expect(back?.alpha, text).toBeCloseTo(expected, 9)
        }
      }),
    )
  })

  it('السداسي الثماني يحمل بايت الشفافية نفسه', () => {
    fc.assert(
      fc.property(rgb, alphaByte, (c, a) => {
        const back = readColour(formatColour(fromPixel(c.r, c.g, c.b, a)).hex)
        expect(back?.rgb).toEqual(c)
        expect(Math.round((back?.alpha ?? -1) * 255)).toBe(a)
      }),
    )
  })
})

describe('مسار التوليد — fromOklch', () => {
  const l = fc.integer({ min: 0, max: 10_000 }).map((n) => n / 10_000)
  const chroma = fc.integer({ min: 0, max: 4_000 }).map((n) => n / 10_000)
  const hue = fc.integer({ min: 0, max: 35_999 }).map((n) => n / 100)

  it('الإحداثيات الحقيقية تبقى كما وُلّدت — القصّ في البايتات وحدها', () => {
    fc.assert(
      fc.property(l, chroma, hue, (L, C, H) => {
        const reading = fromOklch(L, C, H)
        expect(reading.oklch.l).toBeCloseTo(L, 9)
        expect(reading.oklch.c).toBeCloseTo(C, 9)
        if (C > 0) expect(reading.oklch.h).toBeCloseTo(H, 6)
      }),
    )
  })

  it('البايتات المقصوصة لونٌ ثابت: قراءتها بكسلًا تعطيها نفسها', () => {
    fc.assert(
      fc.property(l, chroma, hue, (L, C, H) => {
        const { rgb: bytes } = fromOklch(L, C, H)
        for (const v of [bytes.r, bytes.g, bytes.b]) {
          expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true)
        }
        expect(fromPixel(bytes.r, bytes.g, bytes.b).rgb).toEqual(bytes)
      }),
    )
  })

  it('ما يُعلَن داخل المدى تعيده صيغة OKLCH المنسوخة إلى البايتات نفسها', () => {
    fc.assert(
      fc.property(l, chroma, hue, (L, C, H) => {
        const reading = fromOklch(L, C, H)
        if (!reading.inSrgb) return
        expect(readColour(formatColour(reading).oklch)?.rgb).toEqual(reading.rgb)
      }),
    )
  })
})

describe('المسافة والتباين والتركيب', () => {
  const lab = rgb.map((c) => oklabOfBytes(c.r, c.g, c.b))

  it('ΔE مسافةٌ حقًّا: غير سالبة، صفرٌ مع النفس، متناظرة، ومتباينة المثلّث', () => {
    fc.assert(
      fc.property(lab, lab, lab, (x, y, z) => {
        expect(deltaE(x, x)).toBe(0)
        expect(deltaE(x, y)).toBeGreaterThanOrEqual(0)
        expect(deltaE(x, y)).toBe(deltaE(y, x))
        expect(deltaE(x, z)).toBeLessThanOrEqual(deltaE(x, y) + deltaE(y, z) + 1e-12)
      }),
    )
  })

  it('نسبة التباين متناظرة وفي [1, 21]، وواحدٌ مع النفس', () => {
    fc.assert(
      fc.property(rgb, rgb, (a, b) => {
        const ratio = contrastRatio(a, b)
        expect(ratio).toBe(contrastRatio(b, a))
        expect(ratio).toBeGreaterThanOrEqual(1)
        expect(ratio).toBeLessThanOrEqual(21)
        expect(contrastRatio(a, a)).toBe(1)
      }),
    )
  })

  it('الإضاءة النسبية لا تنقص بزيادة أي قناة', () => {
    fc.assert(
      fc.property(rgb, fc.constantFrom('r', 'g', 'b'), (c, channel) => {
        if (c[channel] === 255) return
        const brighter = { ...c, [channel]: c[channel] + 1 }
        expect(relativeLuminance(brighter)).toBeGreaterThanOrEqual(relativeLuminance(c))
      }),
    )
  })

  const layer = fc.record({
    rgb,
    alpha: fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000),
  })

  it('التركيب: المعتم يحجب ما تحته، والشفّاف تمامًا لا يغيّره، والشفافية الناتجة لا تنقص', () => {
    fc.assert(
      fc.property(layer, layer, (source: Layer, backdrop: Layer) => {
        expect(over({ ...source, alpha: 1 }, backdrop)).toEqual({ rgb: source.rgb, alpha: 1 })
        const clear = over({ ...source, alpha: 0 }, backdrop)
        if (backdrop.alpha > 0) expect(clear).toEqual(backdrop)

        const out = over(source, backdrop)
        expect(out.alpha).toBeGreaterThanOrEqual(Math.max(source.alpha, backdrop.alpha) - 1e-12)
        expect(out.alpha).toBeLessThanOrEqual(1)
      }),
    )
  })
})
