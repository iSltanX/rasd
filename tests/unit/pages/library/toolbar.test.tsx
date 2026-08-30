import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toolbar, type ToolbarProps } from '@/pages/library/parts/Toolbar'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(over: Partial<ToolbarProps> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const onSearchChange = vi.fn()
  const onSortKeyChange = vi.fn()
  const onSortDirectionChange = vi.fn()
  const onFavoriteOnlyChange = vi.fn()

  render(
    <Toolbar
      searchQuery=""
      onSearchChange={onSearchChange}
      sortKey="date"
      onSortKeyChange={onSortKeyChange}
      sortDirection="desc"
      onSortDirectionChange={onSortDirectionChange}
      favoriteOnly={false}
      onFavoriteOnlyChange={onFavoriteOnlyChange}
      {...over}
    />,
    container,
  )

  return {
    root: container,
    onSearchChange,
    onSortKeyChange,
    onSortDirectionChange,
    onFavoriteOnlyChange,
  }
}

describe('Toolbar', () => {
  it('يعرض حقل بحث بتسمية إتاحة', () => {
    const { root } = mount()
    expect(root.querySelector('[aria-label="ابحث في المكتبة"]')).toBeTruthy()
  })

  it('الكتابة في البحث تستدعي onSearchChange بالقيمة', () => {
    const { root, onSearchChange } = mount()
    const input = root.querySelector('input[type="search"]') as HTMLInputElement
    input.value = 'مراجعة'
    input.dispatchEvent(new Event('input'))
    expect(onSearchChange).toHaveBeenCalledWith('مراجعة')
  })

  it('يعرض أربعة خيارات ترتيب مطابقة لأبعاد §10.5 المتاحة للقطات', () => {
    const { root } = mount()
    const sortGroup = root.querySelector('[aria-label="ترتيب حسب"]')
    expect(sortGroup?.textContent).toContain('التاريخ')
    expect(sortGroup?.textContent).toContain('المشروع')
    expect(sortGroup?.textContent).toContain('الموقع')
    expect(sortGroup?.textContent).toContain('النوع')
  })

  it('اختيار مفتاح ترتيب مختلف يستدعي onSortKeyChange بالمفتاح الصحيح', () => {
    const { root, onSortKeyChange } = mount()
    const buttons = root.querySelectorAll('[aria-label="ترتيب حسب"] [role="radio"]')
    expect(buttons.length).toBe(4)
    ;(buttons[1] as HTMLElement).click()
    expect(onSortKeyChange).toHaveBeenCalledWith('project')
  })

  it('تبديل اتجاه الترتيب يستدعي onSortDirectionChange', () => {
    const { root, onSortDirectionChange } = mount({ sortDirection: 'desc' })
    const buttons = root.querySelectorAll('[aria-label="اتجاه الترتيب"] [role="radio"]')
    // desc محدَّد ابتداءً (الفهرس صفر) — الضغط على الثاني (asc) يبدِّل.
    ;(buttons[1] as HTMLElement).click()
    expect(onSortDirectionChange).toHaveBeenCalledWith('asc')
  })

  it('تفعيل «المفضَّلة فقط» يستدعي onFavoriteOnlyChange بالقيمة الصحيحة', () => {
    const { root, onFavoriteOnlyChange } = mount({ favoriteOnly: false })
    const toggle = root.querySelector('[aria-label="المفضَّلة فقط"]') as HTMLElement
    toggle.click()
    expect(onFavoriteOnlyChange).toHaveBeenCalledWith(true)
  })
})
