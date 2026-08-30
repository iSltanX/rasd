/**
 * أداة القياس — الحالة والتفاعل. الرياضيات مُختبَرة في `modules/measure/*`؛
 * هنا يُختبَر ما يربطها بالمؤشِّر: التتبّع، تثبيت المرجع، السحب الحرّ،
 * ومسح المرجع بنقرة على الخلفية.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMeasure, type MeasureTool } from '@/content/tools/measure'

function setRect(el: Element, x: number, y: number, w: number, h: number): void {
  const rect = new DOMRect(x, y, w, h)
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
  Object.defineProperty(el, 'getClientRects', {
    value: () => (w * h > 0 ? [rect] : []),
    configurable: true,
  })
}

function pointer(x: number, y: number, alt = false): PointerEvent {
  return { clientX: x, clientY: y, altKey: alt } as PointerEvent
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementsFromPoint')
})

function stubHit(map: Record<string, Element>): void {
  ;(
    document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }
  ).elementsFromPoint = vi.fn((x: number, y: number) => {
    const el = map[`${x},${y}`]
    return el ? [el] : []
  })
}

function makeTool(overrides: Partial<Parameters<typeof createMeasure>[0]> = {}): MeasureTool {
  return createMeasure({
    doc: document,
    onCancel: vi.fn(),
    onBusy: vi.fn(),
    ...overrides,
  })
}

describe('التتبّع', () => {
  it('المرور فوق عنصر يملأ hover بعد إطار', () => {
    const el = document.createElement('div')
    setRect(el, 10, 10, 100, 50)
    document.body.appendChild(el)
    stubHit({ '20,20': el })

    const tool = makeTool()
    tool.onPointerMove(pointer(20, 20))
    tool.frame(new Set(['pointer']))

    expect(tool.state.hover.value?.rect).toEqual({
      space: 'viewport',
      x: 10,
      y: 10,
      width: 100,
      height: 50,
    })
  })

  it('لا شيء تحت المؤشِّر: hover يبقى null', () => {
    stubHit({})
    const tool = makeTool()
    tool.onPointerMove(pointer(500, 500))
    tool.frame(new Set(['pointer']))
    expect(tool.state.hover.value).toBeNull()
  })

  it('⌥ يُحدَّث في snapHeld فورًا بلا انتظار إطار', () => {
    const tool = makeTool()
    tool.onPointerMove(pointer(10, 10, true))
    expect(tool.state.snapHeld.value).toBe(false) // معطَّل بينما ⌥ مضغوط
    tool.onPointerMove(pointer(11, 11, false))
    expect(tool.state.snapHeld.value).toBe(true)
  })
})

describe('تثبيت المرجع والمقارنة', () => {
  it('نقرة على عنصر تثبّته مرجعًا', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 40, 40)
    document.body.appendChild(el)
    stubHit({ '5,5': el })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))

    expect(tool.state.reference.value?.rect).toEqual({
      space: 'viewport',
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    })
  })

  it('نقرة ثانية على عنصر آخر تستبدل المرجع مباشرة', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    setRect(a, 0, 0, 40, 40)
    setRect(b, 200, 200, 20, 20)
    document.body.append(a, b)
    stubHit({ '5,5': a, '210,210': b })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))
    tool.onPointerDown(pointer(210, 210))

    expect(tool.state.reference.value?.rect.x).toBe(200)
  })

  it('مرجع + هدف تتبّع معًا ينتجان مقارنة (فجوة ومحاذاة)', () => {
    const ref = document.createElement('div')
    const target = document.createElement('div')
    setRect(ref, 0, 0, 100, 100)
    setRect(target, 200, 0, 50, 100) // يمين المرجع، بمحاذاة top/bottom
    document.body.append(ref, target)
    stubHit({ '5,5': ref, '220,20': target })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))
    tool.onPointerMove(pointer(220, 20))
    tool.frame(new Set(['pointer']))

    expect(tool.state.comparison.value?.gap.right).toBe(100)
    expect(tool.state.comparison.value?.gap.nearest).toBe('right')
    expect(tool.state.comparison.value?.alignment.some((m) => m.axis === 'top')).toBe(true)
  })

  it('بلا مرجع: التتبّع وحده لا يُنتج مقارنة', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 40, 40)
    document.body.appendChild(el)
    stubHit({ '5,5': el })

    const tool = makeTool()
    tool.onPointerMove(pointer(5, 5))
    tool.frame(new Set(['pointer']))

    expect(tool.state.comparison.value).toBeNull()
  })
})

describe('مسح المرجع بالنقر على الخلفية', () => {
  it('نقرة طائشة (بلا سحب) على الخلفية تمسح المرجع القائم', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 40, 40)
    document.body.appendChild(el)
    stubHit({ '5,5': el })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))
    expect(tool.state.reference.value).not.toBeNull()

    stubHit({}) // الخلفية — لا عنصر عند هذه النقطة
    tool.onPointerDown(pointer(500, 500))
    tool.onPointerUp()

    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.comparison.value).toBeNull()
  })

  it('clearReference() تمسح المرجع مباشرة', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 40, 40)
    document.body.appendChild(el)
    stubHit({ '5,5': el })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))
    tool.clearReference()

    expect(tool.state.reference.value).toBeNull()
  })
})

describe('القياس الحرّ بالسحب', () => {
  it('سحب دون العتبة (3px) لا يُنشئ مستطيلًا حرًّا', () => {
    stubHit({})
    const tool = makeTool()
    tool.onPointerDown(pointer(100, 100))
    tool.onPointerMove(pointer(101, 101)) // مسافة √2 ≈ 1.4 — دون العتبة
    expect(tool.state.freeRect.value).toBeNull()
  })

  it('سحب فوق العتبة على خلفية فارغة يُنتج مستطيلًا حرًّا مطبَّعًا', () => {
    stubHit({})
    const onBusy = vi.fn()
    const tool = makeTool({ onBusy })
    tool.onPointerDown(pointer(100, 100))
    tool.onPointerMove(pointer(150, 80)) // سحب لأعلى-يمين — يختبر التطبيع

    expect(tool.state.freeRect.value).toEqual({
      space: 'viewport',
      x: 100,
      y: 80,
      width: 50,
      height: 20,
    })
    expect(onBusy).toHaveBeenCalledWith(true)
  })

  it('السحب الفعلي لا يمسح المرجع عند الإفلات', () => {
    const ref = document.createElement('div')
    setRect(ref, 0, 0, 40, 40)
    document.body.appendChild(ref)
    stubHit({ '5,5': ref })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5)) // يثبّت مرجعًا أوّلًا
    stubHit({})
    tool.onPointerDown(pointer(300, 300)) // بداية سحب من الخلفية
    tool.onPointerMove(pointer(350, 320)) // سحب فعلي، فوق العتبة
    tool.onPointerUp()

    expect(tool.state.reference.value).not.toBeNull() // لم يُمسَح — لم تكن نقرة طائشة
  })

  it('الالتقاط اللحظي: نهاية السحب تُشدّ إلى حافّة مرجع قريبة ضمن 4px', () => {
    const ref = document.createElement('div')
    setRect(ref, 0, 0, 100, 100) // الحافّة اليمنى عند x=100
    document.body.appendChild(ref)
    stubHit({ '5,5': ref })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5)) // يثبّته مرجعًا
    stubHit({})
    tool.onPointerDown(pointer(200, 200))
    tool.onPointerMove(pointer(203, 250)) // نهاية قريبة من x=200 لا من حافّة المرجع — تحقّق أدناه بمرشَّح أقرب

    // نعيد المحاولة قرب الحافّة اليمنى للمرجع (100) تحديدًا لإثبات الالتقاط
    tool.onPointerMove(pointer(102, 250))
    expect(tool.state.freeRect.value?.x).toBe(100) // شُدَّ 102 → 100
  })

  it('⌥ يعطّل الالتقاط اللحظي حتى مع مرشَّح مطابق', () => {
    const ref = document.createElement('div')
    setRect(ref, 0, 0, 100, 100)
    document.body.appendChild(ref)
    stubHit({ '5,5': ref })

    const tool = makeTool()
    tool.onPointerDown(pointer(5, 5))
    stubHit({})
    tool.onPointerDown(pointer(200, 200))
    tool.onPointerMove(pointer(102, 250, true)) // ⌥ مضغوط

    expect(tool.state.freeRect.value?.x).toBe(102) // بلا التقاط
  })
})

describe('toggleUnit', () => {
  it('يتبادل بين px وrem', () => {
    const tool = makeTool()
    expect(tool.state.unit.value).toBe('px')
    tool.toggleUnit()
    expect(tool.state.unit.value).toBe('rem')
    tool.toggleUnit()
    expect(tool.state.unit.value).toBe('px')
  })
})

describe('reset', () => {
  it('يعيد كل الإشارات إلى حالتها الأصلية', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 40, 40)
    document.body.appendChild(el)
    stubHit({ '5,5': el })

    const onBusy = vi.fn()
    const tool = makeTool({ onBusy })
    tool.onPointerDown(pointer(5, 5))
    tool.onPointerMove(pointer(5, 5))
    tool.frame(new Set(['pointer']))
    tool.toggleUnit()

    tool.reset()

    expect(tool.state.hover.value).toBeNull()
    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.comparison.value).toBeNull()
    expect(tool.state.freeRect.value).toBeNull()
    expect(tool.state.cursor.value).toBeNull()
    expect(onBusy).toHaveBeenCalledWith(false)
  })
})
