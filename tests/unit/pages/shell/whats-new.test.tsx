/**
 * بطاقة «ما الجديد» — تُؤخذ مرّة وتُمحى، وتُعرض بنودها من السجلّ، وتُغلق بـ«تمّ» و`Esc`.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { claimPendingWhatsNew, type ChangelogEntry } from '@/pages/shell/whats-new'
import { WhatsNewDialog } from '@/pages/shell/WhatsNewDialog'
import { getSettings, patchSettings, resetSettingsCache } from '@/shared/settings'

const ENTRY: ChangelogEntry = { version: '1.0.0', date: null, items: ['أوّل', 'ثانٍ'] }

let container: HTMLDivElement | null = null

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('claimPendingWhatsNew', () => {
  it('لا معلَّق ⇐ لا بطاقة ولا كتابة', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set')
    expect(await claimPendingWhatsNew('1.0.0', [ENTRY])).toBeNull()
    expect(set).not.toHaveBeenCalled()
  })

  it('معلَّقٌ لنسخة غير المثبَّتة ⇐ يُمحى ولا يُعرض', async () => {
    await patchSettings({ whatsNew: { pending: '0.9.0' } })
    expect(await claimPendingWhatsNew('1.0.0', [ENTRY])).toBeNull()
    expect((await getSettings()).whatsNew.pending).toBeNull()
  })

  it('معلَّقٌ بلا بنود في السجلّ ⇐ يُمحى ولا يُعرض', async () => {
    await patchSettings({ whatsNew: { pending: '2.0.0' } })
    expect(await claimPendingWhatsNew('2.0.0', [ENTRY])).toBeNull()
    expect((await getSettings()).whatsNew.pending).toBeNull()
  })

  it('المحو فشل ⇐ لا تُعرض الآن كي لا تتكرّر', async () => {
    await patchSettings({ whatsNew: { pending: '1.0.0' } })
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('quota'))
    expect(await claimPendingWhatsNew('1.0.0', [ENTRY])).toBeNull()
  })
})

describe('WhatsNewDialog', () => {
  function mount(onClose = vi.fn(), origin: 'update' | 'about' = 'update') {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<WhatsNewDialog entry={ENTRY} origin={origin} onClose={onClose} />, container)
    return { root: container, onClose }
  }

  it('«يظهر مرّة واحدة» بعد الترقية وحدها — لا حين يفتحها المستخدم من «عن رصد»', () => {
    expect(mount().root.querySelector('h2 + p')?.textContent).toBe('يظهر مرّة واحدة بعد التحديث')
    render(null, container!)
    container!.remove()
    expect(mount(vi.fn(), 'about').root.querySelector('h2 + p')?.textContent).toBe(
      'ما تغيّر في هذا الإصدار',
    )
  })

  it('العنوان بالنسخة المختصرة، والبنود من السجلّ، والعلامات زخرفةٌ لا مربّعات اختيار', () => {
    const { root } = mount()
    expect(root.querySelector('h2')?.textContent).toBe('ما الجديد في رصد 1.0')
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['أوّل', 'ثانٍ'])
    expect(root.querySelector('input[type="checkbox"], [role="checkbox"]')).toBeNull()
  })

  it('المستودع خاصّ ⇐ لا رابط «اقرأ سجلّ التغييرات» يعطي 404', () => {
    const { root } = mount()
    const labels = [...root.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).not.toContain('اقرأ سجلّ التغييرات')
    expect(labels).toContain('تمّ')
  })

  it('«تمّ» و`Esc` يغلقانها', async () => {
    const { root, onClose } = mount()
    ;[...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'تمّ')!.click()
    // مستمع `Esc` يُسجَّل في أثرٍ بعد الرسم — لا في الرسم نفسه.
    await new Promise((r) => setTimeout(r, 20))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
