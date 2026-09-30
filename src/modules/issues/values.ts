/**
 * تطبيع القيم ومقارنتها بالسماح — «المتوقَّعة» يكتبها إنسان، و«المرصودة» يقرؤها المتصفّح.
 *
 * **الصيغتان لا تتطابقان حرفيًّا وهما القيمة نفسها.** المستخدم يكتب `#3b82f6` و`1rem` و`12px 24px`،
 * و`getComputedStyle` يُرجع `rgb(59, 130, 246)` و`16px` و`12px 24px 12px 24px` بحسب الخاصية. فالمقارنة على
 * المعنى: اللون بفرق OKLab، والطول بالبكسل بعد حلّ `rem` و`em`، والقائمة المختصرة بتوسيعها على الجوانب
 * الأربعة. وما لا يُفهم يُقارَن نصًّا بعد طيّ المسافات وحالة الأحرف.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { deltaEReadings } from '@/modules/colour/distance'
import { readColour } from '@/modules/colour/formats'

import type { CheckKind } from '@/shared/issue-schema'

export type ValueVerdict = 'match' | 'mismatch' | 'invalid'

export interface CompareContext {
  /** `font-size` الجذر — مقام `rem`. */
  readonly rootFontPx: number
  /** `font-size` العنصر — مقام `em` و`line-height` بلا وحدة. */
  readonly fontPx: number
}

export const DEFAULT_CONTEXT: CompareContext = { rootFontPx: 16, fontPx: 16 }

/** فرقٌ دون هذا صفرٌ في الحساب العشري — `0.1 + 0.2` لا يُسقط مطابقة. */
const EPSILON = 1e-6

/** يقسم قيمة CSS على المسافات خارج الأقواس: `rgb(0 0 0) 1px` جزءان لا أربعة. */
export function splitTokens(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) out.push(current)
  return out
}

/** طولٌ واحد بالبكسل — `null` لما ليس طولًا. الصفر بلا وحدة طولٌ في CSS. */
export function lengthPx(token: string, ctx: CompareContext): number | null {
  const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em)?$/i.exec(token.trim())
  if (!m?.[1]) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const unit = m[2]?.toLowerCase()
  if (unit === 'px') return n
  if (unit === 'rem') return n * ctx.rootFontPx
  if (unit === 'em') return n * ctx.fontPx
  return n === 0 ? 0 : null
}

/** رقمٌ مجرّد (`1.6` · `400` · `0.5`) — `null` لما يحمل وحدة. */
function plainNumber(token: string): number | null {
  if (!/^-?\d*\.?\d+(?:e[+-]?\d+)?$/i.test(token.trim())) return null
  const n = Number(token)
  return Number.isFinite(n) ? n : null
}

/** توسيع الاختصار على الجوانب الأربعة بترتيب CSS: `a` · `a b` · `a b c` · `a b c d`. */
function expandBox(values: readonly number[]): number[] | null {
  const [a, b = a, c = a, d = b] = values
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null
  return values.length > 4 ? null : [a, b, c, d]
}

/** قائمة أطوال بالبكسل، أو `null` إن كان فيها ما ليس طولًا. */
function lengths(value: string, ctx: CompareContext): number[] | null {
  const tokens = splitTokens(value)
  if (tokens.length === 0) return null
  const out: number[] = []
  for (const token of tokens) {
    const px = lengthPx(token, ctx)
    if (px === null) return null
    out.push(px)
  }
  return out
}

function compareLengths(
  expected: readonly number[],
  observed: readonly number[],
  tolerance: number,
): ValueVerdict {
  let a: readonly number[] | null = expected
  let b: readonly number[] | null = observed
  if (a.length !== b.length) {
    a = expandBox(a)
    b = expandBox(b)
    if (!a || !b) return 'mismatch'
  }
  const bb = b
  return a.every((v, i) => Math.abs(v - (bb[i] ?? Number.NaN)) <= tolerance + EPSILON)
    ? 'match'
    : 'mismatch'
}

