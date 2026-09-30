import { describe, expect, it } from 'vitest'

import {
  bleedMargin,
  blurRadius,
  blurWorkBytes,
  blurRegion,
  boxPassesForSigma,
  bytesEqual,
  clampToBuffer,
  coverRegion,
  distinctColours,
  pixelateRegion,
  regionVariance,
  type PixelBuffer,
} from '@/modules/editor/pixel-ops'

/** مخزن اختبار — `ImageData` تُحقّق `PixelBuffer` بنيويًّا، وهذا يبنيه بلا قماش. */
function buffer(width: number, height: number, fill = 0): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  if (fill !== 0) data.fill(fill)
  return { data, width, height }
}

const px = (b: PixelBuffer, x: number, y: number): readonly number[] => {
  const i = (y * b.width + x) * 4
  return [b.data[i]!, b.data[i + 1]!, b.data[i + 2]!, b.data[i + 3]!]
}

const setPx = (b: PixelBuffer, x: number, y: number, v: readonly number[]): void => {
  const i = (y * b.width + x) * 4
  b.data[i] = v[0]!
  b.data[i + 1] = v[1]!
  b.data[i + 2] = v[2]!
  b.data[i + 3] = v[3]!
}

describe('القصّ على حدود المخزن', () => {
  it('يقصّ ما يخرج ويُبقي ما يدخل', () => {
    expect(clampToBuffer({ x: -5, y: -5, w: 20, h: 20 }, 10, 10)).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    })
  })

  it('**ويقرّب إلى الخارج** — نصف بكسل مقصوص يترك صفًّا من الحسّاس سليمًا', () => {
    expect(clampToBuffer({ x: 2.4, y: 2.6, w: 3.2, h: 3.1 }, 20, 20)).toEqual({
      x: 2,
      y: 2,
      w: 4,
      h: 4,
    })
  })

  it('و`null` حين لا يتبقّى شيء', () => {
    expect(clampToBuffer({ x: 20, y: 0, w: 5, h: 5 }, 10, 10)).toBeNull()
    expect(clampToBuffer({ x: 0, y: 0, w: 0, h: 5 }, 10, 10)).toBeNull()
  })
})

describe('**التغطية — الوعد الوحيد**', () => {
  it('تكتب اللون على المنطقة وحدها', () => {
    const b = buffer(6, 6, 200)
    coverRegion(b, { x: 2, y: 2, w: 2, h: 2 }, { r: 10, g: 20, b: 30, a: 255 })
    expect(px(b, 2, 2)).toEqual([10, 20, 30, 255])
    expect(px(b, 3, 3)).toEqual([10, 20, 30, 255])
    expect(px(b, 1, 1)).toEqual([200, 200, 200, 200])
    expect(px(b, 4, 4)).toEqual([200, 200, 200, 200])
  })

  it('**والألفا 255 قسرًا حتى حين يطلب المستدعي 230**', () => {
    const b = buffer(4, 4, 90)
    coverRegion(b, { x: 0, y: 0, w: 4, h: 4 }, { r: 0, g: 0, b: 0, a: 230 })
    expect(px(b, 1, 1)[3]).toBe(255)
    // تغطية بشفافية تُفكّ حسابيًّا بمعرفة لون الغطاء — انظر ADR 0015.
  })

  it('والتباين داخلها صفر', () => {
    const b = buffer(8, 8)
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 37) % 256
    coverRegion(b, { x: 1, y: 1, w: 5, h: 5 }, { r: 220, g: 38, b: 38, a: 255 })
    expect(regionVariance(b, { x: 1, y: 1, w: 5, h: 5 })).toBe(0)
    expect(distinctColours(b, { x: 1, y: 1, w: 5, h: 5 }, 99)).toBe(1)
  })
})

