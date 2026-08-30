import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import {
  clampRect,
  moveRect,
  resizeRect,
  solveDrag,
  MIN_SELECTION,
  type Handle,
} from '@/modules/capture/selection'
import { nodeBounds } from '@/modules/editor/bounds'
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
import { drawNode } from '@/modules/editor/draw/shapes'
import { hitTest, HANDLE_HIT_PX, hitHandle, normaliseBox } from '@/modules/editor/hit-test'
import { dirtyForChange, planFrame } from '@/modules/editor/render-plan'
import {
  paintAnnotations,
  paintBase,
  paintCrop,
  paintSelection,
  type BaseSource,
  type Ctx2D,
  type Frame,
  type Layer,
  type RenderStyle,
} from '@/modules/editor/renderer'
import { fullImageRect } from '@/modules/editor/renderer'
import { cssToImage, OBSCURE_LABEL } from '@/modules/editor/scene'
import { addNode, deleteNodes, replaceNodes, setCrop } from '@/modules/editor/scene-ops'
import { createTextLayoutCache, noteBox, textBox } from '@/modules/editor/text-layout'
import {
  canvasPoint,
  contains,
  devicePoint,
  deviceRect,
  type DeviceRect,
  type DevicePoint,
} from '@/shared/geometry'

import { createMeasurer } from './measure'
import { createRedactRaster } from './redact-raster'
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
import { createBlurClient } from './worker-client'

import type { MeasureBox } from '@/modules/editor/bounds'
import type { History } from '@/modules/editor/history'
import type { NodeId, Scene, SceneNode, TextNode } from '@/modules/editor/scene'
import type { JSX } from 'preact'

/** الأصناف التي يصحّ تغيير حجمها بمقبض — ما يُوصَف بمستطيل. */
const RESIZABLE = new Set<SceneNode['kind']>(['rect', 'ellipse', 'redact', 'measure'])

/**
 * يُطبّق مستطيلًا جديدًا على عقدة.
 *
 * `null` لصنفٍ لا يُوصَف بمستطيل — والحارس بالنوع لا بالإهمال: عقدةُ نصٍّ
 * تُغيَّر بعرض لفّها لا بصندوقها، وسحبُ مقبضٍ عليها كان سيُنتج شيئًا لا
 * يقصده أحد.
 */
function resizeNode(node: SceneNode, from: DeviceRect, to: DeviceRect): SceneNode | null {
  if (node.kind === 'rect' || node.kind === 'ellipse' || node.kind === 'redact') {
    return { ...node, rect: to }
  }
  if (node.kind === 'measure') {
    // صندوق الحدود يشمل سمك الخطّ، فتُنقَل الإزاحة لا يُنسَخ الصندوق.
    const dx = to.x - from.x
    const dy = to.y - from.y
    return {
      ...node,
      a: deviceRect(node.a.x + dx, node.a.y + dy, to.width, to.height),
    }
  }
  return null
}

/** يحصر نقطة داخل حدود الصورة — مرساةُ السحب لا يحصرها `solveDrag`. */
function clampPointToImage(p: DevicePoint, source: BaseSource): DevicePoint {
  return devicePoint(
    Math.min(Math.max(p.x, 0), source.width),
    Math.min(Math.max(p.y, 0), source.height),
  )
}

/** حالة إيماءة اقتصاص جارية. */
interface CropDrag {
  readonly kind: 'draw' | 'move' | Handle
  readonly from: DevicePoint
  readonly startCrop: DeviceRect | null
}

export interface StageProps {
  readonly history: History
  readonly source: BaseSource
  readonly style: RenderStyle
  readonly tool: ToolName
  readonly settings: ToolSettings
  readonly selection: ReadonlySet<NodeId>
  readonly onSelectionChange: (next: ReadonlySet<NodeId>) => void
  /** يُستدعى بعد كل تغيير في المشهد. */
  readonly onSceneChange?: (scene: Scene) => void
  /** نسبة الاقتصاص المختارة — `null` يعني حرًّا. */
  readonly cropRatio?: number | null
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
   * مسلسلٌ لكل كائن عقدة.
   *
   * **لا `scene.revision`**: هي تتصاعد مع كل **حفظ** ناجح لا مع كل تعديل،
   * فمشهدٌ حُرِّر ولم يُحفَظ يبقى برقمه — وتبقى رقعة الحجب تعرض ما كان تحتها
   * قبل التعديل. والعقد غير قابلة للتغيير وتُستبدَل بكائن جديد عند كل تعديل،
   * فهوية الكائن **هي** علامة التغيير الدقيقة.
   */
  /** جسرٌ إلى `schedule` الحالية — لا إلى التي التقطتها ذاكرة دائمة. */
  const scheduleRef = useRef<() => void>(() => undefined)

