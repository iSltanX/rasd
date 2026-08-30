import { describe, expect, it } from 'vitest'

import { readColour } from '@/modules/colour/formats'
import {
  nearestTailwind,
  TAILWIND_NEAR_DELTA,
  tailwindNaming,
} from '@/modules/colour/tailwind'
import {
  TAILWIND_PALETTE,
  TAILWIND_PALETTE_4_2_NEUTRALS,
} from '@/modules/colour/tailwind-palette'

const c = (css: string) => {
  const r = readColour(css)
  if (!r) throw new Error(`لون غير صالح في الاختبار: ${css}`)
  return r
}

describe('اللوحة — بنيتها قبل استعمالها', () => {
  it('242 درجة في اللوحة الأساسية و44 في محايدات 4.2', () => {
    expect(TAILWIND_PALETTE).toHaveLength(242)
    expect(TAILWIND_PALETTE_4_2_NEUTRALS).toHaveLength(44)
  })

  it('المحايدات الأربع **خارج** الأساسية — لا تُسمّى بلا طلب', () => {
    const families = new Set(TAILWIND_PALETTE.map((s) => s.family))
    for (const f of ['mauve', 'mist', 'olive', 'taupe']) expect(families.has(f)).toBe(false)
  })
})

describe('التطابق التامّ — قيَم v4 لا v3', () => {
  it('`#2b7fff` هو `blue-500` في v4', () => {
    const n = tailwindNaming(c('#2b7fff'))
    expect(n.verdict).toBe('exact')
    expect(n.name).toBe('blue-500')
  })

  it('**`#3b82f6` ليس `blue-500` v4** — يُسمّى `near` لا `exact`', () => {
    // قيمة v3. المسافة إلى `blue-500` في v4 ‎0.0193‎ — داخل العتبة، فالاسم
    // يُقال (وهو صحيح على موقع يبني على v3)، لكن **الحكم ليس تطابقًا**
    // والمسافة معروضة. هذا هو الفرق بين إخبارٍ صادق وادّعاء تطابق كاذب.
    const n = tailwindNaming(c('#3b82f6'))
    expect(n.nearest.swatch.name).toBe('blue-500')
    expect(n.nearest.deltaE).toBeCloseTo(0.01932, 4)
    expect(n.verdict).toBe('near')
    // والقيمة السداسية التي تُنتجها درجة v4 معروضة إلى جانبها للمقارنة.
    expect(n.nearest.hex).toBe('#2b7fff')
  })

  it('`#fb2c36` هو `red-500` و`#0f172b` هو `slate-900`', () => {
    expect(tailwindNaming(c('#fb2c36')).name).toBe('red-500')
    expect(tailwindNaming(c('#0f172b')).name).toBe('slate-900')
  })

  it('كل درجة في اللوحة تُسمّي نفسها — 242 دورة كاملة', () => {
    const misses: string[] = []
    for (const s of TAILWIND_PALETTE) {
      const n = tailwindNaming(c(s.oklch))
      // التعادلات مسموحة (اللوحة نفسها فيها تكرار)، والاسم يجب أن يكون
      // إمّا اسمها أو اسم درجة تساويها بالضبط.
      const names = [n.nearest.swatch.name, ...n.ties.map((t) => t.swatch.name)]
      if (n.verdict !== 'exact' || !names.includes(s.name)) misses.push(s.name)
    }
    expect(misses).toEqual([])
  })
})

describe('التعادل يُسرد لا يُخفى', () => {
  it('`#fafafa` هو `zinc-50` و`neutral-50` معًا — كلاهما يُذكر', () => {
    const n = tailwindNaming(c('#fafafa'))
    const all = [n.nearest.swatch.name, ...n.ties.map((t) => t.swatch.name)]
    expect(all).toContain('zinc-50')
    expect(all).toContain('neutral-50')
  })
})

