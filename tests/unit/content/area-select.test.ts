import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAreaSelect, DRAG_THRESHOLD, type AreaSelectTool } from '@/content/tools/area-select'
import { viewportRect } from '@/shared/geometry'

/**
 * آلة حالة «تصوير منطقة».
 *
 * الرياضيات مُختبَرة في `modules/capture/selection.test.ts`؛ هنا يُختبَر ما
 * يخصّ التفاعل وحده: متى يصير السحب سحبًا، وماذا يبقى بعد نقرة طائشة، ومتى
 * يُبلَّغ المدير بأننا منشغلون.
 */

const BOUNDS = viewportRect(0, 0, 1000, 800)

/**
 * حدث مؤشِّر مزيَّف.
 *
 * happy-dom لا يطبّق `setPointerCapture`، والأداة تحرسه بـ`try` — فالغياب
 * هنا يحاكي بيئة حقيقية ناقصة الدعم لا حالة مصطنعة.
 */
function pointer(x: number, y: number, over: Partial<PointerEvent> = {}): PointerEvent {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  }
  return {
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    currentTarget: target,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...over,
  } as unknown as PointerEvent
}

let tool: AreaSelectTool
let committed: ReturnType<typeof viewportRect>[]
let busy: boolean[]
let cancelled: number

beforeEach(() => {
  committed = []
  busy = []
  cancelled = 0
  tool = createAreaSelect({
    bounds: () => BOUNDS,
    onCommit: (r) => committed.push(r),
    onCancel: () => {
      cancelled += 1
    },
    onBusy: (b) => busy.push(b),
  })
})

/** سحب كامل: ضغط ← حركة ← رفع. */
function drag(from: [number, number], to: [number, number], type = 'mouse') {
  tool.handlers.onPointerDown(pointer(from[0], from[1], { pointerType: type }))
  tool.handlers.onPointerMove(pointer(to[0], to[1], { pointerType: type }))
  tool.handlers.onPointerUp(pointer(to[0], to[1], { pointerType: type }))
}

// ─────────────────────────────────────────────────────────────────

