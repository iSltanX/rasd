/**
 * لفّ النصّ وقياسه — Canvas لا يلفّ، فاللفّ عملنا كلّه.
 *
 * **أربعة قيود مقيسة تحكم `wrapText`، وكلٌّ منها يمنع عطلًا بعينه:**
 *
 * **١. القطع منطقيّ لا مرئيّ.** إعادة ترتيب bidi تحويلُ **عرض**، وقطع
 * الأسطر عملية **منطقية**. عكسهما يُنتج أسطرًا صحيحة العرض مقلوبة المعنى.
 *
 * **٢. كل سطر مرشَّح يُقاس كاملًا، لا بجمع عروض كلماته.** مقيس: `A`+`V`
 * يعطيان 25.664 بينما `AV` يعطي 24.325 (تقنين)، و`مر`+`حبا` يعطيان 43.572
 * بينما `مرحبا` يعطي 42.929 (تشكيل). وفي المقابل كلمتان بمسافة بينهما
 * تساويان السطر الكامل بالضبط (110.535 = 110.535) — لأن العربية لا تتّصل
 * عبر المسافة.
 *
 * **٣. لا قطع داخل كلمة عربية أبدًا.** القطع يغيّر شكل الحرف (مبدئي · وسطي
 * · نهائي · منفصل)، فيختلف المرسوم عن المقيس **بنيويًّا لا كسريًّا**.
 *
 * **٤. المقاطع التقنية ذرّات.** `Intl.Segmenter` بـ`'word'` يكسر `#3B82F6`
 * إلى `#` و`3B82F6` — فالقطع بعده كان سيضع الهاش في سطر والقيمة في آخر.
 *
 * **وارتفاع السطر من `fontBoundingBox` لا `actualBoundingBox`.** مقيس:
 * الأوّل يعطي 23.00 عبر ثلاثة نصوص مختلفة، والثاني 18.27 و14.09 و14.68 —
 * أي يقفز بمحتوى السطر، فيتراقص ارتفاع الفقرة بين سطر فيه «ج» وسطر بلاها.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { deviceRect, type DeviceRect } from '@/shared/geometry'

import { isolateAtoms, resolveDirection, segmentAtoms, type Atom } from './text-bidi'

import type { FontSpec, NoteNode, TextNode } from './scene'

/** يقيس عرض سطر بخطّ معلوم — يُحقَن. */
export type MeasureText = (line: string, font: FontSpec) => number

/** يقرأ مقاييس الخطّ — يُحقَن كذلك، لأنها تختلف بكل حجم. */
export type MeasureFont = (font: FontSpec) => FontMetrics

export interface FontMetrics {
  readonly ascent: number
  readonly descent: number
  readonly lineHeight: number
}

export interface WrappedLine {
  /** النصّ كما يُرسَم — بعد تركيب محارف العزل. */
  readonly drawn: string
  /** النصّ المنطقي بلا عزل — للنسخ وللمقارنة. */
  readonly logical: string
  readonly width: number
}

export interface WrapResult {
  readonly lines: readonly WrappedLine[]
  readonly width: number
  readonly height: number
  readonly direction: 'rtl' | 'ltr'
  /**
   * ذرّة أعرض من السطر — تفيض ولا تُكسَر.
   *
   * **حدّ معلَن لا عطل**: قيمة سداسية أو رابط أطول من عرض الملاحظة يفيض،
   * لأن كسره يُنتج نصفًا لا معنى له ونصفًا مضلِّلًا. والواجهة تعرض العلم.
   */
  readonly overflow: boolean
}

/** مقاييس افتراضية حين لا يتوفّر قياس — للتقدير قبل جهوز الخطّ. */
export function estimateMetrics(font: FontSpec): FontMetrics {
  const ascent = font.sizePx * 0.9
  const descent = font.sizePx * 0.3
  return { ascent, descent, lineHeight: (ascent + descent) * 1.2 }
}

const EMPTY: WrapResult = {
  lines: [],
  width: 0,
  height: 0,
  direction: 'rtl',
  overflow: false,
}

