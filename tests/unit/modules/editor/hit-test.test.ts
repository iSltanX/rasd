import { describe, expect, it } from 'vitest'

import { nodeBounds, unionBounds } from '@/modules/editor/bounds'
import {
  backingTransform,
  canvasToImage,
  clampCamera,
  fitCamera,
  identityCamera,
  imageToCanvas,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStep,
  panBy,
  visibleImageRect,
  zoomAt,
  type Camera,
} from '@/modules/editor/camera'
import {
  distancePointPolyline,
  distancePointSegment,
  handleAt,
  hitHandle,
  hitNode,
  hitTest,
  hitTestRect,
  HIT_TOLERANCE_PX,
  insideEllipse,
  insideRoundedRect,
  normaliseBox,
  unrotate,
} from '@/modules/editor/hit-test'
import {
  asNodeId,
  type EllipseNode,
  type FreehandNode,
  type LineNode,
  type PinNode,
  type RectNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { canvasPoint, deviceRect, devicePoint } from '@/shared/geometry'

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 4, dash: [], opacity: 1 } as const

const rectNode = (over: Partial<RectNode> = {}): RectNode => ({
  kind: 'rect',
  id: asNodeId('r'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  rect: deviceRect(100, 100, 200, 100),
  radiusPx: 0,
  fill: 'none',
  ...over,
})

const ellipseNode = (over: Partial<EllipseNode> = {}): EllipseNode => ({
  kind: 'ellipse',
  id: asNodeId('e'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  rect: deviceRect(100, 100, 200, 100),
  fill: 'none',
  ...over,
})

const lineNode = (over: Partial<LineNode> = {}): LineNode => ({
  kind: 'line',
  id: asNodeId('l'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  a: devicePoint(0, 0),
  b: devicePoint(100, 0),
  ...over,
})

const pinNode = (over: Partial<PinNode> = {}): PinNode => ({
  kind: 'pin',
  id: asNodeId('p'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(50, 50),
  shape: 'circle',
  ordinal: 1,
  noteId: null,
  radiusPx: 13,
  ...over,
})

const sceneWith = (nodes: SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: 1000, height: 800, dpr: 2 }),
  nodes,
})

const at1 = { camera: identityCamera }

// ═════════════════════════════ الكاميرا ═════════════════════════════

describe('الكاميرا — التحويلان متعاكسان', () => {
  const c: Camera = { zoom: 2.5, tx: 37, ty: -19 }

  it('صورة ← مسرح ← صورة يعود إلى نفسه', () => {
    const p = devicePoint(123.5, 456.25)
    const back = canvasToImage(imageToCanvas(p, c), c)
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
  })

  it('الفضاءان موسومان — لا يُخلطان', () => {
    expect(imageToCanvas(devicePoint(0, 0), c).space).toBe('canvas')
    expect(canvasToImage(canvasPoint(0, 0), c).space).toBe('device')
  })
})

describe('التكبير حول نقطة', () => {
  it('**النقطة تحت المؤشِّر لا تتحرّك**', () => {
    const c: Camera = { zoom: 1, tx: 0, ty: 0 }
    const anchor = canvasPoint(300, 200)
    const before = canvasToImage(anchor, c)
    const after = canvasToImage(anchor, zoomAt(c, anchor, 2))
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  it('ولا تتحرّك عند بلوغ الحدّ الأقصى', () => {
    const c: Camera = { zoom: MAX_ZOOM, tx: 10, ty: 10 }
    const anchor = canvasPoint(120, 80)
    const before = canvasToImage(anchor, c)
    const next = zoomAt(c, anchor, 4)
    expect(next.zoom).toBe(MAX_ZOOM)
    const after = canvasToImage(anchor, next)
    expect(after.x).toBeCloseTo(before.x, 9)
  })

  it('التكبير محصور بين الحدّين', () => {
    expect(zoomAt(identityCamera, canvasPoint(0, 0), 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(identityCamera, canvasPoint(0, 0), 0.00001).zoom).toBe(MIN_ZOOM)
  })

  it('درجات التكبير تصعد وتهبط', () => {
    expect(nextZoomStep(1, 1)).toBe(1.5)
    expect(nextZoomStep(1, -1)).toBe(0.75)
    expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(nextZoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
})

describe('الملاءمة والحصر', () => {
  const stage = { cssWidth: 1000, cssHeight: 800, dpr: 2 }

  it('الملاءمة توسّط الصورة داخل المسرح', () => {
    const cam = fitCamera({ width: 500, height: 400 }, stage, 0)
    expect(cam.zoom).toBeCloseTo(2, 9)
    expect(cam.tx).toBeCloseTo(0, 9)
    expect(cam.ty).toBeCloseTo(0, 9)
  })

  it('**الحالة القصوى تُلاءَم بلا كسر** — 2560×28,672 داخل مسرح 800', () => {
    const cam = fitCamera({ width: 2560, height: 28_672 }, stage, 24)
    expect(cam.zoom).toBeGreaterThan(MIN_ZOOM)
    expect(cam.zoom).toBeLessThan(0.05)
  })

  /*
   * الملاءمة تُكبّر الصورة حتى تملأ المسرح، فلا تبقى «أصغر» بعدها. فالحصر
   * يُختبَر بتكبير مضبوط يدويًّا: صورة 200×100 عند تكبير 1 تشغل خُمس المسرح.
   */
  it('صورة أصغر من المسرح تبقى موسَّطة مهما سُحبت', () => {
    const image = { width: 200, height: 100 }
    const dragged = panBy({ zoom: 1, tx: 0, ty: 0 }, 500, 500)
    const clamped = clampCamera(dragged, image, stage)
    expect(clamped.tx).toBeCloseTo((1000 - 200) / 2, 9)
    expect(clamped.ty).toBeCloseTo((800 - 100) / 2, 9)
  })

  it('**صورة أكبر لا تهرب خارج المسرح**', () => {
    const image = { width: 4000, height: 3000 }
    const cam: Camera = { zoom: 1, tx: 0, ty: 0 }
    const far = clampCamera(panBy(cam, 9999, 9999), image, stage)
    expect(far.tx).toBe(0)
    expect(far.ty).toBe(0)

    const other = clampCamera(panBy(cam, -99_999, -99_999), image, stage)
    expect(other.tx).toBe(1000 - 4000)
    expect(other.ty).toBe(800 - 3000)
  })

  it('المستطيل المرئي يطابق المسرح عند تكبير 1 بلا إزاحة', () => {
    const vis = visibleImageRect(identityCamera, stage)
    expect(vis).toEqual(deviceRect(0, 0, 1000, 800))
  })
})

describe('مصفوفة التحويل — كثافة الشاشة تدخل هنا وحدها', () => {
  it('ستّة أعداد لا كائن', () => {
    const m = backingTransform({ zoom: 2, tx: 10, ty: 20 }, 2)
    expect(m).toEqual([4, 0, 0, 4, 20, 40])
  })

  it('كثافة 1 لا تغيّر شيئًا', () => {
    expect(backingTransform({ zoom: 3, tx: 5, ty: 7 }, 1)).toEqual([3, 0, 0, 3, 5, 7])
  })
})

// ═══════════════════════════ بدائيّات هندسية ═══════════════════════════

describe('البدائيّات', () => {
  it('المسافة عن القطعة **مقصوصة عند طرفيها**', () => {
    // النقطة على امتداد الخطّ خارجه: المسافة عن الطرف لا عن الاستقامة.
    expect(distancePointSegment(200, 0, 0, 0, 100, 0)).toBe(100)
    expect(distancePointSegment(50, 5, 0, 0, 100, 0)).toBe(5)
  })

  it('القطعة الصفرية لا تقسم على صفر', () => {
    expect(distancePointSegment(3, 4, 0, 0, 0, 0)).toBe(5)
  })

  it('الخطّ المتعدّد يأخذ أقرب قطعة', () => {
    expect(distancePointPolyline(50, 3, [0, 0, 100, 0, 100, 100])).toBe(3)
    expect(distancePointPolyline(0, 0, [])).toBe(Number.POSITIVE_INFINITY)
  })

  it('داخل القطع الناقص', () => {
    expect(insideEllipse(0, 0, 0, 0, 10, 5)).toBe(true)
    expect(insideEllipse(10, 0, 0, 0, 10, 5)).toBe(true)
    expect(insideEllipse(0, 6, 0, 0, 10, 5)).toBe(false)
  })

  it('المستطيل بأركان مستديرة يستبعد الركن', () => {
    const box = deviceRect(0, 0, 100, 100)
    expect(insideRoundedRect(50, 50, box, 20)).toBe(true)
    // ركن (0,0) مقصوص بنصف قطر 20 — النقطة (1,1) خارجه.
    expect(insideRoundedRect(1, 1, box, 20)).toBe(false)
    expect(insideRoundedRect(1, 1, box, 0)).toBe(true)
  })

  it('التسوية تُصلح الأبعاد السالبة', () => {
    expect(normaliseBox(deviceRect(100, 100, -40, -20))).toEqual(deviceRect(60, 80, 40, 20))
  })

  it('تدوير النقطة عكسيًّا يعود بها', () => {
    const c = devicePoint(50, 50)
    const p = devicePoint(100, 50)
    const back = unrotate(p, c, Math.PI / 2)
    expect(back.x).toBeCloseTo(50, 9)
    expect(back.y).toBeCloseTo(0, 9)
  })
})

// ═════════════════════════ الإصابة على الأشكال ═════════════════════════

describe('الإصابة لكل شكل', () => {
  const TOL = 6

  it('المستطيل المفرَّغ يُصاب من حافّته لا من داخله', () => {
    const node = rectNode()
    expect(hitNode(node, devicePoint(100, 150), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(200, 150), TOL)).toBe(false)
  })

  it('والمملوء يُصاب من داخله', () => {
    const node = rectNode({ fill: 'solid' })
    expect(hitNode(node, devicePoint(200, 150), TOL)).toBe(true)
  })

  it('القطع الناقص المفرَّغ يُصاب من حافّته', () => {
    const node = ellipseNode()
    // الحافّة اليمنى عند (300,150).
    expect(hitNode(node, devicePoint(300, 150), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(200, 150), TOL)).toBe(false)
  })

  it('الخطّ يُصاب ضمن سمكه زائد التسامح، ولا يُصاب خارج طرفيه', () => {
    const node = lineNode()
    expect(hitNode(node, devicePoint(50, 7), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(50, 20), TOL)).toBe(false)
    // امتداد الخطّ ليس الخطّ.
    expect(hitNode(node, devicePoint(200, 0), TOL)).toBe(false)
  })

  it('المسار الحرّ يُصاب عند أي قطعة منه', () => {
    const node: FreehandNode = {
      kind: 'freehand',
      id: asNodeId('f'),
      locked: false,
      rotation: 0,
      hidden: false,
      stroke,
      points: [0, 0, 100, 0, 100, 100],
      closed: false,
      epsilon: 1,
    }
    expect(hitNode(node, devicePoint(100, 50), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(50, 50), TOL)).toBe(false)
  })

  it('الدبّوس دائرة حول مركزه', () => {
    const node = pinNode()
    expect(hitNode(node, devicePoint(50 + 13, 50), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(50 + 30, 50), TOL)).toBe(false)
  })

  it('**الشكل المدوَّر يُصاب في موضعه المدوَّر**', () => {
    const node = rectNode({ rotation: Math.PI / 2, fill: 'solid' })
    // المستطيل 200×100 حول مركزه (200,150) — بعد ربع دورة يصير 100×200.
    expect(hitNode(node, devicePoint(200, 220), TOL)).toBe(true)
    expect(hitNode(node, devicePoint(290, 150), TOL)).toBe(false)
  })
})

describe('الترتيب والاستبعاد', () => {
  it('**الأعلى يفوز** — آخر عقدة في المصفوفة هي الأعلى', () => {
    const lower = rectNode({ id: asNodeId('lower'), fill: 'solid' })
    const upper = rectNode({ id: asNodeId('upper'), fill: 'solid' })
    const scene = sceneWith([lower, upper])
    expect(hitTest(scene, devicePoint(200, 150), at1)).toBe('upper')
  })

  it('المخفيّ لا يُصاب', () => {
    const scene = sceneWith([rectNode({ fill: 'solid', hidden: true })])
    expect(hitTest(scene, devicePoint(200, 150), at1)).toBeNull()
  })

  it('والمقفول لا يُصاب', () => {
    const scene = sceneWith([rectNode({ fill: 'solid', locked: true })])
    expect(hitTest(scene, devicePoint(200, 150), at1)).toBeNull()
  })

  it('مستطيل التحديد يجمع ما يتقاطع معه', () => {
    const a = rectNode({ id: asNodeId('a'), rect: deviceRect(0, 0, 50, 50) })
    const b = rectNode({ id: asNodeId('b'), rect: deviceRect(500, 500, 50, 50) })
    const scene = sceneWith([a, b])
    expect(hitTestRect(scene, deviceRect(0, 0, 100, 100), at1)).toEqual(['a'])
  })
})

describe('**التسامح بفضاء المسرح لا الصورة**', () => {
  const scene = sceneWith([lineNode({ stroke: { ...stroke, widthPx: 1 } })])

  /*
   * الخطّ بسمك 1 عند y=0. نقطة على بعد 20 بكسل صورة:
   *   • عند تكبير 1   ⇒ التسامح 6 بكسل صورة  ⇒ لا إصابة.
   *   • عند تكبير 0.25 ⇒ التسامح 24 بكسل صورة ⇒ إصابة.
   * ولو ثُبِّت التسامح في فضاء الصورة لاستحال التقاط الخطّ عند التصغير —
   * وهو ما يُرى على الشاشة بربع بكسل.
   */
  it('عند تكبير 1 لا يُصاب على بعد 20 بكسل صورة', () => {
    expect(hitTest(scene, devicePoint(50, 20), { camera: identityCamera })).toBeNull()
  })

  it('**وعند تصغير 0.25 يُصاب** — التسامح يتّسع في فضاء الصورة', () => {
    expect(hitTest(scene, devicePoint(50, 20), { camera: { zoom: 0.25, tx: 0, ty: 0 } })).toBe('l')
  })

  it('وعند تكبير 4 يضيق فلا يُصاب على بعد 3', () => {
    expect(hitTest(scene, devicePoint(50, 3), { camera: { zoom: 4, tx: 0, ty: 0 } })).toBeNull()
    expect(hitTest(scene, devicePoint(50, 1), { camera: { zoom: 4, tx: 0, ty: 0 } })).toBe('l')
  })

  it('والثابت ستّة كما يفرض نصّ المرحلة', () => {
    expect(HIT_TOLERANCE_PX).toBe(6)
  })
})

describe('المقابض', () => {
  const box = deviceRect(100, 100, 200, 100)

  it('المقابض الثمانية في مواضعها', () => {
    expect(handleAt(box, 'nw')).toEqual(devicePoint(100, 100))
    expect(handleAt(box, 'se')).toEqual(devicePoint(300, 200))
    expect(handleAt(box, 'n')).toEqual(devicePoint(200, 100))
    expect(handleAt(box, 'w')).toEqual(devicePoint(100, 150))
  })

  it('الإصابة تُرجع المقبض الصحيح، و`null` بعيدًا عنها', () => {
    expect(hitHandle(box, 0, devicePoint(102, 102), 8)).toBe('nw')
    expect(hitHandle(box, 0, devicePoint(200, 150), 8)).toBeNull()
  })
})

// ═══════════════════════════ صناديق الإحاطة ═══════════════════════════

describe('صندوق الإحاطة يشمل السمك', () => {
  it('**الخطّ الأفقي له ارتفاع** — وإلّا تركت الإعادة المتّسخة نصفه', () => {
    const node = lineNode({ stroke: { ...stroke, widthPx: 10 } })
    const box = nodeBounds(node)
    expect(box.height).toBe(10)
    expect(box.y).toBe(-5)
  })

  it('الشكل المدوَّر يتّسع صندوقه', () => {
    const upright = nodeBounds(rectNode())
    const turned = nodeBounds(rectNode({ id: asNodeId('r2'), rotation: Math.PI / 4 }))
    expect(turned.width).toBeGreaterThan(upright.width)
  })

  it('المسار الحرّ من نقاطه', () => {
    const node: FreehandNode = {
      kind: 'freehand',
      id: asNodeId('f'),
      locked: false,
      rotation: 0,
      hidden: false,
      stroke: { ...stroke, widthPx: 0 },
      points: [10, 20, 30, 5, 50, 40],
      closed: false,
      epsilon: 1,
    }
    expect(nodeBounds(node)).toEqual(deviceRect(10, 5, 40, 35))
  })

  it('الاتّحاد يشمل الجميع، و`null` بلا عقد', () => {
    const a = rectNode({ id: asNodeId('a'), rect: deviceRect(0, 0, 10, 10) })
    const b = rectNode({ id: asNodeId('b'), rect: deviceRect(90, 90, 10, 10) })
    const box = unionBounds([a, b])
    expect(box?.x).toBe(-2)
    expect(box?.width).toBe(104)
    expect(unionBounds([])).toBeNull()
  })

  it('التذكير يُعيد المرجع نفسه للعقدة نفسها', () => {
    const node = rectNode()
    expect(nodeBounds(node)).toBe(nodeBounds(node))
  })
})
