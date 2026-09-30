import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BackupDialog } from '@/pages/settings/parts/data/BackupDialog'
import { ImportSettingsDialog } from '@/pages/settings/parts/data/ImportSettingsDialog'
import { RestoreDialog } from '@/pages/settings/parts/data/RestoreDialog'
import { stripIsolates } from '@/shared/bidi/isolate'
import { defaultSettings } from '@/shared/settings'
import { planSettingsImport } from '@/shared/settings/transfer'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { DB_NAME } from '@/shared/storage/schema'

import type { JSX } from 'preact'

/**
 * نوافذ قسم البيانات في حالاتها التي لا تحتاج مكتبةً كاملة: النسخ من مكتبة فارغة، والاستعادة من ملفٍّ ليس
 * نسخة، والاستيراد بما أُسقط منه. المحرّك نفسه مختبَرٌ على قاعدة حقيقية في `tests/integration/data-*`.
 */

let container: HTMLDivElement | null = null

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.restoreAllMocks()
})

function mount(node: JSX.Element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(node, container)
  return container
}

const text = () => stripIsolates(container?.textContent ?? '')

describe('نافذة النسخ', () => {
  it('مكتبةٌ فارغة: «لا شيء لتنسخه» ولا تنزيل', async () => {
    const delivered = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    mount(<BackupDialog route="anchor" note={null} onClose={vi.fn()} onDelivered={delivered} />)
    await vi.waitFor(() => expect(text()).toContain('لا شيء لتنسخه'))
    expect(container?.querySelector('[data-phase="empty"]')).not.toBeNull()
    expect(delivered).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
})

describe('نافذة الاستعادة', () => {
  it('ملفٌّ ليس نسخة: الخطأ بسببه، «لم يتغيّر شيء»، و«اختر ملفًّا آخر» لا «أعد المحاولة»', async () => {
    const restored = vi.fn()
    const file = new File(['this is not a zip'], 'notes.zip', { type: 'application/zip' })
    mount(
      <RestoreDialog
        file={file}
        retention={0}
        onClose={vi.fn()}
        onPickAnother={vi.fn()}
        onRestored={restored}
      />,
    )
    await vi.waitFor(() => expect(text()).toContain('الملفّ ليس نسخة احتياطية صالحة'))
    expect(text()).toContain('لم يتغيّر شيء في مكتبتك')
    expect(container?.querySelector('[data-failure="invalid"]')).not.toBeNull()
    expect(text()).toContain('اختر ملفًّا آخر')
    expect(text()).not.toContain('أعد المحاولة')
    expect(text()).not.toContain('أبلغ عن المشكلة')
    expect(restored).not.toHaveBeenCalled()
  })
})

describe('نافذة استيراد الإعدادات', () => {
  const file = (settings: object) =>
    JSON.stringify({ format: 'rasd.settings', version: 1, settings })

  it('ما أُسقط بأسمائه وأسبابه، والعدّان', () => {
    const planned = planSettingsImport(
      file({ capture: { format: 'svg' }, appearance: { theme: 'light' } }),
      defaultSettings(),
    )
    if (!planned.ok) throw new Error(planned.error)
    mount(
      <ImportSettingsDialog
        fileName="rasd-settings.json"
        plan={planned.value}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(text()).toContain('إعداد واحد') // قُبل: وضع السمة
    expect(text()).toContain('الصيغة الافتراضية')
    expect(text()).toContain('القيمة في الملفّ «svg»، وليست من خيارات رصد')
    expect(container?.querySelector('[data-import-dropped="1"]')).not.toBeNull()
  })

  it('لا شيء يُقبل: «احفظ المقبول» معطَّل ويُقال لماذا', () => {
    const planned = planSettingsImport(file({ capture: { format: 'svg' } }), defaultSettings())
    if (!planned.ok) throw new Error(planned.error)
    const save = vi.fn()
    mount(
      <ImportSettingsDialog
        fileName="x.json"
        plan={planned.value}
        onSave={save}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    const button = [...container!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'احفظ المقبول',
    )!
    expect(button.disabled).toBe(true)
    expect(text()).toContain('لا شيء في الملفّ يُقبل')
  })

  it('ملفٌّ مرفوض كلّه: سببه، ولا زرّ حفظ', () => {
    mount(
      <ImportSettingsDialog
        fileName="x.json"
        plan="newer"
        onSave={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(text()).toContain('الملفّ من إصدارٍ أحدث من رصد')
    expect(text()).not.toContain('احفظ المقبول')
  })
})
