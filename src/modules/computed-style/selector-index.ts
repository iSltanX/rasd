/**
 * فهرس المحدِّدات — دلاء بالمفتاح، لتفادي مطابقة كل قاعدة بكل عنصر.
 *
 * صفحة حقيقية تحمل **34,536 قاعدة نمط** (github، مقيس)، ومطابقتها كلّها
 * بـ`matches()` لكل عنصر مستحيلة في ميزانية إطار. فتُفهرَس القاعدة بمفتاح
 * **مُركِّبها الأخير**: صنفه أو معرّفه أو وسمه — والعنصر يُسأل عن دلائه
 * وحدها.
 *
 * **والمفتاح الساذج يكذب.** قِيس على 400 عنصر × 5 مواقع أن الفهرس الخام
 * يخالف المسح الخطّي في 545 حالة مجموعًا، وأن الفهرس بالإصلاحات الأربعة
 * يخالفه في **صفر**:
 *
 *   1. **فكّ التهريب** قبل مقارنة المفاتيح — `.md\:flex` مفتاحه `md:flex`.
 *   2. **القطع عند `[`** — `.a[data-x]` مُركِّبه الأخير صنفه لا سمته.
 *   3. **`localName` لا `tagName`** — الأخير يرفع الحروف في HTML فلا يطابق
 *      محدِّدًا مكتوبًا بحروف صغيرة.
 *   4. **مسح التهريب كاملًا لا محرفًا** — `\32 ` تهريب سداسي عشري ينتهي
 *      بمسافة، وحارس المحرف الواحد يقرؤها فاصلًا فيقرأ `xl\:flex` اسمَ
 *      وسم. أثره المقيس: ستّ فروق من أربعمئة على tailwindcss.com، وصفر
 *      بعده.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل — ويجوز له
 * استعمال واجهات المتصفّح القياسية.
 */

import { scanEscape, splitTop } from './specificity'

/** الدلو الجامع لما لا مفتاح له — يُطابَق دائمًا. */
export const CATCH_ALL = '*'

/** يفكّ تهريب CSS إلى نصّه الحقيقي. */
export function unescapeIdent(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i]
      continue
    }
    const end = scanEscape(s, i)
    const body = s.slice(i + 1, end)
    const hex = /^([0-9a-fA-F]{1,6})[ \t\n]?$/.exec(body)
    out += hex ? String.fromCodePoint(Number.parseInt(hex[1]!, 16)) : body.trim() || body
    i = end - 1
  }
  return out
}

/**
 * آخر مُركِّب في محدِّد — أي الجزء الذي يصف العنصر المستهدَف نفسه.
 *
 * يُقتطَع عند آخر مُركِّب علاقة (` `، `>`، `+`، `~`) في المستوى الأعلى.
 * والأقواس والسلاسل والتهريب تُتخطّى فلا يُقسَم `:is(a b)` عند مسافته.
 */
function lastCompound(selector: string): string {
  let depth = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!

    if (c === '\\') {
      i = scanEscape(selector, i) - 1
      continue
    }
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    else if (
      depth === 0 &&
      (c === ' ' || c === '\t' || c === '\n' || c === '>' || c === '+' || c === '~')
    ) {
      start = i + 1
    }
  }

  return selector.slice(start)
}

/**
 * مفتاح الدلو لمحدِّد واحد.
 *
 * الأولوية: المعرّف ← أوّل صنف ← الوسم ← الجامع. والمعرّف أوّلًا لأنه
 * الأندر فالأكثر انتقاءً.
 */
export function bucketKey(selector: string): string {
  const compound = lastCompound(selector.trim())
  if (!compound) return CATCH_ALL

  let id: string | null = null
  let cls: string | null = null
  let tag: string | null = null

  for (let i = 0; i < compound.length; i++) {
    const c = compound[i]!

    if (c === '\\') {
      i = scanEscape(compound, i) - 1
      continue
    }

    // القطع عند السمة أو الصنف الزائف: ما بعدهما لا يحمل مفتاحًا.
    if (c === '[' || c === ':') break

    if (c === '#' || c === '.') {
      const end = readIdent(compound, i + 1)
      const name = unescapeIdent(compound.slice(i + 1, end))
      if (c === '#') id ??= `#${name}`
      else cls ??= `.${name}`
      i = end - 1
      continue
    }

    if (c === '*' || c === '&') continue

    if (tag === null && /[A-Za-z_-]/.test(c)) {
      const end = readIdent(compound, i)
      tag = unescapeIdent(compound.slice(i, end)).toLowerCase()
      i = end - 1
      continue
    }
  }

  return id ?? cls ?? tag ?? CATCH_ALL
}

