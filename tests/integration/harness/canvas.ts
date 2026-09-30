import { Blob as NodeBlob } from 'node:buffer'

import { vi } from 'vitest'

import { createFakeSurface, type FakeSurface } from '../../helpers/fake-surface'

import { decodePng, encodePng, type Pixels } from './png'

import type { Ctx2D } from '@/modules/editor/renderer'

/**
 * قماشٌ يرسم فعلًا في بيئة الاختبار — `createImageBitmap` و`OffscreenCanvas` و`Blob`.
 *
 * happy-dom يعرّف الاسمين ولا يرسم: `getContext('2d')` يُرجع `null`. فمسار اللقطة كلّه (فكّ
 * `captureVisibleTab`، والقصّ، والخبز، والترميز) يسقط قبل أن يبدأ. وهذا البديل **يرسم بكسلات
 * حقيقية** على سطح `tests/helpers/fake-surface.ts` نفسه، ويرمّز PNG حقيقيًّا يُفكّ في الطرف الآخر.
 *
 * **و`Blob` من Node لا من happy-dom.** `fake-indexeddb` ينسخ السجلّ بالنسخ الهيكلي، وBlob من
 * happy-dom يخرج منه كائنًا عاديًّا بلا بايتات (قِيس: `arrayBuffer is not a function`). وBlob من
 * Node يُنسَخ هيكليًّا بلا فقد — وهو سلوك المتصفّح الحقيقي، حيث تحفظ IndexedDB الـBlob كاملًا.
 *
 * **وما لا يدّعيه:** لا تنعيم ولا دوران ولا تشكيل حروف (حدود السطح نفسه)، ولا ترميز غير PNG.
 */

interface Raster {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

class ShimBitmap implements Raster {
  closed = false
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
  close(): void {
    this.closed = true
  }
}

/** قطعة من صورة؛ ما يقع خارجها شفّاف كما في `createImageBitmap` الحقيقي. */
function crop(src: Raster, sx: number, sy: number, sw: number, sh: number): Raster {
  const data = new Uint8ClampedArray(sw * sh * 4)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const ix = sx + x
      const iy = sy + y
      if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) continue
      const from = (iy * src.width + ix) * 4
      data.set(src.data.subarray(from, from + 4), (y * sw + x) * 4)
    }
  }
  return { data, width: sw, height: sh }
}

function rasterOf(source: unknown): Raster {
  if (source instanceof ShimBitmap) {
    // صورةٌ أُغلقت لا تُرسم — كروم يرمي `InvalidStateError`، والسكوت هنا يخفي تحريرًا مبكّرًا.
    if (source.closed) throw new DOMException('الصورة أُغلقت قبل رسمها.', 'InvalidStateError')
    return source
  }
  if (source instanceof ShimCanvas) return source.raster()
  const raw = source as Partial<Raster> | null
  if (raw?.data instanceof Uint8ClampedArray && typeof raw.width === 'number') return raw as Raster
  throw new TypeError('مصدر رسم لا يعرفه القماش البديل.')
}

async function createImageBitmapShim(
  source: unknown,
  sx?: number,
  sy?: number,
  sw?: number,
  sh?: number,
): Promise<ShimBitmap> {
  const blob = source as { arrayBuffer?: () => Promise<ArrayBuffer> }
  const raster =
    typeof blob.arrayBuffer === 'function'
      ? decodePng(new Uint8Array(await blob.arrayBuffer()))
      : rasterOf(source)
  const cut =
    sx === undefined ? raster : crop(raster, sx, sy ?? 0, sw ?? raster.width, sh ?? raster.height)
  return new ShimBitmap(new Uint8ClampedArray(cut.data), cut.width, cut.height)
}

class ShimCanvas {
  #surface: FakeSurface
  readonly #ctx: Ctx2D

  constructor(width: number, height: number) {
    this.#surface = createFakeSurface(width, height)
    /*
     * السياق ثابتٌ والسطح خلفه يتبدّل: تغيير `width` في المتصفّح يمسح القماش ويُبقي السياق نفسه،
     * ومن يحمل السياق بعد إعادة التحجيم يرسم على السطح الجديد لا القديم.
     */
    const overrides: Record<PropertyKey, unknown> = {
      canvas: this,
      drawImage: (image: unknown, ...args: number[]) => this.#draw(image, args),
      getImageData: (x: number, y: number, w: number, h: number) =>
        this.#surface.getImageData(x, y, w, h),
      putImageData: (d: ImageData, x: number, y: number) => {
        this.#surface.putImageData(d, x, y)
      },
    }
    this.#ctx = new Proxy({} as Ctx2D, {
      get: (_, prop) => {
        if (prop in overrides) return overrides[prop]
        const value: unknown = Reflect.get(this.#surface.ctx, prop)
        return typeof value === 'function'
          ? ((value as (...args: unknown[]) => unknown).bind(this.#surface.ctx) as unknown)
          : value
      },
      set: (_, prop, value) => Reflect.set(this.#surface.ctx, prop, value),
    })
  }

  get width(): number {
    return this.#surface.width
  }
  set width(value: number) {
    this.#surface = createFakeSurface(value, this.#surface.height)
  }
  get height(): number {
    return this.#surface.height
  }
  set height(value: number) {
    this.#surface = createFakeSurface(this.#surface.width, value)
  }

  getContext(kind: string): Ctx2D | null {
    return kind === '2d' ? this.#ctx : null
  }

  /** PNG وحده: المُرمِّز الحقيقي يُسقط ما لا يعرفه إلى PNG، و`bake` يقرأ ذلك من النوع المُعاد. */
  convertToBlob(): Promise<Blob> {
    const png = encodePng(this.raster())
    return Promise.resolve(new NodeBlob([png], { type: 'image/png' }) as unknown as Blob)
  }

  raster(): Raster {
    return { data: this.#surface.pixels, width: this.width, height: this.height }
  }

  #draw(image: unknown, args: readonly number[]): void {
    const src = rasterOf(image)
    const base = this.#surface.ctx
    if (args.length === 2) base.drawImage(src as never, args[0]!, args[1]!, src.width, src.height)
    else if (args.length === 4) base.drawImage(src as never, args[0]!, args[1]!, args[2]!, args[3]!)
    else if (args.length === 8) {
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args as [number, ...number[]]
      base.drawImage(crop(src, sx, sy!, sw!, sh!) as never, dx!, dy!, dw!, dh!)
    } else throw new TypeError(`drawImage بعدد معاملات غير معروف: ${String(args.length + 1)}.`)
  }
}

/** يركّب البدائل الثلاثة؛ `vi.unstubAllGlobals()` يعيد الأصل. */
export function installCanvas(): void {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('OffscreenCanvas', ShimCanvas)
  vi.stubGlobal('createImageBitmap', createImageBitmapShim)
}

/** بايتات PNG من صورة — ما يعيده `captureVisibleTab` بعد فكّ عنوان البيانات. */
export function pngDataUrl(img: Pixels): string {
  return `data:image/png;base64,${Buffer.from(encodePng(img)).toString('base64')}`
}

/** يفكّ Blob صورة إلى بكسلاتها. */
export async function decodeBlob(blob: Blob): Promise<Pixels> {
  return decodePng(new Uint8Array(await blob.arrayBuffer()))
}
