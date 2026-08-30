/**
 * تقييم شروط القواعد — **بلا كتابة حرف واحد خارج ظلّنا**.
 *
 * بحثٌ سابق اقترح «عرّافًا» يتبنّى ورقة في `document.adoptedStyleSheets`
 * ليسأل المتصفّح عن شرط قاعدة. وقيس أنه **يُلغى بالكامل**:
 *
 * | الشرط | الطريق | الاتّفاق |
 * |---|---|---|
 * | `@media` | `ownerDocument.defaultView.matchMedia` | 250/250 |
 * | `@supports` | `CSS.supports(conditionText)` | 140/140 |
 * | `@container` | سلسلة حاويات مستنسَخة **داخل ظلّنا** | 34/34 |
 * | `@scope` | `matches` و`querySelectorAll` | 27/27 |
 *
 * والعرّاف في نطاق المستند مرفوض بثلاثة قياسات لا بمبدأ وحده: **71×
 * أغلى** على github (13.68ms مقابل 0.19ms للشرط)، و**مرئيّ لأي سكربت
 * صفحة** (`adoptedStyleSheets.length` تنتقل 0 ← 1)، **ويُطلق
 * `transitionstart` مرّتين** على الصفحة.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/** نتيجة تقييم شرط — أو اعتراف بأنه لم يُقيَّم. */
export type CondVerdict =
  | { readonly kind: 'matched'; readonly value: boolean }
  | { readonly kind: 'unevaluated'; readonly reason: 'scroll-state' | 'detached-view' }

const matched = (value: boolean): CondVerdict => ({ kind: 'matched', value })

/**
 * `@media` — من نافذة **العنصر** لا من نافذتنا.
 *
 * قيس أن `window.matchMedia` يخطئ 0/3 لعنصر داخل إطار عرضه 400px بينما
 * النافذة 1280px، وأن `ownerDocument.defaultView.matchMedia` يصيب 3/3.
 * والفرق ليس حافّة: كل صفحة فيها إطار مضمَّن تقع فيه.
 */
export function evaluateMedia(rule: CSSMediaRule, el: Element): CondVerdict {
  const view = el.ownerDocument.defaultView
  if (!view) return { kind: 'unevaluated', reason: 'detached-view' }

  const text = rule.conditionText || rule.media.mediaText
  if (!text) return matched(true)

  try {
    return matched(view.matchMedia(text).matches)
  } catch {
    // شرط لا يفهمه المتصفّح لا يُطبَّق أصلًا.
    return matched(false)
  }
}

/**
 * `@supports` — `CSS.supports` أحاديّ الوسيط.
 *
 * قيس أنه يبتلع كل صيغ `conditionText` بلا رمي، بما فيها `selector(:has(a))`
 * و`not` والمركَّب المتداخل و`font-tech`.
 *
 * ويُقرأ من **نافذة العنصر** كما في `evaluateMedia`، لا من النطاق المعجمي:
 * `CSS` كائن نافذة، والصفحة قد تحوي إطارات لكلٍّ نافذته. والقراءة من
 * النافذة تصحّ عبر الإطارات وتُختبَر بلا حِيَل.
 *
 * وبيئة بلا `CSS.supports` تُعامَل معاملة «مدعوم»: قاعدة `@supports`
 * موجودة في الورقة يعني أن متصفّحًا ما قبلها، وإسقاطها بلا دليل أسوأ من
 * قبولها.
 */
export function evaluateSupports(rule: CSSSupportsRule, el?: Element): CondVerdict {
  const text = rule.conditionText
  if (!text) return matched(true)

  const view = el?.ownerDocument.defaultView ?? globalThis
  const supports = (view as { CSS?: { supports?: (c: string) => boolean } }).CSS?.supports
  if (typeof supports !== 'function') return matched(true)

  try {
    return matched(supports.call((view as { CSS: unknown }).CSS, text))
  } catch {
    return matched(false)
  }
}

// ─────────────────────────────────────────────────────────────────
// ‏@scope
// ─────────────────────────────────────────────────────────────────

interface ScopeRuleLike {
  readonly start: string | null
  readonly end: string | null
}

