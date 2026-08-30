/**
 * رسّامو النصّ والملاحظات والدبابيس.
 *
 * **ثلاث قواعد تحكم كل نداء `fillText` هنا:**
 *
 * **١. الاتجاه يُضبَط صراحةً في كل مرّة.** مقيس أن `ctx.direction` الافتراضي
 * في صفحة المحرر `rtl` — يرث `dir="rtl"` من المستند — فنصٌّ لاتيني خالص
 * يُرسم بلا ضبط تقفز علامات ترقيمه الطرفية.
 *
 * **٢. نداء واحد لكل سطر كامل.** نداءٌ لكل كلمة يُبطل التشكيل وإعادة
 * الترتيب معًا: العربية تتّصل حروفها، والقطع يغيّر شكل الحرف.
 *
 * **٣. `letterSpacing` صفر دائمًا.** عقد صفحة التصميم يمنع تباعد الحروف في
 * العربية، وكروم يتجاهله على المتّصل أصلًا (مقيس: `مرحبا` بقيت 42.93) —
 * لكنه **يطبّقه على اللاتيني** (`ABC` صارت 48.01 من 39.01)، فسطرٌ مختلط
 * بقيمة غير صفرية يُقاس بشيء ويُرسم بآخر.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { formatHuman } from '@/shared/bidi'

import { NOTE_TAG_LABEL } from '../scene'
import { isolateText } from '../text-bidi'

import type { DrawContext } from './shapes'
import type { Ctx2D } from '../renderer'
import type { FontSpec, NoteNode, PinNode, TextNode } from '../scene'
import type { TextLayoutCache } from '../text-layout'

/** يبني قيمة `font` من مواصفة الخطّ. */
export function fontString(font: FontSpec, family: string): string {
  return `${font.weight} ${font.sizePx}px ${family}`
}

/** يهيّئ السياق لرسم نصّ — الاتجاه والمحاذاة والتباعد صراحةً. */
function applyFont(
  ctx: Ctx2D,
  font: FontSpec,
  family: string,
  direction: 'rtl' | 'ltr',
  align: CanvasTextAlign,
): void {
  ctx.font = fontString(font, family)
  ctx.direction = direction
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  // القاعدة الثالثة — تُضبَط ولا تُترك لما خلّفه رسمٌ سابق.
  ctx.letterSpacing = '0px'
}

/** محاذاة السطر إلى `textAlign` بحسب اتجاه الفقرة. */
function alignFor(align: TextNode['align'], direction: 'rtl' | 'ltr'): CanvasTextAlign {
  if (align === 'center') return 'center'
  const startIsRight = direction === 'rtl'
  if (align === 'start') return startIsRight ? 'right' : 'left'
  return startIsRight ? 'left' : 'right'
}

/** الإحداثي الأفقي لبداية السطر بحسب المحاذاة. */
function anchorX(x: number, width: number, textAlign: CanvasTextAlign): number {
  if (textAlign === 'center') return x + width / 2
  if (textAlign === 'right') return x + width
  return x
}

export function drawText(d: DrawContext, node: TextNode, cache: TextLayoutCache): void {
  const { ctx } = d
  const layout = cache.get(node)
  if (layout.lines.length === 0) return

  const metrics = cache.metrics(node.font)
  const width = node.maxWidthPx > 0 ? node.maxWidthPx : layout.width
  const textAlign = alignFor(node.align, layout.direction)

  ctx.save()
  ctx.globalAlpha = node.stroke.opacity
  ctx.fillStyle = d.style.palette[node.stroke.colorToken]
  applyFont(ctx, node.font, d.style.textFamily, layout.direction, textAlign)

  const x = anchorX(node.at.x, width, textAlign)
  let y = node.at.y + metrics.ascent

  for (const line of layout.lines) {
    // القاعدة الثانية — سطر كامل بنداء واحد، بنصّه المعزول.
    ctx.fillText(line.drawn, x, y)
    y += metrics.lineHeight
  }
  ctx.restore()
}

