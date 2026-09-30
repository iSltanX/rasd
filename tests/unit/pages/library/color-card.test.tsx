import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ColorCard } from '@/pages/library/parts/ColorCard'

import type { ColorRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function color(over: Partial<ColorRecord> = {}): ColorRecord {
  return {
    id: 'col1',
    hex: '#3366ff',
    name: 'أزرق العلامة',
    note: '',
    source: 'pixel',
    projectId: null,
    sourceUrl: null,
    createdAt: NOW - 60_000,
    ...over,
  }
}

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(props: Partial<Parameters<typeof ColorCard>[0]> = {}) {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()

  render(
    <ColorCard
      record={color()}
      selectionMode={false}
      selected={false}
      onToggleSelect={onToggleSelect}
      onOpen={onOpen}
      now={NOW}
      {...props}
    />,
    container,
  )

  return { root: container, onToggleSelect, onOpen }
}

describe('ColorCard', () => {
  it('يعرض الاسم ونوع المصدر والزمن النسبي', () => {
    const { root } = mount()
    expect(root.querySelector('[data-color-id="col1"]')).toBeTruthy()
    expect(root.textContent).toContain('أزرق العلامة')
    expect(root.textContent).toContain('بكسل')
    expect(root.textContent).toContain('دقيقة')
  })

  it('بلا اسم: يعرض القيمة السداسية بدلًا منه', () => {
    const { root } = mount({ record: color({ name: '' }) })
    expect(root.textContent).toContain('#3366ff')
  })

  it('يعرض تسمية عربية لكلّ مصدر', () => {
    expect(mount({ record: color({ source: 'css' }) }).root.textContent).toContain('CSS')
    expect(mount({ record: color({ source: 'manual' }) }).root.textContent).toContain('يدوي')
  })

  it('يستعمل قيمة hex السجلّ خلفيةً لمربّع اللون', () => {
    const { root } = mount({ record: color({ hex: '#abcdef' }) })
    const swatch = root.querySelector(`[data-color-id="col1"] button > span`) as HTMLSpanElement
    expect(swatch.style.backgroundColor).toBe('#abcdef')
  })

  it('النقر خارج وضع التحديد يفتح اللون لا يبدِّل التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    ;(root.querySelector('[data-color-id="col1"]') as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('col1')
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('النقر في وضع التحديد يبدِّل التحديد لا يفتح', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    ;(root.querySelector('[data-color-id="col1"]') as HTMLButtonElement).click()
    expect(onToggleSelect).toHaveBeenCalledWith('col1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('مربّع الاختيار يبدِّل التحديد مباشرة دون فتح البطاقة', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
    expect(onToggleSelect).toHaveBeenCalledWith('col1')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