/** يُسقط المسافات من طرفَي السطر قبل قياسه — بلا لمس داخله. */
function trimAtoms(atoms: readonly Atom[]): readonly Atom[] {
  let start = 0
  let end = atoms.length
  while (start < end && atoms[start]?.breakable) start++
  while (end > start && atoms[end - 1]?.breakable) end--
  return atoms.slice(start, end)
}

/**
 * يلفّ النصّ على عرض معلوم.
 *
 * الخوارزمية: ذرّات ← تجميع تصاعدي ← **قياس السطر المرشَّح كاملًا** عند كل
 * ذرّة ← القطع عند آخر فرصة قبل التجاوز. والفرصة الوحيدة مسافة.
 */
export function wrapText(
  text: string,
  maxWidthPx: number,
  font: FontSpec,
  measure: MeasureText,
  metrics: FontMetrics,
  declaredDir: 'rtl' | 'ltr' | 'auto' = 'auto',
): WrapResult {
  if (text.length === 0) return { ...EMPTY, direction: resolveDirection(text, declaredDir) }

  const direction = resolveDirection(text, declaredDir)
  const atoms = segmentAtoms(text)

  // بلا لفّ: سطر واحد مهما طال.
  if (maxWidthPx <= 0) {
    const drawn = isolateAtoms(atoms)
    const width = measure(drawn, font)
    return {
      lines: [{ drawn, logical: text, width }],
      width,
      height: metrics.lineHeight,
      direction,
      overflow: false,
    }
  }

  const lines: WrappedLine[] = []
  let current: Atom[] = []
  let overflow = false

  const flush = (): void => {
    const trimmed = trimAtoms(current)
    if (trimmed.length === 0) {
      current = []
      return
    }
    const drawn = isolateAtoms(trimmed)
    const logical = trimmed.map((a) => a.text).join('')
    lines.push({ drawn, logical, width: measure(drawn, font) })
    current = []
  }

  for (const atom of atoms) {
    const candidate = [...current, atom]
    // **السطر المرشَّح كاملًا** — لا مجموع أجزاء.
    const width = measure(isolateAtoms(trimAtoms(candidate)), font)

    if (width <= maxWidthPx || current.length === 0) {
      current = candidate
      // ذرّة واحدة أعرض من السطر: تفيض — ولا تُكسَر (القيدان 3 و4).
      if (width > maxWidthPx && current.length === 1) {
        overflow = true
        flush()
      }
      continue
    }

    // تجاوز: يُقطع قبل هذه الذرّة، وتبدأ بها سطرٌ جديد.
    flush()
    if (!atom.breakable) current = [atom]
  }
  flush()

  const width = lines.reduce((max, l) => Math.max(max, l.width), 0)
  return {
    lines,
    width,
    height: lines.length * metrics.lineHeight,
    direction,
    overflow,
  }
}

// ─────────────────────────────────────────────────────────────────
// الذاكرة
// ─────────────────────────────────────────────────────────────────

/**
 * ذاكرة تخطيط النصّ.
 *
 * **لماذا لازمة:** اختبار الإصابة يحتاج صندوق كل عقدة نصّ في **كل حركة
 * مؤشِّر**. ومشهدٌ فيه أربعون ملاحظة بثلاثة أسطر يعني مئة وعشرين نداء
 * `measureText` لكل حركة — وهو نداءٌ لا يمسكه أي اختبار وحدة، لأن بيئة
 * الاختبار بلا `measureText` أصلًا.
 *
 * **والمفتاح يشمل `FontSpec` كاملًا** بما فيه `letterSpacingPx`: مقيس أن
 * كروم يطبّق التباعد على اللاتيني ويتجاهله على العربي، فسطرٌ مختلط بقيمة
 * غير صفرية يُقاس بشيء ويُرسم بآخر. وإسقاط الحقل من المفتاح يعني إعادة
 * استعمال قياس أُجري بإعداد آخر.
 */
export interface TextLayoutCache {
  get(node: TextNode | NoteNode): WrapResult
  metrics(font: FontSpec): FontMetrics
  /**
   * يُفرغ الذاكرة.
   *
   * يُستدعى من `document.fonts.onloadingdone`: أوّل قياس قد يقع قبل أن
   * يجهز `Cairo`، فيُجرى بخطّ احتياطي بمقاييس أخرى — والنتيجة تخطيطٌ
   * صحيح الشكل خاطئ الأبعاد يُخلَّد حتى إعادة الفتح.
   */
  invalidate(): void
  readonly size: number
}

