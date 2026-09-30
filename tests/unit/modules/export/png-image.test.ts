import { describe, expect, it } from 'vitest'

import { readPngImage } from '@/modules/export/png-image'

import { makePng } from '../../../helpers/make-png'

/**
 * قارئ PNG لمسار PDF — يقبل ما يُخرجه القماش المعتم وحده، ويرفض ما سواه بالاسم.
 */

const pixel = (x: number, y: number) => [x * 9, y * 13, (x + y) * 5] as const

describe('ما يُقبل', () => {
  it('RGB بعمق 8 بلا تشبيك: الأبعاد، وتيّار `IDAT` متّصلًا من عدّة مقاطع', () => {
    const one = makePng(20, 10, pixel, { idatChunks: 1 })
    const four = makePng(20, 10, pixel, { idatChunks: 4 })
    const a = readPngImage(one)
    const b = readPngImage(four)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.value).toMatchObject({ width: 20, height: 10, colors: 3, bitsPerComponent: 8 })
    // التيّار واحد مهما قُسم: الاتّصال صحيح.
    expect(Buffer.from(b.value.data).equals(Buffer.from(a.value.data))).toBe(true)
  })
})

describe('ما يُرفض بالاسم', () => {
  it('قناة شفافية (نوع 6) — ما يُخرجه القماش الافتراضي', () => {
    const r = readPngImage(makePng(4, 4, pixel, { colourType: 6 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.detail).toContain('6')
  })

  it('عمق غير 8، والتشبيك', () => {
    expect(readPngImage(makePng(4, 4, pixel, { bitDepth: 16 })).ok).toBe(false)
    const interlaced = readPngImage(makePng(4, 4, pixel, { interlace: 1 }))
    expect(interlaced.ok).toBe(false)
    if (!interlaced.ok) expect(interlaced.error.detail).toContain('مشبَّكة')
  })

  it('ما ليس PNG، والمقطوع قبل `IEND`', () => {
    expect(readPngImage(new TextEncoder().encode('%PDF-1.7')).ok).toBe(false)
    const whole = makePng(8, 8, pixel)
    const cut = readPngImage(whole.subarray(0, whole.length - 12))
    expect(cut.ok).toBe(false)
    if (!cut.ok) expect(cut.error.detail).toContain('IEND')
    expect(readPngImage(whole.subarray(0, 40)).ok).toBe(false)
  })
})
