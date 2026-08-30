/**
 * سطحٌ راسمٌ حقيقي على `ImageData` — بلا قماش.
 *
 * `getContext('2d')` تُرجع `null` في بيئة الاختبار، فالخبز كلّه غير قابل
 * للاختبار بلا بديل. وهذا البديل **يرسم فعلًا**: يملأ مستطيلات ويقصّ الصور
 * ويحمل مصفوفة تحويل — بما يكفي لأن يكشف خطأً في الإحداثيات، وهو الصنف
 * الذي تدور حوله المرحلة كلّها.
 *
 * **وهو ليس متصفّحًا، ولا يدّعي.** الحروف لا تُشكَّل، والمنحنيات لا تُنعَّم،
 * والدوران غير مدعوم. فما يُثبَت به هو **الموضع والترتيب والتدمير**، وما
 * لا يُثبَت به يُترك للفحص الحيّ على كروم.
 */

import type { BakeSlice, BakeTarget } from '@/modules/editor/bake'
import type { Ctx2D } from '@/modules/editor/renderer'

interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** صورة مصدر مسطّحة — تُستعمل شريحةً. */
export interface FakeImage {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface FakeSurface extends BakeTarget {
  readonly pixels: Uint8ClampedArray
  readonly width: number
  readonly height: number
  readonly calls: readonly string[]
  readonly encoded: number
  readonly disposed: number
}

/** يبني صورة اختبار بنمط معلوم. */
export function image(
  width: number,
  height: number,
  at: (x: number, y: number) => readonly [number, number, number, number],
): FakeImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { data, width, height }
}

/** شريحةٌ من صورة — بالشكل الذي يستهلكه الخبز. */
export function sliceOf(src: FakeImage, sx: number, sy: number, sw: number, sh: number): BakeSlice {
  const cut = image(sw, sh, (x, y) => {
    const ix = sx + x
    const iy = sy + y
    if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) return [0, 0, 0, 0]
    const i = (iy * src.width + ix) * 4
    return [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!, src.data[i + 3]!]
  })
  let closed = 0
  return {
    image: cut as unknown as CanvasImageSource,
    width: sw,
    height: sh,
    close: () => {
      closed++
    },
    get closedCount() {
      return closed
    },
  } as BakeSlice & { readonly closedCount: number }
}

const hexToRgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function createFakeSurface(width: number, height: number): FakeSurface {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const calls: string[] = []
  let m: Matrix = { ...IDENTITY }
  let fill = '#000000'
  let alpha = 1
  let encoded = 0
  let disposed = 0
  const stack: { m: Matrix; fill: string; alpha: number }[] = []
  /*
   * مسارٌ بأبسط صورة: صناديق فقط.
   *
   * `drawRect` لا تنادي `fillRect` بل `rect()` ثمّ `fill()`. وبلا هذا
   * التتبّع كان `fill()` لا يفعل شيئًا — **فيمرّ اختبار «ما تحت الحجب
   * يُدمَّر» لأن العقدة لم تُرسَم أصلًا**، لا لأنها دُمِّرت. وهو بالضبط
   * صنف الاختبار الذي يُطمئن بلا أن يفحص.
   */
  let path: { x: number; y: number; w: number; h: number }[] = []

  /** يحوّل نقطة بالمصفوفة الحالية. */
  const map = (x: number, y: number): readonly [number, number] => [
    m.a * x + m.c * y + m.e,
    m.b * x + m.d * y + m.f,
  ]

  const put = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= width || py >= height) return
    const i = (py * width + px) * 4
    if (a >= 1) {
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
      pixels[i + 3] = 255
      return
    }
    // مزجٌ بسيط — يكفي لكشف «رُسم فوق» من «لم يُرسم».
    pixels[i] = pixels[i]! * (1 - a) + r * a
    pixels[i + 1] = pixels[i + 1]! * (1 - a) + g * a
    pixels[i + 2] = pixels[i + 2]! * (1 - a) + b * a
    pixels[i + 3] = Math.max(pixels[i + 3]!, Math.round(a * 255))
  }

  const ctx: Ctx2D = {
    save: () => {
      stack.push({ m: { ...m }, fill, alpha })
    },
    restore: () => {
      const top = stack.pop()
      if (top) {
        m = top.m
        fill = top.fill
        alpha = top.alpha
      }
    },
    setTransform: (a, b, c, d, e, f) => {
      m = { a, b, c, d, e, f }
    },
    translate: (x, y) => {
      m = { ...m, e: m.e + m.a * x + m.c * y, f: m.f + m.b * x + m.d * y }
    },
    scale: (x, y) => {
      m = { ...m, a: m.a * x, b: m.b * x, c: m.c * y, d: m.d * y }
    },
    rotate: () => undefined,
    clearRect: (x, y, w, h) => {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const [px, py] = map(x + i, y + j)
          const k = (Math.round(py) * width + Math.round(px)) * 4
          if (k >= 0 && k + 3 < pixels.length) pixels.fill(0, k, k + 4)
        }
      }
    },
    fillRect: (x, y, w, h) => {
      calls.push(`fillRect:${x},${y},${w},${h}`)
      const [r, g, b] = hexToRgb(typeof fill === 'string' ? fill : '#000000')
      // يُمسَح بخطوة نصف بكسل كي لا تبقى ثقوب عند التكبير.
      for (let j = 0; j < h; j += 0.5) {
        for (let i = 0; i < w; i += 0.5) {
          const [px, py] = map(x + i, y + j)
          put(px, py, r, g, b, alpha)
        }
      }
    },
    drawImage: (...args: unknown[]) => {
      const src = args[0] as FakeImage
      calls.push(`drawImage:${args.length}`)
      if (args.length === 5) {
        const [, dx, dy, dw, dh] = args as [unknown, number, number, number, number]
        const kx = src.width / dw
        const ky = src.height / dh
        for (let j = 0; j < dh; j++) {
          for (let i = 0; i < dw; i++) {
            const sx = Math.min(src.width - 1, Math.floor(i * kx))
            const sy = Math.min(src.height - 1, Math.floor(j * ky))
            const k = (sy * src.width + sx) * 4
            const [px, py] = map(dx + i, dy + j)
            put(px, py, src.data[k]!, src.data[k + 1]!, src.data[k + 2]!, src.data[k + 3]! / 255)
          }
        }
      }
    },
    beginPath: () => {
      path = []
    },
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    bezierCurveTo: () => undefined,
    // الدائرة تُقرَّب بصندوقها المحيط — يكفي لإثبات «رُسم» و«فوق ما».
    arc: (x, y, r) => {
      path.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 })
    },
    ellipse: (x, y, rx, ry) => {
      path.push({ x: x - rx, y: y - ry, w: rx * 2, h: ry * 2 })
    },
    rect: (x, y, w, h) => {
      path.push({ x, y, w, h })
    },
    roundRect: (x, y, w, h) => {
      path.push({ x, y, w, h })
    },
    clip: () => undefined,
    fill: () => {
      const [r, g, b] = hexToRgb(typeof fill === 'string' ? fill : '#000000')
      for (const box of path) {
        for (let j = 0; j < box.h; j += 0.5) {
          for (let i = 0; i < box.w; i += 0.5) {
            const [px, py] = map(box.x + i, box.y + j)
            put(px, py, r, g, b, alpha)
          }
        }
      }
    },
    stroke: () => undefined,
    setLineDash: () => undefined,
    fillText: () => undefined,
    strokeText: () => undefined,
    measureText: () => ({ width: 0 }) as TextMetrics,
    get fillStyle() {
      return fill
    },
    set fillStyle(v: string | CanvasGradient | CanvasPattern) {
      fill = typeof v === 'string' ? v : '#000000'
    },
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDashOffset: 0,
    get globalAlpha() {
      return alpha
    },
    set globalAlpha(v: number) {
      alpha = v
    },
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '',
    direction: 'rtl',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    filter: 'none',
    imageSmoothingEnabled: true,
  }

  return {
    ctx,
    pixels,
    width,
    height,
    calls,
    get encoded() {
      return encoded
    },
    get disposed() {
      return disposed
    },
    getImageData: (x, y, w, h) => {
      const out = new Uint8ClampedArray(w * h * 4)
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const sx = x + i
          const sy = y + j
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          const from = (sy * width + sx) * 4
          const to = (j * w + i) * 4
          out[to] = pixels[from]!
          out[to + 1] = pixels[from + 1]!
          out[to + 2] = pixels[from + 2]!
          out[to + 3] = pixels[from + 3]!
        }
      }
      return new ImageData(out, w, h)
    },
    putImageData: (d, x, y) => {
      for (let j = 0; j < d.height; j++) {
        for (let i = 0; i < d.width; i++) {
          const dx = x + i
          const dy = y + j
          if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue
          const from = (j * d.width + i) * 4
          const to = (dy * width + dx) * 4
          pixels[to] = d.data[from]!
          pixels[to + 1] = d.data[from + 1]!
          pixels[to + 2] = d.data[from + 2]!
          pixels[to + 3] = d.data[from + 3]!
        }
      }
    },
    alive: () => width > 0 && height > 0,
    encodeTarget: {
      convertToBlob: () => {
        encoded++
        // البايتات هي بكسلات السطح — يكفي لمقارنة تفاضلية.
        return Promise.resolve(new Blob([new Uint8ClampedArray(pixels)], { type: 'image/png' }))
      },
    },
    dispose: () => {
      disposed++
    },
  }
}
