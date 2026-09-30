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

import { computed, signal } from '@preact/signals'

import { captureKindFor, type CaptureSource } from '@/modules/capture/kind'
import { exportPalette, exportScale, type PaletteFormat } from '@/modules/colour/export'
import { formatColour } from '@/modules/colour/formats'
import { revertAll } from '@/modules/colour/replace'
import { classifyViewport, VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { toCss, toJson, toTailwindText } from '@/modules/style-export/css'
import { base64ToBlob, blobToBase64 } from '@/shared/base64'
import { onMessage, send } from '@/shared/messaging'
import { isMode, type Mode } from '@/shared/modes'
import { errWith, ok, type RasdError, type Result } from '@/shared/result'
import { getSettings, watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

import { copyCaptureToClipboard } from './clipboard'
import { readSpace, viewportRect, watchDpr, type CoordSpace } from './coords'
import { createCssResolver } from './css-resolver'
import { blockedFrames, isTopFrame } from './frames'
import { adoptTeardown, mountHost, type OverlayHost } from './host'
import { createModeManager, type ModeManager } from './mode-manager'
import {
  captureFailed,
  captureNotCopied,
  captureSaved,
  colourSaved,
  createNoticeCenter,
  exitNotice,
  FILE_FAILED,
  fileSaved,
  paletteSaved,
  saveFailed,
  valueCopied,
  valueCopyFailed,
} from './notices'
import { mountOverlayApp, requestCapture } from './overlay-app'
import { reportAcrossPageLifecycle } from './page-report'
import { startPersistence, type Persistence } from './persistence'
import { saveTextFile } from './save-file'
import { installShortcuts, liveBindings, type ShortcutAction } from './shortcuts'
import { startSync, type SyncLoop } from './sync'
import { createAreaSelect } from './tools/area-select'
import { createColourPalette } from './tools/colour-palette'
import { createColourScale } from './tools/colour-scale'
import { createColourUsage, type ColourUsageTool } from './tools/colour-usage'
import { createCompare, type CompareTool, type ReferenceImage } from './tools/compare'
import { createElementHover, type ElementHoverTool } from './tools/element-hover'
import { createEyedropper, type EyedropperTool } from './tools/eyedropper'
import {
  finishFullPage,
  hasFullPageSession,
  prepareFullPage,
  stepFullPage,
} from './tools/full-page'
import { createInspect } from './tools/inspect'
import { createMeasure, type MeasureTool } from './tools/measure'

import type { AreaSelectTool } from './tools/area-select'
import type { LiveDiff } from '@/shared/messaging/contract'
import type { Viewport } from '@/shared/storage/schema'
import type { ViewportGalleryCard } from '@/ui/overlay'

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
 * مفتاح الجلسة الحيّة على `window`.
 *
 * **على `window` لا في مجال الوحدة**: `chrome.scripting.executeScript`
 * **يعيد تنفيذ** `content.js` كاملًا عند كل تفعيل، فكل حقن يبني إغلاق
 * IIFE جديدًا بمتغيّراته الخاصّة — وحارسٌ في مجال الوحدة لا يرى الجلسة
 * التي بناها حقنٌ سابق فيبني ثانيةً فوقها. نفس علّة `FLAG` في `host.ts`
 * وحلّها نفسه.
 *
 * ويحمل **الوعد** لا النتيجة: تفعيلان متسارعان قد يبدآن قبل أن ينتهي
 * `mountHost` غير المتزامن، فلو خُزِّنت النتيجة وحدها لعبَر الثاني الحارس
 * وبنى جلسة موازية. تخزين الوعد يجعل الثاني ينتظر الأوّل ويعيده.
 */
const SESSION_FLAG = '__rasdSession'

declare global {
  interface Window {
    [SESSION_FLAG]?: Promise<Result<OverlaySession, RasdError>>
  }
}

/**
 * يشغّل الطبقة في هذا المستند، أو يعيد الجلسة القائمة.
 *
 * **آمن التكرار**: `mountHost` يعيد المضيف القائم بدل بناء ثانٍ (منذ
 * المرحلة 6)، لكن ذلك وحده لا يكفي — الجلسة نفسها (الأدوات، ومستقبِلات
 * الرسائل، والمستمعات، وحلقة المزامنة) كانت تُبنى مرّة أخرى فوق المضيف
 * الواحد: مستقبِلان لكل رسالة، ومراقبا بقاء متسابقان. فالحارس هنا على
 * مستوى الجلسة لا المضيف.
 */
export async function startOverlay(
  options: StartOptions = {},
): Promise<Result<OverlaySession, RasdError>> {
  const doc = options.doc ?? document
  const win = doc.defaultView
  if (!win) return errWith('unknown', 'لا نافذة لهذا المستند')

  const running = win[SESSION_FLAG]
  if (running) return running

  const booting = bootOverlay(doc, win, options)
  win[SESSION_FLAG] = booting
  const result = await booting
  // إقلاعٌ فاشل لا يجوز أن يسدّ محاولة تالية — الحارس للجلسة الحيّة وحدها.
  if (!result.ok && win[SESSION_FLAG] === booting) delete win[SESSION_FLAG]
  return result
}

/**
 * الإطارات غير العليا **لا ترسم**: نسخة الشيفرة تعمل فيها (الحقن
 * `allFrames: true`) لكنها تبقى صامتة، وإلا ظهرت طبقة داخل كل إطار.
 */
async function bootOverlay(
  doc: Document,
  win: Window,
  options: StartOptions,
): Promise<Result<OverlaySession, RasdError>> {
  if (!isTopFrame(win)) {
    return errWith('cancelled', 'إطار داخلي — الرسم للإطار الأعلى وحده')
  }

  const mounted = await mountHost(doc)
  if (!mounted.ok) return mounted
  const host = mounted.value

  /*
   * `host.hostEl` لا `doc.documentElement`: `tokens-shadow.css` يستهدف
   * `:host([data-theme=…])`/`:host([lang=…])` من داخل الظلّ، وكتابة السمة
   * على مستند الصفحة كانت تغيّر `lang`/`dir` لصفحة لا نملكها — الوحدة 20.1.
   */
  const stopTheme = watchSettings((settings) => applyTheme(settings, host.hostEl))

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
      inspectTool?.frame(reasons)
      measureTool?.frame(reasons)
      // **القطّارة في وضعها وحده.** إطارها يطلب لقطة كلّما وجد عيّنته قديمة —
      // وهي قديمة عند الإقلاع وبعد كل `reset()` وكل تمرير — واللقطة تُخفي
      // الطبقة. فكانت تُلتقط الشاشة في كل وضع، وتُبتلع أحداث المؤشِّر والعجلة
      // التي تقع أثناء الإخفاء على المضيف لا الطبقة (`STAGES/04`: سبب تقطّع
      // `verify:compare`، والصفّ 145 (أ) في `Docs/Engineering.md §6`).
      if (modes.mode.peek() === 'colour') colourTool?.frame(reasons)
      colourUsageTool?.frame()
      compareTool?.frame(reasons)
      options.onFrame?.(space)
    },
  })

  // تُسنَد بعد إنشاء الأدوات: الحلقة تبدأ قبلها، وهي تحتاج `host`.
  let elementTool: ElementHoverTool | null = null
  let inspectTool: ReturnType<typeof createInspect> | null = null
  let measureTool: MeasureTool | null = null
  let colourTool: EyedropperTool | null = null
  let colourUsageTool: ColourUsageTool | null = null
  let compareTool: CompareTool | null = null

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

  // مغادرة المستند تُبلِّغ الخمول، والعودة من ذاكرة الرجوع تعيد الوضع — `page-report.ts`.
  const stopPageReport = reportAcrossPageLifecycle(win, reportMode, () => modes.mode.value)

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

  /** إشعارات الأدوات فوق الصفحة — `notices.ts`: ما حُفظ، وما نُسخ، وما تعذّر، وكيف تعود. */
  const notices = createNoticeCenter()
  /** «افتح» في الإشعار: الصفحة في تبويب جديد، كما تفتحها النافذة والمكتبة. */
  const openPage = (page: 'editor' | 'library', params: Record<string, string>) =>
    void send('page/open', { page, params })

  const delaySignal = signal(0)
  let copyAfterCapture = false
  // حيّان لا مقروءان مرّة: من غيّر التأجيل أو النسخ من الإعدادات والطبقة قائمة يرى أثره في
  // الالتقاط التالي — صنف الصفّ 117 في `§6`، وكان إعدادا الالتقاط هذان خارجه (الصفّ 145 (ج)).
  const stopCaptureSettings = watchSettings((settings) => {
    delaySignal.value = settings.capture.delaySeconds
    copyAfterCapture = settings.capture.copyToClipboard
  })

  /** آخر نتيجة التقاط — تُقرأ في الاختبار والتشخيص. */
  let lastCapture: { id: string; width: number; height: number } | null = null

  /** التقاط ظاهر مؤجَّل ينتظر انتهاء العدّ — لا تحديد له. */
  const pendingViewport = signal(false)

  /**
   * تقدّم الالتقاط الكامل — `null` يعني لا مهمّة.
   *
   * إشارة لا حالة ساكنة: اللوحة داخل الطبقة تقرؤها فتُعاد رسمتها عند كل
   * بلاطة، وهي كتابة واحدة لكل ~550ms لا لكل إطار.
   */
  const fullPage = signal<{ done: number; total: number; note: string } | null>(null)

  /**
   * `source` يفصل أداة المنطقة عن أداة العنصر.
   *
   * وجود المستطيل وحده لا يميّزهما — كلتاهما تُسلّم مستطيلًا — وكان النوع
   * يُشتقّ منه فيُسجَّل كل التقاط عنصر `'area'`. النوع يُفهرَس في IndexedDB
   * وتقوم عليه تصفية المكتبة (المرحلة 18)، فالقرار في `captureKindFor`
   * المُختبَرة لا هنا.
   */
  const runCaptureNow = (
    rect: ReturnType<typeof viewportRect> | null,
    source: CaptureSource = 'area',
  ) => {
    void (async () => {
      const kind = captureKindFor(source, rect)
      const reply = await requestCapture(kind, rect, spaceSignal.peek())
      pendingViewport.value = false
      if (reply.ok) {
        const saved = reply.value
        lastCapture = saved
        let notice = captureSaved(kind, saved.width, saved.height, () =>
          openPage('editor', { capture: saved.id }),
        )
        // النسخ **بعد** الحفظ لا بدلًا منه: فشله يترك اللقطة في المكتبة.
        if (copyAfterCapture) {
          const copied = await copyCaptureToClipboard(saved.id)
          if (!copied.ok) {
            console.warn(`[رصد] ${copied.error.message}`)
            notice = captureNotCopied(copied.error.message)
          }
        }
        // الالتقاط ينهي الوضع: بقاء التحديد بعده يوحي بأن شيئًا لم يحدث.
        area.reset()
        modes.escape()
        notices.show(notice)
      } else {
        // الفشل يترك التحديد قائمًا كي يعيد المستخدم المحاولة بلا إعادة رسم.
        console.warn(`[رصد] تعذّر الالتقاط: ${reply.error.message}`)
        notices.show(captureFailed(reply.error.message))
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
    onCommit: (rect) => runCaptureNow(rect, 'element'),
    onCancel: () => modes.escape(),
    onBusy: (busy) => {
      modes.busy.value = busy
    },
    onInvalidate: () => sync.invalidate('pointer'),
    onCopySelector: (selector) => copyValue('المحدِّد', selector),
  })

  /**
   * أداة الفحص.
   *
   * **بلا `skip`**: المضيف يبقى `pointer-events: none` في هذا الوضع، فلا
   * يتصدّر اختبار الإصابة أصلًا — قِيس أن غيابه عن `elementsFromPoint` فوق
   * الصفحة هو ما يُبقي `:hover` صادقة، وهو الشرط الذي يمنع محرّك التتالي
   * من الكذب.
   */
  /**
   * حلّال التتالي — **مثيل واحد لأداتين**.
   *
   * الفحص (11) واللون (13) كلاهما يحتاج القاعدة الفائزة واسم المتغيّر،
   * وبناء الفهرس مقيس بـ99.5ms على github. ومثيلٌ مشترك يعني أن من فحص
   * عنصرًا ثم أخذ عيّنة لون لا يدفع الثمن مرّتين: الذاكرة مفتاحها بصمة
   * الأوراق، فلا تُعاد إلّا إن تغيّرت فعلًا.
   *
   * كسول: لا يُبنى فهرس حتى يُثبَّت شيء — التمرير وأخذ العيّنة يعملان بلا
   * فهرس تمامًا.
   */
  const cssResolver = createCssResolver(doc, win)

  const inspect = createInspect({
    doc,
    resolver: cssResolver,
    onInvalidate: () => sync.invalidate('pointer'),
    onReport: (snapshot) => void send('inspect/report', { snapshot }),
  })

  /**
   * أداة القياس (المرحلة 12).
   *
   * **الدرع مرفوع كاملًا** كما في المنطقة والعنصر لا الفحص: نقرة تثبّت
   * مرجعًا أو تبدأ سحبًا حرًّا، وبلا الدرع تملك الصفحة تلك النقرة (رابط
   * يُغادَر، عنصر يتفاعل) قبل أن نقرأها.
   */
  const measure = createMeasure({
    doc,
    skip: host.hostEl,
    onCancel: () => modes.escape(),
    onBusy: (busy) => {
      modes.busy.value = busy
    },
    onInvalidate: () => sync.invalidate('pointer'),
  })

  /**
   * أداة اللون (المرحلة 13).
   *
   * **الدرع مرفوع**: النقرة تثبّت عيّنة، وبلا الدرع تملكها الصفحة أوّلًا.
   * والأداة تطلب لقطة عند دخول الوضع لا عند تحميل الصفحة — الالتقاط محدود
   * بنداءين في الثانية، فلا يُنفَق على وضع لم يُفتَح.
   */
  const colour = createEyedropper({
    doc,
    skip: host.hostEl,
    resolver: cssResolver,
    onInvalidate: () => sync.invalidate('pointer'),
  })

  /**
   * أداة «العناصر التي تستخدم اللون» والاستبدال المؤقّت (المرحلة 14).
   *
   * **بجوار القطّارة لا داخلها**: تلك تتبّع مؤشِّرًا، وهذه تمسح شجرةً ثمّ
   * تترك أثرًا في الصفحة. و`skip` يستبعد مضيف طبقتنا فلا نجد أنفسنا في
   * نتائج المسح — نفس حارس كل أداة تلمس DOM الصفحة.
   */
  const colourUsage = createColourUsage({
    doc,
    skip: host.hostEl,
    onInvalidate: () => sync.invalidate('pointer'),
  })

  /**
   * أداة «لوحة الصفحة» — `colors / palette-extract` (المرحلة 14).
   *
   * `skip` يستبعد مضيف طبقتنا من جمع الألوان المصرَّحة — نفس حارس
   * `colourUsage` المجاورة، لنفس السبب: فلا نُصنَّف نحن ألوانًا للصفحة.
   */
  const colourPalette = createColourPalette({
    doc,
    skip: host.hostEl,
    onInvalidate: () => sync.invalidate('pointer'),
  })

  /**
   * أداة «توليد الدرجات» — `colors / scale` (المرحلة 14).
   *
   * حسابٌ محض بلا DOM — انظر ترويسة `colour-scale.ts`.
   */
  const colourScale = createColourScale({
    onInvalidate: () => sync.invalidate('pointer'),
  })

  /**
   * أداة المقارنة (المرحلة 16).
   *
   * **الدرع مرفوع**: السحب والعجلة يحتاجان الحدث قبل الصفحة، لنفس سبب
   * القياس واللون — نقرة بلا درع تُنفِّذ ما تحتها أوّلًا.
   */
  const compare = createCompare({
    win,
    onBusy: (busy) => {
      modes.busy.value = busy
    },
    onInvalidate: () => sync.invalidate('pointer'),
  })

  elementTool = element
  inspectTool = inspect
  measureTool = measure
  colourTool = colour
  colourUsageTool = colourUsage
  compareTool = compare

  /**
   * **مقاس الصفحة وحده يُرسَل — لا أصلها ولا مسارها.**
   *
   * الأصل والمسار يبنيهما `pageKeyFromTab` في الخلفية من التبويب نفسه:
   * المصدر الموثوق ما يعرفه المتصفّح لا ما تدّعيه الصفحة (نفس قاعدة
   * `colour/save`). أمّا المقاس فمعرفةُ الصفحة وحدها ولا سبيل لاشتقاقه
   * من `tabId`، فيُرسَل صراحةً — نفس منطق `dpr` في `capture/run`.
   *
   * **مصنَّف حيًّا من عرض الصفحة الفعلي، لا ثابتًا بعد الآن** —
   * `classifyViewport` (`modules/compare/viewport.ts`، حدودها موثَّقة هناك
   * من إطار `compare / viewports` نفسه `127:315`). يُعاد الحساب في كل
   * استدعاء لا مرّة عند الإقلاع: تغيير حجم النافذة أثناء وضع المقارنة
   * نشطًا ينقل المرجع المستهدَف من مقاس إلى آخر، وهو المقصود بـ«تبديل
   * المقاس عبر تغيير حجم النافذة» في `Docs/Rasd_Ar.md §8.6`.
   */
  const currentViewport = (): Viewport => classifyViewport(space.layoutWidth)

  /**
   * ── الفرق الحيّ — سلكُ `compare/diff` ────────────────────────────
   *
   * النتيجة **مقترنة بالمقاس الذي قِيست عليه**، لا مفردة: نسبةٌ بلا مقاسها
   * لا سبيل لإبطالها حين يتغيّر المقاس تحتها.
   */
  const liveDiffAt = signal<{ viewport: Viewport; diff: LiveDiff } | null>(null)
  const liveDiffBusy = signal(false)
  const liveDiffError = signal<string | null>(null)

  /**
   * الحالة المعروضة — **الإبطال محسوبٌ لا مُدار**.
   *
   * `spaceSignal` تُكتب عند كل إطار مزامنة (تمرير · تغيير حجم · إبطال
   * يدوي)، فتغيّرُ عرض النافذة يُسقط النتيجة في الإطار نفسه بلا مستمع
   * إضافي ولا مقارنة دورية. أمّا تغيّر **المرجع** فيُبطَل صراحةً في
   * `setCompareReference` وعند مغادرة الوضع — والسببان معًا هما ما تعنيه
   * «نسبةٌ قديمة فوق مرجعٍ جديد كذبةٌ صامتة».
   */
  const compareDiff = computed(() => {
    const at = liveDiffAt.value
    const live = classifyViewport(spaceSignal.value.layoutWidth)
    return {
      result: at && at.viewport === live ? at.diff : null,
      busy: liveDiffBusy.value,
      error: liveDiffError.value,
    }
  })

  const clearLiveDiff = (): void => {
    liveDiffAt.value = null
    liveDiffError.value = null
  }

  /**
   * يطلب قياسًا جديدًا من الخلفية.
   *
   * **بلا إخفاء الطبقة هنا** — لا سهوًا بل لأن مسار الالتقاط يفعله فعلًا
   * في موضعه الصحيح: `compare/diff` في `background/lifecycle.ts` يمرّ من
   * `captureTile`، وهي تُخفي الطبقة بـ`capture/hide-overlay` قبل
   * `captureVisibleTab` وتُعيدها بـ`capture/show-overlay` في `finally`
   * (`background/capture-service.ts`). وهذا هو الطرف الذي يملك التوقيت:
   * الردّ على `capture/hide-overlay` لا يصل إلّا بعد إطارَي رسم
   * (`host.hide()`)، فالضمانة في الردّ لا في ترتيب نداءين من هنا. وإخفاءٌ
   * ثانٍ من الصفحة كان سيُظهر الطبقة في `finally` الخاصّ به بينما الخلفية
   * لا تزال تلتقط.
   *
   * **والمقاس يُلتقط مرّة عند الطلب لا بعد الردّ** — نفس قاعدة
   * `setCompareReferenceFromBlob`: المرجع المستهدَف هو مقاس الصفحة لحظة
   * الفعل، وتغيّره أثناء الانتظار يُبطل النتيجة عبر `compareDiff` أعلاه.
   */
  const captureLiveDiff = (): void => {
    if (liveDiffBusy.peek()) return
    const viewport = currentViewport()
    liveDiffBusy.value = true
    liveDiffError.value = null
    void (async () => {
      try {
        const measured = await send('compare/diff', { viewport })
        if (!measured.ok) {
          liveDiffAt.value = null
          liveDiffError.value = measured.error.message
          return
        }
        liveDiffAt.value = { viewport, diff: measured.value }
      } finally {
        liveDiffBusy.value = false
      }
    })()
  }

  /** عنوان الكائن الحيّ للمرجع المعروض — يُحرَّر صراحةً قبل أيّ استبدال أو عند التفكيك. */
  let referenceObjectUrl: string | null = null

  /**
   * جيل تحليل المرجع — يُزاد عند مغادرة وضع المقارنة (`modes.subscribe` أدناه)
   * وعند التفكيك، وعند بدء أي محاولة تحميل/تعيين جديدة.
   *
   * فحص `modes.mode.peek() !== 'compare'` وحده بعد أوّل `await` **لا يكفي**:
   * تنقّل داخل الصفحة (SPA) يمرّ عبر `modes.escape()` فيعيد الوضع `idle` ثم
   * قد يعود المستخدم إلى `compare` على صفحة مختلفة — فيجتاز ذلك الفحص بنجاح
   * رغم أن النتيجة المعلَّقة تخصّ صفحة غادرها المستخدم فعلًا. والمحاولتان
   * (الاستدعاء والتعيين اليدوي) قد تتداخلان أيضًا بلا مغادرة وضع أصلًا —
   * لصقُ صورة وهو الاستدعاء التلقائي لا يزال معلَّقًا مثلًا. جيلٌ واحد
   * يُبطل كل ما هو أقدم من آخر محاولة، أيًّا كان سببها.
   */
  let referenceEpoch = 0

  /** يقرأ أبعاد الصورة الطبيعية — `matchWidth` يحتاجها ولا سبيل لمعرفتها بلا فكّ البايتات. */
  const loadReferenceImage = (blob: Blob): Promise<ReferenceImage> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () =>
        resolve({ url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('تعذّر فكّ صورة المرجع.'))
      }
      img.src = url
    })

  /** يُحمِّل صورة مرجع في الأداة ويحرِّر عنوان الكائن السابق — لا تسريب عبر استبدالات متتالية. */
  const setCompareReference = (image: ReferenceImage | null): void => {
    const previous = referenceObjectUrl
    referenceObjectUrl = image?.url ?? null
    compare.setReference(image)
    // مرجعٌ جديد يُبطل نسبة المرجع السابق — هذا هو الشقّ الذي لا يمسكه
    // حسابُ `compareDiff` (المرجع لا أثر له في `spaceSignal`).
    clearLiveDiff()
    if (previous && previous !== referenceObjectUrl) URL.revokeObjectURL(previous)
  }

  /**
   * يستدعي مرجع هذه الصفحة المحفوظ عند دخول وضع المقارنة.
   *
   * **عبر الخلفية لا مباشرةً**: سكربت المحتوى يعمل بأصل الصفحة المزارة،
   * فـ`indexedDB` عنده قاعدة الموقع لا قاعدة رصد — انظر الصفّ 78 في
   * `Docs/Engineering.md §6` وتعليل `reference/load` في `contract.ts`.
   */
  const loadStoredReference = (): void => {
    if (compare.state.reference.peek()) return
    const myEpoch = ++referenceEpoch
    void (async () => {
      const found = await send('reference/load', { viewport: currentViewport() })
      if (!found.ok || !found.value) return
      if (referenceEpoch !== myEpoch) return
      try {
        const image = await loadReferenceImage(base64ToBlob(found.value.base64, found.value.mime))
        // الفحص النهائي **بعد كل انتظار** — محاولة أحدث (تنقّل، مغادرة
        // الوضع، أو تعيين يدوي جديد) سبقت هذه النتيجة فلا تُطبَّق، ويُحرَّر
        // عنوان الكائن الذي أُنشئ للتوّ كي لا يتسرَّب.
        if (referenceEpoch !== myEpoch) {
          URL.revokeObjectURL(image.url)
          return
        }
        setCompareReference(image)
      } catch (e) {
        console.warn(`[رصد] ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
  }

  /**
   * يعيّن لقطة أو صورة مرفوعة مرجعًا — الكتابة في الخلفية، والردّ يحمل
   * البايتات المكتوبة توًّا فلا نداء قراءة ثانٍ بعده.
   */
  const setCompareReferenceFromBlob = (source: { captureId: string } | { image: Blob }): void => {
    const myEpoch = ++referenceEpoch
    // يُحسَب مرّة عند الاستدعاء لا بعد كل `await` — المقاس المستهدَف هو
    // مقاس الصفحة **لحظة الفعل** (الإفلات أو اللصق)، لا لحظة وصول الردّ.
    const viewport = currentViewport()
    void (async () => {
      const payload =
        'captureId' in source
          ? ({ kind: 'capture', captureId: source.captureId } as const)
          : ({
              kind: 'image',
              base64: await blobToBase64(source.image),
              mime: source.image.type,
            } as const)
      if (referenceEpoch !== myEpoch) return

      const written = await send('reference/set', { viewport, source: payload })
      if (!written.ok) {
        console.warn(`[رصد] تعذّر حفظ المرجع: ${written.error.message}`)
        return
      }
      if (referenceEpoch !== myEpoch) return
      try {
        const image = await loadReferenceImage(
          base64ToBlob(written.value.base64, written.value.mime),
        )
        // نفس الحارس النهائي أعلاه — انظر تعليق `loadStoredReference`.
        if (referenceEpoch !== myEpoch) {
          URL.revokeObjectURL(image.url)
          return
        }
        setCompareReference(image)
      } catch (e) {
        console.warn(`[رصد] ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
  }

  /**
   * ── معرض المقاسات — `compare / viewports` (`127:315`، `Docs/Engineering.md
   * §8.6`) ─────────────────────────────────────────────────────────
   *
   * حالة مستقلّة عن المرجع الحيّ الواحد أعلاه عمدًا، بجيل خاصّ بها
   * (`galleryEpoch` لا `referenceEpoch`): أربعة تحميلات متوازية (لكل
   * مقاس) لا تتسابق مع تحميل/تعيين المرجع النشط ولا يُبطلها إلغاء غير
   * متعلّق بها.
   */
  const viewportGallery = signal<readonly ViewportGalleryCard[] | null>(null)
  let galleryObjectUrls: string[] = []
  let galleryEpoch = 0

  const revokeGalleryUrls = (): void => {
    for (const url of galleryObjectUrls) URL.revokeObjectURL(url)
    galleryObjectUrls = []
  }

  const closeViewportGallery = (): void => {
    galleryEpoch++
    revokeGalleryUrls()
    viewportGallery.value = null
  }

  /**
   * نسبة الفرق التي تخصّ بطاقة مقاسٍ بعينه.
   *
   * **المقاس الحيّ وحده قد تكون له نسبة**: `compare/diff` يلتقط الجزء
   * الظاهر من النافذة كما هي الآن، فقياس مقاسٍ آخر يحتاج تغيير حجم النافذة
   * — وهو ما يخصّ زرّ «أعد فحص كل المقاسات» غير المبنيّ (تعليق رأس
   * `ViewportGallery.tsx`). فبقيّة البطاقات تبقى «لم يُقارَن» بصدق، ولا
   * تُنسَب إليها نسبة مقاسٍ آخر.
   */
  const galleryDiffRatio = (viewport: Viewport): number | null =>
    viewport === currentViewport() ? (compareDiff.peek().result?.diffRatio ?? null) : null

  /** يحمِّل المراجع الأربعة دفعة واحدة — نداء مستقلّ لكل مقاس، متوازيةً لا متتالية. */
  const openViewportGallery = (): void => {
    const myEpoch = ++galleryEpoch
    void (async () => {
      const cards = await Promise.all(
        VIEWPORT_ORDER.map(async (viewport): Promise<ViewportGalleryCard> => {
          const diffRatio = galleryDiffRatio(viewport)
          const found = await send('reference/load', { viewport })
          // بطاقة بلا مرجع تبقى «لم يُقارَن» مهما كان آخر قياس:
          // نسبةٌ فوق منطقة إفلات فارغة لا مرجع لها تناقضٌ ظاهر.
          if (!found.ok || !found.value) return { viewport, image: null, diffRatio: null }
          try {
            const image = await loadReferenceImage(
              base64ToBlob(found.value.base64, found.value.mime),
            )
            return { viewport, image, diffRatio }
          } catch {
            return { viewport, image: null, diffRatio: null }
          }
        }),
      )
      if (galleryEpoch !== myEpoch) {
        for (const card of cards) if (card.image) URL.revokeObjectURL(card.image.url)
        return
      }
      galleryObjectUrls = cards.flatMap((c) => (c.image ? [c.image.url] : []))
      viewportGallery.value = cards
    })()
  }

  /**
   * يعيّن مرجعًا لمقاس بعينه من داخل المعرض — قد يخالف مقاس الصفحة الحيّ
   * الآن (بطاقة «هاتف» تُملأ ولو كانت النافذة بعرض سطح مكتب حاليًا).
   *
   * **يُزامَن مع العرض الحيّ حين يتطابق المقاسان فقط** — إفلاتٌ على بطاقة
   * لا تطابق المقاس الحالي يُحدِّث تلك البطاقة وحدها، ولا يستبدل ما تعرضه
   * `ComparePanel` الآن (مرجع مقاسٍ آخر، أو لا شيء).
   */
  const setGalleryReference = (
    viewport: Viewport,
    source: { captureId: string } | { image: Blob },
  ): void => {
    const myEpoch = galleryEpoch
    void (async () => {
      const payload =
        'captureId' in source
          ? ({ kind: 'capture', captureId: source.captureId } as const)
          : ({
              kind: 'image',
              base64: await blobToBase64(source.image),
              mime: source.image.type,
            } as const)
      const written = await send('reference/set', { viewport, source: payload })
      if (!written.ok) {
        console.warn(`[رصد] تعذّر حفظ المرجع: ${written.error.message}`)
        return
      }
      if (galleryEpoch !== myEpoch) return
      try {
        const image = await loadReferenceImage(
          base64ToBlob(written.value.base64, written.value.mime),
        )
        if (galleryEpoch !== myEpoch) {
          URL.revokeObjectURL(image.url)
          return
        }
        galleryObjectUrls.push(image.url)
        const existing =
          viewportGallery.peek() ??
          VIEWPORT_ORDER.map((v) => ({ viewport: v, image: null, diffRatio: null }))
        // مرجعٌ جديد لهذا المقاس ⇒ نسبته القديمة باطلة — نفس حكم
        // `setCompareReference`، والبطاقات الأخرى لا يمسّها التعيين.
        viewportGallery.value = existing.map((c) =>
          c.viewport === viewport ? { viewport, image, diffRatio: null } : c,
        )
        if (viewport === currentViewport()) setCompareReference(image)
      } catch (e) {
        console.warn(`[رصد] ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
  }

  /**
   * استئناف تلقائي لوضع المقارنة بعد تنقّل — من `background/resume.ts`،
   * بعد إقلاعٍ جديد على صفحة أعاد المستخدم تحميلها.
   *
   * **الصفحة تقرِّر لا الخلفية**: تتحقّق أوّلًا من وجود مرجع لهذا المسار
   * تحديدًا (`reference/load` نفسها) قبل الدخول في وضع `compare` — وإلا
   * لأقحمت كل صفحة على أصل مصرَّح له المستخدمَ في وضعٍ لم يطلبه. لا حاجة
   * لتحميل الصورة هنا: `modes.set('compare')` يُشغِّل `loadStoredReference`
   * تلقائيًّا عبر `modes.subscribe` أدناه — فحصٌ إضافي رخيص (قراءة IndexedDB
   * واحدة) أبسط من ازدواج منطق التحميل هنا.
   *
   * **`currentViewport()` لا مقاسًا ثابتًا**: الاستئناف يقع بعد إعادة
   * تحميل حقيقية، وقد تغيّر عرض النافذة منذ آخر مرّة — نفس التصنيف الذي
   * سيستعمله `loadStoredReference` بعد سطرين.
   */
  const unregisterCompareResume = onMessage('compare/resume', async () => {
    const found = await send('reference/load', { viewport: currentViewport() })
    if (found.ok && found.value) modes.set('compare')
    return { ok: true }
  })

  /**
   * يبني نصّ مخرَج الفحص بصيغة معطاة — الجسم المشترك بين النسخ والتنزيل،
   * فلا يُكتب مرّتين ولا يفترق مخرَجاهما.
   */
  const inspectText = (
    tool: ReturnType<typeof createInspect>,
    kind: 'css' | 'tailwind' | 'json',
  ): string | null => {
    const detail = tool.state.detail.peek()
    if (!detail) return null
    const rootPx = Number.parseFloat(win.getComputedStyle(doc.documentElement).fontSize) || 16
    return kind === 'css'
      ? toCss(detail.snapshot)
      : kind === 'tailwind'
        ? toTailwindText(detail.snapshot, rootPx)
        : JSON.stringify(toJson(detail.snapshot, rootPx), null, 2)
  }

  /**
   * ينزِّل مخرَج الفحص ملفًّا — الوحدة 19.2.
   *
   * **تنزيلٌ لا نسخ، على الزرّ نفسه لا زرٍّ إضافي**: `InspectPanel.tsx`
   * محسوبة الأزرار كـ`PalettePanel.tsx` (انظر تعليقها)، فتغيَّرت الوجهة لا
   * العدد. والحدود التي كانت تُكتب في النصّ المنسوخ («العنصر بلا تخطيط»
   * ونحوها) تبقى في الملفّ نفسه للعلّة نفسها: من يفتحه لاحقًا يجب أن يحمل
   * معه ما لم نجزم به.
   */
  const DOWNLOAD_MIME: Readonly<Record<'css' | 'tailwind' | 'json', string>> = {
    css: 'text/css',
    tailwind: 'text/plain',
    json: 'application/json',
  }
  const DOWNLOAD_NAME: Readonly<Record<'css' | 'tailwind' | 'json', string>> = {
    css: 'rasd-inspect.css',
    tailwind: 'rasd-inspect.tailwind.txt',
    json: 'rasd-inspect.json',
  }
  const downloadInspect = (
    tool: ReturnType<typeof createInspect>,
    kind: 'css' | 'tailwind' | 'json',
  ) => {
    const text = inspectText(tool, kind)
    if (text === null) return
    download(DOWNLOAD_NAME[kind], DOWNLOAD_MIME[kind], text)
  }

  /** تنزيل ملفّ مطوّر، وإشعارٌ بما جرى — التنزيل كان صامتًا نجح أم تعذّر. */
  const download = (name: string, mime: string, text: string) => {
    notices.show(saveTextFile(name, mime, text, doc) ? fileSaved(name) : FILE_FAILED)
  }

  /**
   * نسخ قيمة تقنية إلى الحافظة، وإشعارٌ بالنتيجة. صفحةٌ بلا واجهة حافظة (سياق غير آمن)
   * أو ترفض الكتابة تُقال صراحةً — كان الرفض يذهب إلى `console` وحده.
   */
  const copyValue = (what: 'اللون' | 'المحدِّد', value: string) => {
    const clipboard = navigator.clipboard as Clipboard | undefined
    if (!clipboard) {
      notices.show(valueCopyFailed(what))
      return
    }
    void clipboard.writeText(value).then(
      () => notices.show(valueCopied(what, value)),
      () => {
        console.warn(`[رصد] تعذّر نسخ ${what} إلى الحافظة.`)
        notices.show(valueCopyFailed(what))
      },
    )
  }

  /** حفظ لوحة في المكتبة — الخلفية تملك المخزن (`palette/save`)، والإشعار يقول كم حُفظ. */
  const savePalette = (name: string, colors: readonly string[]) => {
    if (colors.length === 0) return
    void send('palette/save', { name, colors }).then((saved) =>
      notices.show(
        saved.ok
          ? paletteSaved(saved.value.count, () => openPage('library', { view: 'palettes' }))
          : saveFailed('اللوحة', saved.error.message),
      ),
    )
  }

  /**
   * تصديرات المطوّر ملفّاتٍ — اللوحة والسلّم (الوحدة 19.2).
   *
   * **تنزيلٌ لا نسخ، على الأزرار الأربعة القائمة نفسها لا زرٍّ خامس**:
   * `PalettePanel.tsx` تقيس أزرارها الأربعة (تصدير × 3 + حفظ) مقابل Figma
   * `122:157`/`122:211` وتنصّ صراحةً «لا خامس» — فتغيَّرت وجهة الأزرار
   * الثلاثة من الحافظة إلى ملفّ، ولم يُضَف زرّ تنزيل موازٍ.
   *
   * **`text` مُستبعَدة عمدًا**: `§6.14` تصفها بلا وجهة كودية أصلًا («تُنسَخ
   * إلى محادثة أو ملاحظة»، انظر ترويسة `colour/export.ts`)، فلا ملفّ يُطابق
   * صيغة نصٍّ بشري.
   *
   * **`dtcg` بلا زرّ حيّ هنا كذلك — بالعلّة نفسها.** أزرار التصدير المقيسة
   * ثلاثة (CSS/JSON/Tailwind) لا أربعة، فإضافة `dtcg` زرًّا رابعًا تخالف
   * القياس نفسه الذي منع زرّ التنزيل الموازي. الدالّة مبنيّة ومختبَرة في
   * `colour/export.ts` وتقبل `dtcg` هنا لو استُدعيت — لكن لا مسار حيّ يطلبها
   * حتى يُصحَّح إطار Figma أو يُقرَّر استبدال زرٍّ قائم.
   */
  type FileFormat = Exclude<PaletteFormat, 'text'>
  const PALETTE_DOWNLOAD_MIME: Readonly<Record<FileFormat, string>> = {
    css: 'text/css',
    json: 'application/json',
    tailwind: 'text/css',
    dtcg: 'application/json',
  }
  const paletteDownloadName = (kind: 'palette' | 'scale', format: FileFormat): string => {
    const ext: Readonly<Record<FileFormat, string>> = {
      css: 'css',
      json: 'json',
      tailwind: 'tailwind.css',
      dtcg: 'tokens.json',
    }
    return `rasd-${kind}.${ext[format]}`
  }

  const app = mountOverlayApp(host.layer, {
    mode: modes.mode,
    /**
     * إجراءا «قياس»/«شيفرة» السريعان في `capture / element-hover`
     * (`Docs/Engineering.md §6` صفّ 80) — تبديل وضع مباشر، نفس ما تفعله
     * `installShortcuts`/`modes.set` أعلاه حرفيًّا.
     */
    onSwitchMode: (mode) => modes.set(mode),
    area,
    element,
    inspect,
    measure,
    colour,
    compare,
    colourUsage,
    colourPalette,
    colourScale,
    /**
     * «أظهر العناصر التي تستخدمه» (`§6.10`).
     *
     * **يعمل على اللون المثبَّت لا الحيّ**: السؤال عن لونٍ بعينه، ومسحٌ
     * يتبع المؤشِّر كان سيبدأ ويُجهَض عشرات المرّات في الثانية.
     */
    onScanColourUsage: () => {
      const pinned = colour.state.pinned.peek()
      if (pinned) colourUsage.scan(pinned.reading)
    },
    /**
     * «توليد الدرجات» (`§6.12`) — على اللون المثبَّت، نفس علّة
     * `onScanColourUsage` أعلاه حرفيًّا.
     */
    onGenerateScale: () => {
      const pinned = colour.state.pinned.peek()
      if (pinned) colourScale.open(pinned.reading)
    },
    /**
     * تصدير اللوحة/السلّم — تنزيل ملفّ، على الأزرار الأربعة القائمة نفسها
     * (الوحدة 19.2؛ انظر ترويسة `paletteDownloadName` أعلاه). كانت نسخًا
     * إلى الحافظة حتى إغلاق 19.1 («لا تنزيل ملفّ... معيار إتمام المرحلة 19
     * لا 14») — وهذا بالضبط ما أنجزته 19.2.
     */
    onExportPalette: (format) => {
      const text = exportPalette(colourPalette.state.swatches.peek(), format)
      download(paletteDownloadName('palette', format), PALETTE_DOWNLOAD_MIME[format], text)
    },
    onExportScale: (format) => {
      const text = exportScale(colourScale.state.stops.peek(), format)
      download(paletteDownloadName('scale', format), PALETTE_DOWNLOAD_MIME[format], text)
    },
    /**
     * «احفظ اللوحة» و«احفظ في المكتبة» — كانا زرّين صامتين: لا معالج يُمرَّر، ولا مسار يكتب
     * لوحة في المكتبة أصلًا، فعرض المكتبة «اللوحات» لا يمتلئ إلا ببيانات اختبار.
     */
    onSavePalette: () => {
      const host = doc.location.hostname
      savePalette(
        host ? `لوحة ${host}` : 'لوحة الصفحة',
        colourPalette.state.swatches.peek().map((s) => s.hex),
      )
    },
    onSaveScale: () => {
      const base = colourScale.state.base.peek()
      savePalette(
        base ? `درجات ${formatColour(base).hex}` : 'درجات',
        colourScale.state.stops.peek().map((s) => s.hex),
      )
    },
    onCopyInspect: (kind) => downloadInspect(inspect, kind),
    onCopyColour: (value: string) => copyValue('اللون', value),
    /**
     * الحفظ في المكتبة (`§6.15`).
     *
     * **بلا اسم ولا ملاحظة هنا**: نافذة تسمية داخل الصفحة تحتاج حقلَ إدخال
     * في جذر ظلّ مغلق فوق صفحة قد تسرق التركيز — والمكتبة (المرحلة 15) هي
     * موضع التسمية والتصنيف. فيُحفَظ اللون بمصدره وعنوانه فورًا، ويُسمّى
     * هناك. والحقلان يبقيان في العقد كي لا يتغيّر شكل الرسالة حينئذٍ.
     */
    onSaveColour: () => {
      const pinned = colour.state.pinned.peek()
      if (!pinned) return
      void send('colour/save', {
        hex: pinned.formats.hex,
        name: '',
        note: '',
        source: pinned.source,
      }).then((saved) =>
        notices.show(
          saved.ok
            ? colourSaved(() => openPage('library', { view: 'colors' }))
            : saveFailed('اللون', saved.error.message),
        ),
      )
    },
    /**
     * **«استخدم آخر لقطة» — عادت بعد إصلاح موضع التخزين (الصفّ 78).**
     *
     * كانت تقرأ `captures` من سكربت المحتوى فتُخفق دومًا (قاعدة الموقع لا
     * قاعدة رصد)، فأُوقفت. والآن القراءة في الخلفية حيث المخزن فعلًا.
     *
     * **ولا تعتمد على `lastCapture` وحده**: ذاك المتغيّر لا يُملأ إلا
     * بالتقاطٍ قادته الصفحة (منطقة · عنصر · جزء ظاهر)، بينما الالتقاط
     * الكامل تقوده الخلفية ولا يمرّ بها أصلًا — فكان الزرّ صامتًا بعد
     * أكثر التقاطٍ يستحقّ مقارنة. الرجوع إلى `capture/latest` يغطّي
     * الحالتين بمصدر واحد.
     */
    onCompareUseLastCapture: () => {
      if (lastCapture) {
        setCompareReferenceFromBlob({ captureId: lastCapture.id })
        return
      }
      void (async () => {
        const latest = await send('capture/latest', undefined)
        if (!latest.ok || !latest.value) return
        setCompareReferenceFromBlob({ captureId: latest.value.id })
      })()
    },
    onCompareDropImage: (file) => setCompareReferenceFromBlob({ image: file }),
    onComparePasteImage: (file) => setCompareReferenceFromBlob({ image: file }),
    viewportGallery,
    onOpenViewportGallery: openViewportGallery,
    onCloseViewportGallery: closeViewportGallery,
    onViewportGalleryDropImage: (viewport, file) => setGalleryReference(viewport, { image: file }),
    compareDiff,
    onCaptureCompareDiff: captureLiveDiff,
    fullPage,
    notices,
    onCancelFullPage: () => void send('fullpage/cancel', undefined),
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
  /*
   * **وضع الفحص ليس فيها عمدًا.**
   *
   * الدرع يعطّل `:hover` و`:active` على الصفحة تحته — قِيس أن
   * `matches(':hover')` يصير `false` والمؤشِّر فوق العنصر فعلًا. ومحرّك
   * التتالي يقرأ تلك الحالات، فيُعلن قاعدة `:hover` غير فائزة وهي التي
   * تفوز. أي أن رفع الدرع في الفحص يجعل الفاحص **يكذب**.
   *
   * وبديله «الدرع الجزئيّ»: المضيف `none`، ولوحة الفحص وحدها تعلن
   * `pointer-events: auto` لنفسها في `overlay.css` — وهو نمط
   * `.rasd-ov-place` القائم منذ المرحلة 9.
   */
  /*
   * **وضع القياس معهما لا مع الفحص.**
   *
   * التثبيت بنقرة والسحب الحرّ يحتاجان الحدث قبل الصفحة، للسبب نفسه
   * المذكور لوضع العنصر: نقرة بلا درع تُنفِّذ ما تحتها (رابط، زرّ) قبل أن
   * نستهلكها مرجعًا. القياس لا يقرأ `:hover` الصفحة كما يفعل الفحص، فلا
   * ثمن لرفع الدرع هنا.
   */
  const INTERACTIVE_MODES = new Set<Mode>(['area', 'element', 'measure', 'colour', 'compare'])

  const unsubscribeInteractive = modes.subscribe((mode) => {
    host.setInteractive(INTERACTIVE_MODES.has(mode))
    if (mode !== 'area') {
      area.reset()
      // التقاط الظاهر المؤجَّل يعيش في وضع المنطقة وحده: مغادرته — `Esc` أو أداة أخرى — تُلغيه،
      // وإلّا بدأ العدّ وحده عند الدخول التالي إلى المنطقة والتقط الظاهر (الصفّ 145 (ب)).
      pendingViewport.value = false
    }
    if (mode !== 'element') element.reset()
    if (mode !== 'inspect') inspect.reset()
    if (mode !== 'measure') measure.reset()
    // دخول وضع اللون يطلب إطارًا فتُلتقط عيّنته عند الدخول لا عند أول حركة.
    if (mode === 'colour') sync.invalidate('manual')
    if (mode !== 'colour') {
      colour.reset()
      // مغادرة وضع اللون تُنهي الاستبدال المؤقّت: أثرٌ يبقى بعد أداته
      // يترك صفحة المستخدم مطليّة بلا سبيل إلى فهم لماذا.
      colourUsage.reset()
      // وتُغلق شاشتَي الاستخراج والسلّم إن كانتا مفتوحتين — الرصيف يعود
      // إلى حالته الافتراضية عند العودة إلى وضع اللون، نفس سلوك `colour`
      // و`colourUsage` أعلاه.
      colourPalette.close()
      colourScale.close()
    }
    if (mode !== 'compare') {
      // يُبطل أي تحميل/تعيين مرجع معلَّق — انظر تعليق `referenceEpoch` أعلاه.
      // هذا ما يقطع سباق التنقّل داخل الصفحة أيضًا: `onRouteChange` أدناه
      // يمرّ دومًا عبر `modes.escape()`، فيصل هذا الفرع قبل أي دخول لاحق.
      referenceEpoch++
      compare.reset()
      // `reset()` يمسح الإشارة بلا معرفة بعنوان الكائن — التحرير هنا لا هناك.
      if (referenceObjectUrl) {
        URL.revokeObjectURL(referenceObjectUrl)
        referenceObjectUrl = null
      }
      // معرض المقاسات مرتبط بوضع المقارنة نفسه — لا معنى لبقائه مفتوحًا
      // بعد مغادرته، ومغادرته هنا تشمل تنقّل SPA (نفس تعليق `referenceEpoch` أعلاه).
      closeViewportGallery()
      // ومغادرة الوضع تشمل تنقّل SPA أيضًا — أي مرجعًا آخر لصفحة أخرى.
      // فالنسبة تسقط معه، لا تنتظر عودةً إلى الوضع لتُعرض فوق مرجع جديد.
      clearLiveDiff()
    } else {
      loadStoredReference()
    }
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
  /*
   * رسائل الالتقاط الكامل الثلاث.
   *
   * الحلقة في الـservice worker، وهذه الصفحة تنفّذ ما يُطلَب منها: تهيئة
   * (مسح · تصنيف · تمهيد)، ثم خطوة لكل بلاطة، ثم استعادة. والاستعادة
   * تُنادى في `finally` هناك، فلا تعتمد على نجاح ما قبلها.
   */
  const unregisterPrepare = onMessage('fullpage/prepare', async () => {
    const prepared = await prepareFullPage(win, host.hostEl)
    fullPage.value = { done: 0, total: 0, note: '' }
    return prepared
  })

  const unregisterStep = onMessage('fullpage/step', async (input) => {
    const moved = await stepFullPage(input, win)
    fullPage.value = {
      done: input.tileIndex + 1,
      total: input.lastIndex + 1,
      note: '',
    }
    return moved
  })

  const unregisterFinish = onMessage('fullpage/finish', () => {
    fullPage.value = null
    return finishFullPage(win)
  })

  const unregisterStart = onMessage('capture/start', ({ kind }) => {
    if (kind === 'viewport') {
      const seconds = delaySignal.peek()
      if (seconds > 0) {
        // التأجيل يمرّ عبر وضع «منطقة» بلا تحديد: العدّاد يعيش في العرض،
        // والطبقة تبقى خاملة للمؤشِّر فيستطيع المستخدم فتح قائمة أثناء العدّ.
        pendingViewport.value = true
        // دخولٌ مرفوض (أداة منشغلة بسحب جارٍ) لا يُبقي التقاطًا مسلَّحًا ينطلق عند دخولٍ لاحق لم
        // يُطلب له — المراجعة المستقلّة لـ`STAGES/04`.
        if (!modes.set('area').ok) {
          pendingViewport.value = false
          return { started: false }
        }
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

  /**
   * تُقرأ هنا لا في `.then()` كبقيّة إعدادات الالتقاط أدناه: خريطة الاختصار
   * يجب أن تكون صحيحة **قبل** أوّل ضغطة مفتاح، لا بعد ثانية إضافة —
   * والإعدادات مخزَّنة مؤقّتًا أصلًا (`watchSettings` أعلاه قرأتها للتوّ).
   */
  const shortcutBindings = liveBindings((await getSettings()).shortcuts.toolKeys)

  const removeShortcuts = installShortcuts({
    doc,
    bindings: shortcutBindings.get,
    // `Esc` يُبتلع فقط حين يكون له معنى عندنا — وإلا فهو مفتاح الصفحة.
    /*
     * `Esc` يُبتلع كذلك أثناء الالتقاط الكامل.
     *
     * المهمّة ليست وضعًا، فـ`modes.mode` يبقى `idle` طوالها — والشرط
     * القديم كان يترك المفتاح للصفحة بينما الواجهة تعرض «إلغاء · esc».
     * وعدٌ معروض بلا سلك خلفه.
     */
    shouldSwallowEscape: () => modes.mode.value !== 'idle' || hasFullPageSession(),
    onAction: (action) => {
      switch (action.kind) {
        case 'mode':
          modes.set(action.mode)
          break
        case 'escape':
          if (hasFullPageSession()) {
            // الإلغاء يمرّ من الخلفية: هي التي تملك الحلقة و`AbortController`.
            void send('fullpage/cancel', undefined)
          } else if (modes.mode.value !== 'idle') {
            const leaving = modes.mode.value
            modes.escape()
            // `capture / cancelled` · `inspect / cancelled` · `colors / cancelled` — وكيف تعود.
            const notice = exitNotice(leaving, shortcutBindings.get())
            if (notice) notices.show(notice)
          }
          break
        /*
         * **`⌘K`/`Ctrl+K` تفتح لوحة الاستخراج — المعالج الذي كانت الخريطة
         * تنتظره.** كان `swallow: false` بحجّة «لا معالج لـ`palette` في أي
         * مسار إنتاجي» (`shortcuts.ts`)، والآن يوجد: يُفعِّل وضع اللون إن
         * لم يكن نشطًا، ثمّ يفتح `colourPalette` — «العودة يوم تُبنى اللوحة
         * فعليًّا» كما وعد التعليق هناك.
         */
        case 'palette':
          modes.set('colour')
          colourPalette.open()
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
    // الحارس يُرفَع أوّلًا: تفعيلٌ يصل أثناء التفكيك يجب أن يبني جلسة جديدة
    // لا أن يستلم هذه المنهارة.
    delete win[SESSION_FLAG]
    // يُبطل أي تحميل/تعيين مرجع معلَّق قبل أي شيء آخر — وإلا استقرّت نتيجته
    // بعد أن أزال هذا التفكيك نفسه مستمع `modes.subscribe` الذي كان سيُبطلها.
    referenceEpoch++
    // الترتيب معكوس ترتيب التركيب: المستمعات ومراقب البقاء أوّلًا، وإلا
    // رأى المراقبُ المضيفَ يختفي فأعاد إلحاقه في اللحظة نفسها.
    removeShortcuts()
    shortcutBindings.stop()
    notices.dismiss()
    unregisterModeSet()
    unregisterCompareResume()
    unregisterPrepare()
    unregisterStep()
    unregisterFinish()
    unregisterStart()
    unregisterHide()
    unregisterShow()
    unsubscribeInteractive()
    app.unmount()
    area.dispose()
    // اللقطة المفكوكة تُحرَّر صراحةً: `ImageBitmap` لا يُجمَع بجمع القمامة
    // وحده، وحجمها بحجم النافذة كاملةً بأربعة بايتات للبكسل.
    colour.dispose()
    colourUsage.dispose()
    colourPalette.dispose()
    colourScale.dispose()
    /*
     * **حارسٌ نهائي فوق `colourUsage.dispose()` لا بديلٌ عنه.**
     *
     * الأداة تتتبّع مقبضها الحيّ وتتراجع عنه، وهذا يكفي في المسار السعيد.
     * لكن الاستبدال يعدّل **صفحة المستخدم**، وأثرٌ يفلت هنا يبقى بعد رحيل
     * الطبقة بلا سبيل إلى فهم مصدره — فالكلفة غير متماثلة: نداءٌ زائد
     * رخيص، وصفحةٌ مطليّة أبدًا ليست كذلك. `revertAll` مثاليّة التكرار
     * (حارس `reverted` في كل مقبض)، فلا ضرر من مرورها على ما تراجع فعلًا.
     */
    revertAll()
    compare.dispose()
    // عنوان كائن صورة المرجع — نفس سبب تحرير `colour` أعلاه، ولو بلا `ImageBitmap`.
    if (referenceObjectUrl) URL.revokeObjectURL(referenceObjectUrl)
    // عناوين صور معرض المقاسات الأربعة — نفس السبب.
    revokeGalleryUrls()
    // الحلّال ملك هذه الجلسة لا الأدوات — فتُحرّره هي.
    cssResolver.dispose()
    stopDpr()
    persistence.stop()
    sync.stop()
    unsubscribeReport()
    stopPageReport()
    // النافذة تعتمد على وضع مبلَّغ يعكس الواقع — تفكيك بلا تقرير idle أخير
    // يترك مؤشِّرًا حيًّا كاذبًا لجلسة انتهت فعلًا.
    reportMode('idle')
    modes.dispose()
    stopTheme()
    stopCaptureSettings()
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
    inspect,
    measure,
    colour,
    /**
     * أداة المرحلة 14 — مُصدَّرة كي يبلغها الفحص الحيّ.
     *
     * ما لا سبيل إليه من خارج الطبقة لا يُثبَت حيًّا، ويبقى «مُختبَرًا
     * وحدةً» — وهي بالضبط الحالة التي بُني هذا السلك لإنهائها.
     */
    colourUsage,
    /** أداتا المرحلة 14 الأخريان — نفس علّة `colourUsage` أعلاه حرفيًّا. */
    colourPalette,
    colourScale,
    compare,
    lastCapture: () => lastCapture,
    teardown,
  })
}

export { readSpace, blockedFrames, isTopFrame }
export type { CoordSpace, OverlayHost, ModeManager }
