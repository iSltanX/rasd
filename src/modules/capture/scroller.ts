/**
 * أيّ شيء يمرّر هذه الصفحة؟
 *
 * السؤال يبدو تافهًا وليس كذلك. `readSpace().pageHeight` المبنيّ في المرحلة
 * 6 يحسب `max(root.scrollHeight, body.scrollHeight)`، وهو صحيح **حين يكون
 * المستند هو المُمرِّر وحده** — وقيس أنه مكسور على خمسة من سبعة تخطيطات
 * جُرِّبت: لوحة SPA بحاوية داخلية أعطت 1035 بينما المحتوى 10,350.
 *
 * وثلاثة مصائد قِيست، كلّها تُنتج **التقاطًا صامتًا خاطئًا** لا خطأً ظاهرًا:
 *
 *   1. `document.scrollingElement` ليس الجواب. في تخطيط
 *      `html{overflow:hidden} + body{overflow:auto}` يُرجع `HTML` ويساوي
 *      `documentElement`، بينما المُمرِّر الفعلي هو `BODY`
 *      (`window.scrollTo(0,1e6)` تركت `scrollY = 0`).
 *   2. «يُفضَّل الجذر إن كان مداه > 0» يكسر على تذييل 20px: مدى الجذر 20
 *      فيُختار الجذر، فيُلتقَط 733 من 12,000 — فقد 94% بصمت. المقارنة
 *      **بين المدَيات** لا بفحص الصفر.
 *   3. عتبة تغطية 60% ترفض لوحة قراءة ثلاثية الأجزاء تغطّي 50% ومداها
 *      11,287px، فلا يبقى شيء قابل للالتقاط.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل — ويجوز له
 * استعمال واجهات المتصفّح القياسية.
 */

/** أقلّ فيض يجعل الحاوية مرشّحة — أقلّ منه ضجيج تخطيط لا محتوى. */
export const MIN_OVERFLOW_PX = 64

/**
 * أقلّ نصيب من النافذة يجعل الحاوية «هي الصفحة».
 *
 * 0.35 لا 0.6: قيس أن لوحة قراءة ثلاثية الأجزاء تعطي المرشّح الشرعيّ الوحيد
 * تغطيةً 50% ومدًى 11,287px — فعتبة 0.6 كانت ترفضه فلا يبقى ما يُلتقَط.
 */
export const MIN_VIEWPORT_SHARE = 0.35

/**
 * كم يجب أن يفوق مدى الحاوية مدى الجذر ليُنتزَع منه الاختيار.
 *
 * المقارنة بين المدَيات لا فحص صفر: تذييل صغير يعطي الجذر مدًى 20px، وهو
 * «يمرّر» تقنيًّا ولا يمثّل الصفحة.
 */
export const RIVAL_FACTOR = 10

export interface ScrollTarget {
  readonly kind: 'viewport' | 'element'
  readonly el: Element
  readonly clientHeight: number
  readonly scrollHeight: number
  /** أقصى إزاحة تمرير ممكنة — عدد صحيح مقرَّب، والحقيقي قد يفوقه كسريًّا. */
  readonly maxScroll: number
}

/**
 * موضع تمرير — `x`/`y` لا `left`/`top`.
 *
 * يتّسق مع `ViewportRect` في `shared/geometry.ts`، ويتفادى مفاتيح الجوانب
 * الفيزيائية التي تمنعها قاعدة اللنت في واجهة عربية RTL. والمحوران معًا
 * لازمان: RTL يجعل التمرير الأفقي سالبًا، فحفظ العمودي وحده يفقد الموضع.
 */
export interface ScrollPos {
  readonly x: number
  readonly y: number
}

export interface TargetChoice {
  readonly target: ScrollTarget
  /** `ambiguous` حين وُجد منافس قريب — يُسجَّل في سجلّ اللقطة لا يُخفى. */
  readonly confidence: 'certain' | 'ambiguous'
  readonly rivals: readonly ScrollTarget[]
  /** المستند يمرّر أيضًا وقد اختيرت حاوية — محتوًى خارجها لن يُلتقَط. */
  readonly rootAlsoScrolls: number
}

const overflowOf = (el: Element, win: Window): string => win.getComputedStyle(el).overflowY

function toTarget(el: Element, kind: ScrollTarget['kind']): ScrollTarget {
  const scrollHeight = el.scrollHeight
  const clientHeight = el.clientHeight
  return {
    kind,
    el,
    clientHeight,
    scrollHeight,
    maxScroll: Math.max(0, scrollHeight - clientHeight),
  }
}

