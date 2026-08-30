/**
 * قارئ مقاطع PNG — أداة اختبار لا شيفرة إنتاج.
 *
 * غايته تأكيدان لا ثالث لهما في المرحلة 15:
 *
 *   1. **المجرى ينتهي عند `IEND`** وأربع بايتات CRC، و`blob.size` تساوي تلك
 *      الإزاحة بالضبط. انحدارٌ مباشر لـaCropalypse (CVE-2023-21036 و
 *      CVE-2023-28303): هناك بقيت بايتات الملفّ الأصلي **بعد** نهاية المجرى
 *      المنطقي فأمكن استرجاع الجزء «المقصوص». والقاعدة الوحيدة التي تمنع
 *      عودتها: لا بايت واحد بعد `IEND`.
 *   2. **لا مقاطع بيانات وصفية** — `tEXt` · `iTXt` · `zTXt` · `eXIf` — تنجو من
 *      إعادة الترميز.
 *
 * والقارئ يقرأ الإطار وحده: لا يفكّ `zlib` ولا يعيد بناء البكسلات. ما يهمّ
 * هنا الغلاف لا المحتوى.
 *
 * **ويرمي ولا يبتلع.** ملفٌّ لا يُحلَّل ليس ملفًّا نظيفًا، ونتيجةٌ ناعمة عن
 * توقيع خاطئ تجعل تأكيدًا سالبًا يمرّ على معطوب.
 */

/** توقيع PNG: ‎\x89PNG\r\n\x1a\n‎ — ثماني بايتات ثابتة في كل ملفّ. */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** المقاطع التي يجب ألّا تنجو من إعادة الترميز. */
export const METADATA_CHUNK_TYPES = ['tEXt', 'iTXt', 'zTXt', 'eXIf'] as const
export type MetadataChunkType = (typeof METADATA_CHUNK_TYPES)[number]

export interface PngChunk {
  /** أربعة محارف ASCII. */
  readonly type: string
  /** إزاحة حقل الطول — بداية المقطع. */
  readonly offset: number
  /** الطول المُعلَن لحقل البيانات وحده. */
  readonly length: number
  /** طول الإطار كاملًا = 4 طول + 4 نوع + `length` + 4 CRC. */
  readonly frameLength: number
  /** إزاحة أوّل بايت بيانات = `offset + 8`. */
  readonly dataStart: number
  /** الـCRC المخزَّن. */
  readonly crc: number
  /** هل يطابق الـCRC المحسوب على (النوع + البيانات)؟ */
  readonly crcOk: boolean
  /**
   * مقطع ثانوي: أوّل حرف صغير (البت 5 من بايت النوع الأوّل مضبوط).
   * `IHDR`/`PLTE`/`IDAT`/`IEND` أساسية؛ `tEXt`/`iCCP`/`sRGB`/`pHYs` ثانوية.
   */
  readonly ancillary: boolean
}

export interface PngInfo {
  /** طول المخزن كاملًا. */
  readonly byteLength: number
  /** إزاحة ما بعد `IEND` وCRCه — نهاية المجرى المنطقي. */
  readonly endOffset: number
  readonly chunks: readonly PngChunk[]
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  /** 0 رمادي · 2 RGB · 3 مفهرس · 4 رمادي+ألفا · **6 RGBA** — ما يُخرجه كروم دائمًا. */
  readonly colourType: number
  /** 0 غير متشابك. */
  readonly interlace: number
}

// ── CRC-32 كما تعرّفه مواصفة PNG (متعدّد الحدود 0xEDB88320) ────────
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 على مجال بايتات ‎[from, to)‎. */
export function crc32(bytes: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff
  for (let i = from; i < to; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function readU32(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] ?? 0) << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0)) >>>
    0
  )
}

function readType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  )
}

/**
 * يفكّ إطار PNG إلى قائمة مقاطع بإزاحاتها وأطوالها.
 *
 * الإطار: ‎[0,8)‎ التوقيع، ثم مقاطع متتالية كلٌّ منها
 * ‎[طول: 4]‎ ‎[نوع: 4]‎ ‎[بيانات: طول]‎ ‎[CRC: 4]‎ — والـCRC محسوب على
 * (النوع + البيانات) لا على الطول. `IHDR` أوّلها دائمًا عند الإزاحة 8
 * (بياناته عند 16)، و`IEND` آخرها بطول بيانات صفر.
 */