function readIdent(s: string, i: number): number {
  while (i < s.length) {
    const c = s[i]!
    if (c === '\\') {
      i = scanEscape(s, i)
      continue
    }
    if (/[\w-]/.test(c) || c.charCodeAt(0) > 0x7f) {
      i += 1
      continue
    }
    break
  }
  return i
}

/**
 * الدلاء التي قد تحوي قاعدة تطابق هذا العنصر.
 *
 * `localName` لا `tagName`: الأخير يرفع الحروف في HTML (`DIV`) فلا يطابق
 * مفتاحًا مبنيًّا من محدِّد مكتوب بحروف صغيرة.
 */
export function bucketsFor(el: Element): string[] {
  const out: string[] = [CATCH_ALL, el.localName]
  if (el.id) out.push(`#${el.id}`)
  for (const c of el.classList) out.push(`.${c}`)
  return out
}

/** قاعدة نمط بعد تفكيك تداخلها، مع ترتيبها في المستند. */
export interface IndexedRule {
  readonly rule: CSSStyleRule
  /** المحدِّد الفعّال بعد استبدال `&` — قد يختلف عن `selectorText`. */
  readonly selector: string
  readonly order: number
}

export interface CssIndex {
  readonly byKey: ReadonlyMap<string, readonly IndexedRule[]>
  /** ما تعذّر إعطاؤه مفتاحًا — يُطابَق دائمًا. */
  readonly rest: readonly IndexedRule[]
  /** أوراق تعذّرت قراءتها — تُعلَن ولا تُخفى. */
  readonly gaps: readonly { readonly href: string; readonly origin: string }[]
  /** بصمة الأوراق لحظة البناء — يُقارَن بها للكشف عن التقادم. */
  readonly fingerprint: string
  /** هل اكتمل البناء أم قُطع؟ */
  readonly complete: boolean
}

export function emptyIndex(fingerprint = ''): CssIndex {
  return { byKey: new Map(), rest: [], gaps: [], fingerprint, complete: false }
}

/** يبني الفهرس من قواعد مُفكَّكة. */
export function indexRules(
  rules: readonly IndexedRule[],
  meta: { gaps?: CssIndex['gaps']; fingerprint?: string; complete?: boolean } = {},
): CssIndex {
  const byKey = new Map<string, IndexedRule[]>()
  const rest: IndexedRule[] = []

  for (const entry of rules) {
    const key = bucketKey(entry.selector)
    if (key === CATCH_ALL) {
      rest.push(entry)
      continue
    }
    const bucket = byKey.get(key)
    if (bucket) bucket.push(entry)
    else byKey.set(key, [entry])
  }

  return {
    byKey,
    rest,
    gaps: meta.gaps ?? [],
    fingerprint: meta.fingerprint ?? '',
    complete: meta.complete ?? true,
  }
}

/**
 * القواعد المرشَّحة لعنصر — قبل المطابقة الفعلية بـ`matches()`.
 *
 * مرتَّبة بترتيب المستند: التتالي يحتاجه فاصلًا أخيرًا، ودمج دلاء متعدّدة
 * يُفقده ما لم يُعَد الترتيب.
 */
export function candidatesFor(index: CssIndex, el: Element): IndexedRule[] {
  const out: IndexedRule[] = [...index.rest]
  for (const key of bucketsFor(el)) {
    const bucket = index.byKey.get(key)
    if (bucket) out.push(...bucket)
  }
  out.sort((a, b) => a.order - b.order)
  return out
}

/**
 * يفكّك محدِّدًا مفصولًا بفواصل إلى مدخلات فهرس.
 *
 * كل فرع يُفهرَس بمفتاحه: `.a, #b` يدخل دلوين لا دلوًا واحدًا، وإلا فُقد
 * أحدهما.
 */
export function entriesForSelector(
  rule: CSSStyleRule,
  selectors: readonly string[],
  order: number,
): IndexedRule[] {
  const out: IndexedRule[] = []
  for (const sel of selectors) {
    for (const branch of splitTop(sel, ',')) out.push({ rule, selector: branch, order })
  }
  return out
}
