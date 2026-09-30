import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SimpleSelectionBar } from '@/pages/library/parts/SimpleSelectionBar'

import type { ProjectRecord } from '@/shared/storage/schema'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const PROJECT: ProjectRecord = {
  id: 'p1',
  name: 'مشروع الفحص',
  color: '#0090FF',
  createdAt: 0,
  updatedAt: 0,
}

function mount(projects: readonly ProjectRecord[] = [PROJECT]) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const handlers = {
    onMoveToProject: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
  }

  render(<SimpleSelectionBar count={2} projects={projects} {...handlers} />, container)

  return { root: container, ...handlers }
}

describe('SimpleSelectionBar', () => {
  it('العدّاد هنديّ', () => {
    const { root } = mount()
    expect(root.textContent).toContain('٢ محدَّدة')
  })

  it('يعرض حذفًا نهائيًا وإلغاءً — لا تفضيل ولا أرشفة ولا وسم', () => {
    const { root } = mount()
    expect(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="إلغاء التحديد"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('[aria-label="أرشفة المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('input[name="tag"]')).toBeFalsy()
  })

  it('الحذف يفتح حوار التأكيد — «احذف» يستدعي onDelete', async () => {
    const { root, onDelete } = mount()
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    await Promise.resolve()
    expect(root.querySelector('[role="alertdialog"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    ;(root.querySelector('[data-rasd-confirm="delete"]') as HTMLButtonElement).click()
    expect(onDelete).toHaveBeenCalled()
  })

  it('«ألغِ» لا يستدعي onDelete', async () => {
    const { root, onDelete } = mount()
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    await Promise.resolve()
    ;(root.querySelector('[data-rasd-cancel="delete"]') as HTMLButtonElement).click()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('قائمة «انقل إلى مشروع» تستدعي onMoveToProject بمعرِّف المشروع وتُعاد إلى الخيار الأوّل', () => {
    const { root, onMoveToProject } = mount()
    const select = root.querySelector('[aria-label="انقل المحدَّد إلى مشروع"]') as HTMLSelectElement
    select.value = 'p1'
    select.dispatchEvent(new Event('change'))
    expect(onMoveToProject).toHaveBeenCalledWith('p1')
    expect(select.selectedIndex).toBe(0)
  })

  it('«بلا مشروع» يستدعي onMoveToProject بـnull', () => {
    const { root, onMoveToProject } = mount()
    const select = root.querySelector('[aria-label="انقل المحدَّد إلى مشروع"]') as HTMLSelectElement
    select.value = '__none__'
    select.dispatchEvent(new Event('change'))
    expect(onMoveToProject).toHaveBeenCalledWith(null)
  })

  it('لا قائمة مشاريع بلا مشاريع مبنيّة', () => {
    const { root } = mount([])
    expect(root.querySelector('[aria-label="انقل المحدَّد إلى مشروع"]')).toBeFalsy()
  })

  it('زرّ الإلغاء يستدعي onClear', () => {
    const { root, onClear } = mount()
    ;(root.querySelector('[aria-label="إلغاء التحديد"]') as HTMLButtonElement).click()
    expect(onClear).toHaveBeenCalled()
  })
})
