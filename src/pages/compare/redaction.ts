/**
 * ما حُجب في المحرّر لا يخرج في التقرير ولا في «التقط الفرق» ([ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md) §6).
 *
 * صفحة المقارنة تقرأ الأصل السليم من `blobs` — صحيحٌ للعرض داخل الإضافة، ومخالفٌ حين تغادر الصورة: الأصل
 * بلا مشهده يُخرج ما حُجب سليمًا. **وطريقان للتسريب لا واحد** (أمسكهما المراجع المستقلّ، ثمّ `verify:export`):
 *
 * ١. **الأساس:** صورة الحالية تُرسم تحت الفرق، فحقلٌ محجوب يُقرأ من خلال التظليل.
 * ٢. **شكل الفرق نفسه:** خريطة الفرق ألوانٌ مصمتة لكن بكسلاتها **حيث اختلف المحتوى** — نصٌّ محجوب تغيّر بين
 *    اللقطتين يُرسم بحروفه لونًا واحدًا. وهذا في محجوب المرجع كما في محجوب الحالية.
 *
 * فالأساس يُخبز بعقد الحجب وحدها من مشهد الحالية (لا تعليقاتها: التقرير يعرض الفرق لا ما رُسم فوقه، ولا
 * اقتصاصها: الفرق محسوبٌ على الصورة كاملة)، وخريطة الفرق تُصفَّر داخل محجوب اللقطتين معًا. ومشهدٌ محفوظ لا
 * يُقرأ **يرفض التصدير بالاسم** — نمط `handoff/evidence.ts`: الفارغ يُسقط الحجب بصمت.
 */

import { normaliseBox } from '@/modules/editor/hit-test'
import { parseScene } from '@/modules/editor/scene-schema'
import { errText, ok, type Result } from '@/shared/result'
import { annotations } from '@/shared/storage/repository'

import { startExport } from '../editor/export'
import { createBakeTools } from '../handoff/evidence'

import type { RasterImage } from '@/modules/compare/diff'
import type { Scene } from '@/modules/editor/scene'
import type { DeviceRect } from '@/shared/geometry'

/** مشهد اللقطة المحفوظ، أو `null` حين لم يُعلَّق عليها قطّ — وخطأٌ باسمه حين لا يُقرأ. */
export async function loadScene(captureId: string): Promise<Result<Scene | null>> {
  const stored = await annotations.get(captureId)
  if (!stored.ok) return stored.error.code === 'not-found' ? ok(null) : stored
  const scene = parseScene(stored.value.scene)
  if (!scene.ok) {
    return errText(
      'invalid-data',
      'تعليقات إحدى اللقطتين غير مقروءة — لا يُصدَّر الفرق بلا حجبها.',
      scene.error.detail ?? scene.error.message,
    )
  }
  return ok(scene.value)
}

/** عقد الحجب وحدها، بلا اقتصاص — ما يُخبز به الأساس. */
export function redactionScene(scene: Scene): Scene {
  return {
    ...scene,
    meta: { ...scene.meta, crop: null },
    nodes: scene.nodes.filter((node) => node.kind === 'redact'),
  }
}

/** مستطيلات الحجب بفضاء الصورة — تُصفَّر فيها خريطة الفرق. */
export function redactionRects(scene: Scene | null): DeviceRect[] {
  if (!scene) return []
  return scene.nodes.flatMap((node) => (node.kind === 'redact' ? [normaliseBox(node.rect)] : []))
}

/**
 * نسخةٌ من خريطة الفرق بلا بكسلٍ داخل المستطيلات — شفّافة هناك كما لو لم يختلف شيء. الخريطة بفضاء التقاطع
 * من أعلى اليسار، وهو فضاء اللقطتين نفسه (`diff.ts`)، فالمستطيل يُطبَّق كما هو ويُقصّ على حدودها.
 */
export function maskDiff(diff: RasterImage, rects: readonly DeviceRect[]): RasterImage {
  if (rects.length === 0) return diff
  const data = new Uint8ClampedArray(diff.data)
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(diff.width, Math.ceil(rect.x + rect.width))
    const y1 = Math.min(diff.height, Math.ceil(rect.y + rect.height))
    for (let y = y0; y < y1; y++) data.fill(0, (y * diff.width + x0) * 4, (y * diff.width + x1) * 4)
  }
  return { data, width: diff.width, height: diff.height }
}

export interface RedactedSources {
  /** الحالية بحجبها مدمَّرًا في البكسلات — أو الأصل حين لا حجب فيها. */
  readonly base: Blob
  readonly diff: RasterImage
}

/**
 * الأساس وخريطة الفرق كما يجوز أن يخرجا. الخبز من البوّابة نفسها (`startExport` بأدوات المحرّر)، فالحجب
 * بأنماطه الثلاثة يُطبَّق كما في التصدير.
 */
export async function redactedSources(input: {
  readonly aId: string
  readonly bId: string
  readonly baseBlob: Blob
  readonly diff: RasterImage
}): Promise<Result<RedactedSources>> {
  const [sceneA, sceneB] = await Promise.all([loadScene(input.aId), loadScene(input.bId)])
  if (!sceneA.ok) return sceneA
  if (!sceneB.ok) return sceneB

  const diff = maskDiff(input.diff, [
    ...redactionRects(sceneA.value),
    ...redactionRects(sceneB.value),
  ])
  const redactB = sceneB.value ? redactionScene(sceneB.value) : null
  if (!redactB || redactB.nodes.length === 0) return ok({ base: input.baseBlob, diff })

  const tools = await createBakeTools(false)
  try {
    const run = startExport({
      scene: redactB,
      sourceBlob: input.baseBlob,
      scale: 1,
      format: 'png',
      quality: 'max',
      stripMetadata: false,
      style: tools.style,
      layout: tools.layout,
      client: tools.client,
    })
    const baked = await run.done
    if (!baked.ok) return baked
    return ok({ base: baked.value.blob, diff })
  } finally {
    tools.dispose()
  }
}
