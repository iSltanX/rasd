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

  it('والسببان الجديدان يقولان للمستخدم ما يفعله، لا ما وقع فقط', () => {
    expect(gateMessage('excluded-site')).toContain('الإعدادات')
    expect(gateMessage('settings-unavailable')).toContain('أعد المحاولة')
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

  const openTab = (url: string) => tabsGet.mockResolvedValue({ id: 1, url })
  const excluding = (...sites: string[]) =>
    storageGet.mockResolvedValue({ 'rasd:settings': { privacy: { excludedSites: sites } } })

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
})
