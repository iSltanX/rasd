/**
 * أداة الفحص — تمرير يستهدف، ونقر يثبّت، ولوحة تقرأ.
 *
 * **بلا درع كامل، وهذا قرار مقيس لا تبسيط.** أوضاع المرحلتين 8 و9 ترفع
 * `pointer-events: auto` على المضيف كي تصلها الأحداث؛ وتحت ذلك الدرع قِيس
 * أن `matches(':hover')` يساوي **false** وأن قواعد `:hover`/`:active`
 * معطَّلة. فمحرّك التتالي يُعلن قاعدة `.btn:hover` غير فائزة وهي التي تفوز
 * حين يمرّ المستخدم فعلًا — أي أن الفاحص **يكذب**.
 *
 * والبديل المقيس **درع جزئيّ**: المضيف يبقى `pointer-events: none` (كما هو
 * أصلًا)، واللوحة وحدها تعلن `auto` لنفسها — وهو نمط `.rasd-ov-place`
 * القائم منذ المرحلة 9. النتيجة: حقيقة التتالي كاملةً، **مع** بقاء نقرات
 * واجهتنا تصل إليها (وهو ما يخسره رفع الدرع كلّيًّا).
 *
 * وثلاثة حدود مقيسة تُعلَن:
 *   1. القراءة تقع عند **الإفلات** لا عند الضغط: `:active` تشتعل بنقرة
 *      التثبيت نفسها حتى مع `preventDefault`، وتنطفئ عند الإفلات.
 *   2. مستمعات الصفحة المسجَّلة في طور الالتقاط قبلنا تعمل؛ التنقّل يُمنع
 *      وأثرها الجانبي لا.
 *   3. تفاعلات الصفحة البصرية حيّة تحت المؤشِّر — وهي الحقيقة التي نقرؤها
 *      لا عيبٌ فيها.
 */

import { signal, type Signal } from '@preact/signals'

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
import { pageOffset, readInspectStyles, readState } from '@/modules/computed-style/read'
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
import { pickAt } from '@/modules/dom-picker/hit-test'
import { buildSelector, shortLabel } from '@/modules/dom-picker/selector'
import { traceVariable, type VarTrace } from '@/modules/var-trace/declaration'
import { INSPECT_PROPS, type InspectSnapshot } from '@/shared/inspect-schema'

import type { SyncReason } from '../sync'

/** ما تعرضه اللوحة عن العنصر المثبَّت. */
export interface InspectDetail {
  readonly snapshot: InspectSnapshot
  /** القاعدة الفائزة بكل خاصّية — `null` حين لا قاعدة مؤلِّف. */
  readonly rules: ReadonlyMap<string, WinningRule | null>
  /** تتبّع المتغيّر لكل خاصّية لونية تحمل واحدًا. */
  readonly vars: ReadonlyMap<string, VarTrace>
}

export interface InspectState {
  /** مستطيل الهدف تحت المؤشِّر — يُحدَّث كل إطار. */
  readonly rect: Signal<{ x: number; y: number; width: number; height: number } | null>
  /** اللقطة المثبَّتة — `null` يعني حالة الخمول. */
  readonly detail: Signal<InspectDetail | null>
}

export interface InspectOptions {
  doc?: Document
  /** يُبلَّغ عند تثبيت لقطة أو مسحها. */
  onReport?: (snapshot: InspectSnapshot | null) => void
  onInvalidate?: () => void
}

export interface InspectTool {
  readonly state: InspectState
  onPointerMove(event: PointerEvent): void
  /** التثبيت عند **الإفلات** لا عند الضغط — انظر رأس الملفّ. */
  onPointerUp(event: PointerEvent): void
  frame(reasons: ReadonlySet<SyncReason>): void
  /** يمسح التثبيت ويعود إلى الخمول. */
  clear(): void
  reset(): void
  dispose(): void
}

/** خصائص تُتتبَّع متغيّراتها — الألوان أوّلًا كما يفرض `Rasd_Ar.md §7.4`. */
const TRACED = ['color', 'background-color', 'border-block-start-color', 'outline-color']