describe('البكسلة', () => {
  it('**كل بكسلات الخليّة تصير متطابقة**', () => {
    const b = buffer(8, 8)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(b, x, y, [x * 30, y * 30, 0, 255])
    pixelateRegion(b, { x: 0, y: 0, w: 8, h: 8 }, 4)
    expect(px(b, 0, 0)).toEqual(px(b, 3, 3))
    expect(px(b, 4, 4)).toEqual(px(b, 7, 7))
    expect(px(b, 0, 0)).not.toEqual(px(b, 4, 4))
  })

  it('**والألوان المتميّزة لا تتجاوز عدد الخلايا** — لا حدس، بل حدٌّ بنيوي', () => {
    const b = buffer(64, 64)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++)
        setPx(b, x, y, [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, 255])
    }
    const before = distinctColours(b, { x: 0, y: 0, w: 64, h: 64 }, 5000)
    pixelateRegion(b, { x: 0, y: 0, w: 64, h: 64 }, 8)
    const after = distinctColours(b, { x: 0, y: 0, w: 64, h: 64 }, 5000)
    expect(before).toBeGreaterThan(1000)
    expect(after).toBeLessThanOrEqual(64) // 8×8 خليّة
  })

  it('وخليّة بمقاس 1 لا تفعل شيئًا — لا تدمير بلا فائدة', () => {
    const b = buffer(4, 4)
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 11) % 256
    const copy = { ...b, data: new Uint8ClampedArray(b.data) }
    pixelateRegion(b, { x: 0, y: 0, w: 4, h: 4 }, 1)
    expect(bytesEqual(b, copy)).toBe(true)
  })

  it('والخلايا تُحاذى إلى أصل المنطقة لا الصورة', () => {
    const b = buffer(8, 4)
    for (let x = 0; x < 8; x++) setPx(b, x, 0, [x * 30, 0, 0, 255])
    for (let x = 0; x < 8; x++) setPx(b, x, 1, [x * 30, 0, 0, 255])
    pixelateRegion(b, { x: 1, y: 0, w: 4, h: 2 }, 2)
    // الخليّة الأولى تبدأ عند x=1 لا x=0.
    expect(px(b, 1, 0)).toEqual(px(b, 2, 0))
    expect(px(b, 0, 0)).toEqual([0, 0, 0, 255])
  })

  it('والألفا مضروبة مسبقًا — بكسل شفّاف لا ينزف لونه', () => {
    const b = buffer(2, 1)
    setPx(b, 0, 0, [255, 0, 0, 255])
    setPx(b, 1, 0, [0, 0, 255, 0]) // أزرق شفّاف تمامًا
    pixelateRegion(b, { x: 0, y: 0, w: 2, h: 1 }, 2)
    // لو جُمعت الألوان خامًا لَخرج بنفسجي؛ والضرب المسبق يُبقيه أحمر.
    const out = px(b, 0, 0)
    expect(out[2]).toBe(0)
    expect(out[0]).toBe(255)
    expect(out[3]).toBe(128)
  })
})

