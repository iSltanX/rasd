import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GuideCard } from '@/pages/library/parts/GuideCard'

import type { GuideRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function guide(over: Partial<GuideRecord> = {}): GuideRecord {
  return {
    id: 'g1',
    title: 'دليل تسجيل الدخول',
    projectId: null,
    captureIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
    createdAt: NOW - 60_000,
    stepText: {},
    updatedAt: NOW - 60_000,
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

function mount(props: Partial<Parameters<typeof GuideCard>[0]> = {}) {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()

  render(
    <GuideCard
      record={guide()}
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

describe('GuideCard', () => {
  it('يعرض العنوان وعدد اللقطات والزمن النسبي', () => {
    const { root } = mount()
    expect(root.querySelector('[data-guide-id="g1"]')).toBeTruthy()
    expect(root.textContent).toContain('دليل تسجيل الدخول')
    expect(root.textContent).toContain('٧ لقطات')
    expect(root.textContent).toContain('دقيقة')
  })

  it('يصرِّف الجمع العربي حسب العدد: مفرد ومثنّى وجمع', () => {
    expect(mount({ record: guide({ captureIds: ['c1'] }) }).root.textContent).toContain('لقطة')
    expect(mount({ record: guide({ captureIds: ['c1'] }) }).root.textContent).not.toContain(
      'لقطتين',
    )

    expect(mount({ record: guide({ captureIds: ['c1', 'c2'] }) }).root.textContent).toContain(
      'لقطتين',
    )

    expect(mount({ record: guide({ captureIds: ['c1', 'c2', 'c3'] }) }).root.textContent).toContain(
      '٣ لقطات',
    )
  })

  it('النقر خارج وضع التحديد يفتح الدليل لا يبدِّل التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    ;(root.querySelector('[data-guide-id="g1"]') as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('g1')
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('النقر في وضع التحديد يبدِّل التحديد لا يفتح', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    ;(root.querySelector('[data-guide-id="g1"]') as HTMLButtonElement).click()
    expect(onToggleSelect).toHaveBeenCalledWith('g1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('مربّع الاختيار يبدِّل التحديد مباشرة دون فتح الدليل', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
    expect(onToggleSelect).toHaveBeenCalledWith('g1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('يعرض أيقونة القائمة الكبيرة دائمًا (لا مصغَّرة للأدلة)', () => {
    const { root } = mount()
    expect(root.querySelector('svg')).toBeTruthy()
    expect(root.querySelector('img')).toBeFalsy()
  })
})
