/**
 * كشف منصّة العرض — مطلوب حين يختلف الاختصار الفعلي المسجَّل بين macOS
 * وغيرها (`manifest.config.ts`، `Docs/Engineering.md §6` صفّ 99)، والصفحة تعرض
 * حرفًا ثابتًا لا تقرأه حيًّا من `chrome.commands.getAll()`.
 *
 * نفس نمط `pages/editor/page-meta.ts` (`BrowserSource`): واجهة ضيّقة تُحقَن
 * في الاختبار بدل تمرير `navigator` كاملة.
 */
export interface PlatformSource {
  readonly userAgentData?: { readonly platform?: string }
  readonly platform?: string
}

/** `true` على macOS، بما فيها بيئة اختبار بلا `navigator` حقيقية (تُعامَل غير-ماك). */
export function isMacPlatform(nav: PlatformSource = globalThis.navigator ?? {}): boolean {
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
  return /mac/i.test(platform)
}