describe('**مرورات الصندوق — SVG 1.1 §15.17**', () => {
  it('σ=18 ⇒ d=34 زوجي ⇒ ‎[34,−1]‎ و‎[34,+1]‎ و‎[35,0]‎', () => {
    const p = boxPassesForSigma(18)
    expect(p.map((x) => x.size)).toEqual([34, 34, 35])
    expect(p.map((x) => x.shift)).toEqual([-1, 1, 0])
  })

  it('**والإزاحتان مدى فهارس لا وسمًا** — المدى هو ما يُثبِت الفرع', () => {
    const [a, b, c] = boxPassesForSigma(18)
    expect([a.lo, a.hi]).toEqual([-17, 16])
    expect([b.lo, b.hi]).toEqual([-16, 17])
    expect([c.lo, c.hi]).toEqual([-17, 17])
    // متعاكستان: مجموع الإزاحات صفر، فالنواة المركّبة متناظرة.
    expect(a.lo + a.hi + (b.lo + b.hi) + (c.lo + c.hi)).toBe(0)
  })

  it('وd فردي ⇒ ثلاثة متطابقة بلا إزاحة (σ=8 ⇒ d=15)', () => {
    const p = boxPassesForSigma(8)
    expect(p.map((x) => x.size)).toEqual([15, 15, 15])
    expect(p.every((x) => x.shift === 0 && x.lo === -7 && x.hi === 7)).toBe(true)
  })

  it('**وأي σ دون 0.798 لا يفعل شيئًا** — حدٌّ يجب أن يعرفه شريط الشدّة', () => {
    for (const s of [0, 0.2, 0.5, 0.79]) {
      expect(boxPassesForSigma(s).every((p) => p.size === 1)).toBe(true)
    }
    expect(boxPassesForSigma(0.8).some((p) => p.size > 1)).toBe(true)
  })

  it('**ونصف قطر النواة أكبر من `ceil(2σ)`** — 50 لا 36 عند σ=18', () => {
    expect(blurRadius(18)).toBe(50)
    expect(Math.ceil(2 * 18)).toBe(36)
    expect(bleedMargin('blur', 18)).toBe(50)
    expect(bleedMargin('cover', 18)).toBe(0)
    expect(bleedMargin('pixelate', 18)).toBe(0)
  })
})

