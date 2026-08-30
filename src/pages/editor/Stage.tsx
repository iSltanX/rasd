import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { planStageSurface } from '@/modules/editor/budget'
import {
  canvasToImage,
  clampCamera,
  fitCamera,
  panBy,
  zoomAt,
  type Camera,
} from '@/modules/editor/camera'
import { applyPatches } from '@/modules/editor/commands'
import { hitTest } from '@/modules/editor/hit-test'
import { dirtyForChange, planFrame } from '@/modules/editor/render-plan'
import {
  paintAnnotations,
  paintBase,
  paintSelection,
  type BaseSource,
  type Ctx2D,
  type Frame,
  type Layer,
  type RenderStyle,
} from '@/modules/editor/renderer'
import { cssToImage } from '@/modules/editor/scene'
import { addNode, deleteNodes, replaceNodes } from '@/modules/editor/scene-ops'
import { createTextLayoutCache, noteBox, textBox } from '@/modules/editor/text-layout'
import { canvasPoint, type DevicePoint } from '@/shared/geometry'

import { createMeasurer } from './measure'
import { createTextEditSession } from './text-editing'
import { TextEditorOverlay } from './TextEditorOverlay'
import {
  createNode,
  MIN_DRAG_CSS,
  translateNode,
  TOOL_LABEL,
  type ToolName,
  type ToolSettings,
} from './tools'

import type { MeasureBox } from '@/modules/editor/bounds'
import type { History } from '@/modules/editor/history'
import type { NodeId, Scene, SceneNode, TextNode } from '@/modules/editor/scene'
import type { JSX } from 'preact'

export interface StageProps {
  readonly history: History
  readonly source: BaseSource
  readonly style: RenderStyle
  readonly tool: ToolName
  readonly settings: ToolSettings
  readonly selection: ReadonlySet<NodeId>
  readonly onSelectionChange: (next: ReadonlySet<NodeId>) => void
  /** يُستدعى بعد كل تغيير في المشهد — للحفظ التلقائي في الدفعة السابعة. */
  readonly onSceneChange?: (scene: Scene) => void
}

/** حالة إيماءة جارية — خارج الحالة التفاعلية عمدًا، تتغيّر مع كل حركة. */
interface Gesture {
  readonly kind: 'draw' | 'move' | 'pan'
  readonly from: DevicePoint
  readonly startCamera: Camera
  readonly startNodes: readonly SceneNode[]
  points: number[]
  preview: SceneNode | null
  moved: boolean
}

/**
 * المسرح — قماشان وحلقة رسم.
 *
 * **طبقتان لا واحدة:** الصورة الأساسية لا تتغيّر بإضافة سهم فوقها، فرسمها
 * في كل إطار يعني نداء `drawImage` على لقطة 4000×3000 ستّين مرّة في الثانية.
 * والفصل يجعل طبقة الأساس تُعاد عند تغيّر الكاميرا أو الاقتصاص وحدهما.
 *
 * **والقماشان بمقاس المسرح لا بمقاس الصورة** — أقوى قرار في الميزانية:
 * مسرح 1060×839 على لقطة 4000×3000 عند كثافة 2 يعطي 13.6 ميغابايت للطبقة
 * مقابل 45.8 لو كانت بمقاس الصورة. وعلى الحالة القصوى (2560×28,672) يستحيل
 * الثاني أصلًا: 280 ميغابايت لسطح واحد.
 *
 * **والحالة الساخنة في مراجع لا في `useState`**: موضع المؤشِّر يتغيّر ستّين
 * مرّة في الثانية، وكل كتابة حالة تُعيد تركيب الشجرة. الرسم يقع في حلقة
 * `requestAnimationFrame` تقرأ المراجع مباشرةً.
 */
