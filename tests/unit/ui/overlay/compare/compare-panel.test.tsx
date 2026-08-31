import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompareIdle, ComparePanel, type ComparePanelProps } from '@/ui/overlay'

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

function panelProps(overrides: Partial<ComparePanelProps> = {}): ComparePanelProps {
  return {
    displayMode: 'split',
    opacity: 52,
    splitPosition: 43,
    viewportLabel: 'سطح مكتب 1440',
    onSetDisplayMode: vi.fn(),
    onOpacityChange: vi.fn(),
    onSplitPositionChange: vi.fn(),
    ...overrides,
  }
}

describe('ComparePanel — يُصيَّر بلا رمي', () => {
  it('يرسم العنوان وأربعة تبويبات ومنزلقين وصفّ المقاس وزرّ التبديل', () => {
    const el = mount(<ComparePanel {...panelProps()} />)
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(4)
    expect(el.querySelectorAll('input[type="range"]')).toHaveLength(2)
    expect(el.textContent).toContain('سطح مكتب 1440')
  })

  it('التبويب المطابق لـdisplayMode محدَّد وحده', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'blend' })} />)
    const selected = [...el.querySelectorAll('[role="tab"]')].filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('تراكب')
  })

  it('النقر على تبويب يستدعي onSetDisplayMode بالوضع الصحيح', () => {
    const onSetDisplayMode = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onSetDisplayMode })} />)
    const blink = [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'وميض')
    ;(blink as HTMLButtonElement).click()
    expect(onSetDisplayMode).toHaveBeenCalledWith('blink')
  })

  it('منزلق موضع الفاصل معطَّل خارج وضع split', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'opacity' })} />)
    const splitSlider = el.querySelector('[aria-label="موضع الفاصل"]') as HTMLInputElement
    expect(splitSlider.disabled).toBe(true)
  })

  it('منزلق موضع الفاصل مفعَّل في وضع split', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'split' })} />)
    const splitSlider = el.querySelector('[aria-label="موضع الفاصل"]') as HTMLInputElement
    expect(splitSlider.disabled).toBe(false)
  })

  it('العدّاد المئوي هنديّ — عدّ بشري لا قياس تقني', () => {
    const el = mount(<ComparePanel {...panelProps({ opacity: 52 })} />)
    expect(el.textContent).toContain('٥٢٪')
  })

  it('زرّ الإغلاق يستدعي onClose', () => {
    const onClose = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onClose })} />)
    ;(el.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalled()
  })

  it('زرّ التبديل يستدعي onSwap إن وُجد، ولا يرمي إن غاب', () => {
    const onSwap = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onSwap })} />)
    ;(el.querySelector('[data-rasd-ov="compare-panel"] footer button') as HTMLButtonElement).click()
    expect(onSwap).toHaveBeenCalled()

    expect(() => {
      const noSwap = mount(<ComparePanel {...panelProps()} />)
      ;(noSwap.querySelector('footer button') as HTMLButtonElement).click()
    }).not.toThrow()
  })
})

describe('CompareIdle — يُصيَّر بلا رمي', () => {
  it('يرسم العنوان ومنطقة الإفلات وزرّي الإجراء', () => {
    const el = mount(<CompareIdle />)
    expect(el.textContent).toContain('لا يوجد مرجع لهذه الصفحة')
    expect(el.querySelector('[data-rasd-ov="compare-idle"]')).toBeTruthy()
    expect(el.textContent).toContain('اختر من المكتبة')
    expect(el.textContent).toContain('استخدم آخر لقطة')
  })

  it('زرّا الإجراء يستدعيان المعاودتين', () => {
    const onChooseFromLibrary = vi.fn()
    const onUseLastCapture = vi.fn()
    const el = mount(
      <CompareIdle onChooseFromLibrary={onChooseFromLibrary} onUseLastCapture={onUseLastCapture} />,
    )
    const buttons = el.querySelectorAll('.rasd-ov-cmp-idle-actions button')
    ;(buttons[0] as HTMLButtonElement).click()
    ;(buttons[1] as HTMLButtonElement).click()
    expect(onChooseFromLibrary).toHaveBeenCalled()
    expect(onUseLastCapture).toHaveBeenCalled()
  })

  it('إفلات ملفّ صورة يستدعي onDropImage بالملفّ', () => {
    const onDropImage = vi.fn()
    const el = mount(<CompareIdle onDropImage={onDropImage} />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    const dataTransfer = { files: [file] } as unknown as DataTransfer
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }))
    expect(onDropImage).toHaveBeenCalledWith(file)
  })

  it('إفلات ملفّ غير صورة لا يستدعي onDropImage', () => {
    const onDropImage = vi.fn()
    const el = mount(<CompareIdle onDropImage={onDropImage} />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    const file = new File(['x'], 'ref.txt', { type: 'text/plain' })
    const dataTransfer = { files: [file] } as unknown as DataTransfer
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }))
    expect(onDropImage).not.toHaveBeenCalled()
  })

  it('data-drag-over يتبدّل مع dragover/dragleave', async () => {
    const el = mount(<CompareIdle />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    await act(() => {
      zone.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    })
    expect(zone.getAttribute('data-drag-over')).toBe('true')
    await act(() => {
      zone.dispatchEvent(new Event('dragleave', { bubbles: true }))
    })
    expect(zone.getAttribute('data-drag-over')).toBe('false')
  })
})
