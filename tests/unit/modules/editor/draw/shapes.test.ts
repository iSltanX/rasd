import { describe, expect, it, vi } from 'vitest'

import { identityCamera, type Camera } from '@/modules/editor/camera'
import { drawNode, type DrawContext } from '@/modules/editor/draw/shapes'
import { type RenderStyle } from '@/modules/editor/renderer'
import {
  asNodeId,
  type ArrowNode,
  type EllipseNode,
  type FreehandNode,
  type LineNode,
  type MeasureNode,
  type NoteNode,
  type ObscureMode,
  type PinNode,
  type RectNode,
  type RedactNode,
  type StrokeStyle,
  type TextNode,
} from '@/modules/editor/scene'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { devicePoint, deviceRect } from '@/shared/geometry'

import { createRecordingCtx, type RecordingCtx } from '../../../../helpers/recording-ctx'

/**
 * رسّامو الأشكال بسياقٍ يسجّل النداءات.
 *
 * **ما يُثبَت هنا هو ما يُرسَم لا كيف يبدو:** أيُّ نداء وقع، وبأي إحداثيات، وبأي
 * ترتيب. بيئة الاختبار بلا قماش حقيقي، فالإحداثي الخاطئ لا يكشفه إلّا مسجِّلٌ
 * يقرأ الوسائط — والصنف الأخطر هنا (دوران يُطبَّق مرّتين، حجبٌ يُرسم شفّافًا)
 * لا يُرى بالعين إلّا بعد أن يخرج الملفّ.
 */

const PALETTE = {
  'tool/annotate/solid': '#f0a',
  'tool/capture/solid': '#0fa',
  'tool/inspect/solid': '#a0f',
  'tool/measure/solid': '#af0',
  'tool/compare/solid': '#0af',
  'status/danger/solid': '#f00',
  'status/success/solid': '#0f0',
} as const

const STYLE: RenderStyle = {
  palette: PALETTE,
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#ffaba1',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
}

const stroke = (over: Partial<StrokeStyle> = {}): StrokeStyle => ({
  colorToken: 'tool/annotate/solid',
  widthPx: 3,
  dash: [],
  opacity: 1,
  ...over,
})

const base = { locked: false, rotation: 0, hidden: false } as const

const rectNode = (over: Partial<RectNode> = {}): RectNode => ({
  ...base,
  kind: 'rect',
  id: asNodeId('r'),
  stroke: stroke(),
  rect: deviceRect(10, 20, 100, 50),
  radiusPx: 0,
  fill: 'none',
  ...over,
})

const ellipseNode = (over: Partial<EllipseNode> = {}): EllipseNode => ({
  ...base,
  kind: 'ellipse',
  id: asNodeId('e'),
  stroke: stroke(),
  rect: deviceRect(0, 0, 80, 40),
  fill: 'none',
  ...over,
})

const lineNode = (over: Partial<LineNode> = {}): LineNode => ({
  ...base,
  kind: 'line',
  id: asNodeId('l'),
  stroke: stroke(),
  a: devicePoint(0, 0),
  b: devicePoint(100, 40),
  ...over,
})

const arrowNode = (over: Partial<ArrowNode> = {}): ArrowNode => ({
  ...base,
  kind: 'arrow',
  id: asNodeId('a'),
  stroke: stroke({ dash: [6, 3] }),
  a: devicePoint(0, 0),
  b: devicePoint(100, 0),
  head: 'end',
  headSizePx: 10,
  ...over,
})

const freehandNode = (over: Partial<FreehandNode> = {}): FreehandNode => ({
  ...base,
  kind: 'freehand',
  id: asNodeId('f'),
  stroke: stroke(),
  points: [0, 0, 10, 10, 20, 0, 30, 10],
  closed: false,
  epsilon: 1,
  ...over,
})

const pinNode = (over: Partial<PinNode> = {}): PinNode => ({
  ...base,
  kind: 'pin',
  id: asNodeId('p'),
  stroke: stroke({ opacity: 0.8 }),
  at: devicePoint(50, 60),
  shape: 'circle',
  ordinal: 3,
  noteId: null,
  radiusPx: 10,
  ...over,
})

