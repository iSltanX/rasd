/**
 * حلّال التتالي — فهرس القواعد وسياقها، مشتركًا بين أدوات الطبقة.
 *
 * **كان يعيش داخل `tools/inspect.ts`، ونزل إلى هنا في المرحلة 13 بلا تغيير
 * سطر واحد من منطقه.** السبب أن المرحلة 13 تحتاجه بنصّ خطّتها: «ربط
 * المتغيّر: عند وجود متغيّر CSS للقيمة، يُعرض اسمه وموضع تعريفه **(من
 * المرحلة 11)**». والبديل — نسخُه في أداة اللون — يعني فهرسين لمستند واحد،
 * وبناء الفهرس **مقيس بـ99.5ms على github**: ثمنٌ يُدفَع مرّتين بلا مقابل،
 * ونسختان تتباعدان بأوّل إصلاح يصيب إحداهما.
 *
 * **الأداتان تتشاركان مثيلًا واحدًا** يُبنى في `content/index.ts`: ذاكرة
 * الفهرس مفتاحها بصمة الأوراق (`sheetsFingerprint`)، فمثيلٌ واحد يخدم
 * فحصًا ثم عيّنة لون بلا إعادة بناء ما لم تتغيّر الأوراق فعلًا.
 *
 * يسكن `content/` لا `modules/` لأنه يحمل **حالة وذاكرة وربطًا بمستند
 * حيّ** — و`modules/` منطق خالص بلا حالة. والقاعدة نفسها التي وضعت
 * `inspect-view.ts` هنا.
 */

import { resolveAll, type RuleContext, type WinningRule } from '@/modules/computed-style/cascade'
import {
  createContainerProbe,
  disposeContainerProbe,
  evaluateContainer,
  evaluateMedia,
  evaluateScope,
  evaluateSupports,
  type ContainerProbe,
} from '@/modules/computed-style/conditions'
import { LayerOrder } from '@/modules/computed-style/layer-order'
import { effectiveSelectors } from '@/modules/computed-style/nesting'
import {
  entriesForSelector,
  indexRules,
  type CssIndex,
  type IndexedRule,
} from '@/modules/computed-style/selector-index'
import {
  collectSheets,
  readRules,
  sheetApplies,
  sheetsFingerprint,
  type SheetSource,
} from '@/modules/computed-style/sheets'

/** أوراق تعذّرت قراءتها — تُبلَّغ حين لا تُعرَف القاعدة. */
export interface BlockedSheets {
  readonly count: number
  readonly origins: readonly string[]
}

export interface CssResolver {
  /** يبني الفهرس أو يعيد المحفوظ إن لم تتغيّر بصمة الأوراق. */
  ensureIndex(): CssIndex
  /** سياق التقييم — الطبقات والمصادر والشروط. */
  ctx(): RuleContext
  /** القاعدة الفائزة بكل خاصّية من القائمة. */
  resolve(el: Element, props: readonly string[]): ReadonlyMap<string, WinningRule | null>
  /** ما تعذّر قراءته — يُعلَن في اللوحة ولا يُخفى. */
  readonly blocked: BlockedSheets
  /** يحرّر مسبار الحاويات ويُسقط الفهرس. يُنادى من **مالكه** وحده. */
  dispose(): void
}

