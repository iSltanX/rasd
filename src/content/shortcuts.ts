/**
 * اختصارات داخل الصفحة.
 *
 * Chrome يقبل أربعة اختصارات مقترحة فقط في `commands`، وهي محجوزة للالتقاط.
 * بقيّة الخريطة تُلتقط هنا، في مرحلة **الالتقاط** (`capture: true`) قبل أن
 * تراها الصفحة — وإلا ابتلعها موقع يربط المفتاح نفسه.
 *
 * **المطابقة على `event.code` لا `event.key`.** `⌥⇧I` على macOS ينتج
 * `event.key === 'ˆ'`، ولوحة عربية تنتج حرفًا عربيًا لمفتاح `I` نفسه.
 * `code` يصف الموضع الفيزيائي على اللوحة فيبقى `KeyI` في الحالتين — وهو
 * الشيء الوحيد الثابت عبر المنصّات وتخطيطات اللوحة.
 *
 * **حارس التركيز**: حين يكون التركيز داخل حقل إدخال في الصفحة المضيفة، لا
 * نلتقط شيئًا. سرقة حرف من المستخدم وهو يكتب عطل لا ميزة.
 */

import { DEFAULT_TOOL_KEYS, type Mode, type ToolShortcutMode } from '@/shared/modes'
import { watchSettings } from '@/shared/settings'

/** ما يمكن أن يطلبه مفتاح. */
export type ShortcutAction =
  | { readonly kind: 'mode'; readonly mode: Mode }
  | { readonly kind: 'escape' }
  | { readonly kind: 'palette' }
  | { readonly kind: 'step'; readonly delta: 1 | -1 }
  | { readonly kind: 'constrain'; readonly held: boolean }

export interface Binding {
  readonly code: string
  readonly alt?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
  readonly ctrl?: boolean
  readonly action: ShortcutAction
  /** هل نمنع الصفحة من رؤية المفتاح؟ */
  readonly swallow: boolean
}

/**
 * الخريطة داخل الصفحة.
 *
 * `⌥⇧` مُعدِّل الأوضاع، ويترك `⌘`/`Ctrl` للمتصفّح والصفحة. و`Esc` والأسهم
 * تُلتقط **بلا ابتلاع افتراضي إلا عند الحاجة**: الصفحة قد تستعملها أيضًا،
 * وابتلاعها دائمًا يكسر تنقّلها.
 */
export const BINDINGS: readonly Binding[] = [
  {
    code: DEFAULT_TOOL_KEYS.inspect,
    alt: true,
    shift: true,
    action: { kind: 'mode', mode: 'inspect' },
    swallow: true,
  },
  {
    code: DEFAULT_TOOL_KEYS.measure,
    alt: true,
    shift: true,
    action: { kind: 'mode', mode: 'measure' },
    swallow: true,
  },
  {
    code: DEFAULT_TOOL_KEYS.colour,
    alt: true,
    shift: true,
    action: { kind: 'mode', mode: 'colour' },
    swallow: true,
  },
  {
    code: DEFAULT_TOOL_KEYS.compare,
    alt: true,
    shift: true,
    action: { kind: 'mode', mode: 'compare' },
    swallow: true,
  },
  /*
   * `⌘K`/`Ctrl+K` يفتح لوحة استخراج الصفحة (`colors / palette-extract`) —
   * **الابتلاع عاد الآن**، فقد بُني المعالج (المرحلة 14): `bootOverlay`
   * يفعّل وضع اللون ويفتح `colourPalette` عند `kind: 'palette'`. قبل ذلك
   * كانت `swallow: false` عمدًا — لا معالج، فابتلاعها كان يسرق اختصارًا
   * شائعًا (GitHub · Slack · Notion) **بلا مقابل**. الآن ثمّة مقابل حقيقي،
   * فتُبتلع كبقيّة اختصارات الأوضاع أعلاه.
   */
  { code: 'KeyK', meta: true, action: { kind: 'palette' }, swallow: true },
  { code: 'KeyK', ctrl: true, action: { kind: 'palette' }, swallow: true },
  // `Esc` يُبتلع **فقط** حين نكون في وضع نشط — يُحسم وقت التشغيل لا هنا.
  { code: 'Escape', action: { kind: 'escape' }, swallow: false },
  { code: 'ArrowUp', action: { kind: 'step', delta: 1 }, swallow: false },
  { code: 'ArrowDown', action: { kind: 'step', delta: -1 }, swallow: false },
]

/** أوضاع تبديل الأدوات وحدها — بقيّة `BINDINGS` (اللوحة · `Esc` · الأسهم) ثابتة. */
const TOOL_MODES: readonly ToolShortcutMode[] = ['inspect', 'measure', 'colour', 'compare']

/**
 * تبني خريطة اختصارات مطابقة لـ`BINDINGS` مع استبدال حرف كل أداة بما تختاره
 * الإعدادات (`shortcuts.toolKeys`، `§12.4`) — بقيّة الروابط (اللوحة · `Esc` ·
 * الأسهم) بلا تغيير. الاستدعاء بلا وسيط يعيد `BINDINGS` بقيمتها حرفًا بحرف.
 */
export function buildBindings(
  toolKeys: Partial<Record<ToolShortcutMode, string>> = {},
): readonly Binding[] {
  return BINDINGS.map((b) => {
    const mode = b.action.kind === 'mode' ? (b.action.mode as ToolShortcutMode) : null
    if (!mode || !TOOL_MODES.includes(mode)) return b
    const code = toolKeys[mode]
    return code && code !== b.code ? { ...b, code } : b
  })
}

