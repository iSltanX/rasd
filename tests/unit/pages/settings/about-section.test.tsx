/**
 * «عن رصد» — «ما الجديد» و«جولة التعريف» صفّان بمحرّكهما، لا «قريبًا».
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutSection } from '@/pages/settings/parts/AboutSection'
import { entryFor } from '@/pages/shell/whats-new'
import { OWNER_PAGES_LIVE, PRIVACY_POLICY_URL } from '@/shared/links'
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

function mount(props: { privacyPolicyUrl?: string | null } = {}): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<AboutSection version={pkg.version} {...props} />, container)
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

  it('«افتح» في نافذة التراخيص يفتح ملفّ النصوص الكاملة المشحون', async () => {
    const create = vi.spyOn(chrome.tabs, 'create')
    const root = mount()
    button(root, 'اعرض التراخيص')!.click()
    await vi.waitFor(() => expect(button(root, 'افتح')).toBeDefined())
    button(root, 'افتح')!.click()
    expect(create).toHaveBeenCalledWith({ url: chrome.runtime.getURL('THIRD_PARTY_LICENSES.txt') })
  })

  it('«أعد العرض» يفتح جولة التعريف في تبويب', () => {
    const create = vi.spyOn(chrome.tabs, 'create')
    button(mount(), 'أعد العرض')!.click()
    expect(create).toHaveBeenCalledWith({ url: chrome.runtime.getURL(PAGE_PATHS.onboarding) })
  })
})

/**
 * «سياسة الخصوصية» — صفحتها العامّة في موقع المالك (`STAGES/28`). قبل نشرها «قريبًا» لا رابطٌ يعطي 404،
 * وبعده زرٌّ يفتحها في تبويب.
 */
describe('AboutSection — سياسة الخصوصية', () => {
  const support = (root: HTMLElement) => root.querySelector('[aria-labelledby="about-support"]')!
  /** صفّ الإعداد نفسه: أقرب أبٍ لعنوانه يحمل ضابطه. */
  const privacyRow = (root: HTMLElement) =>
    [...support(root).querySelectorAll('span')].find((el) => el.textContent === 'سياسة الخصوصية')!
      .parentElement!.parentElement!

  it('صفحات المالك منشورة: الافتراضي «اقرأها» لا «قريبًا»', () => {
    expect(OWNER_PAGES_LIVE).toBe(true)
    const root = mount()
    expect(privacyRow(root).textContent).not.toContain('قريبًا')
    expect(button(root, 'اقرأها')).toBeDefined()
  })

  it('إن غابت الصفحة (null): «قريبًا» ولا زرّ', () => {
    const root = mount({ privacyPolicyUrl: null })
    expect(privacyRow(root).textContent).toContain('قريبًا')
    expect(button(root, 'اقرأها')).toBeUndefined()
  })

  it('حين تُنشر: «اقرأها» يفتح الرابط العامّ في تبويب، ولا «قريبًا» في مجموعة الدعم', () => {
    const create = vi.spyOn(chrome.tabs, 'create')
    const root = mount({ privacyPolicyUrl: PRIVACY_POLICY_URL })
    expect(support(root).textContent).not.toContain('قريبًا')
    button(root, 'اقرأها')!.click()
    expect(create).toHaveBeenCalledWith({ url: PRIVACY_POLICY_URL })
  })
})
