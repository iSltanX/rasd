/**
 * أولوية المحدِّد (specificity) — ومسح تهريب CSS.
 *
 * **القواعد مقيسة سلوكيًّا لا منقولة عن المواصفة.** أربع منها تُخالف الحدس:
 *
 *   - `:where(…)` تساوي **صفرًا** مهما حوت: قيس أن `:where(.W, #t)` خسر أمام
 *     `.W` المجرّدة.
 *   - `:is(…)` و`:not(…)` و`:has(…)` تأخذ **أعلى** وسائطها: `:is(.W, #idX)`
 *     غلب بـ(1,0,0).
 *   - `:nth-child(n of S)` تحسب `S` — لا تُهمَل.
 *   - `&` في التداخل تحمل دلالة `:is()`: قيس أن `#c { .txt {} }` غلب
 *     `.txt` خمس مرّات مكرَّرة.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/** `[a, b, c]` — معرّفات · أصناف وسمات وأصناف زائفة · وسوم وعناصر زائفة. */
export type Specificity = readonly [a: number, b: number, c: number]

export const ZERO_SPECIFICITY: Specificity = [0, 0, 0]

/**
 * تهريب CSS واحد كامل.
 *
 * **الشكل السداسي العشري ينتهي بمسافة اختيارية**، وهي جزء من التهريب لا
 * فاصل بعده: `\32 xl\:flex` هو الصنف `2xl:flex`. وحارسٌ يتخطّى محرفًا
 * واحدًا بعد `\` يقرأ تلك المسافة مُركِّبًا جديدًا، فيقرأ `xl\:flex` اسمَ
 * وسم. قيس أثره: **ستّة فروق من أربعمئة عنصر** على tailwindcss.com، وصفر
 * بعد الإصلاح.
 */
export const CSS_ESCAPE = /^\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|([\s\S]))/

/** يُرجع فهرس ما بعد التهريب الذي يبدأ عند `i` (حيث `s[i] === '\\'`). */
export function scanEscape(s: string, i: number): number {
  const m = CSS_ESCAPE.exec(s.slice(i))
  return m ? i + m[0].length : i + 2
}

/**
 * يقسم نصًّا على فاصل **في المستوى الأعلى** وحده.
 *
 * يتخطّى الأقواس بأنواعها والسلاسل النصّية والتهريب — فلا يُقسَم
 * `:is(a, b)` عند فاصلتها الداخلية.
 */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') {
      i = scanEscape(text, i) - 1
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
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

const add = (x: Specificity, y: Specificity): Specificity => [x[0] + y[0], x[1] + y[1], x[2] + y[2]]

const higher = (x: Specificity, y: Specificity): Specificity =>
  compareSpecificity(x, y) >= 0 ? x : y

/** موجب حين `x` أقوى. */
export function compareSpecificity(x: Specificity, y: Specificity): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** أصناف زائفة تأخذ أعلى وسائطها بدل أن تُحسب بنفسها. */
const TAKES_MAX = new Set(['is', 'matches', '-webkit-any', '-moz-any', 'not', 'has'])

/** أصناف زائفة لا تُحسب إطلاقًا. */
const TAKES_ZERO = new Set(['where'])

/**
 * عناصر زائفة تُكتب بنقطتين أو بنقطة واحدة (إرث CSS2).
 *
 * تُحسب في الخانة `c` كالوسوم، بينما الأصناف الزائفة تُحسب في `b` — والخلط
 * بينهما بنقطة واحدة هو بالضبط ما يجعل التمييز لازمًا.
 */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])

/**
 * يحسب أولوية محدِّد **مفرد** (بلا فواصل عليا).
 *
 * القائمة المفصولة بفواصل تُحسب بأعلى أعضائها — وهو ما تفعله
 * `specificity()` أدناه.
 */
