/**
 * صورة البلاغ على الصفحة — فكّ الملفّ، والتصغير إلى سقف العقد، والخبز من البوّابة الواحدة.
 *
 * **الصورة من اختيار المستخدم وحده:** ملفٌّ يختاره أو صورةٌ يلصقها. لا التقاط من رصد هنا — عقد القناة المشتركة
 * يمنعه («الصور من منتقي الملفّات أو اللصق، لا من التقاطٍ يجريه التطبيق»)، فلا لقطة بلا إيماءة صريحة أصلًا.
 *
 * والفكّ بـ`createImageBitmap` ثمّ الخبز بـ`bakeReportImage` (القماش يُسلَّم، والترميز في `editor/bake.ts` وحدها).
 * فالأصل لا يُرسَل ولا يُحفظ: يبقى في الذاكرة ما دامت النافذة مفتوحة، وما يخرج منها مخبوزٌ دائمًا.
 */

import {
  bakeReportImage,
  FALLBACK_SIDES,
  fitWithin,
  MAX_SIDE,
  scaleRect,
  type ReportImageEdit,
} from '@/modules/report/image'
import { LIMITS } from '@/modules/report/payload'

import { createBakeSurface } from '../../../editor/export'

import type { DeviceRect } from '@/shared/geometry'

export interface WorkingImage {
  readonly bitmap: ImageBitmap
  readonly width: number
  readonly height: number
}

export type ImportFailure = 'not-image' | 'empty'

/** يفكّ ملفًّا إلى صورةٍ عاملة بأطول ضلعٍ ≤ `MAX_SIDE`. ما لا يُفكّ صورةً يُرفض باسمه. */
export async function importImage(
  file: Blob,
): Promise<{ ok: true; image: WorkingImage } | { ok: false; failure: ImportFailure }> {
  if (file.size === 0) return { ok: false, failure: 'empty' }
  let decoded: ImageBitmap
  try {
    decoded = await createImageBitmap(file)
  } catch {
    return { ok: false, failure: 'not-image' }
  }
  const fit = fitWithin(decoded.width, decoded.height, MAX_SIDE)
  if (fit.scale === 1) {
    return { ok: true, image: { bitmap: decoded, width: decoded.width, height: decoded.height } }
  }
  const resized = await createImageBitmap(decoded, {
    resizeWidth: fit.width,
    resizeHeight: fit.height,
    resizeQuality: 'high',
  })
  decoded.close()
  return { ok: true, image: { bitmap: resized, width: fit.width, height: fit.height } }
}

export interface BakedImage {
  readonly blob: Blob
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
}

export type BakeFailure = 'too-large' | 'failed'

/**
 * يخبز الصورة بقصّها وحجبها، ويصغّرها درجةً درجة حتى تسع سقف العقد. كل درجةٍ خبزٌ كامل من البوّابة، والحجب
 * يُضرب في مقياسها — فالتصغير لا يُخرج بكسلًا من تحت الحجب.
 */
export async function bakeWorking(
  image: WorkingImage,
  crop: DeviceRect | null,
  redactions: readonly DeviceRect[],
): Promise<{ ok: true; image: BakedImage } | { ok: false; failure: BakeFailure }> {
  const longest = Math.max(image.width, image.height)
  const sides = [longest, ...FALLBACK_SIDES.filter((s) => s < longest)]
  for (const side of sides) {
    const fit = fitWithin(image.width, image.height, side)
    const bitmap =
      fit.scale === 1
        ? image.bitmap
        : await createImageBitmap(image.bitmap, {
            resizeWidth: fit.width,
            resizeHeight: fit.height,
            resizeQuality: 'high',
          })
    const edit: ReportImageEdit = {
      width: fit.width,
      height: fit.height,
      crop: crop ? scaleRect(crop, fit.scale) : null,
      redactions: redactions.map((r) => scaleRect(r, fit.scale)),
    }
    try {
      const baked = await bakeReportImage({
        edit,
        surface: createBakeSurface({ opaque: true }),
        sliceSource: async (rect) => {
          const slice = await createImageBitmap(bitmap, rect.x, rect.y, rect.width, rect.height)
          return {
            image: slice,
            width: slice.width,
            height: slice.height,
            close: () => slice.close(),
          }
        },
      })
      if (!baked.ok) return { ok: false, failure: 'failed' }
      if (baked.value.blob.size <= LIMITS.attachmentBytes) {
        const out = baked.value.blob
        return {
          ok: true,
          image: {
            blob: out,
            bytes: new Uint8Array(await out.arrayBuffer()),
            width: baked.value.report.width,
            height: baked.value.report.height,
          },
        }
      }
    } finally {
      if (bitmap !== image.bitmap) bitmap.close()
    }
  }
  return { ok: false, failure: 'too-large' }
}
