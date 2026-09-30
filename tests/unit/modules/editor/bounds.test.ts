import { describe, expect, it, vi } from 'vitest'

import { nodeBounds, unionBounds, type MeasureBox } from '@/modules/editor/bounds'
import {
  asNodeId,
  type ArrowNode,
  type EllipseNode,
  type FreehandNode,
  type LineNode,
  type MeasureNode,
  type NoteNode,
  type PinNode,
  type RectNode,
  type RedactNode,
  type SceneNode,
  type TextNode,
} from '@/modules/editor/scene'
import { deviceRect, devicePoint, type DeviceRect } from '@/shared/geometry'

/**
 * صناديق الإحاطة — مادّة الترشيح والتحديد والمناطق المتّسخة.
 *
 * كل حالة هنا تحمل سمكًا صريحًا: الصندوق **يشمل السمك**، فرقمٌ خاطئ في
 * التوسعة يترك نصف الخطّ على الشاشة عند إعادة الرسم — عطلٌ لا يُرى في اختبار
 * يقيس الهندسة وحدها.
 */

const strokeOf = (widthPx: number) =>
  ({ colorToken: 'tool/annotate/solid', widthPx, dash: [], opacity: 1 }) as const

const font = { family: 'Cairo', sizePx: 20, weight: 400, letterSpacingPx: 0 } as const