/** يستخرج اسم أوّل متغيّر في قيمة مصرَّح بها. */
export function firstVarName(declared: string): string | null {
  const m = /var\(\s*(--[\w-]+)/.exec(declared)
  return m ? m[1]! : null
}

export function createCssResolver(doc: Document, win: Window): CssResolver {
  let index: CssIndex | null = null
  let layers: LayerOrder | null = null
  let sources: WeakMap<CSSRule, SheetSource> | null = null
  let probe: ContainerProbe | null = null
  let blocked: BlockedSheets = { count: 0, origins: [] }

  /**
   * يبني فهرس القواعد لهذا المستند.
   *
   * **كسول ومرّة واحدة**: قِيس بناؤه بـ99.5ms على github، وهو ثمن لا يُدفَع
   * إلا حين يثبّت المستخدم عنصرًا فعلًا. والتمرير يعمل بلا فهرس تمامًا —
   * القيم المحسوبة والصندوق والمحدِّد كلّها متاحة بدونه.
   */
  const ensureIndex = (): CssIndex => {
    const fingerprint = sheetsFingerprint(doc)
    if (index && index.fingerprint === fingerprint) return index

    const order = new LayerOrder()
    const map = new WeakMap<CSSRule, SheetSource>()
    const entries: IndexedRule[] = []
    const gaps: { href: string; origin: string }[] = []
    let n = 0

    for (const entry of collectSheets(doc)) {
      if (!sheetApplies(entry, win)) continue
      const read = readRules(entry.sheet)
      if (read.state === 'blocked') {
        gaps.push({ href: entry.sheet.href ?? '', origin: read.origin })
        continue
      }
      walk(read.rules, entry.source, order, map, entries, () => n++)
    }

    blocked = {
      count: gaps.length,
      origins: [...new Set(gaps.map((g) => g.origin))].filter(Boolean),
    }
    layers = order
    sources = map
    index = indexRules(entries, { gaps, fingerprint, complete: true })
    return index
  }

  const ctx = (): RuleContext => ({
    layer: (rule) => layers?.key(layers.qualify(rule)) ?? null,
    layerPath: (rule) => layers?.qualify(rule) || null,
    source: (rule) => sources?.get(rule) ?? null,
    conditionsMatch: (rule, el) => conditionsMatch(rule, el),
  })

  /** يصعد على آباء القاعدة ويقيّم كل شرط. */
  const conditionsMatch = (rule: CSSRule, el: Element): boolean => {
    let node: CSSRule | null = rule
    let guard = 0

    while (node && guard++ < 64) {
      const parent: CSSRule | null = node.parentRule
      const verdict = evaluateOne(node, el)
      // «لم يُقيَّم» لا يُسقط القاعدة ولا يُثبتها — تُقبَل ويُعلَن الحدّ.
      if (verdict === false) return false
      node = parent
    }
    return true
  }

  const evaluateOne = (rule: CSSRule, el: Element): boolean | null => {
    const r = rule as CSSRule & {
      media?: MediaList
      conditionText?: string
      start?: string | null
      end?: string | null
      selectorText?: string
    }

    if (r.media && typeof r.conditionText === 'string' && !('start' in r)) {
      const v = evaluateMedia(rule as CSSMediaRule, el)
      return v.kind === 'matched' ? v.value : null
    }
    if (typeof r.conditionText === 'string' && !r.media && !('start' in r)) {
      // `@supports` و`@container` كلاهما يحمل `conditionText` بلا `media`.
      const isContainer = 'containerName' in r
      if (isContainer) {
        probe ??= createContainerProbe(doc)
        const v = evaluateContainer(rule as CSSContainerRule, el, probe)
        return v.kind === 'matched' ? v.value : null
      }
      const v = evaluateSupports(rule as CSSSupportsRule, el)
      return v.kind === 'matched' ? v.value : null
    }
    if ('start' in r) {
      const v = evaluateScope(
        { start: r.start ?? null, end: r.end ?? null },
        el,
        r.selectorText ?? '*',
      )
      return v.kind === 'matched' ? v.value : null
    }
    return true
  }

  return {
    ensureIndex,
    ctx,
    resolve: (el, props) => resolveAll(el, props, ensureIndex(), ctx()),
    get blocked() {
      return blocked
    },
    dispose() {
      if (probe) {
        disposeContainerProbe(probe)
        probe = null
      }
      index = null
      layers = null
      sources = null
    },
  }
}

function walk(
  rules: readonly CSSRule[],
  source: SheetSource,
  order: LayerOrder,
  map: WeakMap<CSSRule, SheetSource>,
  out: IndexedRule[],
  next: () => number,
): void {
  for (const rule of rules) {
    map.set(rule, source)
    order.qualify(rule)

    const style = rule as CSSStyleRule
    if (typeof style.selectorText === 'string' && style.style) {
      out.push(...entriesForSelector(style, effectiveSelectors(style), next()))
    }

    const nested = (rule as CSSGroupingRule).cssRules
    if (nested) walk(Array.from(nested), source, order, map, out, next)
  }
}
