import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PageSplitHandle, type PageSplitHandleProps } from '@/pages/compare/parts/PageSplitHandle'

let host: HTMLDivElement | null = null

function mount(ui: preact.ComponentChild): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  render(ui, host)
  return host
}

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

function props(overrides: Partial<PageSplitHandleProps> = {}): PageSplitHandleProps {
  return {
    position: 50,
    onPositionChange: vi.fn(),
    measureExtent: () => 1000,
    ...overrides,
  }
}

/** يبني PointerEvent بحقول clientX/pointerId/button — happy-dom لا يبنيها افتراضيًّا. */
function pointerEvent(type: string, clientX: number, button = 0): PointerEvent {
  return new PointerEvent(type, { clientX, pointerId: 1, button, bubbles: true })
}

describe('PageSplitHandle — يُصيَّر بلا رمي', () => {
  it('يرسم الخطّ والمقبض دومًا (بلا شرط مقاس طبيعي — لا OverlayTransform هنا)', () => {
    const el = mount(<PageSplitHandle {...props()} />)
    expect(el.querySelector('[role="slider"]')).toBeTruthy()
  })

  it('aria-valuenow يعكس position المُشبَع بين 0 و100', () => {
    const el = mount(<PageSplitHandle {...props({ position: 137 })} />)
    expect(el.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('100')
    render(null, el)
    const el2 = mount(<PageSplitHandle {...props({ position: -20 })} />)
    expect(el2.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('المقبض قابل للتركيز (tabIndex=0)', () => {
    const el = mount(<PageSplitHandle {...props()} />)
    expect(el.querySelector('[role="slider"]')?.getAttribute('tabindex')).toBe('0')
  })
})

describe('PageSplitHandle — السحب', () => {
  it('سحب 100px عبر حاوية عرضها 1000 يزيد الموضع 10 نقاط مئوية', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ position: 50, onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500))
    handle.dispatchEvent(pointerEvent('pointermove', 600))

    expect(onPositionChange).toHaveBeenCalledWith(60)
  })

  it('يقيس عرض الحاوية عند بدء السحب فقط — تغيّره أثناء السحب لا يُعاد قراءته', () => {
    const onPositionChange = vi.fn()
    let extent = 1000
    const el = mount(
      <PageSplitHandle
        {...props({ position: 50, onPositionChange, measureExtent: () => extent })}
      />,
    )
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500))
    extent = 2000
    handle.dispatchEvent(pointerEvent('pointermove', 600))

    expect(onPositionChange).toHaveBeenCalledWith(60)
  })

  it('عرض صفري لا يقسم على صفر — لا استدعاء', () => {
    const onPositionChange = vi.fn()
    const el = mount(
      <PageSplitHandle {...props({ position: 50, onPositionChange, measureExtent: () => 0 })} />,
    )
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500))
    handle.dispatchEvent(pointerEvent('pointermove', 600))

    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('حركة بلا ضغط سابق لا تستدعي شيئًا', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointermove', 600))

    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('pointerup ينهي السحب — حركة لاحقة لا أثر لها', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ position: 50, onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500))
    handle.dispatchEvent(pointerEvent('pointerup', 500))
    onPositionChange.mockClear()
    handle.dispatchEvent(pointerEvent('pointermove', 700))

    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('الزرّ الأيمن أو الأوسط لا يبدأ سحبًا', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ position: 50, onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 2))
    handle.dispatchEvent(pointerEvent('pointermove', 600))
    expect(onPositionChange).not.toHaveBeenCalled()
  })
})

describe('PageSplitHandle — لوحة المفاتيح', () => {
  it('ArrowRight/ArrowLeft يزيدان/ينقصان نقطة مئوية واحدة', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ position: 50, onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(onPositionChange).toHaveBeenLastCalledWith(51)

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(onPositionChange).toHaveBeenLastCalledWith(49)
  })

  it('⇧ مع السهم يحرِّك عشر نقاط مئوية', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ position: 50, onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    )
    expect(onPositionChange).toHaveBeenLastCalledWith(60)
  })

  it('مفتاح آخر لا يستدعي شيئًا', () => {
    const onPositionChange = vi.fn()
    const el = mount(<PageSplitHandle {...props({ onPositionChange })} />)
    const handle = el.querySelector('[role="slider"]') as HTMLDivElement

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onPositionChange).not.toHaveBeenCalled()
  })
})
