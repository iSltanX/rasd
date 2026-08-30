/**
 * الدور والاسم المحسوب — **مستنتَجان لا محسوبان**، والفرق يُعلَن.
 *
 * الخطّة تطلب «الدور، الاسم المحسوب». وشجرة الإتاحة المحسوبة **لا تُتاح
 * لسكربت صفحة عادي**: قِيس أن `computedRole` و`computedName` و
 * `getComputedAccessibleNode` غير موجودة، وأن `element.role` **انعكاس
 * سمة لا حساب** — `button.role` يساوي `null` بينما
 * `div[role="button"].role` يساوي `"button"`.
 *
 * فما هنا **تقريب** يتّبع تعيينات HTML-AAM المعروفة، ويعلن مصدره في كل
 * حالة. وعرضه كأنه ما يقرؤه قارئ الشاشة كذبٌ في أكثر الأماكن حساسية.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

export type RoleSource =
  /** سمة `role` صريحة كتبها المؤلِّف. */
  | 'aria-attribute'
  /** مستنتَج من الوسم بتعيين HTML-AAM. */
  | 'html-aam'
  /** لا تعيين معروف — ولا يُخترَع. */
  | 'unknown'

export interface RoleReading {
  readonly role: string | null
  readonly source: RoleSource
}

/**
 * تعيينات الوسم ← الدور الضمني.
 *
 * مقصورة على ما لا خلاف عليه. والوسوم ذات الدور **المشروط**
 * (`<a>` بلا `href`، `<input>` بحسب `type`، `<section>` بلا اسم) تُعالَج
 * صراحةً أدناه بدل أن تُدرَج هنا خطأً.
 */
const IMPLICIT_ROLE: Record<string, string> = {
  button: 'button',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  form: 'form',
  table: 'table',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  img: 'img',
  dialog: 'dialog',
  select: 'combobox',
  textarea: 'textbox',
  progress: 'progressbar',
  hr: 'separator',
  article: 'article',
  figure: 'figure',
  fieldset: 'group',
  search: 'search',
  output: 'status',
  summary: 'button',
}

/** أدوار `<input>` بحسب نوعه — والباقي غير محسوم. */
const INPUT_ROLE: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
}

/** يقرأ الدور، ويعلن من أين جاء. */
export function readRole(el: Element): RoleReading {
  const explicit = el.getAttribute('role')?.trim()
  if (explicit) {
    // قائمة الأدوار قد تحمل أكثر من واحد؛ الأوّل المعروف هو الفعّال.
    const first = explicit.split(/\s+/)[0]
    if (first) return { role: first, source: 'aria-attribute' }
  }

  const tag = el.localName

  if (tag === 'a' || tag === 'area') {
    // بلا `href` لا دور — وهذا خطأ إتاحة شائع يستحقّ أن يُرى.
    return el.hasAttribute('href')
      ? { role: 'link', source: 'html-aam' }
      : { role: null, source: 'unknown' }
  }

  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase()
    const role = INPUT_ROLE[type]
    return role ? { role, source: 'html-aam' } : { role: null, source: 'unknown' }
  }

  if (tag === 'section') {
    // دور `region` مشروط بوجود اسم متاح.
    return hasAccessibleNameHint(el)
      ? { role: 'region', source: 'html-aam' }
      : { role: null, source: 'unknown' }
  }

  const implicit = IMPLICIT_ROLE[tag]
  if (implicit) return { role: implicit, source: 'html-aam' }

  return { role: null, source: 'unknown' }
}

function hasAccessibleNameHint(el: Element): boolean {
  return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')
}

export type NameSource =
  'aria-label' | 'aria-labelledby' | 'label-element' | 'alt' | 'title' | 'text-content' | 'unknown'

export interface NameReading {
  readonly name: string | null
  readonly source: NameSource
}

/**
 * تقريب الاسم المتاح، بترتيب أولوية `accname`.
 *
 * **تقريب لا حساب**: المواصفة تفرض خطوات لا تُنفَّذ من سكربت صفحة (حساب
 * محتوى نصّي بالتتالي، وتخطّي العناصر المخفيّة، ودمج `alt` المتداخل). فما
 * هنا يغطّي الحالات الشائعة ويعلن مصدره، وما لا يغطّيه يُرجع `unknown`.
 */
export function readAccessibleName(el: Element): NameReading {
  const label = el.getAttribute('aria-label')?.trim()
  if (label) return { name: label, source: 'aria-label' }

  const labelledBy = el.getAttribute('aria-labelledby')?.trim()
  if (labelledBy) {
    const root = el.getRootNode()
    const parts: string[] = []
    for (const id of labelledBy.split(/\s+/)) {
      const ref = (root as Document | ShadowRoot).getElementById?.(id)
      const text = ref?.textContent?.trim()
      if (text) parts.push(text)
    }
    if (parts.length > 0) return { name: parts.join(' '), source: 'aria-labelledby' }
  }

  if (el.localName === 'img') {
    const alt = el.getAttribute('alt')
    // `alt=""` مقصود: صورة زخرفية بلا اسم — وهو **ليس** غيابًا.
    if (alt !== null) return { name: alt, source: 'alt' }
  }

  if (isLabelable(el)) {
    const labelText = labelFor(el)
    if (labelText) return { name: labelText, source: 'label-element' }
  }

  const title = el.getAttribute('title')?.trim()
  if (title) return { name: title, source: 'title' }

  if (NAME_FROM_CONTENT.has(el.localName)) {
    const text = el.textContent?.trim()
    if (text) return { name: collapse(text), source: 'text-content' }
  }

  return { name: null, source: 'unknown' }
}

/** وسوم يأتي اسمها من محتواها النصّي. */
const NAME_FROM_CONTENT = new Set([
  'button',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'summary',
  'legend',
  'td',
  'th',
  'option',
])

const LABELABLE = new Set(['input', 'select', 'textarea', 'meter', 'progress', 'output'])

function isLabelable(el: Element): boolean {
  return LABELABLE.has(el.localName)
}

function labelFor(el: Element): string | null {
  const labels = (el as HTMLInputElement).labels
  if (labels && labels.length > 0) {
    const text = Array.from(labels)
      .map((l) => l.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
    if (text) return collapse(text)
  }
  const wrapper = el.closest('label')
  const text = wrapper?.textContent?.trim()
  return text ? collapse(text) : null
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()
