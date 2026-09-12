/**
 * مضيف الطبقة — جذر ظلّ مغلق يعيش فوق صفحة لا نملكها.
 *
 * ثلاث حمايات مستقلّة، كلٌّ تسدّ ما لا تسدّه الأخرى:
 *
 * 1. **جذر ظلّ مغلق** — قواعد الصفحة لا تعبره إطلاقًا، ولا يصل إليه
 *    `querySelector` من سكربتها. هذا يغطّي `* { all: unset !important }`
 *    و`[class*="rasd"] { display: none !important }` معًا.
 * 2. **أنماط سطرية بـ`!important`** على العنصر المضيف نفسه — العنصر يعيش في
 *    DOM الصفحة، وقواعدها تتفوّق على `:host` بالمواصفة. والسطري `!important`
 *    أعلى أولوية يملكها مؤلِّف، فيصمد أمام `*{…!important}`.
 * 3. **الطبقة العليا عبر `popover`** — `z-index` وحده يخسر أمام أي عنصر في
 *    الطبقة العليا، و`position: fixed` ينكسر إذا حمل `<html>` تحوّلًا:
 *    يصير الجذر containing block فلا يعود المضيف نسبةً إلى النافذة، بل
 *    يتمدّد إلى ارتفاع المستند كلّه. الطبقة العليا لا يمسّها الاثنان.
 *
 * **ما لا نفعله:** لا ترقية تلقائية إلى `dialog.showModal()`. تعطي طبقة
 * أعلى فعلًا، لكنها تسرق التركيز، وتجعل مستند الصفحة `inert`، و**أوّل
 * `Esc` يغلقها** — وهو المفتاح الذي تفرض الخطة أن يعيدنا إلى `idle`. الدواء
 * أسوأ من الداء، فتُسجَّل الحالة «متدهورة» ويُعلَم المستخدم بدل ابتلاع
 * الصفحة.
 */

import { ensureOverlayFonts, releaseOverlayFonts } from '@/shared/bidi'
import { errWith, ok, type Result, type RasdError } from '@/shared/result'
import OVERLAY_CSS from '@/ui/overlay/overlay.css?inline'

/** نسخة العقد — حقن نسخة أحدث فوق أقدم يجب أن يستبدل لا أن يتعايش. */
const PROTOCOL = 1

/**
 * مفتاح علامة الحقن على `window`.
 *
 * ثابت عمدًا (لا عشوائي): الغرض أن تجد النسخة الثانية النسخة الأولى. أمّا
 * **اسم العنصر** فعشوائي لكل جلسة، لأن الغرض هناك عكسه تمامًا: ألّا تجده
 * الصفحة. العيّنة العدائية تستهدف `[id*="rasd"]` و`rasd-overlay` صراحةً.
 */
const FLAG = '__rasdOverlay'

interface Installed {
  readonly protocol: number
  readonly root: ShadowRoot
  readonly hostEl: HTMLElement
  reassert(): void
  /**
   * التفكيك **الرسمي** لهذا المستند — قابل للاستبدال.
   *
   * تفكيك المضيف وحده لا يكفي: الجلسة تُشغّل مراقب بقاء يعيد الإلحاق فور
   * اختفاء المضيف، فإزالة المضيف بلا إيقافه تُحييه فورًا. لذلك تستبدل
   * `startOverlay` هذا الحقل بتفكيكها الكامل، ويصير أي نداء — من أي طرف —
   * يوقف كل شيء.
   */
  teardown: () => void
}

declare global {
  interface Window {
    [FLAG]?: Installed
  }
}

/** اسم وسم عشوائي — لا يطابق أي محدِّد تكتبه صفحة تتوقّع إضافةً باسم رصد. */
function randomTagName(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
  return `x-${rand}`
}

/**
 * الأنماط الحرجة، سطريًا وبـ`!important`.
 *
 * `direction` مذكور صراحةً: `all: initial` لا يعيد ضبطه بالمواصفة، فبدون
 * هذا السطر يرث المضيف اتجاه الصفحة.
 */
