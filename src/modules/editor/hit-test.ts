/**
 * اختبار الإصابة — هندسة تحليلية خالصة، بلا `Path2D` وبلا `isPointInPath`.
 *
 * **والسبب مقيس لا مذوق:** بيئة الاختبار تُرجع `null` من `getContext('2d')`
 * لكل من `<canvas>` و`OffscreenCanvas`، فلا `isPointInPath` ولا `Path2D`
 * موجودتان أصلًا. ولو بُني الاختبار عليهما لصار أدقّ منطق في المحرر — الذي
 * يقرّر ما يمسكه المستخدم — غير قابل للاختبار إلّا في متصفّح.
 *
 * وفوق ذلك: بناء مسار لكل عقدة في كل حركة مؤشِّر أبطأ من الحساب المباشر،
 * ومعيار المرحلة مئتا تعليق فوق 55 إطارًا في الثانية أثناء السحب.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { devicePoint, deviceRect, type DevicePoint, type DeviceRect } from '@/shared/geometry'

import { nodeBounds } from './bounds'
import { canvasToImage, type Camera } from './camera'

import type { NodeId, Scene, SceneNode } from './scene'

/**
 * تسامح الإصابة — **بكسل مسرح (CSS) لا بكسل صورة**.
 *
 * الستّة وصفٌ لدقّة اليد لا لدقّة الصورة. تثبيتها في فضاء الصورة يجعل خطًّا
 * رفيعًا مستحيل الالتقاط عند التصغير: عند تكبير 0.25 يصير عرض الخطّ المرئي
 * ربع بكسل. فتُحوَّل إلى فضاء الصورة بالقسمة على التكبير — 24 بكسل صورة عند
 * 0.25، و1.5 عند 4.
 */
export const HIT_TOLERANCE_PX = 6

/** مقبض التحجيم أكبر قليلًا من التسامح العامّ — إصابته مقصودة لا عابرة. */
export const HANDLE_HIT_PX = 8

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface HitOptions {
  readonly camera: Camera
  /** يُقاس به صندوق النصّ؛ `null` يعني: قدّر الصندوق من الخطّ بلا قياس. */
  readonly measureBox?: (node: SceneNode) => DeviceRect | null
  /** تجاوز التسامح — للاختبار وللأجهزة اللمسية لاحقًا. */
  readonly toleranceCanvasPx?: number
}

// ─────────────────────────────────────────────────────────────────
// بدائيّات هندسية
// ─────────────────────────────────────────────────────────────────

/** الأبعاد السالبة تُسوّى دفاعيًّا — لا دالّة تسوية في `shared/`. */
export function normaliseBox(r: DeviceRect): DeviceRect {
  const x = r.width < 0 ? r.x + r.width : r.x
  const y = r.height < 0 ? r.y + r.height : r.y
  return deviceRect(x, y, Math.abs(r.width), Math.abs(r.height))
}

/**
 * مسافة نقطة عن قطعة مستقيمة.
 *
 * الإسقاط على القطعة **مقصوص إلى [0,1]** — بلا القصّ تُقاس المسافة عن
 * الاستقامة اللانهائية، فيصير امتداد الخطّ خارج طرفيه قابلًا للالتقاط.
 */
export function distancePointSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** أقصر مسافة عن خطّ متعدّد مُسطَّح `[x0,y0,x1,y1,…]`. */
export function distancePointPolyline(px: number, py: number, pts: readonly number[]): number {
  if (pts.length < 4) {
    if (pts.length < 2) return Number.POSITIVE_INFINITY
    return Math.hypot(px - (pts[0] ?? 0), py - (pts[1] ?? 0))
  }
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = distancePointSegment(px, py, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!)
    if (d < best) best = d
  }
  return best
}

export function insideEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  if (rx <= 0 || ry <= 0) return false
  const nx = (px - cx) / rx
  const ny = (py - cy) / ry
  return nx * nx + ny * ny <= 1
}

/**
 * مسافة تقريبية عن حافّة القطع الناقص.
 *
 * التقريب مقصود ومعلَن: المسافة الدقيقة عن حافّة قطع ناقص تتطلّب حلّ معادلة
 * من الدرجة الرابعة. والتقريب هنا يقيس على الشعاع المارّ بالنقطة — دقيق على
 * الدائرة، ويخطئ قليلًا على القطع الممدود جدًّا. وفارقٌ في تسامح ستّة بكسلات
 * لا يُدرَك، بينما حلّ معادلة رباعية لكل عقدة في كل حركة مؤشِّر يُدرَك.
 */
