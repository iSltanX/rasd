/**
 * قراءة عنصر: حدوده، وصناديقه، وصلاحيته للاستهداف، والمشي في شجرته.
 *
 * **يلمس DOM ولا يستورد طبقة تشغيل.** القاعدة في `modules/` تمنع الاستيراد من
 * `content/` و`ui/` وأخواتها، لا استعمال واجهات المتصفّح القياسية — ووحدة
 * اسمها «منتقي DOM» لا معنى لها بلا DOM. كل دالّة هنا تأخذ العنصر صراحةً ولا
 * تقرأ حالة عامّة، فتُختبَر بشجرة مصطنعة بلا متصفّح.
 */

import { fromDomRect, type ViewportRect } from '@/shared/geometry'

/** الجوانب الأربعة — يطابق `Edges` في بدائيّة `BoxModel`. */
export interface Edges {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * الجوانب بترتيب `inset` المختصر.
 *
 * الصناديق تُبنى بالمرور على هذا المصفوف لا بكتابة `left:`/`right:` حرفيًا:
 * قاعدة اللنت تمنع المفاتيح الفيزيائية في الكائنات لأن الواجهة عربية RTL،
 * وهذه القيم **قياسات DOM لا أنماط** — فالاستثناء يُنال بالبنية لا بتعطيل
 * القاعدة. البدائيّة `BoxModel` فعلت الشيء نفسه في المرحلة 6.
 */
const SIDES = ['top', 'right', 'bottom', 'left'] as const

const edgesOf = (read: (side: (typeof SIDES)[number]) => number): Edges =>
  Object.fromEntries(SIDES.map((side) => [side, read(side)])) as unknown as Edges

const ZERO: Edges = edgesOf(() => 0)

/**
 * أصغر مساحة تجعل العنصر قابلًا للاستهداف.
 *
 * عنصر 1×1 موجود في كل صفحة تقريبًا (بكسل تتبّع، مرساة، فاصل)، واستهدافه
 * لا يفيد المستخدم ويحجب ما تحته. والصفر وحده حدًّا لا يكفي: عناصر التخطيط
 * الصفرية كثيرة ومزعجة.
 */
export const MIN_TARGET_SIZE = 2

/** وسوم لا معنى لاستهدافها — لا تُرسَم أصلًا. */
const NON_VISUAL = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'HEAD',
  'TITLE',
  'BASE',
  'NOSCRIPT',
  'TEMPLATE',
  'BR',
  'WBR',
])

/**
 * حدود العنصر بإحداثيات النافذة.
 *
 * `getBoundingClientRect` يُرجع **الصندوق المحيط بعد التحويل**: عنصر مكبَّر
 * ×2 يعطي مستطيلًا مضاعفًا، ومُدار 45° يعطي الصندوق المحيط بالشكل المائل لا
 * الشكل نفسه. وهذا هو المطلوب هنا بالضبط، لسببين: ما يراه المستخدم على
 * الشاشة هو الشكل المحوَّل، وبدائيّات الطبقة كلّها مستطيلات محاذية للمحاور
 * تُوضَع بـ`translate` — فرسم رباعي مائل يتطلّب بدائيّة أخرى لا وجود لها.
 *
 * ما **لا** يعكسه: القصّ بـ`overflow: hidden` على جدّ. عنصر طويل داخل حاوية
 * قصيرة يُرجع ارتفاعه الكامل بينما المرئي منه أقلّ — انظر `visibleRect`.
 */
export function elementBounds(el: Element): ViewportRect {
  return fromDomRect(el.getBoundingClientRect())
}

/**
 * يقرأ طولًا بالبكسل من نمط محسوب.
 *
 * **الوحدة تُفحَص، ولا يُكتفى بـ`parseFloat`.** القيمة المحسوبة لعنصر
 * مخطَّط تكون «مستعمَلة» بالبكسل دائمًا، فتُحلّ النسب و`auto` قبل أن تصلنا.
 * لكن على عنصر `display: none` لا تخطيط يُحلّ به، فترجع القيمة خامًا —
 * `"10%"` — و`parseFloat` يبتلعها فيعطي `10` بلا شكوى، فيُرسَم مخطّط صندوق
 * بأرقام مخترَعة. قيس في Chrome: `padding: 10%` داخل حاوية 400px يعطي
 * `"40px"` مخطَّطًا و`"10%"` مخفيًّا.
 */
function px(style: CSSStyleDeclaration, prop: string): number {
  const raw = style.getPropertyValue(prop)
  if (!raw.endsWith('px')) return 0
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : 0
}

function edgesFrom(style: CSSStyleDeclaration, prefix: string, suffix: string): Edges {
  return edgesOf((side) => px(style, `${prefix}-${side}${suffix}`))
}

export interface BoxEdges {
  readonly margin: Edges
  readonly border: Edges
  readonly padding: Edges
}

/**
 * صناديق العنصر الثلاثة من نمطه المحسوب.
 *
 * **فيزيائية عمدًا** (`top`/`right`/`bottom`/`left`) لا منطقية: القيمة هنا
 * نتيجة بعد أن حلّ المتصفّح اتجاه ذلك العنصر ووضع كتابته، لا نيّة تصميم
 * منّا — وهو التعليل نفسه المكتوب في بدائيّة `BoxModel` منذ المرحلة 6.
 *
 * `getComputedStyle` يفرض إعادة حساب أنماط، فلا يُستدعى في المسار الساخن:
 * يُقرأ عند **تغيّر الهدف** لا عند كل إطار.
 */
