import { describe, expect, it } from 'vitest'

import { stripWebpIccp } from '@/modules/editor/webp-strip'

import {
  chunkTypes,
  hasChunk,
  parseWebp,
  riffSizeMatches,
  vp8xIccFlag,
} from '../../../helpers/webp-chunks'

/**
 * حذف `ICCP` — البند الموروث من الوحدة 19.1 بالقياس (`Rasd_Plan.md §6` صفّ 103).
 *
 * البايتات مبنيّة يدويًّا كحاوية RIFF/WEBP لا مأخوذة من مُرمِّج حقيقي —
 * `webp-chunks.ts` (أداة الإثبات هنا) لا يفكّ `VP8`/`VP8L`، فحاويةٌ صالحة
 * الغلاف بمحتوًى تعسّفي تكفي، تمامًا كما تكفي `png-chunks.test.ts` نظيرتها.
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

function riff(chunks: readonly number[][]): Uint8Array<ArrayBuffer> {
  const body = chunks.flat()
  return Uint8Array.from([...ascii('RIFF'), ...u32le(4 + body.length), ...ascii('WEBP'), ...body])
}

const VP8L = chunk('VP8L', [0x2f, 1, 2, 3, 4, 5])
const ICCP_EVEN = chunk('ICCP', new Array(8).fill(0xab))
const ICCP_ODD = chunk('ICCP', new Array(7).fill(0xcd))
/** أعلام ICC (`0x20`) + Alpha (`0x08`) معًا — لإثبات أن الحذف لا يمسّ غير علم ICC. */
const VP8X_ICC_ALPHA = chunk('VP8X', [0x28, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('stripWebpIccp', () => {
  it('يحذف ICCP ويصحّح حجم RIFF المُعلَن', () => {
    const withIccp = riff([VP8L, ICCP_EVEN])
    const result = stripWebpIccp(withIccp)

    expect(result.removed).toBe(true)
    const info = parseWebp(result.bytes)
    expect(chunkTypes(info)).toEqual(['VP8L'])
    expect(hasChunk(info, 'ICCP')).toBe(false)
    expect(riffSizeMatches(info)).toBe(true)
  })

  it('الناتج مطابق بايتًا لملفّ لم يحمل ICCP قطّ', () => {
    const clean = riff([VP8L])
    const withIccp = riff([VP8L, ICCP_EVEN])
    expect(stripWebpIccp(withIccp).bytes).toEqual(clean)
  })

  it('يحذف بايت الحشوة مع مقطعٍ فردي الطول — لا يُبقي بايتًا زائدًا', () => {
    const clean = riff([VP8L])
    const withOddIccp = riff([ICCP_ODD, VP8L])
    const result = stripWebpIccp(withOddIccp)
    expect(result.bytes.length).toBe(clean.length)
    expect(result.bytes).toEqual(clean)
  })

  it('لا يحذف شيئًا من حاوية بلا ICCP — ويُعلن ذلك', () => {
    const clean = riff([VP8L])
    const result = stripWebpIccp(clean)
    expect(result.removed).toBe(false)
    expect(result.bytes).toEqual(clean)
  })

  it('لا يرمي على مدخل ليس WebP — يُعاد كما هو', () => {
    const notWebp: Uint8Array<ArrayBuffer> = Uint8Array.from(ascii('ليست RIFF على الإطلاق'))
    const result = stripWebpIccp(notWebp)
    expect(result.removed).toBe(false)
    expect(result.bytes).toBe(notWebp)
  })

  it('لا يرمي على حاوية مبتورة — يُعاد المدخل كما هو', () => {
    const truncated = riff([VP8L, ICCP_EVEN]).slice(0, -4)
    expect(() => stripWebpIccp(truncated)).not.toThrow()
    expect(stripWebpIccp(truncated).removed).toBe(false)
  })

  /**
   * **البند الذي أفلت من الجولة الأولى**: حذف إطار ICCP وحده يترك حاوية
   * VP8X تَعِد بمقطعٍ لم يعد موجودًا — عطلٌ رصدته المراجعة العدائية بفحص
   * WebP حقيقي بـwebpinfo -diag، لا افتراضًا. كروم يكتب VP8X قبل ICCP
   * دائمًا (يفرضه المعيار)، فهذا هو الترتيب المقيس لا المصطنَع.
   */
  it('يخفض علم ICC في VP8X — لا يبقي الحاوية تَعِد بمقطعٍ حُذف', () => {
    const withVp8x = riff([VP8X_ICC_ALPHA, ICCP_EVEN, VP8L])
    const result = stripWebpIccp(withVp8x)

    expect(result.removed).toBe(true)
    const info = parseWebp(result.bytes)
    expect(hasChunk(info, 'ICCP')).toBe(false)
    expect(vp8xIccFlag(result.bytes, info)).toBe(false)
  })

  it('لا يمسّ الأعلام الأخرى في بايت VP8X — علم Alpha يبقى مرفوعًا', () => {
    const withVp8x = riff([VP8X_ICC_ALPHA, ICCP_EVEN, VP8L])
    const result = stripWebpIccp(withVp8x)
    const info = parseWebp(result.bytes)
    const vp8x = info.chunks.find((c) => c.fourCC === 'VP8X')!
    const ALPHA_FLAG = 0x08
    expect((result.bytes[vp8x.dataStart]! & ALPHA_FLAG) !== 0).toBe(true)
  })

  it('حاوية بلا VP8X تُحذف ICCP منها بلا خطأ — لا مقطع أعلام يُخفَض', () => {
    const withoutVp8x = riff([ICCP_EVEN, VP8L])
    expect(() => stripWebpIccp(withoutVp8x)).not.toThrow()
    const info = parseWebp(stripWebpIccp(withoutVp8x).bytes)
    expect(hasChunk(info, 'ICCP')).toBe(false)
    expect(hasChunk(info, 'VP8X')).toBe(false)
  })
})
