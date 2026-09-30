import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defaultSettings,
  getSettings,
  getSettingsResult,
  resetSettings,
  resetSettingsCache,
  type Settings,
} from '@/shared/settings'
import {
  applySettingsImport,
  planSettingsImport,
  settingsFile,
  settingsFilename,
  TRANSFERABLE_LEAVES,
} from '@/shared/settings/transfer'

import { settingsFixture } from './library-fixture'

/**
 * نقل الإعدادات وإعادة ضبطها — معايير قبول `STAGES/07`:
 *
 * - تصديرٌ ثمّ استيراد يعيد الحالة نفسها بايتًا ببايت.
 * - استيراد ملفٍّ تالف لا يكتب شيئًا ويبلّغ الخطأ.
 * - ثوابت كتابة الإعدادات الثلاثة: الطابور، ولا كتابة بعد قراءة فاشلة، والإنقاذ بالمسار الكامل.
 */

const KEY = 'rasd:settings'
const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function stored(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(KEY))[KEY]
}

function plan(text: string, current: Settings) {
  const r = planSettingsImport(text, current)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

function fileWith(settings: object): string {
  return JSON.stringify({
    format: 'rasd.settings',
    version: 1,
    exportedAt: NOW,
    app: '0.1.0',
    settings,
  })
}

describe('التصدير ثمّ الاستيراد', () => {
  it('يعيد الإعدادات نفسها على متصفّحٍ جديد — بايتًا ببايت', async () => {
    const source = settingsFixture()
    const text = settingsFile(source, NOW, '0.1.0')

    // المتصفّح الآخر: جديد، وجولة التعريف فيه مكتملة بزمنٍ آخر.
    const target = { ...defaultSettings(), onboarding: { completed: true, completedAt: 7 } }
    await fakeBrowser.storage.local.set({ [KEY]: target })

    const p = plan(text, target)
    expect(p.dropped).toEqual([])
    expect([...p.accepted].sort()).toEqual([...TRANSFERABLE_LEAVES].sort())
    const saved = await applySettingsImport(p)
    expect(saved.ok).toBe(true)

    const expected = { ...source, onboarding: target.onboarding }
    expect(JSON.stringify(await stored())).toBe(JSON.stringify(expected))
    // والتصدير من الهدف يعيد الملفّ نفسه حرفًا بحرف.
    expect(settingsFile(await getSettings(), NOW, '0.1.0')).toBe(text)
  })

  it('الملفّ يحمل التفضيلات وحدها: لا جولة تعريف ولا «ما الجديد»', () => {
    const text = settingsFile(settingsFixture(), NOW, '0.1.0')
    const file = JSON.parse(text) as { format: string; version: number; settings: object }
    expect(file.format).toBe('rasd.settings')
    expect(file.version).toBe(1)
    expect(Object.keys(file.settings)).toEqual([
      'schemaVersion',
      'capture',
      'annotation',
      'colors',
      'appearance',
      'shortcuts',
      'privacy',
    ])
    expect(settingsFilename(NOW)).toBe('rasd-settings-2026-09-30.json')
  })

  it('المواقع المستثناة تُجمع ولا تُستبدل — ما حُمي هنا لا يُمحى باستيراد ملفٍّ لم يُحمَ فيه', async () => {
    const here = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: here })
    const there = {
      ...defaultSettings(),
      privacy: { ...defaultSettings().privacy, excludedSites: ['new.example', 'bank.com'] },
    }
    const p = plan(settingsFile(there, NOW, '0.1.0'), here)
    expect(p.settings.privacy.excludedSites).toEqual([...here.privacy.excludedSites, 'new.example'])
    await applySettingsImport(p)
    expect((await getSettings()).privacy.excludedSites).toEqual([
      ...here.privacy.excludedSites,
      'new.example',
    ])
  })
})

