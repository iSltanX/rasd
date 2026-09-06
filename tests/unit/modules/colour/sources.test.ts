/**
 * تصنيف مصادر ألوان اللوحة — `§6.5`.
 *
 * ما يُختبَر هنا هو **الوصل** بين البكسل والتصريح: أن اللون المصرَّح يُنسَب
 * إلى موضع تصريحه، وأن ما لا تصريح له يقع في `image`، وأن الحكم لا ينقلب
 * بفارق أصغر من العتبة ولا يبقى بفارق أكبر منها.
 */
import { describe, expect, it } from 'vitest'

import { readColour } from '@/modules/colour/formats'
import { extractPalette } from '@/modules/colour/palette'
import { classifyPaletteSources, SOURCE_LABELS } from '@/modules/colour/sources'
import { USAGE_DELTA } from '@/modules/colour/usage'

import type { PaletteEntry } from '@/modules/colour/palette'
import type { DeclaredColour } from '@/modules/colour/usage'

const read = (hex: string) => readColour(hex)!

function entry(hex: string, share = 0.1): PaletteEntry {
  return { colour: read(hex), count: Math.round(share * 1000), share, neutral: false }
}
function declared(hex: string, site: DeclaredColour['site']): DeclaredColour {
  return { colour: read(hex), site }
}

describe('classifyPaletteSources', () => {
  it('اللون المصرَّح يُنسَب إلى موضع تصريحه لا إلى فئة مخترَعة', () => {
    const out = classifyPaletteSources(
      [entry('#7C3AED'), entry('#111827'), entry('#E7EAF0')],
      [
        declared('#7C3AED', 'background'),
        declared('#111827', 'text'),
        declared('#E7EAF0', 'border'),
      ],
    )
    expect(out.map((e) => e.source)).toEqual(['background', 'text', 'border'])
    expect(out.every((e) => e.nearestDeclaredDelta === 0)).toBe(true)
  })

  it('ما لا تصريح له يقع في `image` — وهذا نصّ §6.5 حرفيًّا', () => {
    const out = classifyPaletteSources([entry('#3AA6D0')], [declared('#7C3AED', 'background')])
    expect(out[0]!.source).toBe('image')
    expect(out[0]!.nearestDeclaredDelta).toBeGreaterThan(USAGE_DELTA)
  })

  it('بلا تصريحات إطلاقًا: كل شيء صورة، والمسافة لانهائية لا صفر', () => {
    const out = classifyPaletteSources([entry('#7C3AED')], [])
    expect(out[0]!.source).toBe('image')
    // صفرٌ هنا كان سيُقرأ «مطابقة تامّة» — وهو عكس الحقيقة.
    expect(out[0]!.nearestDeclaredDelta).toBe(Infinity)
  })

  /*
   * الحدّان حول العتبة: التصنيف قرارٌ ثنائي، فيُختبَر من جانبيه لا من جانب
   * واحد. اللون يُزاح بمقدار يقع تحت العتبة ثمّ فوقها.
   */
  it('فارقٌ دون العتبة يبقى مصرَّحًا', () => {
    // `#7C3AED` مقابل `#7C3AEE` — فارق بايت واحد، أرضية ضجيج التقريب.
    const out = classifyPaletteSources([entry('#7C3AEE')], [declared('#7C3AED', 'background')])
    expect(out[0]!.source).toBe('background')
    expect(out[0]!.nearestDeclaredDelta).toBeLessThan(USAGE_DELTA)
  })

  it('فارقٌ فوق العتبة يصير صورة — والمسافة تُعلَن لمن يضبطها', () => {
    const out = classifyPaletteSources([entry('#8C3AED')], [declared('#7C3AED', 'background')])
    expect(out[0]!.source).toBe('image')
    expect(out[0]!.nearestDeclaredDelta).toBeGreaterThan(USAGE_DELTA)
    expect(out[0]!.nearestDeclaredDelta).toBeLessThan(0.1)
  })

  it('العتبة قابلة للضبط — نفس المدخل ينقلب حكمه بتوسيعها', () => {
    const entries = [entry('#8C3AED')]
    const decls = [declared('#7C3AED', 'background')]
    expect(classifyPaletteSources(entries, decls)[0]!.source).toBe('image')
    expect(classifyPaletteSources(entries, decls, 0.1)[0]!.source).toBe('background')
  })

  it('لونٌ مصرَّح في موضعين: يفوز الأعمّ عند تساوي المسافة', () => {
    // نفس اللون نصًّا وخلفيةً — المسافة صفر لكليهما، فالخلفية أعمّ.
    const out = classifyPaletteSources(
      [entry('#7C3AED')],
      [declared('#7C3AED', 'shadow'), declared('#7C3AED', 'background')],
    )
    expect(out[0]!.source).toBe('background')
  })

  it('الأقرب يفوز على الأعمّ — المسافة تسبق الرتبة', () => {
    // خلفية أبعد (فوق العتبة) ونصّ مطابق: الأقرب هو الحكم.
    const out = classifyPaletteSources(
      [entry('#7C3AED')],
      [declared('#111827', 'background'), declared('#7C3AED', 'text')],
    )
    expect(out[0]!.source).toBe('text')
  })

  it('يحفظ بقيّة حقول المدخل كما هي — تصنيفٌ لا إعادة بناء', () => {
    const src = entry('#7C3AED', 0.34)
    const out = classifyPaletteSources([src], [])
    expect(out[0]!.share).toBe(0.34)
    expect(out[0]!.count).toBe(src.count)
    expect(out[0]!.neutral).toBe(false)
  })

  it('لكل مصدر تسمية عربية — لا مفتاح إنجليزي يتسرّب إلى الواجهة', () => {
    const out = classifyPaletteSources(
      [entry('#7C3AED'), entry('#3AA6D0')],
      [declared('#7C3AED', 'icon')],
    )
    for (const e of out) {
      expect(SOURCE_LABELS[e.source]).toBeTruthy()
      expect(SOURCE_LABELS[e.source]).not.toMatch(/[a-z]/i)
    }
  })
})

