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
const POPUP: Sender = { origin: 'chrome-extension://rasd' }

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
    ['لقطةٌ بفضاء النافذة', { shot: { ...draftFixture().shot, rect: { space: 'viewport' } } }],
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
  it('مشكلات هذه الصفحة وحدها، الأقدم أوّلًا، ومعها المشاريع', async () => {
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
    await projects.put({ id: 'p1', name: 'منصّة', color: '#fff', createdAt: 1, updatedAt: 1 })

    const reply = await call('issue/page', undefined)
    const value = reply.value as { issues: { id: string }[]; projects: unknown[] }
    expect(value.issues.map((i) => i.id)).toEqual(['a', 'b'])
    expect(value.projects).toEqual([{ id: 'p1', name: 'منصّة' }])
  })
})

describe('issue/recheck-save', () => {
  it('الحالة من النتيجة لا من الحمولة: «محلولة» المرسَلة لا تُكتب', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', {
      results: [
        { id: 'a', outcome: 'mismatch', observed: '16px 24px', reason: null, status: 'resolved' },
      ],
    })
    expect(reply.ok).toBe(true)
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.status).toBe('open')
    expect(stored.ok && stored.value.lastCheck?.observed).toBe('16px 24px')
  })

  it('مشكلةٌ لصفحةٍ أخرى لا تكتبها هذه الصفحة ولو عرفت معرّفها', async () => {
    await issues.put(
      issueFixture({ id: 'x', page: { ...issueFixture().page, origin: 'https://bank.example' } }),
    )
    const reply = await call('issue/recheck-save', {
      results: [{ id: 'x', outcome: 'match', observed: '12px 24px', reason: null }],
    })
    expect(reply).toMatchObject({ ok: true, value: { issues: [] } })
    const stored = await issues.get('x')
    expect(stored.ok && stored.value.status).toBe('open')
    expect(stored.ok && stored.value.lastCheck).toBeNull()
  })

  it('نتيجةٌ خارج المفردات تُرفض كلّها', async () => {
    await issues.put(issueFixture({ id: 'a' }))
    const reply = await call('issue/recheck-save', {
      results: [{ id: 'a', outcome: 'fixed', observed: null, reason: null }],
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

  it('من النافذة يفعّل وضع المشكلات ثمّ يطلب الجولة', async () => {
    activateTool.mockResolvedValue({ started: true, mode: 'issues' })
    sendToTab.mockResolvedValue({ ok: true, value: { checked: 2 } })
    const reply = await call('issue/recheck-tab', { tabId: 9 }, POPUP)
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
    const reply = await call('issue/recheck-tab', { tabId: 9 }, POPUP)
    expect(reply).toMatchObject({ ok: true, value: { started: false, reason: 'restricted' } })
    expect(sendToTab).not.toHaveBeenCalled()
  })
})
