/**
 * أداة كشف العناصر — الحالة والتفاعل، لا الاستهداف نفسه.
 *
 * دقّة الاستهداف (اختراق الظلّ، الإطارات) مُختبَرة في
 * `modules/dom-picker/hit-test.test.ts`؛ هنا يُختبَر ما بُني فوقها: تتبّع/
 * تثبيت/التقاط، والمشي في الشجرة، **والبند 51 في `Rasd_Plan.md §6`** —
 * التمرير التلقائي عند المشي وعند الالتقاط لهدف خارج النافذة.
 *
 * `elementsFromPoint` غير موجودة في happy-dom، فتُحقن على `document`
 * الحقيقي مباشرة — هذا ما يمنح `pickAt` جوابًا بلا بناء `Document` مزيَّف
 * كامل.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createElementHover, type ElementHoverTool, type TargetInfo } from '@/content/tools/element-hover'

import type { ViewportRect } from '@/shared/geometry'

function setRect(el: Element, x: number, y: number, w: number, h: number): void {
  const rect = new DOMRect(x, y, w, h)
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
  Object.defineProperty(el, 'getClientRects', {
    value: () => (w * h > 0 ? [rect] : []),
    configurable: true,
  })
}

function pointer(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y } as PointerEvent
}

const VP_W = 1000
const VP_H = 800

beforeEach(() => {
  document.body.innerHTML = ''
  Object.defineProperty(window, 'innerWidth', { value: VP_W, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: VP_H, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementsFromPoint')
})

/** يبني أبًا وابنًا، ويجعل `elementsFromPoint` عند `(x, y)` تُرجعهما. */
function buildParentChild(): { parent: HTMLElement; child: HTMLElement } {
  const parent = document.createElement('div')
  const child = document.createElement('span')
  parent.appendChild(child)
  document.body.appendChild(parent)
  return { parent, child }
}

