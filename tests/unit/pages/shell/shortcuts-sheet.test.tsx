/**
 * ورقة الاختصارات — `shortcuts / sheet` (`292:1691`): زرّ تغيير الاختصارات ثانويّ بأيقونة لوحة
 * المفاتيح في طرف ذيل الورقة، لا شريط بعرضها كلّه بلا أيقونة.
 */
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShortcutsSheet } from '@/pages/shell/ShortcutsSheet'

let container: HTMLDivElement | null = null

const flush = () => new Promise((r) => setTimeout(r, 0))

let create: ReturnType<typeof vi.fn>

beforeEach(() => {
  create = vi.fn().mockResolvedValue({ id: 1 })
  Object.assign(globalThis.chrome, {
    commands: { getAll: vi.fn().mockResolvedValue([]) },
    tabs: { create },
  })
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('ShortcutsSheet — زرّ التغيير', () => {
  it('يحمل أيقونة لوحة المفاتيح قبل نصّه', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<ShortcutsSheet onClose={vi.fn()} />, container)
    const change = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('غيّر اختصارات الالتقاط'),
    )!
    const icon = change.querySelector('svg.rasd-icon')
    expect(icon).not.toBeNull()
    // أوّل ما في الزرّ ترتيبًا: الأيقونة في بداية السطر (يمينًا في RTL) كما في الإطار.
    expect(icon?.nextElementSibling?.textContent).toBe('غيّر اختصارات الالتقاط')
  })
})

/**
 * أمرٌ لا اختصار له (المتصفّح حجز التركيبة — Opera يحجز ثلاثًا): بدل «بلا اختصار» رابطٌ يفتح صفحة الإسناد، وإن تعذّر
 * الفتح نصٌّ بلا رابط. والمسند يبقى مفتاحًا لا رابطًا.
 */
describe('ShortcutsSheet — الأمر غير المسنَد', () => {
  const ASSIGN = 'أسنده من صفحة الاختصارات'

  async function mount(commands: { name: string; shortcut: string }[]) {
    Object.assign(globalThis.chrome.commands, { getAll: vi.fn().mockResolvedValue(commands) })
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<ShortcutsSheet onClose={vi.fn()} />, container)
    // الأوامر تُقرأ بوعد: قبل وصولها يعرض كلّ صفٍّ «…» لا رابطًا.
    await vi.waitFor(() => expect(container?.textContent).not.toContain('…'))
    return container
  }
  const links = (root: HTMLElement) =>
    [...root.querySelectorAll('button')].filter((b) => b.textContent === ASSIGN)

  it('ثلاثة بلا إسناد ⟵ ثلاثة روابط، والمسنَد مفتاحٌ بلا رابط', async () => {
    const root = await mount([
      { name: 'capture-area', shortcut: '' },
      { name: 'capture-element', shortcut: '' },
      { name: 'capture-viewport', shortcut: '⇧⌘V' },
      { name: 'capture-full-page', shortcut: '' },
    ])
    expect(links(root)).toHaveLength(3)
    expect(root.textContent).toContain('V')
  })

  it('كلّها مسنَدة ⟵ لا رابط', async () => {
    const root = await mount(
      ['capture-area', 'capture-element', 'capture-viewport', 'capture-full-page'].map((name) => ({
        name,
        shortcut: 'Ctrl+Shift+Z',
      })),
    )
    expect(links(root)).toHaveLength(0)
  })

  it('النقر يفتح صفحة الاختصارات', async () => {
    const root = await mount([{ name: 'capture-area', shortcut: '' }])
    links(root)[0]!.click()
    await flush()
    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('تعذّر الفتح ⟵ يحلّ نصٌّ بلا رابط محلّ الروابط كلّها', async () => {
    create.mockRejectedValue(new Error('Cannot open internal page'))
    const root = await mount([
      { name: 'capture-area', shortcut: '' },
      { name: 'capture-element', shortcut: '' },
    ])
    links(root)[0]!.click()
    await flush()
    expect(links(root)).toHaveLength(0)
    expect(root.textContent).toContain('تعذّر فتح صفحة الاختصارات')
  })
})
