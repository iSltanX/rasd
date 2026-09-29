/**
 * إنقاذ الإعدادات التالفة، وترحيل مفتاح التصفّح الخاص — الوحدة 20.3.
 *
 * **العطل الذي بُني له أوّل وصفٍ هنا** (`Docs/Engineering.md §6` صفّ 119): كان
 * الإنقاذ يحذف `path.split('.')[0]` — أي **القسم الأعلى كاملًا** — فقيمةٌ
 * تالفة واحدة في `privacy.autoDeleteAfterDays` تمحو `privacy` كلّها، ومعها
 * `excludedSites`. والفراغ الناتج ليس نقصًا محايدًا: `evaluateGate` تقرؤه
 * **سماحًا** لا جهلًا، و`patchSettings` تكتبه على القرص عند أوّل حفظٍ تالٍ —
 * فينقلب الفقد من عابرٍ إلى دائم بصمت.
 *
 * والوحدة 20.3 تفتح هذا الباب مرّتين: الاستيراد (ملفّ يحرّره المستخدم)،
 * وأوّل واجهة لـ`autoDeleteAfterDays`.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettings, patchSettings, resetSettingsCache, updateSettings } from '@/shared/settings'
import { defaultSettings, parseSettings } from '@/shared/settings/schema'

describe('إنقاذ القيم التالفة — بالمسار الكامل لا بجذره', () => {
  it('**لا يُفرِغ قائمة المواقع المستثناة بسبب مفتاح مجاور تالف**', () => {
    const { settings, issues } = parseSettings({
      privacy: { excludedSites: ['bank.com', 'mail.com'], autoDeleteAfterDays: 5 },
    })

    expect(settings.privacy.excludedSites, 'مُحيت قائمة خصوصية بسبب مفتاح لا صلة له بها').toEqual([
      'bank.com',
      'mail.com',
    ])
    // والمفتاح التالف وحده عاد إلى افتراضه، والسبب مُبلَّغ لا مبتلَع.
    expect(settings.privacy.autoDeleteAfterDays).toBe(0)
    expect(issues.join(' ')).toContain('privacy.autoDeleteAfterDays')
  })

  it('يُسقط عنصرًا تالفًا من مصفوفة ويُبقي الباقي — ترشيحًا لا ثقبًا', () => {
    const { settings } = parseSettings({
      privacy: { excludedSites: ['bank.com', 42, 'mail.com'] },
    })

    expect(settings.privacy.excludedSites).toEqual(['bank.com', 'mail.com'])
  })

  /*
   * رصدته مراجعة Gate B (`§6` صفّ 129): إسقاط عنصر يُزيح فهارس ما بعده،
   * فمعالجةُ الأعطاب تصاعديًّا كانت تحذف **السليم** عند التالف الثاني، فتفشل
   * إعادة التحقّق ويسقط الإنقاذ كلّه — وتعود كل الإعدادات إلى الافتراضي.
   * الاختبار يفشل بلا الترتيب التنازلي.
   */
  it('**وعنصران تالفان في المصفوفة نفسها كذلك** — الفهارس لا تنزلق', () => {
    const { settings } = parseSettings({
      appearance: { theme: 'dark' },
      privacy: { excludedSites: ['bank.com', 42, 99, 'mail.com'] },
    })

    expect(settings.privacy.excludedSites, 'انزلقت الفهارس فحُذف السليم').toEqual([
      'bank.com',
      'mail.com',
    ])
    expect(settings.appearance.theme, 'سقط الإنقاذ فعادت الإعدادات كلّها للافتراضي').toBe('dark')
  })

  it('وثلاثة تالفة متفرّقة كذلك', () => {
    const { settings } = parseSettings({
      privacy: { excludedSites: [1, 'a.com', 2, 'b.com', 3] },
    })

    expect(settings.privacy.excludedSites).toEqual(['a.com', 'b.com'])
  })

  it('لا يمسّ الأقسام الأخرى حين يتلف قسم', () => {
    const { settings } = parseSettings({
      appearance: { theme: 'dark' },
      privacy: { excludedSites: ['bank.com'], localOnly: 'نعم' },
    })

    expect(settings.appearance.theme).toBe('dark')
    expect(settings.privacy.excludedSites).toEqual(['bank.com'])
    expect(settings.privacy.localOnly).toBe(true)
  })

  it('وما لا يُنقَذ يعود إلى الافتراضي كاملًا بلا رمي', () => {
    const { settings, issues } = parseSettings('نصٌّ لا كائن')
    expect(settings).toEqual(defaultSettings())
    expect(issues.length).toBeGreaterThan(0)
  })
})

