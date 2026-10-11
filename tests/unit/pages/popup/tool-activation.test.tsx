import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Popup } from '@/pages/popup/Popup'
import { CHANNELS, resetHandlers } from '@/shared/messaging'

import { installFakePorts, type FakePortNetwork } from '../../../helpers/fake-ports'

import type { PopupLoad } from '@/pages/popup/context'
import type * as Messaging from '@/shared/messaging'

/**
 * تفعيل أداة من النافذة: البدء يُغلقها، والرفض يُبقيها على شاشة «لم تبدأ الأداة» بنصّ سببه.
 *
 * `busy` (تدقيق Copilot، N1): التقاطٌ كامل جارٍ — ربّما في تبويب آخر لا تعرضه هذه النافذة، إذ تعرض
 * `capturing` لمهمّة تبويبها وحده — يرفض الثاني. كان التفعيل يردّ «بدأ» فتُغلق النافذة على لا شيء.
 */

const { send } = vi.hoisted(() => ({
  send: vi.fn<(type: string, payload: unknown) => Promise<unknown>>(),
}))

vi.mock('@/shared/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof Messaging>()),
  send: (type: string, payload: unknown) => send(type, payload),
}))

const LOAD: PopupLoad = {
  tabId: 7,
  origin: 'https://northwind.example/pricing',
  recent: [],
  pageIssues: null,
  context: {
    restriction: { injectable: true },
    firstRun: false,
    permissionNeeded: null,
    job: null,
    liveMode: null,
    online: true,
  },
}

let container: HTMLDivElement | null = null
let ports: FakePortNetwork | null = null

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  send.mockReset()
})

afterEach(() => {
  ports?.restore()
  ports = null
  vi.restoreAllMocks()
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

async function mountPopup(load: PopupLoad = LOAD): Promise<HTMLElement> {
  // قناة المهمّة تُفتح عند التركيب — لا يخصّ هذا الاختبار، لكنه يلزم كي لا ترمي.
  ports = installFakePorts()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Popup initial={Promise.resolve(load)} />, container)
  await vi.waitFor(() => expect(container!.querySelector('[data-popup-state]')).not.toBeNull())
  return container
}

/** النافذة على تبويبٍ يجري عليه التقاطٌ كامل — حالة «جارٍ الالتقاط» من الجلسة. */
const CAPTURING: PopupLoad = {
  ...LOAD,
  context: { ...LOAD.context, job: { kind: 'full-page', done: 0, total: 0 } },
}

const INTERRUPTED = {
  kind: 'failed',
  code: 'interrupted',
  message: 'توقّف الالتقاط قبل اكتماله فلم يُحفظ. أُعيدت الصفحة كما كانت.',
}
const jobChannel = () => ports!.pairs().find((p) => p.client.name === CHANNELS.job)!

describe('Popup — تفعيل أداة', () => {
  it('البدء يُغلق النافذة', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValue({ ok: true, value: { started: true, mode: null } })
    const root = await mountPopup()

    button(root, 'صفحة كاملة')!.click()

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledWith('tool/activate', { tool: 'full-page', tabId: 7 })
  })

  it.each([
    ['busy', 'ثمّة التقاط كامل جارٍ بالفعل'],
    ['no-receiver', 'أعد تحميل الصفحة'],
    ['boot-failed', 'تعذّر تشغيل رصد في هذه الصفحة'],
  ])('رفضٌ بسبب `%s` ⇐ «لم تبدأ الأداة» بنصّه، والنافذة مفتوحة', async (reason, message) => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValue({ ok: true, value: { started: false, reason } })
    const root = await mountPopup()

    button(root, 'صفحة كاملة')!.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-popup-state]')?.getAttribute('data-popup-state')).toBe(
        'error',
      ),
    )
    expect(root.textContent).toContain('لم تبدأ الأداة')
    expect(root.textContent).toContain(message)
    expect(close).not.toHaveBeenCalled()
  })
})

/**
 * فشلٌ يصل على قناة المهمّة. `interrupted` يبثّه عاملٌ أقلع فوجد مهمّةً يتيمة من عاملٍ مات (تدقيق Copilot،
 * N3): النافذة التي أيقظته كانت تعرض «يلتقط» من الجلسة، والصادق «توقّف الالتقاط» لا «توقّفت الصفحة».
 */
describe('Popup — فشلٌ على قناة المهمّة', () => {
  it('`interrupted` على نافذةٍ تعرض التقاط تبويبها ⇐ «لم تُحفظ اللقطة» بنصّ الخلفية', async () => {
    const root = await mountPopup(CAPTURING)

    jobChannel().host.postMessage(INTERRUPTED)

    await vi.waitFor(() => expect(root.textContent).toContain('لم تُحفظ اللقطة'))
    expect(root.textContent).toContain('توقّف الالتقاط قبل اكتماله فلم يُحفظ')
  })

  /*
   * البثّ إلى كل نافذة، و`interrupted` يخصّ تبويب المهمّة اليتيمة وحده: نافذةُ تبويبٍ آخر أيقظت العامل لا تعرض
   * فشلًا لالتقاطٍ لم يجرِ فيها — ولا تقدّم «أعد المحاولة» تلتقط تبويبها هي (المراجعة المستقلّة).
   */
  it('**و`interrupted` على نافذة تبويبٍ بلا التقاط لا يعرض فشلًا**', async () => {
    const root = await mountPopup(LOAD)

    jobChannel().host.postMessage(INTERRUPTED)
    await new Promise((r) => setTimeout(r, 50))

    expect(root.querySelector('[data-popup-state]')?.getAttribute('data-popup-state')).toBe(
      'default',
    )
    expect(root.textContent).not.toContain('لم تُحفظ اللقطة')
  })

  it('وفشلٌ آخر يبقى كما كان: «توقّفت الصفحة عن الاستجابة»', async () => {
    const root = await mountPopup(CAPTURING)

    jobChannel().host.postMessage({ ...INTERRUPTED, code: 'handler-failed' })

    await vi.waitFor(() => expect(root.textContent).toContain('لم تُحفظ اللقطة'))
    expect(root.textContent).toContain('توقّفت الصفحة عن الاستجابة')
  })
})
