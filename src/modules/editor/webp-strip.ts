/**
 * حذف مقطع `ICCP` من حاوية WebP — على مستوى البايتات لا القماش.
 *
 * قِيست الحاجة في الوحدة 19.1 (`Docs/Engineering.md §6` صفّ 103، وحاشية
 * [ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md) §5): مُرمِّج
 * WebP في كروم يكتب مقطع `ICCP` بـ456 بايتًا (ملفّ ألوان مضمَّن) في **كل**
 * مخرَج عند كل جودة، بينما PNG من المصدر نفسه يخرج بصفر مقطع. فادّعاء
 * «إعادة الترميز تنظّف مجّانًا» خاصيّةُ مُرمِّز PNG لا خاصيّةُ إعادة الترميز
 * عمومًا — والحذف هنا يعيد WebP إلى الوعد نفسه، بقرار المستخدم
 * (`privacy.stripMetadataOnExport`) لا قسرًا.
 *
 * **يعمل على الغلاف لا المحتوى**، تمامًا كـ`tests/helpers/png-chunks.ts`:
 * لا يفكّ `VP8`/`VP8L` ولا يعيد ترميزها، فقط يُزيل إطار المقطع من حاوية
 * RIFF ويُصحّح حقل الحجم المُعلَن.
 *
 * **ولا يرمي على مدخل غير WebP أو مشوَّه.** هذا تحويلٌ بعد نجاح الترميز —
 * إسقاطُ تصديرٍ ناجح لأن التنظيف الاختياري تعثّر أسوأ من تخطّي التنظيف؛
 * فغير القابل للتحليل يُعاد كما هو، والإخفاق **لا** يُبتلَع صامتًا في الحالة
 * الوحيدة التي تهمّ: WebP سليم بلا `ICCP` يبقى كما هو (`removed: false`)،
 * وهو نفسه الحكم الصحيح لملفٍّ لا يحتاج تنظيفًا.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

const RIFF_TAG = 'RIFF'
const WEBP_FORM = 'WEBP'
const ICCP_TAG = 'ICCP'
const VP8X_TAG = 'VP8X'
/** بت «I» (ICC profile) في بايت أعلام VP8X — أوّل بايت من بياناته العشرة. */
const VP8X_ICC_FLAG = 0x20

interface RiffChunk {
  /** إزاحة بداية الإطار — أوّل بايت من الـFourCC. */
  readonly offset: number
  readonly fourCC: string
  /** طول البيانات المُعلَن — بلا حشوة. */
  readonly size: number
  /** إزاحة أوّل بايت بيانات = `offset + 8`. */
  readonly dataStart: number
  /** طول الإطار كاملًا: 8 (FourCC + حجم) + البيانات المحشوّة إلى الزوجية. */
  readonly frameLength: number
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

/** هل هذه حاوية RIFF/WEBP صالحة الترويسة؟ لا تثبت أكثر من الترويسة الاثني عشرية. */
function isWebpContainer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === RIFF_TAG &&
    readAscii(bytes, 8, 4) === WEBP_FORM
  )
}

/**
 * يفكّ مقاطع RIFF إلى قائمة — بلا رمي على تشوّه، فقط يتوقّف عنده.
 *
 * حاوية RIFF بلا CRC (خلافًا لـPNG): كل مقطع `[FourCC:4][حجم LE:4][بيانات:حجم]`
 * محشوًّا ببايت صفر إلى طول زوجي.
 */
function parseChunks(bytes: Uint8Array): readonly RiffChunk[] {
  const chunks: RiffChunk[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const fourCC = readAscii(bytes, offset, 4)
    const size = readU32LE(bytes, offset + 4)
    const padded = size + (size % 2)
    const frameLength = 8 + padded
    if (offset + frameLength > bytes.length) break // مقطعٌ مبتور — تُوقَف القراءة لا تُرمى
    chunks.push({ offset, fourCC, size, dataStart: offset + 8, frameLength })
    offset += frameLength
  }
  return chunks
}

export interface StripWebpIccpResult {
  /** البايتات بعد الحذف، أو المدخل نفسه مرجعًا حين لا شيء يُحذف. */
  readonly bytes: Uint8Array<ArrayBuffer>
  /** هل حُذف مقطعٌ فعلًا؟ لا تعني «طُلب الحذف» — تعني «وُجد ما يُحذف وحُذف». */
  readonly removed: boolean
}

/**
 * يحذف أوّل مقطع `ICCP` من حاوية WebP، ويُصحّح حجم RIFF المُعلَن وعلم `VP8X`.
 *
 * مدخلٌ ليس WebP، أو حاويةٌ بلا `ICCP`، أو مشوَّهة: تُعاد كما هي بلا حذف —
 * دالّةٌ لا تفشل، لأنها تُنادى بعد ترميزٍ ناجح.
 *
 * **وعلم `VP8X` يُخفَض معه — قِيس لا افتُرض.** كروم يكتب `ICCP` دائمًا داخل
 * حاوية موسَّعة (`VP8X` أوّل مقطع، ببايت أعلامٍ بتّه الثالث «يحوي ملفّ
 * ألوان») — تحقَّق ببناء WebP حيّ حقيقي وفحصه بـ`webpinfo -diag`. حذف
 * إطار `ICCP` وحده دون خفض هذا العلم يترك حاويةً تَعِد بمقطعٍ لم يعد
 * موجودًا — عطلٌ حقيقي في تكامل الحاوية رصدته المراجعة العدائية قبل
 * الالتزام، لا حدسًا نظريًّا.
 */
export function stripWebpIccp(input: Uint8Array<ArrayBuffer>): StripWebpIccpResult {
  if (!isWebpContainer(input)) return { bytes: input, removed: false }

  const chunks = parseChunks(input)
  const iccp = chunks.find((c) => c.fourCC === ICCP_TAG)
  if (!iccp) return { bytes: input, removed: false }

  const out = new Uint8Array(input.length - iccp.frameLength)
  out.set(input.subarray(0, iccp.offset), 0)
  out.set(input.subarray(iccp.offset + iccp.frameLength), iccp.offset)

  // حقل حجم RIFF (البايتات 4..8): طول الملفّ بعد الحذف ناقص الترويسة الثمانية.
  const newRiffSize = out.length - 8
  out[4] = newRiffSize & 0xff
  out[5] = (newRiffSize >>> 8) & 0xff
  out[6] = (newRiffSize >>> 16) & 0xff
  out[7] = (newRiffSize >>> 24) & 0xff

  // VP8X — إن وُجد — أوّل مقطع دائمًا بحكم المعيار، فحذف ICCP لا يزيح
  // موضعه إن سبقه؛ ويُحسَب إزاحه الجديد لو سبق ICCP بترتيبٍ مخالف للمعيار
  // (دفاعًا لا افتراضًا لترتيب لم يقسه أحد).
  const vp8x = chunks.find((c) => c.fourCC === VP8X_TAG)
  if (vp8x) {
    const flagsAt = vp8x.offset < iccp.offset ? vp8x.dataStart : vp8x.dataStart - iccp.frameLength
    out[flagsAt] = (out[flagsAt] ?? 0) & ~VP8X_ICC_FLAG
  }

  return { bytes: out, removed: true }
}
