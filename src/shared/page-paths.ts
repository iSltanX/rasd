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
  /**
   * المرحلة 17 — `compare/index.html?a=<captureId>&b=<captureId>`. تُفتح عبر
   * `page/open` القائمة (`background/lifecycle.ts`) — لا رسالة جديدة، ولا
   * سلك في المكتبة عمدًا: الاعتماديات المُقرَّة تنصّ «لا تحتاج واجهة
   * المكتبة» (`Rasd_Plan.md §17`).
   */
  compare: 'src/pages/compare/index.html',
} as const

export type PageName = keyof typeof PAGE_PATHS
