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

/** يسحب صلاحية اختيارية — المستخدم يملك التراجع كما يملك المنح. */
export async function revokePermission(
  permissions: readonly OptionalPermission[],
): Promise<PermissionOutcome> {
  try {
    const removed = await chrome.permissions.remove({ permissions: [...permissions] })
    return removed ? 'granted' : 'denied'
  } catch {
    return 'error'
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