function specificityOfCompoundList(selector: string): Specificity {
  let out: Specificity = ZERO_SPECIFICITY
  const s = selector

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!

    if (c === '\\') {
      i = scanEscape(s, i) - 1
      continue
    }

    // سلسلة نصّية داخل `[attr="…"]` — تُتخطّى كاملةً.
    if (c === '"' || c === "'") {
      i += 1
      while (i < s.length && s[i] !== c) {
        if (s[i] === '\\') i = scanEscape(s, i)
        else i += 1
      }
      continue
    }

    if (c === '#') {
      out = add(out, [1, 0, 0])
      i = skipIdent(s, i + 1) - 1
      continue
    }

    if (c === '.') {
      out = add(out, [0, 1, 0])
      i = skipIdent(s, i + 1) - 1
      continue
    }

    if (c === '[') {
      out = add(out, [0, 1, 0])
      i = skipBalanced(s, i, '[', ']') - 1
      continue
    }

    if (c === ':') {
      // عنصر زائف بنقطتين — لا يُحسب في `b`.
      if (s[i + 1] === ':') {
        out = add(out, [0, 0, 1])
        i = skipPseudoTail(s, i + 2) - 1
        continue
      }

      const nameEnd = skipIdent(s, i + 1)
      const name = s.slice(i + 1, nameEnd).toLowerCase()
      const hasArgs = s[nameEnd] === '('
      const argsEnd = hasArgs ? skipBalanced(s, nameEnd, '(', ')') : nameEnd
      const args = hasArgs ? s.slice(nameEnd + 1, argsEnd - 1) : ''

      if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
        out = add(out, [0, 0, 1])
      } else if (TAKES_ZERO.has(name)) {
        // لا شيء — وهذا هو بيت القصيد في `:where()`.
      } else if (TAKES_MAX.has(name)) {
        out = add(out, maxOfList(args))
      } else if (name === 'nth-child' || name === 'nth-last-child') {
        // `:nth-child(2n of .S)` — الجزء بعد `of` يُحسب.
        out = add(out, [0, 1, 0])
        const of = splitOf(args)
        if (of) out = add(out, maxOfList(of))
      } else {
        out = add(out, [0, 1, 0])
      }

      i = argsEnd - 1
      continue
    }

    /*
     * `&` تحمل دلالة `:is()` على محدِّدات الأب.
     *
     * لا نعرف الأب هنا — `effectiveSelectors` في `nesting.ts` يستبدلها قبل
     * الوصول إلينا. فوجودها هنا يعني محدِّدًا غير مُفكَّك، ويُحسب صفرًا
     * بدل أن يُحسب وسمًا خطأً.
     */
    if (c === '&') continue

    if (c === '*' || c === '>' || c === '+' || c === '~' || c === ' ' || c === '\t' || c === '\n') {
      continue
    }

    // اسم وسم.
    if (/[A-Za-z_-]/.test(c)) {
      out = add(out, [0, 0, 1])
      i = skipIdent(s, i) - 1
      continue
    }
  }

  return out
}

function maxOfList(args: string): Specificity {
  let best: Specificity = ZERO_SPECIFICITY
  for (const part of splitTop(args, ',')) best = higher(best, specificityOfCompoundList(part))
  return best
}

/** يستخرج ما بعد `of` في `:nth-child(… of S)`. */
function splitOf(args: string): string | null {
  const m = /\bof\b/.exec(args)
  return m ? args.slice(m.index + 2).trim() : null
}

function skipIdent(s: string, i: number): number {
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

/** يتخطّى كتلة متوازنة تبدأ عند `i` وتُرجع الفهرس بعد الإغلاق. */
function skipBalanced(s: string, i: number, open: string, close: string): number {
  let depth = 0
  for (; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\') {
      i = scanEscape(s, i) - 1
      continue
    }
    if (c === '"' || c === "'") {
      const q = c
      i += 1
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i = scanEscape(s, i)
        else i += 1
      }
      continue
    }
    if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return s.length
}

/** يتخطّى اسم عنصر زائف ووسائطه إن وُجدت. */
function skipPseudoTail(s: string, i: number): number {
  const end = skipIdent(s, i)
  return s[end] === '(' ? skipBalanced(s, end, '(', ')') : end
}

/**
 * ذاكرة النتائج.
 *
 * المحدِّد نفسه يتكرّر آلاف المرّات في صفحة واحدة (34,536 قاعدة نمط قِيست
 * على github)، والحساب نصّي خالص فنتيجته ثابتة.
 */
const cache = new Map<string, Specificity>()

/** أولوية محدِّد كامل — أعلى أعضاء قائمته المفصولة بفواصل. */
export function specificity(selector: string): Specificity {
  const hit = cache.get(selector)
  if (hit) return hit

  let best: Specificity = ZERO_SPECIFICITY
  for (const part of splitTop(selector, ',')) {
    best = higher(best, specificityOfCompoundList(part))
  }

  cache.set(selector, best)
  return best
}

/** للاختبار: يُفرّغ الذاكرة. */
export function clearSpecificityCache(): void {
  cache.clear()
}
