/**
 * المُصيِّر — يرسم المشهد على سياق يستقبله، ولا ينشئ قماشًا قطّ.
 *
 * **`Ctx2D` شرط اختبار لا زينة معمارية.** بيئة الاختبار تُرجع `null` من
 * `getContext('2d')` لكل من `<canvas>` و`OffscreenCanvas` بالقياس. فبلا
 * واجهة بنيوية يستحيل اختبار **ما يُرسم** — يبقى الرسم كلّه خارج التغطية
 * ولا يُكتشف خطؤه إلّا بالنظر. ومع الواجهة يُحقَن مسجِّل نداءات فيصير
 * «هل رُسم الحجب بعد الملاحظة؟» سؤالًا يُجاب في اختبار وحدة.
 *
 * والواجهة يحقّقها السياقان الحقيقيان **بلا محوِّل**: أسماء الأعضاء نفسها.
 *
 * **ولا تُضبط `filter` إلّا على `'none'`.** التمويه كلّه من `pixel-ops`
 * حتى تطابق المعاينة الخبز بالضبط — وإلّا ضبط المستخدم الشدّة على ما يراه
 * وصُدِّر شيء آخر. مثبَّت باختبار.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` ولا توكنز.
 */

import { deviceRect, type DeviceRect } from '@/shared/geometry'

import { nodeBounds, type MeasureBox } from './bounds'
import { imageRectToCanvas, type Camera } from './camera'
import { drawNode, type DrawContext } from './draw/shapes'
import { handleAt, normaliseBox } from './hit-test'
import { snapToPixel, statsOf, type RenderPlan, type RenderStats } from './render-plan'

import type { AnnotationColor, NodeId, Scene, SceneNode } from './scene'

/**
 * أضيق واجهة رسم تكفي المحرر.
 *
 * أوسع ممّا يبدو لازمًا لأن التصميم يفرضه: الحجب محاطٌ بحدّ متقطّع، والدبابيس
 * واللوحات لها ظلال. وواجهةٌ ناقصة تعني أن تفصيلة بصرية تُسقَط بصمت ثم
 * تُكتشف في المقارنة البصرية.
 */