/** نصٌّ للمقارنة الحرفية: بلا علامات اقتباس، ومسافات مطويّة، وأحرف صغيرة. */
function normalizedText(value: string): string {
  return value
    .replace(/["']/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** نسبة تباين بصيغتها المكتوبة: `4.5` · `4.5:1` · `≥ 4.5 : 1`. */
export function ratioOf(value: string): number | null {
  const m = /(\d*\.?\d+)\s*(?::\s*1)?\s*$/.exec(value.replace('≥', '').trim())
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** فرق لونين بمقياس OKLab ×100 — الوحدة التي يكتبها المستخدم في السماح. */
function colourVerdict(expected: string, observed: string, tolerance: number): ValueVerdict | null {
  const a = readColour(expected.trim())
  const b = readColour(observed.trim())
  if (!a || !b) return null
  if (tolerance <= 0) {
    const same =
      a.rgb.r === b.rgb.r &&
      a.rgb.g === b.rgb.g &&
      a.rgb.b === b.rgb.b &&
      Math.abs(a.alpha - b.alpha) <= 0.005
    return same ? 'match' : 'mismatch'
  }
  if (Math.abs(a.alpha - b.alpha) > 0.005) return 'mismatch'
  return deltaEReadings(a, b) * 100 <= tolerance + EPSILON ? 'match' : 'mismatch'
}

/**
 * هل القيمة المتوقَّعة مفهومة لهذا النوع؟ — النموذج يمنع الحفظ بدونها.
 *
 * للتباين رقمٌ ≥ 1، وللّون لونٌ يقرؤه المتصفّح، وللمسافة طول. والنمط يقبل أي نصّ غير فارغ: `display` و
 * `font-family` قيم لا أطوال.
 */
export function isValidExpected(kind: CheckKind, expected: string, ctx = DEFAULT_CONTEXT): boolean {
  const value = expected.trim()
  if (!value) return false
  if (kind === 'contrast') return ratioOf(value) !== null
  if (kind === 'colour') return readColour(value) !== null
  if (kind === 'spacing') return lengths(value, ctx)?.length === 1
  return true
}

export interface ComparedCheck {
  readonly kind: CheckKind
  readonly property: string
  readonly expected: string
  readonly tolerance: number
}

/**
 * يقارن المرصودة بالمتوقَّعة.
 *
 * `invalid` لا `mismatch` حين لا تُفهم المتوقَّعة لنوعها: «مفتوحة» حكمٌ على الصفحة، والعيب هنا في
 * السجلّ — فيُقرأ «تحتاج تحققًا» لا اتّهامًا للصفحة.
 */
export function compareValue(
  check: ComparedCheck,
  observed: string,
  ctx: CompareContext = DEFAULT_CONTEXT,
): ValueVerdict {
  const tolerance = Math.max(0, check.tolerance)

  if (check.kind === 'contrast') {
    const min = ratioOf(check.expected)
    const got = ratioOf(observed)
    if (min === null || got === null) return 'invalid'
    return got + EPSILON >= min ? 'match' : 'mismatch'
  }

  const colour = colourVerdict(check.expected, observed, tolerance)
  if (colour) return colour
  if (check.kind === 'colour') return 'invalid'

  const expectedLengths = lengths(check.expected, ctx)
  const observedLengths = lengths(observed, ctx)
  if (expectedLengths && observedLengths) {
    return compareLengths(expectedLengths, observedLengths, tolerance)
  }
  if (check.kind === 'spacing') return 'invalid'

  // `line-height: 1.6` يُكتب بلا وحدة، والمتصفّح يُرجعه بكسلًا محلولًا على خطّ العنصر.
  const expectedNumber = plainNumber(check.expected)
  if (
    expectedNumber !== null &&
    observedLengths?.length === 1 &&
    check.property === 'line-height'
  ) {
    return compareLengths([expectedNumber * ctx.fontPx], observedLengths, tolerance)
  }
  const observedNumber = plainNumber(observed)
  if (expectedNumber !== null && observedNumber !== null) {
    return Math.abs(expectedNumber - observedNumber) <= tolerance + EPSILON ? 'match' : 'mismatch'
  }

  return normalizedText(check.expected) === normalizedText(observed) ? 'match' : 'mismatch'
}
