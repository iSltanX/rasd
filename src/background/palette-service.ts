/**
 * خدمة استخراج اللوحة — البكسلات تُفكّ هنا، والتجميع في `modules/colour/palette.ts`.
 *
 * **لماذا في الخلفية لا في worker ولا في الصفحة** — [ADR 0017](../../Docs/ADR/0017-palette-extraction-host.md):
 * قِيس أن `Worker` من أصل `chrome-extension://` **لا يُحمَّل** داخل مستند صفحة
 * مضيفة (`SecurityError` عبر الأصل، ولا يعالجه `web_accessible_resources`)،
 * فسقط مضيف `palette.worker.ts` للمسارات الحيّة. والـservice worker يملك
 * `OffscreenCanvas` و`createImageBitmap` (كما يستعملهما `image-ops.ts` اليوم)،
 * **ويملك بكسلات المصادر كلّها أصلًا** لأن خطّ الالتقاط يعمل فيه — وهو خيط
 * مستقلّ عن عرض أي صفحة، فعلّة الخطّة المكتوبة («لا يجمّد الصفحة») محقَّقة بلا
 * worker. ثالثةُ البندين 18 و31 في `§6`.
 *
 * **وفكّ البكسلات هنا ليس نسخةً من `pages/compare/raster.ts`.** ذاك محوّل
 * تشغيل في طبقة الصفحات، وهذا محوّل تشغيل في طبقة الخلفية، ولا يجوز لأحدهما
 * استيراد الآخر (حدود المعمار تمنع `background → pages`). والجزء الذي **يحمل
 * خطرًا حقيقيًّا** — حدّ القماش الذي تجاوزُه يُنتج صورة سوداء صامتة لا خطأً —
 * مشتركٌ فعلًا في [`shared/canvas-limits.ts`](../shared/canvas-limits.ts)
 * ويُستدعى من كليهما. فما تكرّر سطور تهيئة قماش، لا خوارزمية ذات ثابت يمكن
 * أن ينحرف فرعاه.
 */

import { formatColour } from '@/modules/colour/formats'
import { extractPalette, type PaletteOptions, type PixelSource } from '@/modules/colour/palette'
import { withinCanvasLimits } from '@/shared/canvas-limits'
import { errText, ok, type Result } from '@/shared/result'
import { blobs } from '@/shared/storage/repository'

import { cropCapture } from './image-ops'

import type { DeviceRect } from '@/shared/geometry'
import type { PaletteExtraction } from '@/shared/messaging/contract'

/**
 * يفكّ `Blob` إلى بكسلات خام.
 *
 * الحارس **قبل** التخصيص لا بعده: تجاوز حدّ القماش لا يرمي في كروم — يُرجع
 * `getImageData` أصفارًا، فتُستخرَج لوحةٌ من صورة سوداء ويبدو أنها نجحت.
 */
async function decodePixels(blob: Blob): Promise<Result<PixelSource>> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (thrown) {
    return errText('invalid-data', 'تعذّر فكّ بايتات الصورة.', String(thrown))
  }

  if (!withinCanvasLimits(bitmap.width, bitmap.height)) {
    bitmap.close()
    return errText(
      'invalid-data',
      `أبعاد الصورة ${String(bitmap.width)}×${String(bitmap.height)} تتجاوز حدّ القماش.`,
    )
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return errText('invalid-data', 'تعذّر إنشاء سياق ثنائي الأبعاد.')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return ok({ data, width, height })
}

/** يحوّل ناتج المحرّك الخالص إلى شكل يعبر السلك. */
function toExtraction(
  result: ReturnType<typeof extractPalette>,
  countedPixels: number,
): PaletteExtraction {
  return {
    swatches: result.entries.map((e) => ({
      hex: formatColour(e.colour).hex,
      share: e.share,
      count: e.count,
      neutral: e.neutral,
    })),
    countedPixels,
    droppedNeutrals: result.droppedNeutrals,
  }
}

/** يستخرج لوحة من لقطة محفوظة في المخزن (`§6.1`، المصدر الخامس). */
export async function extractFromCapture(
  captureId: string,
  options: Partial<PaletteOptions>,
): Promise<Result<PaletteExtraction>> {
  const stored = await blobs.get(captureId)
  if (!stored.ok) return stored
  const pixels = await decodePixels(stored.value.blob)
  if (!pixels.ok) return pixels
  const result = extractPalette(pixels.value, options)
  return ok(toExtraction(result, result.countedPixels))
}

/**
 * يستخرج لوحة من لقطة حيّة للجزء الظاهر، مقصوصةً اختياريًّا إلى مستطيل.
 *
 * **المستطيل يغطّي «منطقة» و«عنصر» معًا** من مصادر `§6.1` الخمسة: الصفحة
 * تعرف مستطيل العنصر المختار وتمرّره، فلا يحتاج المصدران مسارين.
 * و`rect === null` يعني الجزء الظاهر كاملًا.
 */
export async function extractFromViewport(
  dataUrl: string,
  rect: DeviceRect | null,
  options: Partial<PaletteOptions>,
): Promise<Result<PaletteExtraction>> {
  const cropped = await cropCapture(dataUrl, rect)
  if (!cropped.ok) return cropped
  const pixels = await decodePixels(cropped.value.blob)
  if (!pixels.ok) return pixels
  const result = extractPalette(pixels.value, options)
  return ok(toExtraction(result, result.countedPixels))
}
