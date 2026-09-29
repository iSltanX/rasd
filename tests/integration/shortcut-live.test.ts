import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installShortcuts, liveBindings, type ShortcutAction } from '@/content/shortcuts'
import { resetSettingsCache } from '@/shared/settings'

/**
 * تغيير حرف الأداة من الإعدادات يصل الطبقة المفتوحة **بلا إعادة حقن** — معيار قبول
 * `STAGES/03` و`Docs/Engineering.md §6` الصفّ 117.
 *
 * المستمع يُركَّب مرّة واحدة كما في `content/index.ts`، ثمّ تكتب «صفحة الإعدادات» (سياق آخر،
 * تحاكيه كتابة مباشرة في التخزين) حرفًا جديدًا — والضغطة التالية بالحرف الجديد تبدّل الأداة
 * في الجلسة نفسها، والقديم يسكت.
 */

let remove: (() => void) | null = null

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

afterEach(() => {
  remove?.()
  remove = null
})

/** ⌥⇧ + حرف — تركيبة أدوات الصفحة. */
function press(code: string) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code, key: code, altKey: true, shiftKey: true, bubbles: true }),
  )
}

async function writeToolKey(code: string) {
  await fakeBrowser.storage.local.set({
    'rasd:settings': { shortcuts: { toolKeys: { inspect: code } } },
  })
}

function install(live: ReturnType<typeof liveBindings>) {
  const actions: ShortcutAction[] = []
  remove = installShortcuts({ doc: document, bindings: live.get, onAction: (a) => actions.push(a) })
  return actions
}

const inspects = (actions: ShortcutAction[]) =>
  actions.filter((a) => a.kind === 'mode' && a.mode === 'inspect').length

describe('اختصار الأداة الحيّ', () => {
  it('الحرف الجديد يعمل في الجلسة المفتوحة، والقديم يسكت — بلا إعادة تركيب', async () => {
    const live = liveBindings({})
    const actions = install(live)

    press('KeyI')
    expect(inspects(actions)).toBe(1)

    await writeToolKey('KeyJ')
    await vi.waitFor(() => expect(live.get().some((b) => b.code === 'KeyJ')).toBe(true))

    press('KeyJ')
    expect(inspects(actions)).toBe(2)
    press('KeyI')
    expect(inspects(actions)).toBe(2)
    live.stop()
  })

  it('بعد فكّ الاشتراك لا يُلتقط تغيّر — الحارس السالب', async () => {
    const live = liveBindings({})
    const actions = install(live)
    await vi.waitFor(() => expect(live.get().some((b) => b.code === 'KeyI')).toBe(true))
    live.stop()

    await writeToolKey('KeyJ')
    await new Promise((r) => setTimeout(r, 20))

    press('KeyJ')
    expect(inspects(actions)).toBe(0)
    press('KeyI')
    expect(inspects(actions)).toBe(1)
  })
})
