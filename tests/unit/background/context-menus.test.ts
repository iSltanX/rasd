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
 * إثبات الأنبوب الكامل: نقرة ← `activateTool` ← حقن + `mode/set`، بنفس
 * محاكاة `chrome.scripting`/`chrome.tabs.sendMessage` المستعملة في
 * `commands.test.ts`.
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

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  scripting = { executeScript: vi.fn().mockResolvedValue(undefined) }
  tabsGet = vi.fn().mockResolvedValue({ id: 5, url: 'https://example.com/' })
  Object.assign(globalThis.chrome, { scripting })
  Object.assign(globalThis.chrome.tabs, {
    get: tabsGet,
    sendMessage: (_tabId: number, message: unknown) => fakeBrowser.runtime.sendMessage(message),
  })
  menus = installContextMenusApi()
  onMessage('mode/set', () => ({ ok: true }))
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
  it('نقر أداة صالحة يفعِّلها عبر activateTool الحقيقية', async () => {
    registerContextMenus()
    menus.click({ menuItemId: 'area' }, { id: 5 })
    await new Promise((r) => setTimeout(r, 0))

    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 5 },
      files: ['content.js'],
    })
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
