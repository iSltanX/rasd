/**
 * تحويل ألوان التوكنز الدلالية إلى ثلاثيّات RGB لمحرّك الفرق.
 *
 * `modules/compare/diff.ts` رياضيات خالصة — لا تقرأ CSS ولا DOM، وتترك حلّ
 * `tool/diff/added`·`removed` لطبقة الواجهة صراحةً (تعليق `DiffOptions` هناك).
 * هذا الملفّ هو تلك الطبقة: `resolveDiffColors` منطق خالص قابل للاختبار
 * (يأخذ قارئ متغيّر مُحقَنًا)، و`readDiffColorsFromDocument` غلافه الحيّ.
 *
 * **الافتراضي أحمر موحَّد للاثنين مقصودٌ كحياد لا لواجهة حقيقية** (تعليق
 * `DEFAULT_DIFF_OPTIONS`) — فحين يتعذّر تحليل قيمة توكن (بيئة بلا `CSSOM` أو
 * قيمة غير سداسية غير متوقَّعة) نسقط إلى تلك الثنائية المحايدة بدل رمي
 * استثناء يوقف الصفحة كلّها بسبب لون واحد.
 */

import { DEFAULT_DIFF_OPTIONS } from '@/modules/compare/diff'

export type RgbTuple = readonly [number, number, number]

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** يحوِّل `#rgb`·`#rrggbb`·`#rrggbbaa` إلى ثلاثيّة RGB — يتجاهل ألفا إن وُجدت. */
export function hexToRgb(hex: string): RgbTuple | null {
  const trimmed = hex.trim()
  const match = HEX_RE.exec(trimmed)
  if (!match) return null
  const digits = match[1] as string

  if (digits.length === 3) {
    const r = digits[0] as string
    const g = digits[1] as string
    const b = digits[2] as string
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)]
  }
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ]
}

export interface DiffColors {
  readonly added: RgbTuple
  readonly removed: RgbTuple
}

/**
 * يحلّ لوني الإضافة والإزالة عبر قارئ متغيّر مُحقَن — قابل للاختبار بلا DOM
 * حقيقي، نفس نمط `ThumbnailEncoder` (المرحلة 18) حَقنًا لا استيرادًا لِمَ
 * يلمس بيئة حيّة.
 */
export function resolveDiffColors(getVar: (name: string) => string): DiffColors {
  const added = hexToRgb(getVar('--rasd-tool-diff-added')) ?? DEFAULT_DIFF_OPTIONS.addedColor
  const removed = hexToRgb(getVar('--rasd-tool-diff-removed')) ?? DEFAULT_DIFF_OPTIONS.removedColor
  return { added, removed }
}

/** الغلاف الحيّ — يقرأ التوكنز المحسوبة فعليًّا من جذر المستند. */
export function readDiffColorsFromDocument(
  root: HTMLElement = document.documentElement,
): DiffColors {
  const computed = getComputedStyle(root)
  return resolveDiffColors((name) => computed.getPropertyValue(name))
}
