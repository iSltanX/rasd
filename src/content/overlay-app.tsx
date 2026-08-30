/**
 * جذر العرض داخل الصفحة — أوّل شيفرة في المشروع ترسم Preact في جذر الظلّ.
 *
 * المرحلة 6 بنت المضيف والبدائيّات ولم تصل بينهما: لا شيء كان يُركَّب في
 * `host.layer`. المرحلة 8 أوّل من يحتاج واجهة تفاعلية داخل الصفحة، فهنا
 * يُغلَق ذلك الفراغ.
 *
 * **الحالة إشارات لا خصائص متدفّقة.** السحب يُحدِّث الهندسة عند كل حركة
 * مؤشِّر؛ الإشارة تُعيد رسم ما يقرؤها وحده، بينما رفع الحالة إلى الجذر يُعيد
 * تركيب الشجرة كلّها في كل إطار. الفرق يظهر مباشرةً على صفحة ثقيلة.
 */

import { useSignal, useSignalEffect } from '@preact/signals'
import { render } from 'preact'
import { useEffect } from 'preact/hooks'

import { describeRatio, HANDLES, handlePoint } from '@/modules/capture/selection'
import { viewportRect, viewportRectToDevice, type CoordSpace } from '@/shared/geometry'
import { send } from '@/shared/messaging'
import {
  ElementHover,
  FullPageStatus,
  InspectIdle,
  InspectPanel,
  type QuickAction,
} from '@/ui/overlay'
import { AreaSelect, Countdown, type HandleSpot } from '@/ui/overlay/AreaSelect'
import { at, box } from '@/ui/overlay/geometry'

import { buildGroups } from './inspect-view'

import type { AreaSelectTool } from './tools/area-select'
import type { ElementHoverTool } from './tools/element-hover'
import type { InspectTool } from './tools/inspect'
import type { Mode } from '@/shared/modes'
import type { Signal } from '@preact/signals'
import type { JSX } from 'preact'

/** تلميحات `capture / area-select` — نصوصها ومفاتيحها من الملفّ حرفيًا. */
const AREA_HINTS = [
  { label: 'إلغاء', key: 'esc' },
  { label: 'التقط', key: '↵' },
  { label: 'من المركز', key: '⌥' },
  { label: 'ثبّت النسبة', key: '⇧' },
] as const

/** إجراءات المرحلة 9 — ما تسنده محرّكات موجودة فعلًا لا أكثر. */
const ELEMENT_HINTS: readonly { label: string; key: string }[] = [
  { label: 'خروج', key: 'esc' },
  { label: 'التقط', key: 'انقر' },
  { label: 'تنقّل في DOM', key: '↑↓' },
]

export interface FullPageState {
  readonly done: number
  readonly total: number
  readonly note: string
}

export interface OverlayAppProps {
  mode: Signal<Mode>
  area: AreaSelectTool
  element: ElementHoverTool
  inspect: InspectTool
  /** يُطلَب حين يضغط المستخدم زرّ نسخ في لوحة الفحص. */
  onCopyInspect?: (kind: 'css' | 'tailwind' | 'json') => void
  /**
   * تقدّم الالتقاط الكامل — `null` يعني لا مهمّة.
   *
   * **لا يمرّ عبر `mode`**: الالتقاط الكامل مهمّة لا أداة يوجّهها المستخدم،
   * فلا `phase` لها ولا `handlers`. وتُعرَض **فوق** أي وضع نشط لأنها قد تبدأ
   * باختصار لوحة مفاتيح بينما أداة أخرى مفتوحة.
   */
  fullPage: Signal<FullPageState | null>
  /** يُطلَب حين يضغط المستخدم زرّ الإلغاء في اللوحة. */
  onCancelFullPage?: () => void
  /** لقطة الإحداثيات الحيّة — تُقرأ عند كل إطار مزامنة. */
  space: Signal<CoordSpace>
  /** ثوانٍ التأجيل من الإعدادات؛ صفر يعني التقاطًا فوريًا. */
  delaySeconds: Signal<number>
  /** التقاط الجزء الظاهر مؤجَّل — لا تحديد له، والعدّ يبدأ فور الدخول. */
  pendingViewport: Signal<boolean>
  /** يُطلَب حين ينتهي العدّ أو يُلتقط فورًا. */
  onCapture: (rect: ReturnType<typeof viewportRect> | null) => void
}

