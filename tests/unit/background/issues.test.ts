import 'fake-indexeddb/auto'

import { Blob as NodeBlob } from 'node:buffer'

import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseScene } from '@/modules/editor/scene-schema'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { annotations, blobs, captures, issues, projects } from '@/shared/storage/repository'

import { draftFixture, issueFixture } from '../modules/issues/fixture'

import type { ShotCapture } from '@/background/capture-service'
import type * as Messaging from '@/shared/messaging'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * معالجات المشكلات في الخلفية (ADR 0030 §3 و0031 §4): الحمولة من صفحةٍ قد تكون معادية.
 */

const shootCapture = vi.fn<() => Promise<{ ok: true; value: ShotCapture }>>()
const activateTool = vi.fn()
const sendToTab = vi.fn()

vi.mock('@/background/capture-service', () => ({ shootCapture: () => shootCapture() }))
vi.mock('@/background/commands', () => ({
  activateTool: (...args: unknown[]) => activateTool(...args) as unknown,
}))
vi.mock('@/shared/messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof Messaging>()),
  sendToTab: (...args: unknown[]) => sendToTab(...args) as unknown,
}))

const { registerIssues, setIssueIds } = await import('@/background/issues')

const PAGE_URL = 'https://northwind.example/pricing#plans'
type Sender = Partial<chrome.runtime.MessageSender>
const SITE = { tab: { id: 4 }, origin: 'https://northwind.example' } as unknown as Sender
/** أصل الإضافة كما يملؤه المتصفّح لصفحاتها — من `getURL` لا ثابتًا مكتوبًا. */
const POPUP = (): Sender => ({ origin: new URL(chrome.runtime.getURL('')).origin })

function captureRecord(): CaptureRecord {
  return {
    id: 'cap-1',
    createdAt: 1,
    origin: 'https://northwind.example',
    url: PAGE_URL,
    title: 'الأسعار',
    kind: 'element',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 464,
    height: 192,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

async function call(
  type: string,
  payload: unknown,
  sender: Sender = SITE,
): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> {
  const replies: { ok: boolean }[] = []
  void (await fakeBrowser.runtime.onMessage.trigger(
    { __rasd: 1, id: 'i', type, payload },
    sender,
    (reply: { ok: boolean }) => replies.push(reply),
  ))
  await vi.waitFor(() => expect(replies).toHaveLength(1))
  return replies[0] as never
}

let ids = 0

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  setIncognitoWritePolicy(false)
  vi.clearAllMocks()
  ids = 0
  setIssueIds(() => `id-${++ids}`)
  vi.spyOn(chrome.tabs, 'get').mockResolvedValue({
    id: 4,
    url: PAGE_URL,
    title: 'الأسعار',
  } as never)
  shootCapture.mockResolvedValue({
    ok: true,
    value: {
      record: captureRecord(),
      blob: new NodeBlob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) as unknown as Blob,
      width: 464,
      height: 192,
    },
  })
  registerIssues()
})

