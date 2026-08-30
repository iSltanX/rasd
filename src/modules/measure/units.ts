/**
 * تحويل px ↔ rem — بناءً على `font-size` الجذر الحيّ لا 16px مفترضة.
 *
 * المستخدم قد يضبط حجم الخط الافتراضي في المتصفّح، وبعض الصفحات تُغيّر
 * `font-size` على `:root` نفسها (تصميم مبنيّ على `rem` سُلَّميًّا). كلا
 * الحالتين يجعل الافتراض الثابت 16px مصدر خطأ صامت في كل قياس يُحوَّل.
 */

/** px إلى rem، بجذر مُمرَّر صراحةً. صفر أو قيمة غير منتهية للجذر يُرجعان صفرًا. */
export function pxToRem(px: number, rootFontSizePx: number): number {
  if (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0) return 0
  return px / rootFontSizePx
}

/** rem إلى px — العكس، للاتّساق ولو لم يُستهلَك بعد. */
export function remToPx(rem: number, rootFontSizePx: number): number {
  if (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0) return 0
  return rem * rootFontSizePx
}
