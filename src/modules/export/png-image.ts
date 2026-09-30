/**
 * صورة PNG لملفّ PDF — تُقرأ بلا فكّ، وتدخل تيّارًا بثلاث قنوات.
 *
 * **لماذا لا `embedPng` من `pdf-lib`:** تفكّ الصورة كاملةً في الذاكرة ثمّ تفصل الشفافية وتضغط القناتين من جديد.
 * أي تجسيدٌ لكل بكسل دفعةً واحدة فوق ما تحمله الصفحة — وعلى الحالة القصوى 2560×28,672 نحو 280 ميغابايت خامًا
 * ثمّ نسختان. والبديل الذي رفضه [ADR 0021](../../../Docs/ADR/0021-second-format-one-gate.md) بالاسم هو هذا:
 * «تجسيد بكسلات خارج البوّابة، وذروةٌ مضاعفة».
 *
 * **والبديل حقيقة في المواصفتين:** بيانات `IDAT` المتّصلة تيّار `zlib` واحد، كل صفّ فيه يبدأ ببايت مرشِّح PNG —
 * وهو بالحرف ما يعنيه `FlateDecode` مع `Predictor 15` في PDF. فصورةٌ بثلاث قنوات تدخل الملفّ كما خرجت من
 * `bake()`.
 *
 * **وعدد القنوات لا يحسمه الطلب — يحسمه تسريع الرسوم.** مقيسٌ (Chrome 154.0.8037.92): قماشٌ `{ alpha: false }`
 * يُرمِّز PNG بنوع لون 2 (RGB) **حين يُرسم بالمعالج الرسومي**، ونوع 6 (RGBA) حين يُرسم برمجيًّا (`--disable-gpu`
 * كما تعمل الحرّاس، أو جهازٌ بلا تسريع) — ولو كان معتمًا كلّه. فـ`pdfImageData` تحوّل الثانية **صفًّا صفًّا**:
 * `DecompressionStream` يفكّ، وصفٌّ واحد يُزال مرشِّحه وتُسقط قناته الرابعة ويُعاد ترشيحه، و`CompressionStream`
 * يضغط. لا صورة كاملة في الذاكرة في أيّ لحظة، والتحويل بلا فقد — والشفافية الحقيقية تُرفض بالاسم: تسطيحها على
 * لونٍ يختاره هذا الملفّ تغييرٌ لما خرج من البوّابة.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — والتيّاران من منصّة الويب لا من المستند.
 */

import { errText, ok, type Result } from '@/shared/result'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

export interface PngImage {
  readonly width: number
  readonly height: number
  /** 3 لـRGB (نوع 2)، و4 لـRGBA (نوع 6). */
  readonly channels: 3 | 4
  /** تيّار `zlib` بصفوفٍ مرشَّحة — `IDAT` متّصلة كما هي. */
  readonly data: Uint8Array
}

const text = (bytes: Uint8Array, from: number): string =>
  String.fromCharCode(bytes[from]!, bytes[from + 1]!, bytes[from + 2]!, bytes[from + 3]!)

const u32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0

const UNSUPPORTED = 'تعذّر تجهيز الصورة لملفّ PDF.'

/**
 * يقرأ رأس PNG ويجمع `IDAT` — بلا فكّ ضغط.
 *
 * يرفض بالاسم: توقيعًا غير PNG، وملفًّا مقطوعًا، ونوع لون غير 2 و6، وعمقًا غير 8، والتشبيك — فالتشبيك
 * يرتّب الصفوف سبع تمريرات لا يعرفها مرشِّح PDF، وقبوله يُخرج صورةً مبعثرة لا خطأً.
 */
export function readPngImage(bytes: Uint8Array): Result<PngImage> {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    return errText('invalid-data', UNSUPPORTED, 'ليست بايتات PNG')
  }

  let offset = 8
  let header: { width: number; height: number; channels: 3 | 4 } | null = null
  const parts: Uint8Array[] = []
  let total = 0
  let ended = false

  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset)
    const type = text(bytes, offset + 4)
    const start = offset + 8
    const end = start + length
    if (end + 4 > bytes.length) return errText('invalid-data', UNSUPPORTED, `مقطع ${type} مقطوع`)

    if (type === 'IHDR') {
      if (length !== 13) return errText('invalid-data', UNSUPPORTED, 'IHDR بطول غير 13')
      const width = u32(bytes, start)
      const height = u32(bytes, start + 4)
      const depth = bytes[start + 8]!
      const colour = bytes[start + 9]!
      const interlace = bytes[start + 12]!
      if (width === 0 || height === 0) return errText('invalid-data', UNSUPPORTED, 'أبعاد صفرية')
      if (colour !== 2 && colour !== 6) {
        return errText(
          'invalid-data',
          UNSUPPORTED,
          `نوع اللون ${colour} — المقبول 2 (RGB) و6 (RGBA)`,
        )
      }
      if (depth !== 8) return errText('invalid-data', UNSUPPORTED, `عمق ${depth} — المقبول 8`)
      if (interlace !== 0) return errText('invalid-data', UNSUPPORTED, 'صورة مشبَّكة')
      header = { width, height, channels: colour === 2 ? 3 : 4 }
    } else if (type === 'IDAT') {
      if (!header) return errText('invalid-data', UNSUPPORTED, 'IDAT قبل IHDR')
      parts.push(bytes.subarray(start, end))
      total += length
    } else if (type === 'IEND') {
      ended = true
      break
    }
    offset = end + 4
  }

  if (!header) return errText('invalid-data', UNSUPPORTED, 'لا IHDR')
  if (total === 0) return errText('invalid-data', UNSUPPORTED, 'لا IDAT')
  if (!ended) return errText('invalid-data', UNSUPPORTED, 'لا IEND — ملفّ مقطوع')

  const data = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    data.set(part, at)
    at += part.length
  }

  return ok({ ...header, data })
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** يزيل مرشِّح صفٍّ في مكانه — `row` بعد البايت الأوّل، و`prev` الصفّ السابق مفكوكًا (أصفار للأوّل). */
function unfilter(type: number, row: Uint8Array, prev: Uint8Array, bpp: number): boolean {
  const n = row.length
  switch (type) {
    case 0:
      return true
    case 1:
      for (let i = bpp; i < n; i++) row[i] = (row[i]! + row[i - bpp]!) & 255
      return true
    case 2:
      for (let i = 0; i < n; i++) row[i] = (row[i]! + prev[i]!) & 255
      return true
    case 3:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp]! : 0
        row[i] = (row[i]! + ((a + prev[i]!) >> 1)) & 255
      }
      return true
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp]! : 0
        const c = i >= bpp ? prev[i - bpp]! : 0
        row[i] = (row[i]! + paeth(a, prev[i]!, c)) & 255
      }
      return true
    default:
      return false
  }
}

