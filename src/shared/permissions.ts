/**
 * دوال الصلاحيات وقت التشغيل.
 *
 * القوائم نفسها في `permission-policy.ts` (بيانات خالصة) حتى يستوردها
 * `manifest.config.ts` بلا أن يجرّ واجهات `chrome.*` إلى سياق Node.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

export * from './permission-policy'

import type { OptionalPermission } from './permission-policy'

/** نتيجة طلب صلاحية — لا استثناءات، ولا تعليق. */
export type PermissionOutcome = 'granted' | 'denied' | 'error'

/**
 * يطلب صلاحية مضيف من إيماءة المستخدم.
 *
 * `chrome.permissions.request` يرجع `false` عند الرفض **وعند الإلغاء** معًا،
 * وقد يرمي إذا استُدعي خارج إيماءة. الثلاثة تُغلَّف هنا في نتيجة واحدة.
 */
export async function requestHostPermission(
  origins: readonly string[],
): Promise<PermissionOutcome> {
  try {
    const granted = await chrome.permissions.request({ origins: [...origins] })
    return granted ? 'granted' : 'denied'
  } catch {
    return 'error'
  }
}

/** يطلب صلاحية اختيارية من إيماءة المستخدم. */
export async function requestPermission(
  permissions: readonly OptionalPermission[],
): Promise<PermissionOutcome> {
  try {
    const granted = await chrome.permissions.request({ permissions: [...permissions] })
    return granted ? 'granted' : 'denied'
  } catch {
    return 'error'
  }
}

/** هل الصلاحية ممنوحة الآن؟ */
export async function hasPermission(permissions: readonly OptionalPermission[]): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ permissions: [...permissions] })
  } catch {
    return false
  }
}

/** هل صلاحية المضيف ممنوحة لهذا الأصل؟ */
export async function hasHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [origin] })
  } catch {
    return false
  }
}

/**
 * نتيجة سحب — **اتّحادٌ منفصل عن `PermissionOutcome` عمدًا، بعد فخٍّ حقيقي.**
 *
 * كانت `revokePermission` تُرجع `PermissionOutcome` نفسه فتقول `'granted'`
 * عند **نجاح السحب** — بمعنى «نجحت العملية» لا «الصلاحية ممنوحة». والمعنيان
 * لا يفترقان في النصّ، وأوّل مستهلك واجهة (زرّ السحب في شاشة الصلاحيات،
 * الوحدة 20.3) كان سيعرض «ممنوحة» بعد سحبٍ ناجح. والاختبار القائم كان
 * يثبّت السلوك المضلِّل لا يكشفه. (‏`Docs/Engineering.md §6` صفّ 124.)
 *
 * والحلّ اتّحادٌ لا يُقرأ إلّا على وجه واحد.
 */
export type RevokeOutcome = 'revoked' | 'kept' | 'error'

/** يسحب صلاحية اختيارية — المستخدم يملك التراجع كما يملك المنح. */
export async function revokePermission(
  permissions: readonly OptionalPermission[],
): Promise<RevokeOutcome> {
  try {
    const removed = await chrome.permissions.remove({ permissions: [...permissions] })
    return removed ? 'revoked' : 'kept'
  } catch {
    return 'error'
  }
}

/** يسحب صلاحية مضيف — نظير `requestHostPermission`، ولم يكن له مقابل. */
export async function revokeHostPermission(origins: readonly string[]): Promise<RevokeOutcome> {
  try {
    const removed = await chrome.permissions.remove({ origins: [...origins] })
    return removed ? 'revoked' : 'kept'
  } catch {
    return 'error'
  }
}

/**
 * يشترك في تغيّر الصلاحيات من **خارج** الإضافة — يُستدعى فورًا وعند كل تغيّر.
 *
 * بلا هذا، تعرض شاشة الصلاحيات حالةً قديمة لحظةَ يسحب المستخدم إذنًا من
 * `chrome://extensions` وهي مفتوحة: لوحةُ صدقٍ تكذب بعد أوّل تغيير خارجي.
 * ولا استطلاع دوري — الحدثان يغطّيان كل طريق يتغيّر به الإذن.
 */
export function watchPermissions(listener: () => void): () => void {
  const handler = () => listener()
  chrome.permissions.onAdded.addListener(handler)
  chrome.permissions.onRemoved.addListener(handler)
  listener()
  return () => {
    chrome.permissions.onAdded.removeListener(handler)
    chrome.permissions.onRemoved.removeListener(handler)
  }
}

/**
 * الأصول الممنوحة فعلًا — أوّل استعمال لـ`chrome.permissions.getAll` في `src/`.
 *
 * **ولماذا لزمت.** `hasHostPermission('<all_urls>')` تسأل سؤالًا واحدًا:
 * «أمنوحٌ كلُّ شيء؟». ومستخدمٌ منح `https://bank.com/*` وحده من النافذة
 * (وهو المسار الوحيد الذي يطلب صلاحية مضيف في المنتج) تُجيب عنه بـ`false` —
 * فتعرض شاشة الصلاحيات «غير ممنوحة» وله إذنٌ قائم. رصدته مراجعة Gate B.
 */
export async function grantedOrigins(): Promise<string[]> {
  try {
    return (await chrome.permissions.getAll()).origins ?? []
  } catch {
    return []
  }
}

/** يحوّل عنوانًا إلى نمط أصل صالح لطلب صلاحية مضيف. */
export function originPatternFor(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return `${protocol}//${hostname}/*`
  } catch {
    return null
  }
}