export function boxEdges(el: Element, win: Window = globalThis.window): BoxEdges {
  const style = win.getComputedStyle(el)
  return {
    margin: edgesFrom(style, 'margin', ''),
    border: edgesFrom(style, 'border', '-width'),
    padding: edgesFrom(style, 'padding', ''),
  }
}

/** مستطيل الهامش — أوسع الصناديق، وهو ما يرسمه `BoxModel`. */
export function marginRect(rect: ViewportRect, margin: Edges): ViewportRect {
  return {
    space: 'viewport',
    x: rect.x - margin.left,
    y: rect.y - margin.top,
    width: rect.width + margin.left + margin.right,
    height: rect.height + margin.top + margin.bottom,
  }
}

/**
 * هل يصلح هذا العنصر هدفًا؟
 *
 * **`getClientRects()` لا `getBoundingClientRect()`.** الأخيرة تعطي `0×0`
 * لثلاث حالات مختلفة لا يجمعها شيء: `display: none`، و`display: contents`،
 * وعنصر فارغ فعلًا. والأولى تفرّق: **صفر مستطيلات** لما لا صندوق له،
 * ومستطيلًا لكل سطر في المضمَّن الملتفّ. المجموع لا العدد هو المقياس، لأن
 * مضمَّنًا فارغًا يعطي مستطيلًا واحدًا مساحته صفر.
 *
 * **بلا `getComputedStyle` عمدًا.** المتصفّح يستبعد `visibility: hidden`
 * و`pointer-events: none` و`display: none` من نتيجة اختبار الإصابة أصلًا،
 * فالسؤال عنها هناك تكرار. وهذه الدالّة تُستدعى في المشي في الشجرة مرّة لكل
 * ابن — وقياسٌ في Chrome يقول إن `getComputedStyle` على شجرة أنماط مُتّسخة
 * يكلّف ~22ms، أي إطارًا كاملًا وزيادة.
 *
 * `opacity: 0` **لا** يُرفَض: يشغل مساحة ويستقبل النقر، وكثيرًا ما يكون هو
 * ما يريد المستخدم فحصه (طبقة فوق صورة، حالة قبل الظهور).
 *
 * الخروج عن النافذة **لا** يُرفَض: التمرير لا ينتج عنه هدف خارجها أصلًا،
 * والمشي في الشجرة ينتجه — وهو بالضبط ما يوجب التمرير إليه لا رفضه.
 *
 * تُرجع `boolean` لا حارس نوع (`el is Element`): الحارس يُضيّق الفرع
 * السالب إلى `never` عند كل مستدعٍ يمرّر `Element` أصلًا، فيكسر المشي في
 * الشجرة. ولا مستدعي يحتاج التضييق.
 */
export function isTargetable(el: Element | null): boolean {
  if (!el || el.nodeType !== 1) return false
  if (NON_VISUAL.has(el.tagName)) return false

  const rects = el.getClientRects()
  if (rects.length === 0) return false

  let area = 0
  for (const r of rects) area += r.width * r.height
  return area >= MIN_TARGET_SIZE * MIN_TARGET_SIZE
}

// ─────────────────────────────────────────────────────────────────
// المشي في الشجرة
// ─────────────────────────────────────────────────────────────────

/**
 * الأب القابل للاستهداف.
 *
 * يتخطّى الآباء عديمي المساحة بدل التوقّف عندهم: أغلفة التخطيط (`display:
 * contents`، حاويات صفرية) كثيرة في الأطر الحديثة، والتوقّف عند واحدها يعطي
 * المستخدم «صعودًا» لا يغيّر شيئًا على الشاشة فيبدو معطَّلًا.
 *
 * يتوقّف عند `<html>`: فوقه المستند نفسه، ولا معنى لفحصه.
 */
export function walkUp(el: Element): Element | null {
  let node = el.parentElement
  while (node) {
    if (node === node.ownerDocument.documentElement) return null
    if (isTargetable(node)) return node
    node = node.parentElement
  }
  return null
}

/**
 * أوّل ابن ذي مساحة، بترتيب DOM.
 *
 * **ترتيب DOM لا الأكبر مساحةً**: النزول يجب أن يكون عكس الصعود تمامًا كي
 * يعود المستخدم من حيث جاء. اختيار «الأكبر» يجعل ↑ ثم ↓ ينتهيان عند عنصر
 * ثالث، وهو ما يجعل التنقّل يبدو عشوائيًا.
 *
 * يغوص في الأغلفة عديمة المساحة للسبب نفسه في `walkUp`.
 */
export function walkDown(el: Element): Element | null {
  for (const child of el.children) {
    if (isTargetable(child)) return child
    // غلاف بلا مساحة: ابحث داخله بدل تخطّيه.
    const deeper = walkDown(child)
    if (deeper) return deeper
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// الوصف الكامل
// ─────────────────────────────────────────────────────────────────

export interface ElementInfo {
  readonly el: Element
  readonly tag: string
  /** مستطيل الحدود (صندوق الإطار) بإحداثيات النافذة. */
  readonly rect: ViewportRect
  readonly edges: BoxEdges
}

/**
 * كل ما تحتاجه الواجهة عن عنصر، بقراءة واحدة.
 *
 * تُستدعى عند **تغيّر الهدف** لا عند كل إطار: تحوي `getComputedStyle` الذي
 * يفرض إعادة حساب أنماط، وتكرارها ستّين مرّة في الثانية هو بالضبط ما يمنعه
 * شرط «الاستهداف يجب ألّا يُبطئ الصفحة».
 */
export function describeElement(el: Element, win: Window = globalThis.window): ElementInfo {
  return {
    el,
    tag: el.tagName.toLowerCase(),
    rect: elementBounds(el),
    edges: boxEdges(el, win),
  }
}

export { ZERO as ZERO_EDGES }