describe('الرفض — الاسم يُمنع حين لا يصدق', () => {
  it('لون بعيد يُرجع `far` بلا اسم، ومع ذلك يُعلن أقربه', () => {
    const n = tailwindNaming(c('#7f3f9f'))
    expect(n.verdict).toBe('far')
    expect(n.name).toBeNull()
    expect(n.nearest.swatch.name).toBeTruthy()
    expect(n.nearest.deltaE).toBeGreaterThan(TAILWIND_NEAR_DELTA)
  })

  it('القيمة الصريحة موجودة **دائمًا** — حتى مع التطابق التامّ', () => {
    expect(tailwindNaming(c('#2b7fff')).arbitrary).toBe('[#2b7fff]')
    expect(tailwindNaming(c('#7f3f9f')).arbitrary).toBe('[#7f3f9f]')
  })

  it('اللوحة لا تبتلع فضاء الألوان — أكثرية عيّنة عشوائية تُرفض', () => {
    // القياس المُوثَّق في الترويسة: ‎~9.8%‎ فقط من مكعّب sRGB داخل العتبة.
    let named = 0
    let seed = 12345
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const N = 400
    for (let i = 0; i < N; i++) {
      const hex = `rgb(${Math.floor(rnd() * 256)}, ${Math.floor(rnd() * 256)}, ${Math.floor(rnd() * 256)})`
      if (tailwindNaming(c(hex)).name !== null) named++
    }
    expect(named / N).toBeLessThan(0.2)
  })
})

describe('الشفافية — الاسم يحمل مُعدِّله', () => {
  it('نصف شفّاف يُسمّى `blue-500/50` لا `blue-500`', () => {
    expect(tailwindNaming(c('rgba(43, 127, 255, 0.5)')).name).toBe('blue-500/50')
  })

  it('المعتم بلا مُعدِّل', () => {
    expect(tailwindNaming(c('#2b7fff')).name).toBe('blue-500')
  })

  it('القيمة الصريحة تحمل الشفافية في القيمة نفسها', () => {
    expect(tailwindNaming(c('rgba(43, 127, 255, 0.5)')).arbitrary).toBe('[rgba(43,127,255,0.5)]')
  })

  it('التطابق يُقاس على اللون لا على الشفافية', () => {
    expect(tailwindNaming(c('rgba(43, 127, 255, 0.25)')).verdict).toBe('exact')
  })
})

describe('محايدات 4.2 — لا تُقحَم ولا تُمنَع', () => {
  it('`mist-500` لا يُسمّى افتراضًا', () => {
    const n = tailwindNaming(c('oklch(56% 0.021 213.5)'))
    expect(n.nearest.swatch.family).not.toBe('mist')
  })

  it('ويُسمّى حين يُطلب صراحةً', () => {
    const n = tailwindNaming(c('oklch(56% 0.021 213.5)'), { include42Neutrals: true })
    expect(n.name).toBe('mist-500')
  })
})

describe('المسافة في OKLab لا في sRGB', () => {
  it('اللون الخارج عن المدى يُقاس بعد قصّه — لا بإحداثياته الخام', () => {
    // `oklch(70% 0.4 150)` خارج sRGB؛ ما يُرى هو المقصوص، وعليه يقع الحكم.
    const raw = c('oklch(70% 0.4 150)')
    expect(raw.inSrgb).toBe(false)
    const n = tailwindNaming(raw)
    // الأقرب يُحسب من `rgb` المعروضة: لو حُسب من الخام لكانت المسافة أكبر
    // ممّا يقابل أي درجة، ولوقع الاختيار على درجة أخرى.
    const direct = nearestTailwind(raw)
    expect(direct.nearest.swatch.name).toBe(n.nearest.swatch.name)
  })

  it('المسافة صفر عند التطابق التامّ', () => {
    expect(nearestTailwind(c('#fb2c36')).nearest.deltaE).toBeCloseTo(0, 6)
  })
})

describe('مخرَج `@theme` — قيمة بلا اسم مُختلَق', () => {
  it('بصيغة OKLCH، وهي صيغة لوحة v4 نفسها', () => {
    expect(tailwindNaming(c('#2b7fff')).themeValue).toMatch(/^oklch\(/)
  })

  it('الإصدار معلَن مع كل حكم', () => {
    expect(tailwindNaming(c('#2b7fff')).version).toBe(4)
  })
})
