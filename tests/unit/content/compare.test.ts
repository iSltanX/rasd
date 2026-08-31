/**
 * أداة المقارنة — الحالة والتفاعل. رياضيات التحويل مُختبَرة في
 * `modules/compare/overlay.test.ts`؛ هنا يُختبَر ما يربطها بالمؤشِّر
 * ولوحة المفاتيح والتمرير.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCompare, type CompareTool, type ReferenceImage } from '@/content/tools/compare'

const REF: ReferenceImage = { url: 'blob:ref', naturalWidth: 1200, naturalHeight: 800 }

function pointer(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y } as PointerEvent
}

function wheel(
  x: number,
  y: number,
  deltaY: number,
  preventDefault: () => void = vi.fn(),
): WheelEvent {
  return { clientX: x, clientY: y, deltaY, preventDefault } as unknown as WheelEvent
}

function makeTool(overrides: Partial<Parameters<typeof createCompare>[0]> = {}): CompareTool {
  return createCompare({ win: window, onBusy: vi.fn(), ...overrides })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setReference', () => {
  it('يبدأ بتحويل محايد', () => {
    const tool = makeTool()
    tool.setReference(REF)
    expect(tool.state.reference.value).toEqual(REF)
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 0, ty: 0, rotation: 0 })
  })

  it('null يمسح المرجع ويعيد التحويل محايدًا', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(50, 50))
    tool.setReference(null)
    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.transform.value.tx).toBe(0)
  })
})

describe('السحب', () => {
  it('لا مرجع بعد: السحب لا يفعل شيئًا', () => {
    const tool = makeTool()
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(50, 50))
    expect(tool.state.transform.value.tx).toBe(0)
  })

  it('سحب من (10,10) إلى (60,45) يزيح بمقدار الدلتا بالضبط', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(10, 10))
    tool.onPointerMove(pointer(60, 45))
    expect(tool.state.transform.value.tx).toBe(50)
    expect(tool.state.transform.value.ty).toBe(35)
  })

  it('onBusy(true) عند بدء السحب، و(false) عند رفع المؤشِّر', () => {
    const onBusy = vi.fn()
    const tool = makeTool({ onBusy })
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    expect(onBusy).toHaveBeenLastCalledWith(true)
    tool.onPointerUp()
    expect(onBusy).toHaveBeenLastCalledWith(false)
  })

  it('حركة بعد رفع المؤشِّر لا تُحرِّك شيئًا', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerUp()
    tool.onPointerMove(pointer(100, 100))
    expect(tool.state.transform.value.tx).toBe(0)
  })
})

describe('عجلة الفأرة — تكبير نحو المؤشِّر', () => {
  it('تمرير سالب (بعيدًا عن المستخدم) يكبِّر', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onWheel(wheel(100, 100, -100))
    expect(tool.state.transform.value.scale).toBeGreaterThan(1)
  })

  it('تمرير موجب (نحو المستخدم) يصغِّر', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onWheel(wheel(100, 100, 100))
    expect(tool.state.transform.value.scale).toBeLessThan(1)
  })

  it('التحجيم محدود بسقفٍ أعلى وأدنى', () => {
    const tool = makeTool()
    tool.setReference(REF)
    for (let i = 0; i < 200; i++) tool.onWheel(wheel(0, 0, -1000))
    expect(tool.state.transform.value.scale).toBeLessThanOrEqual(50)

    tool.setReference(REF)
    for (let i = 0; i < 200; i++) tool.onWheel(wheel(0, 0, 1000))
    expect(tool.state.transform.value.scale).toBeGreaterThanOrEqual(0.02)
  })

  it('لا مرجع: العجلة لا تفعل شيئًا ولا تستدعي preventDefault', () => {
    const tool = makeTool()
    const preventDefault = vi.fn()
    tool.onWheel(wheel(0, 0, -100, preventDefault))
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tool.state.transform.value.scale).toBe(1)
  })
})

describe('nudge', () => {
  it('يزيح بالدلتا المُمرَّرة مباشرة — الاستدعاء يحسب الخطوة لا هذا الملفّ', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.nudge(10, 0)
    tool.nudge(0, -1)
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 10, ty: -1, rotation: 0 })
  })
})

describe('matchWidth', () => {
  it('يحسب التحجيم الصحيح ويُبقي الزاوية العلوية اليسرى في مكانها', () => {
    const tool = makeTool()
    tool.setReference(REF) // عرض طبيعي 1200
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(20, 30)) // إزاحة أوّلية قبل المطابقة
    tool.onPointerUp()

    const before = tool.state.transform.value
    const topLeftBefore = { x: before.tx, y: before.ty } // مرجع (0,0) بلا دوران = (tx,ty) مباشرة

    tool.matchWidth(600) // 600/1200 = 0.5
    const after = tool.state.transform.value
    expect(after.scale).toBeCloseTo(0.5, 10)
    expect(after.tx).toBeCloseTo(topLeftBefore.x, 6)
    expect(after.ty).toBeCloseTo(topLeftBefore.y, 6)
  })

  it('لا مرجع: لا يفعل شيئًا', () => {
    const tool = makeTool()
    tool.matchWidth(600)
    expect(tool.state.transform.value.scale).toBe(1)
  })
})

describe('أنماط العرض والإعدادات', () => {
  it('setDisplayMode يقبل الأنماط الأربعة', () => {
    const tool = makeTool()
    for (const m of ['blink', 'opacity', 'blend', 'split'] as const) {
      tool.setDisplayMode(m)
      expect(tool.state.displayMode.value).toBe(m)
    }
  })

  it('setOpacity وsetSplitPosition يُحصَران بين 0 و100', () => {
    const tool = makeTool()
    tool.setOpacity(150)
    expect(tool.state.opacity.value).toBe(100)
    tool.setOpacity(-20)
    expect(tool.state.opacity.value).toBe(0)
    tool.setSplitPosition(200)
    expect(tool.state.splitPosition.value).toBe(100)
  })

  it('togglePinned يعكس القيمة، والافتراضي true', () => {
    const tool = makeTool()
    expect(tool.state.pinned.value).toBe(true)
    tool.togglePinned()
    expect(tool.state.pinned.value).toBe(false)
  })
})

describe('التثبيت أثناء التمرير — frame()', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('مثبَّت (الافتراضي): التمرير لا يُحرِّك التحويل', () => {
    const tool = makeTool()
    tool.setReference(REF)
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    tool.frame(new Set(['scroll']))
    expect(tool.state.transform.value.ty).toBe(0)
  })

  it('غير مثبَّت: يتحرّك بعكس دلتا التمرير كي يبقى فوق نفس محتوى الصفحة', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.togglePinned()
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    tool.frame(new Set(['scroll']))
    expect(tool.state.transform.value.ty).toBe(-120)
  })

  it('سبب غير scroll لا يُحرِّك شيئًا حتى لو تغيّر التمرير', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.togglePinned()
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    tool.frame(new Set(['manual']))
    expect(tool.state.transform.value.ty).toBe(0)
  })
})

describe('reset', () => {
  it('يعيد كل الحالة إلى الافتراضي', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.setDisplayMode('blend')
    tool.setOpacity(80)
    tool.togglePinned()
    tool.reset()

    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 0, ty: 0, rotation: 0 })
    expect(tool.state.displayMode.value).toBe('split')
    expect(tool.state.opacity.value).toBe(50)
    expect(tool.state.pinned.value).toBe(true)
  })
})
