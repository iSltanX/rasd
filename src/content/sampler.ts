/**
 * لقطة العيّنة — تُفكّ مرّة، وتُقرأ منها البكسلات محلّيًا لكل حركة مؤشِّر.
 *
 * **لماذا لا `EyeDropper`:** واجهة المتصفّح تضع الصفحة في وضعٍ **يكبت كل
 * أحداث الإدخال** (نصّ المواصفة: «no UI events are dispatched to the web
 * page»)، وقِيس ذلك: صفر حدث خلال 3,967ms من فتحها رغم أربع حركات مؤشِّر
 * حقيقية. فلا يمكن رسم عدسة تتبع المؤشِّر أصلًا. وتُرجع `{ sRGBHex }` بلا
 * إحداثيات — فلا ربط بعنصر ولا مسار CSS موازٍ، وهما نصّ المرحلة.
 *
 * **ولماذا لقطة واحدة لا لقطة لكل حركة:** `captureVisibleTab` محدود بنداءين
 * في الثانية، وزمنه المقيس 234–351ms — أي ≈1.8 عيّنة/ثانية مقابل ستّين
 * يحتاجها مؤشِّر. والقراءة من صورة مفكوكة قِيست بـ**2.25µs** للرقعة
 * 21×21، أي 0.014% من ميزانية إطار. فالفارق ليس بطئًا بل استحالة.
 *
 * **ولماذا في الصفحة لا في الـservice worker:** البايتات لا تعبر
 * `chrome.runtime` (البند 31 وADR 0010: `ImageBitmap` يمرّ ككائن فارغ بلا
 * خطأ)، وجولة الرسائل الواحدة ≈1ms مقابل 2.25µs محلّيًا — 440× أغلى. والـSW
 * يموت بعد 30 ثانية خمول فتتبخّر صورته وسط جلسة اختيار لون.
 *
 * **و`OffscreenCanvas` لا عنصر `<canvas>` في DOM الصفحة:** لا نُدخل عنصرًا
 * في مستند لا نملكه، ولا نمرّ بـ`img-src` في سياسة أمن الصفحة المضيفة —
 * `createImageBitmap` على `Blob` لا يمرّ بطبقة تحميل موارد أصلًا.
 *
 * **ولماذا `ImageDecoder` أوّلًا لا القماش:** Brave يضيف ضجيجًا بتّيًّا على
 * `getImageData` في كل صفحة ويب (حماية البصمة بـ«farbling»)، وسكربت المحتوى
 * في مستند الصفحة فيصيبه — قِيس: `#FF0000` ⇐ `#FE0100`، و55 بايتًا من 128 في
 * صورة عيّنة من 32 بكسلًا. أمّا `ImageDecoder` من WebCodecs فليس في ما
 * يموّهه، وقِيس في Brave 1.96 بايتاتٍ مطابقةً للمصدر بالضبط في كل بكسلٍ معتم
 * (`VideoFrame.copyTo` بصيغة RGBA). فتُقرأ البايتات الخام كاملةً مرّة عند
 * الفكّ ثمّ تُفهرَس بلا قماش. والقماش بديلٌ حين لا تتوفّر الواجهة أو يفشل الفكّ
 * — النتيجة نفسها خارج Brave. (وFirefox 157 فيه الواجهة ويأخذ مسارها — قِيس في SS7.)
 */

import { dataUrlMime, dataUrlToBlob, dataUrlToBytes } from '@/shared/data-url'
import { send } from '@/shared/messaging'
import { errText, ok, type Result } from '@/shared/result'

