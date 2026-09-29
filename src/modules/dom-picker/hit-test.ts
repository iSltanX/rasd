/**
 * ما العنصر الذي تحت هذه النقطة؟
 *
 * ثلاث عقبات بين السؤال وجوابه، وكلٌّ حُسمت بالقياس في Chrome لا بالاستنتاج:
 *
 *   1. **طبقتنا نفسها** تتصدّر كل اختبار إصابة حين تكون تفاعلية. تُستبعَد
 *      **بالهُويّة** لا بالموضع.
 *   2. **جذور الظلّ** لا يعبرها `elementsFromPoint` — تُنزَل بالتكرار.
 *   3. **الإطارات** تتوقّف عندها النتيجة عند وسم `<iframe>` نفسه — يُنزَل
 *      إليها بترجمة إحداثيات.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل. كل مدخل
 * DOM يُمرَّر صراحةً فتُختبَر الوحدة بمستند مصطنع.
 */

import { isTargetable } from './inspect'

/**
 * أقصى عمق تعشيش لجذور الظلّ.
 *
 * صفحة عدائية قد تعشّش بلا حدّ، والحلقة تجري في المسار الساخن. الحدّ سخيّ
 * جدًّا مقارنةً بأي شجرة مكوّنات حقيقية.
 */
const MAX_SHADOW_DEPTH = 32

/** أقصى عمق تعشيش للإطارات — للسبب نفسه. */
const MAX_FRAME_DEPTH = 8

/**
 * كومة العناصر عند نقطة، بلا طبقتنا.
 *
 * **الاستبعاد بالهُويّة لا بالفهرس.** `list[0] === host ? slice(1) : list`
 * خطأ: حين يفشل `showPopover()` تهبط الطبقة إلى `position: fixed`، فيعلوها
 * عنصر صفحة في سياق تراصّ أعلى ويصير مضيفنا في الفهرس 1 أو بعده.
 *
 * ولا حاجة إلى استبعاد أكثر من المضيف: قيس في Chrome أن **أبناء جذر الظلّ
 * المغلق لا يتسرّبون أبدًا** — كلّهم يُعاد استهدافهم إلى المضيف، فيظهر
 * المضيف مرّة واحدة ولا يظهر سواه منّا.
 *
 * **لا يُطفَأ `pointer-events` للاختبار.** الإطفاء ثم الإشعال يكلّف 12.2µs
 * مقابل 7.75µs للنداء المجرَّد (قياس على صفحة 5024 عقدة) — زيادة 57% بلا
 * مقابل، ويكسر `:hover` والتقاط المؤشِّر على عناصرنا. والدرع نفسه مطلوب:
 * بدونه تملك الصفحة النقرة، فالنقر على رابط **يغادر الصفحة**.
 */
export function stackAt(doc: Document, x: number, y: number, skip?: Element | null): Element[] {
  const out: Element[] = []
  for (const el of doc.elementsFromPoint(x, y)) {
    if (el !== skip) out.push(el)
  }
  return out
}

/**
 * أعمق عنصر داخل جذر ظلّ عند نقطة.
 *
 * **`elementsFromPoint` لا `elementFromPoint`.** المفردة تُجري اختبار إصابة
 * على **المستند كلّه** ثم تُعيد استهداف النتيجة إلى شجرة هذا الجذر — فما
 * دامت طبقتنا فوق كل شيء تُرجع **مضيفنا نحن**، فنستهدف أنفسنا. قيس في
 * Chrome: جذر ظلّ فيه `div#leaf` تحت مضيف رصد تفاعلي يعطي `X-RASD` للمفردة
 * و`[X-RASD, DIV#leaf, DIV, BODY, HTML]` للجمع.
 *
 * فيُستبعَد مضيفنا بالهُويّة، ويُشترَط أن يكون المرشّح **من هذا الجذر**
 * (`getRootNode() === root`): بقيّة الكومة عناصر مستند لا تخصّ هذا الظلّ،
 * واختيارها يقفز خارج الشجرة التي نحن بصددها.
 */
