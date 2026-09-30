import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PrivacyTab } from '@/pages/settings/parts/PrivacyTab'
import { ok } from '@/shared/result'
import { defaultSettings, type Settings } from '@/shared/settings'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const flush = () => new Promise((r) => setTimeout(r, 0))

async function mount(onAnnounce: (text: string) => void) {
  const settings: Settings = defaultSettings()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <PrivacyTab
      settings={{ ...settings, privacy: { ...settings.privacy, excludedSites: ['old.example'] } }}
      view="excluded-sites"
      onView={() => undefined}
      onSave={() => Promise.resolve(ok(settings))}
      onAddSite={() => Promise.resolve(ok(settings))}
      onRemoveSite={() => Promise.resolve(ok(settings))}
      onImportSites={() => Promise.resolve({ result: ok(settings), added: 0, rejected: 0 })}
      persist={() => undefined}
      onAnnounce={onAnnounce}
    />,
    container,
  )
  await flush()
  return container
}

/** `privacy / excluded-sites · saved` (`319:52144`) — الإضافة والحذف يُعلَنان كبقية الإعدادات. */
describe('PrivacyTab — المواقع المستثناة تُعلن حفظها', () => {
  it('إضافة ناجحة ⟵ «أُضيف الموقع»', async () => {
    const onAnnounce = vi.fn()
    const root = await mount(onAnnounce)
    const input = root.querySelector<HTMLInputElement>('[aria-label="نمط موقع يُستثنى"]')!
    input.value = 'bank.com'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(onAnnounce).toHaveBeenCalled())
    expect(onAnnounce.mock.calls[0]?.[0]).toContain('أُضيف الموقع')
  })

  it('حذف ناجح ⟵ «حُذف الموقع»', async () => {
    const onAnnounce = vi.fn()
    const root = await mount(onAnnounce)
    root
      .querySelector<HTMLButtonElement>('[aria-label="احذف old.example من المواقع المستثناة"]')!
      .click()
    await vi.waitFor(() => expect(onAnnounce).toHaveBeenCalled())
    expect(onAnnounce.mock.calls[0]?.[0]).toContain('حُذف الموقع')
  })
})