export function parsePng(bytes: Uint8Array): PngInfo {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((expected, i) => bytes[i] === expected)) {
    throw new Error('توقيع PNG غير صحيح — ليست بايتات PNG.')
  }

  const chunks: PngChunk[] = []
  let offset = 8
  let sawIend = false

  while (!sawIend && offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset)
    const type = readType(bytes, offset + 4)
    const dataStart = offset + 8
    const crcOffset = dataStart + length
    if (crcOffset + 4 > bytes.length) {
      throw new Error(`مقطع ${type} يعلن طولًا ${String(length)} يتجاوز المخزن — ملفّ مبتور.`)
    }
    const crc = readU32(bytes, crcOffset)
    chunks.push({
      type,
      offset,
      length,
      frameLength: length + 12,
      dataStart,
      crc,
      crcOk: crc === crc32(bytes, offset + 4, crcOffset),
      ancillary: ((bytes[offset + 4] ?? 0) & 0x20) !== 0,
    })
    offset = crcOffset + 4
    if (type === 'IEND') sawIend = true
  }

  if (!sawIend) {
    throw new Error(
      `لا مقطع IEND — المجرى ينتهي عند ${String(offset)} من ${String(bytes.length)} بلا خاتمة.`,
    )
  }

  const ihdr = chunks[0]
  if (!ihdr || ihdr.type !== 'IHDR' || ihdr.length !== 13) {
    throw new Error('أوّل مقطع ليس IHDR بطول 13 — ترويسة غير صالحة.')
  }

  return {
    byteLength: bytes.length,
    endOffset: offset,
    chunks,
    width: readU32(bytes, ihdr.dataStart),
    height: readU32(bytes, ihdr.dataStart + 4),
    bitDepth: bytes[ihdr.dataStart + 8] ?? 0,
    colourType: bytes[ihdr.dataStart + 9] ?? 0,
    interlace: bytes[ihdr.dataStart + 12] ?? 0,
  }
}

/** النظير غير المتزامن — يقبل ما يعيده `convertToBlob` مباشرةً. */
export async function parsePngBlob(blob: Blob): Promise<PngInfo> {
  return parsePng(new Uint8Array(await blob.arrayBuffer()))
}

/** البايتات الباقية بعد `IEND`. **يجب أن تكون صفرًا.** */
export function trailingBytes(info: PngInfo): number {
  return info.byteLength - info.endOffset
}

/**
 * **التأكيد الأوّل: لا بايت بعد `IEND`.**
 *
 * `size` اختياري ويُمرَّر في الفحص الحيّ: الادّعاء هناك ليس «المخزن ينتهي عند
 * `IEND`» (تحصيل حاصل بعد `arrayBuffer()`) بل «حجم الـ`Blob` الذي سيُكتَب أو
 * يُنسَخ يساوي نهاية المجرى». والفرق بينهما هو بالضبط شكل aCropalypse.
 */
export function endsAtIend(info: PngInfo, size?: number): boolean {
  const last = info.chunks[info.chunks.length - 1]
  if (!last || last.type !== 'IEND' || last.length !== 0) return false
  if (info.endOffset !== info.byteLength) return false
  return size === undefined || size === info.endOffset
}

/** أسماء المقاطع الوصفية الناجية — يجب أن تكون فارغة بعد إعادة الترميز. */
export function metadataChunks(info: PngInfo): readonly string[] {
  const wanted: readonly string[] = METADATA_CHUNK_TYPES
  return info.chunks.filter((c) => wanted.includes(c.type)).map((c) => c.type)
}

/**
 * كل المقاطع الثانوية — أوسع من `metadataChunks` عمدًا.
 *
 * كروم 151 لا يُخرج ولا مقطعًا ثانويًّا واحدًا على `srgb`، لكنه يُخرج `iCCP`
 * (295 بايت، مقيس) إن أُنشئ السياق بـ`colorSpace: 'display-p3'`. فتأكيدٌ على
 * «لا مقاطع ثانوية إطلاقًا» يمسك انزلاق فضاء اللون قبل أن يُصدَّر ملفّ يحمل
 * ملفًّا لونيًّا لم يطلبه أحد.
 */
export function ancillaryChunks(info: PngInfo): readonly string[] {
  return info.chunks.filter((c) => c.ancillary).map((c) => c.type)
}

/** أسماء المقاطع بالترتيب. */
export function chunkTypes(info: PngInfo): readonly string[] {
  return info.chunks.map((c) => c.type)
}

/** هل كل الـCRCات صحيحة؟ يمسك تعديلًا على البايتات نسي تحديث الـCRC. */
export function allCrcsValid(info: PngInfo): boolean {
  return info.chunks.every((c) => c.crcOk)
}