/** حشوة داخلية للوسم أسفل بطاقة الملاحظة. */
const TAG_PADDING = 6
const TAG_HEIGHT = 18

export function drawNote(d: DrawContext, node: NoteNode, cache: TextLayoutCache): void {
  const { ctx } = d
  const layout = cache.get(node)
  const metrics = cache.metrics(node.font)
  const inner = Math.max(0, node.widthPx - node.paddingPx * 2)
  const bodyHeight = layout.height
  const tagHeight = node.tag ? TAG_HEIGHT + TAG_PADDING : 0
  const height = bodyHeight + node.paddingPx * 2 + tagHeight

  ctx.save()

  // خلفية البطاقة — سطح داكن نصف شفّاف كي يبقى ما تحتها مرئيًّا جزئيًّا.
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(14,20,22,0.92)' /* rasd-allow-literal: سطح بطاقة لا لون واجهة */
  ctx.beginPath()
  ctx.roundRect(node.at.x, node.at.y, node.widthPx, height, 10)
  ctx.fill()

  ctx.strokeStyle = d.style.palette[node.stroke.colorToken]
  ctx.lineWidth = node.stroke.widthPx
  ctx.setLineDash([])
  ctx.stroke()

  // النصّ
  const textAlign = alignFor('start', layout.direction)
  ctx.fillStyle = '#f4f7f9' /* rasd-allow-literal: نصّ على سطح البطاقة الداكن */
  applyFont(ctx, node.font, d.style.textFamily, layout.direction, textAlign)

  const x = anchorX(node.at.x + node.paddingPx, inner, textAlign)
  let y = node.at.y + node.paddingPx + metrics.ascent
  for (const line of layout.lines) {
    ctx.fillText(line.drawn, x, y)
    y += metrics.lineHeight
  }

  // الوسم
  if (node.tag) {
    const label = NOTE_TAG_LABEL[node.tag]
    ctx.font = fontString({ ...node.font, sizePx: node.font.sizePx * 0.8 }, d.style.textFamily)
    const tagWidth = ctx.measureText(label).width + TAG_PADDING * 2
    const tagX =
      layout.direction === 'rtl'
        ? node.at.x + node.widthPx - node.paddingPx - tagWidth
        : node.at.x + node.paddingPx
    const tagY = node.at.y + height - node.paddingPx - TAG_HEIGHT

    ctx.fillStyle = d.style.palette[node.stroke.colorToken]
    ctx.globalAlpha = 0.2
    ctx.beginPath()
    ctx.roundRect(tagX, tagY, tagWidth, TAG_HEIGHT, 5)
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.fillStyle = d.style.palette[node.stroke.colorToken]
    ctx.textAlign = 'center'
    ctx.fillText(label, tagX + tagWidth / 2, tagY + TAG_HEIGHT * 0.72)
  }

  ctx.restore()
}

/**
 * رقم الدبّوس — **بأرقام هندية**.
 *
 * `formatHuman` لا `formatMeasure`: هذا **عدٌّ بشري** («الملاحظة الثالثة») لا
 * قياسٌ ولا قيمة كود. والقاعدة منصوصة في معيار القبول اللغوي: الهندية
 * `٠١٢٣` للعدّ البشري، والغربية لكل قياس وقيمة تُنسخ إلى محرّر.
 *
 * ولا عزل عليه: رقمٌ وحده في دائرة، بلا نصّ حوله يُعاد ترتيبه.
 */
export function drawPinNumber(d: DrawContext, node: PinNode): void {
  const { ctx } = d
  const size = node.radiusPx * 1.1

  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#0e1416' /* rasd-allow-literal: رقم على قرص الدبّوس الملوّن */
  ctx.font = `700 ${size}px ${d.style.textFamily}`
  ctx.direction = 'rtl'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '0px'
  ctx.fillText(formatHuman(node.ordinal), node.at.x, node.at.y)
  ctx.restore()
}

/** يُصدَّر للاختبار: النصّ المرسوم لسطر — بعد العزل. */
export const drawnLine = isolateText
