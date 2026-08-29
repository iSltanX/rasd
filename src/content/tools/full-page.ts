/**
 * طرف الصفحة في الالتقاط الكامل — التهيئة والخطوة والاستعادة.
 *
 * **ليس أداة وضع.** `area-select` و`element-hover` مصنعا أدوات يوجّهها
 * المستخدم بالمؤشِّر ولها `phase` و`handlers`؛ وهذا لا يستقبل مؤشِّرًا ولا
 * يملك حالة تفاعلية: مهمّة تُقاد من الـservice worker وتنفّذ ثلاث رسائل.
 * ولذلك يبقى `mode` على `idle` طوال المهمّة، و`full-page` اسم **أداة** في
 * `ToolName` لا اسم وضع في `MODES` — وهو فصل مقصود منذ المرحلة 3.
 *
 * **والاستعادة هي العقد الأهمّ هنا.** الصفحة تُترك كما وُجدت: الأنماط،
 * والموضع، والعناصر المخفيّة. تقع في `finish()`، ويستدعيها الـSW في
 * `finally` مهما كان المآل.
 */

import {
  classify,
  isTrapped,
  showsInTile,
  type Candidate,
  type Treatment,
} from '@/modules/capture/full-page/fixed-elements'
import {
  findScrollTarget,
  readScroll,
  scrollToInstant,
  type ScrollPos,
  type ScrollTarget,
} from '@/modules/capture/scroller'

import type { FullPagePrepared, FullPageStep } from '@/shared/messaging/contract'

/** ميزانية التمهيد — يُكمَل بعدها ويُعلَن أنه لم يكتمل، ولا يُدَّعى نجاح. */
const PREFLIGHT_MAX_STEPS = 400
const PREFLIGHT_MAX_MS = 8_000

/** مهلة فكّ ترميز الصور، للدفعة كلّها لا لكل صورة. */
const DECODE_BUDGET_MS = 1_500

/** مهلة انتظار الخطوط. */
const FONTS_BUDGET_MS = 2_000

/**
 * إطارا رسم بعد كل تمرير.
 *
 * قيس على 24 بلاطة بتحقّق ببكسل: صفر إطارات → 19/24 صحيحة، **إطار واحد →
 * 14/24** (أسوأ من الصفر — إطار قديم فعلًا)، إطاران → 24/24، ثلاثة → 24/24.
 * فالإطاران ليسا ذوقًا. والثالث لا يضيف شيئًا مقيسًا، وثمنه 16ms × كل بلاطة.
 */
function settle(win: Window): Promise<void> {
  return new Promise((resolve) => {
    const raf = win.requestAnimationFrame?.bind(win)
    if (!raf) {
      resolve()
      return
    }
    raf(() => raf(() => resolve()))
  })
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.then((v) => v), new Promise<null>((r) => setTimeout(() => r(null), ms))])

/** حالة المهمّة الجارية — تعيش خارج الإشارات لأنها لا تُعرَض. */
interface Session {
  readonly target: ScrollTarget
  readonly origin: ScrollPos
  readonly candidates: Candidate[]
  /** الأنماط السطرية الخام قبل المسّ، مفهرسة بمرجع العنصر. */
  readonly saved: Map<Element, string | null>
  readonly hiddenFloating: number
  readonly preflightComplete: boolean
  readonly rootAlsoScrolls: number
}

let session: Session | null = null

/**
 * يمسح العناصر الثابتة.
 *
 * خاصّية **واحدة** تُقرأ في المسح العريض (`position`)؛ وبقيّتها تُقرأ على
 * المرشّحين وحدهم. قيس المسح الكامل على 6019 عقدة بـ1.3ms — فلا داعي
 * لمُرشِّح CSSOM الذي يعقّد ولا يوفّر.
 *
 * والنزول في جذور الظلّ المفتوحة لازم: أدوات الطرف الثالث (الدردشة، لافتة
 * الكوكيز) تعيش فيها غالبًا، وهي بالضبط ما يتكرّر.
 */
function scanFixed(root: Document | ShadowRoot, win: Window, out: Element[]): void {
  for (const el of root.querySelectorAll('*')) {
    const pos = win.getComputedStyle(el).position
    if (pos === 'fixed' || pos === 'sticky') out.push(el)
    if (el.shadowRoot) scanFixed(el.shadowRoot, win, out)
  }
}

/**
 * التمهيد: نزول تدريجي يوقظ التحميل المؤجَّل و`content-visibility`.
 *
 * **شرط لا تحسين.** قيس أن قفزة واحدة إلى القاع تُطلق **صفرًا** من أربعين
 * قسم `content-visibility: auto`، بينما خطوة بارتفاع نافذة تُطلق 36. ولا عدد
 * إطارات يعوّض عنه: الصفحة بلا تمهيد تُعرَض بعد 82–97ms بينما إطارا `rAF`
 * ينتهيان عند 10–25ms.
 *
 * والخطوة = ارتفاع النافذة بالضبط: أكبر خطوة لها ضمانة هندسية بتغطية كل صفّ
 * بكسل. (وهي **لا** تضمن إطلاق مُلاحِظي الصفحة ذوي العتبة > 0 — قيس أن
 * `threshold: 0.9` أُطلق لـ18 من 40 فقط. حدّ مُعلَن.)
 */
