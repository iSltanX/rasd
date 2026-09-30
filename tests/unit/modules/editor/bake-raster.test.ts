import { describe, expect, it } from 'vitest'

import { bakeRaster } from '@/modules/editor/bake'

import { createFakeSurface, image, sliceOf } from '../../../helpers/fake-surface'

/**
 * `bakeRaster` — مصدرٌ نقطيٌّ بلا مشهد يخرج من البوّابة نفسها.
 *
 * صفحة نصّ في PDF، وصورة فرق المقارنة: لا عُقد تُرسم ولا حجب يُطبَّق، لكنها **بكسلات تغادر الإضافة** — فتمرّ
 * من موضع الترميز الواحد لا من `convertToBlob` ثانٍ في الصفحة (ADR 0015 §2). والاختبار يُثبت أن الطريق
 * لا يُضيف شيئًا ولا يُسقط شيئًا: البايتات المُرمَّزة هي المصدر نفسه، شريحةً شريحة.
 */

const W = 48
const H = 30
const src = image(W, H, (x, y) => [(x * 5) % 256, (y * 9) % 256, (x + y) % 256, 255])

describe('bakeRaster', () => {
  it('يُرمِّز المصدر كما هو — لا عقدة تُرسم فوقه ولا بكسل يتغيّر', async () => {
    const surface = createFakeSurface(W, H)
    const result = await bakeRaster({
      width: W,
      height: H,
      format: 'png',
      surface: { create: () => surface },
      sliceSource: (r) => Promise.resolve(sliceOf(src, r.x, r.y, r.width, r.height)),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Buffer.from(surface.pixels).equals(Buffer.from(src.data))).toBe(true)
    expect(surface.encoded).toBe(1)
    expect(result.value.report).toMatchObject({
      width: W,
      height: H,
      format: 'png',
      obscured: [],
      warnings: [],
      reencoded: true,
    })
  })

  it('ويرفض ما يرفضه الخبز: سطحٌ لا يُخصَّص يُعلَن لا يُبتلع', async () => {
    const result = await bakeRaster({
      width: W,
      height: H,
      format: 'png',
      surface: { create: () => null },
      sliceSource: (r) => Promise.resolve(sliceOf(src, r.x, r.y, r.width, r.height)),
    })
    expect(result.ok).toBe(false)
  })

  it('ويحترم الإلغاء', async () => {
    const result = await bakeRaster({
      width: W,
      height: H,
      format: 'png',
      surface: { create: () => createFakeSurface(W, H) },
      sliceSource: (r) => Promise.resolve(sliceOf(src, r.x, r.y, r.width, r.height)),
      signal: { aborted: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('cancelled')
  })
})
