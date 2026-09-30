/**
 * التثبيت والترقية — معيارا قبول `STAGES/09`:
 *
 * - جولة التعريف تظهر عند `install`، ولا تظهر عند `update` ولا عند إعادة الإقلاع.
 * - «ما الجديد» تظهر مرّة عند `update` برقم نسخة أعلى، ولا تظهر عند `install`.
 *
 * «تظهر» هنا بمعناها الكامل: تبويب التأهيل يُفتح، وبطاقة «ما الجديد» تأخذها قشرة الصفحات
 * (`claimPendingWhatsNew`) — لا مجرّد علامة في الإعدادات.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleInstalled, registerInstallFlow } from '@/background/install-flow'
import { registerLifecycle } from '@/background/lifecycle'
import { claimPendingWhatsNew, type ChangelogEntry } from '@/pages/shell/whats-new'
import { PAGE_PATHS } from '@/shared/page-paths'
import { getSettings, patchSettings, resetSettingsCache } from '@/shared/settings'

const ENTRIES: ChangelogEntry[] = [
  { version: '1.1.0', date: null, items: ['بند جديد'] },
  { version: '1.0.0', date: null, items: ['بند قديم'] },
]

const onboardingUrl = () => chrome.runtime.getURL(PAGE_PATHS.onboarding)

async function openTabs(): Promise<string[]> {
  // المتصفّح المزيّف يبدأ بتبويب فارغ — المهمّ ما فتحته الإضافة.
  return (await chrome.tabs.query({})).map((t) => t.url ?? '').filter(Boolean)
}

// اختباران يستبدلان `runtime` و`extension` على الكائن المزيّف نفسه، و`reset()` لا يعيدهما.
const original = { runtime: globalThis.chrome.runtime, extension: globalThis.chrome.extension }

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
})

afterEach(() => {
  Object.assign(globalThis.chrome, original)
})

describe('جولة التعريف — عند التثبيت وحده', () => {
  it('install يفتح صفحة التأهيل ولا يكتب شيئًا في الإعدادات', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set')
    expect(await handleInstalled({ reason: 'install' }, '1.0.0')).toBe('onboarding')
    expect(await openTabs()).toEqual([onboardingUrl()])
    expect(set).not.toHaveBeenCalled()
  })

  it('الفتح يُطلب متزامنًا مع الحدث قبل أي انتظار — فيسبق تبويبًا يفتحه غيره بعد الإقلاع', () => {
    const create = vi.spyOn(chrome.tabs, 'create')
    void handleInstalled({ reason: 'install' }, '1.0.0')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('update لا يفتح التأهيل — والمستخدم القائم يُعامَل «شوهد» فلا تفاجئه الترحيبيّة', async () => {
    await handleInstalled({ reason: 'update', previousVersion: '1.0.0' }, '1.1.0')
    expect(await openTabs()).toEqual([])
    const { onboarding } = await getSettings()
    expect(onboarding.completed).toBe(true)
    // `null`: كتبتها الترقية لا المستخدم.
    expect(onboarding.completedAt).toBeNull()
  })

  it('بيانات النسخة السابقة كما هي على القرص (بلا whatsNew) ⇐ تُرقّى ولا يضيع منها شيء', async () => {
    // شكل الإعدادات قبل هذه المرحلة حرفيًّا: لا مفتاح `whatsNew`، وقائمة مواقع مستثناة قائمة.
    await chrome.storage.local.set({
      'rasd:settings': {
        schemaVersion: 1,
        privacy: { incognito: 'allow', excludedSites: ['bank.example'] },
        onboarding: { completed: false, completedAt: null },
      },
    })
    await handleInstalled({ reason: 'update', previousVersion: '0.1.0' }, '1.0.0')
    const s = await getSettings()
    expect(s.privacy.excludedSites).toEqual(['bank.example'])
    expect(s.privacy.incognito).toBe('allow')
    expect(s.onboarding.completed).toBe(true)
    expect(s.whatsNew.pending).toBe('1.0.0')
  })

  it('ومن أتمّها بيده تبقى لحظة إتمامه كما هي', async () => {
    await patchSettings({ onboarding: { completed: true, completedAt: 1234 } })
    await handleInstalled({ reason: 'update', previousVersion: '1.0.0' }, '1.1.0')
    expect((await getSettings()).onboarding).toEqual({ completed: true, completedAt: 1234 })
  })

  it('إعادة الإقلاع (onStartup وتسجيل المستمعين) لا تفتح شيئًا', async () => {
    Object.assign(globalThis.chrome, {
      runtime: { ...globalThis.chrome.runtime, onConnect: { addListener: vi.fn() } },
      alarms: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(undefined),
        onAlarm: { addListener: vi.fn() },
      },
    })
    registerLifecycle()
    await fakeBrowser.runtime.onStartup.trigger()
    await new Promise((r) => setTimeout(r, 0))
    expect(await openTabs()).toEqual([])
  })

  it('المستمع مسجَّل على onInstalled فعلًا', async () => {
    registerInstallFlow()
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' })
    await vi.waitFor(async () => expect(await openTabs()).toEqual([onboardingUrl()]))
  })

  it('تحديث المتصفّح ليس تحديث رصد', async () => {
    expect(await handleInstalled({ reason: 'chrome_update' }, '1.0.0')).toBe('ignored')
    expect(await openTabs()).toEqual([])
    expect((await getSettings()).onboarding.completed).toBe(false)
  })

  it('نسخة التصفّح الخاص تترك الحدث — لا صفحة ثانية فوق الأولى', async () => {
    Object.assign(globalThis.chrome, {
      extension: { ...globalThis.chrome.extension, inIncognitoContext: true },
    })
    expect(await handleInstalled({ reason: 'install' }, '1.0.0')).toBe('ignored')
    expect(await openTabs()).toEqual([])
  })
})

describe('«ما الجديد» — مرّة عند ترقية لنسخة أعلى', () => {
  it('update لنسخة أعلى ⇐ البطاقة تظهر مرّة واحدة ثمّ لا', async () => {
    expect(await handleInstalled({ reason: 'update', previousVersion: '1.0.0' }, '1.1.0')).toBe(
      'upgraded',
    )
    expect(await claimPendingWhatsNew('1.1.0', ENTRIES)).toEqual(ENTRIES[0])
    expect(await claimPendingWhatsNew('1.1.0', ENTRIES)).toBeNull()
  })

  it('install ⇐ لا بطاقة', async () => {
    await handleInstalled({ reason: 'install' }, '1.1.0')
    expect(await claimPendingWhatsNew('1.1.0', ENTRIES)).toBeNull()
  })

  it.each([
    ['النسخة نفسها (إعادة تحميل)', '1.1.0', 'reloaded'],
    ['نسخة أقدم', '1.2.0', 'reloaded'],
    ['سابقة غائبة', undefined, 'reloaded'],
    ['سابقة غير صالحة', 'abc', 'reloaded'],
  ])('update من %s ⇐ لا بطاقة', async (_label, previousVersion, outcome) => {
    expect(await handleInstalled({ reason: 'update', previousVersion }, '1.1.0')).toBe(outcome)
    expect(await claimPendingWhatsNew('1.1.0', ENTRIES)).toBeNull()
  })

  it('المقارنة رقمية لا نصّية: 1.10.0 أعلى من 1.9.0', async () => {
    const entries = [{ version: '1.10.0', date: null, items: ['عاشرة'] }]
    await handleInstalled({ reason: 'update', previousVersion: '1.9.0' }, '1.10.0')
    expect(await claimPendingWhatsNew('1.10.0', entries)).toEqual(entries[0])
  })

  it('قراءة إعدادات فاشلة عند الترقية ⇐ لا كتابة (لا افتراضيات فوق القائم)', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('storage down'))
    const set = vi.spyOn(chrome.storage.local, 'set')
    expect(await handleInstalled({ reason: 'update', previousVersion: '1.0.0' }, '1.1.0')).toBe(
      'failed',
    )
    expect(set).not.toHaveBeenCalled()
  })
})
