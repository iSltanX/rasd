import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { Default } from '@/pages/popup/views/Default'

import type { RecentEntry } from '@/pages/popup/context'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(recent: RecentEntry[]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <Default
      onTool={() => undefined}
      recent={recent}
      onOpenRecent={() => undefined}
      onOpenLibrary={() => undefined}
    />,
    container,
  )
  return container
}

const link = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'عرض الكل')

/** `popup / no-recent` (`319:56341`) بلا «عرض الكل»، و`popup / default` (`50:13`) به. */
describe('Default — «عرض الكل» في مجموعة الأخيرة', () => {
  it('لا لقطات ⇐ لا رابط، والسطر الفارغ ظاهر', () => {
    const root = mount([])
    expect(link(root)).toBeUndefined()
    expect(root.textContent).toContain('لا لقطات بعد')
  })

  it('لقطة واحدة على الأقل ⇐ الرابط ظاهر', () => {
    const record = {
      id: 'c1',
      createdAt: 1,
      origin: 'https://example.com',
      title: 'لقطة',
    } as RecentEntry['record']
    const root = mount([{ record, thumbUrl: null, withheld: false }])
    expect(link(root)).toBeDefined()
  })
})
