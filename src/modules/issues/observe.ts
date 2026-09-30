/**
 * قراءة قيمة المشكلة من الصفحة الحيّة، وتحويل ما يُرى إلى إحدى النتائج الخمس (ADR 0030 §2 و0031 §2).
 *
 * **القارئ واحد للتسجيل وللفحص.** «الآن» في النموذج تُقرأ بـ`readValue` نفسها التي تقرأ القيمة عند إعادة
 * الفحص — ولو اختلف القارئان لصارت مشكلةٌ «مفتوحة» لحظة تسجيلها بلا أن يتغيّر شيء.
 *
 * والثقة من قارئ الأنماط نفسه (`reliability`): عنصرٌ بلا تخطيط يُرجع نسبًا خامًا، وحركةٌ جارية تتقدّم على
 * التصريح، وخلفيةٌ بصورة تجعل التباين تقريبًا. كلّها «تحتاج تحققًا» لا «مفتوحة».
 *
 * `modules/` منطق خالص: يقرأ DOM ولا يلمس `chrome.*`.
 */

import { resolveBackground } from '@/modules/colour/background'
import { contrastRatio } from '@/modules/colour/contrast'
import { readColour } from '@/modules/colour/formats'
import { readInspectStyles } from '@/modules/computed-style/read'
import { refind, type RefindVerdict } from '@/modules/dom-picker/identity'
import { elementBounds } from '@/modules/dom-picker/inspect'
import { fourWayGap } from '@/modules/measure/distance'

import { compareValue, type CompareContext } from './values'

import type {
  CheckKind,
  CheckOutcome,
  IssueRecord,
  RecheckReason,
  RecheckResult,
  SpacingProperty,
} from '@/shared/issue-schema'

export interface Reading {
  /** `null` حين لا قيمة تُقرأ أصلًا. */
  readonly value: string | null
  /** سبب عدم الثقة — `null` للقراءة الموثوقة. */
  readonly reason: RecheckReason | null
}

/** `16px` · `12.5px` — منزلتان على الأكثر، بلا أصفار ذيلية. */
export function formatPx(n: number): string {
  return `${Number(n.toFixed(2))}px`
}

/** `3.68` — المقارنة على الرقم، والعرض يضيف `: 1`. */
export function formatRatioValue(n: number): string {
  return n.toFixed(2)
}

const isLaidOut = (el: Element): boolean => el.getClientRects().length > 0

function readStyle(el: Element, property: string, win: Window): Reading {
  const styles = readInspectStyles(el, win, [property]).styles
  const read = styles[property]
  const value = read?.value.trim() ?? ''
  if (!value) return { value: null, reason: 'unreadable' }
  if (read?.reliability === 'unlaid') return { value, reason: 'unlaid' }
  if (read?.reliability === 'animating') return { value, reason: 'animating' }
  return { value, reason: null }
}

function readSpacing(a: Element, b: Element | null, property: string): Reading {
  if (!b) return { value: null, reason: 'unreadable' }
  if (!isLaidOut(a) || !isLaidOut(b)) return { value: null, reason: 'unlaid' }
  const ra = elementBounds(a)
  const rb = elementBounds(b)
  const gap = fourWayGap(ra, rb)
  const pick: Record<SpacingProperty, number> = {
    'gap-top': gap.top,
    'gap-right': gap.right,
    'gap-bottom': gap.bottom,
    'gap-left': gap.left,
    dx: Math.abs(ra.x - rb.x),
    dy: Math.abs(ra.y - rb.y),
  }
  const n = pick[property as SpacingProperty] as number | undefined
  return n === undefined
    ? { value: null, reason: 'unreadable' }
    : { value: formatPx(n), reason: null }
}

function readContrast(el: Element, win: Window): Reading {
  const text = readColour(win.getComputedStyle(el).color)
  if (!text) return { value: null, reason: 'unreadable' }
  const background = resolveBackground(el, win)
  const value = formatRatioValue(contrastRatio(text.rgb, background.colour.rgb))
  if (background.sawImage) return { value, reason: 'background-image' }
  if (!isLaidOut(el)) return { value, reason: 'unlaid' }
  return { value, reason: null }
}

/** يقرأ قيمة فحصٍ من عنصره (وقرينه في المسافة). */
export function readValue(
  kind: CheckKind,
  property: string,
  el: Element,
  pair: Element | null,
  win: Window = globalThis.window,
): Reading {
  if (kind === 'spacing') return readSpacing(el, pair, property)
  if (kind === 'contrast') return readContrast(el, win)
  return readStyle(el, property, win)
}

/** مقاما `rem` و`em` من الصفحة الحيّة — `font-size` قد يتغيّر بين فحصين. */
export function contextOf(el: Element, win: Window): CompareContext {
  const size = (node: Element): number => {
    const n = Number.parseFloat(win.getComputedStyle(node).fontSize)
    return Number.isFinite(n) && n > 0 ? n : 16
  }
  return { rootFontPx: size(el.ownerDocument.documentElement), fontPx: size(el) }
}

type Located =
  { readonly el: Element } | { readonly outcome: CheckOutcome; readonly reason: RecheckReason }

/** حكم إعادة العثور ⟵ عنصرٌ يُقرأ، أو نتيجةٌ بسببها. */
function locate(verdict: RefindVerdict): Located {
  switch (verdict.kind) {
    case 'found':
      return { el: verdict.el }
    case 'changed':
      return { outcome: 'changed', reason: 'fingerprint' }
    case 'multiple':
      return { outcome: 'changed', reason: 'multiple' }
    case 'unreachable':
      return { outcome: 'not-found', reason: 'closed-shadow' }
    case 'not-found':
      return { outcome: 'not-found', reason: verdict.reason }
  }
}

/**
 * يفحص مشكلة واحدة على الصفحة الآن.
 *
 * `skip` مضيف الطبقة: عنصرٌ في DOM الصفحة لا يُعدّ مطابقًا ثانيًا.
 */
export function observeIssue(
  issue: Pick<IssueRecord, 'id' | 'element' | 'pair' | 'check'>,
  doc: Document,
  skip: Element | null = null,
): RecheckResult {
  const win = doc.defaultView ?? globalThis.window
  const miss = (outcome: CheckOutcome, reason: RecheckReason): RecheckResult => ({
    id: issue.id,
    outcome,
    observed: null,
    reason,
  })

  const first = locate(refind(issue.element, doc, skip))
  if (!('el' in first)) return miss(first.outcome, first.reason)

  let pairEl: Element | null = null
  if (issue.check.kind === 'spacing') {
    if (!issue.pair) return miss('not-found', 'missing')
    const second = locate(refind(issue.pair, doc, skip))
    if (!('el' in second)) return miss(second.outcome, second.reason)
    pairEl = second.el
  }

  const reading = readValue(issue.check.kind, issue.check.property, first.el, pairEl, win)
  if (reading.value === null) return miss('unreliable', reading.reason ?? 'unreadable')
  if (reading.reason) {
    return { id: issue.id, outcome: 'unreliable', observed: reading.value, reason: reading.reason }
  }

  const verdict = compareValue(issue.check, reading.value, contextOf(first.el, win))
  if (verdict === 'invalid') {
    return { id: issue.id, outcome: 'unreliable', observed: reading.value, reason: 'unreadable' }
  }
  return { id: issue.id, outcome: verdict, observed: reading.value, reason: null }
}