/**
 * خريطة اختصار **حيّة** — `Docs/Engineering.md §6` الصفّ 117.
 *
 * كانت الخريطة تُبنى مرّة عند إقلاع الطبقة، فحرفٌ يغيّره المستخدم من الإعدادات لا يصل تبويبًا
 * محقونًا حتى يُعاد حقنه. صارت تُعاد بناؤها مع كل تغيّر في الإعدادات (اشتراك `watchSettings`
 * كالمظهر)، و`installShortcuts` يقرؤها وقت الحدث بـ`get` — فالحرف الجديد يعمل من الضغطة
 * التالية في الجلسة نفسها.
 */
export function liveBindings(
  initial: Partial<Record<ToolShortcutMode, string>>,
  watch: typeof watchSettings = watchSettings,
): { get: () => readonly Binding[]; stop: () => void } {
  let current = buildBindings(initial)
  const stop = watch((settings) => {
    current = buildBindings(settings.shortcuts.toolKeys)
  })
  return { get: () => current, stop }
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * أعمق عنصر مركَّز فعلًا، عبر جذور الظلّ المفتوحة.
 *
 * `document.activeElement` يتوقّف عند **مضيف** الظلّ لا العنصر داخله، فحقل
 * إدخال في مكوّن ويب يبدو للحارس السطحي كأنه ليس حقلًا.
 */
export function deepActiveElement(doc: Document = document): Element | null {
  let el: Element | null = doc.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
}

/** هل التركيز داخل موضع كتابة في الصفحة المضيفة؟ */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  if (EDITABLE_TAGS.has(el.tagName)) {
    // `type=checkbox` ليس موضع كتابة — الأسهم فيه تنقّل لا إدخال.
    if (el.tagName === 'INPUT') {
      const type = (el as HTMLInputElement).type
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range'].includes(type)
    }
    return true
  }
  return el instanceof HTMLElement && el.isContentEditable
}

function matches(e: KeyboardEvent, b: Binding): boolean {
  return (
    e.code === b.code &&
    e.altKey === Boolean(b.alt) &&
    e.shiftKey === Boolean(b.shift) &&
    e.metaKey === Boolean(b.meta) &&
    e.ctrlKey === Boolean(b.ctrl)
  )
}

export interface ShortcutOptions {
  /** يُستدعى لكل أمر مُتعرَّف عليه. */
  onAction: (action: ShortcutAction, event: KeyboardEvent) => void
  /**
   * هل نبتلع `Esc` الآن؟ يُسأل وقت الحدث لا وقت التسجيل: الجواب يعتمد على
   * الوضع النشط، وهو يتغيّر.
   */
  shouldSwallowEscape?: () => boolean
  doc?: Document
  /**
   * خريطة الروابط الفعلية — الافتراضي `BINDINGS`؛ مرّر ناتج `buildBindings` لتخصيص حروف
   * الأدوات، أو دالّةً تُسأل وقت كل حدث (`liveBindings().get`) كي يسري تغيّرها بلا إعادة تركيب.
   */
  bindings?: readonly Binding[] | (() => readonly Binding[])
}

/**
 * يركّب المستمعات ويرجع دالّة فكّها.
 *
 * `⇧` مُعدِّل لا مفتاح أمر: يُبثّ ضغطًا ورفعًا (`constrain`) لتثبيت النسبة
 * أثناء السحب، ولا يُبتلع أبدًا.
 */
export function installShortcuts(options: ShortcutOptions): () => void {
  const doc = options.doc ?? document
  const win = doc.defaultView
  const source = options.bindings ?? BINDINGS
  const currentBindings = typeof source === 'function' ? source : () => source
  if (!win) return () => undefined

  const onKeyDown = (e: KeyboardEvent) => {
    /*
     * `Esc` يُفحص **قبل** حارس التركيز.
     *
     * الحارس موجود كي لا نسرق حرفًا من مستخدم يكتب — و`Esc` ليس حرفًا. وقد
     * ينقر المستخدم داخل حقل في الصفحة أثناء عدّ الالتقاط المؤجَّل (لإظهار
     * حالة تركيز يريد تصويرها)، فلو ابتلع الحارسُ `Esc` لصار الإلغاء غير
     * قابل للوصول أصلًا.
     */
    if (e.code === 'Escape') {
      const swallow = options.shouldSwallowEscape?.() ?? false
      if (swallow) {
        e.preventDefault()
        e.stopPropagation()
      }
      options.onAction({ kind: 'escape' }, e)
      return
    }

    if (isTypingTarget(deepActiveElement(doc))) return

    if (e.key === 'Shift' && !e.repeat) {
      options.onAction({ kind: 'constrain', held: true }, e)
      return
    }

    for (const b of currentBindings()) {
      if (!matches(e, b)) continue
      const swallow =
        b.action.kind === 'escape' ? (options.shouldSwallowEscape?.() ?? false) : b.swallow
      if (swallow) {
        e.preventDefault()
        e.stopPropagation()
      }
      options.onAction(b.action, e)
      return
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') options.onAction({ kind: 'constrain', held: false }, e)
  }

  // `capture: true` هو بيت القصيد: نرى المفتاح قبل مستمعي الصفحة.
  win.addEventListener('keydown', onKeyDown, { capture: true })
  win.addEventListener('keyup', onKeyUp, { capture: true })

  return () => {
    win.removeEventListener('keydown', onKeyDown, { capture: true })
    win.removeEventListener('keyup', onKeyUp, { capture: true })
  }
}
