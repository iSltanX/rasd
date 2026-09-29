import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  dateFromFor,
  SortSelect,
  Toolbar,
  type CaptureFilters,
  type ToolbarProps,
} from '@/pages/library/parts/Toolbar'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function filters(over: Partial<CaptureFilters> = {}): CaptureFilters {
  return {
    kind: 'all',
    onKindChange: vi.fn(),
    date: 'any',
    onDateChange: vi.fn(),
    tagsOpen: false,
    onToggleTags: vi.fn(),
    ...over,
  }
}

function mount(over: Partial<ToolbarProps> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const onSearchChange = vi.fn()
  const onToggleProjects = vi.fn()

  render(
    <Toolbar
      searchQuery=""
      onSearchChange={onSearchChange}
      searchPlaceholder="ابحث في اللقطات…"
      captureFilters={filters()}
      projectsOpen={false}
      onToggleProjects={onToggleProjects}
      {...over}
    />,
    container,
  )

  return { root: container, onSearchChange, onToggleProjects }
}

function change(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change'))
}

describe('Toolbar', () => {
  it('يعرض حقل بحث بتسمية إتاحة ونصّ العرض الحالي', () => {
    const { root } = mount()
    const input = root.querySelector('[aria-label="ابحث في المكتبة"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.placeholder).toBe('ابحث في اللقطات…')
  })

  it('الكتابة في البحث تستدعي onSearchChange بالقيمة', () => {
    const { root, onSearchChange } = mount()
    const input = root.querySelector('input[type="search"]') as HTMLInputElement
    input.value = 'مراجعة'
    input.dispatchEvent(new Event('input'))
    expect(onSearchChange).toHaveBeenCalledWith('مراجعة')
  })

  it('مرشّح النوع يعرض أنواع الالتقاط الأربعة المنتَجة — لا «نافذة» المؤجَّلة', () => {
    const { root } = mount()
    const select = root.querySelector('[aria-label="نوع اللقطة"]') as HTMLSelectElement
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toEqual(['كل الأنواع', 'منطقة', 'عنصر', 'الظاهر', 'صفحة كاملة'])
  })

  it('اختيار نوع وتاريخ يستدعي معالجَيهما بالقيمة', () => {
    const f = filters()
    const { root } = mount({ captureFilters: f })
    change(root.querySelector('[aria-label="نوع اللقطة"]') as HTMLSelectElement, 'element')
    change(root.querySelector('[aria-label="تاريخ الالتقاط"]') as HTMLSelectElement, 'week')
    expect(f.onKindChange).toHaveBeenCalledWith('element')
    expect(f.onDateChange).toHaveBeenCalledWith('week')
  })

  it('زرّ الوسوم يفتح لوحتها ويُسمّى بحالتها', () => {
    const f = filters({ tagsOpen: false })
    const { root } = mount({ captureFilters: f })
    const button = root.querySelector('[aria-label="فتح لوحة الوسوم"]') as HTMLButtonElement
    expect(button.textContent).toContain('الوسوم')
    button.click()
    expect(f.onToggleTags).toHaveBeenCalled()

    mount({ captureFilters: filters({ tagsOpen: true }) })
    expect(container!.querySelector('[aria-label="إغلاق لوحة الوسوم"]')).toBeTruthy()
  })

  it('خارج عروض اللقطات: البحث وحده، بلا مرشّحات النوع والتاريخ والوسوم', () => {
    const { root } = mount({ captureFilters: null })
    expect(root.querySelector('[aria-label="ابحث في المكتبة"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="نوع اللقطة"]')).toBeFalsy()
    expect(root.querySelector('[aria-label="تاريخ الالتقاط"]')).toBeFalsy()
    expect(root.querySelector('[aria-label="فتح لوحة الوسوم"]')).toBeFalsy()
  })

  it('زرّ المشاريع يبدّل لوحتها، واسمه يحوي نصّه المرئي', () => {
    const { root, onToggleProjects } = mount()
    const button = root.querySelector('[aria-label="فتح لوحة المشاريع"]') as HTMLButtonElement
    expect(button.getAttribute('aria-label')).toContain(button.textContent?.trim())
    button.click()
    expect(onToggleProjects).toHaveBeenCalled()
  })
})

describe('SortSelect', () => {
  function mountSort(sortKey: 'date' | 'project' = 'date', sortDirection: 'asc' | 'desc' = 'desc') {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SortSelect sortKey={sortKey} sortDirection={sortDirection} onChange={onChange} />,
      container,
    )
    return {
      select: container.querySelector('[aria-label="ترتيب حسب"]') as HTMLSelectElement,
      onChange,
    }
  }

  it('يعرض أبعاد الترتيب الأربعة للقطات، والتاريخ في الاتجاهين', () => {
    const { select } = mountSort()
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toEqual([
      'مرتّبة من الأحدث',
      'مرتّبة من الأقدم',
      'حسب المشروع',
      'حسب الموقع',
      'حسب النوع',
    ])
    expect(select.value).toBe('date:desc')
  })

  it('اختيار «من الأقدم» يقلب الاتجاه، واختيار المشروع يغيّر المفتاح', () => {
    const { select, onChange } = mountSort()
    change(select, 'date:asc')
    expect(onChange).toHaveBeenLastCalledWith('date', 'asc')
    change(select, 'project:asc')
    expect(onChange).toHaveBeenLastCalledWith('project', 'asc')
  })
})

describe('dateFromFor', () => {
  const NOW = new Date(2026, 8, 30, 15, 30).getTime()

  it('«أي تاريخ» بلا حدّ، و«اليوم» من منتصف ليل الجهاز لا آخر 24 ساعة', () => {
    expect(dateFromFor('any', NOW)).toBeUndefined()
    expect(dateFromFor('today', NOW)).toBe(new Date(2026, 8, 30).getTime())
  })

  it('الأسبوع والشهر سبعة أيام وثلاثون يومًا إلى الوراء', () => {
    const day = 24 * 60 * 60 * 1000
    expect(dateFromFor('week', NOW)).toBe(NOW - 7 * day)
    expect(dateFromFor('month', NOW)).toBe(NOW - 30 * day)
  })
})
