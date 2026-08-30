import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Card } from '@/pages/library/parts/Card'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function capture(over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: 'c1',
    createdAt: NOW - 60_000,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة تسجيل الدخول',
    kind: 'area',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
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

function mount(props: Partial<Parameters<typeof Card>[0]> = {}) {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()

  render(
    <Card
      record={capture()}
      thumbnailUrl={null}
      projectName={null}
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

describe('Card', () => {
  it('يعرض العنوان والزمن النسبي', () => {
    const { root } = mount()
    expect(root.querySelector('[data-capture-id="c1"]')).toBeTruthy()
    expect(root.textContent).toContain('صفحة تسجيل الدخول')
    expect(root.textContent).toContain('دقيقة')
  })

  it('يعرض اسم المشروع حين يُمرَّر', () => {
    const { root } = mount({ projectName: 'مشروع أ' })
    expect(root.textContent).toContain('مشروع أ')
  })

  it('النقر خارج وضع التحديد يفتح اللقطة لا يبدِّل التحديد', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: false })
    ;(root.querySelector('[data-capture-id="c1"]') as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('c1')
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('النقر في وضع التحديد يبدِّل التحديد لا يفتح', () => {
    const { root, onOpen, onToggleSelect } = mount({ selectionMode: true })
    ;(root.querySelector('[data-capture-id="c1"]') as HTMLButtonElement).click()
    expect(onToggleSelect).toHaveBeenCalledWith('c1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('لقطة مفضَّلة تعرض شارة النجمة باسم إتاحة صريح', () => {
    const { root } = mount({ record: capture({ favorite: true }) })
    // الاسم على الغلاف لا على Icon — انظر تعليق Card.tsx: خاصّية title في
    // Icon.tsx لا تُرسَم فعليًا (بند مبلَّغ عنه)، فالغلاف يوفّر الاسم بديلًا.
    expect(root.querySelector('[role="img"][aria-label="مفضَّلة"]')).toBeTruthy()
  })

  it('لقطة غير مفضَّلة لا تعرض الشارة', () => {
    const { root } = mount({ record: capture({ favorite: false }) })
    expect(root.querySelector('[role="img"][aria-label="مفضَّلة"]')).toBeFalsy()
  })

  it('بلا مصغَّرة: يعرض أيقونة النوع بدل صورة فارغة', () => {
    const { root } = mount({ thumbnailUrl: null })
    expect(root.querySelector('img')).toBeFalsy()
    expect(root.querySelector('svg')).toBeTruthy()
  })

  it('بمصغَّرة: يعرض <img> بمصدرها', () => {
    const { root } = mount({ thumbnailUrl: 'blob:fake' })
    const img = root.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:fake')
  })
})