const CRITICAL: ReadonlyArray<readonly [string, string]> = [
  ['position', 'fixed'],
  ['inset', '0'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['width', 'auto'],
  ['height', 'auto'],
  ['max-width', 'none'],
  ['max-height', 'none'],
  ['min-width', '0'],
  ['min-height', '0'],
  ['z-index', '2147483647'],
  ['display', 'block'],
  ['visibility', 'visible'],
  ['opacity', '1'],
  ['pointer-events', 'none'],
  ['background', 'transparent'],
  ['transform', 'none'],
  ['filter', 'none'],
  ['clip-path', 'none'],
  ['contain', 'layout style'],
  ['isolation', 'isolate'],
  ['direction', 'ltr'],
  ['float', 'none'],
  ['inset-block-start', '0'],
  ['inset-inline-start', '0'],
]

function applyCritical(el: HTMLElement): void {
  for (const [prop, value] of CRITICAL) el.style.setProperty(prop, value, 'important')
}

/** `popover` مدعوم فعلًا — لا مجرّد معرَّف في النموذج الأوّلي. */
function supportsPopover(el: HTMLElement): boolean {
  // happy-dom يعلن `popover` في النموذج الأوّلي بلا `showPopover` — فحص
  // `'popover' in HTMLElement.prototype` يمرّ ثم ينفجر النداء.
  return typeof (el as { showPopover?: unknown }).showPopover === 'function'
}

export type HostLevel = 'fixed' | 'top-layer'

export interface OverlayHost {
  /** جذر الظلّ المغلق — كل ما نرسمه يعيش داخله. */
  readonly root: ShadowRoot
  /** العنصر في DOM الصفحة. لا يُلمَس من خارج هذه الوحدة. */
  readonly hostEl: HTMLElement
  /** الطبقة التي نجحنا في الوصول إليها. */
  readonly level: HostLevel
  /** حاوية الرسم داخل الظلّ. */
  readonly layer: HTMLElement
  /** يعيد الإلحاق والترقية بعد أن تعبث الصفحة. */
  reassert(): void
  /**
   * يفتح الطبقة للمؤشِّر أو يغلقها.
   *
   * الافتراضي **مغلق** (`pointer-events: none`) وهو ما بنته المرحلة 6: طبقة
   * خاملة لا تمنع تمرير الصفحة ولا نقرها. المرحلة 8 أوّل من يحتاج العكس —
   * تحديد منطقة بالسحب يجب أن يبتلع كل حدث مؤشِّر، وإلا تفاعلت الصفحة تحته
   * (روابط تُفتح، نصّ يُظلَّل) أثناء السحب.
   *
   * يُكتب بـ`!important` سطريًا لأن هذا ما تفعله `applyCritical`، وأي كتابة
   * أضعف منها لا تتفوّق عليها.
   */
  setInteractive(on: boolean): void
  /**
   * يُخفي الطبقة **ويضمن أن رسمة وقعت** قبل أن يُرجع.
   *
   * `captureVisibleTab` يلتقط ما رُسم فعلًا، وتغيير النمط لا يعني أن
   * المتصفّح رسم. إطارا `requestAnimationFrame` متتاليان هما الضمانة
   * القياسية: الأوّل يقع **قبل** الرسمة التالية، والثاني بعد أن التزمت.
   */
  hide(): Promise<void>
  show(): void
  teardown(): void
}

async function loadTokensCss(): Promise<string> {
  try {
    const url = chrome.runtime.getURL('assets/tokens-shadow.css')
    const res = await fetch(url)
    return res.ok ? await res.text() : ''
  } catch {
    // بلا توكنز تبقى الطبقة مرئية بقيم المتصفّح الافتراضية — مشوّهة لكن
    // لا مختفية. الفشل هنا لا يبرّر إسقاط الأداة كلّها.
    return ''
  }
}

function buildSheets(tokensCss: string): CSSStyleSheet[] {
  const sheets: CSSStyleSheet[] = []
  for (const text of [tokensCss, OVERLAY_CSS]) {
    if (!text) continue
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(text)
      sheets.push(sheet)
    } catch {
      /* بيئة بلا أوراق قابلة للبناء — يتكفّل الاحتياطي أدناه */
    }
  }
  return sheets
}