const redactNode = (mode: ObscureMode = 'cover', over: Partial<RedactNode> = {}): RedactNode => ({
  kind: 'redact',
  id: asNodeId('x'),
  locked: false,
  rotation: 0,
  stroke: stroke({ opacity: 0.3 }),
  rect: deviceRect(20, 30, 60, 40),
  mode,
  strength: 8,
  coverToken: 'status/danger/solid',
  ...over,
})

const font = { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 } as const

const textNode = (): TextNode => ({
  ...base,
  kind: 'text',
  id: asNodeId('t'),
  stroke: stroke(),
  at: devicePoint(5, 5),
  text: 'مرحبا',
  font,
  maxWidthPx: 0,
  align: 'start',
  dir: 'auto',
})

const noteNode = (): NoteNode => ({
  ...base,
  kind: 'note',
  id: asNodeId('n'),
  stroke: stroke(),
  at: devicePoint(5, 5),
  widthPx: 200,
  title: 'عنوان',
  body: 'شرح',
  tag: null,
  font,
  paddingPx: 8,
  pinId: null,
})

const measureNode = (over: Partial<MeasureNode> = {}): MeasureNode => ({
  ...base,
  kind: 'measure',
  id: asNodeId('m'),
  stroke: stroke({ widthPx: 1 }),
  a: deviceRect(10, 10, 40, 20),
  b: null,
  show: 'size',
  ...over,
})

function setup(over: Partial<DrawContext> = {}): { ctx: RecordingCtx; d: DrawContext } {
  const ctx = createRecordingCtx()
  const d: DrawContext = {
    ctx,
    style: STYLE,
    camera: identityCamera,
    dpr: 1,
    interacting: false,
    ...over,
  }
  return { ctx, d }
}

const callsNamed = (ctx: RecordingCtx, name: string) => ctx.calls.filter((c) => c.name === name)

// ═════════════════════════════ المستطيل ═════════════════════════════

describe('المستطيل', () => {
  it('المفرَّغ يُخطَّط ولا يُملأ، ونمط الخطّ يُضبَط داخل save/restore', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode({ stroke: stroke({ colorToken: 'tool/capture/solid', widthPx: 5 }) }))

    expect(ctx.names()).toEqual(['save', 'setLineDash', 'beginPath', 'rect', 'stroke', 'restore'])
    expect(callsNamed(ctx, 'rect')[0]?.args).toEqual([10, 20, 100, 50])
    expect(ctx.assigned('strokeStyle')).toEqual(['#0fa'])
    expect(ctx.assigned('lineWidth')).toEqual([5])
    expect(ctx.assigned('lineCap')).toEqual(['round'])
  })

  it('**المملوء يُملأ ولا يُخطَّط** — وإلّا بقي داخله شفّافًا', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode({ fill: 'solid' }))
    expect(ctx.names()).toContain('fill')
    expect(ctx.names()).not.toContain('stroke')
  })

  it('نصف القطر الموجب يستعمل `roundRect` بدل `rect`', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode({ radiusPx: 12 }))
    expect(callsNamed(ctx, 'roundRect')[0]?.args).toEqual([10, 20, 100, 50, 12])
    expect(ctx.names()).not.toContain('rect')
  })

  it('**الأبعاد السالبة تُسوّى** — سحبٌ من اليمين إلى اليسار يرسم في الموضع نفسه', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode({ rect: deviceRect(100, 100, -40, -20) }))
    expect(callsNamed(ctx, 'rect')[0]?.args).toEqual([60, 80, 40, 20])
  })

  it('**الدوران حول المركز مرّةً واحدة** — تحويل ثمّ رسمٌ بإحداثيات غير مدوَّرة ثمّ استعادة', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode({ rotation: Math.PI / 6 }))

    // المركز (60,45): translate(c) · rotate · translate(-c) ثمّ المسار.
    expect(ctx.names()).toEqual([
      'save',
      'setLineDash',
      'save',
      'translate',
      'rotate',
      'translate',
      'beginPath',
      'rect',
      'stroke',
      'restore',
      'restore',
    ])
    expect(callsNamed(ctx, 'translate').map((c) => c.args)).toEqual([
      [60, 45],
      [-60, -45],
    ])
    expect(callsNamed(ctx, 'rotate')[0]?.args).toEqual([Math.PI / 6])
    // والمستطيل نفسه بإحداثياته الأصلية لا مدوَّرًا يدويًّا.
    expect(callsNamed(ctx, 'rect')[0]?.args).toEqual([10, 20, 100, 50])
  })

  it('بلا دوران لا `translate` ولا `rotate` أصلًا', () => {
    const { ctx, d } = setup()
    drawNode(d, rectNode())
    expect(ctx.names()).not.toContain('rotate')
    expect(ctx.names()).not.toContain('translate')
  })
})

