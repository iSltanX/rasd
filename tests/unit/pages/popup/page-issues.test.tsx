import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPageIssues,
  loadPopup,
  type PageIssueCounts,
  type PopupLoad,
  type RecentEntry,
} from '@/pages/popup/context'
import { Popup } from '@/pages/popup/Popup'
import { Default } from '@/pages/popup/views/Default'
import { resetHandlers } from '@/shared/messaging'
import { errWith } from '@/shared/result'
import { resetSettingsCache } from '@/shared/settings'
import { closeDatabase } from '@/shared/storage/db'
import { issues } from '@/shared/storage/repository'

import { installFakePorts, type FakePortNetwork } from '../../../helpers/fake-ports'
import { issueFixture } from '../../modules/issues/fixture'

import type { IssueStatus } from '@/shared/issue-schema'
import type * as Messaging from '@/shared/messaging'

/**
 * قسم «مشكلات هذه الصفحة» في النافذة (`popup / page-issues`): يحلّ محلّ «الأخيرة» حين للصفحة مشكلات، لأن
 * النافذة 360×520 لا تتّسع لهما. ثلاثة أشياء تُثبَت هنا: القراءة تُحصَر بأصل الصفحة ومسارها، والعرض يبدّل
 * القسمين، و«أعد الفحص» تبدأ الفحص وتُغلق على النجاح وتُبقي النافذة على الفشل.
 */

const { send } = vi.hoisted(() => ({
  send: vi.fn<(type: string, payload: unknown) => Promise<unknown>>(),
}))

vi.mock('@/shared/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof Messaging>()),
  send: (type: string, payload: unknown) => send(type, payload),
}))

const PAGE = issueFixture().page
const URL_OF_TAB = `${PAGE.origin}${PAGE.path}?plan=pro#compare`

let container: HTMLDivElement | null = null
let ports: FakePortNetwork | null = null

beforeEach(async () => {
  fakeBrowser.reset()
  resetHandlers()
  resetSettingsCache()
  send.mockReset()
  // `fake-browser` لا يطبّق `permissions` — الإذن ممنوح فلا تُقرأ المراجع.
  Object.assign(globalThis.chrome, { permissions: { contains: vi.fn().mockResolvedValue(true) } })
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
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

/** مشكلة على صفحة بعينها بحالة بعينها. */
function issueAt(id: string, status: IssueStatus, over: { origin?: string; path?: string } = {}) {
  return issueFixture({
    id,
    status,
    page: { ...PAGE, ...over, url: `${over.origin ?? PAGE.origin}${over.path ?? PAGE.path}` },
  })
}

async function seed(...list: ReturnType<typeof issueAt>[]): Promise<void> {
  for (const issue of list) expect((await issues.put(issue)).ok).toBe(true)
}

const COUNTS: PageIssueCounts = { open: 2, 'needs-verification': 1, resolved: 1 }

describe('loadPopup — مشكلات الصفحة بأصلها ومسارها وحدهما', () => {
  it('يعدّ مشكلات أصل التبويب ومساره بحالاتها، ويتجاهل الاستعلام والجزء وغيرهما', async () => {
    await seed(
      issueAt('a', 'open'),
      issueAt('b', 'open'),
      issueAt('c', 'needs-verification'),
      issueAt('d', 'resolved'),
      // مسارٌ آخر في الموقع نفسه، وأصلٌ آخر بالمسار نفسه، وبروتوكولٌ آخر بالمضيف نفسه: لا تُعدّ.
      issueAt('e', 'open', { path: '/about' }),
      issueAt('f', 'open', { origin: 'https://other.example' }),
      issueAt('g', 'open', { origin: 'http://northwind.example' }),
    )
    vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
      { id: 7, url: URL_OF_TAB, incognito: false } as chrome.tabs.Tab,
    ] as never)

    const loaded = await loadPopup()

    expect(loaded?.pageIssues).toEqual({ open: 2, 'needs-verification': 1, resolved: 1 })
  })

  it('صفحةٌ بلا مشكلات مسجَّلة عليها ⇐ null فتبقى «الأخيرة»', async () => {
    await seed(issueAt('e', 'open', { path: '/about' }))
    vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
      { id: 7, url: URL_OF_TAB, incognito: false } as chrome.tabs.Tab,
    ] as never)

    expect((await loadPopup())?.pageIssues).toBeNull()
  })

  it.each([
    ['تبويب بلا رابط مقروء', undefined],
    ['صفحة المتصفح', 'chrome://settings'],
    ['ملفّ محلّي', 'file:///Users/me/page.html'],
    ['نصٌّ ليس رابطًا', 'not a url'],
  ])('%s ⇐ لا قسم ولا قراءة للقاعدة', async (_name, url) => {
    const read = vi.spyOn(issues, 'byIndex')
    expect(await loadPageIssues(url)).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('لا تعدّ ما لا تقرؤه اللوحة ولا المكتبة: نسخةٌ أحدث أو حالةٌ مجهولة (المراجعة المستقلّة)', async () => {
    await seed(issueAt('a', 'open'), { ...issueAt('b', 'open'), schemaVersion: 2 })
    await issues.put({ ...issueAt('c', 'open'), status: 'closed' as never })
    expect(await loadPageIssues(URL_OF_TAB)).toEqual({
      open: 1,
      'needs-verification': 0,
      resolved: 0,
    })
  })

  it('قراءةٌ تفشل أو ترمي ⇐ null بصمت، لا رفض يُسقط النافذة', async () => {
    vi.spyOn(issues, 'byIndex').mockResolvedValueOnce(errWith('unknown', 'boom'))
    expect(await loadPageIssues(URL_OF_TAB)).toBeNull()

    vi.spyOn(issues, 'byIndex').mockRejectedValueOnce(new Error('boom'))
    expect(await loadPageIssues(URL_OF_TAB)).toBeNull()
  })
})

