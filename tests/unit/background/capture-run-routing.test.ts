import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'

/**
 * `capture/run` — أي تبويب يُلتقط؟ صفحة الإضافة تعرف التبويب المقصود فتمرّره، وسكربت المحتوى لا يُصدَّق في تبويب غير
 * تبويبه (`lifecycle.ts`).
 *
 * «صفحتنا» كانت تُعرف بالمخطّط `chrome-extension://`، وأصل صفحة الإضافة في Firefox `moz-extension://<uuid>` — فصفحة
 * إضافةٍ تمرّر `tabId` صريحًا كانت تُعامَل سكربتَ محتوى، ويُحوَّل الالتقاط إلى تبويبها هي، فترفضه البوّابة
 * `not-injectable` — قِيس في Firefox 157 (2026-10-02)، و`src/background/sender.ts` يسجّل القياس قبل الإصلاح وبعده.
 *
 * الأصل كما يملؤه المتصفّح في `sender.origin`: مخطّط الإضافة ومضيفها بلا شرطة أخيرة — و`getURL('')` نفسه بشرطته.
 */

const runCapture = vi.fn()

vi.mock('@/background/capture-service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runCapture: (...args: unknown[]) => runCapture(...args) as unknown,
}))

const { registerLifecycle } = await import('@/background/lifecycle')

const UUID = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d'
/** تبويب المُرسِل: صفحة الإضافة نفسها حين تكون في تبويب، أو الصفحة التي يعيش فيها سكربت المحتوى. */
const SENDER_TAB = 7
/** التبويب المقصود في الحمولة. */
const WANTED_TAB = 42

type Sender = Partial<chrome.runtime.MessageSender>

/** `getURL` الأصلي (`chrome-extension://test-extension-id/`) — يُعاد قبل كل اختبار فلا يتسرّب أصل Firefox إلى ما بعده. */
const chromiumGetURL = chrome.runtime.getURL

/** يجعل أصل الإضافة في الاختبار أصلَ Firefox — `getURL` وحده يتغيّر، كما في المتصفّح. */
function asFirefoxExtension(): void {
  Object.assign(globalThis.chrome.runtime, {
    getURL: (path: string) => `moz-extension://${UUID}/${path.replace(/^\//u, '')}`,
  })
}

async function captureFrom(sender: Sender, tabId?: number): Promise<{ ok: boolean }> {
  const replies: { ok: boolean }[] = []
  void (await fakeBrowser.runtime.onMessage.trigger(
    {
      __rasd: 1,
      id: 'c',
      type: 'capture/run',
      payload: { kind: 'visible', dpr: 1, ...(tabId === undefined ? {} : { tabId }) },
    },
    sender,
    (reply: { ok: boolean }) => replies.push(reply),
  ))
  await vi.waitFor(() => expect(replies).toHaveLength(1))
  return replies[0]!
}

/** التبويب الذي وصل إلى `runCapture` — هذا ما يُحاكَم، لا ردّ الرسالة وحده. */
const capturedTab = (): unknown => (runCapture.mock.calls[0]?.[0] as { tabId?: number }).tabId

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  vi.clearAllMocks()
  runCapture.mockResolvedValue({ ok: true, value: { id: 'cap-1' } })
  Object.assign(globalThis.chrome, {
    runtime: {
      ...globalThis.chrome.runtime,
      getURL: chromiumGetURL,
      onConnect: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn() },
    },
  })
  registerLifecycle()
})

describe('capture/run — صفحة الإضافة في Firefox', () => {
  it('**صفحتنا بأصل `moz-extension://` وتبويبٍ صريح تُلتقط حيث طلبت** — لا تبويبها هي', async () => {
    asFirefoxExtension()
    const reply = await captureFrom(
      { tab: { id: SENDER_TAB } as chrome.tabs.Tab, origin: `moz-extension://${UUID}` },
      WANTED_TAB,
    )
    expect(reply.ok).toBe(true)
    expect(capturedTab(), 'وُجِّه الالتقاط إلى تبويب صفحة الإضافة').toBe(WANTED_TAB)
  })

  it('وصفحتنا بلا تبويبٍ في الحمولة ترجع إلى تبويبها', async () => {
    asFirefoxExtension()
    await captureFrom({
      tab: { id: SENDER_TAB } as chrome.tabs.Tab,
      origin: `moz-extension://${UUID}`,
    })
    expect(capturedTab()).toBe(SENDER_TAB)
  })

  it('وصفحةُ إضافةٍ أخرى بالمخطّط نفسه ليست صفحتنا — تبويب المُرسِل لا الحمولة', async () => {
    asFirefoxExtension()
    await captureFrom(
      {
        tab: { id: SENDER_TAB } as chrome.tabs.Tab,
        origin: 'moz-extension://00000000-0000-4000-8000-000000000000',
      },
      WANTED_TAB,
    )
    expect(capturedTab()).toBe(SENDER_TAB)
  })
})

describe('capture/run — ما لم يتغيّر', () => {
  it('صفحتنا في Chromium وتبويبٌ صريح: التبويب المطلوب', async () => {
    const origin = chrome.runtime.getURL('').replace(/\/$/u, '')
    await captureFrom({ tab: { id: SENDER_TAB } as chrome.tabs.Tab, origin }, WANTED_TAB)
    expect(capturedTab()).toBe(WANTED_TAB)
  })

  it('وصفحةُ إضافةٍ أخرى بالمخطّط `chrome-extension://` ليست صفحتنا', async () => {
    await captureFrom(
      { tab: { id: SENDER_TAB } as chrome.tabs.Tab, origin: 'chrome-extension://other' },
      WANTED_TAB,
    )
    expect(capturedTab()).toBe(SENDER_TAB)
  })

  it('سكربت محتوى يمرّر تبويبًا غير تبويبه: يُلتقط تبويبه هو', async () => {
    await captureFrom(
      { tab: { id: SENDER_TAB } as chrome.tabs.Tab, origin: 'https://northwind.example' },
      WANTED_TAB,
    )
    expect(capturedTab()).toBe(SENDER_TAB)
  })

  it('وسكربت محتوى في إطارٍ أصله معتم (`"null"`) ليس صفحتنا', async () => {
    await captureFrom({ tab: { id: SENDER_TAB } as chrome.tabs.Tab, origin: 'null' }, WANTED_TAB)
    expect(capturedTab()).toBe(SENDER_TAB)
  })

  it('ومُرسِلٌ بلا أصل ليس صفحتنا — يُغلق لا يُفتح', async () => {
    await captureFrom({ tab: { id: SENDER_TAB } as chrome.tabs.Tab }, WANTED_TAB)
    expect(capturedTab()).toBe(SENDER_TAB)
  })

  it('ولا تبويب في المُرسِل ولا في الحمولة: خطأ لا التقاط', async () => {
    const reply = await captureFrom({ origin: 'https://northwind.example' })
    expect(reply.ok).toBe(false)
    expect(runCapture).not.toHaveBeenCalled()
  })
})