export function Stage(props: StageProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const annoRef = useRef<HTMLCanvasElement>(null)

  const [size, setSize] = useState({ cssWidth: 0, cssHeight: 0 })
  const [editing, setEditing] = useState<NodeId | null>(null)

  /*
   * ذاكرة تخطيط واحدة لعمر المسرح، مربوطة بالعائلة الفعلية.
   *
   * وبناؤها مع كل تصيير يُبطل غرضها: اللفّ يُعاد حسابه لكل عقدة نصّية في كل
   * إطار، وهو أغلى ما في الرسم — نداءُ `measureText` لكل سطر مرشَّح.
   */
  const layout = useMemo(() => {
    const m = createMeasurer(props.style.textFamily)
    return createTextLayoutCache(m.measure, m.measureFont)
  }, [props.style.textFamily])

  /**
   * صندوق العقد النصّية من القياس الحقيقي.
   *
   * **بدونه تُقدَّر أبعاد النصّ بسطر واحد** — والتقدير في `bounds.ts` مكتوب
   * لما قبل جهوز سياق الرسم. قِيس حيًّا: سطرٌ لُفّ إلى ثلاثة أسطر أعطى
   * مستطيل تحديد يغطّي الأوّل وحده، ويترك ثلثي النصّ بلا إصابة ولا مساحة
   * متّسخة — فلا يُعاد رسمه حين يتحرّك ما تحته.
   */
  const measureBox = useMemo<MeasureBox>(
    () => (node) => {
      if (node.kind === 'text') return textBox(node, layout)
      if (node.kind === 'note') return noteBox(node, layout)
      return null
    },
    [layout],
  )

  /*
   * أوّل قياس قد يقع قبل جهوز `Cairo`، فيُجرى بخطّ احتياطي بمقاييس أخرى.
   * والنتيجة تخطيطٌ صحيح الشكل خاطئ الأبعاد **يُخلَّد** في الذاكرة.
   */
  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => {
      if (!live) return
      layout.invalidate()
      schedule()
    })
    return () => {
      live = false
    }
  }, [layout])

  const cameraRef = useRef<Camera>({ zoom: 1, tx: 0, ty: 0 })
  const gestureRef = useRef<Gesture | null>(null)
  const sessionRef = useRef<ReturnType<typeof createTextEditSession> | null>(null)
  const dirtyRef = useRef<'base' | 'anno' | null>('base')
  // تُقرأ داخل حلقة الرسم، فتلزم مرجعًا لا حالةً — الحلقة لا تُعاد بالتصيير.
  const editingRef = useRef<NodeId | null>(null)
  editingRef.current = editing
  const frameRef = useRef(0)
  const propsRef = useRef(props)
  propsRef.current = props

  // ── مقاس المسرح ────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      setSize({
        cssWidth: Math.max(1, Math.round(r.width)),
        cssHeight: Math.max(1, Math.round(r.height)),
      })
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── الملاءمة عند أوّل مقاس معلوم ───────────────────────────────
  useEffect(() => {
    if (size.cssWidth <= 1) return
    const stage = { ...size, dpr: window.devicePixelRatio || 1 }
    cameraRef.current = fitCamera(props.source, stage, 24)
    dirtyRef.current = 'base'
    schedule()
    // الملاءمة مرّة عند تغيّر المقاس أو الصورة — لا مع كل تغيير مشهد.
  }, [size.cssWidth, size.cssHeight, props.source])

  // ── حلقة الرسم ────────────────────────────────────────────────
  const schedule = (): void => {
    if (frameRef.current !== 0) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      paint()
    })
  }

  const paint = (): void => {
    const p = propsRef.current
    const baseCanvas = baseRef.current
    const annoCanvas = annoRef.current
    if (!baseCanvas || !annoCanvas || size.cssWidth <= 1) return

    const dpr = window.devicePixelRatio || 1
    const plan = planStageSurface(size.cssWidth, size.cssHeight, dpr)

    for (const canvas of [baseCanvas, annoCanvas]) {
      if (canvas.width !== plan.width) canvas.width = plan.width
      if (canvas.height !== plan.height) canvas.height = plan.height
    }

    const baseCtx = baseCanvas.getContext('2d') as Ctx2D | null
    const annoCtx = annoCanvas.getContext('2d') as Ctx2D | null
    if (!baseCtx || !annoCtx) return

    const camera = cameraRef.current
    const baseLayer: Layer = { ctx: baseCtx, ...size, backingScale: plan.backingScale }
    const annoLayer: Layer = { ctx: annoCtx, ...size, backingScale: plan.backingScale }

    const gesture = gestureRef.current
    const scene = p.history.state.scene
    /*
     * العقدة قيد التحرير تُحذَف من المرسوم: الحقل الحيّ فوقها هو صورتها،
     * ورسمهما معًا يُنتج شبحًا مزدوجًا بإزاحة بكسل — الشرح في
     * `TextEditorOverlay`.
     */
    const visible = editingRef.current
      ? scene.nodes.filter((n) => n.id !== editingRef.current)
      : scene.nodes
    const shown: Scene = {
      ...scene,
      nodes: gesture?.preview ? [...visible, gesture.preview] : visible,
    }

    const frame: Frame = {
      scene: shown,
      camera,
      selection: p.selection,
      style: p.style,
      layout,
      measure: measureBox,
      interacting: gesture !== null,
    }

    if (dirtyRef.current === 'base') paintBase(baseLayer, p.source, frame)

    const framePlan = planFrame({
      scene: shown,
      camera,
      stage: { ...size, dpr },
      measure: measureBox,
      forceFull: true,
    })
    paintAnnotations(annoLayer, framePlan, frame, p.source)
    paintSelection(annoLayer, frame)
    dirtyRef.current = null
  }

  // ── إعادة الرسم عند تغيّر المشهد أو التحديد ────────────────────
  useEffect(() => {
    schedule()
  })

  // ── تحرير النصّ ───────────────────────────────────────────────
  const beginEdit = (id: NodeId): void => {
    sessionRef.current?.finish()
    sessionRef.current = createTextEditSession(propsRef.current.history, id, 'text', TOOL_LABEL.text)
    setEditing(id)
  }

  /**
   * ينهي التحرير — **ويحذف العقدة إن بقيت فارغة**.
   *
   * نقرةٌ بأداة النصّ ثمّ نقرةٌ في مكان آخر تترك عقدةً بلا محرف: لا تُرسم،
   * ولا تُصاب بالمؤشِّر، ولا تظهر إلّا في عدّاد العقد وفي قائمة الطبقات —
   * فيتراكم في المشهد ما لا يراه أحد ولا يستطيع حذفه.
   */
  const endEdit = (): void => {
    const p = propsRef.current
    const id = editingRef.current
    sessionRef.current?.finish()
    sessionRef.current = null
    setEditing(null)
    if (!id) return

    const node = p.history.state.scene.nodes.find((n) => n.id === id)
    if (node?.kind === 'text' && node.text.trim() === '') {
      p.history.mark(TOOL_LABEL.text)
      p.history.push(deleteNodes(p.history.state.scene, [id]).patches)
      p.history.commit()
      p.onSelectionChange(new Set())
    }
    p.onSceneChange?.(p.history.state.scene)
    schedule()
  }

  // ── أحداث المؤشِّر ────────────────────────────────────────────
  const toImage = (e: PointerEvent): DevicePoint => {
    const el = annoRef.current
    const box = el?.getBoundingClientRect()
    return canvasToImage(
      canvasPoint(e.clientX - (box?.left ?? 0), e.clientY - (box?.top ?? 0)),
      cameraRef.current,
    )
  }

  const onPointerDown = (e: PointerEvent): void => {
    const p = propsRef.current
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const at = toImage(e)
    const scene = p.history.state.scene

    // المسافة أو الزرّ الأوسط ⇒ تحريك المشهد لا رسم.
    if (e.button === 1 || e.shiftKey) {
      gestureRef.current = {
        kind: 'pan',
        from: at,
        startCamera: cameraRef.current,
        startNodes: [],
        points: [],
        preview: null,
        moved: false,
      }
      return
    }

    if (p.tool === 'select') {
      const hit = hitTest(scene, at, { camera: cameraRef.current, measureBox })
      const next = hit ? new Set([hit]) : new Set<NodeId>()
      p.onSelectionChange(next)
      gestureRef.current = {
        kind: 'move',
        from: at,
        startCamera: cameraRef.current,
        startNodes: scene.nodes.filter((n) => next.has(n.id)),
        points: [],
        preview: null,
        moved: false,
      }
      if (next.size > 0) p.history.mark(TOOL_LABEL.select)
      return
    }

    gestureRef.current = {
      kind: 'draw',
      from: at,
      startCamera: cameraRef.current,
      startNodes: [],
      points: [at.x, at.y],
      preview: null,
      moved: false,
    }
  }

  const onPointerMove = (e: PointerEvent): void => {
    const gesture = gestureRef.current
    if (!gesture) return
    const p = propsRef.current
    const at = toImage(e)
    gesture.moved = true

    if (gesture.kind === 'pan') {
      const dxCss = (at.x - gesture.from.x) * cameraRef.current.zoom
      const dyCss = (at.y - gesture.from.y) * cameraRef.current.zoom
      cameraRef.current = clampCamera(panBy(gesture.startCamera, dxCss, dyCss), p.source, {
        ...size,
        dpr: window.devicePixelRatio || 1,
      })
      dirtyRef.current = 'base'
      schedule()
      return
    }

    if (gesture.kind === 'move') {
      if (gesture.startNodes.length === 0) return
      const dx = at.x - gesture.from.x
      const dy = at.y - gesture.from.y
      const moved = gesture.startNodes.map((n) => translateNode(n, dx, dy))
      // الفروق تُحسَب على المشهد الحالي وتُدفَع داخل العلامة المفتوحة،
      // فيدمجها `coalesce` إلى فرق واحد لكل عقدة عند الإغلاق.
      p.history.push(replaceNodes(p.history.state.scene, moved).patches)
      schedule()
      return
    }

    if (p.tool === 'freehand') gesture.points.push(at.x, at.y)
    gesture.preview = createNode({
      tool: p.tool,
      from: gesture.from,
      to: at,
      scene: p.history.state.scene,
      settings: p.settings,
      ...(p.tool === 'freehand' ? { points: [...gesture.points] } : {}),
    })
    schedule()
  }

  const onPointerUp = (e: PointerEvent): void => {
    const gesture = gestureRef.current
    gestureRef.current = null
    if (!gesture) return
    const p = propsRef.current

    if (gesture.kind === 'pan') return
    if (gesture.kind === 'move') {
      p.history.commit()
      p.onSceneChange?.(p.history.state.scene)
      schedule()
      return
    }

    const at = toImage(e)

    /*
     * **نقرةٌ بأداة النصّ على نصٍّ قائم تفتحه، ولا تكدّس فوقه عقدةً جديدة.**
     *
     * الأداة تبقى مختارة بعد الكتابة، فأوّل نقرة على ما كُتب توًّا كانت تُنشئ
     * عقدةً فارغة **فوقه بالضبط**: لا تُرى (النصّ فارغ)، وتسرق الإصابة ممّا
     * تحتها، وتتراكم واحدةً لكل نقرة. قِيس حيًّا في كروم: نقرة مزدوجة على
     * السطر المكتوب أعطت حقلًا فارغًا لا السطر. والسحب يُنشئ كما كان.
     */
    const dragged = Math.hypot(at.x - gesture.from.x, at.y - gesture.from.y)
    if (p.tool === 'text' && dragged < cssToImage(MIN_DRAG_CSS, p.history.state.scene.source.dpr)) {
      const hit = hitTest(p.history.state.scene, at, { camera: cameraRef.current, measureBox })
      const existing = hit
        ? p.history.state.scene.nodes.find((n) => n.id === hit)
        : undefined
      if (existing?.kind === 'text') {
        p.onSelectionChange(new Set([existing.id]))
        beginEdit(existing.id)
        schedule()
        return
      }
    }

    const node = createNode({
      tool: p.tool,
      from: gesture.from,
      to: at,
      scene: p.history.state.scene,
      settings: p.settings,
      ...(p.tool === 'freehand' ? { points: gesture.points } : {}),
    })

    if (node) {
      p.history.mark(TOOL_LABEL[p.tool])
      p.history.push(addNode(p.history.state.scene, node).patches)
      p.history.commit()
      p.onSelectionChange(new Set([node.id]))
      p.onSceneChange?.(p.history.state.scene)
      // النصّ يُفتَح للكتابة فور وضعه: عقدةٌ نصّية فارغة لا تُرى، فلا معنى
      // لخطوة ثانية يكتشفها المستخدم وحده.
      if (node.kind === 'text') beginEdit(node.id)
    }
    schedule()
  }

  /** النقر المزدوج يفتح نصًّا قائمًا للتحرير — بأي أداة، لا بأداة النصّ وحدها. */
  const onDoubleClick = (e: MouseEvent): void => {
    const p = propsRef.current
    const el = annoRef.current
    const box = el?.getBoundingClientRect()
    const at = canvasToImage(
      canvasPoint(e.clientX - (box?.left ?? 0), e.clientY - (box?.top ?? 0)),
      cameraRef.current,
    )
    const hit = hitTest(p.history.state.scene, at, { camera: cameraRef.current, measureBox })
    if (!hit) return
    const node = p.history.state.scene.nodes.find((n) => n.id === hit)
    if (node?.kind !== 'text') return
    p.onSelectionChange(new Set([hit]))
    beginEdit(hit)
  }

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const el = annoRef.current
    const box = el?.getBoundingClientRect()
    const anchor = canvasPoint(e.clientX - (box?.left ?? 0), e.clientY - (box?.top ?? 0))
    const factor = Math.exp(-e.deltaY * 0.0015)
    cameraRef.current = clampCamera(
      zoomAt(cameraRef.current, anchor, factor),
      propsRef.current.source,
      {
        ...size,
        dpr: window.devicePixelRatio || 1,
      },
    )
    dirtyRef.current = 'base'
    schedule()
  }

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const editingRaw = editing
    ? props.history.state.scene.nodes.find((n) => n.id === editing)
    : undefined
  const editingNode: TextNode | null = editingRaw?.kind === 'text' ? editingRaw : null

  return (
    <div
      ref={wrapRef}
      data-editor-stage=""
      style={{ position: 'relative', inlineSize: '100%', blockSize: '100%', overflow: 'hidden' }}
    >
      <canvas
        ref={baseRef}
        data-stage-layer="base"
        style={{
          position: 'absolute',
          insetBlockStart: 0,
          insetInlineStart: 0,
          inlineSize: '100%',
          blockSize: '100%',
        }}
      />
      <canvas
        ref={annoRef}
        data-stage-layer="annotations"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDblClick={onDoubleClick}
        onWheel={onWheel}
        style={{
          position: 'absolute',
          insetBlockStart: 0,
          insetInlineStart: 0,
          inlineSize: '100%',
          blockSize: '100%',
          touchAction: 'none',
        }}
      />
      {editingNode && sessionRef.current ? (
        <TextEditorOverlay
          node={editingNode}
          camera={cameraRef.current}
          family={props.style.textFamily}
          colorHex={props.style.palette[editingNode.stroke.colorToken]}
          metrics={layout.metrics(editingNode.font)}
          widthCss={
            (editingNode.maxWidthPx > 0
              ? editingNode.maxWidthPx
              : Math.max(textBox(editingNode, layout).width, editingNode.font.sizePx * 8)) *
            cameraRef.current.zoom
          }
          session={sessionRef.current}
          onDone={endEdit}
          onUndo={() => {
            props.history.undo()
            props.onSceneChange?.(props.history.state.scene)
            schedule()
          }}
          onRedo={() => {
            props.history.redo()
            props.onSceneChange?.(props.history.state.scene)
            schedule()
          }}
        />
      ) : null}
    </div>
  )
}

/** يعيد تطبيق فروق — يخدم الاختبار والاستعادة. */
export const replay = applyPatches
export const dirtyOf = dirtyForChange
