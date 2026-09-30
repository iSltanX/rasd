import { crc32, deflateSync, inflateSync } from 'node:zlib'

/**
 * مُرمِّز PNG ومفكّكه — أداة اختبار لا شيفرة إنتاج.
 *
 * دورتا التكامل تحتاجان **بايتات صورة حقيقية** تعبر الحدّ: لقطةٌ يرسمها «المتصفّح» (`captureVisibleTab`
 * المقلَّد)، تُقصّ في الخلفية، تُخزَّن، يفتحها المحرّر، ويُصدَّر منها ملفّ — ثمّ يُفكّ الملفّ ويُقرأ
 * بكسله. بلا ترميز حقيقي يصير «الملفّ المُصدَّر» مصفوفةً في الذاكرة لا يُثبَت عنها شيء. و`zlib` من Node
 * يكفي: RGBA بعمق 8، بلا تشذير، وكل المرشّحات الخمسة عند الفكّ.
 */

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface Pixels {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

const u32 = (n: number): Uint8Array => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, n >>> 0)
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(type)
  const body = new Uint8Array(head.length + data.length)
  body.set(head)
  body.set(data, head.length)
  return concat([u32(data.length), body, u32(crc32(body))])
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** RGBA ← PNG. كل سطر بالمرشّح صفر: الحجم لا يهمّ هنا، والبساطة تجعل الفكّ مرآةً مباشرة. */
export function encodePng({ data, width, height }: Pixels): Uint8Array {
  const ihdr = concat([u32(width), u32(height), Uint8Array.from([8, 6, 0, 0, 0])])
  const raw = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  return concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** PNG ← RGBA. يرمي على ما لا يعرفه — ملفٌّ لا يُفكّ ليس نجاحًا ناعمًا. */
export function decodePng(bytes: Uint8Array): Pixels {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('ليس PNG: التوقيع مختلف.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let channels = 0
  const idat: Uint8Array[] = []
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at)
    const type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      const [depth, colour, , , interlace] = data.subarray(8)
      if (depth !== 8 || interlace !== 0 || (colour !== 6 && colour !== 2)) {
        throw new Error(`PNG غير مدعوم: عمق ${String(depth)} ولون ${String(colour)}.`)
      }
      channels = colour === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }

  const raw = inflateSync(concat(idat))
  const stride = width * channels
  const rows = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? rows[y * stride + x - channels]! : 0
      const up = y > 0 ? rows[(y - 1) * stride + x]! : 0
      const diag = y > 0 && x >= channels ? rows[(y - 1) * stride + x - channels]! : 0
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, diag)][filter]
      if (predictor === undefined) throw new Error(`مرشّح PNG مجهول: ${String(filter)}.`)
      rows[y * stride + x] = (line[x]! + predictor) & 0xff
    }
  }

  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = rows[i * channels]!
    out[i * 4 + 1] = rows[i * channels + 1]!
    out[i * 4 + 2] = rows[i * channels + 2]!
    out[i * 4 + 3] = channels === 4 ? rows[i * channels + 3]! : 255
  }
  return { data: out, width, height }
}

/** صورةٌ بنمطٍ معلوم — كل بكسل من دالّته. */
export function paint(
  width: number,
  height: number,
  at: (x: number, y: number) => readonly [number, number, number, number],
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(at(x, y), (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

/** البكسل عند (x, y) أربع قنوات. */
export function pixelOf(img: Pixels, x: number, y: number): readonly number[] {
  const i = (y * img.width + x) * 4
  return [...img.data.subarray(i, i + 4)]
}
