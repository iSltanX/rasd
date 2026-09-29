import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateResume } from '@/background/commands'
import { registerResume } from '@/background/resume'

/**
 * الاستئناف التلقائي — «البقاء عبر التنقّل» (`Docs/Rasd_Ar.md §8`، المرحلة 16).
 *
 * **الحارس الفعلي هو صلاحية المضيف الممنوحة لهذا الأصل، لا وجود المستمع
 * نفسه.** فما يُختبَر هنا هو بالضبط ذلك: هل يُقلِع فقط حين الصلاحية
 * ممنوحة، وهل يتجاهل صمتًا كل حالة أخرى (صفحة مقيّدة، صلاحية غير ممنوحة،
 * حدثٌ ليس `complete`).
 *
 * نفس نمط تمويه `commands.test.ts`: `chrome.scripting.executeScript` لا
 * يسجّل مستقبِلًا إلا حين `func` يصل بعد حقنٍ سابق — يمنع الاختبار من صنع
 * الشرط الذي لا يصنعه الإنتاج.
 */

let scripting: { executeScript: ReturnType<typeof vi.fn> }
let tabsGet: ReturnType<typeof vi.fn>
let tabsSendMessage: ReturnType<typeof vi.fn>
let permissionsContains: ReturnType<typeof vi.fn>
let updatedListener: ((tabId: number, changeInfo: unknown, tab: chrome.tabs.Tab) => void) | null

function installWorld(options: { injected?: boolean; bootSucceeds?: boolean } = {}) {
  let injected = options.injected ?? false
  scripting = {
    executeScript: vi.fn((opts: { files?: string[]; func?: unknown }) => {
      if (opts.files) {
        injected = true
        return Promise.resolve(undefined)
      }
      if (!opts.func) return Promise.resolve(undefined)
      if (!injected || options.bootSucceeds === false) return Promise.resolve([{ result: false }])
      return Promise.resolve([{ result: true }])
    }),
  }
  Object.assign(globalThis.chrome, { scripting })
}

beforeEach(() => {
  fakeBrowser.reset()
  updatedListener = null
  tabsGet = vi.fn().mockResolvedValue({ id: 9, url: 'https://example.com/' })
  tabsSendMessage = vi.fn().mockResolvedValue({ __rasd: 1, id: 'x', ok: true, value: { ok: true } })
  permissionsContains = vi.fn().mockResolvedValue(true)
  Object.assign(globalThis.chrome, {
    tabs: {
      ...globalThis.chrome.tabs,
      get: tabsGet,
      sendMessage: tabsSendMessage,
      onUpdated: {
        addListener: vi.fn((fn: typeof updatedListener) => {
          updatedListener = fn
        }),
      },
    },
    permissions: { contains: permissionsContains },
  })
  installWorld()
})

describe('activateResume', () => {
  it('صفحة مقيّدة لا تحقن شيئًا', async () => {
    tabsGet.mockResolvedValue({ id: 9, url: 'chrome://settings' })
    await activateResume(9)
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('حقنٌ فإقلاعٌ فرسالة compare/resume — بالترتيب', async () => {
    await activateResume(9)
    const calls = scripting.executeScript.mock.calls
    expect(calls[0]?.[0]).toEqual({ target: { tabId: 9 }, files: ['content.js'] })
    expect(calls[1]?.[0].func).toBeTypeOf('function')
    expect(tabsSendMessage).toHaveBeenCalled()
    const sentType = (tabsSendMessage.mock.calls[0]?.[1] as { type?: string })?.type
    expect(sentType).toBe('compare/resume')
  })

  it('إقلاعٌ فاشل لا يُرسِل شيئًا', async () => {
    installWorld({ bootSucceeds: false })
    await activateResume(9)
    expect(tabsSendMessage).not.toHaveBeenCalled()
  })

  it('حقنٌ يرمي (لا صلاحية فعلية رغم التحقّق) لا يُسقط الاستدعاء', async () => {
    scripting.executeScript = vi.fn().mockRejectedValue(new Error('Cannot access'))
    Object.assign(globalThis.chrome, { scripting })
    await expect(activateResume(9)).resolves.toBeUndefined()
    expect(tabsSendMessage).not.toHaveBeenCalled()
  })
})

describe('registerResume', () => {
  it('حدثٌ ليس complete يُتجاهَل', () => {
    registerResume()
    updatedListener?.(9, { status: 'loading' }, { url: 'https://example.com/' } as chrome.tabs.Tab)
    expect(permissionsContains).not.toHaveBeenCalled()
  })

  it('صلاحية غير ممنوحة ⇒ لا حقن', async () => {
    permissionsContains.mockResolvedValue(false)
    registerResume()
    updatedListener?.(9, { status: 'complete' }, { url: 'https://example.com/' } as chrome.tabs.Tab)
    await new Promise((r) => setTimeout(r, 0))
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('صلاحية ممنوحة على تبويب مكتمل التحميل ⇒ يستأنف فعليًّا', async () => {
    permissionsContains.mockResolvedValue(true)
    registerResume()
    updatedListener?.(9, { status: 'complete' }, { url: 'https://example.com/' } as chrome.tabs.Tab)
    await new Promise((r) => setTimeout(r, 0))
    expect(permissionsContains).toHaveBeenCalledWith({ origins: ['https://example.com/*'] })
    expect(scripting.executeScript).toHaveBeenCalled()
  })

  it('صفحة بلا عنوان صالح لا تُطلَق لها فحص صلاحية', () => {
    registerResume()
    updatedListener?.(9, { status: 'complete' }, {} as chrome.tabs.Tab)
    expect(permissionsContains).not.toHaveBeenCalled()
  })
})
