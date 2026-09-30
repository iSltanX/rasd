import { describe, expect, it } from 'vitest'

import { pdfImageData, readPngImage } from '@/modules/export/png-image'

import { decodePredicted, makePng, rawPixels } from '../../../helpers/make-png'

/**
 * صورة PNG لمسار PDF — تُقرأ بلا فكّ، ثمّ تُجهَّز تيّارًا بثلاث قنوات.
 *
 * **حالتان مقيستان في كروم** (Chrome 154.0.8037.92): قماشٌ معتم بتسريع الرسوم يُرمِّز RGB فيدخل كما هو،
 * وبلا تسريع (`--disable-gpu`، أو جهازٌ يُرسم برمجيًّا) يُرمِّز RGBA ولو كان معتمًا كلّه. فالثانية تُحوَّل
 * صفًّا صفًّا — والاختبار يثبت أن التحويل **بلا فقد** على المرشِّحات الخمسة، ويرفض الشفافية بالاسم.
 */

const pixel = (x: number, y: number) => [x * 9, y * 13, (x + y) * 5] as const

describe('القراءة', () => {
  it('RGB بعمق 8 بلا تشبيك: الأبعاد، وتيّار `IDAT` متّصلًا من عدّة مقاطع', () => {
    const one = readPngImage(makePng(20, 10, pixel, { idatChunks: 1 }))
    const four = readPngImage(makePng(20, 10, pixel, { idatChunks: 4 }))
    expect(one.ok && four.ok).toBe(true)
    if (!one.ok || !four.ok) return
    expect(one.value).toMatchObject({ width: 20, height: 10, channels: 3 })
    // التيّار واحد مهما قُسم: الاتّصال صحيح.
    expect(Buffer.from(four.value.data).equals(Buffer.from(one.value.data))).toBe(true)
  })

  it('وRGBA تُقرأ بقنواتها الأربع — تُحوَّل لاحقًا لا تُرفض', () => {
    const r = readPngImage(makePng(4, 4, pixel, { colourType: 6 }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.channels).toBe(4)
  })

  it('يرفض بالاسم: عمقًا غير 8، والتشبيك، وما ليس PNG، والمقطوع قبل `IEND`', () => {
    expect(readPngImage(makePng(4, 4, pixel, { bitDepth: 16 })).ok).toBe(false)
    const interlaced = readPngImage(makePng(4, 4, pixel, { interlace: 1 }))
    expect(interlaced.ok).toBe(false)
    if (!interlaced.ok) expect(interlaced.error.detail).toContain('مشبَّكة')
    expect(readPngImage(new TextEncoder().encode('%PDF-1.7')).ok).toBe(false)
    const whole = makePng(8, 8, pixel)
    const cut = readPngImage(whole.subarray(0, whole.length - 12))
    expect(cut.ok).toBe(false)
    if (!cut.ok) expect(cut.error.detail).toContain('IEND')
    expect(readPngImage(whole.subarray(0, 40)).ok).toBe(false)
  })
})

describe('تيّار PDF', () => {
  it('RGB تدخل كما هي — بلا نسخة ولا إعادة ضغط', async () => {
    const read = readPngImage(makePng(20, 10, pixel))
    if (!read.ok) throw new Error(read.error.message)
    const data = await pdfImageData(read.value)
    expect(data.ok).toBe(true)
    if (data.ok) expect(data.value).toBe(read.value.data)
  })

  it('**RGBA معتمة تُحوَّل بلا فقد**: المرشِّحات الخمسة تُفكّ، والقناة الرابعة تُسقط، والبكسل كما هو', async () => {
    // سبعة عشر صفًّا: كل مرشِّح يقع ثلاث مرّات فأكثر، والأخير يقع بعد صفٍّ بمرشِّح آخر.
    const W = 33
    const H = 17
    const read = readPngImage(makePng(W, H, pixel, { colourType: 6, idatChunks: 5 }))
    if (!read.ok) throw new Error(read.error.message)
    const data = await pdfImageData(read.value)
    if (!data.ok) throw new Error(data.error.message)
    const decoded = decodePredicted(data.value, W, H, 3)
    expect(Buffer.from(decoded).equals(Buffer.from(rawPixels(W, H, pixel)))).toBe(true)
  })

  it('وصورةٌ أعرض من قطعة التيّار تعبر الحدود صحيحة', async () => {
    const W = 900
    const H = 40
    const wide = (x: number, y: number) => [(x * 7) % 256, (y * 31) % 256, (x ^ y) % 256] as const
    const read = readPngImage(makePng(W, H, wide, { colourType: 6 }))
    if (!read.ok) throw new Error(read.error.message)
    const data = await pdfImageData(read.value)
    if (!data.ok) throw new Error(data.error.message)
    expect(
      Buffer.from(decodePredicted(data.value, W, H, 3)).equals(Buffer.from(rawPixels(W, H, wide))),
    ).toBe(true)
  })

  it('**وبكسلٌ غير معتم يرفض الصورة كلّها** — لا تُسطَّح شفافيةٌ صامتةً على لونٍ مخترَع', async () => {
    const read = readPngImage(
      makePng(8, 8, (x, y) => (x === 5 && y === 6 ? [1, 2, 3, 128] : [1, 2, 3, 255]), {
        colourType: 6,
      }),
    )
    if (!read.ok) throw new Error(read.error.message)
    const data = await pdfImageData(read.value)
    expect(data.ok).toBe(false)
    if (!data.ok) expect(data.error.detail).toContain('شفافية')
  })
})
