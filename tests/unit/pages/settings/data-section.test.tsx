import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dropReasonText,
  lastBackupText,
  settingLabel,
  UNLABELLED,
} from '@/pages/settings/data-context'
import { confirmMatches } from '@/pages/settings/parts/data/DeleteDialog'
import { DataSection } from '@/pages/settings/parts/DataSection'
import { defaultSettings, getSettings, resetSettingsCache } from '@/shared/settings'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { DB_NAME, STORE_NAMES } from '@/shared/storage/schema'

import { libraryFixture, seedDatabase, settingsFixture } from '../../data/library-fixture'

let container: HTMLDivElement | null = null

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  resetSettingsCache()
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

function unmount() {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
}

afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface StorageStub {
  usage?: number
  quota?: number
  persisted?: boolean
  persist?: () => Promise<boolean>
}

function stubStorage({
  usage = 0,
  quota = 10 * 1024 ** 3,
  persisted = false,
  persist,
}: StorageStub) {
  vi.stubGlobal('navigator', {
    ...navigator,
    storage: {
      estimate: () => Promise.resolve({ usage, quota }),
      persisted: () => Promise.resolve(persisted),
      persist: persist ?? (() => Promise.resolve(false)),
    },
  })
}

async function mount(storage: StorageStub = {}, settings = defaultSettings()) {
  stubStorage(storage)
  const announce = vi.fn()
  const changed = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <DataSection settings={settings} onAnnounce={announce} onLibraryChanged={changed} />,
    container,
  )
  await vi.waitFor(() => expect(container?.textContent).toContain('من حصّة'))
  await vi.waitFor(() => expect(container?.querySelector('[data-persistence]')).not.toBeNull())
  return { root: container, announce, changed }
}

const text = () => container?.textContent ?? ''

function button(label: string, scope: ParentNode | null = container): HTMLButtonElement {
  const found = [...(scope?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === label,
  )
  if (!found) throw new Error(`no button «${label}»`)
  return found
}

/** سطر «المساحة المستخدمة» — `settings / data` (`282:1318`): «١٨٤ ميغابايت من حصّة…». */
describe('DataSection — المساحة المستخدمة', () => {
  it('ما دون الميغابايت لا يُقرَّب إلى «٠ ميغابايت» بجوار شارة بالكيلوبايت', async () => {
    await mount({ usage: 286 * 1024 })
    expect(text()).toContain('أقلّ من ميغابايت من حصّة')
    expect(text()).not.toContain('٠ ميغابايت')
  })

  it('الميغابايتات عدٌّ بشري بأرقام هندية', async () => {
    await mount({ usage: 184 * 1024 * 1024 })
    expect(text()).toContain('١٨٤ ميغابايت من حصّة')
  })

  it('المؤشّر يعرض قيمة `storage.estimate` لا ثابتًا — قيمتان تعطيان عرضين', async () => {
    await mount({ usage: 184 * 1024 * 1024 })
    const first = container?.querySelector('[data-usage-bytes]')?.getAttribute('data-usage-bytes')
    const firstText = text()
    unmount()

    await mount({ usage: 3 * 1024 * 1024 })
    const second = container?.querySelector('[data-usage-bytes]')?.getAttribute('data-usage-bytes')
    expect(first).toBe(String(184 * 1024 * 1024))
    expect(second).toBe(String(3 * 1024 * 1024))
    expect(text()).toContain('٣ ميغابايت من حصّة')
    expect(firstText).not.toBe(text())
  })

  it('تنبيهٌ قبل الامتلاء بعتبة المكتبة: ٨٠٪ تحذير، ٩٥٪ منع — ولا تنبيه تحتها', async () => {
    await mount({ usage: 79, quota: 100 })
    expect(text()).not.toContain('تكاد تمتلئ')
    unmount()

    await mount({ usage: 85, quota: 100 })
    expect(text()).toContain('المساحة تكاد تمتلئ')
    unmount()

    await mount({ usage: 96, quota: 100 })
    expect(text()).toContain('المساحة ممتلئة تقريبًا')
  })
})

describe('DataSection — التخزين الدائم', () => {
  it('مكتبةٌ فارغة: لا طلب، «غير مفعَّل»', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    await mount({ persist })
    expect(persist).not.toHaveBeenCalled()
    expect(container?.querySelector('[data-persistence]')?.getAttribute('data-persistence')).toBe(
      'not-requested',
    )
  })

  it('مكتبةٌ فيها لقطات: يُطلب، ويُعرض ما قرّره المتصفّح', async () => {
    await seedDatabase(libraryFixture())
    const persist = vi.fn(() => Promise.resolve(false))
    await mount({ persist })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(text()).toContain('لم يمنحه المتصفّح')
  })

  it('ممنوح: «مفعَّل»', async () => {
    await mount({ persisted: true })
    expect(text()).toContain('مفعَّل')
  })
})