const rectNode = (over: Partial<RectNode> = {}): RectNode => ({
  kind: 'rect',
  id: asNodeId('r'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(4),
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
  stroke: strokeOf(4),
  rect: deviceRect(10, 10, 80, 40),
  fill: 'none',
  ...over,
})

const redactNode = (over: Partial<RedactNode> = {}): RedactNode => ({
  kind: 'redact',
  id: asNodeId('x'),
  locked: false,
  rotation: 0,
  stroke: strokeOf(0),
  rect: deviceRect(20, 30, 60, 10),
  mode: 'cover',
  strength: 0,
  coverToken: 'tool/annotate/solid',
  ...over,
})

const lineNode = (over: Partial<LineNode> = {}): LineNode => ({
  kind: 'line',
  id: asNodeId('l'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(6),
  a: devicePoint(10, 80),
  b: devicePoint(110, 20),
  ...over,
})

const arrowNode = (over: Partial<ArrowNode> = {}): ArrowNode => ({
  kind: 'arrow',
  id: asNodeId('a'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(2),
  a: devicePoint(0, 0),
  b: devicePoint(40, -30),
  head: 'end',
  headSizePx: 12,
  ...over,
})

const freehandNode = (over: Partial<FreehandNode> = {}): FreehandNode => ({
  kind: 'freehand',
  id: asNodeId('f'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(2),
  points: [10, 20, 50, 5, 30, 60],
  closed: false,
  epsilon: 0,
  ...over,
})

const pinNode = (over: Partial<PinNode> = {}): PinNode => ({
  kind: 'pin',
  id: asNodeId('p'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(4),
  at: devicePoint(50, 50),
  shape: 'circle',
  ordinal: 1,
  noteId: null,
  radiusPx: 13,
  ...over,
})

const textNode = (over: Partial<TextNode> = {}): TextNode => ({
  kind: 'text',
  id: asNodeId('t'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(0),
  at: devicePoint(10, 20),
  text: 'abcd',
  font,
  maxWidthPx: 0,
  align: 'start',
  dir: 'auto',
  ...over,
})

const noteNode = (over: Partial<NoteNode> = {}): NoteNode => ({
  kind: 'note',
  id: asNodeId('n'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(0),
  at: devicePoint(5, 7),
  widthPx: 200,
  title: 'عنوان',
  body: '',
  tag: null,
  font: { ...font, sizePx: 10 },
  paddingPx: 10,
  pinId: null,
  ...over,
})

const measureNode = (over: Partial<MeasureNode> = {}): MeasureNode => ({
  kind: 'measure',
  id: asNodeId('m'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: strokeOf(0),
  a: deviceRect(0, 0, 50, 20),
  b: null,
  show: 'size',
  ...over,
})

/** مقارنة صندوق بأربعة أرقام بدقّة فاصلة عائمة — للدوران والقياس بالضرب. */
function expectRect(actual: DeviceRect, x: number, y: number, w: number, h: number): void {
  expect(actual.space).toBe('device')
  expect(actual.x).toBeCloseTo(x, 6)
  expect(actual.y).toBeCloseTo(y, 6)
  expect(actual.width).toBeCloseTo(w, 6)
  expect(actual.height).toBeCloseTo(h, 6)
}

describe('الأشكال ذات المستطيل', () => {
  it('المستطيل يتوسّع بنصف السمك من كل جهة', () => {
    // السمك 4 ⇒ نصفه 2 على كل ضلع: 100→98 والعرض 200→204.
    expect(nodeBounds(rectNode())).toEqual(deviceRect(98, 98, 204, 104))
  })

  it('**المستطيل بأبعاد سالبة يُطبَّع** — السحب من اليمين إلى اليسار', () => {
    // مؤشِّر سُحب من (300,200) إلى (100,100): العرض والارتفاع سالبان بالبنية.
    const dragged = rectNode({ rect: deviceRect(300, 200, -200, -100) })
    expect(nodeBounds(dragged)).toEqual(nodeBounds(rectNode()))
  })

  it('الإهليج يُقاس بمستطيله ويُطبَّع كذلك', () => {
    expect(nodeBounds(ellipseNode())).toEqual(deviceRect(8, 8, 84, 44))
    const flipped = ellipseNode({ rect: deviceRect(90, 50, -80, -40) })
    expect(nodeBounds(flipped)).toEqual(deviceRect(8, 8, 84, 44))
  })

  it('الحجب يُقاس بمستطيله — وسمكه صفر فلا توسعة', () => {
    expect(nodeBounds(redactNode())).toEqual(deviceRect(20, 30, 60, 10))
    const flipped = redactNode({ rect: deviceRect(80, 40, -60, -10) })
    expect(nodeBounds(flipped)).toEqual(deviceRect(20, 30, 60, 10))
  })
})

describe('الخطّ والسهم', () => {
  it('الخطّ المائل يُقاس من طرفيه أيًّا كان ترتيبهما', () => {
    // (10,80)→(110,20): الصندوق الهندسي (10,20,100,60) وبنصف سمك 3.
    const expected = deviceRect(7, 17, 106, 66)
    expect(nodeBounds(lineNode())).toEqual(expected)
    const swapped = lineNode({ a: devicePoint(110, 20), b: devicePoint(10, 80) })
    expect(nodeBounds(swapped)).toEqual(expected)
  })

  it('**الخطّ الأفقي صندوقه بارتفاع السمك** — لا صفر', () => {
    const flat = lineNode({
      a: devicePoint(0, 0),
      b: devicePoint(100, 0),
      stroke: strokeOf(4),
    })
    // لو قيست الهندسة وحدها لخرج الارتفاع صفرًا وبقي نصف الخطّ بلا إعادة رسم.
    expect(nodeBounds(flat)).toEqual(deviceRect(-2, -2, 104, 4))
  })

  it('السهم يُقاس كالخطّ — الرأس على الطرف الثاني لا يوسّع الصندوق', () => {
    // (0,0)→(40,-30) بسمك 2: الهندسة (0,-30,40,30) ثم توسعة 1.
    expect(nodeBounds(arrowNode())).toEqual(deviceRect(-1, -31, 42, 32))
  })
})

describe('المسار الحرّ', () => {
  it('الصندوق يحيط بأقصى النقاط وأدناها على المحورين', () => {
    // x: 10..50 ، y: 5..60 ثم توسعة 1.
    expect(nodeBounds(freehandNode())).toEqual(deviceRect(9, 4, 42, 57))
  })

  it('نقطة وسطى داخل المدى لا تغيّر الصندوق', () => {
    const inner = freehandNode({ points: [10, 10, 20, 20, 15, 15], stroke: strokeOf(0) })
    expect(nodeBounds(inner)).toEqual(deviceRect(10, 10, 10, 10))
  })

  it('نقاط بإحداثيات سالبة تُقاس بأدناها', () => {
    const neg = freehandNode({ points: [-5, -8, 3, 4], stroke: strokeOf(0) })
    expect(nodeBounds(neg)).toEqual(deviceRect(-5, -8, 8, 12))
  })

  it('**مسار بلا نقاط** يعطي صندوقًا صفريًّا عند الأصل بدل `Infinity`', () => {
    // لو دخلت الحلقة بالمصفوفة الفارغة لخرج الصندوق `Infinity - -Infinity`
    // وسمّم كل اتّحاد يمرّ به.
    const empty = freehandNode({ points: [] })
    expect(nodeBounds(empty)).toEqual(deviceRect(-1, -1, 2, 2))
  })

  it('محرف منفرد لا يكوّن نقطة — يُعامَل كمسار فارغ', () => {
    const lone = freehandNode({ points: [42] })
    expect(nodeBounds(lone)).toEqual(deviceRect(-1, -1, 2, 2))
  })

  it('عدد فردي من الإحداثيات يُهمل الذيل اليتيم', () => {
    const odd = freehandNode({ points: [1, 2, 3], stroke: strokeOf(0) })
    expect(nodeBounds(odd)).toEqual(deviceRect(1, 2, 0, 0))
  })
})

describe('الدبّوس', () => {
  it('الدبّوس مربّع قطره ضعف نصف القطر، متمركز على نقطته، ثمّ يُوسَّع بالسمك', () => {
    // مركز (50,50) ونصف قطر 13 ⇒ (37,37,26,26) ثم توسعة 2.
    expect(nodeBounds(pinNode())).toEqual(deviceRect(35, 35, 30, 30))
  })
})

describe('النصّ', () => {
  it('بلا قياس: العرض نصف حجم الخطّ لكل محرف، والارتفاع 1.4 من الحجم', () => {
    // 4 محارف × 20 × 0.5 = 40 ، و20 × 1.4 = 28.
    expectRect(nodeBounds(textNode()), 10, 20, 40, 28)
  })

  it('العرض المحدَّد للّفّ يغلب التقدير بعدد المحارف', () => {
    expectRect(nodeBounds(textNode({ maxWidthPx: 150 })), 10, 20, 150, 28)
  })

  it('السمك يوسّع التقدير كغيره', () => {
    expectRect(nodeBounds(textNode({ stroke: strokeOf(4) })), 8, 18, 44, 32)
  })

  it('القياس المحقون يغلب التقدير ويُطبَّع', () => {
    const measure = vi.fn<MeasureBox>(() => deviceRect(100, 200, 50, -20))
    const node = textNode()
    expectRect(nodeBounds(node, measure), 100, 180, 50, 20)
    expect(measure).toHaveBeenCalledWith(node)
  })

  it('قياس `null` يرجع إلى التقدير — سياق الرسم لم يجهز بعد', () => {
    const measure: MeasureBox = () => null
    expectRect(nodeBounds(textNode(), measure), 10, 20, 40, 28)
  })
})

describe('الملاحظة', () => {
  it('بلا قياس: الارتفاع حشوتان + سطران أدنى + سطر لكل أربعين محرفًا', () => {
    // الحشوة 10 والخطّ 10 ⇒ سطر = 14. جسم فارغ: سطران ⇒ 20 + 28 = 48.
    expectRect(nodeBounds(noteNode()), 5, 7, 200, 48)
  })

  it('أربعون محرفًا بالضبط تضيف سطرًا واحدًا لا اثنين', () => {
    const body = 'م'.repeat(40)
    // 2 + ceil(40/40) = 3 أسطر ⇒ 20 + 42 = 62.
    expectRect(nodeBounds(noteNode({ body })), 5, 7, 200, 62)
  })

  it('محرف واحد فوق الأربعين يضيف سطرًا ثانيًا', () => {
    const body = 'م'.repeat(41)
    // 2 + ceil(41/40) = 4 أسطر ⇒ 20 + 56 = 76.
    expectRect(nodeBounds(noteNode({ body })), 5, 7, 200, 76)
  })

  it('القياس المحقون يغلب التقدير', () => {
    const measure: MeasureBox = () => deviceRect(0, 0, 210, 90)
    expectRect(nodeBounds(noteNode(), measure), 0, 0, 210, 90)
  })

  it('قياس `null` يرجع إلى التقدير', () => {
    const measure: MeasureBox = () => null
    expectRect(nodeBounds(noteNode(), measure), 5, 7, 200, 48)
  })
})

describe('عقدة القياس', () => {
  it('بُعد واحد (`b` فارغ): صندوق `a` وحده', () => {
    expect(nodeBounds(measureNode())).toEqual(deviceRect(0, 0, 50, 20))
  })

  it('`a` سالب الأبعاد يُطبَّع', () => {
    const node = measureNode({ a: deviceRect(50, 20, -50, -20) })
    expect(nodeBounds(node)).toEqual(deviceRect(0, 0, 50, 20))
  })

  it('فجوة بين اثنين: اتّحاد الصندوقين', () => {
    const node = measureNode({ b: deviceRect(100, 80, 30, 30), show: 'gap' })
    expect(nodeBounds(node)).toEqual(deviceRect(0, 0, 130, 110))
  })

  it('الاتّحاد صحيح حين يقع `b` على يسار `a` وأعلاه', () => {
    const node = measureNode({
      a: deviceRect(100, 100, 50, 50),
      b: deviceRect(20, 30, 40, 40),
      show: 'gap',
    })
    // x: 20..150 ، y: 30..150.
    expect(nodeBounds(node)).toEqual(deviceRect(20, 30, 130, 120))
  })

  it('صندوق `b` الأكبر يحدّد الحواف اليمنى والسفلى', () => {
    const node = measureNode({ b: deviceRect(10, 5, 300, 400), show: 'gap' })
    expect(nodeBounds(node)).toEqual(deviceRect(0, 0, 310, 405))
  })
})

describe('الدوران', () => {
  it('دوران صفر يُبقي الصندوق كما هو', () => {
    expect(nodeBounds(rectNode({ rotation: 0 }))).toEqual(deviceRect(98, 98, 204, 104))
  })

  it('ربع دورة يبدّل العرض بالارتفاع حول المركز', () => {
    const node = rectNode({
      rect: deviceRect(0, 0, 100, 50),
      stroke: strokeOf(0),
      rotation: Math.PI / 2,
    })
    // المركز (50,25): العرض الجديد 50 والارتفاع 100، فالأصل (25,-25).
    expectRect(nodeBounds(node), 25, -25, 50, 100)
  })

  it('45° لمربّع يعطي صندوقًا بقطره، متمركزًا على المركز نفسه', () => {
    const node = rectNode({
      rect: deviceRect(0, 0, 100, 100),
      stroke: strokeOf(0),
      rotation: Math.PI / 4,
    })
    const side = 100 * Math.SQRT2
    expectRect(nodeBounds(node), 50 - side / 2, 50 - side / 2, side, side)
  })

  it('**السمك يُضاف قبل الدوران لا بعده**', () => {
    // مربّع 100 بسمك 10 ⇒ 110 بعد التوسعة، ثم ربع دورة لا يغيّر مربّعًا.
    const node = rectNode({
      rect: deviceRect(0, 0, 100, 100),
      stroke: strokeOf(10),
      rotation: Math.PI / 2,
    })
    expectRect(nodeBounds(node), -5, -5, 110, 110)
  })

  it('الدوران يسري على كل الأنواع — دبّوس مدوَّر', () => {
    const node = pinNode({ rotation: Math.PI / 2, stroke: strokeOf(0) })
    // مربّع متمركز على نقطته: دورانه لا يزيحه.
    expectRect(nodeBounds(node), 37, 37, 26, 26)
  })
})

describe('التذكير بـ`WeakMap`', () => {
  it('العقدة نفسها تعطي الكائن نفسه — لا إعادة حساب', () => {
    const node = rectNode()
    const first = nodeBounds(node)
    expect(nodeBounds(node)).toBe(first)
  })

  it('العقدة المعدَّلة عقدة جديدة فتُحسَب من جديد — لا صندوق قديم', () => {
    const node = rectNode()
    const before = nodeBounds(node)
    const moved = { ...node, rect: deviceRect(500, 500, 10, 10) }
    const after = nodeBounds(moved)
    expect(after).not.toBe(before)
    expect(after).toEqual(deviceRect(498, 498, 14, 14))
    // والأصل لم يتغيّر.
    expect(nodeBounds(node)).toBe(before)
  })

  it('عقدتان متساويتان المحتوى تُحسَبان مستقلّتين', () => {
    const a = nodeBounds(rectNode())
    const b = nodeBounds(rectNode())
    expect(b).toEqual(a)
    expect(b).not.toBe(a)
  })

  it('**النتيجة المقيسة لا تُخلَّد**: الخطّ المحمَّل يغيّر القياس', () => {
    const node = textNode()
    let width = 60
    const measure: MeasureBox = () => deviceRect(0, 0, width, 10)

    expect(nodeBounds(node, measure).width).toBe(60)
    width = 90
    // نداء ثانٍ بقياس جديد يرى القياس الجديد، لا ما خُلِّد من الأوّل.
    expect(nodeBounds(node, measure).width).toBe(90)
    // وبلا قياس يرجع التقدير، ولم يتلوّث بأي قياس سابق.
    expectRect(nodeBounds(node), 10, 20, 40, 28)
  })

  it('القياس يتجاوز ما خُلِّد من التقدير', () => {
    const node = textNode()
    const estimated = nodeBounds(node)
    const measured = nodeBounds(node, () => deviceRect(0, 0, 999, 10))
    expect(measured.width).toBe(999)
    // ولا يفسد المخزَّن.
    expect(nodeBounds(node)).toBe(estimated)
  })

  it('القياس يُستدعى للنصّ كلّ مرّة ولا يُستدعى لغير النصّ', () => {
    const measure = vi.fn<MeasureBox>(() => null)
    const text = textNode()
    nodeBounds(text, measure)
    nodeBounds(text, measure)
    expect(measure).toHaveBeenCalledTimes(2)

    measure.mockClear()
    const shapes: SceneNode[] = [rectNode(), lineNode(), pinNode(), freehandNode(), measureNode()]
    for (const shape of shapes) nodeBounds(shape, measure)
    expect(measure).not.toHaveBeenCalled()
  })
})

describe('`unionBounds`', () => {
  it('بلا عقد يعطي `null` لا صندوقًا صفريًّا', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('عقدة واحدة: صندوقها نفسه', () => {
    const node = rectNode()
    expect(unionBounds([node])).toEqual(nodeBounds(node))
  })

  it('عدّة عقد: اتّحاد الصناديق المرسومة بسمكها', () => {
    const a = rectNode({ rect: deviceRect(0, 0, 10, 10), stroke: strokeOf(0) })
    const b = rectNode({
      id: asNodeId('r2'),
      rect: deviceRect(100, 50, 20, 30),
      stroke: strokeOf(0),
    })
    const c = pinNode({ at: devicePoint(-20, 200), radiusPx: 10, stroke: strokeOf(0) })
    // x: -30..120 ، y: 0..210.
    expect(unionBounds([a, b, c])).toEqual(deviceRect(-30, 0, 150, 210))
  })

  it('الترتيب لا يغيّر الاتّحاد', () => {
    const a = rectNode({ rect: deviceRect(0, 0, 10, 10) })
    const b = lineNode()
    expect(unionBounds([a, b])).toEqual(unionBounds([b, a]))
  })

  it('القياس المحقون يمرّ إلى العقد النصّية', () => {
    const measure: MeasureBox = () => deviceRect(0, 0, 500, 40)
    const text = textNode({ at: devicePoint(0, 0) })
    const box = rectNode({ rect: deviceRect(10, 10, 5, 5), stroke: strokeOf(0) })
    expect(unionBounds([text, box], measure)).toEqual(deviceRect(0, 0, 500, 40))
  })
})
