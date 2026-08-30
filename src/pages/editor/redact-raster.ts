/**
 * بناء رقع الحجب — الجزء الذي يلمس القماش.
 *
 * `pixel-ops` حسابٌ خالص، و`raster-cache` سياسة خالصة، وهذا الملفّ هو
 * الوصل: يقرأ من المصدر السليم إلى سطح صغير، ويُشغّل العمليات (على الخيط
 * الثانوي إن أمكن)، ويحتفظ بالناتج.
 *
 * **والرقعة تُبنى غير متزامنة، والإطار الذي يطلبها يرسم تغطية معتمة.**
 * أسوأ رقعة مقيسة تكلّف عشرات المللي ثانية، وحسابها داخل حلقة الرسم يوقف
 * الواجهة. والتغطية ريثما تجهز فشلٌ **مغلق**: تُظهر أقلّ ممّا سيُصدَّر لا
 * أكثر. والعكس — إظهار البكسلات الخام حتى تجهز الرقعة — يعرض المحتوى
 * الحسّاس على الشاشة في اللحظة التي طلب فيها المستخدم إخفاءه.
 *
 * **ويُعاد رسم ما تحت الحجب داخل الرقعة.** الخبز يدمّر **المركَّب** عند تلك
 * النقطة من ترتيب الرسم لا الصورة الخام: سهمٌ رُسم تحت الحجب يُطمَس معه.
 * فرقعةٌ تقرأ الصورة وحدها تُعاين شيئًا ويُصدَّر آخر.
 */

import {
  planPatch,
  patchKey,
  createRasterCache,
  type PatchPlan,
} from '@/modules/editor/raster-cache'
import { opForNode, IDENTITY_TRANSFORM } from '@/modules/editor/redact'

import type { BlurClient } from './worker-client'
import type { ObscureOp } from '@/modules/editor/blur-protocol'
import type { Ctx2D, BaseSource, RenderStyle } from '@/modules/editor/renderer'
import type { RedactNode } from '@/modules/editor/scene'

/** يُعيد رسم ما تحت العقدة داخل فضاء الرقعة. تُحقن من المسرح. */
export type PaintUnderlay = (ctx: Ctx2D, node: RedactNode, plan: PatchPlan) => void

export interface RedactRasterDeps {
  readonly source: BaseSource
  readonly style: RenderStyle
  readonly client: BlurClient
  /** يُستدعى حين تجهز رقعة — المسرح يجدول إطارًا. */
  readonly onReady: () => void
  readonly paintUnderlay?: PaintUnderlay
  /**
   * تشخيصٌ لكل محاولة بناء.
   *
   * هذه الوحدة **تفشل صامتةً بالتصميم**: كل تعذّر يُرسم تغطية معتمة، وهو
   * السلوك الصحيح أمنيًّا. لكنه يعني أن عطلًا برمجيًّا يبدو كسياسة — فلا
   * سبيل للتمييز بين «رُفضت الرقعة لأنها ضخمة» و«رُمي استثناء». والوسم
   * يجعل الفرق مقروءًا بلا أن يضعف الفشل المغلق.
   */
  readonly onDiag?: (state: string) => void
  /** يُحقن في الاختبار؛ وفي المتصفّح `OffscreenCanvas`. */
  readonly surface?: (w: number, h: number) => Scratch | null
}

/** سطحٌ صغير يُقرأ ويُكتب — أقلّ ما يلزم، فلا يُربَط الملفّ بنوع قماش بعينه. */
export interface Scratch {
  readonly ctx: Ctx2D
  readonly image: CanvasImageSource
  getImageData(x: number, y: number, w: number, h: number): ImageData
  putImageData(d: ImageData, x: number, y: number): void
  dispose(): void
}

