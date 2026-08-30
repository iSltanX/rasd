import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TagsPanel } from '@/pages/library/parts/TagsPanel'

import type { TagRecord } from '@/shared/storage/schema'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(tags: TagRecord[] = [], activeTag: string | null = null) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const onSelectTag = vi.fn()
  const onClose = vi.fn()

  render(
    <TagsPanel tags={tags} activeTag={activeTag} onSelectTag={onSelectTag} onClose={onClose} />,
    container,
  )

  return { root: container, onSelectTag, onClose }
}

describe('TagsPanel — حالة فارغة', () => {
  it('لا وسوم ⇒ رسالة فراغ لا قائمة', () => {
    const { root } = mount([])
    expect(root.textContent).toContain('لا وسوم بعد')
    expect(root.querySelectorAll('[data-tag-name]')).toHaveLength(0)
  })
})

describe('TagsPanel — الترتيب والعرض', () => {
  it('يرتِّب الوسوم بالأكثر استعمالًا أوّلًا', () => {
    const { root } = mount([
      { name: 'نادر', count: 1 },
      { name: 'شائع', count: 10 },
    ])
    const names = [...root.querySelectorAll('[data-tag-name]')].map((el) =>
      el.getAttribute('data-tag-name'),
    )
    expect(names).toEqual(['شائع', 'نادر'])
  })

  it('يعرض العدد الهندي بجوار كل وسم', () => {
    const { root } = mount([{ name: 'خطأ', count: 3 }])
    expect(root.textContent).toContain('٣')
  })
})

describe('TagsPanel — الاختيار', () => {
  it('النقر على وسم غير نشِط يستدعي onSelectTag باسمه', () => {
    const { root, onSelectTag } = mount([{ name: 'خطأ', count: 1 }])
    const button = root.querySelector('[data-tag-name="خطأ"]') as HTMLButtonElement
    button.click()
    expect(onSelectTag).toHaveBeenCalledWith('خطأ')
  })

  it('النقر على وسم نشِط بالفعل يستدعي onSelectTag(null) — إلغاء التصفية', () => {
    const { root, onSelectTag } = mount([{ name: 'خطأ', count: 1 }], 'خطأ')
    const button = root.querySelector('[data-tag-name="خطأ"]') as HTMLButtonElement
    expect(button.getAttribute('aria-pressed')).toBe('true')
    button.click()
    expect(onSelectTag).toHaveBeenCalledWith(null)
  })
})

describe('TagsPanel — الإغلاق', () => {
  it('زرّ الإغلاق يستدعي onClose', () => {
    const { root, onClose } = mount([])
    const closeButton = root.querySelector('[aria-label="إغلاق لوحة الوسوم"]') as HTMLButtonElement
    closeButton.click()
    expect(onClose).toHaveBeenCalled()
  })
})
