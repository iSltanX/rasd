/**
 * «عن رصد» — «ما الجديد» و«جولة التعريف» صفّان بمحرّكهما، لا «قريبًا».
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutSection } from '@/pages/settings/parts/AboutSection'
import { entryFor } from '@/pages/shell/whats-new'
import { PAGE_PATHS } from '@/shared/page-paths'

import pkg from '../../../../package.json' with { type: 'json' }

let container: HTMLDivElement | null = null

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<AboutSection version={pkg.version} />, container)
  return container
}

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('AboutSection — الإصدار', () => {
  it('لا «قريبًا» في مجموعة الإصدار', () => {
    const group = mount().querySelector('#about-version')!
    expect(group.textContent).not.toContain('قريبًا')
  })

  it('«اعرض» يفتح بطاقة الإصدار المثبَّت ببنوده من السجلّ', () => {
    const root = mount()
    button(root, 'اعرض')!.click()
    return vi.waitFor(() => {
      const items = [...root.querySelectorAll('[role="dialog"] li')].map((li) => li.textContent)
      expect(items).toEqual(entryFor(pkg.version)!.items)
    })
  })

  it('«أعد العرض» يفتح جولة التعريف في تبويب', () => {
    const create = vi.spyOn(chrome.tabs, 'create')
    button(mount(), 'أعد العرض')!.click()
    expect(create).toHaveBeenCalledWith({ url: chrome.runtime.getURL(PAGE_PATHS.onboarding) })
  })
})