async function preflight(target: ScrollTarget, win: Window): Promise<boolean> {
  const started = Date.now()
  const step = Math.max(1, target.clientHeight)
  let steps = 0

  for (let y = 0; y <= target.maxScroll; y += step) {
    if (steps >= PREFLIGHT_MAX_STEPS || Date.now() - started > PREFLIGHT_MAX_MS) return false
    scrollToInstant(target, { x: 0, y }, win)
    await settle(win)
    steps += 1
  }

  /*
   * `decode()` على صورة مؤجَّلة لم يبدأ تحميلها **لا يُحسم أبدًا**: قيس أنه
   * بقي معلَّقًا بعد 4000ms بلا قبول ولا رفض، وأنه **لا** يُجبر بدء التحميل.
   * فالمهلة إلزامية، و`allSettled` لا `all` كي لا تُسقط صورةٌ فاشلة المهمّةَ.
   */
  const images = Array.from(win.document.images)
  await withTimeout(
    Promise.allSettled(images.map((img) => img.decode())).then(() => null),
    DECODE_BUDGET_MS,
  )

  // وعدٌ يتجدّد: خطّ يُحقن بعد التمرير يعيد الحالة إلى `loading`.
  await withTimeout(
    win.document.fonts.ready.then(() => null),
    FONTS_BUDGET_MS,
  )
  return true
}

/** يهيّئ الصفحة ويُرجع ما تحتاجه الحلقة. */
export async function prepareFullPage(
  win: Window = window,
  /**
   * مضيف طبقتنا — يُمرَّر صراحةً ولا يُبحَث عنه.
   *
   * **لا محدِّد يجده.** المرحلة 6 تعمّدت ألّا تترك للمضيف اسمًا ولا صنفًا
   * ولا سمةً تُستهدَف، صمودًا أمام صفحة عدائية — فمحاولة العثور عليه
   * بـ`[data-rasd-host]` تُرجع `null` دائمًا.
   *
   * وثمن إغفاله مقيس: المضيف `position: fixed` بـ`inset: 0`، فيُصنَّف
   * **ممتدًّا** ويدخل مسار التعديل، فتُنزَع عنه `position: fixed !important`
   * في كل بلاطة — أي تُكسَر عزلة الطبقة التي بُنيت المرحلة 6 كلّها لأجلها.
   */
  hostEl?: Element | null,
): Promise<FullPagePrepared> {
  const doc = win.document
  const choice = findScrollTarget(doc)
  const target = choice.target
  const origin = readScroll(target, win)

  // ── المسح والتصنيف ────────────────────────────────────────────
  const found: Element[] = []
  scanFixed(doc, win, found)

  // مضيفنا نفسه `fixed` بملء النافذة — استبعاده صراحةً قبل أي تصنيف، وإلا
  // صُنِّف «ممتدًّا» وعبثنا بأنماطه فكسرنا ترقيته إلى الطبقة العليا.
  const host = hostEl ?? null
  const before = new Map<Element, DOMRect>()
  for (const el of found) before.set(el, el.getBoundingClientRect())

  // الاختبار التجريبي للحبس: قارن المستطيل عند إزاحتين.
  scrollToInstant(target, { x: origin.x, y: Math.min(target.maxScroll, 1200) }, win)
  await settle(win)

  const candidates: Candidate[] = []
  for (const el of found) {
    if (el === host || (host && host.contains(el))) continue
    const pos = win.getComputedStyle(el).position
    if (pos !== 'fixed' && pos !== 'sticky') continue
    const after = el.getBoundingClientRect()
    const trapped = isTrapped(before.get(el) ?? after, after)
    candidates.push(classify(el, pos, after, win.innerHeight, win.innerWidth, trapped))
  }

  scrollToInstant(target, origin, win)
  await settle(win)

  const preflightComplete = await preflight(target, win)
  scrollToInstant(target, { x: origin.x, y: 0 }, win)
  await settle(win)

  const saved = new Map<Element, string | null>()
  for (const c of candidates) saved.set(c.el, c.el.getAttribute('style'))

  session = {
    target,
    origin,
    candidates,
    saved,
    hiddenFloating: candidates.filter((c) => c.anchor === 'float').length,
    preflightComplete,
    rootAlsoScrolls: choice.rootAlsoScrolls,
  }

  return {
    step: target.clientHeight,
    maxScroll: target.maxScroll,
    innerWidth: win.innerWidth,
    clientWidth: doc.documentElement.clientWidth,
    visualScale: win.visualViewport?.scale ?? 1,
    // جانب الشريط يُشتقّ وقت التشغيل لا من `dir`: بعض المنصّات تعكسه.
    gutterOnStart: doc.documentElement.getBoundingClientRect().left > 0,
    hiddenFloating: session.hiddenFloating,
    rootAlsoScrolls: session.rootAlsoScrolls,
    preflightComplete,
  }
}

