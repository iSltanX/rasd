import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReferenceCard } from '@/pages/library/parts/ReferenceCard'

import type { ReferenceRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function reference(over: Partial<ReferenceRecord> = {}): ReferenceRecord {
  return {
    id: 'r1',
    projectId: null,
    origin: 'example.com',
    path: '/pricing',
    viewport: 'desktop',
    blobId: 'blob-1',
    exclusions: [],
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

function mount(props: Partial<Parameters<typeof ReferenceCard>[0]> = {}) {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()

  render(
    <ReferenceCard
      record={reference()}
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

describe('ReferenceCard', () => {
  it('يعرض النطاق والمسار وشارة الجهاز والزمن النسبي', () => {
    const { root } = mount()
    expect(root.querySelector('[data-reference-id="r1"]')).toBeTruthy()
    expect(root.textContent).toContain('example.com')
    expect(root.textContent).toContain('/pricing')
    expect(root.textContent).toContain('سطح المكتب')
    expect(root.textContent).toContain('دقيقة')
  })

  it('يترجم أنواع الجهاز الأربعة إلى تسمياتها العربية', () => {
    const { root: desktop } = mount({ record: reference({ viewport: 'desktop' }) })
    expect(desktop.textContent).toContain('سطح المكتب')

    const { root: tablet } = mount({ record: reference({ viewport: 'tablet' }) })
    expect(tablet.textContent).toContain('جهاز لوحي')

    const { root: phone } = mount({ record: reference({ viewport: 'phone' }) })
    expect(phone.textContent).toContain('هاتف')

    const { root: custom } = mount({ record: reference({ viewport: 'custom' }) })
    expect(custom.textContent).toContain('مخصّص')
  })

  it('يعزل النطاق والمسار بـbdi باتجاه ltr', () => {
    const { root } = mount()
    const bdis = root.querySelectorAll('bdi[dir="ltr"]')
    expect(bdis.length).toBe(2)
    expect(bdis[0]?.textContent).toBe('example.com')
    expect(bdis[1]?.textContent).toBe('/pricing')
  })

  it('النقر خارج وضع التحديد يفتح المرجع لا يبدِّل التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    ;(root.querySelector('[data-reference-id="r1"]') as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('r1')
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('النقر في وضع التحديد يبدِّل التحديد لا يفتح', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    ;(root.querySelector('[data-reference-id="r1"]') as HTMLButtonElement).click()
    expect(onToggleSelect).toHaveBeenCalledWith('r1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('مربّع الاختيار يبدِّل التحديد مباشرة بلا فتح، حتى خارج وضع التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
    expect(onToggleSelect).toHaveBeenCalledWith('r1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('أيقونة overlay بديلة مرئية بلا محاولة جلب صورة', () => {
    const { root } = mount()
    expect(root.querySelector('img')).toBeFalsy()
    expect(root.querySelector('svg')).toBeTruthy()
  })
})
