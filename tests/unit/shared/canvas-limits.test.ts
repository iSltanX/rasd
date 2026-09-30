import { describe, expect, it } from 'vitest'

import {
  canvasBytes,
  CANVAS_BYTES_PER_PIXEL,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  withinCanvasLimits,
} from '@/shared/canvas-limits'

/**
 * حدود `OffscreenCanvas` — أرقامٌ مقيسة، والحارس قبل التخصيص.
 *
 * تجاوزها **لا يرمي**: يُرجع Chrome سياقًا صالحًا ثم يعطي أصفارًا عند القراءة.
 * فالدالّة هي الحاجز الوحيد قبل أن «ينجح» حفظ صورة فارغة، وكل فرع فيها
 * يصدّ صنفًا مختلفًا من المدخلات.
 */

describe('withinCanvasLimits — القبول', () => {
  it('الأبعاد المعتادة مقبولة', () => {
    expect(withinCanvasLimits(1920, 1080)).toBe(true)
    expect(withinCanvasLimits(1, 1)).toBe(true)
  })

  it('الضلع الأقصى المقيس مقبول أفقيًّا ورأسيًّا حين تسمح المساحة', () => {
    // 65535×4096 ≈ 268.4M ← أقلّ من الحدّ بقليل: الضلع وحده على حافته.
    expect(withinCanvasLimits(MAX_CANVAS_SIDE, 4096)).toBe(true)
    expect(withinCanvasLimits(4096, MAX_CANVAS_SIDE)).toBe(true)
  })

  it('المساحة القصوى المقيسة تُقبَل بأي تركيبة ضلعين تبلغها', () => {
    // مقيس: 16384×16384 يعمل، و8192×32768 يعمل — الحدّ مساحةٌ والضلعان يتقايضان.
    expect(withinCanvasLimits(16_384, 16_384)).toBe(true)
    expect(withinCanvasLimits(8_192, 32_768)).toBe(true)
    expect(16_384 * 16_384).toBe(MAX_CANVAS_AREA)
  })
})

describe('withinCanvasLimits — الرفض', () => {
  it.each([
    ['NaN عرضًا', Number.NaN, 100],
    ['NaN ارتفاعًا', 100, Number.NaN],
    ['ما لا نهاية عرضًا', Number.POSITIVE_INFINITY, 100],
    ['ما لا نهاية ارتفاعًا', 100, Number.NEGATIVE_INFINITY],
  ])('قيمة غير منتهية (%s) مرفوضة قبل أي مقارنة', (_label, w, h) => {
    // بلا هذا الفحص تمرّ NaN من كل مقارنة لأن `NaN > x` خاطئة دائمًا.
    expect(withinCanvasLimits(w, h)).toBe(false)
  })

  it.each([
    ['صفر عرضًا', 0, 100],
    ['صفر ارتفاعًا', 100, 0],
    ['سالب عرضًا', -1, 100],
    ['سالب ارتفاعًا', 100, -1],
    ['سالبان معًا (حاصلهما موجب)', -10, -10],
  ])('بُعد غير موجب (%s) مرفوض', (_label, w, h) => {
    expect(withinCanvasLimits(w, h)).toBe(false)
  })

  it('ضلعٌ فوق الحدّ مرفوض ولو صغرت المساحة', () => {
    // 65536×1 مساحته صغيرة جدًّا — فالضلع وحده هو ما يُسقطه. مقيس: 65,536 يعطي قماشًا ميّتًا.
    expect(withinCanvasLimits(MAX_CANVAS_SIDE + 1, 1)).toBe(false)
    expect(withinCanvasLimits(1, MAX_CANVAS_SIDE + 1)).toBe(false)
  })

  it('المساحة فوق الحدّ مرفوضة ولو لم يتجاوز ضلعٌ حدّه', () => {
    // مقيس: 16384×16385 يموت، و8192×32769 يموت.
    expect(withinCanvasLimits(16_384, 16_385)).toBe(false)
    expect(withinCanvasLimits(8_192, 32_769)).toBe(false)
    expect(withinCanvasLimits(MAX_CANVAS_SIDE, MAX_CANVAS_SIDE)).toBe(false)
  })
})

describe('canvasBytes', () => {
  it('أربعة بايتات للبكسل RGBA', () => {
    expect(CANVAS_BYTES_PER_PIXEL).toBe(4)
    expect(canvasBytes(10, 20)).toBe(800)
  })

  it('لا يقصّ ولا يعتمد على الحدود — يحسب ما يُطلَب', () => {
    expect(canvasBytes(16_384, 16_384)).toBe(MAX_CANVAS_AREA * 4)
    expect(canvasBytes(0, 500)).toBe(0)
  })
})