function stubHitAt(x: number, y: number, stack: Element[]): void {
  ;(document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint =
    vi.fn((qx: number, qy: number) => (qx === x && qy === y ? stack : []))
}

function makeTool(onCommit = vi.fn()): { tool: ElementHoverTool; onCommit: typeof onCommit } {
  const tool = createElementHover({
    doc: document,
    onCommit,
    onCancel: vi.fn(),
    onBusy: vi.fn(),
  })
  return { tool, onCommit }
}

describe('التتبّع والتثبيت', () => {
  it('يبدأ خاملًا بلا هدف', () => {
    const { tool } = makeTool()
    expect(tool.state.phase.value).toBe('tracking')
    expect(tool.state.rect.value).toBeNull()
  })

  it('التمرير فوق عنصر يستهدفه بعد إطار مزامنة', () => {
    const { child } = buildParentChild()
    setRect(child, 100, 100, 50, 30)
    stubHitAt(120, 110, [child])

    const { tool } = makeTool()
    tool.onPointerMove(pointer(120, 110))
    tool.frame(new Set(['pointer']))

    expect(tool.state.info.value?.tag).toBe('span')
    expect(tool.state.rect.value).toEqual({ space: 'viewport', x: 100, y: 100, width: 50, height: 30 })
  })
})

describe('المشي في الشجرة — البند 51: التمرير التلقائي', () => {
  it('↑ إلى أب مرئي كاملًا لا يستدعي scrollIntoView', () => {
    const { parent, child } = buildParentChild()
    setRect(child, 100, 100, 50, 30)
    setRect(parent, 90, 90, 200, 150) // داخل 1000×800 كاملًا
    stubHitAt(120, 110, [child])

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { tool } = makeTool()
    tool.onPointerMove(pointer(120, 110))
    tool.frame(new Set(['pointer']))

    expect(tool.walk('up')).toBe(true)
    expect(tool.state.info.value?.tag).toBe('div')
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('↑ إلى أب أسفل النافذة يمرّره إلى الرؤية — instant ومركَّزًا', () => {
    const { parent, child } = buildParentChild()
    setRect(child, 100, 100, 50, 30)
    setRect(parent, 90, VP_H + 300, 200, 150) // خارج النافذة تمامًا
    stubHitAt(120, 110, [child])

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { tool } = makeTool()
    tool.onPointerMove(pointer(120, 110))
    tool.frame(new Set(['pointer']))
    tool.walk('up')

    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'center', inline: 'nearest' })
  })

  it('أبٌ أطول من النافذة (oversized) لا يُمرَّر إليه — لا تمرير يُصلحه', () => {
    const { parent, child } = buildParentChild()
    setRect(child, 100, 100, 50, 30)
    setRect(parent, 0, -200, 200, VP_H + 500) // أطول من النافذة نفسها
    stubHitAt(120, 110, [child])

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { tool } = makeTool()
    tool.onPointerMove(pointer(120, 110))
    tool.frame(new Set(['pointer']))
    tool.walk('up')

    expect(scrollSpy).not.toHaveBeenCalled()
    // الحالة تبقى متّسقة رغم عدم التمرير — الرصد لا يتوقّف عند حدّه المعلن.
    expect(tool.state.phase.value).toBe('pinned')
  })
})

describe('الالتقاط — البند 51: التمرير ثم الالتقاط', () => {
  it('هدف مرئي كاملًا يُلتقَط بمستطيله كما هو، بلا تمرير', () => {
    const { child } = buildParentChild()
    setRect(child, 50, 50, 100, 60)
    stubHitAt(80, 70, [child])

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { tool, onCommit } = makeTool()
    tool.onPointerMove(pointer(80, 70))
    tool.frame(new Set(['pointer']))
    tool.commit()

    expect(scrollSpy).not.toHaveBeenCalled()
    expect(onCommit).toHaveBeenCalledTimes(1)
    const [rect] = onCommit.mock.calls[0] as [ViewportRect, TargetInfo]
    expect(rect).toEqual({ space: 'viewport', x: 50, y: 50, width: 100, height: 60 })
  })

  it('هدف خارج النافذة: يُمرَّر إليه ثم يُلتقَط بمستطيله **الجديد**', () => {
    const { child } = buildParentChild()
    setRect(child, 50, VP_H + 400, 100, 60)
    stubHitAt(80, VP_H + 420, [child])

    // بعد "التمرير" الوهمي يصير الهدف مرئيًا عند نقطة مختلفة — يحاكي
    // اختلاف `getBoundingClientRect` قبل التمرير وبعده على متصفّح حقيقي.
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element,
    ) {
      setRect(this, 50, 300, 100, 60)
    })

    const { tool, onCommit } = makeTool()
    tool.onPointerMove(pointer(80, VP_H + 420))
    tool.frame(new Set(['pointer']))
    tool.commit()

    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'center', inline: 'nearest' })
    expect(onCommit).toHaveBeenCalledTimes(1)
    const [rect] = onCommit.mock.calls[0] as [ViewportRect, TargetInfo]
    // المستطيل المُلتقَط هو ما بعد التمرير، لا ما قبله.
    expect(rect).toEqual({ space: 'viewport', x: 50, y: 300, width: 100, height: 60 })
    expect(tool.state.rect.value).toEqual(rect)
  })

  it('هدف أطول من النافذة (oversized): يُلتقَط كما هو دون تمرير — مؤجَّل إلى 22', () => {
    const { child } = buildParentChild()
    setRect(child, 50, -100, 300, VP_H + 400)
    stubHitAt(80, 200, [child])

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { tool, onCommit } = makeTool()
    tool.onPointerMove(pointer(80, 200))
    tool.frame(new Set(['pointer']))
    tool.commit()

    expect(scrollSpy).not.toHaveBeenCalled()
    expect(onCommit).toHaveBeenCalledTimes(1)
    const [rect] = onCommit.mock.calls[0] as [ViewportRect, TargetInfo]
    expect(rect).toEqual({ space: 'viewport', x: 50, y: -100, width: 300, height: VP_H + 400 })
  })

  it('لا هدف ولا مستطيل: commit لا يفعل شيئًا', () => {
    const { tool, onCommit } = makeTool()
    tool.commit()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('الالتقاط الجاري يمنع التقاطًا ثانيًا', () => {
    const { child } = buildParentChild()
    setRect(child, 50, 50, 100, 60)
    stubHitAt(80, 70, [child])

    const { tool, onCommit } = makeTool()
    tool.onPointerMove(pointer(80, 70))
    tool.frame(new Set(['pointer']))
    tool.commit()
    tool.commit()

    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('reset', () => {
  it('يعيد الحالة إلى الخمول ويستدعي onBusy(false)', () => {
    const { child } = buildParentChild()
    setRect(child, 10, 10, 40, 40)
    stubHitAt(20, 20, [child])

    const onBusy = vi.fn()
    const tool = createElementHover({ doc: document, onCommit: vi.fn(), onCancel: vi.fn(), onBusy })
    tool.onPointerMove(pointer(20, 20))
    tool.frame(new Set(['pointer']))
    expect(tool.state.info.value).not.toBeNull()

    tool.reset()

    expect(tool.state.phase.value).toBe('tracking')
    expect(tool.state.rect.value).toBeNull()
    expect(tool.state.info.value).toBeNull()
    expect(onBusy).toHaveBeenCalledWith(false)
  })
})