export function distanceToEllipseEdge(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  if (rx <= 0 || ry <= 0) return Number.POSITIVE_INFINITY
  const dx = px - cx
  const dy = py - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.min(rx, ry)

  const ux = dx / len
  const uy = dy / len
  // نصف القطر في اتّجاه النقطة.
  const r = 1 / Math.hypot(ux / rx, uy / ry)
  return Math.abs(len - r)
}

export function insideRoundedRect(
  px: number,
  py: number,
  box: DeviceRect,
  radius: number,
): boolean {
  const r = normaliseBox(box)
  if (px < r.x || py < r.y || px > r.x + r.width || py > r.y + r.height) return false

  const rad = Math.min(radius, r.width / 2, r.height / 2)
  if (rad <= 0) return true

  // خارج الأركان وحدها يحتاج فحصًا دائريًّا.
  const cx = px < r.x + rad ? r.x + rad : px > r.x + r.width - rad ? r.x + r.width - rad : px
  const cy = py < r.y + rad ? r.y + rad : py > r.y + r.height - rad ? r.y + r.height - rad : py
  if (cx === px && cy === py) return true
  return Math.hypot(px - cx, py - cy) <= rad
}

/**
 * يدوّر النقطة عكسيًّا حول مركز.
 *
 * **الدوران يُعالَج بتدوير النقطة لا الشكل** — فيبقى كل اختبار محاذيًا
 * للمحاور، وهو أبسط وأسرع وأقلّ عرضة للخطأ من تدوير أربعة رؤوس.
 */
export function unrotate(p: DevicePoint, centre: DevicePoint, rotation: number): DevicePoint {
  if (rotation === 0) return p
  const cos = Math.cos(-rotation)
  const sin = Math.sin(-rotation)
  const dx = p.x - centre.x
  const dy = p.y - centre.y
  return devicePoint(centre.x + dx * cos - dy * sin, centre.y + dx * sin + dy * cos)
}

const centreOf = (r: DeviceRect): DevicePoint => {
  const n = normaliseBox(r)
  return devicePoint(n.x + n.width / 2, n.y + n.height / 2)
}

// ─────────────────────────────────────────────────────────────────
// الإصابة على العقد
// ─────────────────────────────────────────────────────────────────

/** هل تُصيب النقطة هذه العقدة؟ التسامح بفضاء **الصورة**. */
export function hitNode(
  node: SceneNode,
  point: DevicePoint,
  tolImagePx: number,
  options: HitOptions = { camera: { zoom: 1, tx: 0, ty: 0 } },
): boolean {
  switch (node.kind) {
    case 'rect':
    case 'redact': {
      const box = normaliseBox(node.rect)
      const p = unrotate(point, centreOf(box), node.rotation)
      const radius = node.kind === 'rect' ? node.radiusPx : 0
      // المملوء يُصاب من داخله؛ والمفرَّغ من حافّته وحدها — وإلّا استحال
      // اختيار ما تحته.
      const filled = node.kind === 'redact' || node.fill === 'solid'
      if (filled) {
        return insideRoundedRect(p.x, p.y, grow(box, tolImagePx), radius + tolImagePx)
      }
      return (
        insideRoundedRect(p.x, p.y, grow(box, tolImagePx), radius + tolImagePx) &&
        !insideRoundedRect(p.x, p.y, grow(box, -tolImagePx), Math.max(0, radius - tolImagePx))
      )
    }

    case 'ellipse': {
      const box = normaliseBox(node.rect)
      const c = centreOf(box)
      const p = unrotate(point, c, node.rotation)
      const rx = box.width / 2
      const ry = box.height / 2
      if (node.fill === 'solid') {
        return insideEllipse(p.x, p.y, c.x, c.y, rx + tolImagePx, ry + tolImagePx)
      }
      return distanceToEllipseEdge(p.x, p.y, c.x, c.y, rx, ry) <= tolImagePx
    }

    case 'line':
    case 'arrow': {
      const c = devicePoint((node.a.x + node.b.x) / 2, (node.a.y + node.b.y) / 2)
      const p = unrotate(point, c, node.rotation)
      const half = node.stroke.widthPx / 2
      return (
        distancePointSegment(p.x, p.y, node.a.x, node.a.y, node.b.x, node.b.y) <= tolImagePx + half
      )
    }

    case 'freehand': {
      const box = nodeBounds(node)
      const p = unrotate(point, centreOf(box), node.rotation)
      const half = node.stroke.widthPx / 2
      return distancePointPolyline(p.x, p.y, node.points) <= tolImagePx + half
    }

    case 'pin': {
      const d = Math.hypot(point.x - node.at.x, point.y - node.at.y)
      return d <= node.radiusPx + tolImagePx
    }

    case 'text':
    case 'note':
    case 'measure': {
      const box = options.measureBox?.(node) ?? nodeBounds(node)
      const p = unrotate(point, centreOf(box), node.rotation)
      return insideRoundedRect(p.x, p.y, grow(normaliseBox(box), tolImagePx), 0)
    }
  }
}

