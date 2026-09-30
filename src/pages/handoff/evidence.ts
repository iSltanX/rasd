/**
 * صور الحزمة — لقطة الدليل بمشهدها إلى PNG عبر مخرج الترميز الواحد وحده (ADR 0015 و0021 و0036 §5).
 *
 * **الأصل لا المصغَّرة، والمشهد لا الصورة الخام.** المصغَّرة لا تمرّ بشيفرة الحجب (ADR 0015 §6)، والأصل بلا
 * مشهده يُخرج ما حُجب في المحرّر سليمًا. فالقاعدة تُغلق على الفشل:
 *
 * - لقطةٌ فُقد أصلها ⟵ خطأٌ باسم مشكلتها، والنافذة تعرض «أزلها وتابع» (`Docs/Design.md`، الحزمة).
 * - مشهدٌ محفوظ لا يُقرأ ⟵ خطأ أيضًا، لا مشهدٌ فارغ: الفارغ يُسقط الحجب بصمت.
 * - لا مشهد محفوظ أصلًا ⟵ مشهدٌ فارغ بأبعاد اللقطة — لا حجب يُفقد لأنه لم يُرسم.
 *
 * وكل لقطة تُخبَز مرّةً ولو أشارت إليها مشكلتان (`imagesOf`)، بمقياس 1: لقطة الدليل ببكسل الجهاز أصلًا.
 */

import { emptyScene, parseScene } from '@/modules/editor/scene-schema'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { imagesOf, type HandoffImage, type HandoffModel } from '@/modules/handoff/model'
import { errText, ok, type RasdErrorCode, type Result } from '@/shared/result'
import { annotations, blobs, captures } from '@/shared/storage/repository'

import { buildRenderStyle } from '../editor/colors'
import { startExport } from '../editor/export'
import { createMeasurer } from '../editor/measure'
import { createBlurClient, type BlurClient } from '../editor/worker-client'

import type { BakeSurface } from '@/modules/editor/bake'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'

export interface EvidenceSource {
  readonly scene: Scene
  readonly blob: Blob
}

/** لقطة الدليل كما يخبزها المحرّر: الأصل ومشهده المحفوظ. */
export async function loadEvidence(captureId: string): Promise<Result<EvidenceSource>> {
  const record = await captures.get(captureId)
  const blob = await blobs.get(captureId)
  if (!record.ok || !blob.ok) {
    return errText('not-found', 'لقطة الدليل لم تعد في المكتبة.', `captures/${captureId}`)
  }
  const stored = await annotations.get(captureId)
  if (!stored.ok) {
    if (stored.error.code !== 'not-found') return stored
    const scene = emptyScene({
      captureId,
      width: record.value.width,
      height: record.value.height,
      dpr: record.value.devicePixelRatio,
    })
    return ok({ scene, blob: blob.value.blob })
  }
  const scene = parseScene(stored.value.scene)
  if (!scene.ok) {
    return errText(
      'invalid-data',
      'تعليقات لقطة الدليل غير مقروءة — لا تُصدَّر بلا حجبها.',
      scene.error.detail ?? scene.error.message,
    )
  }
  return ok({ scene: scene.value, blob: blob.value.blob })
}

/** أدوات الخبز: من المحرّر كما هي، أو تُبنى في المكتبة بالدوالّ نفسها. */
export interface BakeTools {
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  /** `privacy.stripMetadataOnExport` كما هو — PNG تخرج بلا مقاطع وصفية أيًّا كان. */
  readonly stripMetadata: boolean
  readonly surface?: BakeSurface
}

/**
 * أدوات الخبز في صفحةٍ ليست المحرّر — أسلوب الرسم وقياس النصّ وخيط الطمس نفسها.
 *
 * **الخطوط أوّلًا:** قياسٌ قبل تحميل Cairo يلفّ نصّ الملاحظة بعرض خطٍّ احتياطي، فتخرج بطاقتها مختلفةً عمّا
 * رسمه المحرّر. `document.fonts.ready` يكفي: الصفحة تحمّل خطوطها نفسها.
 */
