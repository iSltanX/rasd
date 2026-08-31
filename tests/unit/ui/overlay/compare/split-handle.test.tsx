import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { identityOverlayTransform, type OverlayTransform } from '@/modules/compare/overlay'
import { SplitHandle, type SplitHandleProps } from '@/ui/overlay'

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

function props(overrides: Partial<SplitHandleProps> = {}): SplitHandleProps {
  return {
    transform: identityOverlayTransform,
    naturalWidth: 1000,
    naturalHeight: 500,
    splitPosition: 50,
    splitAxis: 'vertical',
    onSplitPositionChange: vi.fn(),
    ...overrides,
  }
}

/** يبني PointerEvent بحقول `clientX`/`clientY`/`pointerId`/`button` — happy-dom لا يبنيها افتراضيًّا. */
function pointerEvent(type: string, clientX: number, clientY: number, button = 0): PointerEvent {
  return new PointerEvent(type, { clientX, clientY, pointerId: 1, button, bubbles: true })
}

/** مسارا `chevron-left`/`chevron-right` — راجع icon-data.ts. */
const CHEVRON_LEFT_PATH = 'M6.25 0.75L0.75 6.25L6.25 11.75'
const CHEVRON_RIGHT_PATH = 'M0.75 0.75L6.25 6.25L0.75 11.75'

describe('SplitHandle — يُصيَّر بلا رمي', () => {
  it('يرسم الخطّ والمقبض حين المقاس الطبيعي صالح', () => {
    const el = mount(<SplitHandle {...props()} />)
    expect(el.querySelector('[data-rasd-ov="split-frame"]')).toBeTruthy()
    expect(el.querySelector('.rasd-ov-split-line')).toBeTruthy()
    expect(el.querySelector('.rasd-ov-split-handle')).toBeTruthy()
  })

  it('لا شيء يُرسَم حين العرض أو الارتفاع الطبيعي غير موجب', () => {
    const el1 = mount(<SplitHandle {...props({ naturalWidth: 0 })} />)
    expect(el1.querySelector('[data-rasd-ov="split-frame"]')).toBeNull()
    render(null, el1)
    const el2 = mount(<SplitHandle {...props({ naturalHeight: -1 })} />)
    expect(el2.querySelector('[data-rasd-ov="split-frame"]')).toBeNull()
  })

  it('المحور الرأسي يستخدم سهمَي يمين/يسار، والأفقي أعلى/أسفل', () => {
    const vertical = mount(<SplitHandle {...props({ splitAxis: 'vertical' })} />)
    expect(vertical.querySelectorAll('.rasd-ov-split-handle svg')).toHaveLength(2)
    render(null, vertical)

    const horizontal = mount(<SplitHandle {...props({ splitAxis: 'horizontal' })} />)
    expect(horizontal.querySelectorAll('.rasd-ov-split-handle svg')).toHaveLength(2)
    // كلا العنصرين يحمل `data-axis` الصحيح — الخطّ والمقبض معًا.
    expect(horizontal.querySelector('.rasd-ov-split-line')?.getAttribute('data-axis')).toBe(
      'horizontal',
    )
    expect(horizontal.querySelector('.rasd-ov-split-handle')?.getAttribute('data-axis')).toBe(
      'horizontal',
    )
  })

  it('aria-valuenow يعكس splitPosition المُشبَع بين 0 و100', () => {
    const el = mount(<SplitHandle {...props({ splitPosition: 137 })} />)
    expect(el.querySelector('.rasd-ov-split-handle')?.getAttribute('aria-valuenow')).toBe('100')
    render(null, el)
    const el2 = mount(<SplitHandle {...props({ splitPosition: -20 })} />)
    expect(el2.querySelector('.rasd-ov-split-handle')?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('المقبض قابل للتركيز (tabIndex=0) — لا زخرفة role="slider" بلا تركيز', () => {
    const el = mount(<SplitHandle {...props()} />)
    expect(el.querySelector('.rasd-ov-split-handle')?.getAttribute('tabindex')).toBe('0')
  })

  it('aria-orientation يصف محور حركة المقبض لا محور الخطّ الفاصل', () => {
    // محور «رأسي» يعني خطًّا رأسيًّا يقسم يمينًا/يسارًا — فحركة المقبض أفقية.
    const vertical = mount(<SplitHandle {...props({ splitAxis: 'vertical' })} />)
    expect(vertical.querySelector('.rasd-ov-split-handle')?.getAttribute('aria-orientation')).toBe(
      'horizontal',
    )
    render(null, vertical)

    const horizontal = mount(<SplitHandle {...props({ splitAxis: 'horizontal' })} />)
    expect(
      horizontal.querySelector('.rasd-ov-split-handle')?.getAttribute('aria-orientation'),
    ).toBe('vertical')
  })

  it('السهمان في المحور الرأسي يشيران إلى الخارج (يسار ثم يمين) لا الداخل', () => {
    const el = mount(<SplitHandle {...props({ splitAxis: 'vertical' })} />)
    const svgs = [...el.querySelectorAll('.rasd-ov-split-handle svg')]
    expect(svgs[0]?.innerHTML).toContain(CHEVRON_LEFT_PATH)
    expect(svgs[1]?.innerHTML).toContain(CHEVRON_RIGHT_PATH)
  })
})

describe('SplitHandle — السحب (محور رأسي)', () => {
  it('سحب 100px عند scale=1 وعرض طبيعي 1000 يزيد الموضع 10 نقاط مئوية', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0))
    handle.dispatchEvent(pointerEvent('pointermove', 600, 0))

    expect(onSplitPositionChange).toHaveBeenCalledWith(60)
  })

  it('السحب يتقيّد بـtransform.scale — نفس دلتا الشاشة عند تكبير 2× تعطي نصف النسبة', () => {
    const onSplitPositionChange = vi.fn()
    const scaled: OverlayTransform = { ...identityOverlayTransform, scale: 2 }
    const el = mount(
      <SplitHandle {...props({ splitPosition: 50, transform: scaled, onSplitPositionChange })} />,
    )
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0))
    handle.dispatchEvent(pointerEvent('pointermove', 600, 0))

    // extentPx = 1000 × 2 = 2000؛ 100px تساوي 5 نقاط مئوية لا 10.
    expect(onSplitPositionChange).toHaveBeenCalledWith(55)
  })

  it('حركة بلا ضغط سابق لا تستدعي شيئًا', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointermove', 600, 0))

    expect(onSplitPositionChange).not.toHaveBeenCalled()
  })

  it('pointerup ينهي السحب — حركة لاحقة لا أثر لها', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0))
    handle.dispatchEvent(pointerEvent('pointerup', 500, 0))
    onSplitPositionChange.mockClear()
    handle.dispatchEvent(pointerEvent('pointermove', 700, 0))

    expect(onSplitPositionChange).not.toHaveBeenCalled()
  })

  it('pointercancel ينهي السحب كذلك', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0))
    handle.dispatchEvent(pointerEvent('pointercancel', 500, 0))
    onSplitPositionChange.mockClear()
    handle.dispatchEvent(pointerEvent('pointermove', 700, 0))

    expect(onSplitPositionChange).not.toHaveBeenCalled()
  })

  it('الزرّ الأيمن أو الأوسط لا يبدأ سحبًا — نفس حارس area-select.ts', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0, 2)) // الزرّ الأيمن
    handle.dispatchEvent(pointerEvent('pointermove', 600, 0))
    expect(onSplitPositionChange).not.toHaveBeenCalled()

    handle.dispatchEvent(pointerEvent('pointerdown', 500, 0, 1)) // الزرّ الأوسط
    handle.dispatchEvent(pointerEvent('pointermove', 600, 0))
    expect(onSplitPositionChange).not.toHaveBeenCalled()
  })
})

