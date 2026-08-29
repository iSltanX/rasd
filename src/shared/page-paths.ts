/**
 * مسارات صفحات الإضافة بعد البناء — بيانات خالصة بلا `chrome.*`.
 *
 * مصدر واحد يستورده: `manifest.config.ts` و`vite.config.ts` (مدخلات البناء)
 * و`src/shared/pages.ts` (وقت التشغيل) و`scripts/verify-dist.mjs` (الفحص).
 */

export const PAGE_PATHS = {
  popup: 'src/pages/popup/index.html',
  editor: 'src/pages/editor/index.html',
  library: 'src/pages/library/index.html',
  settings: 'src/pages/settings/index.html',
  onboarding: 'src/pages/onboarding/index.html',
  offscreen: 'src/offscreen/index.html',
} as const

export type PageName = keyof typeof PAGE_PATHS