const RECENT: RecentEntry[] = [
  {
    record: {
      id: 'c1',
      createdAt: 1,
      origin: 'https://example.com',
      title: 'لقطة',
    } as RecentEntry['record'],
    thumbUrl: null,
    withheld: false,
  },
]

function mountDefault(props: {
  pageIssues?: PageIssueCounts | null
  onShowIssues?: () => void
  onRecheckIssues?: () => void
}): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <Default
      onTool={() => undefined}
      recent={RECENT}
      onOpenRecent={() => undefined}
      onOpenLibrary={() => undefined}
      {...props}
    />,
    container,
  )
  return container
}

const section = (root: HTMLElement, label: string) =>
  root.querySelector(`section[aria-label="${label}"]`)

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('Default — «مشكلات هذه الصفحة» بدل «الأخيرة»', () => {
  it('مشكلاتٌ للصفحة ⇐ القسم ظاهر و«الأخيرة» غائبة بلقطاتها ورابطها', () => {
    const root = mountDefault({
      pageIssues: COUNTS,
      onShowIssues: () => undefined,
      onRecheckIssues: () => undefined,
    })

    expect(section(root, 'مشكلات هذه الصفحة')).not.toBeNull()
    expect(section(root, 'الأخيرة')).toBeNull()
    expect(button(root, 'عرض الكل')).toBeUndefined()
    expect(root.textContent).not.toContain('الأخيرة')
    // الالتقاط والفحص باقيان كما هما.
    expect(section(root, 'الالتقاط')).not.toBeNull()
    expect(section(root, 'الفحص')).not.toBeNull()
  })

  it('لا مشكلات ⇐ «الأخيرة» كما كانت ولا أثر للقسم', () => {
    const root = mountDefault({
      pageIssues: null,
      onShowIssues: () => undefined,
      onRecheckIssues: () => undefined,
    })

    expect(section(root, 'الأخيرة')).not.toBeNull()
    expect(button(root, 'عرض الكل')).toBeDefined()
    expect(section(root, 'مشكلات هذه الصفحة')).toBeNull()
    expect(button(root, 'أعد الفحص')).toBeUndefined()
  })

  it('بلا معالجَي الفعلين لا يُعرض القسم — لا زرّ صامت', () => {
    const root = mountDefault({ pageIssues: COUNTS })
    expect(section(root, 'مشكلات هذه الصفحة')).toBeNull()
    expect(section(root, 'الأخيرة')).not.toBeNull()
  })

  it('البطاقة: العدد بأرقام هندية وسطر المفتوحة وما تحتاج تحققًا وزرّ بأيقونة التحديث', () => {
    const root = mountDefault({
      pageIssues: COUNTS,
      onShowIssues: () => undefined,
      onRecheckIssues: () => undefined,
    })
    const text = section(root, 'مشكلات هذه الصفحة')!.textContent

    expect(text).toContain('٤ مشكلات')
    expect(text).toContain('٢ مفتوحة · ١ تحتاج تحققًا')
    expect(button(root, 'أعد الفحص')!.querySelector('svg')).not.toBeNull()
    expect(button(root, 'اعرضها')).toBeDefined()
  })

  it.each([
    [{ open: 1, 'needs-verification': 0, resolved: 0 }, 'مشكلة واحدة', '١ مفتوحة'],
    [{ open: 0, 'needs-verification': 2, resolved: 0 }, 'مشكلتان', '٢ تحتاج تحققًا'],
    [{ open: 0, 'needs-verification': 0, resolved: 3 }, '٣ مشكلات', 'كلّها محلولة'],
    [{ open: 8, 'needs-verification': 3, resolved: 0 }, '١١ مشكلة', '٨ مفتوحة · ٣ تحتاج تحققًا'],
  ] satisfies [PageIssueCounts, string, string][])(
    'صيغ العدد والسطر: %j ⇐ «%s» و«%s»',
    (counts, headline, detail) => {
      const root = mountDefault({
        pageIssues: counts,
        onShowIssues: () => undefined,
        onRecheckIssues: () => undefined,
      })
      const text = section(root, 'مشكلات هذه الصفحة')!.textContent
      expect(text).toContain(headline)
      expect(text).toContain(detail)
    },
  )

  it('«اعرضها» و«أعد الفحص» تستدعيان كلٌّ فعلها', () => {
    const onShowIssues = vi.fn()
    const onRecheckIssues = vi.fn()
    const root = mountDefault({ pageIssues: COUNTS, onShowIssues, onRecheckIssues })

    button(root, 'اعرضها')!.click()
    expect(onShowIssues).toHaveBeenCalledTimes(1)
    expect(onRecheckIssues).not.toHaveBeenCalled()

    button(root, 'أعد الفحص')!.click()
    expect(onRecheckIssues).toHaveBeenCalledTimes(1)
  })
})

