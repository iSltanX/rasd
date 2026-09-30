import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadPopup, type PopupLoad } from '@/pages/popup/context'
import { Popup } from '@/pages/popup/Popup'
import { onMessage, resetHandlers } from '@/shared/messaging'
import { closeDatabase } from '@/shared/storage/db'

import { installFakePorts, type FakePortNetwork } from '../../../helpers/fake-ports'

/**
 * زمن أول عرض للنافذة (`verify:popup`، ميزانيته 100ms) — عيبان في مسار العرض
 * قيسا في `STAGES/04` بجدول أداء الصفحة، ولكلٍّ اختبار يسقط على الشيفرة القديمة:
 *
 *   1. الجلب كان يبدأ داخل `useEffect`، وPreact يؤجّله إلى ما بعد الإطار التالي:
 *      بيانات وصلت تنتظر إطارًا كاملًا قبل أن تُركَّب.
 *   2. الجلسة والإعدادات والمكتبة كانت تُطلَب بعد استعلام التبويب لا معه.
 */

let container: HTMLDivElement | null = null
let ports: FakePortNetwork | null = null

beforeEach(async () => {
  fakeBrowser.reset()
  resetHandlers()
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
})

afterEach(() => {
  ports?.restore()
  ports = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

/** يفرغ طابور المهامّ الدقيقة وحده — بلا مؤقّت ولا إطار. */
async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

describe('loadPopup — ما لا يحتاج التبويب يُطلَب مع استعلامه', () => {
  it('session/get وsettings/get يصلان والاستعلام عن التبويب لم يعد بعد', async () => {
    const arrived: string[] = []
    onMessage('session/get', () => {
      arrived.push('session/get')
      return {}
    })
    onMessage('settings/get', () => {
      arrived.push('settings/get')
      return { onboarding: { completed: true, completedAt: 1 } }
    })

    let answerQuery: (tabs: chrome.tabs.Tab[]) => void = () => undefined
    vi.spyOn(chrome.tabs, 'query').mockImplementation(
      () => new Promise((resolve) => (answerQuery = resolve)) as never,
    )

    const pending = loadPopup()
    await new Promise((r) => setTimeout(r, 20))
    expect(arrived.sort()).toEqual(['session/get', 'settings/get'])

    answerQuery([{ id: 7, url: 'chrome://settings', incognito: false } as chrome.tabs.Tab])
    const loaded = await pending
    expect(loaded?.tabId).toBe(7)
    expect(loaded?.context.restriction).toEqual({ injectable: false, reason: 'browser-internal' })
  })

  it('لا تبويب بمعرّف ⇐ null، فتبقى القشرة الفارغة', async () => {
    onMessage('session/get', () => ({}))
    onMessage('settings/get', () => ({}))
    vi.spyOn(chrome.tabs, 'query').mockResolvedValue([] as never)
    expect(await loadPopup()).toBeNull()
  })
})

describe('Popup — يتركّب ساعة وصول البيانات لا بعد الإطار التالي', () => {
  it('الحالة تظهر بالمهامّ الدقيقة وحدها، والإطار والمؤقّتات موقوفة', async () => {
    const load: PopupLoad = {
      tabId: 7,
      origin: 'chrome://settings',
      recent: [],
      context: {
        restriction: { injectable: false, reason: 'browser-internal' },
        firstRun: false,
        permissionNeeded: null,
        job: null,
        liveMode: null,
        online: true,
      },
    }
    // قناة المهمّة تُفتح في `useEffect` — لا يخصّ هذا الاختبار، لكنه يلزم كي لا ترمي.
    ports = installFakePorts()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    container = document.createElement('div')
    document.body.appendChild(container)

    render(<Popup initial={Promise.resolve(load)} />, container)
    await flushMicrotasks()

    expect(container.querySelector('[data-popup-state]')?.getAttribute('data-popup-state')).toBe(
      'restricted',
    )
  })
})