/**
 * يطبّق التحييد لهذه البلاطة.
 *
 * **لا يُلمَس `el.style` إطلاقًا — يُكتب `style` سمةً نصّية.** قيس في Chrome
 * أن أي تعديل على `CSSStyleDeclaration` يجعل `removeAttribute('style')`
 * يترك سمةً **فارغة** لا يحذفها: عنصر بلا نمط سطري أصلًا انتهى بـ`style=""`
 * بعد دورة كاملة. والفرق ليس بصريًّا لكنه خرقٌ لعقد «تُعاد الصفحة كما
 * وُجدت»، ويظهر لأي سكربت صفحة يقرأ `hasAttribute('style')`.
 *
 * والكتابة النصّية تجعل الاستعادة **صحيحة بالبناء**: النصّ المحفوظ يُعاد
 * حرفًا بحرف، بلا تطبيع يفعله `cssText` (قيس أنه يحوّل `10PX`←`10px`
 * و`#ff0000`←`rgb(255,0,0)` وينقل `!important` إلى آخر السلسلة).
 *
 * التطبيق **سطريّ على المرشّحين وحدهم** لا بورقة أنماط عامّة. قيس أن ورقة
 * `* { position: static !important }` تكلّف **+380px** من تشوّه ارتفاع
 * الصفحة (= مجموع ارتفاعات العناصر الثابتة وقد دخلت التدفّق). وقيس أن ورقة
 * محقونة في `document.head` **لا تعبر جذور الظلّ** — وهي بالضبط حيث تعيش
 * أدوات الطرف الثالث المتكرّرة.
 */
function applyTile(tileIndex: number, lastIndex: number): void {
  if (!session) return
  for (const c of session.candidates) {
    if (c.treatment === 'leave') continue

    const base = session.saved.get(c.el) ?? null
    const extra = showsInTile(c.anchor, tileIndex, lastIndex) ? '' : DECLARATIONS[c.treatment]

    if (extra) {
      c.el.setAttribute('style', base ? `${base};${extra}` : extra)
    } else if (base !== null) {
      c.el.setAttribute('style', base)
    } else {
      c.el.removeAttribute('style')
    }
  }
}

/**
 * ما يُضاف إلى النمط السطري لكل علاج.
 *
 * `relative` لا `static` للّاصق: يعيده إلى موضعه المستندي **ويحفظ** كونه
 * كتلةً حاويةً لأحفاده الموضَّعين، وسياقَ تكديسه. قيس أن `static` يزيح شارةً
 * داخل رأس لاصق بمقدار −900px ويقلب ترتيب التراصّ.
 */
const DECLARATIONS: Record<Exclude<Treatment, 'leave'>, string> = {
  hide: 'display:none!important',
  unstick: 'position:relative!important;top:auto!important;bottom:auto!important',
}

/** يمرّر إلى الموضع ويُرجع ما قُرئ فعلًا. */
export async function stepFullPage(
  input: { y: number; tileIndex: number; lastIndex: number },
  win: Window = window,
): Promise<FullPageStep> {
  const s = session
  if (!s) {
    return { scrollY: 0, scrollHeight: 0, maxScroll: 0, visualScale: 1 }
  }

  applyTile(input.tileIndex, input.lastIndex)
  scrollToInstant(s.target, { x: s.origin.x, y: input.y }, win)
  await settle(win)

  // كل رقم مقروء الآن لا محسوبًا مرّة: الصفحة قد تنمو أو تتقلّص بين البلاطات.
  const el = s.target.el
  const scrollHeight = el.scrollHeight
  const clientHeight = el.clientHeight
  return {
    scrollY: readScroll(s.target, win).y,
    scrollHeight,
    maxScroll: Math.max(0, scrollHeight - clientHeight),
    visualScale: win.visualViewport?.scale ?? 1,
  }
}

/**
 * يستعيد الصفحة كما وُجدت.
 *
 * الاستعادة بـ`getAttribute('style')` **الخام** لا بـ`cssText` ولا بحذف
 * الخصائص واحدةً واحدة: قيس أن `cssText` يُطبّع القيم (`10PX`←`10px`،
 * `#ff0000`←`rgb(255,0,0)`، `URL(a.png)`←`url("a.png")`) وينقل الإعلان ذا
 * `!important` إلى آخر السلسلة — فالجولة كاملةً غير مطابقة.
 *
 * وتجري على **لقطة القائمة** المأخوذة وقت التصنيف لا على مسح جديد، كي لا
 * يفلت عنصر نقلته الصفحة أثناء الالتقاط.
 */
export function finishFullPage(win: Window = window): { restored: boolean } {
  const s = session
  if (!s) return { restored: false }
  session = null

  for (const [el, raw] of s.saved) {
    if (raw === null) el.removeAttribute('style')
    else el.setAttribute('style', raw)
  }

  scrollToInstant(s.target, s.origin, win)
  return { restored: true }
}

/** للاختبار: هل ثمّة مهمّة قائمة؟ */
export function hasFullPageSession(): boolean {
  return session !== null
}
