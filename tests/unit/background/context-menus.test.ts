import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerContextMenus } from '@/background/context-menus'
import { onMessage, resetHandlers } from '@/shared/messaging'

/**
 * قائمة السياق — البنود نفسها على الصفحة والصورة والتحديد.
 *
 * `fake-browser` لا يطبّق `contextMenus.create`/`removeAll` (يرميان «not
 * implemented» صراحةً)، فتُموَّه الواجهة كاملة هنا — نفس نمط `permissions.test.ts`.
 * `onClicked` واجهة حدث حقيقية (`addListener` يعمل) لكن بلا `trigger()`
 * مساعد، فالمستمِع المسجَّل يُلتقَط يدويًا ويُستدعى مباشرةً لمحاكاة نقرة.
 *
 * النقر يمرّ عبر `activateTool` الحقيقية لا نسخة مموَّهة منها — القيمة هنا
 * إثبات الأنبوب الكامل: نقرة ← `activateTool` ← حقن + إقلاع + `mode/set`،
 * بنفس محاكاة `chrome.scripting`/`chrome.tabs.sendMessage` المستعملة في
 * `commands.test.ts`.
 *
 * **تصحيح 2026-08-31:** كان الادّعاء أعلاه («الأنبوب الكامل») أوسع مما
 * يقيسه الاختبار فعلًا — كان يسجّل `mode/set` بيده ثم يتحقّق من `executeScript`
 * وحده، فلا يلمس التسليم إطلاقًا. فبقي أخضر بينما الأنبوب مقطوع في الإنتاج
 * (لا نداء إقلاع أصلًا). الآن: العالم المُحاكى لا يسجّل مستقبِلًا إلا
 * بالإقلاع، والاختبار يتحقّق من وصول الوضع لا من الحقن فقط.
 */

interface MenuCreateArgs {
  id: string
  parentId?: string
  title: string
  contexts: readonly string[]
}

function installContextMenusApi() {
  const created: MenuCreateArgs[] = []
  let clickListener: ((info: unknown, tab: unknown) => void) | null = null

  const api = {
    create: vi.fn((args: MenuCreateArgs) => {
      created.push(args)
      return args.id
    }),
    removeAll: vi.fn((cb?: () => void) => cb?.()),
    onClicked: {
      addListener: vi.fn((fn: (info: unknown, tab: unknown) => void) => {
        clickListener = fn
      }),
    },
  }

  Object.assign(globalThis.chrome, { contextMenus: api })

  return {
    created,
    click: (info: unknown, tab: unknown) => clickListener?.(info, tab),
  }
}

let scripting: { executeScript: ReturnType<typeof vi.fn> }
let tabsGet: ReturnType<typeof vi.fn>
let menus: ReturnType<typeof installContextMenusApi>
/** الأوضاع التي وصلت الصفحة فعلًا — يملؤها الإقلاع المُحاكى وحده. */
let modes: string[]

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  modes = []
  let injected = false
  // حقنُ الملفّ لا يسجّل مستقبِلًا؛ الإقلاع وحده يفعل — انظر ترويسة الملفّ.
  scripting = {
    executeScript: vi.fn((opts: { files?: string[]; func?: unknown }) => {
      if (opts.files) {
        injected = true
        return Promise.resolve(undefined)
      }
      if (!opts.func) return Promise.resolve(undefined)
      if (!injected) return Promise.resolve([{ result: false }])
      onMessage('mode/set', ({ mode }) => {
        modes.push(mode)
        return { ok: true } as const
      })
      return Promise.resolve([{ result: true }])
    }),
  }
  tabsGet = vi.fn().mockResolvedValue({ id: 5, url: 'https://example.com/' })
  Object.assign(globalThis.chrome, { scripting })
  Object.assign(globalThis.chrome.tabs, {
    get: tabsGet,
    sendMessage: (_tabId: number, message: unknown) => fakeBrowser.runtime.sendMessage(message),
  })
  menus = installContextMenusApi()
})

describe('registerContextMenus — البناء', () => {
  it('تسعة بنود بالضبط: أب واحد + ثمانية أدوات', () => {
    registerContextMenus()
    expect(menus.created).toHaveLength(9)
    expect(menus.created[0]).toMatchObject({ id: 'rasd-menu', title: 'رصد' })
  })

  it('كل بند فرعي أبوه rasd-menu، وثمانية أدوات فريدة', () => {
    registerContextMenus()
    const children = menus.created.slice(1)
    expect(children).toHaveLength(8)
    expect(children.every((c) => c.parentId === 'rasd-menu')).toBe(true)
    expect(new Set(children.map((c) => c.id)).size).toBe(8)
  })

  it('كل بند (الأب والأبناء) على السياقات الثلاثة نفسها', () => {
    registerContextMenus()
    for (const item of menus.created) {
      expect(item.contexts).toEqual(['page', 'image', 'selection'])
    }
  })

  it('يمسح القائمة القديمة قبل إعادة البناء — لا تكرار عبر تسجيلات متتالية', () => {
    registerContextMenus()
    registerContextMenus()
    expect(globalThis.chrome.contextMenus.removeAll).toHaveBeenCalledTimes(2)
  })
})

describe('registerContextMenus — النقر', () => {
  it('نقر أداة صالحة يفعِّلها عبر activateTool الحقيقية — حتى وصول الوضع', async () => {
    registerContextMenus()
    menus.click({ menuItemId: 'area' }, { id: 5 })
    await new Promise((r) => setTimeout(r, 0))

    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 5 },
      files: ['content.js'],
    })
    // الحقن وحده لا يثبت شيئًا: الوضع هو ما يثبت أن الأنبوب متّصل طرفًا لطرف.
    expect(modes).toEqual(['area'])
  })

  it('نقرة بلا تبويب (menu على صفحة الإضافة نفسها) لا تفعل شيئًا', async () => {
    registerContextMenus()
    menus.click({ menuItemId: 'area' }, {})
    await new Promise((r) => setTimeout(r, 0))

    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('معرّف بند غير معروف (لو وُجد بند خارجي) يُهمَل بصمت', async () => {
    registerContextMenus()
    menus.click({ menuItemId: 'not-a-tool' }, { id: 5 })
    await new Promise((r) => setTimeout(r, 0))

    expect(scripting.executeScript).not.toHaveBeenCalled()
  })
})
