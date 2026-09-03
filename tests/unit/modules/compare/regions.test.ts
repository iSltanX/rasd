import { describe, expect, it } from 'vitest'

import { groupDiffRegions } from '@/modules/compare/regions'

const W = 20
const H = 20

function emptyMask(): Uint8Array {
  return new Uint8Array(W * H)
}

function fillRect(mask: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) mask[(y + dy) * W + (x + dx)] = 1
}

describe('groupDiffRegions — أنماط معروفة', () => {
  it('عنقودان منفصلان بمسافة كبيرة ← منطقتان بمستطيلين صحيحين، بترتيب راستر', () => {
    const mask = emptyMask()
    fillRect(mask, 2, 2, 3, 3) // أعلى-يسار: مستطيل 3×3 عند (2,2)
    fillRect(mask, 14, 14, 4, 2) // أسفل-يمين: مستطيل 4×2 عند (14,14)

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })

    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 2, y: 2, width: 3, height: 3 },
      pixels: 9,
    })
    expect(regions[1]).toMatchObject({
      id: 2,
      rect: { space: 'device', x: 14, y: 14, width: 4, height: 2 },
      pixels: 8,
    })
  })

  it('عنقودان متقاربان يندمجان في منطقة واحدة بعد الانتفاخ', () => {
    const mask = emptyMask()
    fillRect(mask, 2, 2, 2, 2) // (2,2)-(3,3)
    fillRect(mask, 6, 2, 2, 2) // (6,2)-(7,3) — فجوة عمودها عمودان (4 و5) بين العنقودين

    const separate = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })
    expect(separate).toHaveLength(2)

    const merged = groupDiffRegions(mask, W, H, { dilate: 3, minPixels: 1 })
    expect(merged).toHaveLength(1)
    expect(merged[0]?.rect).toEqual({ space: 'device', x: 2, y: 2, width: 6, height: 2 })
    // المساحة المبلَّغة تبقى بكسلات الفرق الحقيقية — 8 لا 12 (مساحة المستطيل المنتفخ).
    expect(merged[0]?.pixels).toBe(8)
  })

  it('minPixels يُسقط الضجيج أحادي البكسل مع إبقاء المناطق الحقيقية', () => {
    const mask = emptyMask()
    mask[5 * W + 5] = 1 // ضجيج معزول، بكسل واحد
    fillRect(mask, 10, 10, 5, 5) // منطقة حقيقية، 25 بكسلًا

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 4 })
    expect(regions).toHaveLength(1)
    expect(regions[0]?.rect).toEqual({ space: 'device', x: 10, y: 10, width: 5, height: 5 })
  })

  it('اتصال ثماني الجهات يدمج تراكب القطر', () => {
    const mask = emptyMask()
    mask[5 * W + 5] = 1
    mask[6 * W + 6] = 1 // متجاور قطريًّا لا أفقيًّا/عموديًّا فقط

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })
    expect(regions).toHaveLength(1)
    expect(regions[0]?.rect).toEqual({ space: 'device', x: 5, y: 5, width: 2, height: 2 })
  })

  it('قناع فارغ أو أبعاد غير متطابقة ← مصفوفة فارغة بلا استثناء', () => {
    expect(groupDiffRegions(new Uint8Array(0), 0, 0)).toEqual([])
    expect(groupDiffRegions(new Uint8Array(5), W, H)).toEqual([])
    expect(groupDiffRegions(emptyMask(), W, H)).toEqual([])
  })
})