export function createInspect(options: InspectOptions = {}): InspectTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? window

  const state: InspectState = {
    rect: signal<{ x: number; y: number; width: number; height: number } | null>(null),
    detail: signal<InspectDetail | null>(null),
  }

  // حالة ساخنة في متغيّرات عادية لا إشارات — تُكتب مرّة في إطار المزامنة.
  let target: Element | null = null
  let px = -1
  let py = -1
  let dirty = false

  let index: CssIndex | null = null
  let layers: LayerOrder | null = null
  let sources: WeakMap<CSSRule, SheetSource> | null = null
  let probe: ContainerProbe | null = null
  let blocked: { count: number; origins: string[] } = { count: 0, origins: [] }

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

  const onPointerMove = (event: PointerEvent): void => {
    if (state.detail.peek()) return // مثبَّت — لا يُعاد الاستهداف.
    if (event.clientX === px && event.clientY === py) return
    px = event.clientX
    py = event.clientY
    dirty = true
    options.onInvalidate?.()
  }

  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    if (state.detail.peek()) return
    const retarget = dirty || reasons.has('scroll') || reasons.has('resize')
    dirty = false
    if (retarget && px >= 0) {
      const hit = pickAt(doc, px, py, null)
      target = hit?.el ?? null
    }
    if (!target) {
      state.rect.value = null
      return
    }
    const r = target.getBoundingClientRect()
    state.rect.value = { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  /**
   * يبني اللقطة الكاملة — عند التثبيت وحده.
   *
   * كل ما هنا مكلف بمقياس الإطار: بناء الفهرس، وحلّ التتالي، وتتبّع
   * المتغيّرات. ولا يُدفَع إلا بأمر المستخدم.
   */
  const pin = (el: Element): void => {
    const built = buildSelector(el)
    const reading = readInspectStyles(el, win)
    const box = el.getBoundingClientRect()
    const page = pageOffset(el, win)
    const live = readState(el)

    const idx = ensureIndex()
    const context = ctx()
    const rules = resolveAll(el, INSPECT_PROPS, idx, context)

    const vars = new Map<string, VarTrace>()
    for (const prop of TRACED) {
      const rule = rules.get(prop)
      const name = rule ? firstVarName(rule.declared) : null
      if (name) {
        vars.set(prop, traceVariable(el, name, { win, index: idx, ctx: context, blocked }))
      }
    }

    const snapshot: InspectSnapshot = {
      at: Date.now(),
      tag: el.tagName.toLowerCase(),
      label: shortLabel(el),
      selector: built.selector,
      unique: built.unique,
      positional: built.positional,
      inShadow: built.inShadow,
      rect: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        pageX: page.pageX,
        pageY: page.pageY,
      },
      styles: reading.styles,
      limits: {
        closedShadowHost: false,
        opaqueFrame: false,
        unlaid: reading.unlaid,
        animating: reading.animating,
        unreadableSheets: blocked.count,
        unreadableOrigins: blocked.origins,
        indexComplete: idx.complete,
        // الدرع جزئيّ، فالحالات التفاعلية تُقرأ صحيحةً — والعلم يُرفع فقط
        // حين تكون كلّها كاذبة والمؤشِّر فوق العنصر (حالة لا تقع اليوم).
        interactiveStateUnknown: !live.hover && !live.focus && px < 0,
      },
    }

    state.detail.value = { snapshot, rules, vars }
    options.onReport?.(snapshot)
  }

  const onPointerUp = (): void => {
    if (state.detail.peek() || !target) return
    pin(target)
  }

  const clear = (): void => {
    state.detail.value = null
    options.onReport?.(null)
    dirty = true
    options.onInvalidate?.()
  }

  const reset = (): void => {
    target = null
    px = -1
    py = -1
    dirty = false
    state.rect.value = null
    if (state.detail.peek()) {
      state.detail.value = null
      options.onReport?.(null)
    }
  }

  const dispose = (): void => {
    reset()
    if (probe) {
      disposeContainerProbe(probe)
      probe = null
    }
    index = null
    layers = null
    sources = null
  }

  return { state, onPointerMove, onPointerUp, frame, clear, reset, dispose }
}

/** يمشي على شجرة القواعد ويجمع قواعد الأنماط مفكَّكةَ التداخل. */
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

/** يستخرج اسم أوّل متغيّر في قيمة مصرَّح بها. */
function firstVarName(declared: string): string | null {
  const m = /var\(\s*(--[\w-]+)/.exec(declared)
  return m ? m[1]! : null
}
