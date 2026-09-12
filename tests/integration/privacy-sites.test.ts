/**
 * من واجهة الخصوصية إلى الامتناع عن الحقن — الوحدة 20.3.
 *
 * الإنفاذ نفسه مُثبَت منذ الوحدة 20.0 (‏`tests/unit/injection-gate.test.ts`
 * وحارس `pnpm verify:gate` الحيّ). الجديد الذي تملكه هذه الوحدة هو **النصف
 * الأوّل من السلسلة**: أن الواجهة تكتب النمط الصحيح فعلًا، وأن ما تكتبه هو
 * ما تقرؤه البوّابة بعده — لا أن كلًّا منهما صحيح وحده.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canOperateOnTab } from '@/background/gate'
import {
  addExcludedSite,
  importExcludedSites,
  removeExcludedSite,
  savePrivacy,
} from '@/pages/settings/context'
import { getSettings, resetSettingsCache } from '@/shared/settings'

/**
 * تخزينٌ حقيقي في الذاكرة لا `vi.fn()` ساكنة: الاختبار كلّه عن **ما يُقرأ
 * بعد ما يُكتب**، فمخزنٌ لا يحتفظ بما كُتب فيه يجعل كل توكيد بلا معنى.
 */
function installStorage(): { snapshot: () => unknown } {
  let store: Record<string, unknown> = {}
  Object.assign(globalThis.chrome, {
    storage: {
      ...globalThis.chrome.storage,
      local: {
        ...globalThis.chrome.storage.local,
        get: vi.fn((key: string) => Promise.resolve({ [key]: store[key] })),
        set: vi.fn((items: Record<string, unknown>) => {
          store = { ...store, ...items }
          return Promise.resolve()
        }),
      },
    },
  })
  return { snapshot: () => store['rasd:settings'] }
}

let tabsGet: ReturnType<typeof vi.fn>

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  installStorage()
  tabsGet = vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com/', incognito: false })
  Object.assign(globalThis.chrome, {
    tabs: { ...globalThis.chrome.tabs, get: tabsGet },
    permissions: { contains: vi.fn().mockResolvedValue(false) },
  })
})

const openTab = (url: string, incognito = false) =>
  tabsGet.mockResolvedValue({ id: 1, url, incognito })

describe('إضافة موقع من الواجهة ثمّ محاولة الحقن', () => {
  it('**الموقع المضاف من الشاشة يُمنَع فعلًا عند البوّابة**', async () => {
    openTab('https://login.bank.com/otp')
    expect((await canOperateOnTab(1)).allowed, 'مُنع قبل أن يُضاف شيء').toBe(true)

    await addExcludedSite('*.bank.com')

    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'excluded-site' })
  })

  it('والحذف من الشاشة يرفع المنع — السالب على الموقع نفسه', async () => {
    openTab('https://bank.com/')
    await addExcludedSite('bank.com')
    expect((await canOperateOnTab(1)).allowed).toBe(false)

    await removeExcludedSite('bank.com')

    expect((await canOperateOnTab(1)).allowed).toBe(true)
  })

  it('يرفض النمط الذي لا يصلح ولا يكتب شيئًا', async () => {
    expect(await addExcludedSite('chrome://settings')).toBe('invalid')
    expect(await addExcludedSite('   ')).toBe('invalid')
    expect((await getSettings()).privacy.excludedSites).toEqual([])
  })

  it('يحفظ النمط **مُطبَّعًا** — فما يراه المستخدم هو ما يُطابَق', async () => {
    await addExcludedSite('  HTTPS://Bank.com./login?x=1  ')
    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com'])
  })

  it('ولا يكرّر نمطًا موجودًا', async () => {
    await addExcludedSite('bank.com')
    await addExcludedSite('*.bank.com')
    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com'])
  })
})

/**
 * أخطر بندٍ في الوحدة. `patchSettings` تدمج الكائنات وتستبدل **المصفوفات**؛
 * فبناء القائمة الجديدة من لقطة الواجهة — وهي لا تتحدّث إلّا بعد جولة
 * `onChanged → watchSettings → إعادة رسم` — يجعل إضافتين متتاليتين تكتب
 * ثانيتُهما مصفوفةً لا تحوي الأولى. وهو **عين العطل** الذي رصدته مراجعة
 * Gate B في `saveShortcuts` (20.2) و`saveAppearance` (20.1)، وهنا أخطر:
 * الضحية قائمة خصوصية، وفقدان إدخالٍ منها يعني حقنًا في موقعٍ ظنّ المستخدم
 * أنه حماه.
 */
describe('لا يضيع إدخال بين نقرتين متقاربتين', () => {
  it('إضافتان متتاليتان تُبقيان الاثنين', async () => {
    await addExcludedSite('bank.com')
    await addExcludedSite('mail.com')

    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com', 'mail.com'])
  })

  it('**وإضافتان متزامنتان كذلك** — لا لقطة واجهة بينهما', async () => {
    await Promise.all([addExcludedSite('bank.com'), addExcludedSite('mail.com')])

    const saved = (await getSettings()).privacy.excludedSites
    expect(saved, 'ضاع أحد الموقعين — كُتبت مصفوفةٌ بُنيت على قراءة قديمة').toHaveLength(2)
    expect([...saved].sort()).toEqual(['bank.com', 'mail.com'])
  })

  it('وحفظ إعداد مجاور لا يمسّ القائمة', async () => {
    await addExcludedSite('bank.com')
    await savePrivacy({ autoDeleteAfterDays: 30 })

    const { privacy } = await getSettings()
    expect(privacy.excludedSites).toEqual(['bank.com'])
    expect(privacy.autoDeleteAfterDays).toBe(30)
  })
})

describe('الاستيراد يدمج ولا يستبدل', () => {
  it('يُبقي ما بناه المستخدم ويضيف الجديد ويتخطّى التالف', async () => {
    await addExcludedSite('bank.com')

    const outcome = await importExcludedSites(['mail.com', 'chrome://x', 42, 'bank.com'])

    expect(outcome.added).toBe(1)
    expect(outcome.rejected).toBe(2)
    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com', 'mail.com'])
  })

  it('وملفٌّ كلّه تالف لا يمحو القائمة القائمة', async () => {
    await addExcludedSite('bank.com')

    const outcome = await importExcludedSites(['file:///x', null])

    expect(outcome.added).toBe(0)
    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com'])
  })
})

describe('وضع التصفّح الخاص يُكتب من الشاشة ويُنفَّذ عند البوّابة', () => {
  it('«معطَّل» يمنع الحقن في نافذة خاصّة بعد حفظه مباشرةً', async () => {
    openTab('https://example.com/', true)
    expect((await canOperateOnTab(1)).allowed).toBe(true)

    await savePrivacy({ incognito: 'off' })

    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'incognito-off' })
  })

  it('والعودة إلى «يعمل بلا حفظ» ترفع المنع', async () => {
    openTab('https://example.com/', true)
    await savePrivacy({ incognito: 'off' })
    await savePrivacy({ incognito: 'no-save' })

    expect((await canOperateOnTab(1)).allowed).toBe(true)
  })
})