// ═════════════════════════════ القطع الناقص ═════════════════════════════

describe('القطع الناقص', () => {
  it('الدوران معامل في `ellipse` نفسها لا تحويلٌ للسياق', () => {
    const { ctx, d } = setup()
    drawNode(d, ellipseNode({ rotation: 0.5 }))
    expect(callsNamed(ctx, 'ellipse')[0]?.args).toEqual([40, 20, 40, 20, 0.5, 0, Math.PI * 2])
    expect(ctx.names()).not.toContain('rotate')
  })

  it('المملوء يُملأ والمفرَّغ يُخطَّط', () => {
    const solid = setup()
    drawNode(solid.d, ellipseNode({ fill: 'solid' }))
    expect(solid.ctx.names()).toContain('fill')
    expect(solid.ctx.names()).not.toContain('stroke')

    const hollow = setup()
    drawNode(hollow.d, ellipseNode())
    expect(hollow.ctx.names()).toContain('stroke')
    expect(hollow.ctx.names()).not.toContain('fill')
  })

  it('والأبعاد السالبة تُسوّى قبل حساب المركز ونصفَي القطر', () => {
    const { ctx, d } = setup()
    drawNode(d, ellipseNode({ rect: deviceRect(80, 40, -80, -40) }))
    expect(callsNamed(ctx, 'ellipse')[0]?.args.slice(0, 4)).toEqual([40, 20, 40, 20])
  })
})

// ═════════════════════════════ الخطّ والسهم ═════════════════════════════

describe('الخطّ', () => {
  it('قطعة واحدة من `a` إلى `b`', () => {
    const { ctx, d } = setup()
    drawNode(d, lineNode())
    expect(callsNamed(ctx, 'moveTo')[0]?.args).toEqual([0, 0])
    expect(callsNamed(ctx, 'lineTo')[0]?.args).toEqual([100, 40])
    expect(callsNamed(ctx, 'stroke')).toHaveLength(1)
  })

  it('**والدوران حول منتصف القطعة** لا حول الأصل', () => {
    const { ctx, d } = setup()
    drawNode(d, lineNode({ rotation: 1 }))
    expect(callsNamed(ctx, 'translate').map((c) => c.args)).toEqual([
      [50, 20],
      [-50, -20],
    ])
    expect(callsNamed(ctx, 'rotate')[0]?.args).toEqual([1])
  })
})