export interface Ctx2D {
  save(): void
  restore(): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void
  rect(x: number, y: number, w: number, h: number): void
  roundRect(x: number, y: number, w: number, h: number, r: number | number[]): void
  clip(): void
  fill(): void
  stroke(): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  translate(x: number, y: number): void
  rotate(a: number): void
  scale(x: number, y: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  setLineDash(segments: readonly number[]): void
  fillText(t: string, x: number, y: number): void
  strokeText(t: string, x: number, y: number): void
  measureText(t: string): TextMetrics
  drawImage(image: CanvasImageSource, dx: number, dy: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  lineDashOffset: number
  globalAlpha: number
  globalCompositeOperation: GlobalCompositeOperation
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  font: string
  direction: CanvasDirection
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  letterSpacing: string
  /** يبقى `'none'` دائمًا — مثبَّت باختبار. */
  filter: string
  imageSmoothingEnabled: boolean
}

/** الألوان تصل **محلولةً** — قاعدة اللنت تمنع `modules/` من `tokens/`. */
export type Palette = Readonly<Record<AnnotationColor, string>>

export interface RenderStyle {
  readonly palette: Palette
  readonly selectionHex: string
  readonly handleHex: string
  readonly redactOutlineHex: string
  readonly textFamily: string
  readonly monoFamily: string
}

export interface Layer {
  readonly ctx: Ctx2D
  readonly cssWidth: number
  readonly cssHeight: number
  /** `min(dpr, حدّ الميزانية)` — ليس كثافة الجهاز دائمًا. */
  readonly backingScale: number
}

export interface Frame {
  readonly scene: Scene
  readonly camera: Camera
  readonly selection: ReadonlySet<NodeId>
  readonly style: RenderStyle
  readonly measure?: MeasureBox
  /** أثناء إيماءة حيّة — يمنع توليد المخابئ الغالية لإطار واحد. */
  readonly interacting: boolean
}

export interface BaseSource {
  readonly bitmap: CanvasImageSource
  readonly width: number
  readonly height: number
}

/** يُهيّئ السياق لإطار: مسح، ثم تحويل الكاميرا وكثافة المخزن. */
function beginFrame(layer: Layer, camera: Camera): void {
  const { ctx, backingScale } = layer
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, layer.cssWidth * backingScale, layer.cssHeight * backingScale)
  const s = camera.zoom * backingScale
  ctx.setTransform(s, 0, 0, s, camera.tx * backingScale, camera.ty * backingScale)
  // حارس: لا مرشِّح على مسار العرض إطلاقًا — انظر ترويسة الملفّ.
  ctx.filter = 'none'
}

/**
 * طبقة الأساس — نداء `drawImage` واحد.
 *
 * تُعاد عند تغيّر الكاميرا أو الاقتصاص وحدهما، لا مع كل تعليق: الصورة لا
 * تتغيّر بإضافة سهم فوقها.
 */
export function paintBase(layer: Layer, src: BaseSource, frame: Frame): void {
  beginFrame(layer, frame.camera)
  const crop = frame.scene.meta.crop
  if (crop) {
    const box = normaliseBox(crop)
    layer.ctx.drawImage(
      src.bitmap,
      box.x,
      box.y,
      box.width,
      box.height,
      box.x,
      box.y,
      box.width,
      box.height,
    )
    return
  }
  layer.ctx.drawImage(src.bitmap, 0, 0, src.width, src.height)
}

/**
 * طبقة التعليقات.
 *
 * **`src` مُمرَّر لأن رسّام الحجب يقرأ من المصدر السليم حصرًا.** التوقيع نفسه
 * هو الثابت: لا سبيل بنيويًّا لقراءة قماش العرض، فتراكم الضباب عبر الإطارات
 * لا يمكن أن يقع — لا لأن أحدًا انتبه، بل لأن الدالّة لا تملك ما تقرأ منه.
 */
export function paintAnnotations(
  layer: Layer,
  plan: RenderPlan,
  frame: Frame,
  src: BaseSource,
): RenderStats {
  const { ctx } = layer
  beginFrame(layer, frame.camera)

  if (plan.mode === 'partial') {
    ctx.save()
    ctx.beginPath()
    for (const rect of plan.dirty) {
      const r = snapToPixel(rect)
      ctx.rect(r.x, r.y, r.width, r.height)
    }
    ctx.clip()
  }

  const draw: DrawContext = {
    ctx,
    style: frame.style,
    camera: frame.camera,
    source: src,
    interacting: frame.interacting,
  }

  for (const node of plan.nodes) drawNode(draw, node)

  if (plan.mode === 'partial') ctx.restore()

  return statsOf(plan, frame.scene)
}

/** سمك خطّ التحديد بفضاء الصورة — ثابت على الشاشة مهما تغيّر التكبير. */
const SELECTION_CSS_PX = 1.5
const HANDLE_CSS_PX = 8

/**
 * يرسم التحديد ومقابضه.
 *
 * **بفضاء الصورة مقسومًا على التكبير**: خطّ التحديد يجب أن يبقى بسمك ثابت
 * على الشاشة — خطٌّ سمكه بكسل صورة واحد يختفي عند التصغير ويصير عريضًا
 * سخيفًا عند التكبير.
 */
export function paintSelection(layer: Layer, frame: Frame): void {
  if (frame.selection.size === 0) return
  const { ctx } = layer
  const zoom = frame.camera.zoom

  ctx.save()
  ctx.filter = 'none'
  ctx.setLineDash([])
  ctx.strokeStyle = frame.style.selectionHex
  ctx.lineWidth = SELECTION_CSS_PX / zoom

  const selected: SceneNode[] = []
  for (const node of frame.scene.nodes) {
    if (frame.selection.has(node.id)) selected.push(node)
  }

  for (const node of selected) {
    const box = nodeBounds(node, frame.measure)
    ctx.beginPath()
    ctx.rect(box.x, box.y, box.width, box.height)
    ctx.stroke()
  }

  // المقابض للعقدة الواحدة فقط: ثمانية مقابض لعشرين عقدة ضجيج لا أداة.
  const single = selected.length === 1 ? selected[0] : null
  if (single) {
    const box = nodeBounds(single, frame.measure)
    const size = HANDLE_CSS_PX / zoom
    ctx.fillStyle = frame.style.handleHex
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      const at = handleAt(box, handle)
      ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size)
    }
  }

  ctx.restore()
}

/**
 * يحرّر سطح الطبقة.
 *
 * `width = 0` يُسقط مخزن الرسم فورًا — السابقة من `background/image-ops.ts`.
 * وترك القماش معلّقًا على لقطة 4000×3000 يحتجز 48 ميغابايت لكل طبقة.
 */
export function disposeLayer(canvas: { width: number; height: number }): void {
  canvas.width = 0
  canvas.height = 0
}

/** مستطيل الصورة كاملةً — يخدم أوّل إطار وإعادة الملاءمة. */
export function fullImageRect(src: BaseSource): DeviceRect {
  return deviceRect(0, 0, src.width, src.height)
}

/** مستطيل الصورة بفضاء المسرح — لرسم إطار حول اللوحة الفنية. */
export function artboardRect(src: BaseSource, camera: Camera) {
  return imageRectToCanvas(fullImageRect(src), camera)
}