  const serials = useRef({ map: new WeakMap<SceneNode, number>(), next: 1 })
  const serialOf = (node: SceneNode): number => {
    const s = serials.current
    const hit = s.map.get(node)
    if (hit !== undefined) return hit
    const id = s.next++
    s.map.set(node, id)
    return id
  }

  /**
   * بصمة ما تحت العقدة في ترتيب الرسم.
   *
   * تدخل مفتاح الرقعة، فتغيير سهمٍ تحت الحجب يُبطلها. وتغيير عقدة **فوقه**
   * لا يمسّها — وهو ما يجعل السحب المعتاد لا يُعيد بناء الرقع.
   */
  const underlayEpoch = (node: SceneNode): string => {
    const nodes = propsRef.current.history.state.scene.nodes
    const index = nodes.findIndex((n) => n.id === node.id)
    if (index <= 0) return '0'
    let out = ''
    for (let i = 0; i < index; i++) out += `${serialOf(nodes[i]!)},`
    return out
  }

  /*
   * خيط الطمس وذاكرة رقعه — عمرهما عمر المسرح.
   *
   * وإنشاؤهما مع كل تصيير كان سيُطلق خيطًا جديدًا في كل ضغطة مفتاح، ويُلقي
   * كل رقعة بُنيت.
   */
  const redact = useMemo(() => {
    const client = createBlurClient()
    const raster = createRedactRaster({
      source: props.source,
      style: props.style,
      client,
      /*
       * **عبر مرجع لا مباشرةً.** هذه الذاكرة تُبنى مرّة واحدة، فتلتقط
       * `schedule` من **التصيير الأوّل** — وحلقة الرسم عندئذ تُغلق على
       * `size` وقيمته صفر، فتخرج من `paint` فورًا. والنتيجة أن الرقعة تُبنى
       * بنجاح ولا تُرسَم أبدًا: عطلٌ صامت لا يترك استثناءً ولا سجلًّا،
       * وأثره الوحيد أن الطمس «لا يعمل». قِيس حيًّا: `built:worker` مسجَّل
       * والمنطقة على القماش ما زالت تغطيةً مسطّحة.
       */
      onReady: () => scheduleRef.current(),
      onDiag: (state) => wrapRef.current?.setAttribute('data-blur-state', state),
      /*
       * **ما تحت الحجب يُعاد رسمه داخل الرقعة.** الخبز يدمّر المركَّب عند
       * تلك النقطة من ترتيب الرسم لا الصورة الخام، فسهمٌ رُسم تحت الحجب
       * يُطمَس معه. ورقعةٌ تقرأ الصورة وحدها تُعاين شيئًا ويُصدَّر آخر.
       */
      paintUnderlay: (ctx, node, plan) => {
        const scene = propsRef.current.history.state.scene
        const index = scene.nodes.findIndex((n) => n.id === node.id)
        if (index <= 0) return

        ctx.save()
        // فضاء الرقعة: أصلُه زاوية العيّنة، ومقياسه مقياسها.
        ctx.scale(plan.scale, plan.scale)
        ctx.translate(-plan.sample.x, -plan.sample.y)
        for (let i = 0; i < index; i++) {
          const under = scene.nodes[i]!
          if (under.kind !== 'redact' && under.hidden) continue
          drawNode(
            {
              ctx,
              style: propsRef.current.style,
              camera: { zoom: plan.scale, tx: 0, ty: 0 },
              dpr: propsRef.current.history.state.scene.source.dpr,
              interacting: false,
              layout,
            },
            under,
          )
        }
        ctx.restore()
      },
    })
    return { client, raster }
  }, [props.source, props.style, layout])

