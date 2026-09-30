/**
 * `privacy / excluded-sites · empty` (`285:803`): القائمة الفارغة بطاقةٌ بعنوان وسطر كما في الإطار لا
 * سطر عارٍ، و«صدّر» معطَّل — تصدير قائمة فارغة يُنزّل ملفًّا لا شيء فيه.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExcludedSites } from '@/pages/settings/parts/ExcludedSites'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(sites: readonly string[]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <ExcludedSites sites={sites} onAdd={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} />,
    container,
  )
  return container
}

const exportButton = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === 'صدّر')!

describe('ExcludedSites — القائمة الفارغة', () => {
  it('بطاقة بعنوان «لا مواقع مستثناة» وسطرها', () => {
    const root = mount([])
    const empty = root.querySelector('[data-sites-empty]')
    expect(empty?.querySelector('strong')?.textContent).toBe('لا مواقع مستثناة')
    expect(empty?.textContent).toContain('رصد يعمل في كل موقع تفتحه فيه أداةً بنفسك')
  })

  it('«صدّر» معطَّل بلا مواقع، ومتاح بها', () => {
    expect(exportButton(mount([])).disabled).toBe(true)
    render(null, container!)
    container!.remove()
    expect(exportButton(mount(['bank.com'])).disabled).toBe(false)
  })
})
