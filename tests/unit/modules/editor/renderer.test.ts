import { describe, expect, it } from 'vitest'

import { identityCamera, type Camera } from '@/modules/editor/camera'
import {
  cull,
  dirtyForChange,
  DIRTY_ESCALATION_RATIO,
  drawnIds,
  MAX_DIRTY_RECTS,
  mergeDirty,
  planFrame,
  snapToPixel,
} from '@/modules/editor/render-plan'
import {
  artboardRect,
  disposeLayer,
  fullImageRect,
  paintAnnotations,
  paintBase,
  paintCrop,
  paintSelection,
  type BaseSource,
  type Frame,
  type Layer,
  type RenderStyle,
} from '@/modules/editor/renderer'
import {
  asNodeId,
  type NodeId,
  type RectNode,
  type RedactNode,
  type Scene,
  type SceneNode,
  type TextNode,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { deviceRect, devicePoint } from '@/shared/geometry'

import { createRecordingCtx, type RecordingCtx } from '../../../helpers/recording-ctx'

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 } as const

const style: RenderStyle = {
  palette: {
    'tool/annotate/solid': '#f0a',
    'tool/capture/solid': '#0fa',
    'tool/inspect/solid': '#a0f',
    'tool/measure/solid': '#af0',
    'tool/compare/solid': '#0af',
    'status/danger/solid': '#f00',
    'status/success/solid': '#0f0',
  },
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#ffaba1',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
}

const rect = (
  id: string,
  box = deviceRect(10, 10, 100, 50),
  over: Partial<RectNode> = {},
): RectNode => ({
  kind: 'rect',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  rect: box,
  radiusPx: 0,
  fill: 'none',
  ...over,
})

const redact = (id: string, box = deviceRect(0, 0, 40, 20)): RedactNode => ({
  kind: 'redact',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  stroke,
  rect: box,
  mode: 'cover',
  strength: 0,
  coverToken: 'status/danger/solid',
})

const sceneWith = (nodes: SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: 1000, height: 800, dpr: 2 }),
  nodes,
})

const stage = { cssWidth: 1000, cssHeight: 800, dpr: 2 }

function layerOf(ctx: RecordingCtx): Layer {
  return { ctx, cssWidth: 1000, cssHeight: 800, backingScale: 2 }
}

function frameOf(scene: Scene, over: Partial<Frame> = {}): Frame {
  return {
    scene,
    camera: identityCamera,
    selection: new Set<NodeId>(),
    style,
    interacting: false,
    ...over,
  }
}

const src: BaseSource = {
  bitmap: {} as unknown as CanvasImageSource,
  width: 1000,
  height: 800,
}

// ═════════════════════════ خطّة الإطار ═════════════════════════

describe('اندماج المناطق المتّسخة', () => {
  it('**المتقاطعان يندمجان** — وإلّا رُسم ما بينهما مرّتين فأظلمت الشفافية', () => {
    const merged = mergeDirty([deviceRect(0, 0, 100, 100), deviceRect(50, 50, 100, 100)])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(deviceRect(0, 0, 150, 150))
  })

  it('المنفصلان يبقيان اثنين', () => {
    expect(mergeDirty([deviceRect(0, 0, 10, 10), deviceRect(500, 500, 10, 10)])).toHaveLength(2)
  })

  it('الصفري يُهمَل', () => {
    expect(mergeDirty([deviceRect(0, 0, 0, 0)])).toHaveLength(0)
  })

  it('ما زاد على السقف يُضمّ — كل مستطيل يكلّف قصًّا مستقلًّا', () => {
    const many = Array.from({ length: 20 }, (_, i) => deviceRect(i * 100, 0, 10, 10))
    expect(mergeDirty(many).length).toBeLessThanOrEqual(MAX_DIRTY_RECTS)
  })
})

describe('الترشيح', () => {
  it('يستبعد ما يقع خارج المرئي', () => {
    const scene = sceneWith([rect('in'), rect('out', deviceRect(5000, 5000, 10, 10))])
    const { nodes, culled } = cull(scene, deviceRect(0, 0, 1000, 800))
    expect(nodes.map((n) => n.id)).toEqual(['in'])
    expect(culled).toBe(1)
  })

  it('يستبعد المخفيّ', () => {
    const scene = sceneWith([rect('h', deviceRect(10, 10, 10, 10), { hidden: true })])
    expect(cull(scene, deviceRect(0, 0, 1000, 800)).nodes).toHaveLength(0)
  })

  it('**ولا يستبعد الحجب أبدًا** — لا يملك حقل إخفاء أصلًا', () => {
    const scene = sceneWith([redact('r')])
    expect(cull(scene, deviceRect(0, 0, 1000, 800)).nodes).toHaveLength(1)
  })
})

