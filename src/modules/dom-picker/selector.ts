/**
 * مولّد المحدِّدات — فريد، وأقصر ما يمكن، و**مستقرّ**.
 *
 * الثلاثة ليست في مرتبة واحدة. الفريد شرط صحّة: محدِّد يطابق عنصرين خطأ لا
 * محدِّد أطول. والمستقرّ شرط نفع: `.css-1x2y3z` فريد اليوم وميّت بعد أوّل
 * إعادة بناء، والمستخدم ينسخ هذا النصّ إلى تقرير أو اختبار يبقى بعده. والقصر
 * راحة تأتي بعدهما.
 *
 * لذلك الترتيب: `#id` مستقرّ ← `[data-testid]` ← أقصر مسار أصناف مستقرّة
 * فريد ← `:nth-child` ملاذًا أخيرًا. وكل درجة تُختبَر بالتفرّد الفعلي في
 * المستند لا بالافتراض.
 *
 * **الجذر لا المستند.** كل استعلام يجري داخل `getRootNode()` — جذر الظلّ إن
 * كان العنصر فيه. المحدِّد لا يعبر حدّ الظلّ بحكم المواصفة، فادّعاء تفرّد
 * على مستوى المستند لعنصر داخل ظلّ ادّعاء باطل.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { isUnstableClass, isUnstableId } from './unstable-names'

/** أقصى عدد مستويات تُضاف قبل الاستسلام إلى `:nth-child`. */
const MAX_DEPTH = 6

/** سمات الاختبار، بترتيب الشيوع. مقصودة للاستهداف فتسبق كل ما عداها. */
const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'] as const

/**
 * جذر الاستعلام لهذا العنصر.
 *
 * `getRootNode()` يعطي `Document` أو `ShadowRoot`. كلاهما يطبّق
 * `querySelectorAll`، وهو ما نحتاجه — ولا يعبر أيّهما إلى الآخر.
 */
function rootOf(el: Element): Document | ShadowRoot {
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root : (el.ownerDocument ?? document)
}

/**
 * تهريب معرّف CSS.
 *
 * `CSS.escape` هو الصحيح الوحيد: معرّفات مثل `:r1:` أو `2col` أو `a.b` تكسر
 * المحدِّد بلا تهريب. الاحتياطي لبيئات بلا `CSS` (اختبارات وحدة قديمة) يغطّي
 * الحالة الشائعة ولا يدّعي الكمال.
 */
function esc(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/([^\w-])/g, '\\$1')
}

/** هل يطابق هذا المحدِّد هذا العنصر **وحده** داخل جذره؟ */
function isUnique(selector: string, el: Element, root: Document | ShadowRoot): boolean {
  try {
    const found = root.querySelectorAll(selector)
    return found.length === 1 && found[0] === el
  } catch {
    // محدِّد غير صالح (تهريب ناقص) — يُعامَل كغير فريد فيُجرَّب ما بعده.
    return false
  }
}

/** الأصناف الصالحة للاعتماد عليها، بترتيب ظهورها. */
export function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => !isUnstableClass(c))
}

/** سمة اختبار إن وُجدت — أقوى إشارة نيّة استهداف في الصفحة. */
function testAttrSelector(el: Element): string | null {
  for (const attr of TEST_ATTRS) {
    const value = el.getAttribute(attr)
    if (value) return `[${attr}="${value.replace(/"/g, '\\"')}"]`
  }
  return null
}

/** موضع العنصر بين إخوته من الوسم نفسه، ابتداءً من 1. */
function nthOfType(el: Element): number {
  let n = 1
  let sib = el.previousElementSibling
  while (sib) {
    if (sib.tagName === el.tagName) n += 1
    sib = sib.previousElementSibling
  }
  return n
}

const tagOf = (el: Element) => el.tagName.toLowerCase()

/**
 * أفضل واصف لعنصر واحد، بلا سياق أجداده.
 *
 * يُرجع قائمة مرتَّبة من الأقوى إلى الأضعف، ليجرّبها المستدعي بالترتيب:
 * كل واحد أطول من سابقه، فأوّل فريد هو الأقصر الفريد.
 */
function describeCandidates(el: Element): string[] {
  const out: string[] = []
  const tag = tagOf(el)

  const testAttr = testAttrSelector(el)
  if (testAttr) out.push(testAttr)

  const classes = stableClasses(el)
  // صنف واحد أوّلًا، ثم اثنان، ثم الكلّ — أقصر ما يميّز يكفي.
  if (classes.length > 0) {
    for (const c of classes) out.push(`${tag}.${esc(c)}`)
    if (classes.length > 1) {
      out.push(`${tag}${classes.map((c) => `.${esc(c)}`).join('')}`)
    }
  }

  out.push(tag)
  return out
}

