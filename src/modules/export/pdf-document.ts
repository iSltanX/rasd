/**
 * الصفحات النصّية في PDF — نموذجٌ وتخطيط، بلا قماش.
 *
 * **لماذا تُرسم النصوص صورًا لا خطوطًا مضمَّنة:** `pdf-lib` لا تشكّل الحروف العربية ولا تطبّق خوارزمية
 * الاتجاه، وتضمين خطٍّ عربي يعني حزمةً تُفكّ ضغطها (`woff2`) وتشكيلًا يُكتب يدويًّا. والمتصفّح يشكّل العربية
 * ويعزل اللاتيني داخلها صحيحًا على القماش منذ عقد. فالصفحة تُرسم على قماش بخطوط الواجهة نفسها، ثمّ تُخبز
 * صورةً من البوّابة الواحدة — والنصّ يُقرأ كما تقرؤه الواجهة. الثمن معلن في ADR 0040: النصّ لا يُحدَّد ولا
 * يُبحث فيه داخل قارئ PDF.
 *
 * **وهذا الملفّ يحمل ما يُختبر بلا متصفّح:** الأسطر وأين تُقطع، والصفحات وأين تنتهي. والقياس يُحقن
 * (`measure`)، فالاختبار يقيس بعرضٍ ثابت للمحرف والصفحة تقيس بـ`measureText`.
 *
 * **الفضاء فيزيائي والقراءة من اليمين:** إحداثيات العمليات بالنقاط من يسار الصفحة وأعلاها — كفضاء الصورة
 * وPDF نفسه — و«البداية» حافّة المحتوى اليمنى. والمحاذاة تُقال بـ`start`/`end` والقماش يترجمها بـ`direction`.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { PageBox } from './pdf-layout'

export type DocTone = 'danger' | 'warning' | 'success' | 'neutral'
export type DocInk = 'primary' | 'secondary' | 'tertiary'
export type DocFont =
  'title' | 'subtitle' | 'heading' | 'body' | 'strong' | 'label' | 'mono' | 'chip'

export interface DocFontSpec {
  /** بالنقاط. */
  readonly size: number
  readonly weight: 400 | 700
  readonly family: 'text' | 'mono'
  /** ارتفاع السطر بالنقاط — العربية تحتاج نحو 1.6 من حجمها لنقاطها وحركاتها. */
  readonly line: number
}

export const DOC_FONTS: Readonly<Record<DocFont, DocFontSpec>> = {
  title: { size: 18, weight: 700, family: 'text', line: 28 },
  subtitle: { size: 10, weight: 400, family: 'text', line: 16 },
  heading: { size: 12, weight: 700, family: 'text', line: 20 },
  body: { size: 10, weight: 400, family: 'text', line: 16 },
  strong: { size: 10, weight: 700, family: 'text', line: 16 },
  label: { size: 9, weight: 400, family: 'text', line: 15 },
  mono: { size: 9, weight: 400, family: 'mono', line: 15 },
  chip: { size: 8, weight: 700, family: 'text', line: 14 },
}

/** سطر «مفتاح: قيمة». و`mono` للقيم التقنية اللاتينية — رابط، مقاس، زمن — تُكتب يسارية الاتجاه. */
export interface DocRow {
  readonly label: string
  readonly value: string
  readonly mono: boolean
}

export interface DocChip {
  readonly text: string
  readonly tone: DocTone
}

/** بندٌ مرقَّم — ملاحظة، أو منطقة مختلفة، أو منطقة مستثناة. */
export interface DocItem {
  /** الرقم كما يُعرض — هندي للعدّ البشري، يُنسَّق قبل الوصول هنا. */
  readonly number: string
  readonly title: string
  readonly chip: DocChip | null
  readonly lines: readonly DocLine[]
}

export interface DocLine {
  readonly text: string
  readonly mono: boolean
}

export type DocBlock =
  | { readonly kind: 'title'; readonly text: string; readonly sub: string | null }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'rows'; readonly rows: readonly DocRow[] }
  | { readonly kind: 'items'; readonly items: readonly DocItem[] }
  | { readonly kind: 'text'; readonly text: string }

export type DocOp =
  | {
      readonly kind: 'text'
      readonly text: string
      readonly font: DocFont
      readonly ink: DocInk
      /** نقطة الإرساء: الحافّة اليمنى لـ`start`، واليسرى لـ`end`. */
      readonly x: number
      /** خطّ الأساس. */
      readonly y: number
      readonly align: 'start' | 'end'
      readonly dir: 'rtl' | 'ltr'
    }
  | { readonly kind: 'rule'; readonly y: number; readonly x0: number; readonly x1: number }
  | {
      readonly kind: 'badge'
      readonly text: string
      readonly cx: number
      readonly cy: number
      readonly r: number
    }
  | {
      readonly kind: 'chip'
      readonly text: string
      readonly tone: DocTone
      /** الحافّة اليسرى — الرقاقة في نهاية سطرها. */
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
    }