describe('**الضباب — أرقام مقيسة لا موصوفة**', () => {
  /** يبني صفًّا واحدًا معتمًا من قيم رمادية. */
  const row = (values: readonly number[]): PixelBuffer => {
    const b = buffer(values.length, 1)
    values.forEach((v, x) => setPx(b, x, 0, [v, v, v, 255]))
    return b
  }
  const readRow = (b: PixelBuffer): number[] =>
    Array.from({ length: b.width }, (_, x) => px(b, x, 0)[0]!)

  it('حقل ثابت يبقى ثابتًا — المتوسّط محفوظ', () => {
    const b = buffer(40, 40, 0)
    for (let i = 0; i < b.data.length; i += 4) {
      b.data[i] = 200
      b.data[i + 1] = 200
      b.data[i + 2] = 200
      b.data[i + 3] = 255
    }
    blurRegion(b, { x: 5, y: 5, w: 30, h: 30 }, 4)
    expect(px(b, 20, 20)).toEqual([200, 200, 200, 255])
    expect(px(b, 5, 5)).toEqual([200, 200, 200, 255])
  })

  it('**والنبضة تعطي ‎[0,0,21,64,85,64,21,0,0]‎ عند σ=1** — متناظرة', () => {
    const b = row([0, 0, 0, 0, 255, 0, 0, 0, 0])
    blurRegion(b, { x: 0, y: 0, w: 9, h: 1 }, 1)
    const out = readRow(b)
    // المرجع بدقّة كاملة: [0, 0, 21.25, 63.75, 85, 63.75, 21.25, 0, 0]
    expect(out).toEqual([0, 0, 21, 64, 85, 64, 21, 0, 0])
  })

  it('**والتناظر هو ما يُسقط الإزاحة الخاطئة**', () => {
    const b = row([0, 0, 0, 0, 255, 0, 0, 0, 0])
    blurRegion(b, { x: 0, y: 0, w: 9, h: 1 }, 1)
    const out = readRow(b)
    // إزاحتان في الجهة نفسها كانت تعطي [0,0,0,21,64,85,64,21,0] — القمّة
    // تنتقل بكسلًا كاملًا. والتناظر حول الأصل هو الفحص الذي يمسكها.
    expect(out[3]).toBe(out[5])
    expect(out[2]).toBe(out[6])
    const peak = out.indexOf(Math.max(...out))
    expect(peak).toBe(4)
  })

  it('ونبضة σ=2 تعطي القمّة عند موضعها ومجموعًا محفوظًا', () => {
    const b = row(Array.from({ length: 15 }, (_, i) => (i === 7 ? 255 : 0)))
    blurRegion(b, { x: 0, y: 0, w: 15, h: 1 }, 2)
    const out = readRow(b)
    // المرجع: [0,0,3.1875,9.5625,19.125,31.875,41.4375,44.625,41.4375,...]
    expect(out).toEqual([0, 0, 3, 10, 19, 32, 41, 45, 41, 32, 19, 10, 3, 0, 0])
    expect(out[6]).toBe(out[8])
  })

  it('**وσ دون العتبة لا يغيّر بايتًا واحدًا**', () => {
    const b = buffer(10, 10)
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 13) % 256
    const copy = { ...b, data: new Uint8ClampedArray(b.data) }
    blurRegion(b, { x: 0, y: 0, w: 10, h: 10 }, 0.5)
    expect(bytesEqual(b, copy)).toBe(true)
  })

  it('والكتابة لا تتجاوز المنطقة رغم أن القراءة تتجاوزها', () => {
    const b = buffer(30, 30, 0)
    for (let i = 3; i < b.data.length; i += 4) b.data[i] = 255
    // مربّع أبيض في الوسط
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) setPx(b, x, y, [255, 255, 255, 255])
    blurRegion(b, { x: 12, y: 12, w: 6, h: 6 }, 3)
    // خارج المنطقة: لم يُمَسّ
    expect(px(b, 11, 11)).toEqual([255, 255, 255, 255])
    expect(px(b, 5, 5)).toEqual([0, 0, 0, 255])
  })

  it('والحافّة ممدَّدة لا صفرية — طرف الصورة لا يُظلم', () => {
    const b = buffer(12, 12, 0)
    for (let i = 0; i < b.data.length; i += 4) {
      b.data[i] = 180
      b.data[i + 1] = 180
      b.data[i + 2] = 180
      b.data[i + 3] = 255
    }
    blurRegion(b, { x: 0, y: 0, w: 12, h: 12 }, 3)
    // لو كانت الحافّة صفرية لهبطت الزاوية كثيرًا عن 180.
    expect(px(b, 0, 0)[0]).toBe(180)
  })

  it('وبكسلٌ شفّاف لا ينزف لونه على جاره', () => {
    const b = buffer(9, 1)
    for (let x = 0; x < 9; x++) setPx(b, x, 0, [255, 0, 0, 255])
    setPx(b, 4, 0, [0, 0, 255, 0]) // أزرق شفّاف
    blurRegion(b, { x: 0, y: 0, w: 9, h: 1 }, 1)
    // الأزرق لا يظهر: وزنه صفر بعد الضرب المسبق.
    expect(px(b, 4, 0)[2]).toBe(0)
    expect(px(b, 4, 0)[0]).toBe(255)
  })

  it('وميزانية المخزن الوسيط تُعلَن قبل التخصيص', () => {
    // 472×192 عند σ=18: نصف القطر 50 ⇒ (572×292)×16 بايت.
    expect(blurWorkBytes({ x: 0, y: 0, w: 472, h: 192 }, 18)).toBe(572 * 292 * 16)
  })
})

// ═════════════════════════ مناطق خارج المخزن ═════════════════════════

/** لقطة من بايتات المخزن — لمقارنة «لم يُمَسّ» بعد عملية. */
const snapshot = (b: PixelBuffer): Uint8ClampedArray => new Uint8ClampedArray(b.data)

describe('**منطقةٌ خارج المخزن لا تمسّ بايتًا**', () => {
  /** مخزن بنمط معلوم كي يكشف أي كتابة شاردة. */
  const patterned = (): PixelBuffer => {
    const b = buffer(6, 6)
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 13 + 7) % 256
    return b
  }
  const outside = { x: 20, y: 20, w: 5, h: 5 }

  it('التغطية', () => {
    const b = patterned()
    const before = snapshot(b)
    coverRegion(b, outside, { r: 1, g: 2, b: 3, a: 255 })
    expect(b.data).toEqual(before)
  })

  it('البكسلة', () => {
    const b = patterned()
    const before = snapshot(b)
    pixelateRegion(b, outside, 4)
    expect(b.data).toEqual(before)
  })

  it('الضباب', () => {
    const b = patterned()
    const before = snapshot(b)
    blurRegion(b, outside, 3)
    expect(b.data).toEqual(before)
  })

  it('**وأدوات الإثبات تُعيد صفرًا لا تنهار** — لا تباين ولا ألوان في العدم', () => {
    const b = patterned()
    expect(regionVariance(b, outside)).toBe(0)
    expect(distinctColours(b, outside, 100)).toBe(0)
  })
})