describe('السهم', () => {
  it('**الرأس مملوء بخطٍّ متّصل** — النمط المتقطّع يُصفَّر قبله', () => {
    const { ctx, d } = setup()
    drawNode(d, arrowNode())

    // الجذع بنمط المستخدم [6,3]، ثمّ [] للرأس كي لا يظهر مثلّثٌ متقطّع.
    expect(callsNamed(ctx, 'setLineDash').map((c) => c.args[0])).toEqual([[6, 3], []])
    expect(callsNamed(ctx, 'fill')).toHaveLength(1)
    expect(callsNamed(ctx, 'closePath')).toHaveLength(1)
  })

  it('رأس واحد عند `b` بالزاوية ±0.45 راديان حول اتّجاه الجذع', () => {
    const { ctx, d } = setup()
    drawNode(d, arrowNode())

    // بعد جذعٍ من (0,0) إلى (100,0): الرأس يبدأ من القمّة (100,0).
    const moves = callsNamed(ctx, 'moveTo').map((c) => c.args)
    expect(moves).toEqual([
      [0, 0],
      [100, 0],
    ])
    const lines = callsNamed(ctx, 'lineTo').map((c) => c.args as number[])
    // lineTo الأوّل للجذع، والثاني والثالث للجناحين.
    expect(lines).toHaveLength(3)
    const [wing1, wing2] = [lines[1]!, lines[2]!]
    expect(wing1[0]).toBeCloseTo(100 - 10 * Math.cos(-0.45), 9)
    expect(wing1[1]).toBeCloseTo(-10 * Math.sin(-0.45), 9)
    expect(wing2[0]).toBeCloseTo(100 - 10 * Math.cos(0.45), 9)
    expect(wing2[1]).toBeCloseTo(-10 * Math.sin(0.45), 9)
  })

  it('**`both` يضيف رأسًا ثانيًا عند `a`** بالاتّجاه المعاكس', () => {
    const { ctx, d } = setup()
    drawNode(d, arrowNode({ head: 'both' }))

    expect(callsNamed(ctx, 'fill')).toHaveLength(2)
    expect(callsNamed(ctx, 'closePath')).toHaveLength(2)
    // الرأس الثاني قمّته عند الذيل (0,0).
    expect(callsNamed(ctx, 'moveTo').map((c) => c.args)).toEqual([
      [0, 0],
      [100, 0],
      [0, 0],
    ])
    // واتّجاهه معاكس فجناحاه على يمين القمّة لا يسارها.
    const wing = callsNamed(ctx, 'lineTo')[3]?.args as number[]
    expect(wing[0]).toBeGreaterThan(0)
  })

  it('والدوران حول منتصف الجذع كالخطّ', () => {
    const { ctx, d } = setup()
    drawNode(d, arrowNode({ rotation: 0.3, b: devicePoint(100, 20) }))
    expect(callsNamed(ctx, 'translate').map((c) => c.args)).toEqual([
      [50, 10],
      [-50, -10],
    ])
  })
})

// ═════════════════════════════ المسار الحرّ ═════════════════════════════

describe('المسار الحرّ', () => {
  it('**أقلّ من نقطتين لا يُرسم أبدًا** — لا حتى `save`', () => {
    const { ctx, d } = setup()
    drawNode(d, freehandNode({ points: [] }))
    drawNode(d, freehandNode({ points: [4, 5] }))
    expect(ctx.calls).toHaveLength(0)
  })

  it('نقطتان: انطلاقٌ ثمّ خطّ مستقيم، بلا منحنيات', () => {
    const { ctx, d } = setup()
    drawNode(d, freehandNode({ points: [1, 2, 30, 40] }))
    expect(callsNamed(ctx, 'moveTo')[0]?.args).toEqual([1, 2])
    expect(callsNamed(ctx, 'lineTo')[0]?.args).toEqual([30, 40])
    expect(callsNamed(ctx, 'quadraticCurveTo')).toHaveLength(0)
  })

  it('**كل نقطة وسطى نقطةُ تحكّم، ونهايتُه منتصفُ القطعة التالية**', () => {
    const { ctx, d } = setup()
    drawNode(d, freehandNode())

    // النقاط: (0,0) (10,10) (20,0) (30,10).
    expect(callsNamed(ctx, 'quadraticCurveTo').map((c) => c.args)).toEqual([
      [10, 10, 15, 5],
      [20, 0, 25, 5],
    ])
    // ويُختم الخطّ بالنقطة الأخيرة نفسها كي لا يقصر المسار عن آخر استشعار.
    expect(callsNamed(ctx, 'lineTo')[0]?.args).toEqual([30, 10])
  })

  it('المغلق يُقفَل قبل التخطيط، والمفتوح لا', () => {
    const closed = setup()
    drawNode(closed.d, freehandNode({ closed: true }))
    const names = closed.ctx.names()
    expect(names).toContain('closePath')
    expect(names.indexOf('closePath')).toBeLessThan(names.indexOf('stroke'))

    const open = setup()
    drawNode(open.d, freehandNode())
    expect(open.ctx.names()).not.toContain('closePath')
  })
})

// ═════════════════════════════ الدبّوس ═════════════════════════════