export interface DocPage {
  readonly ops: readonly DocOp[]
}

/** عرض نصٍّ بالنقاط بخطٍّ ما — `measureText` في الصفحة، وعرضٌ ثابت في الاختبار. */
export type MeasureDoc = (text: string, font: DocFont) => number

/** هامش الصفحة النصّية — أوسع من هامش الصورة: نصٌّ يلتصق بالحافّة يُقصّ عند الطباعة. */
export const DOC_MARGIN = 48
/** عرض عمود المفتاح في الصفوف. */
const LABEL_COLUMN = 120
const GAP = 12
const BADGE = 18
const CHIP_PAD = 6

/**
 * يلفّ نصًّا في عرضٍ أقصى — بالكلمات، ثمّ بالمحارف لكلمةٍ أطول من السطر.
 *
 * الكلمة الطويلة واقعٌ لا حالةٌ نظرية: رابطٌ أو محدِّد CSS بلا مسافة. وقصّها بالمحارف يُبقيها كلّها مقروءة
 * على أسطر، بدل أن تفيض خارج الصفحة فتُقصّ عند الطباعة. والأسطر الفارغة في المتن فواصل فقرات تُحفظ.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: DocFont,
  measure: MeasureDoc,
): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/u).filter((w) => w.length > 0)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate, font) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      if (measure(word, font) <= maxWidth) {
        line = word
        continue
      }
      // كلمةٌ أطول من السطر: تُقطع بالمحارف، وما يبقى منها يبدأ السطر التالي.
      let piece = ''
      for (const ch of word) {
        if (piece && measure(piece + ch, font) > maxWidth) {
          out.push(piece)
          piece = ch
        } else {
          piece += ch
        }
      }
      line = piece
    }
    out.push(line)
  }
  return out
}

interface Cursor {
  readonly pages: DocOp[][]
  y: number
}

/**
 * يخطّط الكتل على صفحات بحجم `box`.
 *
 * **لا يُسقط سطرًا ولا يقصّه:** كتلةٌ لا تسعها بقيّة الصفحة تبدأ صفحةً جديدة، وبندٌ أطول من صفحةٍ كاملة
 * يُقسم على أسطره (عنوانه مع أوّلها). والصفّ الواحد لا يُقسم — مفتاحه وقيمته معًا أو لا شيء.
 */
