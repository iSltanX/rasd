import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PermissionsPanel } from '@/pages/settings/parts/PermissionsPanel'

/**
 * شاشة الصلاحيات والخدمات المسمّاة — الصفّ 365 من `Docs/Engineering.md §6`: صلاحية `api.github.com` تُمنح من
 * شاشة التكاملات، فلا تُعرض «موقعًا» ولا يسحبها «اسحب الكلّ». لها صفّها بسببها، ويسحبها زرّها وحده.
 */

const GITHUB = 'https://api.github.com/*'
const BANK = 'https://bank.example/*'

let container: HTMLDivElement | null = null
let remove: ReturnType<typeof vi.fn>
let request: ReturnType<typeof vi.fn>

async function mount(origins: string[]): Promise<HTMLElement> {
  remove = vi.fn().mockResolvedValue(true)
  request = vi.fn().mockResolvedValue(true)
  const noop = { addListener: vi.fn(), removeListener: vi.fn() }
  Object.assign(globalThis.chrome, {
    permissions: {
      contains: vi.fn().mockResolvedValue(false),
      getAll: vi.fn().mockResolvedValue({ origins }),
      request,
      remove,
      onAdded: noop,
      onRemoved: noop,
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<PermissionsPanel />, container)
  await vi.waitFor(() => expect(container?.textContent).toContain('خدمات خارجية'))
  // `getAll` ثمّ إعادة الرسم — بلا ترتيبٍ معلوم بين الاثنين.
  await new Promise((r) => setTimeout(r, 30))
  return container
}

const row = (root: HTMLElement, host: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>('div')].find(
    (d) => d.textContent?.startsWith(host) && d.querySelector('button') !== null,
  )!

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('الخدمة المسمّاة ليست «موقعًا»', () => {
  it('ممنوحةٌ وحدها: صفّ المواقع يقول «غير ممنوحة» وزرّه «امنح للكلّ»، وصفّها يقول ممنوحة', async () => {
    const root = await mount([GITHUB])
    const sites = [...root.querySelectorAll('span')].find(
      (s) => s.textContent === 'الوصول إلى المواقع',
    )!
    const siteRow = sites.closest('div')!.parentElement!
    expect(siteRow.textContent).toContain('غير ممنوحة.')
    expect(siteRow.textContent).not.toContain('api.github.com')
    expect(siteRow.querySelector('button')?.textContent).toBe('امنح للكلّ')

    const service = row(root, 'api.github.com')
    expect(service.textContent).toContain('لفتح Issue في مستودعك على GitHub')
    expect(service.textContent).toContain('ممنوحة.')
    expect(service.textContent).toContain('عند الرفض: لا يتّصل رصد بـGitHub')
    expect(service.querySelector('button')?.textContent).toBe('اسحب')
  })

  it('«اسحب الكلّ» يسحب مواقع المستخدم وحدها — لا الخدمة', async () => {
    const root = await mount([GITHUB, BANK])
    const sites = [...root.querySelectorAll('span')].find(
      (s) => s.textContent === 'الوصول إلى المواقع',
    )!
    const button = sites.closest('div')!.parentElement!.querySelector('button')!
    expect(button.textContent).toBe('اسحب الكلّ')
    button.click()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    expect(remove).toHaveBeenCalledWith({ origins: [BANK] })
  })

  it('زرّ الخدمة يسحبها وحدها، ويمنحها من النقرة إن لم تُمنح', async () => {
    let root = await mount([GITHUB, BANK])
    row(root, 'api.github.com').querySelector('button')!.click()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({ origins: [GITHUB] }))

    render(null, container!)
    container!.remove()
    container = null
    root = await mount([])
    row(root, 'api.github.com').querySelector('button')!.click()
    expect(request).toHaveBeenCalledWith({ origins: [GITHUB] })
  })
})