const LOAD: PopupLoad = {
  tabId: 7,
  origin: URL_OF_TAB,
  recent: [],
  pageIssues: COUNTS,
  context: {
    restriction: { injectable: true },
    firstRun: false,
    permissionNeeded: null,
    job: null,
    liveMode: null,
    online: true,
  },
}

async function mountPopup(): Promise<HTMLElement> {
  // قناة المهمّة تُفتح عند التركيب — لا يخصّ هذا الاختبار، لكنه يلزم كي لا ترمي.
  ports = installFakePorts()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Popup initial={Promise.resolve(LOAD)} />, container)
  await vi.waitFor(() => expect(button(container!, 'أعد الفحص')).toBeDefined())
  return container
}

describe('Popup — «أعد الفحص» و«اعرضها»', () => {
  it('«أعد الفحص» ترسل issue/recheck-tab بمعرّف التبويب، والبدء يُغلق النافذة', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValue({ ok: true, value: { started: true } })
    const root = await mountPopup()

    button(root, 'أعد الفحص')!.click()

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('issue/recheck-tab', { tabId: 7 })
  })

  it.each([
    [
      'رفض بسببه (no-receiver)',
      { ok: true, value: { started: false, reason: 'no-receiver' } },
      'أعد تحميل الصفحة',
    ],
    [
      'رفض بسبب آخر',
      { ok: true, value: { started: false, reason: 'excluded-site' } },
      'تعذّر إعادة فحص',
    ],
    ['خطأ في الرسالة نفسها', errWith('no-receiver'), 'تعذّر إعادة فحص'],
  ])('%s ⇐ شاشة خطأ والنافذة مفتوحة', async (_name, reply, message) => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValue(reply)
    const root = await mountPopup()

    button(root, 'أعد الفحص')!.click()

    await vi.waitFor(() =>
      expect(root.querySelector('[data-popup-state]')?.getAttribute('data-popup-state')).toBe(
        'error',
      ),
    )
    expect(root.textContent).toContain('لم تبدأ إعادة الفحص')
    expect(root.textContent).toContain(message)
    expect(close).not.toHaveBeenCalled()
  })

  it('«أعد المحاولة» على شاشة الخطأ تعيد إرسال إعادة الفحص لا أداةً', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValueOnce({ ok: true, value: { started: false, reason: 'boot-failed' } })
    const root = await mountPopup()
    button(root, 'أعد الفحص')!.click()
    await vi.waitFor(() => expect(button(root, 'أعد المحاولة')).toBeDefined())

    send.mockResolvedValueOnce({ ok: true, value: { started: true } })
    button(root, 'أعد المحاولة')!.click()

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(send.mock.calls.map(([type]) => type)).toEqual([
      'issue/recheck-tab',
      'issue/recheck-tab',
    ])
  })

  it('«اعرضها» تفعّل أداة المشكلات في التبويب وتُغلق على النجاح', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    send.mockResolvedValue({ ok: true, value: { started: true, mode: 'issues' } })
    const root = await mountPopup()

    button(root, 'اعرضها')!.click()

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledWith('tool/activate', { tool: 'issues', tabId: 7 })
  })
})
