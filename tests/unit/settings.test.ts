import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defaultSettings,
  getSettings,
  parseSettings,
  patchSettings,
  resetSettings,
  resetSettingsCache,
  watchSettings,
} from '@/shared/settings'

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

describe('القيم الافتراضية', () => {
  it('كل قسم مكتمل بلا ثغرات', () => {
    const s = defaultSettings()
    expect(s.capture.format).toBe('png')
    expect(s.capture.scale).toBe(1)
    expect(s.capture.saveLocation).toBe('library')
    expect(s.colors.defaultFormat).toBe('hex')
    expect(s.colors.hideNeutrals).toBe(true)
    expect(s.appearance.language).toBe('ar')
    expect(s.appearance.theme).toBe('system')
    expect(s.privacy.blockIncognitoWrites).toBe(true)
    expect(s.privacy.localOnly).toBe(true)
    expect(s.onboarding.completed).toBe(false)
    expect(s.shortcuts.toolKeys).toEqual({
      inspect: 'KeyI',
      measure: 'KeyM',
      colour: 'KeyC',
      compare: 'KeyD',
    })
  })

  it('العربية هي اللغة الافتراضية لا الإنجليزية', () => {
    expect(defaultSettings().appearance.language).toBe('ar')
  })
})

describe('التحقّق من المخطّط', () => {
  it('يقبل الإدخال الفارغ ويعطي الافتراضي', () => {
    expect(parseSettings({}).issues).toEqual([])
    expect(parseSettings(undefined).settings.capture.format).toBe('png')
  })

  it.each([
    ['صيغة غير معروفة', { capture: { format: 'gif' } }],
    ['جودة خارج المدى', { capture: { quality: 5 } }],
    ['مقياس غير مسموح', { capture: { scale: 3 } }],
    ['مكان حفظ غير معروف', { capture: { saveLocation: 'cloud' } }],
    ['لون غير سداسي', { annotation: { color: 'ليس لونًا' } }],
    ['عدد ألوان أقلّ من الحدّ', { colors: { paletteSize: 1 } }],
    ['سمة غير معروفة', { appearance: { theme: 'neon' } }],
    ['نوع خاطئ تمامًا', { privacy: { excludedSites: 'ليست مصفوفة' } }],
    ['حرف اختصار متعدّد الأحرف', { shortcuts: { toolKeys: { inspect: 'KeyAB' } } }],
    ['حرف اختصار برمز', { shortcuts: { toolKeys: { measure: 'Digit1' } } }],
  ])('يرفض %s ويعود إلى الافتراضي', (_label, bad) => {
    const { settings, issues } = parseSettings(bad)
    expect(issues.length).toBeGreaterThan(0)
    // النتيجة صالحة دائمًا مهما كان الإدخال.
    expect(settings.capture.format).toMatch(/^(png|webp)$/)
    expect(settings.appearance.language).toMatch(/^(ar|en)$/)
  })

  it('يحفظ المفاتيح السليمة عند إنقاذ الجزء التالف', () => {
    const { settings } = parseSettings({
      capture: { format: 'webp' },
      appearance: { theme: 'neon' },
    })
    expect(settings.capture.format).toBe('webp')
    expect(settings.appearance.theme).toBe('system')
  })

  it('لا يرمي أبدًا مهما كان الإدخال', () => {
    for (const bad of [null, 0, 'نص', [], true, { capture: null }]) {
      expect(() => parseSettings(bad)).not.toThrow()
    }
  })
})

describe('القراءة والكتابة', () => {
  it('التعديل الجزئي يدمج ولا يمحو الأقسام الأخرى', async () => {
    await patchSettings({ capture: { format: 'webp' } } as never)
    const s = await getSettings()
    expect(s.capture.format).toBe('webp')
    expect(s.capture.quality).toBe(0.92)
    expect(s.colors.defaultFormat).toBe('hex')
  })

  it('capture.saveLocation: ضبطٌ ثم إعادة فتح يحفظ الحالة', async () => {
    await patchSettings({ capture: { saveLocation: 'library-and-downloads' } } as never)
    resetSettingsCache()
    expect((await getSettings()).capture.saveLocation).toBe('library-and-downloads')
  })

  it('shortcuts.toolKeys: ضبطٌ ثم إعادة فتح يحفظ الحالة', async () => {
    await patchSettings({ shortcuts: { toolKeys: { inspect: 'KeyJ' } } } as never)
    resetSettingsCache()
    expect((await getSettings()).shortcuts.toolKeys.inspect).toBe('KeyJ')
  })

  it('shortcuts.toolKeys: patchSettings لا تدمج المستوى الثاني — تخصيص سابق لأداة أخرى يُفقَد', async () => {
    /*
     * هذا الحدّ **مقصود التوثيق لا عطل**: `patchSettings` تدمج مستوًى واحدًا
     * فقط (`shared/settings/index.ts`)، فتمرير جزء من `toolKeys` يستبدل
     * الكائن كلّه — والقيمة الظاهرة لحقل لم يُذكر (`KeyM`) تأتي من افتراضي
     * المخطّط لا من القيمة المحفوظة سابقًا. حفظ تخصيص سابق فعليًّا يمرّ من
     * `saveShortcut` (`pages/settings/context.ts`)، لا من هذه الدالّة مباشرةً
     * — انظر `tests/unit/pages/settings/context.test.ts` للحارس السالب هناك.
     */
    await patchSettings({ shortcuts: { toolKeys: { measure: 'KeyN' } } } as never)
    await patchSettings({ shortcuts: { toolKeys: { inspect: 'KeyJ' } } } as never)
    const s = await getSettings()
    expect(s.shortcuts.toolKeys.inspect).toBe('KeyJ')
    expect(s.shortcuts.toolKeys.measure).toBe('KeyM') // ليس 'KeyN' — عاد إلى افتراضي المخطّط
  })

  it('إعادة الضبط تعيد كل شيء', async () => {
    await patchSettings({ capture: { format: 'webp' } } as never)
    await resetSettings()
    expect((await getSettings()).capture.format).toBe('png')
  })

  it('القيمة التالفة في التخزين تُصحَّح ولا تُسقط شيئًا', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await fakeBrowser.storage.local.set({ 'rasd:settings': { capture: { format: 'gif' } } })
    resetSettingsCache()
    const s = await getSettings()
    expect(s.capture.format).toBe('png')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('البثّ', () => {
  it('المشترك يُستدعى فورًا بالقيمة الحالية', async () => {
    const seen: string[] = []
    watchSettings((s) => seen.push(s.capture.format))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0]).toBe('png')
  })

  it('إلغاء الاشتراك يوقف الاستدعاء', async () => {
    const listener = vi.fn()
    const off = watchSettings(listener)
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    off()
    listener.mockClear()
    await patchSettings({ capture: { format: 'webp' } } as never)
    expect(listener).not.toHaveBeenCalled()
  })
})