describe('ما أُسقط ولماذا', () => {
  it('القيمة التالفة تُسقط وحدها بسببها، وتبقى على قيمتها الحالية لا الافتراضية', async () => {
    const current = settingsFixture() // capture.format = webp · measure = KeyN
    await fakeBrowser.storage.local.set({ [KEY]: current })
    const text = fileWith({
      capture: { format: 'svg', quality: 0.5 },
      shortcuts: { toolKeys: { measure: 7, inspect: 'KeyJ' } },
      appearance: { theme: 'light', sparkle: true },
      privacy: { excludedSites: ['ok.example', 42, 'chrome://settings'], autoDeleteAfterDays: 5 },
    })
    const p = plan(text, current)

    expect(p.dropped).toEqual(
      expect.arrayContaining([
        { path: 'capture.format', reason: 'option', received: 'svg' },
        { path: 'shortcuts.toolKeys.measure', reason: 'type', received: 7 },
        { path: 'privacy.excludedSites', reason: 'type', received: 42 },
        { path: 'privacy.excludedSites', reason: 'site', received: 'chrome://settings' },
        { path: 'privacy.autoDeleteAfterDays', reason: 'option', received: 5 },
        { path: 'appearance.sparkle', reason: 'unknown', received: true },
      ]),
    )
    expect(p.dropped).toHaveLength(6)
    expect(p.accepted).toEqual(
      expect.arrayContaining([
        'capture.quality',
        'shortcuts.toolKeys.inspect',
        'appearance.theme',
        'privacy.excludedSites',
      ]),
    )
    expect(p.accepted).not.toContain('capture.format')

    await applySettingsImport(p)
    const s = await getSettings()
    expect(s.capture.format).toBe('webp') // الحالية، لا `png` الافتراضية
    expect(s.capture.quality).toBe(0.5)
    expect(s.shortcuts.toolKeys.measure).toBe('KeyN')
    expect(s.shortcuts.toolKeys.inspect).toBe('KeyJ')
    expect(s.appearance.theme).toBe('light')
    expect(s.privacy.autoDeleteAfterDays).toBe(30)
    expect(s.privacy.excludedSites).toEqual([...current.privacy.excludedSites, 'ok.example'])
  })

  it('جولة التعريف و«ما الجديد» في الملفّ تُتجاهل ولا تُعدّ مُسقَطة', () => {
    const p = plan(
      fileWith({ onboarding: { completed: false }, whatsNew: { pending: '9.9.9' } }),
      settingsFixture(),
    )
    expect(p.dropped).toEqual([])
    expect(p.settings.onboarding).toEqual(settingsFixture().onboarding)
    expect(p.settings.whatsNew).toEqual(settingsFixture().whatsNew)
  })
})

describe('ملفٌّ لا يُستورد لا يكتب شيئًا ويبلّغ الخطأ', () => {
  it.each([
    ['ليس JSON', '{ not json', 'not-json'],
    ['JSON ليس ملفّ إعدادات', '{"capture":{}}', 'not-settings'],
    ['صيغة أخرى', '{"format":"rasd.backup","settings":{}}', 'not-settings'],
    ['بلا إعدادات', '{"format":"rasd.settings","version":1}', 'not-settings'],
    ['نسخة ملفٍّ أحدث', '{"format":"rasd.settings","version":2,"settings":{}}', 'newer'],
    [
      'مخطّط إعداداتٍ أحدث',
      '{"format":"rasd.settings","version":1,"settings":{"schemaVersion":9}}',
      'newer',
    ],
  ])('%s', async (_label, text, failure) => {
    const before = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: before })
    const set = vi.spyOn(chrome.storage.local, 'set')
    const r = planSettingsImport(text, before)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe(failure)
    expect(set).not.toHaveBeenCalled()
    expect(await stored()).toEqual(before)
  })
})

describe('ثوابت الكتابة الثلاثة', () => {
  it('الاستيراد لا يكتب بعد قراءة فاشلة — ولا يمحو المواقع المستثناة', async () => {
    const before = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: before })
    const p = plan(settingsFile(defaultSettings(), NOW, '0.1.0'), before)
    resetSettingsCache()
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValueOnce(new Error('storage down'))
    const set = vi.spyOn(chrome.storage.local, 'set')

    const r = await applySettingsImport(p)
    expect(r.ok).toBe(false)
    expect(set).not.toHaveBeenCalled()
    expect(await stored()).toEqual(before)
  })

  it('الاستيراد يدمج على الحالة وقت الكتابة لا وقت العرض — في الطابور مع غيره', async () => {
    const before = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: before })
    const p = plan(fileWith({ appearance: { theme: 'light' } }), before)

    // بين العرض والتأكيد أُضيف موقعٌ من تبويبٍ آخر (أو نقرة) — لا يضيع باستيرادٍ بُني قبله.
    const { updateSettings } = await import('@/shared/settings')
    const added = updateSettings((s) => ({
      privacy: { ...s.privacy, excludedSites: [...s.privacy.excludedSites, 'late.example'] },
    }))
    const imported = applySettingsImport(p)
    await Promise.all([added, imported])

    const s = await getSettings()
    expect(s.appearance.theme).toBe('light')
    expect(s.privacy.excludedSites).toContain('late.example')
  })
})