function AreaLayer({
  area,
  space,
  delaySeconds,
  pendingViewport,
  onCapture,
}: Omit<
  OverlayAppProps,
  'mode' | 'element' | 'inspect' | 'onCopyInspect' | 'fullPage' | 'onCancelFullPage'
>) {
  const countdown = useSignal<number | null>(null)

  const rect = area.state.rect.value
  const phase = area.state.phase.value
  const s = space.value
  const bounds = viewportRect(0, 0, s.layoutWidth, s.layoutHeight)

  /**
   * العدّ التنازلي يعيش هنا لا في الخلفية.
   *
   * الغرض من التأجيل أن يفتح المستخدم قائمة منسدلة قبل الالتقاط، وذلك يقع
   * **داخل الصفحة**. ومؤقّت الـservice worker لا ينجو من إنهائه بعد 30 ثانية
   * خمول، و`chrome.alarms` أدنى دقّة له دقيقة كاملة — فكلاهما لا يصلح لثلاث
   * ثوانٍ. المؤقّت هنا يموت بموت الصفحة، وهو السلوك الصحيح.
   */
  useSignalEffect(() => {
    const remaining = countdown.value
    if (remaining === null) return
    if (remaining <= 0) {
      countdown.value = null
      onCapture(area.state.rect.peek())
      return
    }
    const id = setTimeout(() => {
      countdown.value = (countdown.peek() ?? 1) - 1
    }, 1000)
    return () => clearTimeout(id)
  })

  const startCapture = () => {
    const seconds = delaySeconds.peek()
    if (seconds > 0) countdown.value = seconds
    else onCapture(area.state.rect.peek())
  }

  // التقاط ظاهر مؤجَّل: العدّ يبدأ فور الدخول بلا انتظار تحديد.
  useSignalEffect(() => {
    if (pendingViewport.value && countdown.peek() === null) {
      countdown.value = delaySeconds.peek()
    }
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // العدّ جارٍ: `Esc` وحده يُلغي، وكل ما عداه يمرّ إلى الصفحة كي يستطيع
      // المستخدم فتح قائمة أو تحريك مؤشِّر أثناء العدّ.
      if (countdown.peek() !== null) {
        if (event.key === 'Escape') {
          event.preventDefault()
          countdown.value = null
        }
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (area.state.phase.peek() === 'ready') startCapture()
        return
      }

      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      }
      const delta = moves[event.key]
      if (delta && area.state.phase.peek() === 'ready') {
        event.preventDefault()
        area.nudge(delta[0], delta[1])
      }
    }

    // `capture: true` — نرى المفتاح قبل مستمعي الصفحة، كما في `shortcuts.ts`.
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [area, countdown, delaySeconds, onCapture])

  if (countdown.value !== null) {
    return (
      <Countdown
        seconds={countdown.value}
        origin={{ x: s.layoutWidth / 2, y: s.layoutHeight / 2 }}
      />
    )
  }

  const handles: HandleSpot[] =
    phase === 'ready' && rect
      ? HANDLES.map((id) => {
          const p = handlePoint(rect, id)
          return { id, x: p.x, y: p.y }
        })
      : []

  return (
    <AreaSelect
      rect={rect}
      bounds={bounds}
      {...(rect && rect.width > 0 && rect.height > 0 ? { ratioLabel: describeRatio(rect) } : {})}
      handles={handles}
      hints={AREA_HINTS}
      onHandleDown={(id, event) => {
        area.handlers.onPointerDown(event, id as (typeof HANDLES)[number])
      }}
      onBodyDown={(event) => area.handlers.onPointerDown(event)}
    />
  )
}

