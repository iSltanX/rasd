/**
 * الكاميرا — تحويل تشابهي بين فضاء الصورة وفضاء المسرح.
 *
 * `canvas = image · zoom + t`. بلا دوران وبلا قصّ: دوران المشهد كلّه ليس في
 * `Rasd_Ar.md §5`، ودوران الشكل الواحد يعيش في العقدة نفسها.
 *
 * **وكثافة الشاشة ليست هنا عمدًا.** تدخل مرّة واحدة في `setTransform` عند
 * بدء الإطار، فلا تظهر في إحداثي واحد. وهذا وحده ما يجعل تسامح الإصابة
 * `6px` صحيحًا بلا قسمة: التسامح بفضاء الصورة = `6 / zoom`، لا
 * `6 / (zoom · dpr)`. وخلط الاثنين هو أصل أخطاء الالتقاط التي تظهر متأخّرة
 * وبانحراف صغير يصعب ربطه بسببه.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  canvasPoint,
  canvasRect,
  devicePoint,
  deviceRect,
  type CanvasPoint,
  type CanvasRect,
  type DevicePoint,
  type DeviceRect,
} from '@/shared/geometry'

export interface Camera {
  readonly zoom: number
  readonly tx: number
  readonly ty: number
}

/**
 * حدود التكبير.
 *
 * الأدنى يسمح برؤية لقطة صفحة كاملة (2560×28,672) في مسرح 839px ارتفاعًا:
 * `839 / 28672 ≈ 0.029` — فـ`0.02` يترك هامشًا. والأعلى ستّة عشر: عند هذا
 * الحدّ يملأ بكسلُ صورةٍ واحد ستّة عشر بكسل شاشة، وهو أقصى ما يفيد فحصًا
 * بصريًّا.
 */
export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 16

/** درجات التكبير في شريط الأدوات — تُقفَز بها بدل التدرّج الحرّ. */
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16] as const

export const identityCamera: Camera = { zoom: 1, tx: 0, ty: 0 }

export interface StageSize {
  readonly cssWidth: number
  readonly cssHeight: number
  /** كثافة الشاشة — **للمخزن لا للإحداثيات**. */
  readonly dpr: number
}

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function imageToCanvas(p: DevicePoint, c: Camera): CanvasPoint {
  return canvasPoint(p.x * c.zoom + c.tx, p.y * c.zoom + c.ty)
}

export function canvasToImage(p: CanvasPoint, c: Camera): DevicePoint {
  return devicePoint((p.x - c.tx) / c.zoom, (p.y - c.ty) / c.zoom)
}

export function imageRectToCanvas(r: DeviceRect, c: Camera): CanvasRect {
  return canvasRect(r.x * c.zoom + c.tx, r.y * c.zoom + c.ty, r.width * c.zoom, r.height * c.zoom)
}

export function canvasRectToImage(r: CanvasRect, c: Camera): DeviceRect {
  return deviceRect(
    (r.x - c.tx) / c.zoom,
    (r.y - c.ty) / c.zoom,
    r.width / c.zoom,
    r.height / c.zoom,
  )
}

/** يلائم الصورة داخل المسرح مع هامش، ويوسّطها. */
export function fitCamera(
  image: { readonly width: number; readonly height: number },
  stage: StageSize,
  padPx = 24,
): Camera {
  const availableW = Math.max(1, stage.cssWidth - padPx * 2)
  const availableH = Math.max(1, stage.cssHeight - padPx * 2)
  if (image.width <= 0 || image.height <= 0) return identityCamera

  const zoom = clampZoom(Math.min(availableW / image.width, availableH / image.height))
  return {
    zoom,
    tx: (stage.cssWidth - image.width * zoom) / 2,
    ty: (stage.cssHeight - image.height * zoom) / 2,
  }
}

/**
 * يكبّر حول نقطة ثابتة.
 *
 * **تثبيت النقطة تحت المؤشِّر هو الشرط الوحيد الذي يجعل التكبير لا يقفز.**
 * التكبير حول مركز المسرح يبدو صحيحًا حتى يكبّر المستخدم على تفصيلة في
 * ركن، فتهرب منه — وهو أشيع عطل في محرّرات القماش.
 */
export function zoomAt(c: Camera, anchor: CanvasPoint, factor: number): Camera {
  const zoom = clampZoom(c.zoom * factor)
  // النسبة الفعلية بعد القصّ، لا المطلوبة — وإلّا انزلقت النقطة عند الحدّين.
  const k = zoom / c.zoom
  return {
    zoom,
    tx: anchor.x - (anchor.x - c.tx) * k,
    ty: anchor.y - (anchor.y - c.ty) * k,
  }
}

/** يضبط التكبير إلى قيمة بعينها مع تثبيت نقطة. */
export function zoomTo(c: Camera, anchor: CanvasPoint, zoom: number): Camera {
  return zoomAt(c, anchor, clampZoom(zoom) / c.zoom)
}

export function panBy(c: Camera, dxCss: number, dyCss: number): Camera {
  return { zoom: c.zoom, tx: c.tx + dxCss, ty: c.ty + dyCss }
}

/**
 * يمنع الصورة من الهرب خارج المسرح.
 *
 * القاعدة ليست «ابقَ داخل الحدود» بل **«أبقِ جزءًا مرئيًّا دائمًا»**: صورة
 * أصغر من المسرح تُوسَّط، وصورة أكبر تُمنع من الانزلاق حتى تختفي. وبلا هذا
 * تضيع اللقطة بسحبة واحدة ولا يعرف المستخدم كيف يعيدها.
 */
export function clampCamera(
  c: Camera,
  image: { readonly width: number; readonly height: number },
  stage: StageSize,
): Camera {
  const w = image.width * c.zoom
  const h = image.height * c.zoom

  const axis = (t: number, drawn: number, available: number): number => {
    if (drawn <= available) return (available - drawn) / 2
    return Math.min(0, Math.max(available - drawn, t))
  }

  return {
    zoom: c.zoom,
    tx: axis(c.tx, w, stage.cssWidth),
    ty: axis(c.ty, h, stage.cssHeight),
  }
}

/** المستطيل المرئي من الصورة — مادّة الترشيح العريض قبل الرسم والإصابة. */
export function visibleImageRect(c: Camera, stage: StageSize): DeviceRect {
  return canvasRectToImage(canvasRect(0, 0, stage.cssWidth, stage.cssHeight), c)
}

/**
 * مصفوفة `setTransform` الستّة جاهزةً.
 *
 * **ستّة أعداد لا `DOMMatrix`** — والسبب اختباري لا أسلوبي: happy-dom بلا
 * `DOMMatrix`، والأعداد تُقارَن رقميًّا في اختبار وحدة بينما الكائن لا يُبنى
 * أصلًا. وهنا وحدها تدخل كثافة الشاشة.
 */
export function backingTransform(
  c: Camera,
  backingScale: number,
): readonly [number, number, number, number, number, number] {
  const s = c.zoom * backingScale
  return [s, 0, 0, s, c.tx * backingScale, c.ty * backingScale]
}

/** أقرب درجة أعلى/أدنى من `ZOOM_STEPS` — لأزرار التكبير. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > zoom + 1e-6) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1e-6) ?? MIN_ZOOM
}
