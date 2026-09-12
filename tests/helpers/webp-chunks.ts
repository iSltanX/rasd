/**
 * قارئ حاوية RIFF/WebP — أداة اختبار لا شيفرة إنتاج.
 *
 * نظير `png-chunks.ts` لصيغة ثانية: غايته إثباتُ أن `stripWebpIccp`
 * (`src/modules/editor/webp-strip.ts`) يحذف مقطع `ICCP` فعلًا ولا يفسد
 * الحاوية — لا فكّ `VP8`/`VP8L`، الغلاف وحده يهمّ هنا كما في نظيره.
 *
 * **ويرمي ولا يبتلع** — نفس مبدأ `png-chunks.ts` ونفس علّته: نتيجةٌ ناعمة
 * عن حاوية مشوَّهة تُمرِّر تأكيدًا سالبًا كاذبًا.
 */

export const WEBP_RIFF_TAG = 'RIFF'
export const WEBP_FORM_TAG = 'WEBP'

export interface WebpChunk {
  /** أربعة محارف ASCII. */
  readonly fourCC: string
  /** إزاحة بداية الإطار — أوّل بايت من الـFourCC. */
  readonly offset: number
  /** الحجم المُعلَن لحقل البيانات وحده، بلا حشوة. */
  readonly size: number
  /** إزاحة أوّل بايت بيانات = `offset + 8`. */
  readonly dataStart: number
  /** طول الإطار كاملًا: 8 + الحجم محشوًّا إلى الزوجية. */
  readonly frameLength: number
}

export interface WebpInfo {
  /** طول المخزن كاملًا. */
  readonly byteLength: number
  /** حقل حجم RIFF كما هو مكتوب — يجب أن يساوي `byteLength - 8` في ملفّ سليم. */
  readonly declaredRiffSize: number
  /** إزاحة نهاية آخر مقطع مقروء. */
  readonly endOffset: number
  readonly chunks: readonly WebpChunk[]
}

function readAscii(bytes: Uint8Array, at: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[at + i] ?? 0)
  return out
}

function readU32LE(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) |
      ((bytes[at + 1] ?? 0) << 8) |
      ((bytes[at + 2] ?? 0) << 16) |
      ((bytes[at + 3] ?? 0) << 24)) >>>
    0
  )
}

/**
 * يفكّ حاوية RIFF/WEBP إلى مقاطعها.
 *
 * الترويسة: `RIFF` (4) + حجم LE (4) + `WEBP` (4) = اثنا عشر بايتًا ثابتة،
 * ثمّ مقاطع متتالية بلا CRC (خلافًا لـPNG): `[FourCC:4][حجم LE:4][بيانات]`
 * محشوّةً ببايت صفر إلى طول زوجي.
 */
export function parseWebp(bytes: Uint8Array): WebpInfo {
  if (
    bytes.length < 12 ||
    readAscii(bytes, 0, 4) !== WEBP_RIFF_TAG ||
    readAscii(bytes, 8, 4) !== WEBP_FORM_TAG
  ) {
    throw new Error('توقيع RIFF/WEBP غير صحيح — ليست بايتات WebP.')
  }

  const chunks: WebpChunk[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const fourCC = readAscii(bytes, offset, 4)
    const size = readU32LE(bytes, offset + 4)
    const dataStart = offset + 8
    const padded = size + (size % 2)
    const frameLength = 8 + padded
    if (offset + frameLength > bytes.length) {
      throw new Error(`مقطع ${fourCC} يعلن طولًا ${String(size)} يتجاوز المخزن — ملفّ مبتور.`)
    }
    chunks.push({ fourCC, offset, size, dataStart, frameLength })
    offset += frameLength
  }

  return {
    byteLength: bytes.length,
    declaredRiffSize: readU32LE(bytes, 4),
    endOffset: offset,
    chunks,
  }
}

/** النظير غير المتزامن — يقبل ما يعيده `convertToBlob` أو `stripWebpIccp` مباشرةً. */
export async function parseWebpBlob(blob: Blob): Promise<WebpInfo> {
  return parseWebp(new Uint8Array(await blob.arrayBuffer()))
}

/** أسماء المقاطع بالترتيب. */
export function chunkTypes(info: WebpInfo): readonly string[] {
  return info.chunks.map((c) => c.fourCC)
}

/** هل تحوي الحاوية مقطعًا بهذا الاسم؟ */
export function hasChunk(info: WebpInfo, fourCC: string): boolean {
  return info.chunks.some((c) => c.fourCC === fourCC)
}

/** البايتات الباقية بعد آخر مقطع مقروء — يجب أن تكون صفرًا في ملفّ سليم. */
export function trailingBytes(info: WebpInfo): number {
  return info.byteLength - info.endOffset
}

/** هل حقل حجم RIFF المُعلَن يطابق طول المخزن الفعلي؟ */
export function riffSizeMatches(info: WebpInfo): boolean {
  return info.declaredRiffSize === info.byteLength - 8
}

/** بت «I» (ICC profile) في بايت أعلام VP8X — أوّل بايت من بياناته العشرة. */
const VP8X_ICC_FLAG = 0x20

/**
 * علم «يحوي ملفّ ألوان» في مقطع `VP8X`، أو `null` حين لا `VP8X` أصلًا.
 *
 * **مقروءٌ من البايتات الحيّة لا مُشتَقّ من وجود `ICCP`** — وهذا بالضبط ما
 * يثبت أن `stripWebpIccp` خفض العلم فعلًا لا فقط حذف المقطع.
 */
export function vp8xIccFlag(bytes: Uint8Array, info: WebpInfo): boolean | null {
  const vp8x = info.chunks.find((c) => c.fourCC === 'VP8X')
  if (!vp8x) return null
  return ((bytes[vp8x.dataStart] ?? 0) & VP8X_ICC_FLAG) !== 0
}