/**
 * يركّب الطبقة، أو يعيد الموجودة.
 *
 * الحقن المتكرِّر **آمن ومقصود**: أمر ثانٍ من المستخدم يجب أن يُنشِّط الطبقة
 * الحالية لا أن يبني ثانية فوقها. النسخة الأقدم تُفكَّك أوّلًا حين يختلف
 * رقم العقد، فلا تتعايش نسختان من الشيفرة على المستند نفسه.
 */
export async function mountHost(doc: Document = document): Promise<Result<OverlayHost, RasdError>> {
  const win = doc.defaultView
  if (!win) return errWith('unknown', 'لا نافذة لهذا المستند')

  const existing = win[FLAG]
  if (existing) {
    if (existing.protocol === PROTOCOL) {
      existing.reassert()
      return ok(toPublic(existing))
    }
    // نسخة أقدم من الإضافة ما تزال محقونة — تُزال قبل بناء الجديدة.
    existing.teardown()
  }

  const root = doc.documentElement
  if (!root) return errWith('unknown', 'لا عنصر جذر')

  const hostEl = doc.createElement(randomTagName())
  applyCritical(hostEl)
  // `manual` لا `auto`: الإغلاق الخفيف يجعل أي نقرة في الصفحة تُسقط الطبقة.
  hostEl.setAttribute('popover', 'manual')

  const shadow = hostEl.attachShadow({ mode: 'closed' })

  const layer = doc.createElement('div')
  layer.className = 'rasd-ov-layer'
  shadow.appendChild(layer)

  // يُلحق بـ`documentElement` لا بـ`body`: صفحات كثيرة تستبدل `body` كاملًا
  // عند التنقّل، فيذهب معه كل ما فيه.
  root.appendChild(hostEl)

  const tokensCss = await loadTokensCss()
  const sheets = buildSheets(tokensCss)
  if (sheets.length > 0) {
    shadow.adoptedStyleSheets = sheets
  } else {
    // احتياطي للبيئات بلا `CSSStyleSheet` قابلة للبناء.
    const style = doc.createElement('style')
    style.textContent = `${tokensCss}\n${OVERLAY_CSS}`
    shadow.insertBefore(style, layer)
  }

  // وجوه الخطّ **مُلحقة بالمستند لا بشجرة الظلّ**: قاعدة `@font-face` داخل
  // ورقة الظلّ تُهمَل بصمت ولا يُطلَب الملفّ أصلًا. لذلك تمرّ من
  // `document.fonts`، ويجب أن تُزال في التفكيك.
  void ensureOverlayFonts(doc)

  let level: HostLevel = 'fixed'
  const promote = () => {
    if (!supportsPopover(hostEl)) return
    try {
      // يرمي `InvalidStateError` إن كان مفتوحًا أصلًا أو غير موصول.
      if (!hostEl.isConnected) return
      if (!hostEl.matches(':popover-open')) hostEl.showPopover()
      level = 'top-layer'
    } catch {
      level = 'fixed'
    }
  }
  promote()

  const cleanups: (() => void)[] = []

  /**
   * الخروج من الطبقة العليا **ليس سمة**، فلا يلتقطه `MutationObserver`.
   * الصفحة تستطيع أن تنادي `hidePopover()` على عنصرنا مباشرةً. الحدث
   * `toggle` هو الإشارة الصحيحة، وهو مجّاني مقارنةً باستطلاع دوري.
   */
  const onToggle = (e: Event) => {
    const { newState } = e as ToggleEvent
    if (newState === 'closed') promote()
  }
  hostEl.addEventListener('toggle', onToggle)
  cleanups.push(() => hostEl.removeEventListener('toggle', onToggle))

  const reassert = () => {
    if (!hostEl.isConnected) {
      applyCritical(hostEl)
      doc.documentElement?.appendChild(hostEl)
    }
    promote()
  }

  const teardown = () => {
    for (const fn of cleanups.splice(0)) {
      try {
        fn()
      } catch {
        /* التفكيك لا يرمي */
      }
    }
    try {
      // `hidePopover()` على عنصر غير موصول لا يرمي — لكن على عنصر لم يُفتح
      // قد يرمي، فيبقى الحارس.
      if (hostEl.isConnected && hostEl.matches(':popover-open')) hostEl.hidePopover()
    } catch {
      /* لا شيء */
    }
    hostEl.remove()
    releaseOverlayFonts(doc)
    delete win[FLAG]
  }

  const installed: Installed = { protocol: PROTOCOL, root: shadow, hostEl, reassert, teardown }
  win[FLAG] = installed

  const setInteractive = (on: boolean) => {
    hostEl.style.setProperty('pointer-events', on ? 'auto' : 'none', 'important')
    // المضيف وحده لا يكفي: المستمعات على الطبقة داخل جذر الظلّ، وحدثٌ
    // يستقرّ على المضيف لا ينزل إليها. يُفتَح الاثنان معًا أو لا يصل شيء.
    if (on) layer.setAttribute('data-rasd-interactive', 'true')
    else layer.removeAttribute('data-rasd-interactive')
  }

  const show = () => {
    layer.removeAttribute('data-rasd-hidden')
  }

  const hide = () =>
    new Promise<void>((resolve) => {
      layer.setAttribute('data-rasd-hidden', 'true')
      const raf = win.requestAnimationFrame?.bind(win)
      // بيئة بلا `requestAnimationFrame` (اختبارات الوحدة): الإخفاء تمّ،
      // والضمانة غير قابلة للتحقّق أصلًا بلا مُركِّب.
      if (!raf) {
        resolve()
        return
      }
      raf(() => raf(() => resolve()))
    })

  return ok({
    root: shadow,
    hostEl,
    get level() {
      return level
    },
    layer,
    reassert,
    setInteractive,
    hide,
    show,
    teardown,
  })
}