describe('issue/create', () => {
  it('يكتب المشكلة ولقطتها وملاحظتها معًا، والرابط من التبويب بلا جزء #', async () => {
    const reply = await call('issue/create', draftFixture())
    expect(reply).toMatchObject({ ok: true, value: { captureId: 'cap-1' } })

    const stored = await issues.getAll()
    expect(stored.ok && stored.value).toHaveLength(1)
    const issue = stored.ok ? stored.value[0] : undefined
    expect(issue?.page).toMatchObject({
      url: 'https://northwind.example/pricing',
      origin: 'https://northwind.example',
      path: '/pricing',
      title: 'الأسعار',
    })
    expect(issue?.status).toBe('open')
    expect(issue?.evidence.captureId).toBe('cap-1')
    expect(issue?.note?.captureId).toBe('cap-1')

    expect((await captures.get('cap-1')).ok).toBe(true)
    expect((await blobs.get('cap-1')).ok).toBe(true)
    const scene = await annotations.get('cap-1')
    const parsed = scene.ok ? parseScene(scene.value.scene) : null
    expect(parsed?.ok).toBe(true)
    const notes = parsed?.ok ? parsed.value.nodes.filter((n) => n.kind === 'note') : []
    expect(notes.map((n) => n.id)).toEqual([issue?.note?.noteId])
  })

  it('رابطٌ أو عنوانٌ فوق حدّ المخطّط يُقصّ فتبقى المشكلة مقروءةً في لوحتها (المراجعة المستقلّة)', async () => {
    vi.spyOn(chrome.tabs, 'get').mockResolvedValue({
      id: 4,
      url: `https://northwind.example/pricing?q=${'x'.repeat(5000)}#top`,
      title: 'ع'.repeat(1500),
    } as never)
    expect((await call('issue/create', draftFixture())).ok).toBe(true)
    const page = await call('issue/page', undefined)
    const listed = (page.value as { issues: { page: { url: string; title: string } }[] }).issues
    expect(listed).toHaveLength(1)
    expect(listed[0]?.page.url).toBe('https://northwind.example/pricing')
    expect(listed[0]?.page.title).toHaveLength(1024)
    // ولقطة الدليل كذلك بلا جزء `#`.
    const capture = await captures.get('cap-1')
    expect(capture.ok && capture.value.url.includes('#')).toBe(false)
  })

  it('بلا مربّع الملاحظة لا مشهد، والمشروع المحذوف لا يُكتب معرّفًا يتيمًا', async () => {
    const reply = await call('issue/create', draftFixture({ withNote: false, projectId: 'gone' }))
    expect(reply.ok).toBe(true)
    const stored = await issues.getAll()
    expect(stored.ok && stored.value[0]?.note).toBeNull()
    expect(stored.ok && stored.value[0]?.projectId).toBeNull()
    expect((await annotations.count()).ok && (await annotations.count())).toMatchObject({
      value: 0,
    })
  })

  it('المشروع الموجود يُكتب على المشكلة ولقطتها', async () => {
    await projects.put({ id: 'p1', name: 'منصّة', color: '#fff', createdAt: 1, updatedAt: 1 })
    await call('issue/create', draftFixture({ projectId: 'p1' }))
    const stored = await issues.getAll()
    expect(stored.ok && stored.value[0]?.projectId).toBe('p1')
    const capture = await captures.get('cap-1')
    expect(capture.ok && capture.value.projectId).toBe('p1')
  })

  it.each([
    ['عنوانٌ فارغ', { title: '   ' }],
    ['عنوانٌ فوق حدّه', { title: 'أ'.repeat(201) }],
    ['مسافةٌ بلا عنصر ثانٍ', { check: { ...draftFixture().check, kind: 'spacing' as const } }],
    ['عنصرٌ بفضاء النافذة', { shot: { ...draftFixture().shot, element: { space: 'viewport' } } }],
    ['متوقَّعةٌ لا تُفهم لنوعها', { check: { ...draftFixture().check, kind: 'colour' as const } }],
  ])('مسودّة معادية (%s) تُرفض ولا يُلتقط ولا يُكتب شيء', async (_name, over) => {
    const reply = await call('issue/create', { ...draftFixture(), ...over })
    expect(reply).toMatchObject({ ok: false, error: { code: 'invalid-data' } })
    expect(shootCapture).not.toHaveBeenCalled()
    const count = await issues.count()
    expect(count.ok && count.value).toBe(0)
  })

  it('فشل الكتابة لا يترك لقطةً يتيمة: التصفّح الخاص يرفض الأربعة معًا', async () => {
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    try {
      const reply = await call('issue/create', draftFixture())
      expect(reply).toMatchObject({ ok: false, error: { code: 'incognito-blocked' } })
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
      setIncognitoWritePolicy(false)
    }
    const [c, i] = await Promise.all([captures.count(), issues.count()])
    expect(c.ok && c.value).toBe(0)
    expect(i.ok && i.value).toBe(0)
  })
})

describe('issue/page', () => {
  it('مشكلات هذه الصفحة وحدها، الأقدم أوّلًا، ومعها أسطر العرض', async () => {
    await issues.putMany([
      issueFixture({ id: 'b', createdAt: 20 }),
      issueFixture({ id: 'a', createdAt: 10 }),
      issueFixture({
        id: 'other-path',
        page: { ...issueFixture().page, path: '/docs', url: 'https://northwind.example/docs' },
      }),
      issueFixture({
        id: 'other-site',
        page: { ...issueFixture().page, origin: 'https://evil.example' },
      }),
    ])
    const reply = await call('issue/page', undefined)
    const value = reply.value as {
      issues: { id: string }[]
      lines: Record<string, string>
      checked: string
    }
    expect(value.issues.map((i) => i.id)).toEqual(['a', 'b'])
    expect(value.lines.a).toBe('الآن 14px 24px · المتوقَّع 12px 24px')
    expect(value.checked).toBe('لم تُفحص بعد')
  })
})

