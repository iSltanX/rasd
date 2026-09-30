/**
 * PNG حقيقي مبنيّ في Node — ولفكّ صورة PDF إلى بكسلاتها.
 *
 * **بايتات لا وصف:** `zlib` من Node ومقاطع بـCRC صحيح، فما يقبله قارئ الإنتاج هنا يقبله في كروم. والمرشِّح
 * يدور على الأنواع الخمسة صفًّا صفًّا — فاختبار الفكّ يمرّ على كل نوعٍ يكتبه مُرمِّج حقيقي، لا على «بلا
 * مرشِّح» وحده الذي كان سيُخفي خطأً في حساب `Paeth`.
 */

import { deflateSync, inflateSync } from 'node:zlib'

import { crc32, PNG_SIGNATURE } from './png-chunks'

export type Pixel = readonly [number, number, number] | readonly [number, number, number, number]

export interface MakePngOptions {
  /** 2 = RGB (ما يُخرجه قماشٌ معتم)، و6 = RGBA (ما يُخرجه القماش الافتراضي). */
  readonly colourType?: 2 | 6
  readonly bitDepth?: number
  readonly interlace?: 0 | 1
  /** يُقسم تيّار `zlib` على هذا العدد من مقاطع `IDAT` — المُرمِّج الحقيقي يُخرج أكثر من واحد. */
  readonly idatChunks?: number
}

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  out.set(u32(data.length), 0)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  out.set(u32(crc32(out, 4, 8 + data.length)), 8 + data.length)
  return out
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** الصفوف مرشَّحةً: نوع المرشِّح `y % 5` — الخمسة كلّها في كل صورة من خمسة صفوف فأكثر. */
function filterRows(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp
  const out = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const type = y % 5
    out[y * (stride + 1)] = type
    for (let i = 0; i < stride; i++) {
      const x = raw[y * stride + i]!
      const a = i >= bpp ? raw[y * stride + i - bpp]! : 0
      const b = y > 0 ? raw[(y - 1) * stride + i]! : 0
      const c = y > 0 && i >= bpp ? raw[(y - 1) * stride + i - bpp]! : 0
      const predicted =
        type === 0
          ? 0
          : type === 1
            ? a
            : type === 2
              ? b
              : type === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c)
      out[y * (stride + 1) + 1 + i] = (x - predicted) & 255
    }
  }
  return out
}

/** البكسلات الخام صفًّا صفًّا — ما تُقارَن به الصورة المفكوكة. */
export function rawPixels(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
  bpp: 3 | 4 = 3,
): Uint8Array {
  const raw = new Uint8Array(width * height * bpp)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pixel(x, y)
      for (let k = 0; k < bpp; k++) raw[(y * width + x) * bpp + k] = p[k] ?? 255
    }
  }
  return raw
}

export function makePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
  options: MakePngOptions = {},
): Uint8Array {
  const colourType = options.colourType ?? 2
  const bpp = colourType === 6 ? 4 : 3
  const header = new Uint8Array(13)
  header.set(u32(width), 0)
  header.set(u32(height), 4)
  header[8] = options.bitDepth ?? 8
  header[9] = colourType
  header[12] = options.interlace ?? 0

  const stream = deflateSync(filterRows(rawPixels(width, height, pixel, bpp), width, height, bpp))
  const pieces = Math.max(1, options.idatChunks ?? 1)
  const size = Math.ceil(stream.length / pieces)
  const idats: Uint8Array[] = []
  for (let at = 0; at < stream.length; at += size) {
    idats.push(chunk('IDAT', stream.subarray(at, at + size)))
  }

  const parts = [PNG_SIGNATURE, chunk('IHDR', header), ...idats, chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * يفكّ تيّار صورة PDF بـ`FlateDecode` و`Predictor 15` إلى بكسلات خام — مستقلٌّ عن المولِّد.
 *
 * هذا ما يفعله قارئ PDF حين يرسم الصفحة. فمطابقة ناتجه للبكسلات الأصلية تُثبت أن الصورة **تُفتح**،
 * لا أن بايتاتها تبدأ صحيحة.
 */
export function decodePredicted(
  data: Uint8Array,
  width: number,
  height: number,
  colors: number,
): Uint8Array {
  const inflated = inflateSync(data)
  const stride = width * colors
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const type = inflated[y * (stride + 1)]!
    for (let i = 0; i < stride; i++) {
      const x = inflated[y * (stride + 1) + 1 + i]!
      const a = i >= colors ? out[y * stride + i - colors]! : 0
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0
      const c = y > 0 && i >= colors ? out[(y - 1) * stride + i - colors]! : 0
      const predicted =
        type === 0
          ? 0
          : type === 1
            ? a
            : type === 2
              ? b
              : type === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c)
      out[y * stride + i] = (x + predicted) & 255
    }
  }
  return out
}