export async function createBakeTools(
  stripMetadata: boolean,
): Promise<BakeTools & { readonly dispose: () => void }> {
  await document.fonts?.ready.catch(() => undefined)
  const style = buildRenderStyle()
  const measurer = createMeasurer(style.textFamily)
  const client = createBlurClient()
  return {
    style,
    layout: createTextLayoutCache(measurer.measure, measurer.measureFont),
    client,
    stripMetadata,
    dispose: () => client.dispose(),
  }
}

export interface EvidenceFailure {
  readonly captureId: string
  readonly name: string
  /** `not-found` لقطةٌ فُقدت — يُقال للمستخدم ما يُفعل بها؛ وغيرها عطلٌ برسالته. */
  readonly code: RasdErrorCode
  readonly message: string
}

export interface BakedEvidence {
  /**
   * بايتات PNG **بمعرّف اللقطة لا باسمها في الحزمة**: الاسم يتبع رتبة المشكلة، و«أزلها وتابع» يعيد الترقيم —
   * فبايتاتٌ بالاسم القديم كانت ستُسقط الحزمة بمرجعٍ بلا ملفّ (`imagesByName`).
   */
  readonly images: Map<string, Uint8Array>
  readonly failed: readonly EvidenceFailure[]
}

/** الصور بأسمائها في نموذجٍ بعينه — من المخبوز بمعرّف اللقطة. ما لم يُخبَز يغيب فيُسقط التجميع باسمه. */
export function imagesByName(
  model: HandoffModel,
  baked: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  for (const image of imagesOf(model)) {
    const bytes = baked.get(image.captureId)
    if (bytes) out.set(image.name, bytes)
  }
  return out
}

export interface BakeOptions {
  /** مصادر حيّة تسبق القاعدة — مشهد المحرّر المفتوح قبل أن يُحفظ آخر تعديل فيه. */
  readonly live?: ReadonlyMap<string, EvidenceSource>
  readonly onProgress?: (done: number, total: number) => void
  readonly signal?: AbortSignal
}

/**
 * يخبز الصور واحدةً واحدة. الفشل في صورة لا يوقف غيرها — يُجمع ليُعرض بأسماء مشكلاته. والإلغاء يوقف الخبز
 * الجاري نفسه (`cancel`) لا ما بعده وحده.
 */
export async function bakeEvidence(
  list: readonly HandoffImage[],
  tools: BakeTools,
  options: BakeOptions = {},
): Promise<Result<BakedEvidence>> {
  const images = new Map<string, Uint8Array>()
  const failed: EvidenceFailure[] = []
  const cancelled = () => errText('cancelled', 'أُلغي بناء الحزمة.')

  for (const [i, image] of list.entries()) {
    if (options.signal?.aborted) return cancelled()
    options.onProgress?.(i, list.length)

    const live = options.live?.get(image.captureId)
    const source = live ? ok(live) : await loadEvidence(image.captureId)
    if (!source.ok) {
      failed.push({
        captureId: image.captureId,
        name: image.name,
        code: source.error.code,
        message: source.error.message,
      })
      continue
    }
    const { scene, blob } = source.value

    const run = startExport({
      scene,
      sourceBlob: blob,
      scale: 1,
      format: 'png',
      stripMetadata: tools.stripMetadata,
      style: tools.style,
      layout: tools.layout,
      client: tools.client,
      ...(tools.surface ? { surface: tools.surface } : {}),
    })
    const stop = () => run.cancel()
    options.signal?.addEventListener('abort', stop)
    const baked = await run.done
    options.signal?.removeEventListener('abort', stop)

    if (!baked.ok) {
      if (baked.error.code === 'cancelled' || options.signal?.aborted) return cancelled()
      failed.push({
        captureId: image.captureId,
        name: image.name,
        code: baked.error.code,
        message: baked.error.message,
      })
      continue
    }
    images.set(image.captureId, new Uint8Array(await baked.value.blob.arrayBuffer()))
  }

  options.onProgress?.(list.length, list.length)
  return ok({ images, failed })
}