describe('issue/recheck-save', () => {
  const seen = (id: string, observed: string) => ({
    id,
    outcome: null,
    observed,
    reason: null,
    context: { rootFontPx: 16, fontPx: 16 },
  })

  it('الحكم في الخلفية على المتوقَّعة المخزَّنة: «محلولة» المرسَلة لا تُكتب', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', {
      observations: [{ ...seen('a', '16px 24px'), status: 'resolved' }],
    })
    expect(reply.ok).toBe(true)
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.status).toBe('open')
    expect(stored.ok && stored.value.lastCheck?.observed).toBe('16px 24px')
  })

  it('المرصودة تطابق المتوقَّعة ⟵ محلولة، وتعود أسطر العرض معها', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', { observations: [seen('a', '12px 24px')] })
    const value = reply.value as { issues: { status: string }[]; lines: Record<string, string> }
    expect(value.issues[0]?.status).toBe('resolved')
    expect(value.lines.a).toBe('الآن 12px 24px — يطابق المتوقَّع')
  })

  it('صفحةٌ تعلن «مطابقة» بنفسها تُرفض — النتائج التي تحسمها الصفحة ثلاث لا غير', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', {
      observations: [{ ...seen('a', '99px'), outcome: 'match' }],
    })
    expect(reply).toMatchObject({ ok: false, error: { code: 'invalid-data' } })
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.lastCheck).toBeNull()
  })

  it('مشكلةٌ لصفحةٍ أخرى لا تكتبها هذه الصفحة ولو عرفت معرّفها', async () => {
    await issues.put(
      issueFixture({ id: 'x', page: { ...issueFixture().page, origin: 'https://bank.example' } }),
    )
    const reply = await call('issue/recheck-save', { observations: [seen('x', '12px 24px')] })
    expect(reply).toMatchObject({ ok: true, value: { issues: [] } })
    const stored = await issues.get('x')
    expect(stored.ok && stored.value.status).toBe('open')
    expect(stored.ok && stored.value.lastCheck).toBeNull()
  })

  it('نتيجةٌ خارج المفردات تُرفض كلّها', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', {
      observations: [{ ...seen('a', '1px'), outcome: 'fixed' }],
    })
    expect(reply).toMatchObject({ ok: false, error: { code: 'invalid-data' } })
  })
})

describe('issue/recheck-tab — بإيماءة النافذة وحدها', () => {
  it('من سكربت محتوى يُرفض ولا يُحقن شيء', async () => {
    const reply = await call('issue/recheck-tab', { tabId: 9 }, SITE)
    expect(reply).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(activateTool).not.toHaveBeenCalled()
    expect(sendToTab).not.toHaveBeenCalled()
  })

  it('من صفحة إضافةٍ أخرى (أصلٌ غير أصلنا) يُرفض', async () => {
    const reply = await call(
      'issue/recheck-tab',
      { tabId: 9 },
      { origin: 'chrome-extension://other' },
    )
    expect(reply).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(activateTool).not.toHaveBeenCalled()
  })

  it('من النافذة يفعّل وضع المشكلات ثمّ يطلب الجولة', async () => {
    activateTool.mockResolvedValue({ started: true, mode: 'issues' })
    sendToTab.mockResolvedValue({ ok: true, value: { checked: 2 } })
    const reply = await call('issue/recheck-tab', { tabId: 9 }, POPUP())
    expect(reply).toMatchObject({ ok: true, value: { started: true } })
    expect(activateTool).toHaveBeenCalledWith(9, 'issues')
    expect(sendToTab).toHaveBeenCalledWith(
      { tabId: 9 },
      'issue/run-recheck',
      undefined,
      expect.anything(),
    )
  })

  it('صفحةٌ مقيّدة تُبلَّغ بسببها ولا يُطلب فحص', async () => {
    activateTool.mockResolvedValue({ started: false, reason: 'restricted' })
    const reply = await call('issue/recheck-tab', { tabId: 9 }, POPUP())
    expect(reply).toMatchObject({ ok: true, value: { started: false, reason: 'restricted' } })
    expect(sendToTab).not.toHaveBeenCalled()
  })
})
