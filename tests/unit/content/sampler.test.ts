import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampler, type Sampler } from '@/content/sampler'
import { ok } from '@/shared/result'

vi.mock('@/shared/messaging', () => ({
  send: vi.fn(() => Promise.resolve(ok({ dataUrl: 'data:image/png;base64,AAAA' }))),
}))

/**
 * المسار الحقيقي — `ImageDecoder` و`createImageBitmap` و`OffscreenCanvas` — غير
 * موجود في happy-dom، فتُحقَن بدائل تعطي **الصورة نفسها**. والمفحوص هو القرار:
 * من أين تُقرأ البايتات، ومتى يُترك الفكّ بلا قماش، وأن المسارين يعطيان البايتات
 * نفسها. أمّا أن Brave لا يموّه `ImageDecoder` فقياسٌ في متصفّح حقيقي يقوم به
 * حارس `colour` (`CHROME_PATH=<Brave> pnpm verify:wave --only colour`).
 */

const W = 4
const H = 3
/** صورة عيّنة: بكسلاتها فريدة فلا يخطئ فهرسٌ منزاح دون أن يظهر. */
const IMAGE = new Uint8Array(W * H * 4).map((_, i) => (i * 37 + 11) % 256)

const rgba = (ix: number, iy: number) => {
  const at = (iy * W + ix) * 4
  return { r: IMAGE[at]!, g: IMAGE[at + 1]!, b: IMAGE[at + 2]!, a: IMAGE[at + 3]! }
}

const closed = { image: 0, decoder: 0, bitmap: 0 }
const canvasMade = vi.fn()
const canvasReads = vi.fn()

/** إعداد `ImageDecoder` البديل: يعطي الصورة، أو يرمي، أو يعطي صفًّا محشوًّا. */
let decoderMode: 'ok' | 'throws' | 'padded' = 'ok'

class FakeImageDecoder {
  decode() {
    if (decoderMode === 'throws') return Promise.reject(new Error('unsupported'))
    const padded = decoderMode === 'padded'
    return Promise.resolve({
      image: {
        codedWidth: W,
        codedHeight: H,
        allocationSize: () => (padded ? W * H * 4 + 16 : W * H * 4),
        copyTo: (dest: Uint8Array) => {
          dest.set(IMAGE)
          return Promise.resolve([])
        },
        close: () => closed.image++,
      },
    })
  }
  close() {
    closed.decoder++
  }
}

class FakeOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    canvasMade()
  }
  getContext() {
    return {
      drawImage: () => {},
      getImageData: (x: number, y: number, w: number, h: number) => {
        canvasReads()
        const out = new Uint8ClampedArray(w * h * 4)
        for (let row = 0; row < h; row++) {
          const from = ((y + row) * W + x) * 4
          out.set(IMAGE.subarray(from, from + w * 4), row * w * 4)
        }
        return { data: out }
      },
    }
  }
}

const win = { innerWidth: W, innerHeight: H } as Window

async function sampler(): Promise<Sampler> {
  const s = createSampler({ win })
  const frame = await s.refresh()
  expect(frame.ok).toBe(true)
  return s
}

beforeEach(() => {
  closed.image = closed.decoder = closed.bitmap = 0
  canvasMade.mockClear()
  canvasReads.mockClear()
  decoderMode = 'ok'
  vi.stubGlobal('ImageDecoder', FakeImageDecoder)
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: W, height: H, close: () => closed.bitmap++ })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sampler — فكّ بلا قماش حين تتوفّر ImageDecoder', () => {
  it('يقرأ كل بكسلٍ من البايتات الخام ولا ينشئ قماشًا ولا يقرأ منه', async () => {
    const s = await sampler()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) expect(s.pixelAt(x, y)).toEqual(rgba(x, y))
    }
    expect(canvasMade).not.toHaveBeenCalled()
    expect(canvasReads).not.toHaveBeenCalled()
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('يحرّر الصورة والمفكِّك بعد القراءة', async () => {
    await sampler()
    expect(closed).toEqual({ image: 1, decoder: 1, bitmap: 0 })
  })

  it('خارج الحدود: null لا بكسلٌ مجاور', async () => {
    const s = await sampler()
    expect(s.pixelAt(-1, 0)).toBeNull()
    expect(s.pixelAt(0, -1)).toBeNull()
    expect(s.pixelAt(W, 0)).toBeNull()
    expect(s.pixelAt(0, H)).toBeNull()
  })
})

describe('sampler — المسار الخام والقماش يعطيان البايتات نفسها', () => {
  const collect = (s: Sampler) => {
    const px = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.push(s.pixelAt(x, y))
    return { px, patch: s.patchAt(1, 1, 3), frame: { ...s.frame()!, at: 0 } }
  }

  it('البكسل والرقعة والإطار', async () => {
    const viaDecoder = collect(await sampler())
    vi.stubGlobal('ImageDecoder', undefined)
    const viaCanvas = collect(await sampler())
    expect(canvasMade).toHaveBeenCalledTimes(1)
    expect(viaCanvas).toEqual(viaDecoder)
  })

  it('رقعة على الحافّة: خلايا خارج الصورة شفّافة والشبكة متمركزة في المسارين', async () => {
    const edge = async () => (await sampler()).patchAt(0, 0, 3)
    const a = await edge()
    vi.stubGlobal('ImageDecoder', undefined)
    const b = await edge()
    expect(a).toEqual(b)
    expect(a?.[0]).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(a?.[4]).toEqual(rgba(0, 0))
  })
})

describe('sampler — العودة إلى القماش', () => {
  it('ImageDecoder غير متاحة (Firefox)', async () => {
    vi.stubGlobal('ImageDecoder', undefined)
    const s = await sampler()
    expect(s.pixelAt(2, 1)).toEqual(rgba(2, 1))
    expect(canvasMade).toHaveBeenCalledTimes(1)
  })

  it('الفكّ يرمي — القماش لا يُسقط الأداة', async () => {
    decoderMode = 'throws'
    const s = await sampler()
    expect(s.pixelAt(3, 2)).toEqual(rgba(3, 2))
    expect(canvasMade).toHaveBeenCalledTimes(1)
    expect(closed.decoder).toBe(1)
  })

  it('صفّ محشوّ (الطول لا يطابق العرض×الارتفاع×4): لا فهرسة منزاحة، بل القماش', async () => {
    decoderMode = 'padded'
    const s = await sampler()
    expect(s.pixelAt(1, 2)).toEqual(rgba(1, 2))
    expect(canvasMade).toHaveBeenCalledTimes(1)
    expect(closed.image).toBe(1)
  })
})

describe('sampler — الإغلاق', () => {
  it('dispose يُسقط اللقطة', async () => {
    const s = await sampler()
    s.dispose()
    expect(s.frame()).toBeNull()
    expect(s.pixelAt(0, 0)).toBeNull()
  })
})
