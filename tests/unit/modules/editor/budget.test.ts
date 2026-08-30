import { describe, expect, it } from 'vitest'

import {
  backingScaleFor,
  BAKE_SLICE_BUDGET_BYTES,
  EDITOR_STAGE_BUDGET_BYTES,
  planExportSurface,
  BAKE_SURFACE_BUDGET_BYTES,
  planStageSurface,
  sliceCountFor,
  sliceHeightFor,
} from '@/modules/editor/budget'
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '@/shared/canvas-limits'

/**
 * الميزانية سياسة مشتقّة، والاختبار يحرس **خصائصها** لا أرقامها: الأرقام
 * تُعاير بقياس حيّ في الدفعة الثالثة، والخصائص لا تتغيّر بالمعايرة.
 */

describe('كثافة مخزن الرسم', () => {
  it('لا تتجاوز كثافة الجهاز مهما اتّسعت الميزانية', () => {
    expect(backingScaleFor(400, 300, 2)).toBe(2)
    expect(backingScaleFor(400, 300, 1)).toBe(1)
  })

  it('تهبط حين يتجاوز المسرح الميزانية — ولا تنزل تحت الواحد', () => {
    // مسرح ضخم عند كثافة 3: الميزانية تحكم لا الجهاز.
    const scale = backingScaleFor(3840, 2160, 3)
    expect(scale).toBeLessThan(3)
    expect(scale).toBeGreaterThanOrEqual(1)
  })

  it('مسرح مستحيل يبقى عند الواحد لا عند كسر', () => {
    expect(backingScaleFor(20000, 20000, 2)).toBe(1)
  })

  it('مسرح بلا مساحة لا يقسم على صفر', () => {
    expect(backingScaleFor(0, 0, 2)).toBe(1)
  })
})

describe('خطّة سطح المسرح', () => {
  it('السطح ضمن الميزانية في الحالة العادية', () => {
    const plan = planStageSurface(1060, 839, 2)
    expect(plan.backingScale).toBe(2)
    expect(plan.bytes).toBeLessThanOrEqual(EDITOR_STAGE_BUDGET_BYTES)
    expect(plan.degraded).toBe(false)
  })

  it('**الانحدار يُعلَن ولا يُخفى**', () => {
    const plan = planStageSurface(3840, 2160, 3)
    expect(plan.degraded).toBe(true)
    expect(plan.bytes).toBeLessThanOrEqual(EDITOR_STAGE_BUDGET_BYTES * 1.02)
  })

  it('لا سطح بصفر بُعد', () => {
    const plan = planStageSurface(0, 0, 2)
    expect(plan.width).toBeGreaterThan(0)
    expect(plan.height).toBeGreaterThan(0)
  })
})

describe('شرائح الخبز', () => {
  it('الشريحة ضمن ميزانيتها', () => {
    const h = sliceHeightFor(2560)
    expect(h * 2560 * 4).toBeLessThanOrEqual(BAKE_SLICE_BUDGET_BYTES)
  })

  it('صورة عادية شريحة واحدة، والحالة القصوى عدّة شرائح', () => {
    expect(sliceCountFor(1440, 900)).toBe(1)
    expect(sliceCountFor(2560, 28_672)).toBeGreaterThan(1)
  })

  it('سطر واحد على الأقلّ مهما بلغ العرض', () => {
    expect(sliceHeightFor(MAX_CANVAS_SIDE)).toBeGreaterThanOrEqual(1)
    expect(sliceHeightFor(0)).toBe(1)
  })
})

describe('خطّة التصدير — الحارس بعد الضرب لا قبله', () => {
  it('لقطة عادية تمرّ عند 1× و2×', () => {
    expect(planExportSurface(4000, 3000, 1).refusal).toBeNull()
    expect(planExportSurface(4000, 3000, 2).refusal).toBeNull()
  })

  it('**الحالة القصوى تمرّ عند 1× وتُرفَض عند 2× — بالمساحة لا بالضلع**', () => {
    const one = planExportSurface(2560, 28_672, 1)
    expect(one.refusal).toBeNull()

    const two = planExportSurface(2560, 28_672, 2)
    expect(two.refusal).toBe('oversized')
    // الضلع يمرّ… والمساحة هي التي تمسك. لو فُحص الضلع وحده لمرّ الاثنان.
    expect(two.height).toBeLessThanOrEqual(MAX_CANVAS_SIDE)
    expect(two.width * two.height).toBeGreaterThan(MAX_CANVAS_AREA)
  })

  it('الرفض يحمل سببًا معروضًا لا صمتًا', () => {
    expect(planExportSurface(2560, 28_672, 2).refusal).toBe('oversized')
  })

  it('**والسبب مفصَّل لا مجموع** — الحالة القصوى تُمسَك بالمساحة لا بالضلع', () => {
    // 5120×57,344: الضلع 57,344 ≤ 65,535 فيمرّ، والمساحة 293.6M > 268.4M تمسك.
    expect(planExportSurface(2560, 28_672, 2).bound).toBe('area')
    expect(planExportSurface(2560, 28_672, 1).bound).toBe('none')
  })

  it('**وحدود المنصّة وحدها لا تكفي** — 8000×6000 عند 2× تمرّ منها وتُرفَض بالميزانية', () => {
    const plan = planExportSurface(8000, 6000, 2)
    // 16,000×12,000 = 192 مليون بكسل، تحت سقف المساحة (268 مليون)…
    expect(plan.width * plan.height).toBeLessThan(268_435_456)
    // …وسطحها 732 ميغابايت، أي ضِعف سقف المرحلة.
    expect(plan.bytes).toBeGreaterThan(BAKE_SURFACE_BUDGET_BYTES)
    expect(plan.bound).toBe('budget')
  })

  it('وضلعٌ فوق الحدّ يُمسَك بالضلع لا بالمساحة', () => {
    // 70,000×10: المساحة 700 ألف فقط، والضلع وحده هو المانع.
    expect(planExportSurface(70_000, 10, 1).bound).toBe('side')
  })

  it('والميزانية تسع الحالة القصوى عند 1× بالضبط', () => {
    const plan = planExportSurface(2560, 28_672, 1)
    expect(plan.bytes).toBe(BAKE_SURFACE_BUDGET_BYTES)
    expect(plan.bound).toBe('none')
  })
})