describe('السحب الابتدائي', () => {
  it('يبدأ من idle وينتهي إلى ready بتحديد صالح', () => {
    expect(tool.state.phase.value).toBe('idle')
    drag([100, 100], [400, 300])
    expect(tool.state.phase.value).toBe('ready')
    const r = tool.state.rect.value
    expect(r).not.toBeNull()
    expect(r?.width).toBe(300)
    expect(r?.height).toBe(200)
  })

  it('يبلّغ الانشغال عند البدء ويرفعه عند الرفع', () => {
    drag([100, 100], [400, 300])
    expect(busy).toEqual([true, false])
  })

  it('يتجاهل غير الزرّ الأيسر', () => {
    tool.handlers.onPointerDown(pointer(100, 100, { button: 2 }))
    expect(tool.state.phase.value).toBe('idle')
    expect(busy).toEqual([])
  })

  it('يُحصر داخل الحدود ولو خرج المؤشِّر', () => {
    drag([900, 700], [5000, 5000])
    const r = tool.state.rect.value
    expect(r).not.toBeNull()
    expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual(BOUNDS.width)
    expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual(BOUNDS.height)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('نقرة مقابل سحب', () => {
  it(`إزاحة دون ${DRAG_THRESHOLD}px نقرةٌ لا سحب`, () => {
    drag([100, 100], [101, 101])
    expect(tool.state.phase.value).toBe('idle')
    expect(tool.state.rect.value).toBeNull()
  })

  it('نقرة على فراغ **تستعيد** التحديد السابق ولا تمحوه', () => {
    drag([100, 100], [400, 300])
    const before = tool.state.rect.value

    // نقرة بعيدة عن التحديد، بلا حركة تُذكَر.
    tool.handlers.onPointerDown(pointer(800, 700))
    tool.handlers.onPointerUp(pointer(800, 700))

    expect(tool.state.rect.value).toEqual(before)
    expect(tool.state.phase.value).toBe('ready')
  })

  it('سحب فعلي لكنه أصغر من الحدّ الأدنى يستعيد السابق أيضًا', () => {
    drag([100, 100], [400, 300])
    const before = tool.state.rect.value

    // 5px: فوق عتبة السحب ودون الحدّ الأدنى للالتقاط (8px).
    drag([700, 600], [705, 604])

    expect(tool.state.rect.value).toEqual(before)
    expect(tool.state.phase.value).toBe('ready')
  })

  it('العتبة أوسع على اللمس', () => {
    // 5px تتجاوز عتبة الفأرة (3) ولا تتجاوز عتبة اللمس (8).
    drag([100, 100], [104, 104], 'touch')
    expect(tool.state.rect.value).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────

describe('التعديل بعد التحديد', () => {
  beforeEach(() => {
    drag([100, 100], [500, 400])
  })

  it('سحب مقبض يغيّر الحجم ويترك المقابل ثابتًا', () => {
    tool.handlers.onPointerDown(pointer(500, 400), 'se')
    tool.handlers.onPointerMove(pointer(700, 600))
    tool.handlers.onPointerUp(pointer(700, 600))

    const r = tool.state.rect.value
    expect(r?.x).toBe(100)
    expect(r?.y).toBe(100)
    expect(r?.width).toBe(600)
    expect(r?.height).toBe(500)
  })

  it('سحب الجسم ينقل بلا تغيير المقاس', () => {
    tool.handlers.onPointerDown(pointer(300, 250))
    tool.handlers.onPointerMove(pointer(350, 300))
    tool.handlers.onPointerUp(pointer(350, 300))

    const r = tool.state.rect.value
    expect(r?.width).toBe(400)
    expect(r?.height).toBe(300)
    expect(r?.x).toBe(150)
    expect(r?.y).toBe(150)
  })

  it('الأسهم تحرّك التحديد القائم', () => {
    tool.nudge(1, 0)
    expect(tool.state.rect.value?.x).toBe(101)
    tool.nudge(0, -10)
    expect(tool.state.rect.value?.y).toBe(90)
  })

  it('الأسهم لا تفعل شيئًا بلا تحديد', () => {
    tool.reset()
    tool.nudge(5, 5)
    expect(tool.state.rect.value).toBeNull()
  })

  it('النقل يبقى داخل الحدود', () => {
    tool.nudge(10_000, 10_000)
    const r = tool.state.rect.value
    expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual(BOUNDS.width)
    expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual(BOUNDS.height)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('الالتقاط والإلغاء', () => {
  it('يطلب الالتقاط بتحديد صالح', () => {
    drag([100, 100], [400, 300])
    tool.commit()
    expect(committed).toHaveLength(1)
    expect(committed[0]?.width).toBe(300)
  })

  it('لا يطلب الالتقاط بلا تحديد', () => {
    tool.commit()
    expect(committed).toHaveLength(0)
  })

  it('لا يطلب الالتقاط بتحديد أصغر من الحدّ الأدنى', () => {
    // نُجبر تحديدًا صغيرًا مباشرةً — لا يمرّ من مسار السحب.
    tool.state.rect.value = viewportRect(0, 0, 4, 4)
    tool.commit()
    expect(committed).toHaveLength(0)
  })

  it('`reset` يمحو كل شيء ويعود إلى idle', () => {
    drag([100, 100], [400, 300])
    tool.reset()
    expect(tool.state.rect.value).toBeNull()
    expect(tool.state.phase.value).toBe('idle')
    expect(tool.state.constrained.value).toBe(false)
    expect(tool.state.fromCenter.value).toBe(false)
  })

  it('`dispose` يُبلّغ الإلغاء', () => {
    tool.dispose()
    expect(cancelled).toBe(1)
  })

  it('`dispose` أثناء سحب يرفع الانشغال — لا يترك المدير مقفولًا', () => {
    tool.handlers.onPointerDown(pointer(100, 100))
    expect(busy.at(-1)).toBe(true)
    tool.dispose()
    expect(busy.at(-1)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('تثبيت النسبة', () => {
  it('`⇧` أثناء السحب يعطي مربّعًا', () => {
    tool.state.constrained.value = true
    drag([100, 100], [500, 300])
    const r = tool.state.rect.value
    expect(r?.width).toBeCloseTo(r?.height ?? 0, 9)
  })

  it('نسبة الرقاقة تتقدّم على `⇧`', () => {
    tool.state.lockedRatio.value = 2
    tool.state.constrained.value = true
    drag([100, 100], [500, 300])
    const r = tool.state.rect.value
    expect((r?.width ?? 0) / (r?.height ?? 1)).toBeCloseTo(2, 9)
  })

  it('`⌥` يرسم من المركز', () => {
    tool.state.fromCenter.value = true
    drag([400, 300], [500, 380])
    const r = tool.state.rect.value
    expect((r?.x ?? 0) + (r?.width ?? 0) / 2).toBeCloseTo(400, 9)
    expect((r?.y ?? 0) + (r?.height ?? 0) / 2).toBeCloseTo(300, 9)
  })
})
