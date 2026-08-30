/**
 * حلّ التتالي — أي قاعدة فازت بهذه الخاصّية على هذا العنصر.
 *
 * `getComputedStyle` يعطي القيمة النهائية ولا يقول من أين جاءت. وهذا الملفّ
 * يجيب السؤال الآخر — وهو ما يحوّل رصد من أداة تصوير إلى أداة فحص.
 *
 * **ولا سطر تحليل نحوي فيه.** المطابقة تُشترى من `element.matches()`،
 * وتفكيك المختصرات من تعداد `rule.style` (قِيس أن `font:` يعطي 19 مطوَّلًا
 * و`border:` يعطي 17)، وإسقاط التصريحات الباطلة من محلِّل Chrome نفسه (قِيس
 * أن `.bad{color:nosuchcolor;margin:bogus;width:10px}` يعطي `width` وحدها).
 * وما يُبنى بأيدينا هو ما لا يعطيه المحرّك: الأولوية، وترتيب الطبقات،
 * والمقارنة.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { beats, type Candidate, type LayerKey } from './layer-order'
import { candidatesFor, type CssIndex, type IndexedRule } from './selector-index'
import { specificity, type Specificity } from './specificity'

import type { SheetSource } from './sheets'

/** القاعدة الفائزة بخاصّية، وكل ما يُعرَض عنها. */
export interface WinningRule {
  /** المحدِّد كما كُتب في الورقة. */
  readonly selector: string
  /** المحدِّد بعد تفكيك التداخل — قد يختلف. */
  readonly effectiveSelector: string
  readonly source: SheetSource | null
  /** مسار الطبقة، أو `null` لخارجها. */
  readonly layer: string | null
  readonly spec: Specificity
  readonly important: boolean
  readonly inline: boolean
  /** القيمة كما صُرِّح بها — قد تكون `var(--x)` بخلاف المحسوبة. */
  readonly declared: string
}

/** مدخل جاهز للمقارنة: القاعدة وبياناتها المحسوبة مسبقًا. */
export interface ResolvedCandidate extends Candidate {
  readonly entry: IndexedRule | null
  readonly declared: string
  readonly selector: string
  readonly effectiveSelector: string
  readonly source: SheetSource | null
  readonly layerPath: string | null
}

/** ما يلزم لتقييم قاعدة: طبقتها ومصدرها وشرطها. */
export interface RuleContext {
  /** مفتاح الطبقة، أو `null` لخارجها. */
  readonly layer: (rule: CSSRule) => LayerKey
  readonly layerPath: (rule: CSSRule) => string | null
  readonly source: (rule: CSSRule) => SheetSource | null
  /**
   * هل شروط القاعدة (`@media`/`@supports`/`@container`/`@scope`) مطابقة الآن؟
   *
   * تُحقَن لأن تقييمها يلمس المتصفّح، و`modules/` لا يفترض بيئة.
   */
  readonly conditionsMatch: (rule: CSSRule, el: Element) => boolean
}

/**
 * النمط السطري للعنصر، أو `undefined` لعنصر لا يملكه.
 *
 * `SVGElement` و`MathMLElement` يملكانه، لكن `Element` المجرَّد لا يعلنه في
 * الأنواع — والفحص يجري على `Element` لأنه ما يعطيه اختبار الإصابة.
 */
function inlineStyleOf(el: Element): CSSStyleDeclaration | undefined {
  const style = (el as unknown as { style?: unknown }).style
  return style && typeof style === 'object' ? (style as CSSStyleDeclaration) : undefined
}

/**
 * هل يطابق المحدِّد العنصر؟
 *
 * `matches()` يرمي على محدِّد لا يفهمه (`::-webkit-scrollbar` مثلًا يُرجع
 * `false` بلا رمي، لكن غيره يرمي). والرمي يعني «لا نعرف» لا «يطابق».
 */
function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}

/**
 * يجمع مرشّحي خاصّية واحدة على عنصر.
 *
 * الترتيب: النمط السطري أوّلًا (له مرشّحه الخاص)، ثم قواعد الفهرس المطابقة
 * التي صرّحت بالخاصّية فعلًا.
 */
