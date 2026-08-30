/**
 * رسّام القياس — خطٌّ بطرفين ورقمٌ يقرؤه إنسان.
 *
 * **الرقم بوحدات CSS للّقطة لا ببكسلات صورتها.** الحساب في
 * `measure-overlay.ts`، وهنا الرسم وحده.
 *
 * **والسمك مقسومٌ على التكبير** كي يبقى شعرةً على الشاشة عند كل تكبير:
 * خطُّ قياسٍ سمكه بكسلا صورة يصير ثمانية على الشاشة عند 4×، فيغطّي الفجوة
 * التي يقيسها.
 */

import { gapSegment, readMeasure } from '../measure-overlay'

import type { DrawContext } from './shapes'
import type { MeasureNode } from '../scene'

/** طول العارضة عند طرفَي الخطّ، ببكسل شاشة. */
const CAP_CSS = 5

/** حشوة لوحة الرقم، ببكسل شاشة. */
const LABEL_PAD_CSS = 4

export function drawMeasure(d: DrawContext, node: MeasureNode): void {
  const { ctx } = d
  const reading = readMeasure(node, d.dpr)
  const thin = 1 / d.camera.zoom
  const cap = CAP_CSS / d.camera.zoom
  const pad = LABEL_PAD_CSS / d.camera.zoom

  ctx.save()
  ctx.globalAlpha = node.stroke.opacity
  ctx.filter = 'none'
  ctx.strokeStyle = d.style.palette[node.stroke.colorToken]
  ctx.fillStyle = d.style.palette[node.stroke.colorToken]
  ctx.lineWidth = node.stroke.widthPx * thin
  ctx.setLineDash([])

  let labelX: number
  let labelY: number

  if (node.b !== null && node.show === 'gap' && !reading.overlapping && reading.direction) {
    const seg = gapSegment(node.a, node.b, reading.direction)
    ctx.beginPath()
    ctx.moveTo(seg.x1, seg.y1)
    ctx.lineTo(seg.x2, seg.y2)
    ctx.stroke()

    // عارضتان عند الطرفين — بلا هما يُقرأ الخطّ سهمًا لا قياسًا.
    const horizontal = seg.y1 === seg.y2
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(seg.x1, seg.y1 - cap)
      ctx.lineTo(seg.x1, seg.y1 + cap)
      ctx.moveTo(seg.x2, seg.y2 - cap)
      ctx.lineTo(seg.x2, seg.y2 + cap)
    } else {
      ctx.moveTo(seg.x1 - cap, seg.y1)
      ctx.lineTo(seg.x1 + cap, seg.y1)
      ctx.moveTo(seg.x2 - cap, seg.y2)
      ctx.lineTo(seg.x2 + cap, seg.y2)
    }
    ctx.stroke()

    labelX = (seg.x1 + seg.x2) / 2
    labelY = (seg.y1 + seg.y2) / 2
  } else {
    // قياس مقاس: إطارٌ متقطّع حول المستطيل، والرقم في وسطه.
    ctx.setLineDash([4 * thin, 3 * thin])
    ctx.beginPath()
    ctx.rect(node.a.x, node.a.y, node.a.width, node.a.height)
    ctx.stroke()
    ctx.setLineDash([])
    labelX = node.a.x + node.a.width / 2
    labelY = node.a.y + node.a.height / 2
  }

  // ── الرقم ─────────────────────────────────────────────────────
  const size = Math.max(10, 11 / d.camera.zoom)
  ctx.font = `600 ${size}px ${d.style.monoFamily}`
  /*
   * **الاتجاه `ltr` صراحةً.** الرقم وواحدته مقطعٌ تقني لاتيني، والسياق يرث
   * `rtl` من مستند المحرر — فبلا ضبط تقفز `px` إلى الطرف الخطأ من العدد.
   */
  ctx.direction = 'ltr'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '0px'

  const width = ctx.measureText(reading.label).width
  const boxW = width + pad * 2
  const boxH = size + pad * 2

  ctx.fillStyle = '#0e1416' /* rasd-allow-literal: لوحة الرقم لا لون واجهة */
  ctx.globalAlpha = 0.88
  ctx.beginPath()
  ctx.roundRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH, 3 * thin)
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.fillStyle = d.style.palette[node.stroke.colorToken]
  ctx.fillText(reading.label, labelX, labelY)
  ctx.restore()
}