/** بكسل مقروء من اللقطة. */
export interface Pixel {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export interface Frame {
  /** عرض الصورة بالبكسل الفيزيائي. */
  readonly width: number
  readonly height: number
  /**
   * مقياس الصورة إلى إحداثيات النافذة — يُشتقّ لا يُفترَض.
   *
   * يساوي `devicePixelRatio` في الحالة العادية، ويختلف عنه عند تكبير
   * المتصفّح. الاشتقاق من أبعاد الصورة نفسها يصحّ في الحالتين.
   */
  readonly scaleX: number
  readonly scaleY: number
  /** لحظة الالتقاط — تُقارَن بها صلاحية اللقطة. */
  readonly at: number
}

export interface Sampler {
  /** اللقطة الحالية — `null` قبل أوّل التقاط أو بعد إبطالها. */
  frame(): Frame | null
  /** هل اللقطة قديمة (أُبطلت وتنتظر إعادة التقاط)؟ */
  readonly stale: boolean
  /** يلتقط لقطة جديدة ويفكّها. آمن للنداء المتكرِّر — يُلغي السابق. */
  refresh(): Promise<Result<Frame>>
  /** يُعلِّم اللقطة قديمة بلا إعادة التقاط — رخيص، يُستدعى من حلقة المزامنة. */
  invalidate(): void
  /** بكسل واحد بإحداثيات **النافذة**. `null` خارج الحدود أو بلا لقطة. */
  pixelAt(x: number, y: number): Pixel | null
  /**
   * رقعة مربّعة حول نقطة، بإحداثيات النافذة — مادّة العدسة المكبِّرة.
   *
   * تُرجع `cells × cells` بكسلًا بفضاء **الصورة** (بكسل فيزيائي واحد لكل
   * خلية)، فالتكبير حقيقي لا تمديد لبكسل منطقي.
   */
  patchAt(x: number, y: number, cells: number): Pixel[] | null
  dispose(): void
}

/** جانب الرقعة الافتراضي — فرديّ كي يكون للمركز خلية واحدة لا أربع. */
export const LOUPE_CELLS = 21

export interface SamplerOptions {
  win?: Window
}

/** بايتات RGBA خام بصفّ كل `width` بكسل — مخرج الفكّ بلا قماش. */
interface RawPixels {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

/**
 * يفكّ اللقطة بـ`ImageDecoder` ويقرأ بايتاتها الخام بلا قماش — `null` حين لا
 * تتوفّر الواجهة أو يفشل الفكّ، فيأخذ الأمر مسار القماش.
 */
async function decodeRaw(dataUrl: string): Promise<RawPixels | null> {
  if (typeof ImageDecoder !== 'function') return null
  let decoder: ImageDecoder | null = null
  try {
    /*
     * المخزن لا العرض عليه: في Firefox `ImageDecoder` من حجرة الصفحة و`Uint8Array` من حجرة سكربت المحتوى، فيُبلَغ
     * «Permission denied to access object» خطأً غير ملتقَط عند المُنشئ وإن نجح الفكّ — والمخزن لا يُبلغه (قِيس في
     * Firefox 157، SS7). والعرض يغطّي مخزنه كلّه (`dataUrlToBytes`)، فالبايتات نفسها.
     */
    decoder = new ImageDecoder({
      data: dataUrlToBytes(dataUrl).buffer,
      type: dataUrlMime(dataUrl),
    })
    const { image } = await decoder.decode()
    try {
      const width = image.codedWidth
      const height = image.codedHeight
      const data = new Uint8Array(image.allocationSize({ format: 'RGBA' }))
      // الطول يفرض أن الصفّ بلا حشو، وإلا فالفهرسة أدناه تنزاح — فيذهب الأمر للقماش.
      if (width <= 0 || height <= 0 || data.byteLength !== width * height * 4) return null
      await image.copyTo(data, { format: 'RGBA' })
      return { data, width, height }
    } finally {
      image.close()
    }
  } catch {
    return null
  } finally {
    decoder?.close()
  }
}

export function createSampler(options: SamplerOptions = {}): Sampler {
  const win = options.win ?? window

  let bitmap: ImageBitmap | null = null
  let canvas: OffscreenCanvas | null = null
  let ctx: OffscreenCanvasRenderingContext2D | null = null
  let raw: RawPixels | null = null
  let current: Frame | null = null
  let stale = true
  let inflight: Promise<Result<Frame>> | null = null
  let disposed = false

  const release = () => {
    bitmap?.close()
    bitmap = null
    canvas = null
    ctx = null
    raw = null
    current = null
  }

  const refresh = async (): Promise<Result<Frame>> => {
    if (disposed) return errText('cancelled', 'أداة اللون أُغلقت.')
    // نداء ثانٍ أثناء الأوّل ينتظره بدل أن يفتح لقطة موازية: مُنظِّم الإيقاع
    // يصطفّ، فلقطتان متزامنتان تعنيان انتظارًا مضاعفًا بلا فائدة.
    if (inflight) return inflight

    inflight = (async (): Promise<Result<Frame>> => {
      const reply = await send('colour/frame', undefined)
      if (!reply.ok) return reply

      try {
        const decoded = await decodeRaw(reply.value.dataUrl)
        let next: ImageBitmap | null = null
        if (!decoded) next = await createImageBitmap(dataUrlToBlob(reply.value.dataUrl))

        // التفكيك قد ينتهي بعد الإغلاق — الصورة تُحرَّر ولا تُحتجَز.
        if (disposed) {
          next?.close()
          return errText('cancelled', 'أداة اللون أُغلقت.')
        }

        release()
        let width: number
        let height: number
        if (decoded) {
          raw = decoded
          width = decoded.width
          height = decoded.height
        } else if (next) {
          bitmap = next
          width = next.width
          height = next.height
          canvas = new OffscreenCanvas(width, height)
          ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) return errText('handler-failed', 'تعذّر إنشاء سياق القماش للعيّنة.')
          ctx.drawImage(next, 0, 0)
        } else {
          return errText('handler-failed', 'تعذّر فكّ لقطة العيّنة.')
        }

        const vw = win.innerWidth
        const vh = win.innerHeight
        current = {
          width,
          height,
          // مقاس نافذة صفري لا يقع عمليًّا؛ الحارس يمنع القسمة على صفر.
          scaleX: vw > 0 ? width / vw : 1,
          scaleY: vh > 0 ? height / vh : 1,
          at: Date.now(),
        }
        stale = false
        return ok(current)
      } catch (thrown) {
        return errText('handler-failed', 'تعذّر فكّ لقطة العيّنة.', String(thrown))
      }
    })()

    try {
      return await inflight
    } finally {
      inflight = null
    }
  }

