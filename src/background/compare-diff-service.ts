/**
 * قياس الفرق الحيّ — بين مرجع المقاس المحفوظ والجزء الظاهر من الصفحة الآن.
 *
 * **سدادُ دَيْنٍ لا ميزةٌ جديدة.** استبعدت المرحلة 16 ثلاثة عناصر من طبقة
 * المقارنة وأسندتها إلى المرحلة 17 صراحةً في تعليقات ملفّاتها: قسم «فرق
 * البكسلات» وزرّ «التقط الفرق» في [`ComparePanel`](../ui/overlay/compare/ComparePanel.tsx)،
 * ونسبةُ كل بطاقة ورقاقةُ حالتها في [`ViewportGallery`](../ui/overlay/compare/ViewportGallery.tsx).
 * كان ينقصها محرّك `pixelmatch` وحده — وقد بُني في هذه المرحلة، فما بقي سلكٌ
 * لا خوارزمية.
 *
 * **ولماذا الحساب هنا لا في سكربت المحتوى** — نفس حكم
 * [ADR 0017](../../Docs/ADR/0017-palette-extraction-host.md) بحرفه: قِيس أن
 * `Worker` من أصل `chrome-extension://` **لا يُحمَّل** داخل مستند صفحة مضيفة
 * (`§6` صفّ 90)، فلا مهرب من التزامن هناك؛ و`computeDiff` متزامنة، فتنفيذها
 * في الصفحة يجمّد الصفحة نفسها التي تقيسها. والخلفية تملك الطرفين أصلًا —
 * المرجع في قاعدة الإضافة منذ إصلاح الصفّ 84، واللقطة من
 * `chrome.tabs.captureVisibleTab` التي لا تُنادى إلا منها.
 *
 * **ولا نسخة ثانية من الخوارزمية هنا.** يستدعي هذا الملفّ `computeDiff` و
 * `groupDiffRegions` **ذاتيهما** اللتين تستدعيهما صفحة المقارنة و
 * `diff.worker.ts` — «الدالّة نفسها لا مثيلها». وما يخصّ هذه الطبقة وحدها هو
 * الاختزال: نسبةٌ وعددُ مناطق بدل خريطة حرارية، لأن الطبقة تعرض رقمًا فوق
 * صفحة حيّة لا قماشًا فوق صورة.
 */

import { computeDiff, type RasterImage } from '@/modules/compare/diff'
import { groupDiffRegions } from '@/modules/compare/regions'
import { withinCanvasLimits } from '@/shared/canvas-limits'
import { errText, ok, type Result } from '@/shared/result'

import type { DeviceRect } from '@/shared/geometry'
import type { LiveDiff } from '@/shared/messaging/contract'

/**
 * يفكّ مصدرًا إلى بكسلات خام.
 *
 * الحارس **قبل** التخصيص لا بعده — نفس علّة `palette-service.ts` حرفيًّا:
 * تجاوز حدّ القماش لا يرمي في كروم، بل يُرجع `getImageData` أصفارًا، فيُقاس
 * فرقٌ على صورة سوداء ويبدو أنه نجح.
 */
async function decode(source: Blob | string): Promise<Result<RasterImage>> {
  let bitmap: ImageBitmap
  try {
    const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
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

/**
 * يقيس الفرق بين صورتين خامتين ويختزله إلى ما تعرضه الطبقة.
 *
 * **مفصولةٌ عن `measureLiveDiff` كي تبقى خالصة.** فكّ البايتات يحتاج
 * `OffscreenCanvas` و`createImageBitmap`، وكلاهما غائب عن بيئة الاختبار —
 * ولهذا بقي `palette-service.ts` بلا اختبار وحدة أصلًا. أمّا الاختزال نفسه
 * فمنطقٌ يمكن أن ينحرف (اتّجاه المقارنة · مقام النسبة · مصدر عدّ المناطق)،
 * فيُفصَل ليُختبَر بدل أن يُعلَن غير قابل للتغطية.
 *
 * **ترتيب الوسيطين مقصود**: المرجع أوّلًا والحيّ ثانيًا، فيقرأ `extraInB`
 * «ما زاد في الصفحة عن المرجع» — وهو الاتجاه الذي يفهمه من ينظر إلى صفحته
 * لا إلى صورته.
 *
 * **وعدّ المناطق من قناع التقاطع لا من مقاس أيّ من الصورتين**: `mask` تغطّي
 * `overlap` وحدها، فتمرير مقاس المرجع كان سيُنتج طول قناعٍ مخالفًا فترفضه
 * `groupDiffRegions` صامتةً وتُرجع صفرًا — «لا شيء تحرّك» فوق صفحةٍ تغيّرت.
 */
export function summariseDiff(
  reference: RasterImage,
  live: RasterImage,
  exclude: readonly DeviceRect[] = [],
): LiveDiff {
  const result = computeDiff(reference, live, { exclude })
  const regions = groupDiffRegions(result.mask, result.overlap.width, result.overlap.height)

  return {
    diffRatio: result.diffRatio,
    regionCount: regions.length,
    comparedPixels: result.comparedPixels,
    overlapWidth: result.overlap.width,
    overlapHeight: result.overlap.height,
    sizeMismatch: reference.width !== live.width || reference.height !== live.height,
    excludedPixels: result.excludedPixels,
    excludedZones: exclude.length,
  }
}

/**
 * يفكّ الطرفين ثم يختزلهما بـ`summariseDiff` — لا منطق قياس هنا.
 *
 * `exclude` مستطيلات مناطق المرجع ببكسل صورته (ADR 0034) — القناع نفسه الذي يطبّقه `computeDiff` في صفحة
 * المقارنة، لا نسخةٌ منه.
 */
export async function measureLiveDiff(
  referenceBlob: Blob,
  liveDataUrl: string,
  exclude: readonly DeviceRect[] = [],
): Promise<Result<LiveDiff>> {
  const reference = await decode(referenceBlob)
  if (!reference.ok) return reference
  const live = await decode(liveDataUrl)
  if (!live.ok) return live
  return ok(summariseDiff(reference.value, live.value, exclude))
}
