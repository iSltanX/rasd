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

import { floorRatio } from '@/modules/colour/audit'
import { measureTextContrast } from '@/modules/colour/text-contrast'
import { readInspectStyles } from '@/modules/computed-style/read'
import { refind, type RefindVerdict } from '@/modules/dom-picker/identity'
import { elementBounds } from '@/modules/dom-picker/inspect'
import { fourWayGap } from '@/modules/measure/distance'

import { compareValue, DEFAULT_CONTEXT, type CompareContext } from './values'

import type {
  CheckKind,
  IssueObservation,
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

/**
 * `3.67` — المقارنة على الرقم، والعرض يضيف `: 1`.
 *
 * **يُقصّ ولا يُقرَّب** (ADR 0035): `4.496` كانت تُكتب `4.50` فتطابق حدّ 4.5 وهي تسقطه، فتُعلَن المشكلة
 * «محلولة» والنصّ دون الحدّ.
 */
export function formatRatioValue(n: number): string {
  return floorRatio(n)
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

/**
 * القارئ نفسه الذي يدقّق الصفحة (`measureTextContrast`، ADR 0035): لون النصّ بألفاه فوق الطبقات وشفافية
 * مجموعاتها. وما يعلنه «تعذّر الحساب» — صورة أو تدرّج أو عنصرٌ مرسوم تحته — سببه هنا `background-image`.
 */
function readContrast(el: Element, win: Window): Reading {
  const read = measureTextContrast(el, win)
  if (!read || read.unknown === 'unreadable') return { value: null, reason: 'unreadable' }
  const value = formatRatioValue(read.ratio)
  if (read.unknown) return { value, reason: 'background-image' }
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
  | { readonly el: Element }
  | { readonly outcome: 'not-found' | 'changed'; readonly reason: RecheckReason }

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
 * يقرأ مشكلة واحدة على الصفحة الآن — **بلا حكم على القيمة**: ما يحتاج DOM وحده.
 *
 * `skip` مضيف الطبقة: عنصرٌ في DOM الصفحة لا يُعدّ مطابقًا ثانيًا.
 */
export function readIssue(
  issue: Pick<IssueRecord, 'id' | 'element' | 'pair' | 'check'>,
  doc: Document,
  skip: Element | null = null,
): IssueObservation {
  const win = doc.defaultView ?? globalThis.window
  const miss = (
    outcome: NonNullable<IssueObservation['outcome']>,
    reason: RecheckReason,
    observed: string | null = null,
  ): IssueObservation => ({ id: issue.id, outcome, observed, reason, context: null })

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
  if (reading.reason) return miss('unreliable', reading.reason, reading.value)
  return {
    id: issue.id,
    outcome: null,
    observed: reading.value,
    reason: null,
    context: contextOf(first.el, win),
  }
}

/**
 * يحكم على قراءة: ما حسمته الصفحة يبقى، والقيمة المرصودة تُقارَن بالمتوقَّعة. **منطق خالص** يجري في الخلفية
 * على الفحص المخزَّن — فالمتوقَّعة لا تأتي من الصفحة، ولا تعلن صفحةٌ «مطابقة».
 */
export function judge(check: IssueRecord['check'], observation: IssueObservation): RecheckResult {
  const { id, observed } = observation
  if (observation.outcome) {
    return { id, outcome: observation.outcome, observed, reason: observation.reason }
  }
  if (observed === null) return { id, outcome: 'unreliable', observed, reason: 'unreadable' }
  const verdict = compareValue(check, observed, observation.context ?? DEFAULT_CONTEXT)
  return verdict === 'invalid'
    ? { id, outcome: 'unreliable', observed, reason: 'unreadable' }
    : { id, outcome: verdict, observed, reason: null }
}

/** القراءة والحكم معًا — للاختبار ولأي مستهلك يملك DOM والفحص في مكان واحد. */
export function observeIssue(
  issue: Pick<IssueRecord, 'id' | 'element' | 'pair' | 'check'>,
  doc: Document,
  skip: Element | null = null,
): RecheckResult {
  return judge(issue.check, readIssue(issue, doc, skip))
}
