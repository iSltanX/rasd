/**
 * ترميز المصغَّرات — الجزء الذي يلمس القماش.
 *
 * `modules/library/thumbnail.ts` يحسب الأبعاد وينسِّق التخزين بمنطق خالص؛
 * هذا الملفّ وحده يفتح `OffscreenCanvas` ويرسم ويُرمِّز — يعيد نمط
 * `pages/editor/redact-raster.ts` بالمرحلة 15 حرفيًّا: سطحٌ حقيقي في
 * المتصفّح، و`null` بيئةً بلا سياق ثنائي الأبعاد (بيئة الاختبار) بدل رمي
 * استثناء يوقف تصفّح مكتبة بأكملها بسبب مصغَّرة واحدة فاسدة.
 */

import {
  fitDimensions,
  THUMBNAIL_MAX_DIM,
  type ThumbnailEncoder,
} from '@/modules/library/thumbnail'

async function encode(source: Blob): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null
  }

  const bitmap = await createImageBitmap(source).catch(() => null)
  if (!bitmap) return null

  const { width, height } = fitDimensions(bitmap.width, bitmap.height, THUMBNAIL_MAX_DIM)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return null
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // WebP: نفس صيغة خيارات التصدير في §9.2 — ضغط جيّد بلا ترخيص فك تشفير إضافي في Chrome.
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 }).catch(() => null)
  if (!blob) return null

  return { blob, width, height }
}

export const browserThumbnailEncoder: ThumbnailEncoder = { encode }
