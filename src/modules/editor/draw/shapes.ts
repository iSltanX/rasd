/**
 * رسّامو الأشكال — كلٌّ يأخذ سياقه معاملًا ولا يملك حالة.
 *
 * **الترتيب في `drawNode` هو ترتيب الخبز نفسه.** هذا ليس تشابهًا عرَضيًّا:
 * `bake()` تمرّ على العقد بالترتيب نفسه، والعقدة المتّجهة تُرسم بينما عقدة
 * الحجب تُدمِّر ما تحتها. فما يراه المستخدم هو ما يخرج في الملفّ — تمامًا.
 * ولو رُسم الحجب أوّلًا في العرض وأخيرًا في الخبز (أو العكس) لخرجت بطاقة
 * ملاحظة تحت حجبٍ **مكشوفة في الملفّ**، ولا يمسكها فحص تباين لأن التسريب
 * من طبقة رُسمت بعد الفحص.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { normaliseBox } from '../hit-test'

import { drawNote, drawPinNumber, drawText } from './text'

import type { Camera } from '../camera'
import type { BaseSource, Ctx2D, RenderStyle } from '../renderer'
import type {
  ArrowNode,
  EllipseNode,
  FreehandNode,
  LineNode,
  PinNode,
  RectNode,
  RedactNode,
  SceneNode,
  StrokeStyle,
} from '../scene'
import type { TextLayoutCache } from '../text-layout'

export interface DrawContext {
  readonly ctx: Ctx2D
  readonly style: RenderStyle
  readonly camera: Camera
  /** المصدر السليم — رسّام الحجب وحده يقرأ منه. */
  readonly source: BaseSource
  readonly interacting: boolean
  /**
   * ذاكرة تخطيط النصّ.
   *
   * اختيارية عمدًا: الأشكال الهندسية لا تحتاجها، وتمريرُها إلزاميًّا كان
   * سيفرض بناء ذاكرة على كل مستدعٍ لا يرسم نصًّا — ومنهم اختبارات الأشكال.
   * وغيابها يعني أن العقد النصّية تُتخطّى بدل أن تُرسم بأبعاد مقدَّرة.
   */
  readonly layout?: TextLayoutCache
}

/** يطبّق نمط الخطّ على السياق. يُستدعى داخل `save`/`restore` دائمًا. */
function applyStroke(ctx: Ctx2D, style: RenderStyle, stroke: StrokeStyle): void {
  ctx.strokeStyle = style.palette[stroke.colorToken]
  ctx.fillStyle = style.palette[stroke.colorToken]
  ctx.lineWidth = stroke.widthPx
  ctx.globalAlpha = stroke.opacity
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(stroke.dash)
}

/**
 * يدير السياق حول مركز العقدة.
 *
 * الرسم يقع بعده بإحداثيات **غير مدوَّرة** — أبسط من تدوير كل نقطة، ويطابق
 * ما يفعله `unrotate` في اختبار الإصابة بالاتجاه المعاكس.
 */
function withRotation(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rotation: number,
  body: () => void,
): void {
  if (rotation === 0) {
    body()
    return
  }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.translate(-cx, -cy)
  body()
  ctx.restore()
}

function drawRect(d: DrawContext, node: RectNode): void {
  const r = normaliseBox(node.rect)
  const { ctx } = d
  ctx.save()
  applyStroke(ctx, d.style, node.stroke)
  withRotation(ctx, r.x + r.width / 2, r.y + r.height / 2, node.rotation, () => {
    ctx.beginPath()
    if (node.radiusPx > 0) ctx.roundRect(r.x, r.y, r.width, r.height, node.radiusPx)
    else ctx.rect(r.x, r.y, r.width, r.height)
    if (node.fill === 'solid') ctx.fill()
    else ctx.stroke()
  })
  ctx.restore()
}

function drawEllipse(d: DrawContext, node: EllipseNode): void {
  const r = normaliseBox(node.rect)
  const { ctx } = d
  ctx.save()
  applyStroke(ctx, d.style, node.stroke)
  ctx.beginPath()
  // الدوران معامل في `ellipse` نفسها — أرخص من تحويل السياق كاملًا.
  ctx.ellipse(
    r.x + r.width / 2,
    r.y + r.height / 2,
    r.width / 2,
    r.height / 2,
    node.rotation,
    0,
    Math.PI * 2,
  )
  if (node.fill === 'solid') ctx.fill()
  else ctx.stroke()
  ctx.restore()
}

function drawLine(d: DrawContext, node: LineNode): void {
  const { ctx } = d
  ctx.save()
  applyStroke(ctx, d.style, node.stroke)
  withRotation(ctx, (node.a.x + node.b.x) / 2, (node.a.y + node.b.y) / 2, node.rotation, () => {
    ctx.beginPath()
    ctx.moveTo(node.a.x, node.a.y)
    ctx.lineTo(node.b.x, node.b.y)
    ctx.stroke()
  })
  ctx.restore()
}

/** نصف زاوية رأس السهم — 26° يعطي رأسًا مقروءًا بلا حدّة مفرطة. */
const ARROW_SPREAD = 0.45

function arrowHead(
  ctx: Ctx2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(
    toX - size * Math.cos(angle - ARROW_SPREAD),
    toY - size * Math.sin(angle - ARROW_SPREAD),
  )
  ctx.lineTo(
    toX - size * Math.cos(angle + ARROW_SPREAD),
    toY - size * Math.sin(angle + ARROW_SPREAD),
  )
  ctx.closePath()
  ctx.fill()
}