  useEffect(
    () => () => {
      redact.raster.dispose()
      redact.client.dispose()
    },
    [redact],
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
  const cropRef = useRef<CropDrag | null>(null)
  const resizeRef = useRef<{ node: SceneNode; handle: Handle; box: DeviceRect } | null>(null)
  /**
   * آخر اقتصاص رُسمت به طبقة الأساس.
   *
   * `paintBase` تُعاد عند تغيّر الكاميرا وحدها، والاقتصاص يغيّر **ما تعرضه**
   * — فتغييره من خارج المسرح (زرّ نسبة، تراجع، إلغاء) كان يترك الطبقة على
   * نافذتها القديمة. قِيس بصريًّا: صندوق الاقتصاص صار مربّعًا والصورة تحته
   * بقيت مستطيلة، فظهر ربعه أسود.
   */
  const paintedCropRef = useRef<DeviceRect | null | undefined>(undefined)
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

  /** هل لوءم المشهد لهذه الصورة؟ الملاءمة مرّة واحدة لا مع كل تغيّر مقاس. */
  const fittedRef = useRef<BaseSource | null>(null)

  // ── الملاءمة عند أوّل مقاس معلوم ───────────────────────────────
  useEffect(() => {
    if (size.cssWidth <= 1) return
    /*
     * **مرّةً واحدة لكل صورة، لا عند كل تغيّر مقاس.**
     *
     * `ResizeObserver` يُطلق عند تغيير مقاس النافذة وعند فتح لوحة جانبية
     * وعند ظهور شريط تمرير — وإعادة الملاءمة عندها تُلغي تكبير المستخدم
     * وتحريكه بلا أن يطلب. والمقاس الجديد لا يعني «أعد البدء».
     */
    if (fittedRef.current === props.source) return
    fittedRef.current = props.source
    const stage = { ...size, dpr: window.devicePixelRatio || 1 }
    cameraRef.current = fitCamera(props.source, stage, 24)
    dirtyRef.current = 'base'
    schedule()
  }, [size.cssWidth, size.cssHeight, props.source])

  // ── حلقة الرسم ────────────────────────────────────────────────
  const schedule = (): void => {
    if (frameRef.current !== 0) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      paint()
    })
  }

  scheduleRef.current = schedule

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
    const crop = p.history.state.scene.meta.crop
    if (paintedCropRef.current !== crop) {
      paintedCropRef.current = crop
      dirtyRef.current = 'base'
    }
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
      redactPatch: (node) => redact.raster.patchFor(node, camera.zoom, underlayEpoch(node)),
      interacting: gesture !== null,
      cropActive: p.tool === 'crop',
    }

    if (dirtyRef.current === 'base') paintBase(baseLayer, p.source, frame)

    const framePlan = planFrame({
      scene: shown,
      camera,
      stage: { ...size, dpr },
      measure: measureBox,
      forceFull: true,
    })
    paintAnnotations(annoLayer, framePlan, frame)
    paintSelection(annoLayer, frame)
    paintCrop(annoLayer, frame)
    dirtyRef.current = null

    /*
     * أي مسار حسب الطمس — يُكتب على العنصر لا في حالة تفاعلية.
     *
     * الكتابة في `useState` تُعيد تركيب الشجرة من داخل حلقة الرسم، وهذه
     * قيمةٌ تشخيصية لا تُغيّر شيئًا مرئيًّا. وبدونها **لا سبيل لإثبات أن
     * الـworker عمل فعلًا**: النتيجة نفسها على المسارين بالتصميم، فالنجاح
     * وحده لا يميّز بينهما.
     */
    const path = redact.client.lastPath
    if (path) wrapRef.current?.setAttribute('data-blur-path', path)
  }

  // ── إعادة الرسم عند تغيّر المشهد أو التحديد ────────────────────
  useEffect(() => {
    schedule()
  })

  // ── تحرير النصّ ───────────────────────────────────────────────
  const beginEdit = (id: NodeId): void => {
    sessionRef.current?.finish()
    sessionRef.current = createTextEditSession(
      propsRef.current.history,
      id,
      'text',
      TOOL_LABEL.text,
    )
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

    /*
     * **الزرّ الأيسر وحده يرسم.** كان أي زرّ غير الأوسط يُنشئ عقدة، فنقرةٌ
     * يمنى لفتح قائمة السياق تترك مستطيلًا في المشهد.
     */
    if (e.button !== 0 && e.button !== 1) return

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

    /*
     * **الاقتصاص كلّه بدوالّ `selection.ts` المعمَّمة** — بلا سطر هندسة
     * جديد. عُمِّمت على الفضاءات في الدفعة الأولى لهذا الغرض بعينه، وتُستدعى
     * هنا بفضاء `device`.
     */
    if (p.tool === 'crop') {
      const crop = scene.meta.crop
      const tol = HANDLE_HIT_PX / cameraRef.current.zoom
      const handle = crop ? hitHandle(normaliseBox(crop), 0, at, tol) : null
      const inside = crop ? contains(normaliseBox(crop), at) : false
      cropRef.current = {
        kind: handle ?? (inside ? 'move' : 'draw'),
        /*
         * **المرساة تُحصَر داخل الصورة.**
         *
         * `solveDrag` تحصر المؤشِّر ولا تحصر المرساة، والمسرح أوسع من
         * اللوحة — فسحبةٌ تبدأ في هامش المسرح تُنتج نافذة تصدير معلّقة خارج
         * المصدر. قِيس بصريًّا: ربع الاقتصاص السفلي خرج أسود تحت حافّة
         * الصورة، ثمّ يطلب الخبز شرائح لبكسلات لا وجود لها.
         */
        from: clampPointToImage(at, p.source),
        startCrop: crop,
      }
      p.history.mark(TOOL_LABEL.crop)
      return
    }

    if (p.tool === 'select') {
      /*
       * **مقابض التغيير تعمل.**
       *
       * `paintSelection` كانت ترسم ثمانية مقابض حول المحدَّد ولا يستجيب
       * أحدها — وهي أسوأ صنف من العطل: عرضٌ يَعِد بإمكانٍ غير موجود، فيسحب
       * المستخدم مقبضًا فيتحرّك الشكل كلّه بدل أن يتغيّر حجمه.
       *
       * والهندسة `resizeRect` نفسها التي يستعملها الاقتصاص — لا صيغة ثانية
       * يمكن أن تنحرف عن الأولى.
       */
      const selected = scene.nodes.find((n) => p.selection.has(n.id) && !n.locked)
      if (selected && RESIZABLE.has(selected.kind)) {
        const box = normaliseBox(nodeBounds(selected, measureBox))
        const handle = hitHandle(box, selected.rotation, at, HANDLE_HIT_PX / cameraRef.current.zoom)
        if (handle) {
          resizeRef.current = { node: selected, handle, box }
          p.history.mark(TOOL_LABEL.select)
          return
        }
      }

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
    const p = propsRef.current

    const resize = resizeRef.current
    if (resize) {
      const at = toImage(e)
      const next = resizeRect(resize.box, resize.handle, at)
      const moved = resizeNode(resize.node, resize.box, next)
      if (moved) {
        p.history.push(replaceNodes(p.history.state.scene, [moved]).patches)
        schedule()
      }
      return
    }

    const crop = cropRef.current
    if (crop) {
      const at = toImage(e)
      const bounds = fullImageRect(p.source)
      const options = { ratio: p.cropRatio ?? null }
      const next =
        crop.kind === 'draw'
          ? solveDrag(crop.from, clampPointToImage(at, p.source), bounds, options)
          : crop.kind === 'move' && crop.startCrop
            ? clampRect(
                moveRect(normaliseBox(crop.startCrop), at.x - crop.from.x, at.y - crop.from.y),
                bounds,
              )
            : crop.startCrop
              ? clampRect(
                  resizeRect(normaliseBox(crop.startCrop), crop.kind as Handle, at, options),
                  bounds,
                )
              : null
      if (next) {
        p.history.push(setCrop(p.history.state.scene, next).patches)
        dirtyRef.current = 'base'
        schedule()
      }
      return
    }

    const gesture = gestureRef.current
    if (!gesture) return
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
    const p = propsRef.current

    if (resizeRef.current) {
      resizeRef.current = null
      p.history.commit()
      p.onSceneChange?.(p.history.state.scene)
      schedule()
      return
    }

    const crop = cropRef.current
    if (crop) {
      cropRef.current = null
      const now = p.history.state.scene.meta.crop
      const dpr = p.history.state.scene.source.dpr
      const min = cssToImage(MIN_SELECTION, dpr)
      /*
       * سحبةٌ أصغر من الحدّ الأدنى تُلغى ولا تُثبَّت: نافذة تصدير بمقاس
       * ثمانية بكسلات ليست قصدًا، والفرق بينها وبين نقرةٍ عابرة لا يراه
       * المستخدم. و`cancel` تعكس ما دُفع داخل العلامة وتُغلقها بلا إدراج.
       */
      if (!now || now.width < min || now.height < min) p.history.cancel()
      else p.history.commit()
      p.onSceneChange?.(p.history.state.scene)
      dirtyRef.current = 'base'
      schedule()
      return
    }

    const gesture = gestureRef.current
    gestureRef.current = null
    if (!gesture) return

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
      const existing = hit ? p.history.state.scene.nodes.find((n) => n.id === hit) : undefined
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
      /*
       * **علامة الحجب تحمل نمطه لا اسم أداته.** الأداة واحدة تُنتج ثلاثة
       * أنماط، فـ«تراجع عن حجب» على ضبابٍ هو الوعد الزائد نفسه الذي يرفضه
       * ADR 0015 — بنصّه هذه المرّة في قائمة التاريخ.
       */
      p.history.mark(node.kind === 'redact' ? OBSCURE_LABEL[node.mode] : TOOL_LABEL[p.tool])
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