export function layoutDocument(
  blocks: readonly DocBlock[],
  box: PageBox,
  measure: MeasureDoc,
): DocPage[] {
  const right = box.width - DOC_MARGIN
  const left = DOC_MARGIN
  const width = right - left
  const top = DOC_MARGIN
  const bottom = box.height - DOC_MARGIN
  const cursor: Cursor = { pages: [[]], y: top }

  const page = (): DocOp[] => cursor.pages[cursor.pages.length - 1]!
  const fits = (height: number): boolean => cursor.y + height <= bottom
  const newPage = (): void => {
    cursor.pages.push([])
    cursor.y = top
  }
  /** يضمن مكانًا لارتفاعٍ ما — صفحةٌ جديدة إن لم يسعه ما بقي، إلا إن كانت الصفحة فارغة أصلًا. */
  const ensure = (height: number): void => {
    if (!fits(height) && page().length > 0) newPage()
  }
  const text = (
    value: string,
    font: DocFont,
    ink: DocInk,
    x: number,
    align: 'start' | 'end',
    dir: 'rtl' | 'ltr',
  ): void => {
    const spec = DOC_FONTS[font]
    // خطّ الأساس عند ثلاثة أرباع السطر تقريبًا — يتّسع فوقه للنقاط والحركات وتحته للذيول.
    page().push({
      kind: 'text',
      text: value,
      font,
      ink,
      x,
      y: cursor.y + spec.line * 0.72,
      align,
      dir,
    })
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'title': {
        const lines = wrapText(block.text, width, 'title', measure)
        const subLines = block.sub ? wrapText(block.sub, width, 'subtitle', measure) : []
        ensure(lines.length * DOC_FONTS.title.line + subLines.length * DOC_FONTS.subtitle.line + 16)
        for (const line of lines) {
          text(line, 'title', 'primary', right, 'start', 'rtl')
          cursor.y += DOC_FONTS.title.line
        }
        for (const line of subLines) {
          text(line, 'subtitle', 'secondary', right, 'start', 'rtl')
          cursor.y += DOC_FONTS.subtitle.line
        }
        cursor.y += 8
        page().push({ kind: 'rule', y: cursor.y, x0: left, x1: right })
        cursor.y += 8
        break
      }
      case 'heading': {
        // العنوان لا يُترك يتيمًا أسفل صفحة: يُطلب معه مكان سطرٍ بعده.
        ensure(14 + DOC_FONTS.heading.line + DOC_FONTS.body.line * 2)
        if (page().length > 0) cursor.y += 14
        text(block.text, 'heading', 'primary', right, 'start', 'rtl')
        cursor.y += DOC_FONTS.heading.line + 4
        break
      }
      case 'text': {
        for (const line of wrapText(block.text, width, 'body', measure)) {
          ensure(DOC_FONTS.body.line)
          text(line, 'body', 'secondary', right, 'start', 'rtl')
          cursor.y += DOC_FONTS.body.line
        }
        cursor.y += 4
        break
      }
      case 'rows': {
        const valueWidth = width - LABEL_COLUMN - GAP
        for (const row of block.rows) {
          const font: DocFont = row.mono ? 'mono' : 'body'
          const labels = wrapText(row.label, LABEL_COLUMN, 'label', measure)
          const values = wrapText(row.value, valueWidth, font, measure)
          const height =
            Math.max(labels.length * DOC_FONTS.label.line, values.length * DOC_FONTS[font].line) +
            10
          ensure(height)
          const start = cursor.y + 5
          cursor.y = start
          for (const label of labels) {
            text(label, 'label', 'secondary', right, 'start', 'rtl')
            cursor.y += DOC_FONTS.label.line
          }
          cursor.y = start
          for (const value of values) {
            text(value, font, 'primary', left, 'end', row.mono ? 'ltr' : 'rtl')
            cursor.y += DOC_FONTS[font].line
          }
          cursor.y = start + height - 5
          page().push({ kind: 'rule', y: cursor.y, x0: left, x1: right })
        }
        break
      }
      case 'items': {
        const indent = BADGE + GAP
        for (const item of block.items) {
          const chipWidth = item.chip ? measure(item.chip.text, 'chip') + CHIP_PAD * 2 : 0
          const titleWidth = width - indent - (item.chip ? chipWidth + GAP : 0)
          const titles = wrapText(item.title, titleWidth, 'strong', measure)
          const lines = item.lines.flatMap((line) =>
            wrapText(line.text, width - indent, line.mono ? 'mono' : 'label', measure).map(
              (text) => ({ text, mono: line.mono }),
            ),
          )
          const lineHeight = (mono: boolean) => DOC_FONTS[mono ? 'mono' : 'label'].line
          const height =
            titles.length * DOC_FONTS.strong.line +
            lines.reduce((n, l) => n + lineHeight(l.mono), 0) +
            12
          // بندٌ تسعه صفحةٌ كاملة لا يُقسم؛ والأطول يبدأ حيث هو ويتدفّق.
          if (height <= bottom - top) ensure(height)
          else ensure(titles.length * DOC_FONTS.strong.line + 12)

          cursor.y += 6
          const firstLine = cursor.y
          page().push({
            kind: 'badge',
            text: item.number,
            cx: right - BADGE / 2,
            cy: firstLine + DOC_FONTS.strong.line / 2,
            r: BADGE / 2,
          })
          if (item.chip) {
            page().push({
              kind: 'chip',
              text: item.chip.text,
              tone: item.chip.tone,
              x: left,
              y: firstLine + 1,
              w: chipWidth,
              h: DOC_FONTS.chip.line,
            })
          }
          for (const title of titles) {
            text(title, 'strong', 'primary', right - indent, 'start', 'rtl')
            cursor.y += DOC_FONTS.strong.line
          }
          for (const line of lines) {
            if (!fits(lineHeight(line.mono))) newPage()
            // سطرٌ تقني وحده (محدِّد، رابط) يُكتب يساريًّا لكن يُحاذى مع النصّ العربي في بدايته.
            text(
              line.text,
              line.mono ? 'mono' : 'label',
              'secondary',
              right - indent,
              'start',
              line.mono ? 'ltr' : 'rtl',
            )
            cursor.y += lineHeight(line.mono)
          }
          cursor.y += 6
          page().push({ kind: 'rule', y: cursor.y, x0: left, x1: right })
        }
        break
      }
    }
  }

  return cursor.pages.filter((ops, i) => ops.length > 0 || i === 0).map((ops) => ({ ops }))
}
