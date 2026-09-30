/**
 * جولة التعريف — الخطوات الأربع، والتخطّي الصريح، ونصوص الصلاحيات من مصدرها.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { finishOnboarding } from '@/pages/onboarding/finish'
import { Onboarding } from '@/pages/onboarding/Onboarding'
import {
  HOST_PERMISSION_RATIONALE,
  REQUIRED_PERMISSION_RATIONALE,
} from '@/shared/permission-policy'
import { getSettings, resetSettingsCache } from '@/shared/settings'

let container: HTMLDivElement | null = null

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
  Object.assign(globalThis.chrome, {
    commands: {
      getAll: vi.fn().mockResolvedValue([{ name: 'capture-area', shortcut: 'Ctrl+Shift+Q' }]),
    },
  })
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  history.replaceState(null, '', '/')
  Object.assign(chrome.tabs, { getCurrent: originalGetCurrent })
})

function mount(): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Onboarding />, container)
  return container
}

/**
 * `getCurrent` بتوقيعَيه (الوعد والنداء الراجع) لا يقبل وعدًا من `spyOn` في الأنواع — فيُستبدل بدالّة
 * مزيّفة، ويُعاد الأصل بعد كل اختبار.
 */
const originalGetCurrent = chrome.tabs.getCurrent
function currentTab(tab: chrome.tabs.Tab | undefined) {
  Object.assign(chrome.tabs, { getCurrent: vi.fn().mockResolvedValue(tab) })
}

const visible = (root: HTMLElement) => root.querySelector('section:not([aria-hidden="true"])')!
const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('الخطوات الأربع', () => {
  it('خطوة واحدة ظاهرة لقارئ الشاشة، و«التالي» يتقدّم حتى «ابدأ»', async () => {
    const root = mount()
    const titles: string[] = []
    for (let i = 0; i < 4; i++) {
      expect(root.querySelectorAll('section:not([aria-hidden="true"])')).toHaveLength(1)
      titles.push(visible(root).querySelector('h1')!.textContent)
      expect(visible(root).textContent).toContain(`الخطوة ${'١٢٣٤'[i]} من ٤`)
      const next = button(root, 'التالي')
      if (i < 3) {
        expect(button(root, 'تخطَّ')).toBeDefined()
        next!.click()
        await Promise.resolve()
        await new Promise((r) => setTimeout(r, 0))
      } else {
        expect(next).toBeUndefined()
        expect(button(root, 'تخطَّ')).toBeUndefined()
        expect(button(root, 'ابدأ')).toBeDefined()
      }
    }
    expect(titles).toEqual([
      'افحص أي صفحة من مكانها',
      'يعمل حين تطلبه أنت',
      'أربعة اختصارات للالتقاط',
      'التقط أوّل لقطة',
    ])
  })

  it('الخطوة الثانية تشرح الصلاحيات بنصوص permission-policy.ts نفسها ولا تطلب شيئًا', () => {
    history.replaceState(null, '', '/?step=2')
    const request = vi.fn()
    Object.assign(globalThis.chrome, { permissions: { request } })
    const root = mount()
    const notes = [...visible(root).querySelectorAll('li')].map((li) => li.textContent)
    expect(notes).toEqual([
      REQUIRED_PERMISSION_RATIONALE.activeTab,
      REQUIRED_PERMISSION_RATIONALE.scripting,
      HOST_PERMISSION_RATIONALE,
    ])
    expect(request).not.toHaveBeenCalled()
  })

  it('الخطوة الثالثة تعرض اختصار «منطقة» كما سجّله المتصفّح', async () => {
    history.replaceState(null, '', '/?step=3')
    const root = mount()
    await vi.waitFor(() =>
      expect([...root.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
        'Ctrl',
        'Shift',
        'Q',
      ]),
    )
  })
})

describe('الإنهاء والتخطّي', () => {
  it('«تخطَّ» يكتب «شوهد» ثمّ يُغلق التبويب', async () => {
    const tab = await chrome.tabs.create({ url: 'chrome-extension://x/onboarding.html' })
    currentTab(tab)
    const remove = vi.spyOn(chrome.tabs, 'remove').mockResolvedValue(undefined)
    const root = mount()
    button(root, 'تخطَّ')!.click()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith(tab.id))
    expect((await getSettings()).onboarding.completed).toBe(true)
  })

  it('تعذّر الإغلاق بعد الكتابة ⇐ الصفحة تقول إن الجولة انتهت، لا زرٌّ صامت', async () => {
    const tab = await chrome.tabs.create({ url: 'chrome-extension://x/onboarding.html' })
    currentTab(tab)
    vi.spyOn(chrome.tabs, 'remove').mockRejectedValue(new Error('gone'))
    const root = mount()
    button(root, 'تخطَّ')!.click()
    await vi.waitFor(() =>
      expect(root.querySelector('[role="status"]')?.textContent).toContain('انتهت الجولة'),
    )
  })

  it('آخر تبويب في نافذته لا يُغلقها — يُفتح قبله تبويب جديد', async () => {
    const [only] = await chrome.tabs.query({})
    currentTab(only)
    const create = vi.spyOn(chrome.tabs, 'create')
    vi.spyOn(chrome.tabs, 'remove').mockResolvedValue(undefined)
    const result = await finishOnboarding(42)
    expect(result).toEqual({ ok: true, value: 'closed' })
    expect(create).toHaveBeenCalledWith({ windowId: only!.windowId, url: 'chrome://newtab/' })
    expect((await getSettings()).onboarding).toEqual({ completed: true, completedAt: 42 })
  })

  it('كتابة فاشلة ⇐ الصفحة تبقى مفتوحة برسالة وزرّ إعادة', async () => {
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('quota'))
    const remove = vi.spyOn(chrome.tabs, 'remove')
    const root = mount()
    button(root, 'تخطَّ')!.click()
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull())
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('تعذّر حفظ ذلك')
    expect(button(root, 'أعد المحاولة')).toBeDefined()
    expect(remove).not.toHaveBeenCalled()
  })
})
