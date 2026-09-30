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
import { formatColour } from '@/modules/colour/formats'
import { referenceRectToViewport } from '@/modules/compare/exclusions'
import { NUDGE_STEP_FAST_PX, NUDGE_STEP_PX } from '@/modules/compare/overlay'
import { marginRect } from '@/modules/dom-picker/inspect'
import { pxToRem } from '@/modules/measure/units'
import { formatDimensions, formatUnit } from '@/shared/bidi'
import { viewportRect, viewportRectToDevice, type CoordSpace } from '@/shared/geometry'
import { send } from '@/shared/messaging'
import {
  AlignGuide,
  BoxLegend,
  BoxModel,
  ComparePanel,
  CompareIdle,
  Dimension,
  DimensionVertical,
  ElementHover,
  FullPageStatus,
  InspectIdle,
  InspectPanel,
  Marquee,
  MeasureGap,
  ReferenceOverlay,
  SplitHandle,
  ViewportGallery,
  type QuickAction,
  type ViewportGalleryCard,
} from '@/ui/overlay'
import { AreaSelect, Countdown, type HandleSpot } from '@/ui/overlay/AreaSelect'
import { ColourIdle, ColourPanel } from '@/ui/overlay/colour/ColourPanel'
import { PalettePanel } from '@/ui/overlay/colour/PalettePanel'
import { ScalePanel } from '@/ui/overlay/colour/ScalePanel'
import { ZoneMarks } from '@/ui/overlay/compare/ZoneMarks'
import { Crosshair } from '@/ui/overlay/Crosshair'
import { at, box, HINT_OFFSET_PX } from '@/ui/overlay/geometry'
import { IssueForm } from '@/ui/overlay/issues/IssueForm'
import { MeasurePanel } from '@/ui/overlay/issues/MeasurePanel'
import { IssueBoxes, PageIssues } from '@/ui/overlay/issues/PageIssues'
import { Loupe } from '@/ui/overlay/Loupe'
import { MeasureIdle } from '@/ui/overlay/MeasureIdle'
import { NoticeToast, type OverlayNotice } from '@/ui/overlay/Notice'
import { Toolbar } from '@/ui/overlay/Toolbar'

import { contrastView, formatRows, variableView } from './colour-view'
import { buildGroups } from './inspect-view'
import { colourReadFailed, type NoticeCenter } from './notices'
import { LOUPE_CELLS } from './sampler'
import { measureRootFontSize } from './tools/measure'

import type { AreaSelectTool } from './tools/area-select'
import type { ColourPaletteTool } from './tools/colour-palette'
import type { ColourScaleTool } from './tools/colour-scale'
import type { ColourUsageTool } from './tools/colour-usage'
import type { CompareTool } from './tools/compare'
import type { ElementHoverTool } from './tools/element-hover'
import type { EyedropperTool } from './tools/eyedropper'
import type { InspectDetail, InspectTool } from './tools/inspect'
import type { IssueSource, IssuesController } from './tools/issues'
import type { MeasureTarget, MeasureTool } from './tools/measure'
import type { PaletteFormat } from '@/modules/colour/export'
import type { LiveDiff } from '@/shared/messaging/contract'
import type { Mode } from '@/shared/modes'
import type { CaptureKind, Viewport } from '@/shared/storage/schema'
import type { ReadonlySignal, Signal } from '@preact/signals'
import type { JSX } from 'preact'

/**
 * ما تحتاجه لوحة المقارنة لعرض الفرق الحيّ — تُبنى في `content/index.ts`.
 *
 * تعيش هنا لا في `ui/`: `ComparePanel` يستقبل الحقول الثلاثة مفكوكةً
 * (`diff` · `diffBusy` · `diffError`) كبقيّة خصائصه، وتجميعها شأن السلك.
 */
export interface CompareDiffView {
  /** آخر قياس صالح، أو `null` — لم يُقَس بعد أو أُبطل. */
  readonly result: LiveDiff | null
  readonly busy: boolean
  readonly error: string | null
}

/**
 * تلميحات `capture / area-select` (`59:2`) — نصوصها ومفاتيحها من الملفّ حرفيًا، **بترتيب
 * القراءة**: الشريط `rtl` فأوّل عنصر أقصى اليمين. كانت منسوخة بترتيب أبناء Figma من اليسار،
 * فخرج الشريط مرآة إطاره — العلّة نفسها التي أُصلحت في النافذة.
 */
const AREA_HINTS = [
  { label: 'ثبّت النسبة', key: '⇧' },
  { label: 'من المركز', key: '⌥' },
  { label: 'التقط', key: '↵' },
  { label: 'إلغاء', key: 'esc' },
] as const

