/**
 * صورة PNG **كما هي** — ما يلزم PDF منها بلا فكّ بكسل واحد.
 *
 * **لماذا لا `embedPng` من `pdf-lib`:** تفكّ الصورة كاملةً في JavaScript ثمّ تفصل قناة الشفافية وتضغط
 * القناتين من جديد. أي أنها **موضع ترميزٍ ثانٍ خارج البوّابة**، وتجسيدٌ لكل بكسل في الذاكرة — والبديلان
 * رفضهما [ADR 0021](../../../Docs/ADR/0021-second-format-one-gate.md) بالاسم («مسار تحويل بعد PNG»). وعلى
 * الحالة القصوى 2560×28,672 كان ذلك نحو 280 ميغابايت خامًا فوق ما تحمله الصفحة أصلًا.
 *
 * **والبديل حقيقة في المواصفتين لا حيلة:** بيانات `IDAT` المتّصلة تيّار `zlib` واحد، كل صفّ فيه يبدأ ببايت
 * مرشِّح PNG — وهو بالحرف ما يعنيه `FlateDecode` مع `Predictor 15` في PDF. فالبايتات الخارجة من
 * `bake()` تدخل الملفّ كما خرجت، والبوّابة تبقى الموضع الوحيد الذي يرمِّز.
 *
 * **والشرط مقيس لا مفترض** (Chrome 152.0.7977.130): قماشٌ بسياق `{ alpha: false }` يُرمَّز PNG بنوع
 * لون 2 (RGB) بعمق 8 بلا تشبيك، وقماشٌ بالسياق الافتراضي يُرمَّز بنوع 6 (RGBA) **ولو كان معتمًا كلّه**.
 * فمسار PDF يخبز على سطح معتم، وهذا الملفّ يرفض ما سواه صراحةً: شفافيةٌ في PDF تحتاج قناعًا منفصلًا لا
 * يُستخرج إلا بفكّ البكسلات — فالرفض بالاسم أصدق من سقوطٍ صامت إلى الفكّ.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { errText, ok, type Result } from '@/shared/result'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/** صورة جاهزة لـ`XObject` في PDF — تيّار `IDAT` المتّصل وما يصفه. */
export interface PngImage {
  readonly width: number
  readonly height: number
  /** قنوات اللون في الصفّ — 3 لـRGB، والوحيدة المقبولة. */
  readonly colors: 3
  readonly bitsPerComponent: 8
  /** تيّار `zlib` بصفوفٍ مرشَّحة — يدخل PDF كما هو. */
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
 * يرفض بالاسم: توقيعًا غير PNG، وملفًّا مقطوعًا، ونوع لون غير RGB، وعمقًا غير 8، والتشبيك — فالتشبيك
 * يرتّب الصفوف سبع تمريرات لا يعرفها مرشِّح PDF، وقبوله يُخرج صورةً مبعثرة لا خطأً.
 */
export function readPngImage(bytes: Uint8Array): Result<PngImage> {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    return errText('invalid-data', UNSUPPORTED, 'ليست بايتات PNG')
  }

  let offset = 8
  let header: { width: number; height: number } | null = null
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
      if (colour !== 2) {
        return errText('invalid-data', UNSUPPORTED, `نوع اللون ${colour} — المقبول 2 (RGB) وحده`)
      }
      if (depth !== 8) return errText('invalid-data', UNSUPPORTED, `عمق ${depth} — المقبول 8`)
      if (interlace !== 0) return errText('invalid-data', UNSUPPORTED, 'صورة مشبَّكة')
      header = { width, height }
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

  return ok({ width: header.width, height: header.height, colors: 3, bitsPerComponent: 8, data })
}
