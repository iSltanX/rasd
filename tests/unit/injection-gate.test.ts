import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateResume } from '@/background/commands'
import { canOperateOnTab } from '@/background/gate'
import { evaluateGate, gateMessage, type GateReason } from '@/shared/injection-gate'
import { resetSettingsCache } from '@/shared/settings'

/**
 * البوّابة الواحدة للحقن.
 *
 * يُفحَص هنا ما لا يظهر في اختبار المُطابِق: **التركيب** — أيُّ سببٍ يغلب،
 * وماذا يحدث حين لا تُقرأ الإعدادات، وهل ينجو أحدٌ من الحقن بلا سؤال.
 */

describe('evaluateGate — الترتيب بين قيد المنصّة وقرار المستخدم', () => {
  it('قيد المتصفح يغلب، وسببه هو ما يُعرَض — أنفع من «موقع مستثنى»', () => {
    const decision = evaluateGate('chrome://settings', ['*'])
    expect(decision).toEqual({ allowed: false, reason: 'browser-internal' })
  })

  it('وصفحة مقيّدة تُمنع ولو خلت القائمة', () => {
    expect(evaluateGate('view-source:https://example.com/', [])).toEqual({
      allowed: false,
      reason: 'view-source',
    })
  })

  it('وصفحة سليمة مستثناة تُمنع بسببها هي', () => {
    expect(evaluateGate('https://bank.com/', ['bank.com'])).toEqual({
      allowed: false,
      reason: 'excluded-site',
    })
  })

  it('والعنوان الغائب يُمنع — الافتراض الآمن لم يتغيّر', () => {
    expect(evaluateGate(undefined, []).allowed).toBe(false)
    expect(evaluateGate(null, []).allowed).toBe(false)
  })
})

describe('gateMessage', () => {
  const reasons: GateReason[] = [
    'browser-internal',
    'extension-page',
    'web-store',
    'pdf-viewer',
    'view-source',
    'local-file',
    'devtools',
    'invalid-url',
    'excluded-site',
    'settings-unavailable',
  ]

  it.each(reasons)('يعطي نصًّا عربيًّا لسبب %s', (reason) => {
    const message = gateMessage(reason)
    expect(message.length).toBeGreaterThan(10)
    expect(message).toMatch(/[؀-ۿ]/u)
  })

  it('والأسباب الثلاثة تقول للمستخدم ما يفعله، لا ما وقع فقط', () => {
    expect(gateMessage('excluded-site')).toContain('الإعدادات')
    expect(gateMessage('incognito-off')).toContain('الخصوصية')
    expect(gateMessage('settings-unavailable')).toContain('أعد المحاولة')
  })

  /*
   * الوحدة 20.3 — التصفّح الخاص عند البوّابة الخالصة. الترتيب مقصود
   * ومُختبَر: قيد المنصّة أوّلًا (ADR 0020 البند 6)، ثمّ **السياق**، ثمّ
   * الموقع — فمن عطّل رصدًا في النوافذ الخاصّة يُقال له ذلك لا يُرسَل يعدّل
   * قائمةً ليست هي السبب في هذه النافذة.
   */
  describe('التصفّح الخاص', () => {
    it('يمنع الحقن في نافذة خاصّة حين يكون الوضع «معطَّل»', () => {
      expect(
        evaluateGate('https://example.com/', [], { incognito: true, incognitoMode: 'off' }),
      ).toEqual({ allowed: false, reason: 'incognito-off' })
    })

    it('«معطَّل» لا يمسّ النوافذ العادية', () => {
      expect(
        evaluateGate('https://example.com/', [], { incognito: false, incognitoMode: 'off' }),
      ).toEqual({ allowed: true })
    })

    it.each(['allow', 'no-save'] as const)('الوضع «%s» يسمح بالحقن في نافذة خاصّة', (mode) => {
      expect(
        evaluateGate('https://example.com/', [], { incognito: true, incognitoMode: mode }),
      ).toEqual({ allowed: true })
    })

    it('قيد المنصّة يسبق السياق — chrome:// تُمنع بسببها هي لا بالتصفّح الخاص', () => {
      const decision = evaluateGate('chrome://settings', [], {
        incognito: true,
        incognitoMode: 'off',
      })
      expect(decision).not.toEqual({ allowed: false, reason: 'incognito-off' })
      expect(decision.allowed).toBe(false)
    })

    it('السياق يسبق الموقع حين يصدق الاثنان', () => {
      expect(
        evaluateGate('https://bank.com/', ['bank.com'], {
          incognito: true,
          incognitoMode: 'off',
        }),
      ).toEqual({ allowed: false, reason: 'incognito-off' })
    })

    it('السياق الافتراضي لا يمنع شيئًا — مستدعٍ لا يمرّره لا يتغيّر سلوكه', () => {
      expect(evaluateGate('https://example.com/', [])).toEqual({ allowed: true })
    })
  })
})

/**
 * الغلاف غير الخالص — حيث يقع الفرق بين «قُرئت وهي فارغة» و«لم تُقرأ».
 */