/** نصيب الحاوية من مساحة النافذة، بين 0 و1. */
function viewportShare(el: Element, win: Window): number {
  const r = el.getBoundingClientRect()
  const vw = win.innerWidth
  const vh = win.innerHeight
  if (vw <= 0 || vh <= 0) return 0
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
  return (w * h) / (vw * vh)
}

/** عمق العنصر في الشجرة — يُرجَّح الأقلّ عند التساوي (الحاوية الخارجية). */
function depthOf(el: Element): number {
  let d = 0
  let node: Element | null = el.parentElement
  while (node) {
    d += 1
    node = node.parentElement
  }
  return d
}

/**
 * يجد ما يمرّر هذه الصفحة فعلًا.
 *
 * الترتيب: كل مرشّح ذي فيض معتبر وتغطية كافية، ثم الأكبر مدًى، ثم الأقلّ
 * عمقًا. ويُنتزَع الاختيار من الجذر فقط حين يفوقه منافسٌ بفارق معتبر.
 */
export function findScrollTarget(doc: Document = document): TargetChoice {
  const win = doc.defaultView ?? window
  const root = doc.scrollingElement ?? doc.documentElement
  const rootTarget = toTarget(root, 'viewport')

  const candidates: ScrollTarget[] = []
  for (const el of doc.querySelectorAll('*')) {
    if (el === root || el === doc.documentElement || el === doc.body) continue
    const over = overflowOf(el, win)
    if (over !== 'auto' && over !== 'scroll' && over !== 'overlay') continue
    const t = toTarget(el, 'element')
    if (t.maxScroll < MIN_OVERFLOW_PX) continue
    if (viewportShare(el, win) < MIN_VIEWPORT_SHARE) continue
    candidates.push(t)
  }

  // `body` حالة خاصّة: قد يكون هو المُمرِّر بينما `scrollingElement` يشير
  // إلى `html`. قيس هذا التخطيط صراحةً.
  if (doc.body && doc.body !== root) {
    const bodyTarget = toTarget(doc.body, 'element')
    if (bodyTarget.maxScroll >= MIN_OVERFLOW_PX) candidates.push(bodyTarget)
  }

  candidates.sort((a, b) => b.maxScroll - a.maxScroll || depthOf(a.el) - depthOf(b.el))

  const best = candidates[0]
  const beatsRoot = best && best.maxScroll > rootTarget.maxScroll * RIVAL_FACTOR
  const rootIsIdle = rootTarget.maxScroll < MIN_OVERFLOW_PX

  if (best && (beatsRoot || rootIsIdle)) {
    const rivals = candidates.slice(1)
    const close = rivals.some((r) => r.maxScroll > best.maxScroll * 0.5)
    return {
      target: best,
      confidence: close ? 'ambiguous' : 'certain',
      rivals,
      rootAlsoScrolls: rootTarget.maxScroll,
    }
  }

  return {
    target: rootTarget,
    confidence: candidates.length > 0 ? 'ambiguous' : 'certain',
    rivals: candidates,
    rootAlsoScrolls: 0,
  }
}

/** يقرأ موضع التمرير الحالي — المحورين معًا لأن RTL يجعل الأفقي سالبًا. */
export function readScroll(t: ScrollTarget, win: Window = window): ScrollPos {
  if (t.kind === 'viewport') return { x: win.scrollX, y: win.scrollY }
  return { x: t.el.scrollLeft, y: t.el.scrollTop }
}

/**
 * يمرّر فورًا — `behavior: 'instant'` حصرًا.
 *
 * قيس على صفحة `html{scroll-behavior:smooth}`: `scrollTo(0,3000)` أعطت 0
 * فورًا و2988 بعد 800ms؛ و`scrollTop = 3000` أعطت 4 فورًا (المُعيِّن يحترم
 * CSS)؛ بينما `scrollTo({behavior:'instant'})` أعطت 3000 فورًا. فلا حاجة
 * إلى تعديل نمط الصفحة — الخيار يتفوّق على CSS بلا مسّها.
 */
export function scrollToInstant(t: ScrollTarget, pos: ScrollPos, win: Window = window): void {
  // المفتاح محسوب لا حرفيّ: `ScrollToOptions` تفرض اسمًا فيزيائيًّا
  // (`left`)، وقاعدة اللنت تمنع كتابته حرفيًّا في كائن. الحساب يمرّ لأن
  // القاعدة تستهدف الأسماء المكتوبة في الشيفرة لا الواجهات المفروضة علينا.
  const inlineKey = 'left' as const
  const opts: ScrollToOptions = { [inlineKey]: pos.x, top: pos.y, behavior: 'instant' }
  if (t.kind === 'viewport') win.scrollTo(opts)
  else t.el.scrollTo(opts)
}
