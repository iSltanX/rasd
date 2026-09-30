/**
 * تباين نصّ عنصرٍ مع ما تحته فعلًا — القارئ الواحد لتدقيق الصفحة ولإعادة فحص مشكلة التباين (ADR 0035).
 *
 * **القارئ واحد.** «الآن» في نموذج المشكلة، ورقم التدقيق، وقراءة إعادة الفحص تمرّ كلّها من `measure` هنا؛ ولو
 * اختلف قارئان لصار نصٌّ «دون الحدّ» في التدقيق «محلولًا» لحظة تسجيله مشكلة.
 *
 * **ما يُحسب:** لون النصّ (`-webkit-text-fill-color`، وهو ما يُرسم فعلًا ولو خالف `color`) بألفاه، فوق خلفيات
 * الآباء في الشجرة المرسومة (الفتحة قبل الأب، ومضيف الظلّ بعده)، مع `opacity` كل مجموعة — `audit.ts`.
 *
 * **ما لا يُحسب ويُعلَن بلا رقم** (`UnknownReason`): صورة خلفية أو تدرّج ظاهران تحت النصّ، أو نصٌّ مقصوص على
 * خلفيته (`background-clip: text`)، أو عنصرٌ ليس من آبائه مرسومٌ تحته — صورة أو فيديو أو طبقة ملوّنة
 * مموضعة. والأخير يُرى باختبار الإصابة (`elementsFromPoint`) فلا يُكشف إلا لنصٍّ في النافذة؛ ونصٌّ خارجها يُقرأ
 * من آبائه وحدهم — حدٌّ معلَن في ADR 0035 لا مسكوت.
 *
 * يلمس DOM ولا يستورد طبقة تشغيل — قاعدة `background.ts` المجاورة.
 */

import {
  CANVAS,
  isLargeText,
  layerStep,
  paintOver,
  within,
  type Backdrop,
  type UnknownReason,
} from './audit'
import { layerOf, type Layer } from './composite'
import { contrastRatio } from './contrast'
import { readColour, type Rgb255 } from './formats'

export interface TextContrast {
  /** لون النصّ كما يُرسم فوق خلفيته. */
  readonly fg: Rgb255
  readonly bg: Rgb255
  /** غير مقرَّبة — للحكم. وفي «تعذّر الحساب» تقريبٌ من الآباء لا يُعرض رقمًا. */
  readonly ratio: number
  readonly large: boolean
  readonly unknown: UnknownReason | null
}

type ImageKind = 'image' | 'gradient'

interface Info {
  readonly bg: Layer | null
  /** صورة خلفية العنصر نفسه. */
  readonly own: ImageKind | null
  /** صورةٌ ظاهرة تحت محتواه — منه أو من آبائه عبر ما لم يحجبها. */
  readonly seen: ImageKind | null
  readonly chain: Backdrop
}

/** ما يُرسم تحت نصٍّ ولا تقرؤه خلفية الآباء. */
const MEDIA = new Set(['img', 'video', 'canvas', 'picture', 'iframe', 'object', 'embed', 'svg'])