describe('اختيار وضع الإطار', () => {
  const scene = sceneWith([rect('a'), rect('b', deviceRect(500, 500, 20, 20))])

  it('بلا مناطق متّسخة ⇒ كامل', () => {
    expect(planFrame({ scene, camera: identityCamera, stage }).mode).toBe('full')
  })

  it('تغيّر الكاميرا يفرض الكامل', () => {
    const plan = planFrame({
      scene,
      camera: identityCamera,
      stage,
      dirty: [deviceRect(0, 0, 10, 10)],
      forceFull: true,
    })
    expect(plan.mode).toBe('full')
  })

  it('منطقة صغيرة ⇒ جزئي، **والعقد المرسومة هي المتقاطعة وحدها**', () => {
    const plan = planFrame({
      scene,
      camera: identityCamera,
      stage,
      dirty: [deviceRect(0, 0, 60, 60)],
    })
    expect(plan.mode).toBe('partial')
    expect(drawnIds(plan)).toEqual(['a'])
  })

  it('**منطقة تتجاوز النسبة ⇒ يسقط إلى الكامل**', () => {
    const half = Math.sqrt(DIRTY_ESCALATION_RATIO) * 1000
    const plan = planFrame({
      scene,
      camera: identityCamera,
      stage,
      dirty: [deviceRect(0, 0, half + 50, 800)],
    })
    expect(plan.mode).toBe('full')
  })
})

describe('مناطق التغيير', () => {
  it('**الصندوقان معًا: قبل وبعد**', () => {
    const before = rect('a', deviceRect(0, 0, 50, 50))
    const after = rect('a', deviceRect(500, 0, 50, 50))
    const dirty = dirtyForChange(before, after)
    expect(dirty).toHaveLength(2)
    // بلا صندوق «قبل» يبقى شبح العقدة في موضعها السابق.
    expect(dirty[0]?.x).toBeLessThan(dirty[1]?.x ?? 0)
  })

  it('الإضافة صندوق واحد، والحذف صندوق واحد', () => {
    expect(dirtyForChange(null, rect('a'))).toHaveLength(1)
    expect(dirtyForChange(rect('a'), null)).toHaveLength(1)
  })

  it('التقريب إلى بكسل يوسّع لا يضيّق', () => {
    const snapped = snapToPixel(deviceRect(10.4, 10.6, 5.2, 5.1))
    expect(snapped.x).toBe(10)
    expect(snapped.x + snapped.width).toBeGreaterThanOrEqual(15.6)
  })
})

// ═════════════════════════ المُصيِّر ═════════════════════════

describe('طبقة الأساس', () => {
  it('نداء `drawImage` واحد بأبعاد الصورة', () => {
    const ctx = createRecordingCtx()
    paintBase(layerOf(ctx), src, frameOf(sceneWith([])))
    const draws = ctx.calls.filter((c) => c.name === 'drawImage')
    expect(draws).toHaveLength(1)
    expect(draws[0]?.args.slice(1)).toEqual([0, 0, 1000, 800])
  })

  it('والاقتصاص يقصّ المصدر والوجهة معًا', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([])
    const cropped: Scene = { ...scene, meta: { ...scene.meta, crop: deviceRect(10, 20, 100, 50) } }
    paintBase(layerOf(ctx), src, frameOf(cropped))
    const draw = ctx.calls.find((c) => c.name === 'drawImage')
    expect(draw?.args).toHaveLength(9)
  })

  it('**كثافة المخزن تدخل في `setTransform` وحدها**', () => {
    const ctx = createRecordingCtx()
    const camera: Camera = { zoom: 2, tx: 10, ty: 20 }
    paintBase(layerOf(ctx), src, frameOf(sceneWith([]), { camera }))
    const sets = ctx.calls.filter((c) => c.name === 'setTransform')
    // الأولى تصفير قبل المسح، والثانية تحويل الإطار.
    expect(sets[1]?.args).toEqual([4, 0, 0, 4, 20, 40])
  })
})

