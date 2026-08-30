/**
 * حلّ توكنات اللون إلى قيَم سداسية — الجسر الوحيد من التوكنز إلى Canvas.
 *
 * **موطنه طبقة الصفحة لا `modules/`**: قاعدة لنت تمنع `modules/` من استيراد
 * `tokens/`. وهذا صحيح لا قيد شكليّ — اللون في المشهد **قرار** (أي توكن
 * اختاره المستخدم)، وفي القماش **قيمة** (أي سداسي يُرسم). والفصل يُبقي
 * المشهد مستقلًّا عن السمة، فيُقرأ على أي جهاز بأي إعداد.
 *
 * **واللوحة مثبَّتة على الوضع الداكن عند الخبز.** `resolveColor` يعطي قيمتين
 * لكل توكن، فمشهدٌ حُرِّر داكنًا وأُعيد فتحه فاتحًا كان سيُصدَّر بألوان أخرى
 * — **والمتلقّي لا يملك سمة المؤلّف**. تثبيت اللوحة يجعل الملفّ المصدَّر
 * مستقرًّا مهما تغيّر إعداد من صنعه.
 */

import { resolveColor } from '@/tokens/tokens'

import type { Palette, RenderStyle } from '@/modules/editor/renderer'
import type { AnnotationColor } from '@/modules/editor/scene'

/** الوضع المثبَّت لكل ما يُخبَز في صورة — انظر ترويسة الملفّ. */
export const BAKE_PALETTE_MODE = 'dark' as const

export type PaletteMode = 'dark' | 'light'

const ANNOTATION_TOKENS: readonly AnnotationColor[] = [
  'tool/annotate/solid',
  'tool/capture/solid',
  'tool/inspect/solid',
  'tool/measure/solid',
  'tool/compare/solid',
  'status/danger/solid',
  'status/success/solid',
]

/** لوحة ألوان التعليق محلولةً. */
export function buildPalette(mode: PaletteMode = BAKE_PALETTE_MODE): Palette {
  const out = {} as Record<AnnotationColor, string>
  for (const token of ANNOTATION_TOKENS) {
    out[token] = resolveColor(token, mode)
  }
  return out
}

/**
 * أسلوب الرسم كاملًا.
 *
 * ألوان **الواجهة** (التحديد، المقابض، حدّ الحجب) تتبع سمة المستخدم لأنها
 * لا تُخبَز في الصورة؛ وألوان **التعليق** مثبَّتة لأنها تُخبَز.
 */
export function buildRenderStyle(uiMode: PaletteMode = 'dark'): RenderStyle {
  return {
    palette: buildPalette(BAKE_PALETTE_MODE),
    selectionHex: resolveColor('border/focus', uiMode),
    handleHex: resolveColor('surface/inverse', uiMode),
    redactOutlineHex: resolveColor('status/danger/fg', uiMode),
    textFamily: 'Cairo, system-ui, sans-serif',
    monoFamily: '"Geist Mono", ui-monospace, monospace',
  }
}