/** إجراءات المرحلة 9 — ما تسنده محرّكات موجودة فعلًا لا أكثر. */
const ELEMENT_HINTS: readonly { label: string; key: string }[] = [
  { label: 'تنقّل في DOM', key: '↑↓' },
  { label: 'التقط', key: 'انقر' },
  { label: 'خروج', key: 'esc' },
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
  measure: MeasureTool
  colour: EyedropperTool
  compare: CompareTool
  /**
   * يُطلَب حين يختار المستخدم أداةً أخرى من إجراءات سريعة داخل وضع قائم —
   * رقاقتا «قياس»/«شيفرة» في `capture / element-hover` (`Docs/Engineering.md §6`
   * صفّ 80). تبديلٌ مباشر مثل زرّ نافذة الإضافة تمامًا، لا مسار خاصّ.
   */
  onSwitchMode?: (mode: Mode) => void
  /**
   * يُطلَب حين يضغط المستخدم زرّ صيغة في لوحة الفحص.
   *
   * **تنزيلٌ لا نسخ — الوحدة 19.2.** الاسم بقي `onCopyInspect` تفاديًا
   * لتغيير سلكٍ عبر خمسة ملفّات لفارقٍ داخلي بحت، لكن المستدعي الفعلي في
   * `content/index.ts` ينزِّل ملفًّا اليوم. النصّ المعروض للمستخدم صادقٌ
   * («تنزيل» لا «نسخ») — انظر `InspectPanel.tsx`.
   */
  onCopyInspect?: (kind: 'css' | 'tailwind' | 'json') => void
  /** يُطلَب حين يضغط المستخدم زرّ نسخ في لوحة اللون. */
  /** أداة المرحلة 14 — اختيارية فلا تنكسر أي تركيبة قائمة بدونها. */
  colourUsage?: ColourUsageTool
  /** أداة استخراج اللوحة (`colors / palette-extract`). */
  colourPalette?: ColourPaletteTool
  /** أداة توليد الدرجات (`colors / scale`). */
  colourScale?: ColourScaleTool
  onScanColourUsage?: () => void
  /**
   * يُطلَب حين يضغط المستخدم «جرّب بديلًا» — **غير مُمرَّرة من `content/index.ts`
   * بعد**، فالزرّ لا يظهر (نفس حراسة `onGenerateScale`/`usage` الاختيارية).
   *
   * `ReplacePanel.tsx` مبنيّ ومُختبَر كاملًا، لكن لا مسار مبنيّ يختار «اللون
   * البديل» — لا منتقٍ داخل اللوحة، ولا سلك عائد إلى القطّارة. فجوة تفاعل
   * حقيقية موثَّقة في `Docs/Engineering.md §6` صفّ 92، لا سهوًا في هذا الملفّ.
   */
  onReplaceColour?: () => void
  /** يُطلَب حين يضغط المستخدم «توليد الدرجات» على اللون المثبَّت. */
  onGenerateScale?: () => void
  /**
   * يُطلَب بصيغة تصدير من `PalettePanel`/`ScalePanel` — الحمولة نفسها.
   *
   * **تنزيلٌ لا نسخ — الوحدة 19.2.** `PalettePanel`/`ScalePanel` أزرارهما
   * أربعة بالضبط بقياس Figma (`122:157`/`122:211`، ترويسة `PalettePanel.tsx`)
   * — فلا زرّ خامس أُضيف؛ نفس الأزرار غيّرت وجهتها من الحافظة إلى ملفّ.
   */
  onExportPalette?: (format: Exclude<PaletteFormat, 'text'>) => void
  onExportScale?: (format: Exclude<PaletteFormat, 'text'>) => void
  onCopyColour?: (value: string, label: string) => void
  /** يُطلَب حين يحفظ المستخدم لونًا في المكتبة (`§6.15`). */
  onSaveColour?: () => void
  /** «احفظ اللوحة» في لوحة الاستخراج — `palette/save`. */
  onSavePalette?: () => void
  /** «احفظ في المكتبة» في لوحة الدرجات — `palette/save` بالدرجات. */
  onSaveScale?: () => void
  /**
   * إشعارات الأدوات (`content/notices.ts`) — تُرسَم في كل وضع، والخمول منها: الإشعار يأتي
   * غالبًا **بعد** أن تُغلق الأداة (التقاطٌ حُفظ، `Esc`). اختيارية كبقية الأسلاك.
   */
  notices?: NoticeCenter
  /** يُطلَب حين يضغط المستخدم «استخدم آخر لقطة» في حالة المقارنة الفارغة. */
  onCompareUseLastCapture?: () => void
  /** يُطلَب حين يُفلِت المستخدم صورة في منطقة إفلات المقارنة. */
  onCompareDropImage?: (file: File) => void
  /** يُطلَب حين يلصق المستخدم صورة من الحافظة أثناء وضع المقارنة. */
  onComparePasteImage?: (file: File) => void
  /**
   * بطاقات معرض المقاسات — `compare / viewports` (`127:315`). `null` يعني
   * المعرض مغلقًا؛ المصفوفة تصل جاهزة (صورًا مفكوكة أو `null` لكل مقاس لا
   * مرجع له بعد) — هذا المكوّن يعرض ولا يحمِّل، كبقيّة حالات `compare/*`.
   */
  viewportGallery: Signal<readonly ViewportGalleryCard[] | null>
  /** يُطلَب حين يفتح المستخدم المعرض من زرّ «المقاس الحالي» في لوحة المقارنة. */
  onOpenViewportGallery?: () => void
  /** يُطلَب حين يغلق المستخدم المعرض. */
  onCloseViewportGallery?: () => void
  /** يُطلَب حين يُفلِت المستخدم صورة على بطاقة مقاس بعينه داخل المعرض. */
  onViewportGalleryDropImage?: (viewport: Viewport, file: File) => void
  /**
   * حالة الفرق الحيّ — `compare/diff` (سدادُ دَيْن المرحلة 16 على 17).
   *
   * **إشارة واحدة لا ثلاث**: النتيجة وحالة الانشغال والخطأ تُقرأ معًا في
   * كل رسمة، وفصلها إلى ثلاث خصائص يضاعف السلك بلا مكسب. و`Readonly`
   * لأنها محسوبة في `content/index.ts` (تسقط النتيجة تلقائيًّا متى تغيّر
   * المقاس) — العرض لا يكتب فيها.
   *
   * اختيارية: غيابها يُخفي القسم والزرّ في `ComparePanel` بلا تعطيل ظاهري
   * (سابقة المرحلة 7)، فيبقى بقيّة الملفّ صالحًا لمستدعٍ لا يملك سلكها.
   */
  compareDiff?: ReadonlySignal<CompareDiffView>
  /** يُطلَب حين يضغط المستخدم «التقط الفرق». */
  onCaptureCompareDiff?: () => void
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
  /**
   * المشكلات (`STAGES/32`): نموذج «سجّل مشكلة» بجوار لوحة الأداة، ولوحة «مشكلات هذه الصفحة» في وضع
   * `issues`. اختيارية كبقيّة الأسلاك — غيابها يُخفي الأزرار لا يعطّلها صامتة.
   */
  issues?: IssuesController
  /** «سجّل مشكلة» في لوحة فحص أو قياس أو لون — يفتح النموذج على عنصرها. */
  onLogIssue?: (source: IssueSource) => void
  /** «أعد الفحص» في لوحة الصفحة — الإيماءة تُقرأ عند النقر لا هنا. */
  onRecheckIssues?: () => void
  onOpenIssuesLibrary?: () => void
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
  | 'mode'
  | 'element'
  | 'inspect'
  | 'measure'
  | 'colour'
  | 'compare'
  | 'onCopyInspect'
  | 'onCopyColour'
  | 'onSaveColour'
  | 'onCompareUseLastCapture'
  | 'onCompareDropImage'
  | 'onComparePasteImage'
  | 'fullPage'
  | 'onCancelFullPage'
  | 'viewportGallery'
  | 'onOpenViewportGallery'
  | 'onCloseViewportGallery'
  | 'onViewportGalleryDropImage'
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
 * **أربع رقاقات الآن، لا اثنتان.** الملفّ (`59:123`) يعرض قياس (`dimension-h`)،
 * وشيفرة (`code`)، ونسخ، والتقاط — بهذا الترتيب. كانت الأوليان محذوفتين
 * (`Docs/Engineering.md §6` صفّ 27): القياس محرّكه المرحلة 12 والشيفرة المرحلة 11،
 * ولم يكونا موجودَين وقت بناء هذا الملفّ. **كلاهما موجود الآن** — فالمانع
 * الذي أسقطهما («عرضٌ بما لا يقع خلفه شيء») زال، والإضافة سُدَّت هنا (لا في
 * مرحلة 22 كما رجّح صفّ 80 أوّلًا): تبديل وضع مباشر عبر `onSwitchMode`، بلا
 * نقل سياق العنصر المستهدَف — الأداة الجديدة تتتبّع المؤشِّر من جديد، تمامًا
 * كزرّ التبديل في نافذة الإضافة.
 */
function ElementLayer({
  element,
  space,
  onSwitchMode,
}: {
  element: ElementHoverTool
  space: Signal<CoordSpace>
  onSwitchMode?: (mode: Mode) => void
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
        {
          id: 'measure',
          icon: 'dimension-h',
          label: 'قياس',
          onPick: () => onSwitchMode?.('measure'),
        },
        { id: 'code', icon: 'code', label: 'شيفرة', onPick: () => onSwitchMode?.('inspect') },
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

/** المحور المشترك بين مستطيلين — منتصف التقاطع إن تقاطعا، وإلا منتصف المسافة بين مركزيهما. */
function overlapMid(aStart: number, aLen: number, bStart: number, bLen: number): number {
  const lo = Math.max(aStart, bStart)
  const hi = Math.min(aStart + aLen, bStart + bLen)
  if (hi > lo) return (lo + hi) / 2
  return (aStart + aLen / 2 + (bStart + bLen / 2)) / 2
}

/** هامش امتداد خطّ المحاذاة خارج حدود الهدفين — نفَس بصري لا التصاق بالحافّة. */
const ALIGN_MARGIN = 24

function MeasureLayer({
  measure,
  space,
  unit,
  onLogIssue,
}: {
  measure: MeasureTool
  space: Signal<CoordSpace>
  unit: string
  onLogIssue?: () => void
}) {
  const hover = measure.state.hover.value
  const reference = measure.state.reference.value
  const comparison = measure.state.comparison.value
  const freeRect = measure.state.freeRect.value
  const cursor = measure.state.cursor.value
  const s = space.value
  const root = measureRootFontSize()

  const fmt = (px: number): string =>
    unit === 'rem'
      ? formatUnit(Math.round(pxToRem(px, root) * 100) / 100, 'rem')
      : formatUnit(Math.round(px), 'px')

  const sameTarget = !!(
    hover &&
    reference &&
    hover.rect.x === reference.rect.x &&
    hover.rect.y === reference.rect.y &&
    hover.rect.width === reference.rect.width &&
    hover.rect.height === reference.rect.height
  )

  const targetBox = (t: MeasureTarget, role: 'hover' | 'reference') => (
    <>
      <div
        class="rasd-ov-place rasd-ov-mshl"
        data-role={role}
        style={box(t.rect)}
        data-rasd-ov="measure-highlight"
      />
      <BoxModel rect={t.rect} margin={t.edges.margin} padding={t.edges.padding} />
      <Dimension
        rect={{ x: t.rect.x, y: t.rect.y - 20, width: t.rect.width, height: 0 }}
        value={t.rect.width}
      />
      <DimensionVertical
        rect={{ x: t.rect.x + t.rect.width + 12, y: t.rect.y, width: 0, height: t.rect.height }}
        value={t.rect.height}
      />
    </>
  )

  return (
    <>
      {freeRect ? <Marquee rect={freeRect} /> : null}

      {!freeRect && reference ? targetBox(reference, 'reference') : null}
      {!freeRect && hover && !sameTarget ? targetBox(hover, 'hover') : null}

      {!freeRect && reference && hover && !sameTarget && comparison
        ? (['top', 'right', 'bottom', 'left'] as const).map((dir) => {
            const value = comparison.gap[dir]
            if (value < 0) return null
            const emphasis = comparison.gap.nearest === dir
            if (dir === 'right' || dir === 'left') {
              const y = overlapMid(
                reference.rect.y,
                reference.rect.height,
                hover.rect.y,
                hover.rect.height,
              )
              const x =
                dir === 'right'
                  ? reference.rect.x + reference.rect.width
                  : hover.rect.x + hover.rect.width
              return (
                <MeasureGap
                  key={dir}
                  orientation="horizontal"
                  rect={{ x, y, width: value, height: 0 }}
                  value={value}
                  emphasis={emphasis}
                />
              )
            }
            const x = overlapMid(
              reference.rect.x,
              reference.rect.width,
              hover.rect.x,
              hover.rect.width,
            )
            const y =
              dir === 'bottom'
                ? reference.rect.y + reference.rect.height
                : hover.rect.y + hover.rect.height
            return (
              <MeasureGap
                key={dir}
                orientation="vertical"
                rect={{ x, y, width: 0, height: value }}
                value={value}
                emphasis={emphasis}
              />
            )
          })
        : null}

      {!freeRect && reference && hover && !sameTarget && comparison
        ? comparison.alignment.map((m) => {
            const vertical = m.axis === 'left' || m.axis === 'right' || m.axis === 'centerX'
            if (vertical) {
              const from = Math.min(reference.rect.y, hover.rect.y) - ALIGN_MARGIN
              const to =
                Math.max(
                  reference.rect.y + reference.rect.height,
                  hover.rect.y + hover.rect.height,
                ) + ALIGN_MARGIN
              return (
                <AlignGuide
                  key={m.axis}
                  orientation="vertical"
                  position={m.a}
                  from={from}
                  to={to}
                  delta={m.delta}
                />
              )
            }
            const from = Math.min(reference.rect.x, hover.rect.x) - ALIGN_MARGIN
            const to =
              Math.max(reference.rect.x + reference.rect.width, hover.rect.x + hover.rect.width) +
              ALIGN_MARGIN
            return (
              <AlignGuide
                key={m.axis}
                orientation="horizontal"
                position={m.a}
                from={from}
                to={to}
                delta={m.delta}
              />
            )
          })
        : null}

      {/* قراءة الإحداثيات — بلا هدف ولا سحب: مجرّد مؤشِّر فوق خلفية الصفحة. */}
      {!freeRect && !hover && !reference && cursor ? (
        <div
          class="rasd-ov-place"
          style={at({ x: cursor.x + 16, y: cursor.y + 16 })}
          data-rasd-ov="measure-cursor"
        >
          <span class="rasd-ov-badge">
            {fmt(cursor.x)}، {fmt(cursor.y)}
          </span>
        </div>
      ) : null}

      {/*
       * لوحة القياس بين عنصرين — مدخل «سجّل مشكلة» (`STAGES/32`). في ركن `measure / idle` نفسه، وتظهر
       * متى وُجد مرجعٌ وهدفٌ مختلفان.
       */}
      {!freeRect && reference && hover && !sameTarget && comparison ? (
        <div
          class="rasd-ov-place"
          style={at({ x: PANEL_INSET, y: PANEL_TOP })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MeasurePanel
            gap={comparison.gap.nearestValue === null ? 'تداخل' : fmt(comparison.gap.nearestValue)}
            pinned={measure.state.pinned.value}
            {...(onLogIssue ? { onLogIssue } : {})}
          />
        </div>
      ) : null}

      {/* `measure / idle` (`98:251`): لا مرجع ولا هدف ولا سحب — بطاقة الأداة في ركن اللوحة. */}
      {!freeRect && !hover && !reference ? (
        <div class="rasd-ov-place" style={at({ x: PANEL_INSET, y: PANEL_TOP })}>
          <MeasureIdle />
        </div>
      ) : null}

      {/* الإحداثيات المطلقة تبقى غربية دائمًا كما يفرض §3.5، والتحويل px↔rem يقرأه المستهلك أعلاه. */}
      <span hidden data-w={s.layoutWidth} />
    </>
  )
}

/**
 * طبقة اللون — العدسة تتبع المؤشِّر، واللوحة مرساة في ركنها.
 *
 * **اللوحة تُبنى من التثبيت لا من العيّنة الحيّة.** العيّنة الحيّة تتغيّر
 * ستّين مرّة في الثانية، وبناء خمس صيغ واسم Tailwind وفحص تباين مع كل
 * حركة إهدارٌ لا يُرى أثره. فالمعروض حيًّا هو العدسة وشارتها السداسية
 * وحدهما — وهما ما يرسمه الملفّ حيًّا كذلك.
 */
function ColourLayer({
  colour,
  usage,
  palette,
  scale,
  space,
  onCopy,
  onSave,
  onScanUsage,
  onReplace,
  onGenerateScale,
  onExportPalette,
  onExportScale,
  onSavePalette,
  onSaveScale,
  onLogIssue,
}: {
  colour: EyedropperTool
  /** أداة المرحلة 14 — غيابها يُخفي كتلة الاستخدام وزرّ الاستبدال. */
  usage?: ColourUsageTool
  /** أداة استخراج اللوحة — غيابها يعني عدم دعم شاشة `palette-extract` هنا. */
  palette?: ColourPaletteTool
  /** أداة توليد الدرجات — غيابها يُخفي زرّ «توليد الدرجات». */
  scale?: ColourScaleTool
  space: Signal<CoordSpace>
  onCopy?: (value: string, label: string) => void
  onSave?: () => void
  onScanUsage?: () => void
  onReplace?: () => void
  onGenerateScale?: () => void
  onExportPalette?: (format: Exclude<PaletteFormat, 'text'>) => void
  onExportScale?: (format: Exclude<PaletteFormat, 'text'>) => void
  /** «احفظ اللوحة» — تُكتب في المكتبة من الخلفية (`palette/save`). */
  onSavePalette?: () => void
  /** «احفظ في المكتبة» في لوحة الدرجات — المسار نفسه، درجاتٍ لوحةً. */
  onSaveScale?: () => void
  onLogIssue?: () => void
}) {
  const live = colour.state.live.value
  const pinned = colour.state.pinned.value
  const s = space.value

  /*
   * **الكتلة لا تظهر إلّا مع لون مثبَّت.** «مَن يستعمل هذا اللون؟» سؤالٌ
   * عن لونٍ بعينه، وعرضُه أثناء التتبّع الحيّ كان سيعرض عدّادًا يقفز مع
   * كل حركة مؤشِّر — ضجيجٌ لا معلومة.
   */
  const usageView =
    usage && pinned
      ? {
          total: usage.state.hits.value.length,
          rows: usage.state.rows.value,
          scanning: usage.state.scanning.value,
          progress: usage.state.progress.value,
        }
      : undefined
  const highlights = usage?.state.highlights.value ?? []

  const shown = pinned ?? null
  const hex = shown ? shown.formats.hex : live?.pixel ? hexOfPixel(live.pixel) : null

  const paletteOpen = palette?.state.open.value ?? false
  const scaleOpen = scale?.state.open.value ?? false

  return (
    <>
      {live ? (
        <>
          {/* خطّا التصويب من بدائيّة المرحلة 6 نفسها — `65:46` و`65:47`. */}
          <Crosshair point={live.point} linesOnly />
          <Loupe point={live.point} patch={live.patch} cells={LOUPE_CELLS} hex={hex} />
        </>
      ) : null}

      {/*
       * **إبرازُ المستعمِلين يُرسَم في طبقتنا لا على العناصر نفسها.**
       * لمسُ عنصر الصفحة — ولو بـ`outline` — يغيّر تخطيطها أو يشتبك مع
       * أنماطها، ويخلط «الإبراز» بـ«الاستبدال» في مسار التراجع نفسه.
       * وفضاء الإحداثيات هنا فضاء إطار العرض، وهو فضاء طبقة الهندسة
       * نفسه، فلا تحويل.
       */}
      {highlights.map((rect, index) => (
        <div
          key={`${String(rect.x)}:${String(rect.y)}:${String(index)}`}
          class="rasd-ov-cu-mark"
          data-rasd-ov="colour-usage-mark"
          style={{
            insetInlineStart: `${String(rect.x)}px`,
            insetBlockStart: `${String(rect.y)}px`,
            inlineSize: `${String(rect.width)}px`,
            blockSize: `${String(rect.height)}px`,
          }}
        />
      ))}

      <div
        class="rasd-ov-place"
        style={at({ x: PANEL_INSET, y: COLOUR_PANEL_TOP })}
        data-rasd-ov="colour-dock"
      >
        {/*
         * **الثلاث شاشاتٌ بديلة لا كتلٌ إضافية — تشغل الرصيف نفسه.**
         * `palette-extract`/`scale` إطاراهما في Figma مستقلّان تمامًا عن
         * `sampling`/`idle` (`122:157`/`125:355` بلا مسرَح Mock Page في
         * الثانية، بخلاف الأولى) — نفس بنية `mode` في `overlay-app.tsx`:
         * فرعٌ واحد يُرسَم، لا تراكب. والترتيب أدناه أولويّة عرض لا حالات
         * متزامنة مستحيلة: فتح اللوحة يُغلق السلّم ضمنيًّا (`open()` في كل
         * أداة تكتب إشارتها هي وحدها)، فتزامنهما غير ممكن أصلًا.
         */}
        {paletteOpen && palette ? (
          <PalettePanel
            source={palette.state.source.value}
            onSourceChange={(s) => palette.setSource(s)}
            count={palette.state.count.value}
            onCountChange={(c) => palette.setCount(c)}
            readMethod={palette.state.readMethod.value}
            onReadMethodChange={(m) => palette.setReadMethod(m)}
            hideNeutrals={palette.state.hideNeutrals.value}
            onHideNeutralsChange={(v) => palette.setHideNeutrals(v)}
            separateSources={palette.state.separateSources.value}
            onSeparateSourcesChange={(v) => palette.setSeparateSources(v)}
            swatches={palette.state.swatches.value}
            extracting={palette.state.extracting.value}
            droppedNeutrals={palette.state.droppedNeutrals.value}
            {...(palette.state.unavailable.value
              ? { unavailable: palette.state.unavailable.value }
              : {})}
            {...(onExportPalette ? { onExport: onExportPalette } : {})}
            {...(onSavePalette ? { onSave: onSavePalette } : {})}
            onClose={() => palette.close()}
          />
        ) : scaleOpen && scale ? (
          <ScalePanel
            baseHex={scale.state.base.value?.rgb ? formatColour(scale.state.base.value).hex : ''}
            baseSwatch={scale.state.base.value ? formatColour(scale.state.base.value).css : ''}
            steps={scale.state.steps.value}
            stops={scale.stripStops()}
            sample={scale.sampleRows()}
            onStepsChange={(n) => scale.setSteps(n)}
            {...(onExportScale ? { onExport: onExportScale } : {})}
            {...(onSaveScale ? { onSave: onSaveScale } : {})}
            onClose={() => scale.close()}
          />
        ) : shown ? (
          <ColourPanel
            hex={shown.formats.hex}
            swatch={shown.formats.css}
            rows={formatRows(shown.reading, shown.formats, shown.tailwind)}
            variable={variableView(shown)}
            contrast={
              shown.contrast
                ? contrastView(shown.contrast, shown.background?.assumedWhite ?? true)
                : null
            }
            mismatch={shown.mismatch}
            outOfGamut={!shown.reading.inSrgb}
            {...(onCopy ? { onCopy } : {})}
            {...(onSave ? { onSave } : {})}
            {...(usageView ? { usage: usageView } : {})}
            {...(onScanUsage ? { onScanUsage } : {})}
            {...(usage ? { onCancelScan: () => usage.cancel() } : {})}
            {...(usage ? { onHighlightAll: () => usage.highlightAll() } : {})}
            {...(onReplace ? { onReplace } : {})}
            {...(onGenerateScale ? { onGenerateScale } : {})}
            {...(onLogIssue && shown.element ? { onLogIssue } : {})}
            onClose={() => colour.clear()}
          />
        ) : (
          <ColourIdle />
        )}
      </div>

      {/* `colors / error` (`303:22356`) صار إشعار الطبقة المشترك — `content/notices.ts`. */}
      <span hidden data-w={s.layoutWidth} />
    </>
  )
}

/** الشارة الحيّة تحت العدسة — سداسية من بكسل خام بلا مرور بـ`culori`. */
function hexOfPixel(p: { r: number; g: number; b: number }): string {
  const two = (n: number) => n.toString(16).padStart(2, '0')
  return `#${two(p.r)}${two(p.g)}${two(p.b)}`
}

/**
 * طبقة المقارنة (المرحلة 16) — صورة المرجع العائمة ولوحتها المرساة.
 *
 * السحب والعجلة يُوصَلان في `mountOverlayApp` كبقيّة أحداث المؤشِّر لا هنا —
 * نفس تقسيم العمل المتّبع للأوضاع الأخرى (هذا المكوّن عرضٌ فقط). لوحة
 * المفاتيح استثناء: كلّ `*Layer` يملك مستمعه الخاصّ المشروط بحياة المكوّن،
 * تمامًا مثل `AreaLayer`.
 *
 * **مقبض التقسيم القابل للسحب** (`SplitHandle`، `Figma 69:91`/`69:92`)
 * يُرسَم فقط في وضع `split` مع مرجع قائم — يشارك فضاء `ReferenceOverlay`
 * حرفيًّا فيتحرّك معه؛ التفصيل الكامل في تعليق رأس `SplitHandle.tsx` نفسه.
 *
 * **«اختر من المكتبة» بلا معاودة بعد**: يحتاج قناة رسالة وواجهة اختيار من
 * المكتبة غير موجودتين اليوم — فجوة معلَنة، والزرّ يُعرض بلا أثر حتى تُبنيا.
 */
function CompareLayer({
  compare,
  space,
  onUseLastCapture,
  onDropImage,
  viewportGallery,
  onOpenViewportGallery,
  onCloseViewportGallery,
  onViewportGalleryDropImage,
  diff,
  onCaptureDiff,
}: {
  compare: CompareTool
  space: Signal<CoordSpace>
  onUseLastCapture?: () => void
  onDropImage?: (file: File) => void
  viewportGallery: readonly ViewportGalleryCard[] | null
  onOpenViewportGallery?: () => void
  onCloseViewportGallery?: () => void
  onViewportGalleryDropImage?: (viewport: Viewport, file: File) => void
  diff?: CompareDiffView
  onCaptureDiff?: () => void
}) {
  const reference = compare.state.reference.value
  const transform = compare.state.transform.value
  const displayMode = compare.state.displayMode.value
  const blendMode = compare.state.blendMode.value
  const opacity = compare.state.opacity.value
  const splitPosition = compare.state.splitPosition.value
  const splitAxis = compare.state.splitAxis.value
  const blinkShowingLive = compare.state.blinkShowingLive.value
  const s = space.value

  /*
   * المناطق المستثناة (ADR 0034): المستطيل المخزَّن ببكسل المرجع، ومنطقة العنصر بموضعه الحيّ إن وُجد —
   * ثمّ إلى النافذة بتحويل المرجع الحالي، فتُرسم فوق المرجع حيث هو.
   */
  const zones = compare.state.zones.value
  const resolved = compare.state.resolved.value
  const zoneTool = compare.state.zoneTool.value
  const zoneRows = zones.map((zone) => {
    const found = resolved[zone.id]
    const r = found?.rect ?? zone.anchor.rect
    return {
      id: zone.id,
      kind: zone.anchor.kind,
      fallback: found?.fallback ?? false,
      name:
        zone.label ??
        (zone.anchor.kind === 'element'
          ? zone.anchor.selector
          : formatDimensions(zone.anchor.rect.width, zone.anchor.rect.height)),
      rect: referenceRectToViewport(r, transform),
    }
  })

  /**
   * ⇧+سهم = 10px، سهم وحده = 1px (`§8.3`) — نفس نمط `AreaLayer` بالضبط.
   *
   * **الحارس `state.reference.peek()` لازم قبل `preventDefault`**، لا بعده
   * كحال `nudge` الداخلي وحده: بلا مرجع (`compare / no-reference`) يجب أن
   * تُمرَّر الأسهم للصفحة كتمرير عادي — ابتلاعها بلا أثر مرئي يكسر تمرير
   * صفحة طويلة بالأسهم بينما وضع المقارنة نشط دون مرجع بعد.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!compare.state.reference.peek()) return
      const step = event.shiftKey ? NUDGE_STEP_FAST_PX : NUDGE_STEP_PX
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      }
      const delta = moves[event.key]
      if (delta) {
        event.preventDefault()
        compare.nudge(delta[0], delta[1])
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [compare])

  return (
    <>
      {reference ? (
        <ReferenceOverlay
          imageUrl={reference.url}
          transform={transform}
          displayMode={displayMode}
          blendMode={blendMode}
          opacity={opacity}
          splitPosition={splitPosition}
          splitAxis={splitAxis}
          blinkShowingLive={blinkShowingLive}
        />
      ) : null}

      {reference ? (
        <ZoneMarks
          marks={zoneRows}
          draft={compare.state.zoneDraft.value}
          tool={zoneTool}
          bounds={viewportRect(0, 0, s.layoutWidth, s.layoutHeight)}
        />
      ) : null}

      {reference && displayMode === 'split' ? (
        <SplitHandle
          transform={transform}
          naturalWidth={reference.naturalWidth}
          naturalHeight={reference.naturalHeight}
          splitPosition={splitPosition}
          splitAxis={splitAxis}
          onSplitPositionChange={(percent) => compare.setSplitPosition(percent)}
        />
      ) : null}

      <div
        class="rasd-ov-place"
        style={at({ x: PANEL_INSET, y: PANEL_TOP })}
        data-rasd-ov="compare-dock"
      >
        {reference ? (
          <ComparePanel
            displayMode={displayMode}
            opacity={opacity}
            splitPosition={splitPosition}
            viewportLabel={formatDimensions(Math.round(s.layoutWidth), Math.round(s.layoutHeight))}
            onSetDisplayMode={(next) => compare.setDisplayMode(next)}
            onOpacityChange={(percent) => compare.setOpacity(percent)}
            onSplitPositionChange={(percent) => compare.setSplitPosition(percent)}
            onClose={() => compare.setReference(null)}
            diff={diff?.result ?? null}
            diffBusy={diff?.busy ?? false}
            diffError={diff?.error ?? null}
            {...(onOpenViewportGallery ? { onOpenViewportPicker: onOpenViewportGallery } : {})}
            {...(onCaptureDiff ? { onCaptureDiff } : {})}
            zones={zoneRows}
            zoneTool={zoneTool}
            suggestedZones={compare.state.suggested.value.length}
            onDrawZone={() => compare.setZoneTool(zoneTool === 'draw' ? null : 'draw')}
            onPickZone={() => compare.setZoneTool(zoneTool === 'pick' ? null : 'pick')}
            onRemoveZone={(id) => compare.removeZone(id)}
            onAddSuggested={() => compare.addSuggested()}
          />
        ) : (
          <CompareIdle
            {...(onUseLastCapture ? { onUseLastCapture } : {})}
            {...(onDropImage ? { onDropImage } : {})}
          />
        )}
      </div>

      {viewportGallery ? (
        <div
          class="rasd-ov-place rasd-ov-vpg-scrim"
          style={box(viewportRect(0, 0, s.layoutWidth, s.layoutHeight))}
          data-rasd-ov="viewport-gallery-scrim"
          onClick={(e) => {
            // إغلاق بنقرة الخلفية وحدها — `target === currentTarget` يستبعد
            // أي نقرة وقعت على المعرض نفسه أو ما فيه (لوحة غير شفّافة تملأ الحاوية).
            if (e.target === e.currentTarget) onCloseViewportGallery?.()
          }}
        >
          <ViewportGallery
            cards={viewportGallery}
            {...(onCloseViewportGallery ? { onClose: onCloseViewportGallery } : {})}
            {...(onViewportGalleryDropImage ? { onDropImage: onViewportGalleryDropImage } : {})}
          />
        </div>
      ) : null}

      <span hidden data-w={s.layoutWidth} />
    </>
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
/** مسافة مفتاح الصناديق تحت الهامش. */
const LEGEND_GAP_PX = 12

function PinnedBox({ detail, space: s }: { detail: InspectDetail; space: CoordSpace }) {
  const { rect } = detail.snapshot
  const outer = marginRect(
    viewportRect(rect.pageX - s.scrollX, rect.pageY - s.scrollY, rect.width, rect.height),
    detail.edges.margin,
  )
  return (
    <div class="rasd-ov-contents" data-rasd-ov="inspect-selected">
      <BoxModel
        rect={outer}
        margin={detail.edges.margin}
        border={detail.edges.border}
        padding={detail.edges.padding}
      />
      <BoxLegend at={{ x: outer.x, y: outer.y + outer.height + LEGEND_GAP_PX }} />
    </div>
  )
}

function InspectLayer({
  inspect,
  space,
  onCopy,
  onLogIssue,
}: {
  inspect: InspectTool
  space: Signal<CoordSpace>
  onCopy?: (kind: 'css' | 'tailwind' | 'json') => void
  onLogIssue?: () => void
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

      {/*
       * العنصر المثبَّت بنموذج صندوقه ومفتاحه كما في `inspect / element-selected` (`62:2`) — من
       * موضعه في الصفحة لحظة التثبيت، فيتبع التمرير ويبقى على عنصره. والجوانب فيزيائية محلولة من
       * العنصر نفسه (`InspectDetail.edges`).
       */}
      {detail ? <PinnedBox detail={detail} space={s} /> : null}

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
            {...(onLogIssue ? { onLogIssue } : {})}
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

/** لوحة اللون أعلى قليلًا — `65:55` يضعها عند (40, 44). */
const COLOUR_PANEL_TOP = 44

/** النموذج بجوار لوحة الأداة: عرض اللوحة (380) وفجوة — `issue / create` عند (425, 40). */
const FORM_OFFSET_PX = 385
const FORM_WIDTH_PX = 400

/**
 * نموذج «سجّل مشكلة» بجوار لوحة الأداة — في أوضاع الفحص والقياس واللون، ويُغلق مع مغادرة الوضع.
 *
 * يُفتح على يمين اللوحة ما اتّسعت النافذة، ويُزاح إلى داخلها حين تضيق — يغطّي اللوحة ولا يخرج.
 */
function IssueFormLayer({
  issues,
  space,
}: {
  issues: IssuesController | undefined
  space: CoordSpace
}) {
  const model = issues?.state.form.value
  if (!issues || !model) return null
  // بجوار اللوحة ما اتّسعت النافذة، وإلى داخلها حين تضيق — يغطّي اللوحة ولا يخرج.
  const x = Math.min(PANEL_INSET + FORM_OFFSET_PX, space.layoutWidth - FORM_WIDTH_PX)
  return (
    <div class="rasd-ov-place" style={at({ x, y: COLOUR_PANEL_TOP })}>
      <IssueForm
        key={model.subject}
        model={model}
        busy={issues.state.formBusy.value}
        error={issues.state.formError.value}
        onSubmit={(values) => void issues.submit(values)}
        onCancel={() => issues.closeForm()}
        onTyping={(typing) => {
          issues.state.typing.value = typing
        }}
      />
    </div>
  )
}

/** وضع `issues`: إطار كل مشكلة على عنصرها ورقمها، ولوحة «مشكلات هذه الصفحة» في ركن اللوحات. */
function IssuesLayer(props: {
  issues: IssuesController
  onRecheck: () => void
  onOpenLibrary: () => void
  onClose: () => void
}) {
  const { state } = props.issues
  const list = state.list.value
  return (
    <>
      <IssueBoxes list={list} boxes={state.boxes.value} />
      <div class="rasd-ov-place" style={at({ x: PANEL_INSET, y: PANEL_TOP })}>
        <PageIssues
          list={list}
          lines={state.lines.value}
          checkedLabel={state.checked.value}
          page={`${location.host}${location.pathname}`}
          phase={state.phase.value}
          checked={state.checkedAt.value !== null}
          onRecheck={props.onRecheck}
          onOpenLibrary={props.onOpenLibrary}
          onClose={props.onClose}
        />
      </div>
    </>
  )
}

/**
 * أدوات الشريط العائم بترتيب القراءة — `Overlay / Toolbar` في إطارات الأدوات (`62:2`
 * وأخواته): التقاط منطقة، والتقاط عنصر، وفحص، وقياس، ولون، ومقارنة. الإطار يرسم «قلمًا» ويُسقط
 * التقاط العنصر؛ وقائمة الأوضاع تحكم (`Docs/Engineering.md §6` الصفّ 13) — لا وضع تعليق في
 * الصفحة، فالتعليق في المحرّر.
 */
export const DOCK_MODES: readonly Exclude<Mode, 'idle'>[] = [
  'area',
  'element',
  'inspect',
  'measure',
  'colour',
  'compare',
]

/** بُعد الشريط عن أسفل النافذة — `--rasd-space-40`، موضعه في `59:2`. */
export const DOCK_BOTTOM_PX = 40
/** ارتفاع الشريط (`--rasd-control-xl`) والفجوة فوقه لما يُكدَّس عليه من إشعار. */
const DOCK_HEIGHT_PX = 48
const DOCK_GAP_PX = 12

/**
 * الشريط العائم أسفل منتصف النافذة ما دامت أداةٌ مفتوحة، لا في الخمول: التبديل بين الأدوات
 * والخروج بالمؤشِّر لا بالمفاتيح وحدها. في الطبقة نفسها، فيُخفى مع المضيف قبل كل التقاط
 * (`capture/hide-overlay`) ولا يظهر في صورة. وأزراره أسطح التقاط صريحة، فلا يبدأ منها سحبُ
 * منطقة ولا قياس.
 */
export function ToolDock({
  mode,
  space,
  onSwitchMode,
}: {
  mode: Mode
  space: CoordSpace
  onSwitchMode?: ((mode: Mode) => void) | undefined
}): JSX.Element | null {
  if (mode === 'idle') return null
  return (
    <Toolbar
      origin={{ x: space.layoutWidth / 2, y: space.layoutHeight - DOCK_BOTTOM_PX }}
      anchor="bottom-center"
      items={DOCK_MODES.map((m) => ({ mode: m }))}
      active={mode}
      onPick={(m) => onSwitchMode?.(m)}
      onClose={() => onSwitchMode?.('idle')}
    />
  )
}

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
  const dock = <ToolDock mode={mode} space={props.space.value} onSwitchMode={props.onSwitchMode} />
  /*
   * `colors / error` (`303:22356`) **مثبَّت لا عابر**: يبقى ما دامت القطّارة عاجزة عن القراءة، وفي
   * وضع اللون وحده — حلقة الإطار تستدعي القطّارة في كل وضع، وفشلٌ خارجه ليس شأن المستخدم.
   */
  const colourError = mode === 'colour' ? props.colour.state.error.value : null
  // الإشعار آخرًا في كل فرع: فوق ما ترسمه الأداة والشريط.
  const notice = (
    <NoticeLayer
      space={props.space.value}
      mode={mode}
      {...(props.notices ? { notices: props.notices } : {})}
      {...(colourError
        ? {
            pinned: {
              notice: colourReadFailed(colourError),
              onClose: () => {
                props.colour.state.error.value = null
              },
            },
          }
        : {})}
    />
  )
  const logIssue = (source: IssueSource) =>
    props.onLogIssue ? { onLogIssue: () => props.onLogIssue?.(source) } : {}
  const issueForm = <IssueFormLayer issues={props.issues} space={props.space.value} />
  if (mode === 'issues')
    return (
      <>
        {props.issues ? (
          <IssuesLayer
            issues={props.issues}
            onRecheck={() => props.onRecheckIssues?.()}
            onOpenLibrary={() => props.onOpenIssuesLibrary?.()}
            onClose={() => props.onSwitchMode?.('idle')}
          />
        ) : null}
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode === 'inspect')
    return (
      <>
        <InspectLayer
          inspect={props.inspect}
          space={props.space}
          {...(props.onCopyInspect ? { onCopy: props.onCopyInspect } : {})}
          {...logIssue('inspect')}
        />
        {issueForm}
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode === 'element')
    return (
      <>
        <ElementLayer
          element={props.element}
          space={props.space}
          {...(props.onSwitchMode ? { onSwitchMode: props.onSwitchMode } : {})}
        />
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode === 'measure')
    return (
      <>
        <MeasureLayer
          measure={props.measure}
          space={props.space}
          unit={props.measure.state.unit.value}
          {...logIssue('measure')}
        />
        {issueForm}
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode === 'colour')
    return (
      <>
        <ColourLayer
          colour={props.colour}
          space={props.space}
          {...(props.colourUsage ? { usage: props.colourUsage } : {})}
          {...(props.colourPalette ? { palette: props.colourPalette } : {})}
          {...(props.colourScale ? { scale: props.colourScale } : {})}
          {...(props.onCopyColour ? { onCopy: props.onCopyColour } : {})}
          {...(props.onSaveColour ? { onSave: props.onSaveColour } : {})}
          {...(props.onScanColourUsage ? { onScanUsage: props.onScanColourUsage } : {})}
          {...(props.onReplaceColour ? { onReplace: props.onReplaceColour } : {})}
          {...(props.onGenerateScale ? { onGenerateScale: props.onGenerateScale } : {})}
          {...(props.onExportPalette ? { onExportPalette: props.onExportPalette } : {})}
          {...(props.onExportScale ? { onExportScale: props.onExportScale } : {})}
          {...(props.onSavePalette ? { onSavePalette: props.onSavePalette } : {})}
          {...(props.onSaveScale ? { onSaveScale: props.onSaveScale } : {})}
          {...logIssue('colour')}
        />
        {issueForm}
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode === 'compare')
    return (
      <>
        <CompareLayer
          compare={props.compare}
          space={props.space}
          viewportGallery={props.viewportGallery.value}
          {...(props.onCompareUseLastCapture
            ? { onUseLastCapture: props.onCompareUseLastCapture }
            : {})}
          {...(props.onCompareDropImage ? { onDropImage: props.onCompareDropImage } : {})}
          {...(props.onOpenViewportGallery
            ? { onOpenViewportGallery: props.onOpenViewportGallery }
            : {})}
          {...(props.onCloseViewportGallery
            ? { onCloseViewportGallery: props.onCloseViewportGallery }
            : {})}
          {...(props.onViewportGalleryDropImage
            ? { onViewportGalleryDropImage: props.onViewportGalleryDropImage }
            : {})}
          {...(props.compareDiff ? { diff: props.compareDiff.value } : {})}
          {...(props.onCaptureCompareDiff ? { onCaptureDiff: props.onCaptureCompareDiff } : {})}
        />
        {dock}
        {job}
        {notice}
      </>
    )
  if (mode !== 'area')
    return (
      <>
        {job}
        {notice}
      </>
    )
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
      {dock}
      {notice}
    </>
  )
}

/**
 * موضع الإشعار أسفل الوسط: فوق الشريط العائم ما دامت أداة مفتوحة، وفوق شريط التلميحات في
 * المنطقة والعنصر (`HINT_OFFSET_PX`، `59:2` و`59:123`)، وفي مكان الشريط نفسه حين لا أداة —
 * فأكثر الإشعارات يأتي بعد أن تُغلق الأداة: التقاطٌ حُفظ، أو `Esc`.
 *
 * **عمودٌ لا موضعٌ واحد:** المثبَّت (خطأ القطّارة) أقرب إلى الشريط، والعابر فوقه — فلا يحجب
 * أحدهما الآخر، ولا يُحسب ارتفاعٌ لا يُعرف قبل الرسم.
 */
export function NoticeLayer({
  notices,
  space,
  mode,
  pinned,
}: {
  notices?: NoticeCenter
  space: CoordSpace
  mode: Mode
  pinned?: { readonly notice: OverlayNotice; readonly onClose: () => void }
}): JSX.Element | null {
  const notice = notices?.current.value ?? null
  if (!notice && !pinned) return null
  const lift =
    mode === 'idle'
      ? DOCK_BOTTOM_PX
      : mode === 'area' || mode === 'element'
        ? HINT_OFFSET_PX + DOCK_GAP_PX
        : DOCK_BOTTOM_PX + DOCK_HEIGHT_PX + DOCK_GAP_PX
  return (
    <div
      class="rasd-ov-place rasd-ov-notices"
      style={at({ x: space.layoutWidth / 2, y: space.layoutHeight - lift })}
      data-anchor="bottom-center"
      data-rasd-ov="notices"
    >
      {notice ? (
        <div data-rasd-ov="notice">
          <NoticeToast notice={notice} onClose={() => notices?.dismiss()} />
        </div>
      ) : null}
      {pinned ? (
        <div data-rasd-ov="colour-error">
          <NoticeToast notice={pinned.notice} onClose={pinned.onClose} />
        </div>
      ) : null}
    </div>
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
  const onBackground = (e: Event) => e.target === layer

  const onMove = (e: PointerEvent) => {
    if (props.mode.value === 'element') {
      if (onBackground(e)) props.element.onPointerMove(e)
      return
    }
    if (props.mode.value === 'measure') {
      if (onBackground(e)) props.measure.onPointerMove(e)
      return
    }
    if (props.mode.value === 'colour') {
      // بلا `onBackground`: العدسة وشارتها `pointer-events: none`، لكن
      // اللوحة ليست كذلك. والحركة فوق اللوحة يجب ألّا تحرّك العدسة، فيبقى
      // الشرط لازمًا هنا بخلاف وضع القياس.
      if (onBackground(e)) props.colour.onPointerMove(e)
      return
    }
    if (props.mode.value === 'compare') {
      // بلا `onBackground` كذلك: سحبٌ جارٍ (بدأ فوق الخلفية) يجب أن يتابع
      // حتى لو عبر المؤشِّر فوق اللوحة منتصف الحركة — نفس اعتبار `measure`
      // بالضبط. والأداة تتجاهل الحركة أصلًا حين لا سحب جارٍ (`!dragStart`).
      props.compare.onPointerMove(e)
      return
    }
    props.area.handlers.onPointerMove(e)
  }
  const onUp = (e: PointerEvent) => {
    if (props.mode.value === 'element') return
    if (props.mode.value === 'measure') {
      props.measure.onPointerUp()
      return
    }
    if (props.mode.value === 'colour') {
      if (onBackground(e)) props.colour.onPointerUp(e)
      return
    }
    if (props.mode.value === 'compare') {
      // إفلاتٌ فوق اللوحة لا يُنهي منطقةً على ما تحتها: نقرة زرّ فيها ليست اختيار عنصر من الصفحة.
      props.compare.onPointerUp(onBackground(e) ? e : undefined)
      return
    }
    props.area.handlers.onPointerUp(e)
  }
  const onDown = (e: PointerEvent) => {
    if (props.mode.value === 'element') {
      if (onBackground(e)) props.element.onPointerDown(e)
      return
    }
    if (props.mode.value === 'compare') {
      // بعكس الحركة والإفلات: الضغط هو ما *يبدأ* السحب، فنقرة على اللوحة
      // (مقبض منزلق، زرّ إغلاق) يجب ألّا تبدأ سحب مرجع تحتها.
      if (onBackground(e)) props.compare.onPointerDown(e)
      return
    }
    if (props.mode.value === 'measure') {
      // بلا `onBackground`: نقرة على أحد بدائيّاتنا (إبراز، خطّ قياس) تعني
      // أن المستخدم يهدف إلى عنصر الصفحة **تحتها** — `pickAt` يستهدف
      // بالإحداثيات لا بهدف الحدث، فيصيب العنصر الصحيح رغم أن الحدث وقع
      // على طبقتنا. البدائيّات كلّها `pointer-events: none` أصلًا فلن يصلها
      // الحدث فعليًّا، والحارس هنا زيادة أمان لا حاجة فعلية.
      props.measure.onPointerDown(e)
      return
    }
    /*
     * وضع اللون **يبتلع الضغط ولا يمرّره**.
     *
     * أداة اللون لا تحتاج `pointerdown` (القراءة عند الإفلات كما في
     * الفحص)، لكن السقوط إلى `area` هنا ليس حيادًا: معالجه يبدأ سحب تحديد
     * ويأسر المؤشِّر، فيتغيّر هدف `pointerup` التالي ولا يصل الأداة أبدًا.
     * قِيس ذلك في `verify-colour.mjs`: صفر تثبيت رغم أن `pointermove`
     * يصل سليمًا — والفرق أن الحركة لا تمرّ بـ`onDown`.
     */
    if (props.mode.value === 'colour') return
    // نقرة على خلفية الطبقة (لا على مقبض ولا على جسم التحديد) تبدأ سحبًا
    // جديدًا. المقابض توقف الانتشار بنفسها.
    if (onBackground(e)) props.area.handlers.onPointerDown(e)
  }

  layer.addEventListener('pointerdown', onDown)
  layer.addEventListener('pointermove', onMove)
  layer.addEventListener('pointerup', onUp)
  layer.addEventListener('pointercancel', onUp)

  /**
   * عجلة الفأرة — وضع المقارنة وحده يقرؤها اليوم؛ لا مستمع عجلة سابق في
   * هذا الملفّ. `passive: false` لازم: `compare.onWheel` يستدعي
   * `preventDefault()` داخليًا كي لا تُمرِّر الصفحة تحتها.
   */
  const onWheel = (e: WheelEvent) => {
    if (props.mode.value !== 'compare') return
    if (!onBackground(e)) return
    props.compare.onWheel(e)
  }
  layer.addEventListener('wheel', onWheel, { passive: false })

  /**
   * لصق صورة من الحافظة — وضع المقارنة وحده، على المستند لا على الطبقة:
   * حدث `paste` لا يقع إلا على العنصر ذي التركيز، وطبقتنا `pointer-events:
   * none` جزئيًا فلا تُركَّز أبدًا. انظر تعليق الفجوة المعلَنة في
   * `ComparePanel.tsx` — هذا هو سلكها الموعود.
   *
   * `capture: true` **لازم** كبقيّة مستمعي المستند/النافذة في هذا الملفّ:
   * بلاه، مستمع الصفحة نفسها (محرِّر نصوص غنيّ يستدعي `stopPropagation`
   * على `paste` — نمط شائع) يُنفَّذ أوّلًا في طور الفقاعة ويقطع الحدث قبل
   * وصوله إلينا، فيبتلع اللصق بلا أثر رغم أن وضع المقارنة نشط.
   */
  const onPaste = (e: ClipboardEvent) => {
    if (props.mode.value !== 'compare') return
    const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return
    e.preventDefault()
    props.onComparePasteImage?.(file)
  }
  layer.ownerDocument.addEventListener('paste', onPaste, { capture: true })

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
      layer.removeEventListener('wheel', onWheel)
      layer.ownerDocument.removeEventListener('paste', onPaste, { capture: true })
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
  kind: CaptureKind,
  rect: ReturnType<typeof viewportRect> | null,
  s: CoordSpace,
) {
  return send('capture/run', {
    kind,
    rect: rect ? viewportRectToDevice(rect, s) : null,
    dpr: s.dpr,
  })
}
