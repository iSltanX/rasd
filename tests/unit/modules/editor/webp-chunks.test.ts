import { describe, expect, it } from 'vitest'

import {
  chunkTypes,
  hasChunk,
  parseWebp,
  riffSizeMatches,
  trailingBytes,
  vp8xIccFlag,
  WEBP_FORM_TAG,
  WEBP_RIFF_TAG,
} from '../../../helpers/webp-chunks'

/**
 * قارئ حاوية RIFF/WebP — على بايتات مبنيّة يدويًّا لا موصوفة.
 *
 * لا تحتاج الحاوية بتدفّق `VP8`/`VP8L` فكّه — القارئ لا يفكّه، فمقطعٌ بأربعة
 * أحرف وبيانات تعسّفية يكفي لاختبار الغلاف. والحشوة الفردية (§7 أدناه) هي
 * الحالة التي أخطأ فيها تنفيذٌ أوّل: مقطع بحجم 7 يحتاج بايت حشوة واحدًا كي
 * يبقى المقطع التالي على إزاحة زوجية.
 */

const u32le = (n: number): number[] => [
  n & 0xff,
  (n >> 8) & 0xff,
  (n >> 16) & 0xff,
  (n >> 24) & 0xff,
]
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

function chunk(fourCC: string, data: readonly number[]): number[] {
  const padded = data.length % 2 === 1 ? [...data, 0] : [...data]
  return [...ascii(fourCC), ...u32le(data.length), ...padded]
}

function riff(chunks: readonly number[][]): Uint8Array {
  const body = chunks.flat()
  return Uint8Array.from([
    ...ascii(WEBP_RIFF_TAG),
    ...u32le(4 + body.length),
    ...ascii(WEBP_FORM_TAG),
    ...body,
  ])
}

const VP8L = chunk('VP8L', [0x2f, 1, 2, 3, 4, 5]) // بيانات تعسّفية — الغلاف وحده مقروء
const ICCP_EVEN = chunk('ICCP', new Array(8).fill(0xab))
const ICCP_ODD = chunk('ICCP', new Array(7).fill(0xcd)) // طول فردي — يفرض حشوة

/**
 * VP8X حقيقيّ الشكل — عشرة بايتات: أعلام ثمّ محجوز ثلاثة ثمّ عرض/طول ناقص
 * واحد (24 بتًّا لكلٍّ). `0x28` = بت ICC (`0x20`) + بت Alpha (`0x08`) معًا،
 * لإثبات أن خفض علم ICC لا يمسّ غيره من الأعلام.
 */
const VP8X_ICC_ALPHA = chunk('VP8X', [0x28, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('تحليل حاوية RIFF/WebP', () => {
  it('يقرأ الترويسة والمقاطع بترتيبها', () => {
    const info = parseWebp(riff([VP8L]))
    expect(chunkTypes(info)).toEqual(['VP8L'])
    expect(riffSizeMatches(info)).toBe(true)
    expect(trailingBytes(info)).toBe(0)
  })

  it('يجد ICCP حين يوجد، ولا يدّعيه حين لا يوجد', () => {
    expect(hasChunk(parseWebp(riff([VP8L])), 'ICCP')).toBe(false)
    expect(hasChunk(parseWebp(riff([VP8L, ICCP_EVEN])), 'ICCP')).toBe(true)
  })

  it('حشوةٌ ببايت صفر على طول فردي — والمقطع التالي يبقى على إزاحة صحيحة', () => {
    const info = parseWebp(riff([ICCP_ODD, VP8L]))
    expect(chunkTypes(info)).toEqual(['ICCP', 'VP8L'])
    const iccp = info.chunks[0]!
    expect(iccp.size).toBe(7)
    expect(iccp.frameLength).toBe(8 + 8) // 7 بايتًا + حشوة واحدة
  })

  it('يرمي على توقيع خاطئ', () => {
    expect(() => parseWebp(Uint8Array.from(ascii('نصّ عشوائي لا RIFF فيه')))).toThrow()
  })

  it('يرمي على مقطع مبتور', () => {
    const truncated = riff([VP8L]).slice(0, -2)
    expect(() => parseWebp(truncated)).toThrow()
  })
})

describe('علم ICC في VP8X', () => {
  it('يقرأ true حين البت مرفوع، ولا يمسّ الأعلام الأخرى في القراءة', () => {
    const bytes = riff([VP8X_ICC_ALPHA, ICCP_EVEN, VP8L])
    expect(vp8xIccFlag(bytes, parseWebp(bytes))).toBe(true)
  })

  it('يقرأ false حين البت غير مرفوع', () => {
    const bytes = riff([chunk('VP8X', [0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0]), VP8L])
    expect(vp8xIccFlag(bytes, parseWebp(bytes))).toBe(false)
  })

  it('يُعيد null حين لا VP8X في الحاوية أصلًا', () => {
    const bytes = riff([VP8L])
    expect(vp8xIccFlag(bytes, parseWebp(bytes))).toBeNull()
  })
})
