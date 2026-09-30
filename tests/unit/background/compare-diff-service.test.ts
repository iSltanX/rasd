/**
 * اختزال الفرق الحيّ — الجزء الذي يمكن أن ينحرف.
 *
 * فكّ البايتات (`decode`) يحتاج `OffscreenCanvas` الغائب عن بيئة الاختبار،
 * ولهذا فُصل الاختزال في `summariseDiff` ليُختبَر. وما يُختبَر هنا ليس أن
 * `computeDiff` صحيحة — لها اختباراتها — بل أن **الوصل** بينها وبين ما
 * تعرضه الطبقة صحيح: الاتّجاه، والمقام، ومصدر عدّ المناطق.
 */
import { describe, expect, it } from 'vitest'

import { summariseDiff } from '@/background/compare-diff-service'
import { deviceRect } from '@/shared/geometry'

import type { RasterImage } from '@/modules/compare/diff'

/** صورة صمّاء بلون واحد. */
function solid(width: number, height: number, rgb: readonly [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** يرسم مستطيلًا مصمتًا داخل صورة قائمة. */
function paint(
  img: RasterImage,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: readonly [number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(img.data)
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const i = (row * img.width + col) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
  }
  return { data, width: img.width, height: img.height }
}

const WHITE = [255, 255, 255] as const
const BLACK = [0, 0, 0] as const

describe('summariseDiff', () => {
  it('صورتان متطابقتان: صفر فرق وصفر مناطق وبلا اختلاف مقاس', () => {
    const img = solid(40, 30, WHITE)
    const out = summariseDiff(img, img)
    expect(out.diffRatio).toBe(0)
    expect(out.regionCount).toBe(0)
    expect(out.sizeMismatch).toBe(false)
    expect(out.comparedPixels).toBe(40 * 30)
  })

  it('صورتان متعاكستان تمامًا: كل بكسل مختلف', () => {
    const out = summariseDiff(solid(20, 20, WHITE), solid(20, 20, BLACK))
    expect(out.diffRatio).toBe(1)
    expect(out.comparedPixels).toBe(400)
  })

  it('رقعتان متباعدتان تُعدّان منطقتين لا واحدة', () => {
    const base = solid(100, 60, WHITE)
    const live = paint(paint(base, 5, 5, 10, 10, BLACK), 70, 40, 10, 10, BLACK)
    const out = summariseDiff(base, live)
    expect(out.regionCount).toBe(2)
    expect(out.diffRatio).toBeCloseTo(200 / 6000, 6)
  })

  it('اختلاف المقاس يُعلَن، والنسبة تُحسب على التقاطع لا على الكلّ', () => {
    // مرجع 100×60 وصفحة 100×120: التقاطع 100×60، ورقعة 10×10 داخله.
    const reference = solid(100, 60, WHITE)
    const live = paint(solid(100, 120, WHITE), 5, 5, 10, 10, BLACK)
    const out = summariseDiff(reference, live)
    expect(out.sizeMismatch).toBe(true)
    expect(out.overlapWidth).toBe(100)
    expect(out.overlapHeight).toBe(60)
    expect(out.comparedPixels).toBe(6000)
    expect(out.diffRatio).toBeCloseTo(100 / 6000, 6)
  })

  it('المقاس نفسه بأبعاد مختلفة الترتيب يُعَدّ اختلافًا — لا تساهل بالمساحة', () => {
    const out = summariseDiff(solid(40, 30, WHITE), solid(30, 40, WHITE))
    expect(out.sizeMismatch).toBe(true)
    expect(out.overlapWidth).toBe(30)
    expect(out.overlapHeight).toBe(30)
  })

  it('التغيير خارج التقاطع لا يُحتسب فرقًا — يبقى شريطًا غير مُقارَن', () => {
    // الفرق كلّه في الصفّ 60→119 من الصفحة، وهو خارج تقاطع المرجع (60 صفًّا).
    const reference = solid(100, 60, WHITE)
    const live = paint(solid(100, 120, WHITE), 0, 70, 100, 40, BLACK)
    const out = summariseDiff(reference, live)
    expect(out.diffRatio).toBe(0)
    expect(out.regionCount).toBe(0)
    expect(out.sizeMismatch).toBe(true)
  })

  it('عدّ المناطق مأخوذ من قناع التقاطع — لا يسقط صامتًا عند اختلاف المقاس', () => {
    // الانحراف الذي يحرسه هذا التأكيد: لو مُرِّر مقاس المرجع بدل التقاطع
    // لاختلف طول القناع فأرجعت `groupDiffRegions` صفرًا صامتًا.
    const reference = solid(200, 50, WHITE)
    const live = paint(solid(80, 50, WHITE), 10, 10, 20, 20, BLACK)
    const out = summariseDiff(reference, live)
    expect(out.overlapWidth).toBe(80)
    expect(out.regionCount).toBe(1)
  })
})

describe('summariseDiff — المناطق المستثناة (ADR 0034)', () => {
  // مرجعٌ أبيض، والصفحة الحيّة فيها «ساعة» سوداء 20×10 عند (5,5) وحدها.
  const reference = solid(60, 40, WHITE)
  const live = paint(solid(60, 40, WHITE), 5, 5, 20, 10, BLACK)

  it('ساعةٌ داخل منطقة مستثناة ⟵ النسبة صفر، ولا عناصر تحرّكت، والمستثنى معلَن', () => {
    const out = summariseDiff(reference, live, [deviceRect(0, 0, 30, 20)])
    expect(out.diffRatio).toBe(0)
    expect(out.regionCount).toBe(0)
    expect(out.excludedPixels).toBe(600)
    expect(out.excludedZones).toBe(1)
    expect(out.comparedPixels).toBe(2400 - 600)
  })

  it('والقناع نفسه معطَّلًا يعدّ الساعة — وهي الحالة التي يسقط عليها `verify:compare`', () => {
    const out = summariseDiff(reference, live)
    expect(out.diffRatio).toBeCloseTo(200 / 2400, 6)
    expect(out.regionCount).toBe(1)
    expect(out.excludedPixels).toBe(0)
    expect(out.excludedZones).toBe(0)
  })
})
