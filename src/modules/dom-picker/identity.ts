/**
 * هوية العنصر — محدِّدٌ وسلسلة مضيفين وبصمة، وإعادة العثور بحكمٍ مسمًّى (ADR 0031).
 *
 * **المحدِّد يجد عنصرًا، والبصمة تقول إن كان هو.** `.card:nth-of-type(2)` يطابق بعد إعادة ترتيب القائمة
 * بطاقةً أخرى، والفحص حينها يحكم على ما لم يُسجَّل عليه شيء. فيُقارَن الوسم وأسماء السمات الثابتة وبصمة
 * النصّ — ولا شيء غيرها: الموضع والمقاس والأصناف هي ما يتغيّر حين يُصلَح الخلل.
 *
 * **الجذر لا المستند.** المحدِّد لا يعبر حدّ الظلّ، فيُحفظ معه محدِّد كل مضيف من المستند نزولًا، ويُعاد
 * العثور درجةً درجة. والجذر المغلق لا طريق إليه من العالم المعزول، فيُعلَن `unreachable` لا «غير موجود».
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل. تعيد [34] استعمالها لمناطق العنصر.
 */

import { buildSelector } from './selector'

import type { ElementFingerprint, ElementIdentity } from '@/shared/issue-schema'

/**
 * سماتٌ تتبدّل مع التفاعل لا مع هوية العنصر — حضورها وغيابها ليس «عنصرًا آخر».
 *
 * زرٌّ صار `disabled` بعد إصلاح نموذجه هو الزرّ نفسه، وقائمةٌ `aria-expanded` تُفتح وتُغلق بين فحصين.
 */
const STATEFUL_ATTRS = new Set([
  'class',
  'style',
  'value',
  'checked',
  'selected',
  'disabled',
  'hidden',
  'open',
  'inert',
  'tabindex',
  'contenteditable',
  'draggable',
  'data-state',
  'data-active',
  'data-selected',
  'data-open',
  'data-focus',
  'data-hover',
  'aria-expanded',
  'aria-selected',
  'aria-pressed',
  'aria-checked',
  'aria-hidden',
  'aria-busy',
  'aria-current',
  'aria-disabled',
  'aria-invalid',
  'aria-activedescendant',
  'aria-live',
])

/** أسماء تولّدها الأطر بقيمة مجزّأة في الاسم نفسه — تتغيّر بكل بناء. */
const GENERATED_ATTR = /^(data-v-[a-f0-9]{6,}|_ng(content|host)-|data-reactid$|data-react-|jsx-\d)/

/** سمات المستمعين المضمَّنة (`onclick`) ليست من الهوية، ولا يجوز أن تعبر إلى البصمة. */
const isStableAttr = (name: string): boolean =>
  !STATEFUL_ATTRS.has(name) && !GENERATED_ATTR.test(name) && !name.startsWith('on')

/** أقصى محارف تُجزَّأ — نصّ حاوية كبيرة لا يستحقّ أن يُمرّ عليه كلّه في كل فحص. */
const MAX_HASHED_TEXT = 4096

/**
 * FNV-1a بـ32 بتًّا، ستّ عشريًّا بثماني خانات.
 *
 * للمقارنة لا للسرّية: 32 بتًّا لا تحمي نصًّا قصيرًا من التخمين، ولا تحتاج — لا شيء يغادر الجهاز، والقصد
 * ألّا يُخزَّن النصّ الخام (ADR 0031 §1).
 */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** نصّ العنصر بعد طيّ المسافات — ما يراه القارئ لا ما في الشيفرة من أسطر. */
function normalizedText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function fingerprintOf(el: Element): ElementFingerprint {
  const text = normalizedText(el)
  const attrs = Array.from(el.attributes, (a) => a.name.toLowerCase())
    .filter(isStableAttr)
    .sort()
  return {
    tag: el.tagName.toLowerCase(),
    attrs,
    textHash: fnv1a(text.slice(0, MAX_HASHED_TEXT)),
    textLength: text.length,
  }
}

/** ما يُعدّ «العنصر نفسه»: الوسم، ومجموعة أسماء السمات الثابتة، وبصمة النصّ — لا غير. */
export function sameFingerprint(a: ElementFingerprint, b: ElementFingerprint): boolean {
  return (
    a.tag === b.tag &&
    a.textHash === b.textHash &&
    a.attrs.length === b.attrs.length &&
    a.attrs.every((name, i) => name === b.attrs[i])
  )
}

/** محدِّد كل مضيف ظلّ من المستند إلى جذر العنصر. */
function hostChain(el: Element): string[] {
  const hosts: string[] = []
  let root = el.getRootNode()
  while (root instanceof ShadowRoot) {
    hosts.unshift(buildSelector(root.host).selector)
    root = root.host.getRootNode()
  }
  return hosts
}

/** هوية عنصرٍ الآن. المستطيل بإحداثيات المستند للعرض وحده. */
export function identify(el: Element, win: Window = globalThis.window): ElementIdentity {
  const built = buildSelector(el)
  const r = el.getBoundingClientRect()
  return {
    selector: built.selector,
    unique: built.unique,
    positional: built.positional,
    inShadow: built.inShadow,
    hosts: hostChain(el),
    fingerprint: fingerprintOf(el),
    rect: { x: r.left + win.scrollX, y: r.top + win.scrollY, width: r.width, height: r.height },
  }
}

export type RefindVerdict =
  | { readonly kind: 'found'; readonly el: Element }
  | { readonly kind: 'changed'; readonly el: Element }
  | { readonly kind: 'multiple'; readonly count: number }
  | {
      readonly kind: 'not-found'
      readonly reason: 'missing' | 'host-missing' | 'invalid-selector'
    }
  | { readonly kind: 'unreachable' }

type QueryRoot = Document | ShadowRoot

/** `querySelectorAll` لا يرمي عند محدِّدٍ صار غير صالح — يُرجع `null` بدل ذلك. */
function queryAll(root: QueryRoot, selector: string): Element[] | null {
  try {
    return Array.from(root.querySelectorAll(selector))
  } catch {
    return null
  }
}

/**
 * يعيد العثور على عنصرٍ بهويته.
 *
 * `skip` يُستبعد من المطابقات: مضيف طبقتنا نفسه عنصرٌ في DOM الصفحة، ولا يجوز أن يُعدّ مطابقًا ثانيًا.
 */
export function refind(
  identity: ElementIdentity,
  doc: Document,
  skip?: Element | null,
): RefindVerdict {
  let root: QueryRoot = doc
  for (const hostSelector of identity.hosts) {
    const hosts: Element[] = queryAll(root, hostSelector)?.filter((h) => h !== skip) ?? []
    const host: Element | undefined = hosts.length === 1 ? hosts[0] : undefined
    if (!host) return { kind: 'not-found', reason: 'host-missing' }
    if (!host.shadowRoot) return { kind: 'unreachable' }
    root = host.shadowRoot
  }

  const matches = queryAll(root, identity.selector)
  if (!matches) return { kind: 'not-found', reason: 'invalid-selector' }
  const own = matches.filter((m) => m !== skip)
  const el = own[0]
  if (!el) return { kind: 'not-found', reason: 'missing' }
  if (own.length > 1) return { kind: 'multiple', count: own.length }
  return sameFingerprint(fingerprintOf(el), identity.fingerprint)
    ? { kind: 'found', el }
    : { kind: 'changed', el }
}