describe('طبقة التعليقات', () => {
  it('ترسم العقد بترتيبها', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a'), rect('b', deviceRect(200, 200, 50, 50))])
    const plan = planFrame({ scene, camera: identityCamera, stage })
    const stats = paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    expect(stats.drawn).toBe(2)
    expect(ctx.calls.filter((c) => c.name === 'stroke').length).toBeGreaterThanOrEqual(2)
  })

  it('**الوضع الجزئي يقصّ ثم يستعيد**', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a')])
    const plan = planFrame({
      scene,
      camera: identityCamera,
      stage,
      dirty: [deviceRect(0, 0, 60, 60)],
    })
    expect(plan.mode).toBe('partial')
    paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    expect(ctx.names()).toContain('clip')
    // القصّ محاط بـ`save`/`restore` وإلّا سرى على الإطار التالي.
    expect(ctx.names().filter((n) => n === 'save').length).toBeGreaterThanOrEqual(1)
    expect(ctx.names().filter((n) => n === 'restore').length).toBeGreaterThanOrEqual(1)
  })

  it('والوضع الكامل بلا قصّ', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a')])
    const plan = planFrame({ scene, camera: identityCamera, stage })
    paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    expect(ctx.names()).not.toContain('clip')
  })
})

describe('**`filter` لا تُضبَط إلّا على `none`**', () => {
  /*
   * الحدّ الأمني في صورة اختبار: المعاينة والخبز يجب أن يستعملا مُحرِّك
   * تمويه واحدًا، وإلّا ضبط المستخدم الشدّة على ما يراه وصُدِّر شيء آخر.
   * ولو تسلّل `ctx.filter = 'blur(8px)'` إلى مسار العرض يومًا، يسقط هذا.
   */
  it('في طبقة الأساس', () => {
    const ctx = createRecordingCtx()
    paintBase(layerOf(ctx), src, frameOf(sceneWith([])))
    expect(new Set(ctx.assigned('filter'))).toEqual(new Set(['none']))
  })

  it('وفي طبقة التعليقات مع حجب ومسار حرّ وسهم', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([
      rect('a'),
      redact('r'),
      {
        kind: 'arrow',
        id: asNodeId('ar'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        a: devicePoint(0, 0),
        b: devicePoint(80, 80),
        head: 'both',
        headSizePx: 10,
      },
      {
        kind: 'freehand',
        id: asNodeId('f'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        points: [0, 0, 10, 10, 20, 5, 30, 15],
        closed: false,
        epsilon: 1,
      },
    ])
    const plan = planFrame({ scene, camera: identityCamera, stage })
    paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    expect(new Set(ctx.assigned('filter'))).toEqual(new Set(['none']))
  })
})

describe('الحجب في العرض', () => {
  it('**معتم قسرًا** — الشفافية المطلوبة لا تُحترَم', () => {
    const ctx = createRecordingCtx()
    const node: RedactNode = { ...redact('r'), stroke: { ...stroke, opacity: 0.3 } }
    const scene = sceneWith([node])
    const plan = planFrame({ scene, camera: identityCamera, stage })
    paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    // آخر قيمة أُسنِدت قبل التعبئة هي 1، لا 0.3.
    expect(ctx.assigned('globalAlpha')).toContain(1)
    expect(ctx.assigned('globalAlpha')).not.toContain(0.3)
  })

  it('ويُحاط بحدّ متقطّع يميّزه عن مستطيل مرسوم', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([redact('r')])
    const plan = planFrame({ scene, camera: identityCamera, stage })
    paintAnnotations(layerOf(ctx), plan, frameOf(scene))
    const dashes = ctx.calls.filter((c) => c.name === 'setLineDash')
    expect(dashes.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).length > 0)).toBe(
      true,
    )
  })
})

describe('التحديد', () => {
  it('بلا تحديد لا يُرسم شيء', () => {
    const ctx = createRecordingCtx()
    paintSelection(layerOf(ctx), frameOf(sceneWith([rect('a')])))
    expect(ctx.calls).toHaveLength(0)
  })

  it('عقدة واحدة ⇒ إطار وثمانية مقابض', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a')])
    paintSelection(layerOf(ctx), frameOf(scene, { selection: new Set([asNodeId('a')]) }))
    expect(ctx.calls.filter((c) => c.name === 'fillRect')).toHaveLength(8)
  })

  it('**عقدتان ⇒ إطاران بلا مقابض** — ثمانية لكلٍّ ضجيج لا أداة', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a'), rect('b', deviceRect(300, 300, 40, 40))])
    paintSelection(
      layerOf(ctx),
      frameOf(scene, { selection: new Set([asNodeId('a'), asNodeId('b')]) }),
    )
    expect(ctx.calls.filter((c) => c.name === 'fillRect')).toHaveLength(0)
    expect(ctx.calls.filter((c) => c.name === 'stroke')).toHaveLength(2)
  })

  it('**سمك خطّ التحديد ثابت على الشاشة** — يُقسَم على التكبير', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a')])
    paintSelection(
      layerOf(ctx),
      frameOf(scene, { selection: new Set([asNodeId('a')]), camera: { zoom: 4, tx: 0, ty: 0 } }),
    )
    expect(ctx.assigned('lineWidth')).toContain(1.5 / 4)
  })
})

