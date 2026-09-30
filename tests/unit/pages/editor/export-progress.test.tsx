import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { ExportProgress } from '@/pages/editor/parts/ExportProgress'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount() {
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)
  render(
    <ExportProgress
      fraction={0.5}
      width={1280}
      height={800}
      scale={2}
      error={null}
      onCancel={() => undefined}
    />,
    container,
  )
  return container
}

/** بطاقة التقدّم — `editor / exporting` (`99:415`). */
describe('ExportProgress — العزل والترتيب', () => {
  it('المقياس معزول LTR داخل سطر عربي — لا ينقلب «×2» حول الكلمة العربية', () => {
    const root = mount()
    const detail = [...root.querySelectorAll('p')].find((p) => p.textContent?.includes('بدقّة'))
    const iso = detail?.querySelector('bdi')
    expect(iso?.getAttribute('dir')).toBe('ltr')
    expect(iso?.textContent).toBe('×2')
  })

  it('الأبعاد معزولة LTR، والنسبة قبلها في ترتيب القراءة', () => {
    const root = mount()
    const size = root.querySelector('[data-export-size]')
    const percent = root.querySelector('[data-export-percent]')
    expect(size?.tagName).toBe('BDI')
    expect(size?.getAttribute('dir')).toBe('ltr')
    expect(size?.textContent).toBe('1280 × 800')
    expect(percent?.textContent).toBe('50%')
    expect(
      percent && size
        ? percent.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).toBeTruthy()
  })
})