describe('canOperateOnTab', () => {
  /*
   * نمط تمويه المستودع نفسه (`resume.test.ts`): تُركَّب نداءات `chrome.*`
   * بـ`Object.assign` لا بـ`spyOn` — تلك تصطدم بتواقيع النداء الراجع في
   * أنواع Chrome فتستنتج `void`، وتمرّ في التشغيل وتسقط في `tsc`.
   */
  let tabsGet: ReturnType<typeof vi.fn>
  let executeScript: ReturnType<typeof vi.fn>
  let storageGet: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fakeBrowser.reset()
    resetSettingsCache()
    tabsGet = vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com/' })
    executeScript = vi.fn().mockResolvedValue([{ result: true }])
    storageGet = vi.fn().mockResolvedValue({})
    Object.assign(globalThis.chrome, {
      tabs: { ...globalThis.chrome.tabs, get: tabsGet, sendMessage: vi.fn() },
      scripting: { executeScript },
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      storage: {
        ...globalThis.chrome.storage,
        local: { ...globalThis.chrome.storage.local, get: storageGet, set: vi.fn() },
      },
    })
  })

  const openTab = (url: string, incognito = false) =>
    tabsGet.mockResolvedValue({ id: 1, url, incognito })
  const excluding = (...sites: string[]) =>
    storageGet.mockResolvedValue({ 'rasd:settings': { privacy: { excludedSites: sites } } })
  const incognitoMode = (mode: 'allow' | 'no-save' | 'off') =>
    storageGet.mockResolvedValue({ 'rasd:settings': { privacy: { incognito: mode } } })

  it('يسمح بصفحة سليمة وقائمة فارغة', async () => {
    openTab('https://example.com/')
    expect(await canOperateOnTab(1)).toEqual({ allowed: true })
  })

  it('يمنع موقعًا استثناه المستخدم', async () => {
    excluding('bank.com')
    openTab('https://login.bank.com/otp')
    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'excluded-site' })
  })

  /*
   * أخطر بندٍ هنا. كانت قراءة الإعدادات تُفسّر فشل التخزين بـ`{}` فتُنتج
   * `excludedSites: []` **وتخزّنها** — فعطلٌ عابر واحد عند إقلاع بارد يُلغي
   * قائمة المستخدم لعمر العامل كلّه، بلا أثر يُقرأ ومع تبليغ نجاح.
   */
  it('**يُغلِق حين لا تُقرأ الإعدادات** — لا يقرأها فراغًا', async () => {
    openTab('https://bank.com/')
    storageGet.mockRejectedValue(new Error('storage down'))
    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'settings-unavailable' })
  })

  it('ولا يُثبِّت جهله: القراءة التالية تنجح بعد زوال العطل', async () => {
    openTab('https://example.com/')
    storageGet.mockRejectedValue(new Error('storage down'))
    expect((await canOperateOnTab(1)).allowed).toBe(false)
    storageGet.mockResolvedValue({})
    expect((await canOperateOnTab(1)).allowed).toBe(true)
  })

  it('ويُغلِق حين يختفي التبويب بين النداءين', async () => {
    tabsGet.mockRejectedValue(new Error('No tab with id'))
    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'invalid-url' })
  })

  /*
   * الثغرة التي فتحها مسار الاستئناف: صلاحية المضيف تُمنح مرّةً ثم تبقى،
   * ومن منحها ثمّ أضاف الموقع إلى المستثناة كان يُحقَن فيه — لأن ذاك المسار
   * كان يسأل عن الإذن ولا يسأل عن القائمة. البوّابة تسأل عن الاثنين.
   */
  it('**والمنع يغلب صلاحية مضيف ممنوحة** — الإذن القديم ليس موافقة على استثناء جديد', async () => {
    excluding('bank.com')
    openTab('https://bank.com/dashboard')
    expect(await chrome.permissions.contains({ origins: ['https://bank.com/*'] })).toBe(true)
    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'excluded-site' })
  })

  /*
   * والبرهان عند المسار نفسه لا عند البوّابة وحدها: `activateResume` تُنادى
   * بعد أن تتحقّق `resume.ts` من الإذن، فيجب ألّا تحقن شيئًا رغم ذلك.
   * وهذا المسار هو الوحيد في المنتج الذي يحقن **بلا إيماءة مستخدم**.
   */
  it('ومسار الاستئناف التلقائي لا يحقن في موقع مستثنى', async () => {
    excluding('bank.com')
    openTab('https://bank.com/dashboard')

    await activateResume(1)

    expect(executeScript, 'حُقنت شيفرة في موقع استثناه المستخدم').not.toHaveBeenCalled()
  })

  /*
   * الوحدة 20.3 — الحقيقة تُقرأ من **التبويب** لا من `chrome.extension`.
   *
   * البديل الوحيد داخل `shared/` هو `isIncognitoContext()`، وهي تقرأ
   * `chrome.extension.inIncognitoContext` — واجهةٌ توثّقها أنواع Chrome
   * لصفحات الإضافة، والـservice worker ليس صفحة (`§6` صفّ 121). أمّا
   * `Tab.incognito` فحقلٌ على الكائن الذي تقرؤه البوّابة أصلًا قبل كل قرار،
   * فالاختبار يمرّره من حيث يأتي في الإنتاج تمامًا.
   */
  it('يمنع الحقن في تبويب نافذةٍ خاصّة حين يكون الوضع «معطَّل»', async () => {
    incognitoMode('off')
    openTab('https://example.com/', true)
    expect(await canOperateOnTab(1)).toEqual({ allowed: false, reason: 'incognito-off' })
  })

  it('وينفّذ ذلك على مسار الاستئناف التلقائي كذلك — بلا إيماءة مستخدم', async () => {
    incognitoMode('off')
    openTab('https://example.com/', true)

    await activateResume(1)

    expect(executeScript, 'حُقنت شيفرة في نافذة خاصّة عطّلها المستخدم').not.toHaveBeenCalled()
  })

  it('والوضع «معطَّل» لا يمنع تبويبًا عاديًّا', async () => {
    incognitoMode('off')
    openTab('https://example.com/', false)
    expect(await canOperateOnTab(1)).toEqual({ allowed: true })
  })
})
