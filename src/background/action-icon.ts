/**
 * أيقونة الإضافة في شريط الأدوات بحالتيها — «خاملة» و«نشطة» (`Docs/Brand/`، مولَّدة بـ
 * `pnpm icons:brand`): الأداة المفتوحة في تبويب تُظهر النقطة النشطة على أيقونته وحده.
 *
 * التبديل يتبع تقرير الطبقة نفسها (`mode/report`) لا الأمر الذي فتحها: التقرير هو الحقيقة —
 * أداةٌ أُغلقت بـ`Esc`، أو صفحةٌ غادرها المستخدم (`pagehide`)، تُبلِّغ `idle` فتعود الأيقونة.
 */

import type { ActiveMode } from '@/shared/storage/session'

/** مقاسا شريط الأدوات — ما يطلبه `chrome.action` فعلًا (16 و32 لكثافتي الشاشة). */
export const IDLE_ICON = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
} as const

export const ACTIVE_ICON = {
  16: 'icons/icon-active-16.png',
  32: 'icons/icon-active-32.png',
} as const

export function iconPathFor(mode: ActiveMode): typeof IDLE_ICON | typeof ACTIVE_ICON {
  return mode === 'idle' ? IDLE_ICON : ACTIVE_ICON
}

/**
 * يضبط أيقونة التبويب. فشلُها لا يُفشل التقرير: تبويبٌ أُغلق بين التقرير والضبط، أو صفحةٌ لا
 * تقبل تعديل أيقونتها — والأيقونة زينة حالة لا مصدرها (المصدر جلسة `session`).
 */
export async function applyModeIcon(tabId: number, mode: ActiveMode): Promise<void> {
  try {
    await chrome.action.setIcon({ tabId, path: iconPathFor(mode) })
  } catch {
    // لا شيء — انظر أعلاه.
  }
}