describe('التحديد — العقد غير المحدَّدة', () => {
  it('**لا يُرسم إطار ولا مقابض إلّا للمحدَّد** وإن وُجدت عقدٌ أخرى في المشهد', () => {
    const ctx = createRecordingCtx()
    const scene = sceneWith([rect('a'), rect('b', deviceRect(300, 300, 40, 40))])
    paintSelection(layerOf(ctx), frameOf(scene, { selection: new Set([asNodeId('b')]) }))

    // إطارٌ واحد لـ`b` وحده، وثمانية مقابض لأن المحدَّد واحد.
    expect(ctx.calls.filter((c) => c.name === 'stroke')).toHaveLength(1)
    expect(ctx.calls.filter((c) => c.name === 'fillRect')).toHaveLength(8)
    // الإطار على صندوق `b` (40×40 عند 300,300) لا على `a` — بعد توسعة السمك.
    const frameBox = ctx.calls.find((c) => c.name === 'rect')?.args as number[]
    expect(frameBox[0]).toBeGreaterThan(290)
  })

  it('ومعرّفٌ لا يقابل عقدة في المشهد لا يرسم شيئًا سوى إعداد السياق', () => {
    const ctx = createRecordingCtx()
    paintSelection(
      layerOf(ctx),
      frameOf(sceneWith([rect('a')]), { selection: new Set([asNodeId('ghost')]) }),
    )
    expect(ctx.calls.filter((c) => c.name === 'stroke')).toHaveLength(0)
    expect(ctx.calls.filter((c) => c.name === 'fillRect')).toHaveLength(0)
    // ويُستعاد السياق رغم ذلك.
    expect(ctx.names().at(-1)).toBe('restore')
  })
})

describe('طبقة التعليقات — ما يُمرَّر إلى الرسّامين', () => {
  const textNode = (): TextNode => ({
    kind: 'text',
    id: asNodeId('t'),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(10, 10),
    text: 'مرحبا',
    font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 },
    maxWidthPx: 0,
    align: 'start',
    dir: 'auto',
  })

  it('**بلا ذاكرة تخطيط تُتخطّى العقد النصّية** ومعها تُرسم', () => {
    const scene = sceneWith([textNode()])
    const plan = planFrame({ scene, camera: identityCamera, stage })

    const without = createRecordingCtx()
    paintAnnotations(layerOf(without), plan, frameOf(scene))
    expect(without.names()).not.toContain('fillText')

    const withLayout = createRecordingCtx()
    const layout = createTextLayoutCache((line) => line.length * 10)
    paintAnnotations(layerOf(withLayout), plan, frameOf(scene, { layout }))
    expect(withLayout.calls.filter((c) => c.name === 'fillText')).toHaveLength(1)
  })

  it('**والطمس بلا رقعة يُرسم تغطيةً معتمة، ومعها تُرسم الرقعة** لا التغطية', () => {
    const blur: RedactNode = { ...redact('r'), mode: 'blur', strength: 6 }
    const scene = sceneWith([blur])
    const plan = planFrame({ scene, camera: identityCamera, stage })

    const without = createRecordingCtx()
    paintAnnotations(layerOf(without), plan, frameOf(scene))
    expect(without.calls.filter((c) => c.name === 'fillRect')).toHaveLength(1)
    expect(without.names()).not.toContain('drawImage')

    const patchImage = {} as unknown as CanvasImageSource
    const withPatch = createRecordingCtx()
    paintAnnotations(
      layerOf(withPatch),
      plan,
      frameOf(scene, {
        redactPatch: () => ({ image: patchImage, plan: { dest: { x: 1, y: 2, w: 3, h: 4 } } }),
      }),
    )
    expect(withPatch.calls.find((c) => c.name === 'drawImage')?.args[0]).toBe(patchImage)
    expect(withPatch.names()).not.toContain('fillRect')
  })
})

// ═════════════════════════ الاقتصاص والأدوات المساعدة ═════════════════════════

describe('تحرير الطبقة', () => {
  it('**`width = 0` و`height = 0` يُسقطان مخزن الرسم** فورًا', () => {
    const canvas = { width: 4000, height: 3000 }
    disposeLayer(canvas)
    expect(canvas).toEqual({ width: 0, height: 0 })
  })
})