function inShadow(root: ShadowRoot, x: number, y: number, skip?: Element | null): Element | null {
  const list = root.elementsFromPoint?.(x, y)
  if (list) {
    for (const el of list) {
      if (el !== skip && el.getRootNode() === root) return el
    }
    return null
  }
  // بيئة بلا `elementsFromPoint` على الجذر: المفردة مع فحص الانتماء.
  const one = root.elementFromPoint(x, y)
  return one && one !== skip && one.getRootNode() === root ? one : null
}

/**
 * ينزل في جذور الظلّ المفتوحة حتى أعمق عنصر عند النقطة.
 *
 * `composedPath()` **لا يصلح** بديلًا: هو سلسلة أجداد هدف الحدث لا كومة
 * الإحداثية. ومع الدرع مفعَّلًا يستهدف كل حدث مضيفَنا، فيصير المسار
 * `[host, html, document, window]` — بلا عنصر صفحة واحد.
 *
 * الظلّ **المغلق** يعطي `shadowRoot === null` فيتوقّف النزول عند مضيفه —
 * وهو الجواب الصحيح: المضيف هو الوحيد الذي يستطيع مؤلّف الصفحة مخاطبته
 * بمحدِّد. والمحتوى المُشرَّب (`slotted`) يعيش في الشجرة الفاتحة أصلًا،
 * فيأتي في الكومة مباشرةً بلا نزول.
 */
export function descend(seed: Element, x: number, y: number, skip?: Element | null): Element {
  let node = seed
  for (let d = 0; d < MAX_SHADOW_DEPTH; d++) {
    const root = node.shadowRoot
    if (!root) break
    const inner = inShadow(root, x, y, skip)
    // `inner === node` حارس ضدّ دورة لا تنتهي.
    if (!inner || inner === node) break
    node = inner
  }
  return node
}

// ─────────────────────────────────────────────────────────────────
// الإطارات
// ─────────────────────────────────────────────────────────────────

/** ما يمكن فعله بإطار. */
export type FrameAccess = 'same-origin' | 'cross-origin'

/**
 * هل يمكن الدخول إلى هذا الإطار؟
 *
 * `contentDocument` يرمي أو يعطي `null` عبر الأصول. ويعطي `null` أيضًا
 * لإطار معزول (`sandbox` بلا `allow-same-origin`) ولإطار وضعه Chrome في
 * عملية منفصلة — وكلاهما يُعامَل معاملة العابر للأصل، وهو التدهور الصحيح.
 */
export function probeFrame(frame: HTMLIFrameElement): FrameAccess {
  try {
    return frame.contentDocument ? 'same-origin' : 'cross-origin'
  } catch {
    return 'cross-origin'
  }
}

/** المقياس الخطّي لتحويل عنصر، أو 1 حين لا تحويل. */
function scaleOf(style: CSSStyleDeclaration): { sx: number; sy: number } {
  const t = style.transform
  if (!t || t === 'none') return { sx: 1, sy: 1 }
  try {
    const m = new DOMMatrixReadOnly(t)
    const sx = Math.hypot(m.a, m.b)
    const sy = Math.hypot(m.c, m.d)
    return { sx: sx || 1, sy: sy || 1 }
  } catch {
    return { sx: 1, sy: 1 }
  }
}

function edge(style: CSSStyleDeclaration, prop: string): number {
  const n = Number.parseFloat(style.getPropertyValue(prop))
  return Number.isFinite(n) ? n : 0
}

/**
 * يترجم نقطة من نافذة الأب إلى نافذة الابن.
 *
 * **أصل الترجمة صندوق المحتوى لا مستطيل الحدود.** `getBoundingClientRect`
 * يعطي صندوق **الإطار**: إطار 300×200 بحدّ 10px يبلّغ 320×220. فالحدّ
 * والحشو يُطرحان بعده. قيس في Chrome: عنصر داخلي عند (20,100) محلّيًا
 * يقابل (130,160) في الأب.
 *
 * **ولا يُضاف تمرير الابن.** `getBoundingClientRect` داخل الابن منسوب إلى
 * نافذة الابن أصلًا، فإضافة `scrollY` تحسبه مرّتين. قيس مع الابن مُمرَّرًا
 * إلى y=300 فبقيت المطابقة صحيحة بلا إضافة.
 */
