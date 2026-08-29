/**
 * نقطة دخول الطبقة داخل الصفحة.
 *
 * تُحقن يدويًا عبر `chrome.scripting` بعد إيماءة المستخدم — لا
 * `content_scripts` في البيان، وهو أهمّ قرار خصوصية في المشروع
 * ([ADR 0005](../../Docs/ADR/0005-manual-injection.md)).
 *
 * ترتيب التفكيك معكوس ترتيب التركيب عمدًا: المستمعات أوّلًا ثم المضيف
 * أخيرًا، حتى لا يُطلَق معالج على مضيف أُزيل.
 */

import { signal } from '@preact/signals'

import { onMessage, send } from '@/shared/messaging'
import { isMode, type Mode } from '@/shared/modes'
import { errWith, ok, type RasdError, type Result } from '@/shared/result'
import { getSettings } from '@/shared/settings'

import { copyCaptureToClipboard } from './clipboard'
import { readSpace, viewportRect, watchDpr, type CoordSpace } from './coords'
import { blockedFrames, isTopFrame } from './frames'
import { adoptTeardown, mountHost, type OverlayHost } from './host'
import { createModeManager, type ModeManager } from './mode-manager'
import { mountOverlayApp, requestCapture } from './overlay-app'
import { startPersistence, type Persistence } from './persistence'
import { installShortcuts, type ShortcutAction } from './shortcuts'
import { startSync, type SyncLoop } from './sync'
import { createAreaSelect } from './tools/area-select'
import { createElementHover, type ElementHoverTool } from './tools/element-hover'

import type { AreaSelectTool } from './tools/area-select'

export interface OverlaySession {
  readonly host: OverlayHost
  readonly modes: ModeManager
  readonly sync: SyncLoop
  readonly persistence: Persistence
  /** لقطة الإحداثيات الحالية — تُحدَّث مرّة لكل إطار. */
  space(): CoordSpace
  /** أداة تحديد المنطقة — يقرأ حالتها فحصُ المتصفّح الحقيقي. */
  readonly area: AreaSelectTool
  /** آخر التقاط نجح؛ `null` قبل أوّل واحد. */
  lastCapture(): { id: string; width: number; height: number } | null
  teardown(): void
}

export interface StartOptions {
  doc?: Document
  /** وضع البداية — عادةً `idle`، ويأتي من الأمر الذي حقننا. */
  initialMode?: Mode
  /** يُستدعى بعد كل إطار مزامنة، بعد تحديث اللقطة. */
  onFrame?: (space: CoordSpace) => void
  /** أمر لا يملك الطبقة معالجًا له بعد (`palette` مثلًا — المرحلة 7). */
  onAction?: (action: ShortcutAction) => void
}

/**
 * يشغّل الطبقة في هذا المستند.
 *
 * الإطارات غير العليا **لا ترسم**: نسخة الشيفرة تعمل فيها (الحقن
 * `allFrames: true`) لكنها تبقى صامتة، وإلا ظهرت طبقة داخل كل إطار.
 */