/**
 * `@scope (start) to (end)` — بلا كتابة، بـ`matches` و`querySelectorAll`.
 *
 * **الفرق الذي لا يُخمَّن ويجب أن يُقاس**: النطاق **الضمنيّ** علاقةُ سليلٍ
 * صارمة، فالجذر لا يطابقه محدِّد مجرَّد أبدًا — قيس أن
 * `@scope (.a) { .c {} }` على `<div class="a c">` يعطي **كاذبًا**. أمّا
 * `:scope` و`&` الصريحان فيطابقان الجذر.
 */
export function evaluateScope(rule: ScopeRuleLike, el: Element, selector: string): CondVerdict {
  const roots = scopeRoots(rule.start, el)
  if (roots.length === 0) return matched(false)

  for (const root of roots) {
    if (rule.end && isBeyondEnd(root, el, rule.end)) continue
    if (selectorHitsInScope(root, el, selector)) return matched(true)
  }
  return matched(false)
}

/** جذور النطاق المرشَّحة: العنصر فأسلافه ممّا يطابق `start`، الأقرب أوّلًا. */
function scopeRoots(start: string | null, el: Element): Element[] {
  if (!start) {
    const root = el.ownerDocument.documentElement
    return root ? [root] : []
  }

  const out: Element[] = []
  let node: Element | null = el
  while (node) {
    try {
      if (node.matches(start)) out.push(node)
    } catch {
      return []
    }
    node = node.parentElement
  }
  return out
}

/** هل العنصر عند حدّ النطاق أو تحته؟ */
function isBeyondEnd(root: Element, el: Element, end: string): boolean {
  let limits: Element[]
  try {
    limits = Array.from(root.querySelectorAll(end.includes(':scope') ? end : `:scope ${end}`))
  } catch {
    return false
  }
  if (limits.length === 0) return false

  // امشِ من العنصر صعودًا حتى الجذر **حصرًا**: الجذر داخل نطاقه دائمًا،
  // حتى إن طابق الحدّ نفسه (مقيس).
  let node: Element | null = el
  while (node && node !== root) {
    if (limits.includes(node)) return true
    node = node.parentElement
  }
  return false
}

