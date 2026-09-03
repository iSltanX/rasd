import { describe, expect, it } from 'vitest'

import { computeDiff, type RasterImage } from '@/modules/compare/diff'

/** صورة صلبة اللون — كل بكسل بنفس القيمة. */
function solid(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { data, width, height }
}

function clone(img: RasterImage): RasterImage {
  return { data: Uint8ClampedArray.from(img.data), width: img.width, height: img.height }
}

function setPixel(
  img: RasterImage,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  img.data.set(rgba, (y * img.width + x) * 4)
}

const WHITE = [255, 255, 255, 255] as const
const BLACK = [0, 0, 0, 255] as const
const GRAY = [100, 100, 100, 255] as const
const RED = [250, 10, 10, 255] as const

describe('computeDiff — الحالات الأساسية من Rasd_Plan.md §17', () => {
  it('صورتان متطابقتان ← 0% اختلاف', () => {
    const a = solid(20, 20, GRAY)
    const b = clone(a)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
    expect(result.comparedPixels).toBe(400)
  })

  it('صورتان متعاكستان (أسود مقابل أبيض) ← 100% اختلاف', () => {
    const a = solid(20, 20, BLACK)
    const b = solid(20, 20, WHITE)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(400)
    expect(result.diffRatio).toBe(1)
  })

  it('فرق بكسل واحد يُكتشف بالعتبة الافتراضية', () => {
    const a = solid(20, 20, GRAY)
    const b = clone(a)
    setPixel(b, 10, 10, RED)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(1)
    expect(result.diffRatio).toBeCloseTo(1 / 400, 6)
    // القناع يطابق موضع الفرق بالضبط — يُغذّي groupDiffRegions بلا انزياح.
    expect(result.mask[10 * 20 + 10]).toBe(1)
    expect(result.mask.filter(Boolean)).toHaveLength(1)
  })

  it('التنعيم (anti-aliasing) لا يُنتج ضجيجًا فوق الحدّ المقبول', () => {
    // حافّة أفقية صلبة: الصفّان 0-2 أبيض، 3-5 أسود، على كلتا الصورتين.
    const edge = (fill: (img: RasterImage) => void): RasterImage => {
      const img = solid(6, 6, WHITE)
      for (let y = 3; y < 6; y++) for (let x = 0; x < 6; x++) setPixel(img, x, y, BLACK)
      fill(img)
      return img
    }
    const a = edge(() => {})
    // في ب وحدها: بكسل واحد بالضبط على الحافّة يتحوّل إلى رمادي متوسّط —
    // بالضبط الشكل الذي يترکه تنعيم عرضي حقيقي، لا فرقًا في المحتوى.
    const b = edge((img) => setPixel(img, 2, 2, GRAY))

    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
  })
})

describe('computeDiff — اختلاف الأبعاد يُعالَج بلا استثناء (محاذاة من الأعلى-اليسار)', () => {
  it('عرضان مختلفان: التقاطع يُقارَن، والفائض يُعلَن في extraInB', () => {
    const a = solid(10, 10, GRAY)
    const b = solid(14, 10, GRAY)
    expect(() => computeDiff(a, b)).not.toThrow()
    const result = computeDiff(a, b)
    expect(result.overlap.width).toBe(10)
    expect(result.overlap.height).toBe(10)
    expect(result.comparedPixels).toBe(100)
    expect(result.extraInA.cols).toBeNull()
    expect(result.extraInB.cols).toEqual({ space: 'device', x: 10, y: 0, width: 4, height: 10 })
    expect(result.extraInB.rows).toBeNull()
  })

  it('ارتفاعان مختلفان: نفس المعالجة على المحور الآخر', () => {
    const a = solid(10, 16, GRAY)
    const b = solid(10, 10, GRAY)
    const result = computeDiff(a, b)
    expect(result.overlap.height).toBe(10)
    expect(result.extraInA.rows).toEqual({ space: 'device', x: 0, y: 10, width: 10, height: 6 })
    expect(result.extraInB.rows).toBeNull()
  })

  it('الأبعاد كلاهما مختلفان: شريطان في كلّ صورة، لا استثناء', () => {
    const a = solid(12, 8, GRAY)
    const b = solid(8, 12, GRAY)
    expect(() => computeDiff(a, b)).not.toThrow()
    const result = computeDiff(a, b)
    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 8, height: 8 })
    expect(result.extraInA.cols).toEqual({ space: 'device', x: 8, y: 0, width: 4, height: 8 })
    expect(result.extraInA.rows).toBeNull()
    expect(result.extraInB.rows).toEqual({ space: 'device', x: 0, y: 8, width: 8, height: 4 })
    expect(result.extraInB.cols).toBeNull()
  })
})