describe('إعادة الضبط', () => {
  it('«أبقِ القائمة» محدَّدًا: التفضيلات تعود، والمواقع المستثناة وجولة التعريف باقية', async () => {
    const before = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: before })

    const r = await resetSettings({ keepExcludedSites: true })
    expect(r.ok).toBe(true)

    const s = await getSettings()
    const fresh = defaultSettings()
    expect(s.capture).toEqual(fresh.capture)
    expect(s.appearance).toEqual(fresh.appearance)
    expect(s.shortcuts).toEqual(fresh.shortcuts)
    expect(s.privacy).toEqual({ ...fresh.privacy, excludedSites: before.privacy.excludedSites })
    expect(s.onboarding).toEqual(before.onboarding)
  })

  it('«أبقِ القائمة» مُلغًى: القائمة تُمحى بقرار صريح — وجولة التعريف باقية', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: settingsFixture() })
    await resetSettings({ keepExcludedSites: false })
    const s = await getSettings()
    expect(s.privacy.excludedSites).toEqual([])
    expect(s.onboarding.completed).toBe(true)
  })

  it('القراءة الفاشلة لا تُكتب فوقها افتراضيات — في الخيارين', async () => {
    const before = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: before })
    for (const keepExcludedSites of [true, false]) {
      resetSettingsCache()
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValueOnce(new Error('storage down'))
      const set = vi.spyOn(chrome.storage.local, 'set')
      const r = await resetSettings({ keepExcludedSites })
      expect(r.ok).toBe(false)
      expect(set).not.toHaveBeenCalled()
      expect(await stored()).toEqual(before)
      vi.restoreAllMocks()
    }
    resetSettingsCache()
    expect((await getSettingsResult()).ok).toBe(true)
  })

  it('في الطابور: موقعٌ أُضيف قبل إعادة الضبط ينجو منها حين تُبقى القائمة', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: settingsFixture() })
    const { updateSettings } = await import('@/shared/settings')
    const added = updateSettings((s) => ({
      privacy: { ...s.privacy, excludedSites: [...s.privacy.excludedSites, 'late.example'] },
    }))
    const reset = resetSettings({ keepExcludedSites: true })
    await Promise.all([added, reset])
    expect((await getSettings()).privacy.excludedSites).toContain('late.example')
  })
})

/*
 * ما كشفته المراجعة المستقلّة (`STAGES/07`) — كُتبت قبل إصلاحاتها وسقطت عليها.
 */
describe('المراجعة: ما سيتغيّر يُعرض كلّه قبل الحفظ', () => {
  it('كل ورقةٍ ستتغيّر بقيمتها الحالية والجديدة — ومنها مدّة الاحتفاظ التي تحذف نهائيًّا', () => {
    const current = defaultSettings()
    const p = plan(
      fileWith({
        privacy: { autoDeleteAfterDays: 7, excludedSites: ['*'] },
        capture: { format: 'png' },
      }),
      current,
    )
    expect(p.changes).toEqual([
      { path: 'privacy.excludedSites', from: [], to: ['*'] },
      { path: 'privacy.autoDeleteAfterDays', from: 0, to: 7 },
    ])
  })

  it('المفتاح القديم `blockIncognitoWrites` يُرحَّل ويُعرض تغييرًا في `incognito` — لا «مُسقَطًا» وهو يُطبَّق', () => {
    const p = plan(fileWith({ privacy: { blockIncognitoWrites: false } }), defaultSettings())
    expect(p.dropped).toEqual([])
    expect(p.accepted).toContain('privacy.incognito')
    expect(p.changes).toEqual([{ path: 'privacy.incognito', from: 'no-save', to: 'allow' }])
  })
})

describe('المراجعة: ملفٌّ بشكلٍ لا يطابق المخطّط لا يعيد قسمًا إلى افتراضه', () => {
  it('مصفوفةٌ مكان قسم: تُسقط بسببها، والقسم الحالي باقٍ كما هو', async () => {
    const current = settingsFixture()
    await fakeBrowser.storage.local.set({ [KEY]: current })
    const p = plan(
      fileWith({
        privacy: [],
        capture: [],
        shortcuts: { toolKeys: [] },
        appearance: { theme: 'light' },
      }),
      current,
    )
    expect(p.dropped).toEqual(
      expect.arrayContaining([
        { path: 'privacy', reason: 'type', received: [] },
        { path: 'capture', reason: 'type', received: [] },
        { path: 'shortcuts.toolKeys', reason: 'type', received: [] },
      ]),
    )
    await applySettingsImport(p)
    const s = await getSettings()
    expect(s.capture).toEqual(current.capture)
    expect(s.privacy).toEqual(current.privacy)
    expect(s.shortcuts).toEqual(current.shortcuts)
    expect(s.appearance.theme).toBe('light')
  })
})

describe('المراجعة: ملفٌّ ضخم أو عميق لا يجمّد الصفحة ولا يرمي', () => {
  it('ما فوق السقف يُرفض `too-large` قبل أن يُحلَّل', () => {
    const huge = fileWith({
      privacy: { excludedSites: Array.from({ length: 80_000 }, (_, i) => `s${i}.example`) },
    })
    expect(huge.length).toBeGreaterThan(1024 * 1024)
    const r = planSettingsImport(huge, defaultSettings())
    expect(!r.ok && r.error).toBe('too-large')
  })

  it('قائمةٌ طويلة تحت السقف تُدمج خطّيًّا لا تربيعيًّا', () => {
    const sites = Array.from({ length: 30_000 }, (_, i) => `s${i}.example`)
    const started = performance.now()
    const p = plan(fileWith({ privacy: { excludedSites: sites } }), defaultSettings())
    expect(performance.now() - started).toBeLessThan(3000)
    expect(p.settings.privacy.excludedSites).toHaveLength(30_000)
  })

  it('تداخلٌ عميق لا يرمي', () => {
    let deep = '1'
    for (let i = 0; i < 20_000; i++) deep = `{"a":${deep}}`
    const text = `{"format":"rasd.settings","version":1,"settings":{"appearance":${deep}}}`
    expect(() => planSettingsImport(text, defaultSettings())).not.toThrow()
  })
})