describe('DataSection — حذف كل البيانات بتأكيدٍ مزدوج', () => {
  it('الخطوة الأولى تسمّي ما سيُحذف وتعرض النسخة أوّلًا، والثانية لا تحذف قبل الكلمة', async () => {
    await seedDatabase(libraryFixture())
    await fakeBrowser.storage.local.set({ 'rasd:settings': settingsFixture() })
    const { changed } = await mount()

    button('احذف كل البيانات').click()
    await vi.waitFor(() => expect(text()).toContain('الخطوة ١ من ٢'))
    expect(text()).toContain('الحذف نهائي')
    expect(text()).toContain('٣ لقطات')
    expect(text()).toContain('كلّها، ومعها المواقع المستثناة')
    expect(text()).toContain('خذ نسخة احتياطية أوّلًا')
    expect(text()).toContain('آخر نسخة: لم تُؤخذ نسخة بعد')
    // التركيز على «ألغِ» لا على الفعل.
    expect(document.activeElement?.textContent?.trim()).toBe('ألغِ')

    button('تابع إلى التأكيد').click()
    await vi.waitFor(() => expect(text()).toContain('الخطوة ٢ من ٢'))
    const confirm = container!.querySelector<HTMLButtonElement>('[data-rasd-confirm]')!
    expect(confirm.disabled).toBe(true)
    confirm.click()
    await new Promise((r) => setTimeout(r, 20))
    const db = await database()
    expect(await db.count('captures')).toBe(3)

    const input = container!.querySelector<HTMLInputElement>('#data-delete-word')!
    input.value = 'احذف'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() =>
      expect(container!.querySelector<HTMLButtonElement>('[data-rasd-confirm]')!.disabled).toBe(
        false,
      ),
    )
    container!.querySelector<HTMLButtonElement>('[data-rasd-confirm]')!.click()

    await vi.waitFor(() => expect(text()).toContain('حُذفت كل البيانات'))
    for (const store of STORE_NAMES) expect(await db.count(store), store).toBe(0)
    expect(await fakeBrowser.storage.local.get(null)).toEqual({})
    expect(changed).toHaveBeenCalled()
  })

  it('«ألغِ» في أيّ خطوة لا يحذف شيئًا', async () => {
    await seedDatabase(libraryFixture())
    await mount()
    button('احذف كل البيانات').click()
    await vi.waitFor(() => expect(text()).toContain('الخطوة ١ من ٢'))
    button('تابع إلى التأكيد').click()
    await vi.waitFor(() => expect(text()).toContain('الخطوة ٢ من ٢'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => expect(text()).not.toContain('الخطوة ٢ من ٢'))
    const db = await database()
    expect(await db.count('captures')).toBe(3)
  })

  it('كلمة التأكيد تُطبَّع: الهمزة والتشكيل والمسافات — وغيرها لا يُقبل', () => {
    expect(confirmMatches('احذف')).toBe(true)
    expect(confirmMatches('  إحذف ')).toBe(true)
    expect(confirmMatches('احْذِفْ')).toBe(true)
    expect(confirmMatches('احذ')).toBe(false)
    expect(confirmMatches('delete')).toBe(false)
    expect(confirmMatches('')).toBe(false)
  })
})

describe('DataSection — إعادة الضبط', () => {
  it('«أبقِ القائمة» محدَّدٌ ابتداءً، والتأكيد يُبقيها ويعلن', async () => {
    const settings = settingsFixture()
    await fakeBrowser.storage.local.set({ 'rasd:settings': settings })
    const { announce } = await mount({}, settings)

    button('أعد الضبط').click()
    await vi.waitFor(() => expect(text()).toContain('إعادة ضبط الإعدادات'))
    expect(text()).toContain('٣ مواقع. حذفها يعيد رصد إلى العمل فيها.')
    const box = container!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box.checked).toBe(true)

    const dialog = container!.querySelector('[data-data-dialog="reset"]')!
    button('أعد الضبط', dialog).click()
    await vi.waitFor(() => expect(announce).toHaveBeenCalled())
    const s = await getSettings()
    expect(s.capture.format).toBe('png')
    expect(s.privacy.excludedSites).toEqual(settings.privacy.excludedSites)
  })
})

describe('نصوص قسم البيانات', () => {
  it('لكل إعدادٍ ينتقل في الملفّ اسمٌ يُعرض', () => {
    expect(UNLABELLED).toEqual([])
    expect(settingLabel('capture.format')).toBe('الصيغة الافتراضية')
    expect(settingLabel('appearance.sparkle')).toBe('appearance.sparkle')
  })

  it('سبب الإسقاط يقول القيمة والسبب', () => {
    expect(dropReasonText({ path: 'capture.format', reason: 'option', received: 'svg' })).toBe(
      'القيمة في الملفّ «svg»، وليست من خيارات رصد',
    )
    expect(dropReasonText({ path: 'x', reason: 'type', received: 7 })).toContain('رقم')
    expect(dropReasonText({ path: 'x', reason: 'unknown', received: true })).toContain('لا يعرفه')
  })

  it('«آخر نسخة»: لم تُؤخذ، أو اليوم بالساعة، أو بالتاريخ', () => {
    const now = new Date(2026, 8, 30, 15, 0).getTime()
    expect(lastBackupText(null, now)).toBe('آخر نسخة: لم تُؤخذ نسخة بعد')
    expect(lastBackupText(new Date(2026, 8, 30, 9, 5).getTime(), now)).toContain('اليوم')
    expect(lastBackupText(new Date(2026, 8, 12).getTime(), now)).toContain('سبتمبر')
  })
})