function drawArrow(d: DrawContext, node: ArrowNode): void {
  const { ctx } = d
  ctx.save()
  applyStroke(ctx, d.style, node.stroke)
  withRotation(ctx, (node.a.x + node.b.x) / 2, (node.a.y + node.b.y) / 2, node.rotation, () => {
    ctx.beginPath()
    ctx.moveTo(node.a.x, node.a.y)
    ctx.lineTo(node.b.x, node.b.y)
    ctx.stroke()
    // الرأس مملوء لا مرسوم بخطّ: الخطّ يترك فجوة عند القمّة مع السمك الكبير.
    ctx.setLineDash([])
    arrowHead(ctx, node.a.x, node.a.y, node.b.x, node.b.y, node.headSizePx)
    if (node.head === 'both') {
      arrowHead(ctx, node.b.x, node.b.y, node.a.x, node.a.y, node.headSizePx)
    }
  })
  ctx.restore()
}

/**
 * المسار الحرّ — منحنيات تربيعية بين منتصفات القطع.
 *
 * الوصل بخطوط مستقيمة يُظهر زوايا حادّة عند كل نقطة استشعار؛ والمنحنى
 * التربيعي الذي تكون نقطة التحكّم فيه هي النقطة نفسها ونهايتُه منتصفَ
 * القطعة التالية يعطي مسارًا أملس بلا حساب مسبق.
 */
function drawFreehand(d: DrawContext, node: FreehandNode): void {
  const pts = node.points
  if (pts.length < 4) return
  const { ctx } = d

  ctx.save()
  applyStroke(ctx, d.style, node.stroke)
  ctx.beginPath()
  ctx.moveTo(pts[0]!, pts[1]!)

  for (let i = 2; i + 3 < pts.length; i += 2) {
    const cx = pts[i]!
    const cy = pts[i + 1]!
    ctx.quadraticCurveTo(cx, cy, (cx + pts[i + 2]!) / 2, (cy + pts[i + 3]!) / 2)
  }
  ctx.lineTo(pts[pts.length - 2]!, pts[pts.length - 1]!)

  if (node.closed) ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawPin(d: DrawContext, node: PinNode): void {
  const { ctx } = d
  const r = node.radiusPx

  ctx.save()
  ctx.globalAlpha = node.stroke.opacity
  ctx.fillStyle = d.style.palette[node.stroke.colorToken]
  ctx.shadowColor = 'rgba(0,0,0,0.35)' /* rasd-allow-literal: ظلّ فصل عن الخلفية، لا لون واجهة */
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1

  ctx.beginPath()
  if (node.shape === 'circle') {
    ctx.arc(node.at.x, node.at.y, r, 0, Math.PI * 2)
  } else if (node.shape === 'square') {
    ctx.roundRect(node.at.x - r, node.at.y - r, r * 2, r * 2, r * 0.35)
  } else {
    // دبّوس: دائرة بذيل مدبَّب لأسفل.
    ctx.arc(node.at.x, node.at.y, r, Math.PI * 0.85, Math.PI * 0.15)
    ctx.lineTo(node.at.x, node.at.y + r * 1.9)
    ctx.closePath()
  }
  ctx.fill()
  ctx.restore()

  drawPinNumber(d, node)
}

/**
 * الحجب — **يقرأ من المصدر السليم لا من قماش العرض**.
 *
 * التغطية وحدها منفَّذة في هذه الدفعة؛ البكسلة والضبابي في الدفعة الخامسة مع
 * `pixel-ops`. وحتى ذلك الحين يُرسم الاثنان تغطيةً معتمة **لا معاينة كاذبة**:
 * إظهار طمس ضعيف لِما لم يُبنَ بعدُ وعدٌ لا يُوفى.
 */
function drawRedact(d: DrawContext, node: RedactNode): void {
  const r = normaliseBox(node.rect)
  const { ctx } = d

  ctx.save()
  /*
   * التغطية **معتمة قسرًا**: `globalAlpha = 1` مهما كان `stroke.opacity`.
   * تغطيةٌ بتسعين بالمئة تُفكّ حسابيًّا بمعرفة لون الغطاء — وملفّ التصميم
   * يرسم ثلاثة من أربعة حجوب بهذه الشفافية بالضبط. انظر ADR 0015.
   */
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.fillStyle = d.style.palette[node.coverToken]
  ctx.fillRect(r.x, r.y, r.width, r.height)

  // حدّ متقطّع يميّز الحجب عن مستطيل مرسوم — نصّ التصميم `128:133`.
  ctx.strokeStyle = d.style.redactOutlineHex
  ctx.lineWidth = 1.5 / d.camera.zoom
  ctx.setLineDash([4 / d.camera.zoom, 3 / d.camera.zoom])
  ctx.beginPath()
  ctx.rect(r.x - 2, r.y - 2, r.width + 4, r.height + 4)
  ctx.stroke()
  ctx.restore()
}

/**
 * يرسم عقدة واحدة.
 *
 * والقياس (`measure`) في الدفعة السابعة — يُتخطّى هنا صراحةً بدل أن يُرسم
 * ناقصًا.
 */
export function drawNode(d: DrawContext, node: SceneNode): void {
  switch (node.kind) {
    case 'rect':
      return drawRect(d, node)
    case 'ellipse':
      return drawEllipse(d, node)
    case 'line':
      return drawLine(d, node)
    case 'arrow':
      return drawArrow(d, node)
    case 'freehand':
      return drawFreehand(d, node)
    case 'pin':
      return drawPin(d, node)
    case 'redact':
      return drawRedact(d, node)
    case 'text':
      // بلا ذاكرة تخطيط لا يُرسم نصّ: الأبعاد المقدَّرة تعطي سطرًا في موضع
      // خاطئ، وهو أسوأ من لا شيء.
      return d.layout ? drawText(d, node, d.layout) : undefined
    case 'note':
      return d.layout ? drawNote(d, node, d.layout) : undefined
    case 'measure':
      return
  }
}