export interface SelectorResult {
  /** المحدِّد نفسه — فارغ يعني تعذّر التوليد. */
  readonly selector: string
  /** هل ثبت تفرّده فعلًا داخل جذره؟ */
  readonly unique: boolean
  /** هل اضطُرّ إلى `:nth-child`؟ مؤشِّر هشاشة يعرضه الفاحص. */
  readonly positional: boolean
  /**
   * جذر الظلّ الذي يعيش فيه العنصر، إن وُجد.
   *
   * المحدِّد لا يعبر حدّ الظلّ، فالمستهلك يحتاج أن يعرف أن هذا النصّ يُشغَّل
   * داخل جذر لا على المستند — وإلا ظنّه معطوبًا وهو سليم.
   */
  readonly inShadow: boolean
}

/**
 * يبني محدِّدًا لعنصر.
 *
 * الخوارزمية:
 *   1. معرّف مستقرّ فريد ⇒ انتهينا (`#main`).
 *   2. سمة اختبار فريدة ⇒ انتهينا.
 *   3. واصف العنصر وحده فريد ⇒ انتهينا (`button.primary`).
 *   4. وإلا: أضف أجدادًا واحدًا واحدًا حتى يصير المسار فريدًا.
 *   5. وإلا: `:nth-child` على العنصر، ثم أعد المحاولة صعودًا.
 */
export function buildSelector(el: Element): SelectorResult {
  const root = rootOf(el)
  const inShadow = root instanceof ShadowRoot

  // 1) المعرّف — أقصر محدِّد ممكن حين يكون مستقرًّا.
  const id = el.getAttribute('id')
  if (id && !isUnstableId(id)) {
    const candidate = `#${esc(id)}`
    if (isUnique(candidate, el, root)) {
      return { selector: candidate, unique: true, positional: false, inShadow }
    }
  }

  // 2) سمة اختبار — نيّة استهداف صريحة كتبها مؤلِّف الصفحة.
  const testAttr = testAttrSelector(el)
  if (testAttr && isUnique(testAttr, el, root)) {
    return { selector: testAttr, unique: true, positional: false, inShadow }
  }

  // 3) واصف العنصر وحده.
  for (const candidate of describeCandidates(el)) {
    if (isUnique(candidate, el, root)) {
      return { selector: candidate, unique: true, positional: false, inShadow }
    }
  }

  // 4) صعود بالأجداد حتى التفرّد.
  const self = describeCandidates(el)[0] ?? tagOf(el)
  let path = self
  let node: Element | null = el.parentElement

  for (let depth = 0; depth < MAX_DEPTH && node; depth++) {
    // معرّف الجدّ المستقرّ يقطع الصعود فورًا — لا شيء فوقه ينفع أكثر.
    const ancestorId = node.getAttribute('id')
    if (ancestorId && !isUnstableId(ancestorId)) {
      const candidate = `#${esc(ancestorId)} ${path}`
      if (isUnique(candidate, el, root)) {
        return { selector: candidate, unique: true, positional: false, inShadow }
      }
    }

    for (const desc of describeCandidates(node)) {
      const candidate = `${desc} ${path}`
      if (isUnique(candidate, el, root)) {
        return { selector: candidate, unique: true, positional: false, inShadow }
      }
    }

    path = `${describeCandidates(node)[0] ?? tagOf(node)} ${path}`
    node = node.parentElement
  }

  // 5) الملاذ الأخير: الموضع. هشّ بالتعريف — يتغيّر بإدراج أخ — لكنه
  //    فريد دائمًا، ووسمه `positional` يجعل هشاشته ظاهرة لا مخفيّة.
  const positional = positionalSelector(el, root)
  return {
    selector: positional,
    unique: isUnique(positional, el, root),
    positional: true,
    inShadow,
  }
}

/**
 * مسار موضعي كامل من الجذر — يُستعمل حين يفشل كل ما سبق.
 *
 * الصعود يتوقّف عند انعدام الأب لا عند مقارنة بالجذر: جذر الظلّ ليس
 * `Element` أصلًا، فالمقارنة به لا تصحّ نوعًا. و`documentElement` أبوه
 * `null`، فالشرط نفسه يغطّي المستند وجذر الظلّ معًا.
 */
function positionalSelector(el: Element, root: Document | ShadowRoot): string {
  void root
  const parts: string[] = []
  let node: Element | null = el

  while (node) {
    const tag = tagOf(node)
    const parent: Element | null = node.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node?.tagName)
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${nthOfType(node)})` : tag)
    node = parent
  }

  return parts.join(' > ')
}

/** طول المحدِّد بالمحارف — مقياس القصر الذي تفرض المرحلة قياسه. */
export function selectorLength(result: SelectorResult): number {
  return result.selector.length
}

/**
 * الاسم المختصر الذي تعرضه بطاقة العنصر.
 *
 * `Overlay / Node Label` في Figma تعرض `.hero-title` لا مسارًا كاملًا:
 * المساحة سطر واحد، والغرض تعريفٌ سريع لا استهدافٌ برمجي. المحدِّد الكامل
 * يبقى متاحًا للنسخ.
 */
export function shortLabel(el: Element): string {
  const id = el.getAttribute('id')
  if (id && !isUnstableId(id)) return `#${id}`

  const classes = stableClasses(el)
  if (classes.length > 0) return `.${classes[0]}`

  const testAttr = testAttrSelector(el)
  if (testAttr) return testAttr

  return tagOf(el)
}