function browserScratch(w: number, h: number): Scratch | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // بيئة بلا سياق ثنائي الأبعاد (وهي بيئة الاختبار حرفيًّا): لا رقعة، تغطية.
  if (!ctx) return null
  return {
    ctx: ctx as unknown as Ctx2D,
    image: canvas as unknown as CanvasImageSource,
    getImageData: (x, y, gw, gh) => ctx.getImageData(x, y, gw, gh),
    putImageData: (d, x, y) => ctx.putImageData(d, x, y),
    dispose: () => {
      canvas.width = 0
      canvas.height = 0
    },
  }
}

export interface RedactRaster {
  /**
   * الرقعة الجاهزة لهذه العقدة، أو `null`.
   *
   * `null` تعني **ارسم التغطية**: إمّا لأن النمط تغطية، أو لأن الرقعة قيد
   * البناء، أو لأنها رُفضت. والمستدعي لا يحتاج التفريق — كلّها تُرسم تغطية.
   */
  patchFor(
    node: RedactNode,
    zoom: number,
    underlayEpoch: string,
  ): { image: CanvasImageSource; plan: PatchPlan } | null
  clear(): void
  readonly bytes: number
  readonly size: number
  dispose(): void
}

export function createRedactRaster(deps: RedactRasterDeps): RedactRaster {
  const make = deps.surface ?? browserScratch
  const cache = createRasterCache<{ image: CanvasImageSource; plan: PatchPlan; scratch: Scratch }>(
    undefined,
    (v) => v.scratch.dispose(),
  )
  let alive = true

  const build = async (node: RedactNode, plan: PatchPlan, key: string): Promise<void> => {
    deps.onDiag?.(`build:${plan.width}x${plan.height}`)
    const scratch = make(plan.width, plan.height)
    if (!scratch) {
      deps.onDiag?.('no-surface')
      cache.release(key)
      return
    }

    try {
      // ١. المصدر السليم، بمستطيل العيّنة وحده — لا اللقطة كاملة.
      scratch.ctx.drawImage(
        deps.source.bitmap,
        plan.sample.x,
        plan.sample.y,
        plan.sample.w,
        plan.sample.h,
        0,
        0,
        plan.width,
        plan.height,
      )

      // ٢. ما تحت الحجب في ترتيب الرسم — كي تطابق المعاينة الخبز.
      deps.paintUnderlay?.(scratch.ctx, node, plan)

      // ٣. العمليات، بفضاء الرقعة وشدّتها المضروبة بالمقياس.
      const img = scratch.getImageData(0, 0, plan.width, plan.height)
      const base = opForNode(node, IDENTITY_TRANSFORM, deps.style.palette)
      const op: ObscureOp = { ...base, rect: plan.dest, strength: plan.strength }

      const out = await deps.client.run(img.data.buffer, plan.width, plan.height, [op])
      if (!alive) {
        deps.onDiag?.('disposed-midflight')
        scratch.dispose()
        return
      }

      scratch.putImageData(
        new ImageData(new Uint8ClampedArray(out.buffer), plan.width, plan.height),
        0,
        0,
      )

      if (!cache.put(key, { image: scratch.image, plan, scratch }, plan.bytes)) {
        deps.onDiag?.('over-budget')
        return
      }
      deps.onDiag?.(`built:${out.path}`)
      deps.onReady()
    } catch (error) {
      // فشل البناء يترك التغطية قائمة — ولا يُسقط الإطار.
      deps.onDiag?.(`error:${error instanceof Error ? error.message : String(error)}`)
      scratch.dispose()
      cache.release(key)
    }
  }

  return {
    get bytes() {
      return cache.bytes
    },
    get size() {
      return cache.size
    },

    patchFor(node, zoom, underlayEpoch) {
      const plan = planPatch(node, zoom)
      if (!plan) {
        deps.onDiag?.('no-plan')
        return null
      }

      const key = patchKey(node, plan, underlayEpoch)
      const hit = cache.get(key)
      if (hit) return { image: hit.image, plan: hit.plan }

      // `claim` يمنع إطلاق البناء نفسه ستّين مرّة في الثانية.
      if (cache.claim(key)) void build(node, plan, key)
      return null
    },

    clear() {
      cache.clear()
    },

    dispose() {
      alive = false
      cache.clear()
    },
  }
}