  /** نقطة النافذة → بكسل الصورة، بالاقتطاع لا بالتقريب. */
  const toImage = (x: number, y: number, f: Frame): { ix: number; iy: number } => ({
    ix: Math.floor(x * f.scaleX),
    iy: Math.floor(y * f.scaleY),
  })

  /** بكسل واحد بإحداثيات **الصورة** — من البايتات الخام إن فُكّت بلا قماش، وإلا من القماش. */
  const readPixel = (ix: number, iy: number): Uint8ClampedArray | Uint8Array | null => {
    if (raw) {
      if (ix < 0 || iy < 0 || ix >= raw.width || iy >= raw.height) return null
      const at = (iy * raw.width + ix) * 4
      return raw.data.subarray(at, at + 4)
    }
    if (!ctx) return null
    try {
      return ctx.getImageData(ix, iy, 1, 1).data
    } catch {
      // قماش ملوَّث أو أبعاد غير صالحة — لا يقع مع لقطة `data:` لكن
      // الفشل هنا لا يجوز أن يُسقط الأداة.
      return null
    }
  }

  return {
    frame: () => current,
    get stale() {
      return stale
    },
    refresh,
    invalidate() {
      stale = true
    },

    pixelAt(x, y) {
      const f = current
      if (!f) return null
      const { ix, iy } = toImage(x, y, f)
      if (ix < 0 || iy < 0 || ix >= f.width || iy >= f.height) return null
      const d = readPixel(ix, iy)
      if (!d) return null
      return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: d[3] ?? 255 }
    },

    patchAt(x, y, cells) {
      const f = current
      if (!f || cells <= 0) return null
      const { ix, iy } = toImage(x, y, f)
      const half = Math.floor(cells / 2)
      const out: Pixel[] = []

      /*
       * القراءة خليةً خليةً لا رقعةً واحدة، عمدًا.
       *
       * رقعة واحدة قرب الحافّة تُقصّ فتنزاح الشبكة عن مركزها، فيُعرض
       * البكسل الخطأ محدَّدًا. والقراءة المفردة تسمح بإرجاع «خارج الحدود»
       * لكل خلية على حدة، فتبقى الشبكة متمركزة على المؤشِّر دائمًا.
       * التكلفة مقيسة: 2.05µs للبكسل الواحد.
       */
      for (let row = -half; row <= half; row++) {
        for (let col = -half; col <= half; col++) {
          const px = ix + col
          const py = iy + row
          if (px < 0 || py < 0 || px >= f.width || py >= f.height) {
            out.push({ r: 0, g: 0, b: 0, a: 0 })
            continue
          }
          const d = readPixel(px, py)
          out.push(
            d
              ? { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: d[3] ?? 255 }
              : { r: 0, g: 0, b: 0, a: 0 },
          )
        }
      }
      return out
    },

    dispose() {
      disposed = true
      stale = true
      release()
    },
  }
}