describe('الدبّوس', () => {
  it('الدائرة: `arc` كاملة حول المركز، مع ظلّ الفصل والشفافية من الخطّ', () => {
    const { ctx, d } = setup()
    drawNode(d, pinNode())

    expect(callsNamed(ctx, 'arc')[0]?.args).toEqual([50, 60, 10, 0, Math.PI * 2])
    expect(ctx.assigned('globalAlpha')[0]).toBe(0.8)
    expect(ctx.assigned('shadowBlur')).toEqual([4])
    expect(ctx.assigned('shadowOffsetY')).toEqual([1])
    expect(ctx.assigned('fillStyle')[0]).toBe('#f0a')
  })

  it('المربّع: `roundRect` بنصف قطر 0.35 من نصف القطر', () => {
    const { ctx, d } = setup()
    drawNode(d, pinNode({ shape: 'square' }))
    const [x, y, w, h, r] = callsNamed(ctx, 'roundRect')[0]!.args as number[]
    expect([x, y, w, h]).toEqual([40, 50, 20, 20])
    expect(r).toBeCloseTo(3.5, 9)
    expect(ctx.names()).not.toContain('arc')
  })

  it('**الدبّوس المدبَّب: قوس ثمّ ذيلٌ لأسفل بمقدار 1.9 نصف قطر ثمّ إغلاق**', () => {
    const { ctx, d } = setup()
    drawNode(d, pinNode({ shape: 'pin' }))

    expect(callsNamed(ctx, 'arc')[0]?.args).toEqual([50, 60, 10, Math.PI * 0.85, Math.PI * 0.15])
    expect(callsNamed(ctx, 'lineTo')[0]?.args).toEqual([50, 60 + 19])
    expect(callsNamed(ctx, 'closePath')).toHaveLength(1)
  })

  it('**رقمه بأرقام هندية** — عدٌّ بشري لا قياس', () => {
    const { ctx, d } = setup()
    drawNode(d, pinNode({ ordinal: 3 }))

    const text = callsNamed(ctx, 'fillText')
    expect(text).toHaveLength(1)
    expect(text[0]?.args).toEqual(['٣', 50, 60])
    // وفي وسط القرص لا على خطّ الأساس.
    expect(ctx.assigned('textBaseline')).toEqual(['middle'])
    expect(ctx.assigned('textAlign')).toEqual(['center'])
  })

  it('ورقم الدبّوس معتم مهما كانت شفافية القرص', () => {
    const { ctx, d } = setup()
    drawNode(d, pinNode({ stroke: stroke({ opacity: 0.2 }) }))
    // القرص بـ0.2 ثمّ الرقم بـ1 — الرقم لا يخفت مع قرصه.
    expect(ctx.assigned('globalAlpha')).toEqual([0.2, 1])
  })
})

// ═════════════════════════════ الحجب ═════════════════════════════

