import { useEffect, useRef, useState } from 'preact/hooks'

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
import { addNode, replaceNodes } from '@/modules/editor/scene-ops'
import { canvasPoint, type DevicePoint } from '@/shared/geometry'

import { createNode, translateNode, TOOL_LABEL, type ToolName, type ToolSettings } from './tools'

import type { History } from '@/modules/editor/history'
import type { NodeId, Scene, SceneNode } from '@/modules/editor/scene'
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

  const cameraRef = useRef<Camera>({ zoom: 1, tx: 0, ty: 0 })
  const gestureRef = useRef<Gesture | null>(null)
  const dirtyRef = useRef<'base' | 'anno' | null>('base')
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
    const shown: Scene = gesture?.preview
      ? { ...scene, nodes: [...scene.nodes, gesture.preview] }
      : scene

    const frame: Frame = {
      scene: shown,
      camera,
      selection: p.selection,
      style: p.style,
      interacting: gesture !== null,
    }

    if (dirtyRef.current === 'base') paintBase(baseLayer, p.source, frame)

    const framePlan = planFrame({
      scene: shown,
      camera,
      stage: { ...size, dpr },
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
      const hit = hitTest(scene, at, { camera: cameraRef.current })
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
    }
    schedule()
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
    </div>
  )
}

/** يعيد تطبيق فروق — يخدم الاختبار والاستعادة. */
export const replay = applyPatches
export const dirtyOf = dirtyForChange