// ═════════════════════════ شفافية كاملة ═════════════════════════

describe('المناطق الشفّافة تمامًا', () => {
  /** لون ظاهر في القنوات وألفا صفر — قيمةٌ عشوائية لا يجوز أن تنجو. */
  const invisibleRed = (w: number, h: number): PixelBuffer => {
    const b = buffer(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(b, x, y, [255, 0, 0, 0])
    return b
  }

  it('**البكسلة تُخرج شفّافًا نقيًّا** — لا لون شبحيًّا من ألفا صفر', () => {
    const b = invisibleRed(4, 4)
    pixelateRegion(b, { x: 0, y: 0, w: 4, h: 4 }, 2)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) expect(px(b, x, y)).toEqual([0, 0, 0, 0])
    }
  })

  it('**والضباب كذلك** — القسمة على ألفا صفر لا تُنتج `NaN` ولا لونًا', () => {
    const b = invisibleRed(9, 9)
    blurRegion(b, { x: 0, y: 0, w: 9, h: 9 }, 2)
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) expect(px(b, x, y)).toEqual([0, 0, 0, 0])
    }
  })
})

// ═════════════════════════ سقف الألوان والمطابقة ═════════════════════════

describe('عدّ الألوان بسقف', () => {
  it('**يتوقّف عند السقف ويُعيده** — لا يبني مجموعةً بحجم الصورة', () => {
    const b = buffer(4, 4)
    for (let i = 0; i < 16; i++) setPx(b, i % 4, Math.floor(i / 4), [i * 10, 0, 0, 255])
    // ستّة عشر لونًا متميّزًا؛ السقف أربعة.
    expect(distinctColours(b, { x: 0, y: 0, w: 4, h: 4 }, 4)).toBe(4)
    // وبسقفٍ أعلى يُعدّ الكلّ.
    expect(distinctColours(b, { x: 0, y: 0, w: 4, h: 4 }, 100)).toBe(16)
  })
})

describe('المطابقة البايتية التامّة', () => {
  it('مخزنان متطابقان ⇒ `true`، وبايتٌ واحد مختلف ⇒ `false`', () => {
    const a = buffer(3, 3, 9)
    const b = buffer(3, 3, 9)
    expect(bytesEqual(a, b)).toBe(true)
    b.data[35] = 10
    expect(bytesEqual(a, b)).toBe(false)
  })

  it('**اختلاف الأبعاد يكفي للرفض** ولو تساوى عدد البايتات', () => {
    // 2×3 و3×2 — كلاهما 24 بايتًا بمحتوًى متطابق.
    const tall = buffer(2, 3, 5)
    const wide = buffer(3, 2, 5)
    expect(tall.data.length).toBe(wide.data.length)
    expect(bytesEqual(tall, wide)).toBe(false)
    expect(bytesEqual(buffer(2, 3), buffer(2, 4))).toBe(false)
  })

  it('ومخزنٌ بأبعادٍ معلنة متطابقة وبايتاتٍ أقصر يُرفَض قبل المقارنة', () => {
    // مخزنٌ مبتور: أعلن 2×1 وحمل بايتات أقلّ — مقارنةُ الحلقة وحدها كانت ستقرأ خارجه.
    const whole = buffer(2, 1, 7)
    const truncated: PixelBuffer = { data: new Uint8ClampedArray(4).fill(7), width: 2, height: 1 }
    expect(bytesEqual(whole, truncated)).toBe(false)
    expect(bytesEqual(truncated, whole)).toBe(false)
  })
})
