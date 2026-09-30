/**
 * قشرة الصفحات تعرض «ما الجديد» المعلَّقة مرّة وتمحوها — حذف أثر الأخذ في `AppShell` يُسقط هذا.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/pages/shell/AppShell'
import { VERSION } from '@/shared/env'
import { getSettings, patchSettings, resetSettingsCache } from '@/shared/settings'

let containers: HTMLDivElement[] = []

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

afterEach(() => {
  for (const c of containers) {
    render(null, c)
    c.remove()
  }
  containers = []
})

function mount(): HTMLDivElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  containers.push(c)
  render(
    <AppShell activeId="settings">
      <p>محتوى</p>
    </AppShell>,
    c,
  )
  return c
}

describe('AppShell — «ما الجديد» بعد الترقية', () => {
  it('معلَّقةٌ للنسخة المثبَّتة ⇐ تظهر في أوّل صفحة وتُمحى، ولا تظهر في التالية', async () => {
    await patchSettings({ whatsNew: { pending: VERSION } })
    const first = mount()
    await vi.waitFor(() => expect(first.querySelector('[role="dialog"] li')).not.toBeNull())
    expect((await getSettings()).whatsNew.pending).toBeNull()

    const second = mount()
    await new Promise((r) => setTimeout(r, 30))
    expect(second.querySelector('[role="dialog"]')).toBeNull()
  })

  it('لا معلَّق ⇐ لا بطاقة', async () => {
    const root = mount()
    await new Promise((r) => setTimeout(r, 30))
    expect(root.querySelector('[role="dialog"]')).toBeNull()
  })
})
