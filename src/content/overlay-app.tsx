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
import { AreaSelect, Countdown, type HandleSpot } from '@/ui/overlay/AreaSelect'

import type { AreaSelectTool } from './tools/area-select'
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

export interface OverlayAppProps {
  mode: Signal<Mode>
  area: AreaSelectTool
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
}: Omit<OverlayAppProps, 'mode'>) {
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

function OverlayApp(props: OverlayAppProps): JSX.Element | null {
  // القراءة داخل المكوّن هي ما يشترك في الإشارة — لا `subscribe` يدوي.
  if (props.mode.value !== 'area') return null
  return (
    <AreaLayer
      area={props.area}
      space={props.space}
      delaySeconds={props.delaySeconds}
      pendingViewport={props.pendingViewport}
      onCapture={props.onCapture}
    />
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
  const onMove = (e: PointerEvent) => props.area.handlers.onPointerMove(e)
  const onUp = (e: PointerEvent) => props.area.handlers.onPointerUp(e)
  const onDown = (e: PointerEvent) => {
    // نقرة على خلفية الطبقة (لا على مقبض ولا على جسم التحديد) تبدأ سحبًا
    // جديدًا. المقابض توقف الانتشار بنفسها.
    if (e.target === layer) props.area.handlers.onPointerDown(e)
  }

  layer.addEventListener('pointerdown', onDown)
  layer.addEventListener('pointermove', onMove)
  layer.addEventListener('pointerup', onUp)
  layer.addEventListener('pointercancel', onUp)

  render(<OverlayApp {...props} />, layer)

  return {
    unmount() {
      layer.removeEventListener('pointerdown', onDown)
      layer.removeEventListener('pointermove', onMove)
      layer.removeEventListener('pointerup', onUp)
      layer.removeEventListener('pointercancel', onUp)
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