/** يوسّع مستطيلًا في كل الاتجاهات — قيمة سالبة تُضيّقه. */
function grow(r: DeviceRect, by: number): DeviceRect {
  const n = normaliseBox(r)
  return deviceRect(
    n.x - by,
    n.y - by,
    Math.max(0, n.width + by * 2),
    Math.max(0, n.height + by * 2),
  )
}

/** هل يتقاطع مستطيلان؟ للترشيح العريض. */
function overlaps(a: DeviceRect, b: DeviceRect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

const isTargetable = (node: SceneNode): boolean =>
  !node.locked && (node.kind === 'redact' || !node.hidden)

/**
 * أعلى عقدة تُصيبها النقطة — **من الأعلى إلى الأسفل**.
 *
 * الترتيب هو ترتيب الرسم معكوسًا: ما يراه المستخدم فوق غيره هو ما يمسكه.
 * والمخفيّ والمقفول يُتخطّيان — والمخفيّ ليس مرئيًّا فلا يُمسك، والمقفول
 * مقصودٌ إخراجه من الطريق.
 */
export function hitTest(scene: Scene, point: DevicePoint, options: HitOptions): NodeId | null {
  const tol = (options.toleranceCanvasPx ?? HIT_TOLERANCE_PX) / options.camera.zoom
  const probe = deviceRect(point.x - tol, point.y - tol, tol * 2, tol * 2)

  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const node = scene.nodes[i]
    if (!node || !isTargetable(node)) continue
    // ترشيح عريض بصندوق الإحاطة قبل الحساب الدقيق.
    if (!overlaps(grow(nodeBounds(node, options.measureBox), tol), probe)) continue
    if (hitNode(node, point, tol, options)) return node.id
  }
  return null
}

/** كل ما يقع داخل مستطيل تحديد — بترتيب الرسم. */
export function hitTestRect(
  scene: Scene,
  rect: DeviceRect,
  options: HitOptions,
): readonly NodeId[] {
  const box = normaliseBox(rect)
  const out: NodeId[] = []
  for (const node of scene.nodes) {
    if (!isTargetable(node)) continue
    if (overlaps(nodeBounds(node, options.measureBox), box)) out.push(node.id)
  }
  return out
}

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** موضع مقبض على مستطيل — بفضاء الصورة. */
export function handleAt(box: DeviceRect, handle: Handle): DevicePoint {
  const r = normaliseBox(box)
  const x =
    handle === 'nw' || handle === 'w' || handle === 'sw'
      ? r.x
      : handle === 'n' || handle === 's'
        ? r.x + r.width / 2
        : r.x + r.width
  const y =
    handle === 'nw' || handle === 'n' || handle === 'ne'
      ? r.y
      : handle === 'w' || handle === 'e'
        ? r.y + r.height / 2
        : r.y + r.height
  return devicePoint(x, y)
}

/**
 * أي مقبض تُصيبه النقطة، أو `null`. يُفحَص **قبل** إصابة العقد.
 *
 * **والتسامح محصورٌ بثلث أصغر ضلع.** التسامح يُقسَم على التكبير كي يبقى
 * ثابتًا في اليد، فعند تكبير 0.05 يصير ثمانية بكسلات شاشة **مئةً وستّين**
 * بكسل صورة. وقِيس عندها أن مركز مستطيل 300×200 يُصيب مقبض الشمال: أي أن
 * كل نقطة في المستطيل تصير مقبضًا، فيستحيل تحريكه أصلًا — وهو التكبير
 * الذي يختاره المستخدم ليرى لقطة صفحة كاملة.
 */
export function hitHandle(
  box: DeviceRect,
  rotation: number,
  point: DevicePoint,
  tolImagePx: number,
): Handle | null {
  const p = unrotate(point, centreOf(box), rotation)
  const tol = Math.min(tolImagePx, Math.min(Math.abs(box.width), Math.abs(box.height)) / 3)
  for (const handle of HANDLES) {
    const at = handleAt(box, handle)
    if (Math.hypot(p.x - at.x, p.y - at.y) <= tol) return handle
  }
  return null
}

/** يحوّل نقطة مؤشِّر إلى فضاء الصورة — الجسر الوحيد بين الحدث والمشهد. */
export function pointerToImage(cssX: number, cssY: number, camera: Camera): DevicePoint {
  return canvasToImage({ space: 'canvas', x: cssX, y: cssY }, camera)
}