describe('ترحيل blockIncognitoWrites ← incognito', () => {
  it('يحفظ اختيار من سمح بالحفظ سابقًا بدل أن يشدّده صامتًا', () => {
    const { settings } = parseSettings({ privacy: { blockIncognitoWrites: false } })
    expect(settings.privacy.incognito).toBe('allow')
  })

  it('والمنع السابق يصير «يعمل بلا حفظ» — نفس السلوك بالحرف', () => {
    const { settings } = parseSettings({ privacy: { blockIncognitoWrites: true } })
    expect(settings.privacy.incognito).toBe('no-save')
  })

  it('لا يدهس قيمةً جديدة موجودة أصلًا', () => {
    const { settings } = parseSettings({
      privacy: { blockIncognitoWrites: false, incognito: 'off' },
    })
    expect(settings.privacy.incognito).toBe('off')
  })

  it('ومستخدمٌ جديد بلا مفتاح قديم يبدأ على «يعمل بلا حفظ»', () => {
    expect(defaultSettings().privacy.incognito).toBe('no-save')
  })
})

/**
 * طابور الكتابة — `§6` صفّ 113، أُغلق في الوحدة 20.3.
 *
 * الاختبار **يفشل بلا الطابور**: بدونه يقرأ النداءان الحالة نفسها ويكتب
 * ثانيهما فوق أوّلهما، فتنتهي القائمة بعنصرٍ واحد.
 */
describe('updateSettings — قراءة وتعديل وكتابة ذرّيّة', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    resetSettingsCache()
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
  })

  it('عشرة نداءات متزامنة تُراكم عشرة عناصر لا واحدًا', async () => {
    const push = (value: string) =>
      updateSettings(
        (current) =>
          ({ privacy: { excludedSites: [...current.privacy.excludedSites, value] } }) as never,
      )

    await Promise.all(Array.from({ length: 10 }, (_, i) => push(`site-${i}.com`)))

    expect((await getSettings()).privacy.excludedSites).toHaveLength(10)
  })

  /*
   * رصدته مراجعة Gate B (`§6` صفّ 128): `applyPatch` كانت تقرأ بـ`getSettings()`
   * التي تبتلع فشل التخزين وتُعيد الافتراضيات، ثمّ تكتبها كاملةً على القرص
   * **وتُبلّغ نجاحًا** — فتمحو قائمة المواقع المستثناة نهائيًّا وبصمت.
   */
  it('**فشل القراءة لا يكتب الافتراضيات على القرص ولا يُبلَّغ نجاحًا**', async () => {
    const local = globalThis.chrome.storage.local as unknown as {
      get: ReturnType<typeof vi.fn>
      set: ReturnType<typeof vi.fn>
    }
    await updateSettings(() => ({ privacy: { excludedSites: ['bank.com'] } }) as never)
    resetSettingsCache()
    local.set.mockClear()
    local.get.mockRejectedValueOnce(new Error('storage down'))

    const result = await patchSettings({ appearance: { theme: 'dark' } } as never)

    expect(result.ok, 'أُبلِغ نجاحًا وقد تعذّرت القراءة').toBe(false)
    expect(local.set, 'كُتبت الافتراضيات على القرص فوق قائمة المستخدم').not.toHaveBeenCalled()
    expect((await getSettings()).privacy.excludedSites).toEqual(['bank.com'])
  })

  it('و`updateSettings` كذلك — `mutate` لا تُنفَّذ على افتراضياتٍ مصدرُها عطل', async () => {
    const local = globalThis.chrome.storage.local as unknown as {
      get: ReturnType<typeof vi.fn>
      set: ReturnType<typeof vi.fn>
    }
    await updateSettings(() => ({ privacy: { excludedSites: ['bank.com'] } }) as never)
    resetSettingsCache()
    local.set.mockClear()
    local.get.mockRejectedValueOnce(new Error('storage down'))

    let seen: readonly string[] | null = null
    const result = await updateSettings((current) => {
      seen = current.privacy.excludedSites
      return { privacy: { excludedSites: [...current.privacy.excludedSites, 'new.com'] } } as never
    })

    expect(result.ok).toBe(false)
    expect(seen, 'نُفِّذت mutate على حالةٍ لم تُقرأ').toBeNull()
    expect(local.set).not.toHaveBeenCalled()
  })

  it('وكتابةٌ فاشلة لا تُجمّد الطابور بعدها', async () => {
    const local = globalThis.chrome.storage.local as unknown as { set: ReturnType<typeof vi.fn> }
    local.set.mockRejectedValueOnce(new Error('storage down'))

    const failed = updateSettings(() => ({ privacy: { localOnly: false } }) as never)
    const after = updateSettings(() => ({ privacy: { autoDeleteAfterDays: 30 } }) as never)

    expect((await failed).ok).toBe(false)
    expect((await after).ok, 'تجمّد الطابور بعد كتابةٍ فاشلة').toBe(true)
  })
})
