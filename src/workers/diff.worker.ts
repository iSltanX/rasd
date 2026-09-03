/**
 * خيط الفرق — يقارن لقطتين بعيدًا عن خيط الواجهة. مرآة `blur.worker.ts`
 * (المرحلة 15) بالضبط: بلا منطق خاصّ به، `self` مُغلَّف باسم `ctx`، إشعار
 * جهوز `{id:-1, ready:true}` عند التحميل، والمخزن الناتج يُنقَل لا يُنسخ.
 *
 * **ولا منطق خاصّ به هنا أيضًا.** كل الحساب في `modules/compare/diff.ts`
 * و`regions.ts`، والخيط الرئيسي ينادي **الدالّتين نفسيهما** عند السقوط —
 * فالمسار المتزامن يُنتج البايتات والمناطق نفسها لا مثيلها.
 *
 * **صورتا الدخل والفرق والمناطق في رحلة واحدة**: `computeDiff` ثم
 * `groupDiffRegions` على قناعها مباشرةً قبل الردّ الواحد، بلا رحلة ثانية
 * لنقل القناع نفسه عبر `postMessage` (`diff-protocol.ts`).
 *
 * **حقول الردّ تُسنَد من `DiffResult`/`DiffRegion` مباشرةً بلا تحويل.**
 * `DeviceRect`/`ExtraStrip`/`DiffRegion` متوافقة بنيويًّا مع
 * `WireRect`/`WireExtraStrip`/`WireRegion` وقت التشغيل فعلًا لا نوعًا فقط —
 * العلامة الوهمية `space` تُمحى عبر `postMessage` لكنها موجودة كخاصّية عادية
 * في كلا الشكلين، فلا حاجة لبناء كائن وسيط.
 */

import { computeDiff, type RasterImage } from '@/modules/compare/diff'
import { groupDiffRegions } from '@/modules/compare/regions'

import type {
  DiffFailure,
  DiffJobImage,
  DiffReply,
  DiffRequest,
} from '@/modules/compare/diff-protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

/** يبني عرضًا على المخزن المنقول — بلا `ImageData`، فهي ليست منقولة. */
function imageOf(job: DiffJobImage): RasterImage {
  const data = new Uint8ClampedArray(job.buffer)
  if (data.length !== job.width * job.height * 4) {
    throw new Error(`مقاس المخزن ${data.length} لا يطابق ${job.width}×${job.height}`)
  }
  return { data, width: job.width, height: job.height }
}

ctx.addEventListener('message', (event: MessageEvent<DiffRequest>) => {
  const req = event.data
  const started = performance.now()

  try {
    const a = imageOf(req.a)
    const b = imageOf(req.b)

    const diff = computeDiff(a, b, req.diffOptions)
    const regions = groupDiffRegions(
      diff.mask,
      diff.overlap.width,
      diff.overlap.height,
      req.regionOptions,
    )

    const reply: DiffReply = {
      id: req.id,
      // `Uint8ClampedArray.buffer` مكتوب `ArrayBuffer | SharedArrayBuffer`
      // في تعريفات TypeScript الحديثة — والمخصَّص هنا طازج دومًا (`computeDiff`
      // ينشئه بنفسه)، فلا `SharedArrayBuffer` واردة فعلًا.
      diffBuffer: diff.diff.data.buffer as ArrayBuffer,
      diffWidth: diff.diff.width,
      diffHeight: diff.diff.height,
      overlap: diff.overlap,
      diffPixelCount: diff.diffPixelCount,
      comparedPixels: diff.comparedPixels,
      diffRatio: diff.diffRatio,
      extraInA: diff.extraInA,
      extraInB: diff.extraInB,
      regions,
      ms: performance.now() - started,
    }
    /*
     * **مخزن الفرق يُعاد منقولًا لا منسوخًا.** `diff.diff.data` مخصَّص
     * حديثًا داخل `computeDiff` (لا يُسند إلى مخزن `a`/`b`)، فنقله عائدًا
     * للخيط الرئيسي آمنٌ دومًا — لا شيء آخر يعتمد عليه هنا.
     */
    ctx.postMessage(reply, [reply.diffBuffer])
  } catch (error) {
    const failure: DiffFailure = {
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
    }
    // بلا مخزن: الأصل بقي عند المُرسِل إن لم يُنقل، أو ضاع إن نُقل — وفي
    // الحالتين يسقط العميل إلى المسار المتزامن على نسختيه الخاصّتين.
    ctx.postMessage(failure)
  }
})

/** إشعار جهوز — يُثبت أن الملفّ حُمِّل فعلًا لا أنه بُني فقط. */
ctx.postMessage({ id: -1, ready: true })
