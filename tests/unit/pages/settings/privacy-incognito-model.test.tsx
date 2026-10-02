import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ok } from '@/shared/result'
import { defaultSettings } from '@/shared/settings'

import type * as CapabilitiesModule from '@/shared/platform/capabilities'

/**
 * `privacy / incognito`: النموذج `split` ⟵ القائمة الثلاثية كما في الإطار؛ و`not_allowed` ⟵ جملةٌ صادقة بلا ضابط،
 * فلا خيارٌ يوحي بأن الإضافة تعمل في نافذةٍ خاصّة لا تعمل فيها (`Docs/Privacy.md` «التصفّح الخاص»).
 */
let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.doUnmock('@/shared/platform/capabilities')
  vi.resetModules()
})

async function mountWith(model: 'split' | 'not_allowed') {
  vi.resetModules()
  vi.doMock('@/shared/platform/capabilities', async (original) => ({
    ...(await original<typeof CapabilitiesModule>()),
    privateBrowsingModel: () => model,
  }))
  const { PrivacyTab } = await import('@/pages/settings/parts/PrivacyTab')
  const settings = defaultSettings()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <PrivacyTab
      settings={settings}
      view="controls"
      onView={() => undefined}
      onSave={() => Promise.resolve(ok(settings))}
      onAddSite={() => Promise.resolve(ok(settings))}
      onRemoveSite={() => Promise.resolve(ok(settings))}
      onImportSites={() => Promise.resolve({ result: ok(settings), added: 0, rejected: 0 })}
      persist={() => undefined}
    />,
    container,
  )
  await new Promise((r) => setTimeout(r, 0))
  return container
}

describe('PrivacyTab — التصفّح الخاص بحسب النموذج', () => {
  it('split ⟵ قائمة السلوك موجودة ولا جملة «لا يعمل»', async () => {
    const root = await mountWith('split')
    expect(root.querySelector('[aria-label="سلوك رصد في التصفّح الخاص"]')).not.toBeNull()
    expect(root.textContent).not.toContain('لا يعمل رصد في النوافذ الخاصّة')
  })

  it('not_allowed ⟵ الجملة بدل القائمة، ولا ضابط في الصفّ', async () => {
    const root = await mountWith('not_allowed')
    expect(root.querySelector('[aria-label="سلوك رصد في التصفّح الخاص"]')).toBeNull()
    const hint = root.querySelector('#privacy-incognito-hint')
    expect(hint?.textContent).toBe('لا يعمل رصد في النوافذ الخاصّة في Firefox.')
    const row = hint?.closest('div')?.parentElement
    expect(row?.querySelector('select, button, [role="combobox"]')).toBeNull()
  })
})