export async function startOverlay(
  options: StartOptions = {},
): Promise<Result<OverlaySession, RasdError>> {
  const doc = options.doc ?? document
  const win = doc.defaultView
  if (!win) return errWith('unknown', 'لا نافذة لهذا المستند')

  if (!isTopFrame(win)) {
    return errWith('cancelled', 'إطار داخلي — الرسم للإطار الأعلى وحده')
  }

  const mounted = await mountHost(doc)
  if (!mounted.ok) return mounted
  const host = mounted.value

  const modes = createModeManager(options.initialMode ?? 'idle')

  let space = readSpace(win)

  const sync = startSync({
    doc,
    onFrame: (reasons) => {
      // كل قراءة تخطيط تحدث هنا وحدها، مرّة لكل إطار — لا داخل معالج تمرير.
      space = readSpace(win)
      spaceSignal.value = space
      // أداة العنصر تُعلَّق على هذه الحلقة لا على حلقة ثانية: الحلقة الثانية
      // تأخذ لقطة إحداثيات مستقلّة عن هذه فتتناقضان داخل الإطار الواحد.
      elementTool?.frame(reasons)
      options.onFrame?.(space)
    },
  })

  // تُسنَد بعد إنشاء الأداة: الحلقة تبدأ قبلها، والأداة تحتاج `host`.
  let elementTool: ElementHoverTool | null = null

  const stopDpr = watchDpr(() => sync.invalidate('dpr'), win)

  const persistence = startPersistence({
    doc,
    isAttached: () => host.hostEl.isConnected,
    reattach: () => host.reassert(),
    onRouteChange: () => {
      // تغيّر المسار يُنهي أي وضع نشط: العنصر المحدَّد لم يعد موجودًا.
      modes.escape()
      host.reassert()
      sync.invalidate('manual')
    },
  })

  /**
   * كل تغيّر وضع يُبلَّغ إلى الـservice worker — النافذة (المرحلة 7) تقرأه
   * عبر `session/get` لتعرض حالتها الحيّة (`capturing` · `inspect-active` ·
   * `colors`) بلا انتظار محرّك لم يُبنَ بعد. لا ينتظر الردّ ولا يرمي عند
   * الفشل: تقرير مفقود يعني نافذة تعرض الحالة الافتراضية، لا عطل في الطبقة.
   */
  const reportMode = (mode: Mode) => void send('mode/report', { mode })
  const unsubscribeReport = modes.subscribe((mode) => reportMode(mode))
  reportMode(modes.mode.value)

  /**
   * أمر خارجي (نافذة · اختصار · قائمة سياق) يبدّل الوضع مباشرة — لا يمرّ
   * من `installShortcuts`، لأنه لا يحمل حدث لوحة مفاتيح يحرسه `capture`.
   * يُسجَّل هنا لا في مستوى الوحدة: الاستجابة له بلا جلسة قائمة سلوك خاطئ
   * لا مجرّد فرصة ضائعة.
   */
  const unregisterModeSet = onMessage('mode/set', ({ mode }) => {
    if (isMode(mode)) modes.set(mode)
    return { ok: true }
  })

  /**
   * ── أداة الالتقاط (المرحلة 8) ──────────────────────────────────
   *
   * لقطة الإحداثيات تُنشر كإشارة: العرض يقرؤها، و`startSync` يكتبها مرّة لكل
   * إطار. هذا يجعل التحديد يتبع التمرير وتغيّر المقاس بلا مستمع خاصّ به.
   */
  const spaceSignal = signal<CoordSpace>(space)
  const delaySignal = signal(0)
  let copyAfterCapture = false
  void getSettings().then((settings) => {
    delaySignal.value = settings.capture.delaySeconds
    copyAfterCapture = settings.capture.copyToClipboard
  })

  /** آخر نتيجة التقاط — تُقرأ في الاختبار والتشخيص. */
  let lastCapture: { id: string; width: number; height: number } | null = null

  /** التقاط ظاهر مؤجَّل ينتظر انتهاء العدّ — لا تحديد له. */
  const pendingViewport = signal(false)

  const runCaptureNow = (rect: ReturnType<typeof viewportRect> | null) => {
    void (async () => {
      const reply = await requestCapture(rect ? 'area' : 'viewport', rect, spaceSignal.peek())
      pendingViewport.value = false
      if (reply.ok) {
        lastCapture = reply.value
        // النسخ **بعد** الحفظ لا بدلًا منه: فشله يترك اللقطة في المكتبة.
        if (copyAfterCapture) {
          const copied = await copyCaptureToClipboard(reply.value.id)
          if (!copied.ok) console.warn(`[رصد] ${copied.error.message}`)
        }
        // الالتقاط ينهي الوضع: بقاء التحديد بعده يوحي بأن شيئًا لم يحدث.
        area.reset()
        modes.escape()
      } else {
        // الفشل يترك التحديد قائمًا كي يعيد المستخدم المحاولة بلا إعادة رسم.
        console.warn(`[رصد] تعذّر الالتقاط: ${reply.error.message}`)
      }
    })()
  }

  const area = createAreaSelect({
    bounds: () => {
      const s = spaceSignal.peek()
      return viewportRect(0, 0, s.layoutWidth, s.layoutHeight)
    },
    onCommit: runCaptureNow,
    onCancel: () => modes.escape(),
    // السحب الجاري يمنع تبديل الوضع تحته — `Esc` وحده يتجاوزه.
    onBusy: (busy) => {
      modes.busy.value = busy
    },
  })

  /**
   * أداة كشف العناصر.
   *
   * `skip` هو مضيفنا: يتصدّر كل اختبار إصابة ما دام الدرع مرفوعًا،
   * ويُستبعَد بالهُويّة لا بالموضع.
   */
  const element = createElementHover({
    doc,
    skip: host.hostEl,
    onCommit: (rect) => runCaptureNow(rect),
    onCancel: () => modes.escape(),
    onBusy: (busy) => {
      modes.busy.value = busy
    },
    onInvalidate: () => sync.invalidate('pointer'),
    onCopySelector: (selector) => {
      void navigator.clipboard?.writeText(selector).catch(() => {
        console.warn('[رصد] تعذّر نسخ المحدِّد إلى الحافظة.')
      })
    },
  })

  elementTool = element

  const app = mountOverlayApp(host.layer, {
    mode: modes.mode,
    area,
    element,
    space: spaceSignal,
    delaySeconds: delaySignal,
    pendingViewport,
    onCapture: runCaptureNow,
  })

  /**
   * الأوضاع التي تبتلع فيها الطبقة المؤشِّر.
   *
   * في غيرها تبقى خاملة كما بنتها المرحلة 6، فلا تمنع تمرير الصفحة ولا نقرها.
   *
   * **وضع العنصر يحتاج الدرع لا يستغني عنه.** بدونه تملك الصفحة النقرة،
   * فالنقر على رابط يغادرها قبل أن نلتقط؛ وأنماط `:hover` الخاصّة بها تشتغل
   * تحت المؤشِّر فتُغيّر العنصر الذي يفحصه المستخدم قبل التقاطه.
   */
  const INTERACTIVE_MODES = new Set<Mode>(['area', 'element'])

  const unsubscribeInteractive = modes.subscribe((mode) => {
    host.setInteractive(INTERACTIVE_MODES.has(mode))
    if (mode !== 'area') area.reset()
    if (mode !== 'element') element.reset()
  })
  host.setInteractive(INTERACTIVE_MODES.has(modes.mode.value))

  /**
   * الخلفية تطلب الإخفاء قبل أن تلتقط.
   *
   * الطبقة في DOM الصفحة وفي طبقتها العليا، فـ`captureVisibleTab` يراها.
   * `host.hide()` ينتظر إطارَي رسم قبل أن يردّ — الردّ نفسه هو الضمانة.
   */
  /**
   * التقاط فوري بأمر من الخلفية (`viewport`).
   *
   * يمرّ من هنا لا من الخلفية مباشرةً لسببين: عدّاد التأجيل يجب أن يُعرَض
   * ويُلغى داخل الصفحة، وكثافة البكسل الحيّة لا تُقرأ إلا هنا.
   */
  const unregisterStart = onMessage('capture/start', ({ kind }) => {
    if (kind === 'viewport') {
      const seconds = delaySignal.peek()
      if (seconds > 0) {
        // التأجيل يمرّ عبر وضع «منطقة» بلا تحديد: العدّاد يعيش في العرض،
        // والطبقة تبقى خاملة للمؤشِّر فيستطيع المستخدم فتح قائمة أثناء العدّ.
        pendingViewport.value = true
        modes.set('area')
      } else {
        runCaptureNow(null)
      }
    }
    return { started: true }
  })

  const unregisterHide = onMessage('capture/hide-overlay', async () => {
    await host.hide()
    return { hidden: true }
  })
  const unregisterShow = onMessage('capture/show-overlay', () => {
    host.show()
    return { shown: true }
  })

  const removeShortcuts = installShortcuts({
    doc,
    // `Esc` يُبتلع فقط حين يكون له معنى عندنا — وإلا فهو مفتاح الصفحة.
    shouldSwallowEscape: () => modes.mode.value !== 'idle',
    onAction: (action) => {
      switch (action.kind) {
        case 'mode':
          modes.set(action.mode)
          break
        case 'escape':
          if (modes.mode.value !== 'idle') modes.escape()
          break
        default:
          options.onAction?.(action)
      }
    },
  })

  let torn = false
  const teardown = () => {
    if (torn) return
    torn = true
    // الترتيب معكوس ترتيب التركيب: المستمعات ومراقب البقاء أوّلًا، وإلا
    // رأى المراقبُ المضيفَ يختفي فأعاد إلحاقه في اللحظة نفسها.
    removeShortcuts()
    unregisterModeSet()
    unregisterStart()
    unregisterHide()
    unregisterShow()
    unsubscribeInteractive()
    app.unmount()
    area.dispose()
    stopDpr()
    persistence.stop()
    sync.stop()
    unsubscribeReport()
    // النافذة تعتمد على وضع مبلَّغ يعكس الواقع — تفكيك بلا تقرير idle أخير
    // يترك مؤشِّرًا حيًّا كاذبًا لجلسة انتهت فعلًا.
    reportMode('idle')
    modes.dispose()
    host.teardown()
  }

  // من الآن، أي نداء تفكيك على علامة النافذة يوقف الجلسة كاملةً لا المضيف
  // وحده — وهو ما يجعل التفكيك نظيفًا أيًّا كان من طلبه.
  adoptTeardown(teardown, doc)

  return ok({
    host,
    modes,
    sync,
    persistence,
    space: () => space,
    area,
    element,
    lastCapture: () => lastCapture,
    teardown,
  })
}

export { readSpace, blockedFrames, isTopFrame }
export type { CoordSpace, OverlayHost, ModeManager }
