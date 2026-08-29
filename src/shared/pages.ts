/**
 * صفحات الإضافة وقت التشغيل.
 *
 * المسارات نفسها في `page-paths.ts` (بيانات خالصة) حتى تستوردها ملفات
 * الإعداد بلا أن تجرّ واجهات `chrome.*` إلى سياق Node.
 */

export * from './page-paths'

import { PAGE_PATHS, type PageName } from './page-paths'

/** العنوان المطلق لصفحة إضافة. */
export function pageUrl(name: PageName): string {
  return chrome.runtime.getURL(PAGE_PATHS[name])
}