/**
 * **القياس الذي اختير الحدّ عليه، مثبَّتًا لا موصوفًا.**
 *
 * التعليق في `sources.ts` يقول إن ألوان الواجهة المسطّحة تخرج من
 * `extractPalette` بـ`ΔE = 0` عن تصريحها، وإن أقرب لون صورة يبعد أكثر من
 * خمسة أضعاف العتبة. وادّعاءٌ في تعليق لا يحرسه شيء يتعفّن بصمت — فيُقاس
 * هنا في كل تشغيل.
 */
describe('القياس المسنِد للعتبة — يُعاد في كل تشغيل', () => {
  const W = 400
  const H = 300

  /** صفحة اصطناعية: صورة متدرّجة في نصفها، وعنصرا واجهة مسطّحان. */
  function pageWithPhoto(): { data: Uint8ClampedArray; width: number; height: number } {
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (y < 150) {
          data[i] = Math.round(30 + (x / W) * 200)
          data[i + 1] = Math.round(90 + (y / 150) * 140)
          data[i + 2] = Math.round(200 - (x / W) * 150)
        } else {
          data[i] = 255
          data[i + 1] = 255
          data[i + 2] = 255
        }
        if (x > 60 && x < 220 && y > 60 && y < 108) {
          data[i] = 124
          data[i + 1] = 58
          data[i + 2] = 237
        }
        data[i + 3] = 255
      }
    }
    return { data, width: W, height: H }
  }

  it('لون واجهة مسطّح يخرج مطابقًا تمامًا لتصريحه — لا مقاربًا', () => {
    const flat = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      const at = i * 4
      const inButton = i % W > 60 && i % W < 220
      flat[at] = inButton ? 124 : 255
      flat[at + 1] = inButton ? 58 : 255
      flat[at + 2] = inButton ? 237 : 255
      flat[at + 3] = 255
    }
    const result = extractPalette({ data: flat, width: W, height: H }, { count: 8 })
    const classified = classifyPaletteSources(result.entries, [
      declared('#7C3AED', 'background'),
      declared('#FFFFFF', 'background'),
    ])
    const matched = classified.filter((e) => e.source !== 'image')
    expect(matched.length).toBeGreaterThanOrEqual(2)
    for (const e of matched) expect(e.nearestDeclaredDelta).toBe(0)
  })

  it('ألوان الصورة تبعد عن التصريحات بأكثر من خمسة أضعاف العتبة', () => {
    const result = extractPalette(pageWithPhoto(), { count: 8 })
    const classified = classifyPaletteSources(result.entries, [
      declared('#7C3AED', 'background'),
      declared('#FFFFFF', 'background'),
    ])
    const images = classified.filter((e) => e.source === 'image')
    expect(images.length).toBeGreaterThan(0)
    const nearest = Math.min(...images.map((e) => e.nearestDeclaredDelta))
    // القياس المسجَّل: 0.05792 — أي 5.8× العتبة. الحدّ هنا أدنى منه بهامش.
    expect(nearest).toBeGreaterThan(USAGE_DELTA * 5)
  })
})
