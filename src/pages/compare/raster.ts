/**
 * فكّ `Blob` إلى `RasterImage` — الجزء الذي يلمس القماش.
 *
 * نفس نمط `pages/library/thumbnail-encoder.ts` (المرحلة 18) حرفيًّا:
 * `OffscreenCanvas` + `createImageBitmap`، و`null` بيئةً بلا سياق ثنائي
 * الأبعاد (بيئة الاختبار) بدل رمي استثناء. **بلا تحجيم** خلافًا للمصغَّرة —
 * محرّك الفرق يقارن بكسل الجهاز نفسه (`modules/compare/diff.ts`: «لا فضاء
 * خامس للصورة»)، فتصغير المصدر هنا يزيّف المقارنة لا يسرّعها فحسب.
 *
 * حارسا `canvas-limits.ts` يُطبَّقان قبل التخصيص: لقطة صفحة كاملة قد تتجاوز
 * حدّ Chrome (المرحلة 15، `ADR 0011`)، وتجاوزه **لا يرمي** — يعطي صورة سوداء
 * صامتة لو لم يُفحص مسبقًا.
 */

import { withinCanvasLimits } from '@/shared/canvas-limits'

import type { RasterImage } from '@/modules/compare/diff'

/** `null` يعني: تعذّر الفكّ — بيئة غير مدعومة، مصدر فاسد، أو أبعاد تتجاوز حدّ القماش. */
export async function decodeRasterImage(blob: Blob): Promise<RasterImage | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null
  }

  const bitmap = await createImageBitmap(blob).catch(() => null)
  if (!bitmap) return null

  if (!withinCanvasLimits(bitmap.width, bitmap.height)) {
    bitmap.close()
    return null
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return null
  }

  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width, height }
}