function imageKind(value: string): ImageKind | null {
  if (!value || value === 'none') return null
  return /gradient\(/.test(value) && !/url\(|image(-set)?\(|element\(|cross-fade\(/.test(value)
    ? 'gradient'
    : 'image'
}

const num = (value: string, fallback: number): number => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

/** الأب في الشجرة **المرسومة**: الفتحة التي أُسند إليها العنصر، ثمّ أبوه، ثمّ مضيف ظلّه. */
export function flatParent(el: Element): Element | null {
  if (el.assignedSlot) return el.assignedSlot
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

export interface ContrastProbe {
  /**
   * `null` حين لا نصّ يُرسم: خطّ أصغر من بكسل، أو لونٌ شفّاف بلا قصٍّ على الخلفية.
   *
   * `box` مستطيل العنصر في النافذة — يُمرَّر ليُختبر ما تحته بالإصابة؛ وبلا مستطيل تُقرأ الآباء وحدهم.
   */
  measure(el: Element, box?: DOMRect | null): TextContrast | null
}

/**
 * قارئٌ بذاكرة: خلفية كل عنصر تُحسب مرّة في الجولة، من خلفية أبيه. جولةٌ جديدة قارئٌ جديد — أنماط الصفحة
 * قد تتغيّر بينهما.
 */
export function createContrastProbe(win: Window = globalThis.window): ContrastProbe {
  const memo = new Map<Element, Info>()

  const infoOf = (el: Element): Info => {
    const pending: Element[] = []
    let node: Element | null = el
    while (node && !memo.has(node)) {
      pending.push(node)
      node = flatParent(node)
    }
    let parent = node ? memo.get(node) : undefined
    // من الأبعد إلى الأقرب — كل عنصر يُبنى على أبيه المحسوب قبله.
    for (let i = pending.length - 1; i >= 0; i--) {
      const n = pending[i] as Element
      const cs = win.getComputedStyle(n)
      // `display: contents` بلا صندوق: لا خلفية تُرسم ولا مجموعة شفافية.
      const boxed = cs.display !== 'contents'
      const read = boxed ? readColour(cs.backgroundColor) : null
      const bg = read && read.alpha > 0 ? layerOf(read) : null
      const opacity = boxed ? num(cs.opacity, 1) : 1
      const own = boxed ? imageKind(cs.backgroundImage) : null
      const through = !bg || bg.alpha < 1 || opacity < 1
      const info: Info = {
        bg,
        own,
        seen: own ?? (through ? (parent?.seen ?? null) : null),
        chain: within(parent?.chain ?? CANVAS, layerStep(bg, opacity)),
      }
      memo.set(n, info)
      parent = info
    }
    return memo.get(el) as Info
  }

  /**
   * عنصرٌ ليس من آبائه مرسومٌ تحت النصّ قبل أن تحجبه خلفيات الآباء — بالإصابة في مركز العنصر.
   *
   * الآباء في المكدّس يُجمع غطاؤهم؛ وأوّل ما ليس منهم ويرسم شيئًا (وسائط، أو خلفية، أو صورة) يعني أن
   * خلفية الآباء ليست ما تحت النصّ.
   */
  const overlapped = (el: Element, box: DOMRect, info: Info): boolean => {
    const doc = el.ownerDocument
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    if (box.width < 1 || box.height < 1 || typeof doc.elementsFromPoint !== 'function') return false
    if (x < 0 || y < 0 || x >= win.innerWidth || y >= win.innerHeight) return false
    const stack = doc.elementsFromPoint(x, y)
    const at = stack.indexOf(el)
    if (at < 0) return false
    let cover = info.bg?.alpha ?? 0
    for (const n of stack.slice(at + 1)) {
      if (cover >= 1) return false
      if (n.contains(el)) {
        const a = infoOf(n).bg?.alpha ?? 0
        cover += a * (1 - cover)
        continue
      }
      if (MEDIA.has(n.localName)) return true
      const other = infoOf(n)
      if (other.bg || other.own) return true
    }
    return false
  }

  return {
    measure(el, box = null) {
      const cs = win.getComputedStyle(el)
      const fontPx = num(cs.fontSize, 0)
      if (fontPx < 1) return null
      const info = infoOf(el)
      const bg = paintOver(info.chain, null)
      const large = isLargeText(fontPx, num(cs.fontWeight, 400))
      const fill = readColour(cs.getPropertyValue('-webkit-text-fill-color') || cs.color)
      if (!fill) return { fg: bg, bg, ratio: 1, large, unknown: 'unreadable' }
      if (fill.alpha <= 0) {
        const clip = `${cs.getPropertyValue('background-clip')} ${cs.getPropertyValue('-webkit-background-clip')}`
        return clip.includes('text') ? { fg: bg, bg, ratio: 1, large, unknown: 'gradient' } : null
      }
      const fg = paintOver(info.chain, layerOf(fill))
      const unknown = info.seen ?? (box && overlapped(el, box, info) ? 'overlap' : null)
      return { fg, bg, ratio: contrastRatio(fg, bg), large, unknown }
    },
  }
}

/** قراءة مفردة بقارئ جديد — لإعادة فحص مشكلة. */
export function measureTextContrast(
  el: Element,
  win: Window = globalThis.window,
): TextContrast | null {
  return createContrastProbe(win).measure(el, el.getBoundingClientRect())
}

// ─────────────────────────────────────────────────────────────────
// الجمع
// ─────────────────────────────────────────────────────────────────

/** ما لا يُرسم نصُّه نصًّا في الصفحة، أو يُرسم بلون غير `color` (`svg` بـ`fill`). */
const SKIP = new Set([
  'head',
  'script',
  'style',
  'noscript',
  'template',
  'title',
  'textarea',
  'select',
  'svg',
  'math',
])

/** `NodeFilter` بأرقامه: القبول والرفض (يُسقط الشجرة الفرعية) والتخطّي (يُسقط العقدة وحدها). */
const ACCEPT = 1
const REJECT = 2
const SKIP_NODE = 3

/**
 * العناصر التي تحمل نصًّا غير فارغ، بترتيب المستند، مرّة لكلٍّ — وتعبر جذور الظلّ المفتوحة.
 *
 * `skip` مضيف طبقتنا: لا يُدقَّق نصّ رصد نفسه.
 */
export function collectTextElements(doc: Document, skip: Element | null = null): Element[] {
  const out: Element[] = []
  const seen = new Set<Element>()
  const walk = (root: Node): void => {
    const walker = doc.createTreeWalker(root, 0x1 | 0x4, {
      acceptNode: (n) =>
        n.nodeType === 1
          ? n === skip || SKIP.has((n as Element).localName)
            ? REJECT
            : ACCEPT
          : /\S/.test((n as Text).data)
            ? ACCEPT
            : SKIP_NODE,
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        const parent = n.parentElement
        if (parent && !seen.has(parent)) {
          seen.add(parent)
          out.push(parent)
        }
      } else {
        const shadow = (n as Element).shadowRoot
        if (shadow) walk(shadow)
      }
    }
  }
  const root = doc.body ?? doc.documentElement
  if (root) walk(root)
  return out
}

/** أصغر ضلعٍ يُعدّ نصًّا ظاهرًا — نمط «لقارئ الشاشة وحده» بكسلٌ في بكسل. */
const MIN_TEXT_BOX = 2

const SEEN: CheckVisibilityOptions = {
  checkOpacity: true,
  checkVisibilityCSS: true,
  opacityProperty: true,
  visibilityProperty: true,
}

/**
 * مستطيل العنصر إن كان نصّه ظاهرًا — `null` للمخفيّ: `display`/`visibility`/`opacity: 0` على العنصر أو
 * آبائه، أو صندوقٌ أصغر من بكسلين، أو مدفوعٌ قبل بداية الصفحة (`left: -9999px`).
 *
 * و`display: contents` بلا صندوقٍ ونصّه يُرسم: يُقاس بمدى محتواه، وتُسأل الرؤيةُ أباه.
 */
export function visibleBox(el: Element, win: Window = globalThis.window): DOMRect | null {
  let r: DOMRect
  if (el.checkVisibility?.(SEEN) === false) {
    const parent = flatParent(el)
    if (win.getComputedStyle(el).display !== 'contents' || !parent) return null
    if (parent.checkVisibility?.(SEEN) === false) return null
    const range = el.ownerDocument.createRange()
    range.selectNodeContents(el)
    r = range.getBoundingClientRect()
  } else {
    r = el.getBoundingClientRect()
  }
  if (r.width < MIN_TEXT_BOX || r.height < MIN_TEXT_BOX) return null
  if (r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) return null
  return r
}