export function toFrameSpace(
  frame: HTMLIFrameElement,
  x: number,
  y: number,
  style: CSSStyleDeclaration,
): { x: number; y: number } {
  const r = frame.getBoundingClientRect()
  const { sx, sy } = scaleOf(style)
  return {
    x: (x - r.x) / sx - (edge(style, 'border-left-width') + edge(style, 'padding-left')),
    y: (y - r.y) / sy - (edge(style, 'border-top-width') + edge(style, 'padding-top')),
  }
}

/** عنصر مُستهدَف، مع الإطار الذي يعيش فيه. */
export interface Hit {
  readonly el: Element
  /**
   * سلسلة الإطارات من الأعلى إلى موطن العنصر — فارغة للإطار الأعلى.
   *
   * تلزم لترجمة حدود العنصر عائدةً إلى نافذة الأعلى قبل رسمها.
   */
  readonly frames: readonly HTMLIFrameElement[]
  /**
   * إطار عابر للأصل تعذّر الدخول إليه.
   *
   * حين يصحّ، فالعنصر هو وسم `<iframe>` نفسه: يُبرَز صندوقًا واحدًا ويُعلَن
   * خارج النطاق. الكذب هنا أسوأ من الاعتراف — لا يمكن معرفة ما داخله.
   */
  readonly opaqueFrame: boolean
}

const isFrame = (el: Element): el is HTMLIFrameElement => el.tagName === 'IFRAME'

/**
 * العنصر تحت النقطة، نازلًا في الظلال والإطارات.
 *
 * الترتيب مقصود: تُستبعَد طبقتنا، ثم يُنزَل في الظلّ، ثم في الإطار، ثم
 * يُفحَص الصلاح. وحين يفشل المرشّح الأعلى يُجرَّب ما تحته من الكومة نفسها
 * بدل الاستسلام — وهذا سبب إرجاع `elementsFromPoint` كومةً لا عنصرًا.
 *
 * **الوصول المباشر للإطار المطابق للأصل، لا رسالة.** الخطّة نصّت على رسالة
 * إلى `frameId`؛ والقياس يقول إن النزول المباشر يكلّف 14.1µs بينما أرخص
 * جولة رسائل ≈1ms — لكن العدد ليس الحجّة. الحجّة أن `requestAnimationFrame`
 * **لا ينتظر**: مع الرسائل يُرسَم الإطار بالهدف السابق ويصل الجواب بعد
 * إطار أو أكثر، فيتخلّف الإبراز عن المؤشِّر دائمًا. سُجِّل تعارضًا في
 * `Docs/Engineering.md §6`.
 */
export function pickAt(doc: Document, x: number, y: number, skip?: Element | null): Hit | null {
  return pickIn(doc, x, y, skip, [], 0)
}

function pickIn(
  doc: Document,
  x: number,
  y: number,
  skip: Element | null | undefined,
  frames: readonly HTMLIFrameElement[],
  depth: number,
): Hit | null {
  for (const seed of stackAt(doc, x, y, skip)) {
    const node = descend(seed, x, y, skip)

    if (isFrame(node) && depth < MAX_FRAME_DEPTH) {
      const access = probeFrame(node)
      if (access === 'cross-origin') {
        return { el: node, frames, opaqueFrame: true }
      }

      const inner = node.contentDocument
      const view = node.ownerDocument.defaultView
      if (inner && view) {
        const local = toFrameSpace(node, x, y, view.getComputedStyle(node))
        // الإطار الابن لا يحمل مضيفًا لنا — `startOverlay` يركّبه في الإطار
        // الأعلى وحده — فلا شيء يُستبعَد بالداخل.
        const hit = pickIn(inner, local.x, local.y, null, [...frames, node], depth + 1)
        if (hit) return hit
      }
      // تعذّر النزول رغم أنه مطابق للأصل: الإطار نفسه هو الهدف.
      return { el: node, frames, opaqueFrame: false }
    }

    if (isTargetable(node)) return { el: node, frames, opaqueFrame: false }
  }
  return null
}