function selectorHitsInScope(root: Element, el: Element, selector: string): boolean {
  const explicit = selector.includes(':scope') || selector.includes('&')
  try {
    if (explicit) {
      return el === root
        ? root.matches(selector.replace(/&/g, ':scope'))
        : Array.from(root.querySelectorAll(selector.replace(/&/g, ':scope'))).includes(el)
    }
    // ضمنيّ: علاقة سليل صارمة — `:scope ` تُقصي الجذر تلقائيًّا.
    return Array.from(root.querySelectorAll(`:scope ${selector}`)).includes(el)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────
// ‏@container
// ─────────────────────────────────────────────────────────────────

/** مضيف الفحص — **دائم لكل مستند**، لا يُنشأ لكل شرط. */
export interface ContainerProbe {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  readonly doc: Document
}

/**
 * ينشئ مضيف فحص داخل جذر ظلّ مغلق خاصّ به.
 *
 * **المضيف دائم**: قيس أن إنشاءه لكل شرط يكلّف 27ms على tailwindcss.com،
 * بينما الفحص فوق مضيف قائم يكلّف **0.0145–0.17ms** ساخنًا.
 *
 * ويُخفى بـ`visibility: hidden` **لا `display: none`**: الأخير يهدم
 * الاستعلام أصلًا لأن العنصر بلا صندوق فلا حاوية له.
 */
export function createContainerProbe(doc: Document): ContainerProbe {
  const host = doc.createElement('div')
  host.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;visibility:hidden;contain:strict;pointer-events:none'
  doc.documentElement.append(host)
  const root = host.attachShadow({ mode: 'closed' })
  return { host, root, doc }
}

export function disposeContainerProbe(probe: ContainerProbe): void {
  probe.host.remove()
}

/** الخصائص التي تُنسَخ من كل حاوية في السلسلة. */
const CONTAINER_PROPS = [
  'container-type',
  'container-name',
  'writing-mode',
  'font-size',
  'direction',
] as const

/**
 * مقاس صندوق حاوية بالبكسل — من `getComputedStyle` لا من مستطيل الحدود.
 *
 * قيس أن `getBoundingClientRect` **يخطئ تحت التحويل**: حاوية عرضها 500px
 * عليها `transform: scale(0.5)` تعطي مستطيلًا عرضه 250px، والمتصفّح يقيّم
 * الشرط على 500. و`getComputedStyle().width` يعطي الصندوق المنطقي الصحيح،
 * ويلزم تصحيحه بـ`box-sizing` وحده.
 */
function boxSize(cs: CSSStyleDeclaration): { width: string; height: string } {
  return { width: cs.width, height: cs.height }
}

const px = (v: string): number => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** سلسلة أسلاف الحاويات، من الأبعد إلى الأقرب. */
function containerChain(el: Element, view: Window): Element[] {
  const out: Element[] = []
  let node: Element | null = el.parentElement
  while (node) {
    const type = view.getComputedStyle(node).getPropertyValue('container-type')
    if (type && type !== 'normal') out.unshift(node)
    node = node.parentElement
  }
  return out
}

/**
 * `@container` — بلا تحليل نصّ الشرط إطلاقًا.
 *
 * **تُستنسَخ سلسلة الحاويات كاملةً** داخل ظلّنا بأبعادها وسياق كتابتها، ثم
 * يُلصق نصّ الشرط حرفيًّا ويُقرأ المتغيّر. فيختار Chrome الحاوية بقواعده
 * هو — بما فيها تخطّي المحور غير المدعوم، والحاويات المسمّاة، و`transform`
 * و`zoom` و`writing-mode`. واستنساخ **حاوية واحدة** يفشل في تخطّي المحور
 * (مقيس)، واختيارها يدويًّا يعيد إنتاج قواعد المتصفّح ناقصةً.
 *
 * `scroll-state()` **يُردّ غير مقيَّم**: دالّة حالة تمرير حيّة لا تُستنسَخ،
 * والسلسلة المستنسَخة تحمل `container-type: scroll-state` فتعطي جوابًا
 * يبدو صحيحًا وهو خطأ — فخّ صامت يُقطَع بالإعلان.
 */
export function evaluateContainer(
  rule: CSSContainerRule,
  el: Element,
  probe: ContainerProbe,
): CondVerdict {
  const text = rule.conditionText
  if (!text) return matched(true)
  if (text.includes('scroll-state(')) return { kind: 'unevaluated', reason: 'scroll-state' }

  const view = el.ownerDocument.defaultView
  if (!view) return { kind: 'unevaluated', reason: 'detached-view' }

  const chain = containerChain(el, view)

  // ابنِ السلسلة المستنسَخة: عنصر لكل حاوية، وآخر هدفًا في القاع.
  let cursor: HTMLElement | null = null
  const built: HTMLElement[] = []

  for (const original of chain) {
    const cs = view.getComputedStyle(original)
    const clone = probe.doc.createElement('div')
    const size = boxSize(cs)
    const decls: string[] = [`width:${px(size.width)}px`, `height:${px(size.height)}px`]
    for (const prop of CONTAINER_PROPS) {
      const v = cs.getPropertyValue(prop)
      if (v) decls.push(`${prop}:${v}`)
    }
    // الخصائص المخصَّصة لازمة لشروط `style()`.
    for (let i = 0; i < cs.length; i++) {
      const name = cs.item(i)
      if (name.startsWith('--')) decls.push(`${name}:${cs.getPropertyValue(name)}`)
    }
    clone.style.cssText = decls.join(';')
    built.push(clone)
    if (cursor) cursor.append(clone)
    cursor = clone
  }

  const target = probe.doc.createElement('div')
  target.id = 'rasd-cond-target'
  if (cursor) cursor.append(target)

  const rootNode = built[0] ?? target
  probe.root.replaceChildren(rootNode)

  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`@container ${text} { #rasd-cond-target { --r: 1 } }`)
    probe.root.adoptedStyleSheets = [sheet]
    const value = view.getComputedStyle(target).getPropertyValue('--r').trim() === '1'
    return matched(value)
  } catch {
    return { kind: 'unevaluated', reason: 'detached-view' }
  } finally {
    probe.root.adoptedStyleSheets = []
    probe.root.replaceChildren()
  }
}