describe('الحجب في العرض', () => {
  it('**التغطية معتمة قسرًا** ومرشّح السياق `none`، بلون غطائها من اللوحة', () => {
    const { ctx, d } = setup()
    drawNode(d, redactNode('cover'))

    // الشفافية 0.3 في الخطّ **لا تُحترَم**.
    expect(ctx.assigned('globalAlpha')).toEqual([1])
    expect(ctx.assigned('filter')).toEqual(['none'])
    expect(ctx.assigned('fillStyle')).toEqual(['#f00'])
    expect(callsNamed(ctx, 'fillRect')[0]?.args).toEqual([20, 30, 60, 40])
    expect(ctx.names()).not.toContain('drawImage')
  })

  it('**والتغطية لا تستدعي مزوِّد الرقعة أصلًا** — لا مسار يقرأ بكسلاتها', () => {
    const redactPatch = vi.fn(() => null)
    const { ctx, d } = setup({ redactPatch })
    drawNode(d, redactNode('cover'))
    expect(redactPatch).not.toHaveBeenCalled()
    expect(callsNamed(ctx, 'fillRect')).toHaveLength(1)
  })

  it('الحدّ المتقطّع مقسوم على التكبير كي يبقى بسمكه على الشاشة', () => {
    const camera: Camera = { zoom: 2, tx: 0, ty: 0 }
    const { ctx, d } = setup({ camera })
    drawNode(d, redactNode('cover'))

    expect(ctx.assigned('strokeStyle')).toEqual(['#ffaba1'])
    expect(ctx.assigned('lineWidth')).toEqual([0.75])
    expect(callsNamed(ctx, 'setLineDash')[0]?.args).toEqual([[2, 1.5]])
    // الإطار أوسع من المستطيل بهامش 2 من كل جانب.
    expect(callsNamed(ctx, 'rect')[0]?.args).toEqual([18, 28, 64, 44])
  })

  it('**الطمس بلا رقعة جاهزة يتحوّل إلى تغطية معتمة** — فشلٌ مغلق لا بكسلات خام', () => {
    for (const mode of ['pixelate', 'blur'] as const) {
      const { ctx, d } = setup()
      drawNode(d, redactNode(mode))
      expect(callsNamed(ctx, 'fillRect')).toHaveLength(1)
      expect(ctx.names()).not.toContain('drawImage')
    }
  })

  it('ومزوِّدٌ يُرجع `null` كغيابه تمامًا', () => {
    const redactPatch = vi.fn(() => null)
    const { ctx, d } = setup({ redactPatch })
    drawNode(d, redactNode('blur'))
    expect(redactPatch).toHaveBeenCalledTimes(1)
    expect(callsNamed(ctx, 'fillRect')).toHaveLength(1)
    expect(ctx.names()).not.toContain('drawImage')
  })

  it('**الرقعة الجاهزة تُرسم وجهتُها وحدها** إلى مستطيل الحجب، لا التغطية', () => {
    const image = {} as unknown as CanvasImageSource
    const node = redactNode('blur')
    const redactPatch = vi.fn(() => ({ image, plan: { dest: { x: 4, y: 6, w: 30, h: 20 } } }))
    const { ctx, d } = setup({ redactPatch })
    drawNode(d, node)

    expect(redactPatch).toHaveBeenCalledWith(node)
    expect(callsNamed(ctx, 'drawImage')[0]?.args).toEqual([image, 4, 6, 30, 20, 20, 30, 60, 40])
    expect(ctx.assigned('imageSmoothingEnabled')).toEqual([true])
    // لا غطاء يُرسم تحتها.
    expect(callsNamed(ctx, 'fillRect')).toHaveLength(0)
    // والإطار المتقطّع يبقى.
    expect(callsNamed(ctx, 'stroke')).toHaveLength(1)
  })

  it('والأبعاد السالبة تُسوّى في الغطاء والإطار معًا', () => {
    const { ctx, d } = setup()
    drawNode(d, redactNode('cover', { rect: deviceRect(80, 70, -60, -40) }))
    expect(callsNamed(ctx, 'fillRect')[0]?.args).toEqual([20, 30, 60, 40])
  })
})

// ═════════════════════════════ النصّ والملاحظة والقياس ═════════════════════════════

describe('العقد النصّية', () => {
  const measure = (line: string): number => line.length * 10

  it('**بلا ذاكرة تخطيط لا يُرسم نصّ ولا ملاحظة** — أبعادٌ مقدَّرة أسوأ من لا شيء', () => {
    const { ctx, d } = setup()
    drawNode(d, textNode())
    drawNode(d, noteNode())
    expect(ctx.calls).toHaveLength(0)
  })

  it('ومعها يُرسم النصّ سطرًا بنداء `fillText` واحد', () => {
    const { ctx, d } = setup({ layout: createTextLayoutCache(measure) })
    drawNode(d, textNode())
    expect(callsNamed(ctx, 'fillText')).toHaveLength(1)
    expect(callsNamed(ctx, 'fillText')[0]?.args[0]).toBe('مرحبا')
  })

  it('وتُرسم الملاحظة بطاقةً ونصًّا', () => {
    const { ctx, d } = setup({ layout: createTextLayoutCache(measure) })
    drawNode(d, noteNode())
    expect(callsNamed(ctx, 'roundRect')).toHaveLength(1)
    expect(callsNamed(ctx, 'fillText').map((c) => c.args[0])).toEqual(['عنوان', 'شرح'])
  })
})

describe('القياس', () => {
  it('يُفوَّض إلى رسّام القياس — إطارٌ حول المستطيل ورقمٌ بوحدات CSS لا ببكسلات الصورة', () => {
    const { ctx, d } = setup({ dpr: 2 })
    drawNode(d, measureNode())

    expect(callsNamed(ctx, 'rect')[0]?.args).toEqual([10, 10, 40, 20])
    // كثافة اللقطة 2 ⇒ 40 بكسل صورة تُعرَض `20px`.
    expect(callsNamed(ctx, 'fillText')[0]?.args[0]).toBe('20px × 10px')
  })
})
