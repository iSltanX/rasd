import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmptyState } from '@/ui/components/EmptyState/EmptyState'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.unstubAllGlobals()
})

/** `library / empty` (`94:55`): «اضغط ⇧⌘T في أي صفحة…» — الاختصار معزول فلا ينقلب في السطر العربي. */
describe('EmptyState — اختصار الالتقاط', () => {
  it.each([
    ['macOS', '⇧⌘T'],
    ['Linux', 'Ctrl+Shift+Q'],
  ])('%s ⟵ %s معزولًا LTR', (platform, shortcut) => {
    vi.stubGlobal('navigator', { ...navigator, userAgentData: { platform } })
    container = document.createElement('div')
    container.dir = 'rtl'
    document.body.appendChild(container)
    render(<EmptyState kind="no-captures" />, container)
    const iso = container.querySelector('bdi')
    expect(iso?.getAttribute('dir')).toBe('ltr')
    expect(iso?.textContent).toBe(shortcut)
  })
})