function toPublic(i: Installed): OverlayHost {
  const layer = i.root.querySelector<HTMLElement>('.rasd-ov-layer') ?? i.hostEl
  const win = i.hostEl.ownerDocument.defaultView
  return {
    root: i.root,
    hostEl: i.hostEl,
    level: i.hostEl.matches(':popover-open') ? 'top-layer' : 'fixed',
    layer,
    reassert: () => i.reassert(),
    /**
     * **البند 56 في `Rasd_Plan.md §6`**: هذا المسار (حقن ثانٍ على المستند نفسه —
     * `mountHost` يعيد `toPublic(existing)`) كان يفتح `hostEl` وحده وينسى
     * `layer`، فيسقط أي وضع تفاعلي صامتًا بعد إعادة تفعيل. يُطابق `setInteractive`
     * الأصلية في `mountHost` أعلاه سطرًا بسطر — يُفتَح الاثنان معًا أو لا يصل شيء.
     */
    setInteractive: (on) => {
      i.hostEl.style.setProperty('pointer-events', on ? 'auto' : 'none', 'important')
      if (on) layer.setAttribute('data-rasd-interactive', 'true')
      else layer.removeAttribute('data-rasd-interactive')
    },
    hide: () =>
      new Promise<void>((resolve) => {
        layer.setAttribute('data-rasd-hidden', 'true')
        const raf = win?.requestAnimationFrame?.bind(win)
        if (!raf) {
          resolve()
          return
        }
        raf(() => raf(() => resolve()))
      }),
    show: () => layer.removeAttribute('data-rasd-hidden'),
    teardown: () => i.teardown(),
  }
}

/**
 * تجعل دالّةً ما هي التفكيك الرسمي لهذا المستند.
 *
 * تستدعيها `startOverlay` بعد أن تركّب المراقبين والمستمعات، فلا يبقى
 * تفكيك جزئي قابل للنداء من الخارج.
 */
export function adoptTeardown(fn: () => void, doc: Document = document): void {
  const installed = doc.defaultView?.[FLAG]
  if (installed) installed.teardown = fn
}

/** هل الطبقة محقونة في هذا المستند الآن؟ */
export function isMounted(doc: Document = document): boolean {
  return Boolean(doc.defaultView?.[FLAG])
}

/** يفكّك الطبقة إن كانت محقونة. آمن حين لا تكون. */
export function unmountHost(doc: Document = document): boolean {
  const installed = doc.defaultView?.[FLAG]
  if (!installed) return false
  installed.teardown()
  return true
}