function fontKey(font: FontSpec): string {
  return `${font.family}|${font.sizePx}|${font.weight}|${font.letterSpacingPx}`
}

function nodeKey(node: TextNode | NoteNode): string {
  if (node.kind === 'text') {
    return `t|${fontKey(node.font)}|${node.maxWidthPx}|${node.dir}|${node.text}`
  }
  return `n|${fontKey(node.font)}|${node.widthPx}|${node.paddingPx}|${node.title} ${node.body}`
}

/** حدّ الذاكرة — مشهدٌ سقفه 2000 عقدة، والضِعف هامشٌ لتغيّر النصّ أثناء الكتابة. */
const MAX_ENTRIES = 4000

export function createTextLayoutCache(
  measure: MeasureText,
  measureFont: MeasureFont = estimateMetrics,
): TextLayoutCache {
  const layouts = new Map<string, WrapResult>()
  const fonts = new Map<string, FontMetrics>()

  const metricsOf = (font: FontSpec): FontMetrics => {
    const key = fontKey(font)
    const hit = fonts.get(key)
    if (hit) return hit
    const value = measureFont(font)
    fonts.set(key, value)
    return value
  }

  return {
    metrics: metricsOf,

    get(node) {
      const key = nodeKey(node)
      const hit = layouts.get(key)
      if (hit) return hit

      const fm = metricsOf(node.font)
      const value =
        node.kind === 'text'
          ? wrapText(node.text, node.maxWidthPx, node.font, measure, fm, node.dir)
          : wrapNote(node, measure, fm)

      // القصّ عند الإدراج لا عند القراءة — نموٌّ بلا حدّ ثم قراءةُ آخِرِه
      // تسريبُ ذاكرة بواجهة سليمة.
      if (layouts.size >= MAX_ENTRIES) {
        const oldest = layouts.keys().next().value
        if (oldest !== undefined) layouts.delete(oldest)
      }
      layouts.set(key, value)
      return value
    },

    invalidate() {
      layouts.clear()
      fonts.clear()
    },

    get size() {
      return layouts.size
    },
  }
}

/**
 * تخطيط بطاقة الملاحظة — عنوان ثم متن، بالعرض الداخلي.
 *
 * العنوان والمتن يُلفّان معًا في نتيجة واحدة كي يكون الارتفاع الكلّي رقمًا
 * واحدًا — وهو ما يحتاجه صندوق البطاقة واختبار الإصابة.
 */
export function wrapNote(node: NoteNode, measure: MeasureText, fm: FontMetrics): WrapResult {
  const inner = Math.max(0, node.widthPx - node.paddingPx * 2)
  const title = wrapText(node.title, inner, node.font, measure, fm, 'auto')
  const body = wrapText(node.body, inner, node.font, measure, fm, 'auto')

  return {
    lines: [...title.lines, ...body.lines],
    width: Math.max(title.width, body.width),
    height: title.height + body.height,
    direction: title.lines.length > 0 ? title.direction : body.direction,
    overflow: title.overflow || body.overflow,
  }
}

/**
 * صندوق بطاقة الملاحظة — **الارتفاع محسوب لا مخزَّن**.
 *
 * تخزينه في العقدة كان سيُخلّد في IndexedDB ارتفاعًا قِيس بخطّ احتياطي قبل
 * أن يجهز الخطّ الحقيقي، ويستلزم قياسًا داخل `scene-ops` المعلَنة خالصة.
 */
export function noteBox(node: NoteNode, cache: TextLayoutCache): DeviceRect {
  const layout = cache.get(node)
  const height = layout.height + node.paddingPx * 2
  return deviceRect(node.at.x, node.at.y, node.widthPx, Math.max(height, node.paddingPx * 2))
}

/** صندوق عقدة نصّ حرّ. */
export function textBox(node: TextNode, cache: TextLayoutCache): DeviceRect {
  const layout = cache.get(node)
  return deviceRect(
    node.at.x,
    node.at.y,
    node.maxWidthPx > 0 ? node.maxWidthPx : layout.width,
    layout.height,
  )
}
