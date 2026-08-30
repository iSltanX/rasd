/**
 * التصدير على الصفحة — وصلُ الخبز بالقماش والخيط والحافظة.
 *
 * `bake.ts` منطقٌ خالص يحقن سطحه وشرائحه ومحرّك بكسله. وهذا الملفّ يبنيها
 * الثلاثة من قدرات المتصفّح، ولا يضيف قرارًا واحدًا إلى ما يخرج.
 *
 * **والنسخ إلى الحافظة يُبنى على وعدٍ لا على بلوب جاهز — وهذا مقيس.**
 * A/B في كروم 151 داخل الإضافة المحمَّلة:
 *
 *   أ) `write([new ClipboardItem({ 'image/png': bakePromise })])` نُودي
 *      والصفحة مركَّزة، ثمّ سُحب التركيز بعد 400مي، والوعد حُلّ عند 3000مي
 *      ⇒ **نجح**.
 *   ب) `await bake()` أوّلًا (3000مي)، سُحب التركيز عند 400مي، ثمّ `write`
 *      ⇒ **فشل**: `NotAllowedError: Document is not focused`.
 *
 * البوّابة تُقيَّم **لحظة نداء `write`** لا لحظة حلول الوعد. فالنداء يقع
 * متزامنًا داخل معالج النقرة، وكروم يحجز خانة الحافظة ويملؤها لاحقًا.
 * ومن ينتظر الخبز أوّلًا يكون قد أضاع النافذة التي جعلت النداء مشروعًا.
 *
 * ولا تلزم صلاحية `clipboardWrite` في البيان: قِيس أن الكتابة تنجح بدونها
 * من صفحة إضافة — البوّابة تركيزُ المستند لا الصلاحية.
 */

import {
  bake,
  type BakeSlice,
  type BakeSurface,
  type BakeReport,
  type ExportBytes,
  type PixelRunner,
} from '@/modules/editor/bake'
import { canvasAlive } from '@/shared/canvas-alive'
import { err, ok, type Result } from '@/shared/result'

import type { BlurClient } from './worker-client'
import type { Ctx2D, RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { DeviceRect } from '@/shared/geometry'

/** سطح الخبز الحقيقي — `OffscreenCanvas` بمقاس التصدير. */
export function createBakeSurface(): BakeSurface {
  return {
    create(width, height) {
      if (typeof OffscreenCanvas === 'undefined') return null
      let canvas: OffscreenCanvas
      try {
        canvas = new OffscreenCanvas(width, height)
      } catch {
        return null
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null

      return {
        ctx: ctx as unknown as Ctx2D,
        getImageData: (x, y, w, h) => ctx.getImageData(x, y, w, h),
        putImageData: (d, x, y) => ctx.putImageData(d, x, y),
        // الحارس **بعد** التخصيص: تجاوز الحدود لا يرمي، بل يُقرأ أصفارًا.
        alive: () => canvasAlive(ctx),
        // القماش يُسلَّم ولا يُرمَّز هنا — الترميز في `bake.ts` وحدها.
        encodeTarget: canvas,
        dispose: () => {
          canvas.width = 0
          canvas.height = 0
        },
      }
    },
  }
}

/**
 * مصنع شرائح من بايتات اللقطة الأصلية.
 *
 * **من البلوب لا من بتماب كاملة.** البتماب الكاملة على الحالة القصوى
 * 280 ميغابايت بجوار قماش خبزٍ 280 ⇒ 560، أي 140% من سقف المرحلة.
 * و`createImageBitmap(blob, sx, sy, sw, sh)` تفكّ الجزء المطلوب وحده.
 */
export function createSliceSource(blob: Blob): (rect: DeviceRect) => Promise<BakeSlice> {
  return async (rect) => {
    const bitmap = await createImageBitmap(blob, rect.x, rect.y, rect.width, rect.height)
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }
}

/**
 * يحوّل عميل الخيط إلى منفّذ بكسل.
 *
 * سطرٌ واحد لأن العقدين مختلفان عمدًا: `bake` لا يعرف شيئًا عن الخيوط ولا
 * عن السقوط، و`BlurClient` لا يعرف شيئًا عن الخبز.
 */
export function pixelRunnerFor(client: BlurClient): PixelRunner {
  return async (buffer, width, height, ops) => {
    const out = await client.run(buffer, width, height, ops)
    return out.buffer
  }
}

export interface ExportRun {
  /** الوعد بالبايتات — يُمرَّر إلى `ClipboardItem` **قبل** أن يُنتظَر. */
  readonly bytes: Promise<ExportBytes>
  readonly done: Promise<Result<{ blob: ExportBytes; report: BakeReport }>>
  cancel(): void
}

export interface ExportOptions {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly scale: 1 | 2
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  readonly onProgress?: (fraction: number) => void
  readonly surface?: BakeSurface
}

/** يُفرّغ الحلقة بين الخطوات كي تبقى الواجهة حيّة أثناء خبز طويل. */
const yieldToLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

/**
 * يبدأ تصديرًا ويُعيد مقبضه **فورًا**.
 *
 * الفصل بين `bytes` و`done` مقصود: الأوّل وعدٌ يُسلَّم إلى الحافظة متزامنًا،
 * والثاني نتيجةٌ كاملة بتقريرها. ولو أُعيد وعدٌ واحد لَاضطُرّ المستدعي إلى
 * انتظاره ليستخرج البلوب — فيضيع التركيز، وتفشل الحافظة بالضبط كما قِيس.
 */
export function startExport(options: ExportOptions): ExportRun {
  const controller = new AbortController()

  const done = bake({
    scene: options.scene,
    scale: options.scale,
    surface: options.surface ?? createBakeSurface(),
    style: options.style,
    paletteMode: 'dark',
    layout: options.layout,
    sliceSource: createSliceSource(options.sourceBlob),
    runPixels: pixelRunnerFor(options.client),
    signal: controller.signal,
    yieldToLoop,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  })

  const bytes = done.then((r) => {
    if (!r.ok) throw new Error(r.error.message)
    return r.value.blob
  })
  // بلا هذا المستمع يُبلَّغ عن رفضٍ غير ملتقَط حين لا يُنسَخ إلى الحافظة.
  bytes.catch(() => undefined)

  return { bytes, done, cancel: () => controller.abort() }
}

export type CopyOutcome = 'copied' | 'not-focused' | 'unsupported' | 'failed'

/**
 * ينسخ بايتات التصدير إلى الحافظة.
 *
 * **يُنادى متزامنًا داخل معالج النقرة، بالوعد لا بالبلوب.** انظر ترويسة
 * الملفّ: انتظارُ الخبز أوّلًا يُفقد التركيز فتفشل الكتابة.
 */
export async function copyBaked(pending: Promise<Blob>): Promise<Result<CopyOutcome>> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return err({ code: 'handler-failed', message: 'الحافظة غير متاحة في هذا المتصفّح.' })
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
    return ok('copied')
  } catch (thrown) {
    const name = thrown instanceof Error ? thrown.name : ''
    if (name === 'NotAllowedError') {
      return err({
        code: 'permission-denied',
        message: 'تعذّر النسخ — انقر داخل الصفحة ثمّ أعد المحاولة.',
        detail: String(thrown),
      })
    }
    return err({
      code: 'handler-failed',
      message: 'تعذّر نسخ الصورة إلى الحافظة.',
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    })
  }
}
