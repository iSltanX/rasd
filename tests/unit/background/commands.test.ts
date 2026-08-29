import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateTool, COMMAND_TOOL } from '@/background/commands'
import { onMessage, resetHandlers } from '@/shared/messaging'

/**
 * تفعيل الأدوات — نقطة الدخول الوحيدة التي تحقن الطبقة وتبدّل وضعها.
 *
 * الاختصارات الأربعة (حدّ Chrome) لا يمكن إطلاقها فعليًا من بيئة اختبار —
 * لا CDP ولا Playwright يملكان واجهة تُطلق مُسرِّع `chrome.commands` نفسه؛
 * هذا يستوجب ضغطة مفتاح حقيقية يلتقطها المتصفح قبل أن تصل الصفحة. ما
 * يُختبَر هنا هو الحلقة الكاملة بعد ذلك: `COMMAND_TOOL` (خريطة الاختصار ←
 * الأداة نفسها المسجَّلة في البيان) و`activateTool` (ما ينفَّذ فعليًا حين
 * يصل الاختصار) — التحقّق الحيّ من أن Chrome سجَّل الاختصارات الأربعة نفسها
 * يقع في `scripts/verify-load.mjs` عبر `chrome.commands.getAll()`.
 *
 * `fake-browser` لا يطبّق `scripting.executeScript` ولا `tabs.sendMessage` —
 * كلاهما يرمي «not implemented» صراحةً. الأولى تُموَّه بـ`vi.fn()` بسيطة؛
 * الثانية تُموَّه بإعادة توجيهها إلى `runtime.sendMessage` (الذي **يعمل**
 * فعليًا في `fake-browser` ويصل مستقبِلات `onMessage` نفسها) — محاكاة
 * منطقية لا مجرّد اجتياز: في بيئة اختبار بعملية واحدة لا فرق حقيقيًا بين
 * «رسالة إلى تبويب» و«رسالة إلى الإضافة» غير القناة المستخدَمة.
 */

type ScriptingApi = { executeScript: ReturnType<typeof vi.fn> }

let scripting: ScriptingApi
let tabsGet: ReturnType<typeof vi.fn>

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  scripting = { executeScript: vi.fn().mockResolvedValue(undefined) }
  tabsGet = vi.fn()
  Object.assign(globalThis.chrome, { scripting })
  Object.assign(globalThis.chrome.tabs, {
    get: tabsGet,
    sendMessage: (_tabId: number, message: unknown) => fakeBrowser.runtime.sendMessage(message),
  })
})

describe('COMMAND_TOOL', () => {
  it('أربعة اختصارات بالضبط — حدّ Chrome الأقصى', () => {
    expect(Object.keys(COMMAND_TOOL)).toHaveLength(4)
  })

  it('كل الأدوات الأربع التقاط فوري، لا وضع طبقة تفاعلي معقَّد', () => {
    expect(new Set(Object.values(COMMAND_TOOL))).toEqual(
      new Set(['area', 'element', 'viewport', 'full-page']),
    )
  })
})

describe('activateTool', () => {
  for (const [command, tool] of Object.entries(COMMAND_TOOL)) {
    it(`${command} → يحقن الطبقة ويبدّل الوضع لـ${tool}`, async () => {
      tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
      onMessage('mode/set', () => ({ ok: true }))

      const result = await activateTool(5, tool)

      expect(scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 5 },
        files: ['content.js'],
      })
      expect(result.started).toBe(true)
    })
  }

  it('viewport و full-page لا يُرسلان mode/set — لا وضع طبقة يقابلهما بعد', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const sent = vi.fn()
    onMessage('mode/set', sent)

    const result = await activateTool(5, 'viewport')

    expect(result).toEqual({ started: true, mode: null })
    expect(sent).not.toHaveBeenCalled()
  })

  it('area/element يبدّلان الوضع فعليًا عبر mode/set', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const seen: string[] = []
    onMessage('mode/set', ({ mode }) => {
      seen.push(mode)
      return { ok: true }
    })

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: true, mode: 'area' })
    expect(seen).toEqual(['area'])
  })

  it('صفحة مقيّدة ترفض الحقن — لا محاولة executeScript', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'chrome://settings' })

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: false, reason: 'browser-internal' })
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('فشل الرسالة الأولى يُعاد مرّة واحدة قبل الاستسلام', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    let attempts = 0
    onMessage('mode/set', () => {
      attempts += 1
      if (attempts === 1) throw new Error('لا مستقبِل بعد')
      return { ok: true }
    })

    const result = await activateTool(5, 'inspect')

    expect(result).toEqual({ started: true, mode: 'inspect' })
    expect(attempts).toBe(2)
  })
})
