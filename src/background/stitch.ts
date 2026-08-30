/**
 * تجميع البلاطات في صورة واحدة — داخل الـservice worker.
 *
 * **لماذا هنا لا في Worker ولا في مستند خارج الشاشة.** الخطّة تسمّي
 * `src/workers/stitch.worker.ts`؛ وهذا مستحيل: قيس داخل الـservice worker
 * أن `typeof Worker === 'undefined'` و`URL.createObjectURL === 'undefined'`
 * — فحتى حيلة blob لا تعمل. بينما `OffscreenCanvas` و`createImageBitmap`
 * و`ImageData` كلّها متاحة فيه، وحدود القماش مطابقة تمامًا لما في الصفحة.
 * وهو تكرار حرفي لما فعلته المرحلة 8 بـ`crop.worker.ts` في [ADR 0009].
 *
 * **ولماذا التدفّق إلزامي لا تحسين.** حجز 29 بلاطة 2560×1386 كـ`ImageBitmap`
 * قيس **+378MB**؛ وبعد `close()` عادت الذاكرة خلال 2.2 ثانية. فالبلاطة
 * تُفكّ وتُرسَم وتُغلَق فورًا، ولا تُجمَع في مصفوفة أبدًا.
 *
 * **والبلاطات لا تعبر `chrome.runtime` قطّ.** قيس أن `Blob` و`ImageBitmap`
 * يصلان عبر الرسائل ككائن فارغ `{}` في نصف ميلي‌ثانية **بلا خطأ ولا رفض** —
 * أي فقدٌ صامت يمرّ من كل اختبار ويفشل في المنتج. فالبايتات تبقى في الـSW
 * من الالتقاط إلى الترميز.
 */

import { canvasAlive } from '@/shared/canvas-alive'
import { withinCanvasLimits } from '@/shared/canvas-limits'
import { errText, ok, type Result } from '@/shared/result'

import { dataUrlToBytes } from './image-ops'

export interface StitchTarget {
  readonly width: number
  readonly height: number
}

export interface StitchedImage {
  readonly blob: Blob
  readonly width: number
  readonly height: number
  /** عدد البلاطات المرسومة فعلًا. */
  readonly tiles: number
}

/**
 * مُجمِّع تدفّقي: يستقبل بلاطة، يرسمها، يحرّرها، ثم ينتظر التالية.
 *
 * الحالة الوحيدة المحفوظة بين البلاطات هي القماش نفسه — لا مصفوفة صور ولا
 * عناوين بيانات.
 */
export class StreamingStitcher {
  private canvas: OffscreenCanvas | null
  private ctx: OffscreenCanvasRenderingContext2D | null
  private drawn = 0

  private constructor(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D) {
    this.canvas = canvas
    this.ctx = ctx
  }

  /**
   * يخصّص القماش ويتحقّق من حياته.
   *
   * `Result` لا استثناء: تجاوز الحدّ حالة متوقَّعة يعرضها المستخدم، لا عطل
   * برمجي.
   */
  static create(target: StitchTarget): Result<StreamingStitcher> {
    if (!withinCanvasLimits(target.width, target.height)) {
      return errText(
        'invalid-data',
        'الصفحة أطول مما تحتمله صورة واحدة في هذا المتصفّح.',
        `${target.width}×${target.height}`,
      )
    }

    let canvas: OffscreenCanvas
    try {
      canvas = new OffscreenCanvas(target.width, target.height)
    } catch (thrown) {
      return errText('handler-failed', 'تعذّر تهيئة سطح التجميع.', String(thrown))
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return errText('handler-failed', 'تعذّر تهيئة سطح التجميع.')

    if (!canvasAlive(ctx)) {
      canvas.width = 0
      canvas.height = 0
      return errText(
        'invalid-data',
        'الصفحة أطول مما تحتمله صورة واحدة في هذا المتصفّح.',
        `${target.width}×${target.height} — قماش فارغ صامت`,
      )
    }

    return ok(new StreamingStitcher(canvas, ctx))
  }

  /**
   * يرسم بلاطة عند `top` ثم يحرّرها فورًا.
   *
   * `gutter` يقصّ عمود شريط التمرير من يمين الصورة أو يسارها: قيس أن
   * `captureVisibleTab` يلتقطه ضمن اللقطة (30 بكسل جهاز)، فتركه يعطي عمودًا
   * رماديًّا بطول الصفحة كلّها.
   */
  async drawTile(
    dataUrl: string,
    top: number,
    gutter = 0,
    gutterOnStart = false,
  ): Promise<Result<null>> {
    const ctx = this.ctx
    if (!ctx) return errText('handler-failed', 'المُجمِّع أُغلق.')

    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(new Blob([dataUrlToBytes(dataUrl)]))
    } catch (thrown) {
      return errText(
        'invalid-data',
        'تعذّر فكّ ترميز بلاطة — قد تكون الصفحة غيّرت محتواها أثناء الالتقاط.',
        String(thrown),
      )
    }

    try {
      const sw = Math.max(1, bitmap.width - gutter)
      const sx = gutterOnStart ? gutter : 0
      ctx.drawImage(bitmap, sx, 0, sw, bitmap.height, 0, top, sw, bitmap.height)
      this.drawn += 1
      return ok(null)
    } finally {
      // التحرير الصريح يعمل فورًا؛ ما يُترك للجامع لا يعود في الوقت المناسب.
      bitmap.close()
    }
  }

  /** يُرمّز الناتج ويحرّر القماش. لا يُستدعى إلا مرّة. */
  async finish(type = 'image/png'): Promise<Result<StitchedImage>> {
    const canvas = this.canvas
    if (!canvas) return errText('handler-failed', 'المُجمِّع أُغلق.')
    const width = canvas.width
    const height = canvas.height

    try {
      const blob = await canvas.convertToBlob({ type })
      return ok({ blob, width, height, tiles: this.drawn })
    } catch (thrown) {
      return errText('handler-failed', 'تعذّر ترميز الصورة المجمَّعة.', String(thrown))
    } finally {
      this.release()
    }
  }

  /**
   * يحرّر القماش صراحةً.
   *
   * `width = 0` يُسقط البكسلات فورًا — وهي الحيلة نفسها التي يستعملها
   * `image-ops.ts` منذ المرحلة 8. تُستدعى في `finally` عند الإلغاء أيضًا.
   */
  release(): void {
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.ctx = null
  }
}