describe('SplitHandle — لوحة المفاتيح', () => {
  it('ArrowRight/ArrowLeft في المحور الرأسي يزيدان/ينقصان نقطة مئوية واحدة', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(onSplitPositionChange).toHaveBeenLastCalledWith(51)

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(onSplitPositionChange).toHaveBeenLastCalledWith(49)
  })

  it('⇧ مع السهم يحرِّك عشر نقاط مئوية', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    )
    expect(onSplitPositionChange).toHaveBeenLastCalledWith(60)
  })

  it('ArrowUp/ArrowDown هما الفعّالان في المحور الأفقي — لا ArrowRight/ArrowLeft', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(
      <SplitHandle
        {...props({ splitAxis: 'horizontal', splitPosition: 50, onSplitPositionChange })}
      />,
    )
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(onSplitPositionChange).not.toHaveBeenCalled()

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onSplitPositionChange).toHaveBeenLastCalledWith(51)

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(onSplitPositionChange).toHaveBeenLastCalledWith(49)
  })

  it('مفتاح آخر لا يستدعي شيئًا', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(<SplitHandle {...props({ splitPosition: 50, onSplitPositionChange })} />)
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onSplitPositionChange).not.toHaveBeenCalled()
  })
})

describe('SplitHandle — السحب (محور أفقي)', () => {
  it('يقرأ clientY لا clientX عند splitAxis=horizontal', () => {
    const onSplitPositionChange = vi.fn()
    const el = mount(
      <SplitHandle
        {...props({
          splitAxis: 'horizontal',
          naturalHeight: 500,
          splitPosition: 50,
          onSplitPositionChange,
        })}
      />,
    )
    const handle = el.querySelector('.rasd-ov-split-handle') as HTMLDivElement

    handle.dispatchEvent(pointerEvent('pointerdown', 0, 250))
    handle.dispatchEvent(pointerEvent('pointermove', 0, 300))

    // extentPx = naturalHeight × scale = 500؛ 50px تساوي 10 نقاط مئوية.
    expect(onSplitPositionChange).toHaveBeenCalledWith(60)
  })
})
