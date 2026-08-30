import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PaletteCard } from '@/pages/library/parts/PaletteCard'

import type { PaletteRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function palette(over: Partial<PaletteRecord> = {}): PaletteRecord {
  return {
    id: 'p1',
    name: 'لوحة العلامة',
    colors: ['#3B82F6', '#F97316', '#10B981'],
    projectId: null,
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

function mount(props: Partial<Parameters<typeof PaletteCard>[0]> = {}) {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()

  render(
    <PaletteCard
      record={palette()}
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

describe('PaletteCard', () => {
  it('يعرض الاسم وعدد الألوان والزمن النسبي', () => {
    const { root } = mount()
    expect(root.querySelector('[data-palette-id="p1"]')).toBeTruthy()
    expect(root.textContent).toContain('لوحة العلامة')
    expect(root.textContent).toContain('٣ ألوان')
    expect(root.textContent).toContain('دقيقة')
  })

  it('يعرض مربّعًا لونيًّا واحدًا لكل لون في السجلّ', () => {
    const { root } = mount()
    // مربّعات اللون وحدها تحمل style مضمَّنًا (لون البيانات) — مربّع الاختيار لا.
    const swatches = root.querySelectorAll('[data-palette-id="p1"] span[style]')
    expect(swatches.length).toBe(3)
  })

  it('لون واحد فقط: صيغة المفرد بلا رقم', () => {
    const { root } = mount({ record: palette({ colors: ['#000000'] }) })
    expect(root.textContent).toContain('لون')
    expect(root.textContent).not.toContain('١ لون')
  })

  it('لونان: صيغة المثنّى بلا رقم', () => {
    const { root } = mount({ record: palette({ colors: ['#000000', '#ffffff'] }) })
    expect(root.textContent).toContain('لونين')
  })

  it('أكثر من 8 ألوان: يعرض أوّل 8 فقط مع مؤشّر +N', () => {
    const colors = Array.from({ length: 11 }, (_, i) => `#00000${i}`.padEnd(7, '0'))
    const { root } = mount({ record: palette({ colors }) })
    expect(root.textContent).toContain('١١ لون')
    expect(root.textContent).toContain('+٣')
  })

  it('8 ألوان أو أقل: لا يعرض مؤشّر +N', () => {
    const { root } = mount({ record: palette({ colors: ['#111111', '#222222'] }) })
    expect(root.textContent).not.toContain('+')
  })

  it('بلا ألوان: يعرض أيقونة بديلة لا شريطًا فارغًا', () => {
    const { root } = mount({ record: palette({ colors: [] }) })
    expect(root.querySelector('svg')).toBeTruthy()
  })

  it('النقر خارج وضع التحديد يفتح اللوحة لا يبدِّل التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    ;(root.querySelector('[data-palette-id="p1"]') as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('p1')
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('النقر في وضع التحديد يبدِّل التحديد لا يفتح', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    ;(root.querySelector('[data-palette-id="p1"]') as HTMLButtonElement).click()
    expect(onToggleSelect).toHaveBeenCalledWith('p1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('مربّع الاختيار يبدِّل التحديد مباشرة', () => {
    const { root, onToggleSelect, onOpen } = mount({ selectionMode: true })
    const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
    expect(onToggleSelect).toHaveBeenCalledWith('p1')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