export function collectCandidates(
  el: Element,
  prop: string,
  index: CssIndex,
  ctx: RuleContext,
): ResolvedCandidate[] {
  const out: ResolvedCandidate[] = []

  // النمط السطري.
  const inlineStyle = inlineStyleOf(el)
  if (inlineStyle) {
    const declared = inlineStyle.getPropertyValue(prop)
    if (declared) {
      out.push({
        entry: null,
        declared,
        selector: 'style=""',
        effectiveSelector: 'style=""',
        source: null,
        layerPath: null,
        important: inlineStyle.getPropertyPriority(prop) === 'important',
        inline: true,
        layer: null,
        spec: [0, 0, 0],
        order: Number.MAX_SAFE_INTEGER,
      })
    }
  }

  for (const entry of candidatesFor(index, el)) {
    const declared = entry.rule.style?.getPropertyValue(prop)
    if (!declared) continue
    if (!safeMatches(el, entry.selector)) continue
    if (!ctx.conditionsMatch(entry.rule, el)) continue

    out.push({
      entry,
      declared,
      selector: entry.rule.selectorText ?? entry.selector,
      effectiveSelector: entry.selector,
      source: ctx.source(entry.rule),
      layerPath: ctx.layerPath(entry.rule),
      important: entry.rule.style.getPropertyPriority(prop) === 'important',
      inline: false,
      layer: ctx.layer(entry.rule),
      spec: specificity(entry.selector),
      order: entry.order,
    })
  }

  return out
}

const toWinning = (c: ResolvedCandidate): WinningRule => ({
  selector: c.selector,
  effectiveSelector: c.effectiveSelector,
  source: c.source,
  layer: c.layerPath,
  spec: c.spec,
  important: c.important,
  inline: c.inline,
  declared: c.declared,
})

/** القاعدة الفائزة بخاصّية، أو `null` حين لا قاعدة مؤلِّف صرّحت بها. */
export function resolveProperty(
  el: Element,
  prop: string,
  index: CssIndex,
  ctx: RuleContext,
): WinningRule | null {
  const list = collectCandidates(el, prop, index, ctx)
  let best: ResolvedCandidate | null = null
  for (const c of list) if (!best || beats(c, best)) best = c
  return best ? toWinning(best) : null
}

/**
 * يحلّ خصائص كثيرة بمرور واحد على المرشّحين.
 *
 * `resolveProperty` لكل خاصّية يعيد بناء قائمة المرشّحين ستّ وأربعين مرّة.
 * وهنا تُجمَع القواعد المطابقة مرّة، ثم تُسأل كل واحدة عن كل خاصّية —
 * فتُدفَع كلفة `matches()` والشروط مرّة لا مرّات.
 */
export function resolveAll(
  el: Element,
  props: readonly string[],
  index: CssIndex,
  ctx: RuleContext,
): Map<string, WinningRule | null> {
  const out = new Map<string, WinningRule | null>()
  const best = new Map<string, ResolvedCandidate>()

  const consider = (prop: string, c: ResolvedCandidate) => {
    const current = best.get(prop)
    if (!current || beats(c, current)) best.set(prop, c)
  }

  const inlineStyle = inlineStyleOf(el)

  for (const entry of candidatesFor(index, el)) {
    const style = entry.rule.style
    if (!style) continue
    if (!safeMatches(el, entry.selector)) continue
    if (!ctx.conditionsMatch(entry.rule, el)) continue

    const layer = ctx.layer(entry.rule)
    const layerPath = ctx.layerPath(entry.rule)
    const source = ctx.source(entry.rule)
    const spec = specificity(entry.selector)

    for (const prop of props) {
      const declared = style.getPropertyValue(prop)
      if (!declared) continue
      consider(prop, {
        entry,
        declared,
        selector: entry.rule.selectorText ?? entry.selector,
        effectiveSelector: entry.selector,
        source,
        layerPath,
        important: style.getPropertyPriority(prop) === 'important',
        inline: false,
        layer,
        spec,
        order: entry.order,
      })
    }
  }

  if (inlineStyle) {
    for (const prop of props) {
      const declared = inlineStyle.getPropertyValue(prop)
      if (!declared) continue
      consider(prop, {
        entry: null,
        declared,
        selector: 'style=""',
        effectiveSelector: 'style=""',
        source: null,
        layerPath: null,
        important: inlineStyle.getPropertyPriority(prop) === 'important',
        inline: true,
        layer: null,
        spec: [0, 0, 0],
        order: Number.MAX_SAFE_INTEGER,
      })
    }
  }

  for (const prop of props) {
    const c = best.get(prop)
    out.set(prop, c ? toWinning(c) : null)
  }
  return out
}
