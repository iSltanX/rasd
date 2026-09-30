import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DataSection } from '@/pages/settings/parts/DataSection'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.unstubAllGlobals()
})

async function mount(usage: number) {
  vi.stubGlobal('navigator', {
    ...navigator,
    storage: {
      estimate: () => Promise.resolve({ usage, quota: 10 * 1024 ** 3 }),
      persisted: () => Promise.resolve(false),
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<DataSection />, container)
  await vi.waitFor(() => expect(container?.textContent).toContain('من حصّة'))
  return container.textContent ?? ''
}

/** سطر «المساحة المستخدمة» — `settings / data` (`282:1318`): «١٨٤ ميغابايت من حصّة…». */
describe('DataSection — المساحة المستخدمة', () => {
  it('ما دون الميغابايت لا يُقرَّب إلى «٠ ميغابايت» بجوار شارة بالكيلوبايت', async () => {
    const text = await mount(286 * 1024)
    expect(text).toContain('أقلّ من ميغابايت من حصّة')
    expect(text).not.toContain('٠ ميغابايت')
  })

  it('الميغابايتات عدٌّ بشري بأرقام هندية', async () => {
    expect(await mount(184 * 1024 * 1024)).toContain('١٨٤ ميغابايت من حصّة')
  })
})