/**
 * `capture / element-hover` — الإبراز والبطاقة والإجراءات.
 *
 * **إجراءان لا أربعة.** يعرض الملفّ أربع رقاقات: قياس (`dimension-h`)،
 * وشيفرة (`code`)، ونسخ، والتقاط. والقياس محرّكه المرحلة 12 والشيفرة
 * المرحلة 11 — فعرضهما الآن وعدٌ بما لا يقع خلفه شيء. تُحذَف حتى يوجد
 * محرّكها، ولا تُعرَض معطَّلة: السابقة مقرّرة منذ المرحلة 7.
 */
function ElementLayer({
  element,
  space,
}: {
  element: ElementHoverTool
  space: Signal<CoordSpace>
}) {
  const rect = element.state.rect.value
  const info = element.state.info.value
  const s = space.value
  const bounds = viewportRect(0, 0, s.layoutWidth, s.layoutHeight)

  /**
   * `↑`/`↓` — المشي في شجرة DOM.
   *
   * `capture: true` كي نرى المفتاح قبل مستمعي الصفحة، كما في `shortcuts.ts`.
   * و`preventDefault` يمنع تمرير الصفحة بالسهم — وهو ما يجعل المشي في شجرة
   * طويلة ممكنًا أصلًا.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dir = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null
      if (!dir) return
      if (element.walk(dir)) event.preventDefault()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [element])

  const actions: QuickAction[] = info
    ? [
        { id: 'copy', icon: 'copy', label: 'انسخ المحدِّد', onPick: () => element.copySelector() },
        {
          id: 'capture',
          icon: 'capture-element',
          label: 'التقط العنصر',
          primary: true,
          onPick: () => element.commit(),
        },
      ]
    : []

  return (
    <ElementHover
      rect={rect}
      bounds={bounds}
      tag={info?.tag ?? ''}
      selector={info?.label ?? ''}
      {...(info ? { padding: info.edges.padding, margin: info.edges.margin } : {})}
      actions={actions}
      hints={ELEMENT_HINTS}
    />
  )
}

function FullPageLayer({
  state,
  space,
  onCancel,
}: {
  state: Signal<FullPageState | null>
  space: Signal<CoordSpace>
  onCancel?: () => void
}) {
  const job = state.value
  if (!job) return null
  const s = space.value
  return (
    <FullPageStatus
      bounds={viewportRect(0, 0, s.layoutWidth, s.layoutHeight)}
      done={job.done}
      total={job.total}
      {...(job.note ? { note: job.note } : {})}
      {...(onCancel ? { onCancel } : {})}
    />
  )
}

/**
 * `17 — Inspect` — الإبراز واللوحة.
 *
 * **بلا درع**: المضيف يبقى `pointer-events: none` كي تبقى `:hover` صادقة
 * على الصفحة تحته، واللوحة وحدها تعلن `auto` لنفسها. قِيس أن الدرع الكامل
 * يجعل `matches(':hover')` كاذبًا فيُعلن محرّك التتالي قاعدة `:hover` غير
 * فائزة وهي التي تفوز — أي أن الفاحص يكذب.
 */
function InspectLayer({
  inspect,
  space,
  onCopy,
}: {
  inspect: InspectTool
  space: Signal<CoordSpace>
  onCopy?: (kind: 'css' | 'tailwind' | 'json') => void
}) {
  const detail = inspect.state.detail.value
  const rect = inspect.state.rect.value
  const s = space.value

  return (
    <>
      {!detail && rect ? (
        <div
          class="rasd-ov-place rasd-ov-elhl"
          style={box(viewportRect(rect.x, rect.y, rect.width, rect.height))}
          data-rasd-ov="inspect-highlight"
        />
      ) : null}

      <div
        class="rasd-ov-place"
        style={at({ x: PANEL_INSET, y: PANEL_TOP })}
        data-rasd-ov="inspect-dock"
      >
        {detail ? (
          <InspectPanel
            snapshot={detail.snapshot}
            groups={buildGroups(detail)}
            onClose={() => inspect.clear()}
            {...(onCopy ? { onCopy } : {})}
          />
        ) : (
          <InspectIdle />
        )}
      </div>
      {/* الإحداثيات تُقرأ كي تشترك الطبقة في تغيّر المقاس. */}
      <span hidden data-w={s.layoutWidth} />
    </>
  )
}

/**
 * مرساة اللوحة — الركن الأعلى الأيسر بإحداثيات فيزيائية.
 *
 * الملفّ يضعها عند (40, 64) في إطار 1440×900، **يسارًا رغم أن المحتوى
 * عربي**: فضاء الطبقة فيزيائي، والمحتوى داخل اللوحة هو ما يُقلَب.
 */
const PANEL_INSET = 40
const PANEL_TOP = 64

function OverlayApp(props: OverlayAppProps): JSX.Element | null {
  /*
   * لوحة الالتقاط الكامل تُرسَم **فوق** ما تعرضه الأوضاع لا بدلًا منه:
   * المهمّة قد تبدأ باختصار بينما أداة أخرى مفتوحة، وإخفاء تلك الأداة
   * تحتها يربك المستخدم.
   */
  const job = (
    <FullPageLayer
      state={props.fullPage}
      space={props.space}
      {...(props.onCancelFullPage ? { onCancel: props.onCancelFullPage } : {})}
    />
  )

  // القراءة داخل المكوّن هي ما يشترك في الإشارة — لا `subscribe` يدوي.
  const mode = props.mode.value
  if (mode === 'inspect')
    return (
      <>
        <InspectLayer
          inspect={props.inspect}
          space={props.space}
          {...(props.onCopyInspect ? { onCopy: props.onCopyInspect } : {})}
        />
        {job}
      </>
    )
  if (mode === 'element')
    return (
      <>
        <ElementLayer element={props.element} space={props.space} />
        {job}
      </>
    )
  if (mode !== 'area') return job
  return (
    <>
      {job}
      <AreaLayer
        area={props.area}
        space={props.space}
        delaySeconds={props.delaySeconds}
        pendingViewport={props.pendingViewport}
        onCapture={props.onCapture}
      />
    </>
  )
}

export interface MountedApp {
  unmount(): void
}

/**
 * يركّب الجذر في طبقة المضيف.
 *
 * المستمعات على الحاوية نفسها لا على `window`: الطبقة تبتلع أحداث المؤشِّر
 * حين تكون تفاعلية (`setInteractive`)، فما يصلها هو ما لا يصل الصفحة —
 * وهذا بالضبط المطلوب أثناء التحديد.
 */
export function mountOverlayApp(layer: HTMLElement, props: OverlayAppProps): MountedApp {
  /**
   * الحدث الذي وقع على **خلفية** الطبقة لا على زينتها.
   *
   * كل ما يُوضَع فوق الطبقة يعلن `pointer-events: none`، فيبقى هدف الحدث هو
   * الطبقة نفسها ما لم يقع على سطح التقاط صريح (مقبض، زرّ). وهذا الشرط هو
   * ما يميّز «المؤشِّر فوق الصفحة» من «المؤشِّر فوق واجهتنا».
   */
  const onBackground = (e: PointerEvent) => e.target === layer

  const onMove = (e: PointerEvent) => {
    if (props.mode.value === 'element') {
      if (onBackground(e)) props.element.onPointerMove(e)
      return
    }
    props.area.handlers.onPointerMove(e)
  }
  const onUp = (e: PointerEvent) => {
    if (props.mode.value === 'element') return
    props.area.handlers.onPointerUp(e)
  }
  const onDown = (e: PointerEvent) => {
    if (props.mode.value === 'element') {
      if (onBackground(e)) props.element.onPointerDown(e)
      return
    }
    // نقرة على خلفية الطبقة (لا على مقبض ولا على جسم التحديد) تبدأ سحبًا
    // جديدًا. المقابض توقف الانتشار بنفسها.
    if (onBackground(e)) props.area.handlers.onPointerDown(e)
  }

  layer.addEventListener('pointerdown', onDown)
  layer.addEventListener('pointermove', onMove)
  layer.addEventListener('pointerup', onUp)
  layer.addEventListener('pointercancel', onUp)

  /*
   * ── وضع الفحص: مستمعات على `window` لا على الطبقة ──────────────
   *
   * المضيف في هذا الوضع `pointer-events: none` عمدًا (كي تبقى `:hover`
   * صادقة على الصفحة)، فأحداث المؤشِّر **لا تصل الطبقة أصلًا** — تذهب إلى
   * الصفحة. فالالتقاط على `window` هو الطريق الوحيد.
   *
   * والكبت **مشروط**: ما وقع على مضيفنا يمرّ بلا مساس كي تعمل أزرار
   * اللوحة، وما وقع على الصفحة يُمنع كي لا يتبع المستخدمُ رابطًا وهو يفحص.
   * قِيس أن الكبت الأعمى يقتل واجهتنا (صفر نقرات على زرّنا).
   */
  const win = layer.ownerDocument.defaultView
  const host =
    layer.getRootNode() instanceof ShadowRoot ? (layer.getRootNode() as ShadowRoot).host : null

  const inInspect = () => props.mode.value === 'inspect'
  const onOurs = (e: Event) => e.target === host || (host?.contains(e.target as Node) ?? false)

  const winMove = (e: Event) => {
    if (!inInspect() || onOurs(e)) return
    props.inspect.onPointerMove(e as PointerEvent)
  }

  const winUp = (e: Event) => {
    if (!inInspect() || onOurs(e)) return
    props.inspect.onPointerUp(e as PointerEvent)
  }

  /**
   * يمنع تسرّب النقرة إلى الصفحة.
   *
   * ثمانية أنواع لا نوعان: قِيس أن كبت المؤشِّر وحده يترك `click` يتسرّب
   * فيتبع الرابط. و`:active` تشتعل بالنقرة نفسها رغم المنع — ولذلك تقع
   * القراءة عند الإفلات لا عند الضغط.
   */
  const SUPPRESSED = [
    'pointerdown',
    'mousedown',
    'mouseup',
    'click',
    'auxclick',
    'contextmenu',
    'dblclick',
  ] as const

  const suppress = (e: Event) => {
    if (!inInspect() || onOurs(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  win?.addEventListener('pointermove', winMove, { capture: true, passive: true })
  win?.addEventListener('pointerup', winUp, { capture: true })
  for (const type of SUPPRESSED) win?.addEventListener(type, suppress, { capture: true })

  render(<OverlayApp {...props} />, layer)

  return {
    unmount() {
      layer.removeEventListener('pointerdown', onDown)
      layer.removeEventListener('pointermove', onMove)
      layer.removeEventListener('pointerup', onUp)
      layer.removeEventListener('pointercancel', onUp)
      win?.removeEventListener('pointermove', winMove, { capture: true })
      win?.removeEventListener('pointerup', winUp, { capture: true })
      for (const type of SUPPRESSED) win?.removeEventListener(type, suppress, { capture: true })
      render(null, layer)
    },
  }
}

/** يحوّل تحديد النافذة إلى مستطيل جهاز — التحويل الوحيد قبل القصّ. */
export function toDeviceRect(rect: ReturnType<typeof viewportRect>, s: CoordSpace) {
  return viewportRectToDevice(rect, s)
}

/**
 * يطلب من الخلفية أن تلتقط — هي وحدها تملك `captureVisibleTab`.
 *
 * بلا `tabId`: الخلفية تشتقّه من `sender.tab.id`. الصفحة لا تعرف تبويبها
 * أصلًا، ولا يجوز أن تُصدَّق فيه لو عرفته.
 */
export async function requestCapture(
  kind: 'area' | 'viewport',
  rect: ReturnType<typeof viewportRect> | null,
  s: CoordSpace,
) {
  return send('capture/run', {
    kind,
    rect: rect ? viewportRectToDevice(rect, s) : null,
    dpr: s.dpr,
  })
}
