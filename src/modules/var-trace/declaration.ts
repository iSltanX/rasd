/**
 * أين عُرِّف هذا المتغيّر؟ — ثلث الميزة رقم 2 في قائمة التميّز.
 *
 * `Rasd_Ar.md §6.9` يفرض ثلاثة: **اسم المتغيّر، ومكان تعريفه، والقيمة
 * المحسوبة**. الأوّل والثالث يعطيهما `getComputedStyle` مجّانًا — وحتى فوق
 * الأوراق المحجوبة (مقيس). والثاني هو العمل الحقيقي.
 *
 * **والمكان يُبنى على الصعود لا على البحث.** المتغيّرات موروثة، فقيمة
 * `--brand` على زرّ قد تكون معرَّفة على `:root`. فيُصعَد في الشجرة
 * **المركَّبة** (تعبر حدّ الظلّ) حتى أوّل سلف تختلف قيمته عن قيمة أبيه —
 * وهو المعرِّف.
 *
 * **وحين لا يمكن الجزم يُقال ذلك.** «لا متغيّر» و«ثمّة متغيّر تعذّر تتبّعه»
 * حالتان مختلفتان، وخلطهما كذب. ولذلك `Provenance` وليس `Element | null`.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { resolveProperty, type RuleContext, type WinningRule } from '../computed-style/cascade'

import { composedParent, readVar, type VarValue } from './value-state'

import type { CssIndex } from '../computed-style/selector-index'

/** حلقة في سلسلة `--a: var(--b)`. */
export interface VarLink {
  readonly name: string
  readonly value: VarValue
  /** العنصر الذي عُرِّف عنده، أو `null` حين تعذّر تحديده. */
  readonly at: Element | null
  /** كم سلفًا صُعِد فوق العنصر الأصلي. */
  readonly hops: number
}

/** من أين جاء التعريف — أو لماذا لم يُعرَف. */
export type Provenance =
  /** عُرِّف عند عنصر، وربّما عُرفت قاعدته. */
  | {
      readonly kind: 'declared'
      readonly at: Element
      readonly hops: number
      readonly rule: WinningRule | null
    }
  /**
   * الأوراق التي قد تحمل التعريف محجوبة.
   *
   * الاسم والقيمة معروفان، والمكان لا. وهذه ليست حالة نادرة: قِيس على
   * stripe.com **ستّ أوراق، ستّ محجوبة، صفر قاعدة مقروءة**.
   */
  | {
      readonly kind: 'opaque'
      readonly unreadableSheets: number
      readonly origins: readonly string[]
    }
  /** صُعِد إلى الجذر ولم يتغيّر شيء — ولا سبب معروف. */
  | { readonly kind: 'unverified' }
  /** المتغيّر غير معرَّف أصلًا. */
  | { readonly kind: 'none' }

export interface VarTrace {
  readonly chain: readonly VarLink[]
  readonly provenance: Provenance
}

/** أقصى طول لسلسلة `--a → --b → --c` قبل الاستسلام. */
const MAX_CHAIN = 16

/** أقصى صعود في الشجرة بحثًا عن المعرِّف. */
const MAX_HOPS = 128

/**
 * يجد أقرب سلف عرّف المتغيّر فعلًا.
 *
 * المعيار: أوّل عنصر تختلف قيمة المتغيّر عنده عن قيمته عند أبيه. والصعود
 * يتوقّف عند تساوي القيم لا عند الجذر — فالجذر قد يكون المعرِّف أو لا.
 *
 * `null` حين صُعِد إلى القمّة والقيمة نفسها في كل مستوى: عندئذٍ إمّا أن
 * التعريف على الجذر نفسه، وإمّا أن القيمة موروثة من مكان لا نراه.
 */
export function findDeclaringElement(
  el: Element,
  name: string,
  win: Window = window,
): { at: Element; hops: number } | null {
  const own = readVar(el, name, win)
  if (own.state === 'undefined') return null

  let node: Element = el
  let hops = 0

  for (let i = 0; i < MAX_HOPS; i++) {
    const parent = composedParent(node)
    if (!parent) {
      // بلغنا الجذر ولم تتغيّر القيمة — فالجذر هو المعرِّف.
      return { at: node, hops }
    }

    const here = readVar(node, name, win)
    const above = readVar(parent, name, win)
    if (here.value !== above.value || here.state !== above.state) {
      return { at: node, hops }
    }

    node = parent
    hops += 1
  }

  return null
}

/** يستخرج اسم أوّل متغيّر مُشار إليه في قيمة مصرَّح بها. */
export function referencedVar(declared: string): string | null {
  const m = /var\(\s*(--[\w-]+)/.exec(declared)
  return m ? m[1]! : null
}

/**
 * يتتبّع متغيّرًا: سلسلته ومكان تعريفه.
 *
 * `index` و`ctx` اختياريان: بدونهما تُعرَف **مكان** التعريف (العنصر) ولا
 * تُعرَف **قاعدته**. وهذا بالضبط ما يقع فوق الأوراق المحجوبة — فالتدهور
 * مُعلَن في `Provenance` لا مخفيّ.
 */
export function traceVariable(
  el: Element,
  name: string,
  options: {
    win?: Window
    index?: CssIndex
    ctx?: RuleContext
    /** أوراق تعذّرت قراءتها — تُبلَّغ حين لا تُعرَف القاعدة. */
    blocked?: { readonly count: number; readonly origins: readonly string[] }
  } = {},
): VarTrace {
  const win = options.win ?? window
  const chain: VarLink[] = []
  const seen = new Set<string>()

  let current = name

  for (let i = 0; i < MAX_CHAIN; i++) {
    if (seen.has(current)) break
    seen.add(current)

    const value = readVar(el, current, win)
    const site = findDeclaringElement(el, current, win)
    chain.push({ name: current, value, at: site?.at ?? null, hops: site?.hops ?? 0 })

    if (value.state === 'undefined') break

    // السلسلة تُتتبَّع من **التصريح** لا من القيمة المحسوبة: الأخيرة حُلّت
    // بالفعل فلا تحمل `var()`.
    const rule =
      site && options.index && options.ctx
        ? resolveProperty(site.at, current, options.index, options.ctx)
        : null
    const next = rule ? referencedVar(rule.declared) : null
    if (!next) break
    current = next
  }

  const head = chain[0]
  if (!head || head.value.state === 'undefined') {
    return { chain, provenance: { kind: 'none' } }
  }

  const last = chain[chain.length - 1]!
  if (last.at && options.index && options.ctx) {
    const rule = resolveProperty(last.at, last.name, options.index, options.ctx)
    return {
      chain,
      provenance: { kind: 'declared', at: last.at, hops: last.hops, rule },
    }
  }

  if (options.blocked && options.blocked.count > 0) {
    return {
      chain,
      provenance: {
        kind: 'opaque',
        unreadableSheets: options.blocked.count,
        origins: options.blocked.origins,
      },
    }
  }

  if (last.at) {
    return { chain, provenance: { kind: 'declared', at: last.at, hops: last.hops, rule: null } }
  }

  return { chain, provenance: { kind: 'unverified' } }
}
