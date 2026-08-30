import { describe, expect, it } from 'vitest'

import { formatColour, formatsOf, fromPixel, readColour } from '@/modules/colour/formats'

/**
 * الصيغ الخمس — `Rasd_Ar.md §6.7`.
 *
 * جولة الذهاب والإياب على 100 لون هي البند المنصوص في نصّ المرحلة؛ وهي
 * أهمّ اختبار هنا لأنها تُثبت أن الدقّة المختارة كافية فعلًا لا مُدَّعاة.
 */

describe('readColour — التحليل', () => {
  it('يقرأ السداسي', () => {
    const c = readColour('#3b82f6')
    expect(c?.rgb).toEqual({ r: 59, g: 130, b: 246 })
    expect(c?.alpha).toBe(1)
    expect(c?.inSrgb).toBe(true)
  })

  it('يقرأ الصيغة القديمة بفواصل', () => {
    expect(readColour('rgb(59, 130, 246)')?.rgb).toEqual({ r: 59, g: 130, b: 246 })
  })

  it('يقرأ الشفافية من rgba', () => {
    const c = readColour('rgba(0, 0, 0, 0.5)')
    expect(c?.alpha).toBeCloseTo(0.5, 3)
  })

  it('يقرأ الأسماء المعرَّفة', () => {
    expect(readColour('white')?.rgb).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('يقرأ oklch — الصيغة التي لا صيغة قديمة لها', () => {
    const c = readColour('oklch(62.8% 0.2577 29.23)')
    expect(c).not.toBeNull()
    expect(c?.oklch.l).toBeCloseTo(0.628, 3)
  })

  it('`transparent` لون صالح شفّاف لا فشل', () => {
    expect(readColour('transparent')?.alpha).toBe(0)
  })

  it('ما ليس لونًا يُرجع null لا يرمي', () => {
    expect(readColour('none')).toBeNull()
    expect(readColour('linear-gradient(red, blue)')).toBeNull()
    expect(readColour('')).toBeNull()
    expect(readColour('currentcolor')).toBeNull()
  })
})

describe('الخروج من مدى sRGB — يُعلَن ولا يُخفى', () => {
  it('لون داخل المدى يُعلَن داخله', () => {
    expect(readColour('#3b82f6')?.inSrgb).toBe(true)
  })

  it('oklch مشبَّع خارج sRGB يُعلَن خارجه', () => {
    const c = readColour('oklch(70% 0.4 150)')
    expect(c?.inSrgb).toBe(false)
  })

  it('الإحداثيات المعروضة تبقى **الحقيقية** لا المقصوصة', () => {
    const c = readColour('oklch(70% 0.4 150)')
    expect(c).not.toBeNull()
    expect(c?.oklch.c).toBeCloseTo(0.4, 3)
    // والقيمة المعروضة صالحة داخل sRGB.
    const { r, g, b } = c!.rgb
    for (const ch of [r, g, b]) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(255)
    }
  })

  /**
   * **القصّ يطابق كروم لا المواصفة** — قِيس في متصفّح حقيقي عبر
   * `canvas.fillStyle` + `getImageData` على درجات Tailwind v4 الخارجة عن
   * المدى. لو أُعيد `clampChroma` لأخفقت الأولَيان.
   */
  describe('قيَم مقيسة من كروم — الحارس ضد العودة إلى خفض التشبّع', () => {
    const vectors: [string, string, string][] = [
      ['blue-500', 'oklch(62.3% 0.214 259.815)', '#2b7fff'],
      ['green-500', 'oklch(72.3% 0.219 149.579)', '#00c950'],
      ['fuchsia-500', 'oklch(66.7% 0.295 322.15)', '#e12afb'],
    ]
    for (const [name, css, hex] of vectors) {
      it(`${name} يُرسَم ${hex}`, () => {
        expect(formatsOf(css)?.hex).toBe(hex)
      })
    }

    it('والخروج عن المدى معلَن مع ذلك — القيمة مقصوصة لا أصلية', () => {
      expect(readColour('oklch(62.3% 0.214 259.815)')?.inSrgb).toBe(false)
      expect(readColour('oklch(72.3% 0.219 149.579)')?.inSrgb).toBe(false)
    })
  })
})

describe('formatColour — الصيغ الخمس', () => {
  it('الصيغ الخمس للون معتم', () => {
    const f = formatsOf('#3b82f6')
    expect(f?.hex).toBe('#3b82f6')
    expect(f?.rgb).toBe('rgb(59, 130, 246)')
    expect(f?.hsl).toMatch(/^hsl\(/)
    expect(f?.oklch).toMatch(/^oklch\(/)
    expect(f?.css).toBe('#3b82f6')
  })

  it('الشفافية تُغيّر الصيغ الخمس كلّها', () => {
    const f = formatsOf('rgba(59, 130, 246, 0.5)')
    expect(f?.hex).toMatch(/^#[0-9a-f]{8}$/)
    expect(f?.rgb).toBe('rgba(59, 130, 246, 0.5)')
    expect(f?.hsl).toMatch(/^hsla\(/)
    expect(f?.oklch).toMatch(/ \/ 0\.5\)$/)
    // «قيمة CSS جاهزة» تصير rgba لا سداسيًا بثماني خانات: أوسع دعمًا.
    expect(f?.css).toBe('rgba(59, 130, 246, 0.5)')
  })

  it('الأبيض والأسود', () => {
    expect(formatsOf('#ffffff')?.rgb).toBe('rgb(255, 255, 255)')
    expect(formatsOf('#000000')?.rgb).toBe('rgb(0, 0, 0)')
  })

  it('الرماديّ بلا زاوية يُعطى صفرًا لا NaN', () => {
    const f = formatsOf('#808080')
    expect(f?.oklch).not.toContain('NaN')
    expect(f?.hsl).not.toContain('NaN')
  })
})

describe('fromPixel — مسار العيّنة', () => {
  it('بايتات خام تعطي القراءة نفسها التي يعطيها السداسي', () => {
    const a = fromPixel(59, 130, 246)
    const b = readColour('#3b82f6')
    expect(a.rgb).toEqual(b?.rgb)
    expect(formatColour(a).hex).toBe('#3b82f6')
  })

  it('بكسل من لقطة PNG داخل sRGB دائمًا بحكم مصدره', () => {
    expect(fromPixel(255, 0, 0).inSrgb).toBe(true)
    expect(fromPixel(0, 0, 0).inSrgb).toBe(true)
  })

  it('قناة ألفا الخام تُترجَم إلى 0..1', () => {
    expect(fromPixel(0, 0, 0, 128).alpha).toBeCloseTo(128 / 255, 3)
  })
})

describe('جولة الذهاب والإياب على 100 لون — الدقّة كافية لا مُدَّعاة', () => {
  /** مولِّد حتميّ: نفس المئة لون في كل تشغيل، فالفشل قابل لإعادة الإنتاج. */
  function* hundred(): Generator<[number, number, number]> {
    let seed = 0x9e3779b9
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    // ثمانية أركان مضمونة أوّلًا — الحدود قبل العشوائي.
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [0, 255, 255],
      [255, 0, 255],
    ]
    for (const c of corners) yield c
    for (let i = 0; i < 92; i++) {
      yield [Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256)]
    }
  }

  it('hex → oklch المنسَّق → hex يعيد اللون نفسه بالضبط', () => {
    const failures: string[] = []
    for (const [r, g, b] of hundred()) {
      const original = formatColour(fromPixel(r, g, b))
      const back = formatsOf(original.oklch)
      if (back?.hex !== original.hex) {
        failures.push(`${original.hex} → ${original.oklch} → ${back?.hex}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('hex → hsl المنسَّق → hex يعيد اللون نفسه بالضبط', () => {
    const failures: string[] = []
    for (const [r, g, b] of hundred()) {
      const original = formatColour(fromPixel(r, g, b))
      const back = formatsOf(original.hsl)
      if (back?.hex !== original.hex) {
        failures.push(`${original.hex} → ${original.hsl} → ${back?.hex}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('hex → rgb المنسَّق → hex يعيد اللون نفسه بالضبط', () => {
    for (const [r, g, b] of hundred()) {
      const original = formatColour(fromPixel(r, g, b))
      expect(formatsOf(original.rgb)?.hex).toBe(original.hex)
    }
  })
})