/** صفوفٌ تُجمع قبل كل كتابة إلى الضاغط — نداءٌ لكل صفّ على 28 ألف صفّ يُبطئ بلا فائدة. */
const BATCH_BYTES = 256 * 1024

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/**
 * يحوّل RGBA معتمةً إلى تيّار RGB بمرشِّح `Paeth` — صفًّا صفًّا، بلا فقد.
 *
 * يرفض: صفًّا بمرشِّح مجهول، وعدد صفوف غير الترويسة، وأيّ بكسلٍ قناته الرابعة دون 255.
 */
async function rgbFromRgba(image: PngImage): Promise<Result<Uint8Array>> {
  const { width, height } = image
  const stride = width * 4
  const rgbStride = width * 3
  const inflater = new DecompressionStream('deflate')
  const deflater = new CompressionStream('deflate')
  const compressed = collect(deflater.readable)
  // مسار الفشل يُجهض الضاغط فيُرفض هذا الوعد؛ ومعالجٌ من لحظة إنشائه يمنع رفضًا يتيمًا — كان يُسقط
  // `vitest` بخروجٍ غير صفري والاختبارات كلّها خضراء، ويُطلق `unhandledrejection` في الصفحة (المراجعة المستقلّة).
  compressed.catch(() => undefined)
  const out = deflater.writable.getWriter()
  const feed = inflater.writable.getWriter()
  void feed
    .write(image.data as Uint8Array<ArrayBuffer>)
    .then(() => feed.close())
    .catch(() => undefined)
  const reader = inflater.readable.getReader()

  let prev = new Uint8Array(stride)
  let row = new Uint8Array(stride)
  let prevRgb = new Uint8Array(rgbStride)
  let rgb = new Uint8Array(rgbStride)
  let type = -1
  let filled = 0
  let rows = 0
  let batch = new Uint8Array(BATCH_BYTES + rgbStride + 1)
  let used = 0

  const fail = async (detail: string): Promise<Result<Uint8Array>> => {
    await reader.cancel().catch(() => undefined)
    await out.abort().catch(() => undefined)
    await compressed.catch(() => undefined)
    return errText('invalid-data', UNSUPPORTED, detail)
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      let offset = 0
      while (offset < value.length) {
        if (type < 0) {
          type = value[offset++]!
          continue
        }
        const take = Math.min(stride - filled, value.length - offset)
        row.set(value.subarray(offset, offset + take), filled)
        filled += take
        offset += take
        if (filled < stride) continue

        if (rows >= height) return await fail('صفوف أكثر من الترويسة')
        if (!unfilter(type, row, prev, 4)) return await fail(`مرشِّح صفّ مجهول ${type}`)
        for (let x = 0; x < width; x++) {
          if (row[x * 4 + 3] !== 255)
            return await fail('صورة فيها شفافية — لا تُسطَّح على لونٍ مخترَع')
          rgb[x * 3] = row[x * 4]!
          rgb[x * 3 + 1] = row[x * 4 + 1]!
          rgb[x * 3 + 2] = row[x * 4 + 2]!
        }
        // ترشيح `Paeth` — الأنسب غالبًا لمساحات الواجهة المسطّحة وحوافّها.
        batch[used++] = 4
        for (let i = 0; i < rgbStride; i++) {
          const a = i >= 3 ? rgb[i - 3]! : 0
          const c = i >= 3 ? prevRgb[i - 3]! : 0
          batch[used++] = (rgb[i]! - paeth(a, prevRgb[i]!, c)) & 255
        }
        if (used >= BATCH_BYTES) {
          await out.write(batch.subarray(0, used))
          batch = new Uint8Array(BATCH_BYTES + rgbStride + 1)
          used = 0
        }
        ;[prev, row] = [row, prev]
        ;[prevRgb, rgb] = [rgb, prevRgb]
        filled = 0
        type = -1
        rows++
      }
    }
  } catch (thrown) {
    return fail(thrown instanceof Error ? thrown.message : String(thrown))
  }

  if (rows !== height || filled !== 0 || type >= 0) {
    return fail(`${rows} صفًّا والترويسة ${height}`)
  }
  if (used > 0) await out.write(batch.subarray(0, used))
  await out.close()
  return ok(await compressed)
}

/**
 * تيّار الصورة كما يدخل PDF: RGB كما هي، وRGBA محوَّلةً صفًّا صفًّا (انظر ترويسة الملفّ).
 */
export function pdfImageData(image: PngImage): Promise<Result<Uint8Array>> {
  return image.channels === 3 ? Promise.resolve(ok(image.data)) : rgbFromRgba(image)
}