describe('مستطيلات الصورة', () => {
  it('مستطيل الصورة كاملةً يبدأ من الأصل بأبعاد المصدر', () => {
    expect(fullImageRect(src)).toEqual(deviceRect(0, 0, 1000, 800))
  })

  it('**ومستطيل اللوحة الفنية بفضاء المسرح** — تكبيرٌ ثمّ إزاحة', () => {
    const camera: Camera = { zoom: 0.5, tx: 30, ty: 40 }
    const box = artboardRect(src, camera)
    expect(box.space).toBe('canvas')
    expect([box.x, box.y, box.width, box.height]).toEqual([30, 40, 500, 400])
  })
})

describe('حدود الاقتصاص', () => {
  const cropped = (crop: Scene['meta']['crop']): Scene => {
    const scene = sceneWith([])
    return { ...scene, meta: { ...scene.meta, crop } }
  }

  it('**بلا وضع اقتصاص فعّال لا يُرسم شيء** ولو وُجد اقتصاص محفوظ', () => {
    const ctx = createRecordingCtx()
    paintCrop(layerOf(ctx), frameOf(cropped(deviceRect(10, 20, 100, 50))))
    expect(ctx.calls).toHaveLength(0)
  })

  it('ووضعٌ فعّال بلا اقتصاص بعدُ لا يرسم شيئًا كذلك', () => {
    const ctx = createRecordingCtx()
    paintCrop(layerOf(ctx), frameOf(cropped(null), { cropActive: true }))
    expect(ctx.calls).toHaveLength(0)
  })

  it('**لا يمسح الطبقة** — يُنادى بعد التعليقات فمسحُه يمحو كل ما رُسم', () => {
    const ctx = createRecordingCtx()
    paintCrop(layerOf(ctx), frameOf(cropped(deviceRect(10, 20, 100, 50)), { cropActive: true }))
    expect(ctx.names()).not.toContain('clearRect')
    // التحويل وحده: كاميرا الهوية × كثافة المخزن 2.
    expect(ctx.calls.find((c) => c.name === 'setTransform')?.args).toEqual([2, 0, 0, 2, 0, 0])
    expect(ctx.names()[0]).toBe('save')
    expect(ctx.names().at(-1)).toBe('restore')
  })

  it('الإطار على حدّ الاقتصاص، ثمّ أثلاثٌ خفيفة بنصف شفافية', () => {
    const ctx = createRecordingCtx()
    paintCrop(layerOf(ctx), frameOf(cropped(deviceRect(30, 60, 90, 60)), { cropActive: true }))

    const rects = ctx.calls.filter((c) => c.name === 'rect').map((c) => c.args)
    expect(rects[0]).toEqual([30, 60, 90, 60])

    // خطّان رأسيان وخطّان أفقيان عند الثلث والثلثين.
    const moves = ctx.calls.filter((c) => c.name === 'moveTo').map((c) => c.args)
    expect(moves).toEqual([
      [60, 60],
      [30, 80],
      [90, 60],
      [30, 100],
    ])
    expect(ctx.assigned('globalAlpha')).toEqual([1, 0.35, 1])
    expect(ctx.assigned('filter')).toEqual(['none'])
  })

  it('**ثمانية مقابض بمقاس ثابت على الشاشة** — يُقسَم على التكبير', () => {
    const ctx = createRecordingCtx()
    const camera: Camera = { zoom: 3, tx: 0, ty: 0 }
    paintCrop(
      layerOf(ctx),
      frameOf(cropped(deviceRect(30, 60, 90, 60)), { cropActive: true, camera }),
    )

    // الإطار + مقبضٌ لكل واحد من ثمانية.
    const rects = ctx.calls.filter((c) => c.name === 'rect').map((c) => c.args as number[])
    expect(rects).toHaveLength(1 + 8)
    const size = 9 / 3
    for (const handle of rects.slice(1)) expect(handle[2]).toBe(size)
    // مقبض الركن الشمالي الغربي مركزه على الركن.
    expect(rects[1]).toEqual([30 - size / 2, 60 - size / 2, size, size])
    expect(ctx.calls.filter((c) => c.name === 'fill')).toHaveLength(8)
    // والسمك الرفيع 1 ÷ 3، والإطار الأوّل ضعفه.
    expect(ctx.assigned('lineWidth')).toEqual([2 / 3, 1 / 3, 1 / 3])
  })

  it('والاقتصاص المسحوب عكسيًّا يُسوّى قبل رسم الحدّ', () => {
    const ctx = createRecordingCtx()
    paintCrop(layerOf(ctx), frameOf(cropped(deviceRect(120, 120, -90, -60)), { cropActive: true }))
    expect(ctx.calls.find((c) => c.name === 'rect')?.args).toEqual([30, 60, 90, 60])
  })
})
