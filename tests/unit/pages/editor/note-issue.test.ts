import 'fake-indexeddb/auto'

import { options, h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHistory } from '@/modules/editor/history'
import { asNodeId, type NodeId, type NoteNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { loadEditorContext, type ObjectUrls } from '@/pages/editor/context'
import { indexNoteIssues, loadNoteIssues, noteIssueSubject } from '@/pages/editor/note-issues'
import { NoteList } from '@/pages/editor/parts/NoteList'
import { devicePoint } from '@/shared/geometry'
import { clearAllStores, issues, putCaptureWithBlob } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

import type { IssueRecord, IssueStatus } from '@/shared/issue-schema'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * `editor / note-issue` (`378:1489`): الملاحظة المربوطة بمشكلة تعرض حالتها.
 *
 * الربط باتجاه واحد (ADR 0030): سجلّ المشكلة يحمل `note: { captureId, noteId }` والملاحظة لا تعرف. فالمحرّر
 * يبحث من اللقطة بفهرس `captureId` ثمّ يبني خريطة `noteId ← مشكلة`.
 */

const send = vi.fn<(type: string, payload: unknown) => Promise<unknown>>()
vi.mock('@/shared/messaging', () => ({
  send: (type: string, payload: unknown) => send(type, payload),
}))

const CAPTURE = 'c1'

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 } as const
const font = { family: 'ui', sizePx: 16, weight: 400, letterSpacingPx: 0 } as const

const note = (id: string, over: Partial<NoteNode> = {}): NoteNode => ({
  kind: 'note',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(0, 0),
  widthPx: 240,
  title: '',
  body: '',
  tag: null,
  font,
  paddingPx: 12,
  pinId: null,
  ...over,
})

const sceneOf = (...nodes: Scene['nodes']): Scene => ({
  ...emptyScene({ captureId: CAPTURE, width: 100, height: 100, dpr: 1 }),
  nodes,
})

/** مشكلة لملاحظة في لقطة، بدليلٍ في اللقطة نفسها ما لم يُقلَب. */
function issueOf(id: string, over: Partial<IssueRecord> = {}): IssueRecord {
  const base = issueFixture()
  return {
    ...base,
    id,
    evidence: { ...base.evidence, captureId: CAPTURE },
    note: { captureId: CAPTURE, noteId: 'n1' },
    ...over,
  }
}

function captureRecord(): CaptureRecord {
  return {
    id: CAPTURE,
    createdAt: 1,
    origin: 'https://example.test',
    url: 'https://example.test/page',
    title: 'صفحة الاختبار',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    favorite: false,
    trashedAt: null,
    archived: false,
  }
}

const urls: ObjectUrls = { create: () => 'blob:test/0', revoke: () => undefined }

let container: HTMLDivElement | null = null

beforeEach(async () => {
  await clearAllStores()
  send.mockReset()
  send.mockResolvedValue({ ok: true, value: { tabId: 1 } })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

options.debounceRendering = (cb) => {
  cb()
}

function mount(scene: Scene, linked?: ReadonlyMap<string, IssueRecord>): HTMLDivElement {
  const history = createHistory(scene)
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)
  render(
    h(NoteList, {
      history,
      selection: new Set<NodeId>(),
      onSelect: () => undefined,
      onChange: () => undefined,
      ...(linked ? { issues: linked } : {}),
    }),
    container,
  )
  return container
}

const q = (root: Element, sel: string): HTMLElement | null => root.querySelector(sel)

describe('البحث عن مشكلات لقطة', () => {
  it('**يعيد ملاحظات هذه اللقطة وحدها** — بفهرس `captureId` من القاعدة', async () => {
    await issues.put(issueOf('a'))
    // لقطة أخرى، والمعرّف نفسه لملاحظتها — لا يختلط بملاحظة هذه اللقطة.
    await issues.put(
      issueOf('b', {
        evidence: { ...issueOf('b').evidence, captureId: 'c2' },
        note: { captureId: 'c2', noteId: 'n1' },
      }),
    )
    // دليلها هنا ولا ملاحظة لها.
    await issues.put(issueOf('c', { note: null }))
    // دليلها هنا وملاحظتها في لقطة أخرى: الربط يُقرأ بلقطة الملاحظة.
    await issues.put(issueOf('d', { note: { captureId: 'c2', noteId: 'n5' } }))
    // معطوبان: سجلّ ناقص، وسجلّ من نسخة أحدث — يُتجاهلان ولا يُسقطان القراءة.
    await issues.put({ id: 'junk', evidence: { captureId: CAPTURE } } as unknown as IssueRecord)
    await issues.put(
      issueOf('f', { schemaVersion: 99, note: { captureId: CAPTURE, noteId: 'n8' } }),
    )

    const found = await loadNoteIssues(CAPTURE)

    expect([...found.keys()]).toEqual(['n1'])
    expect(found.get('n1')?.id).toBe('a')
    expect((await loadNoteIssues('c2')).get('n1')?.id).toBe('b')
    expect((await loadNoteIssues('لا-لقطة')).size).toBe(0)
  })

  it('وإن ربطت مشكلتان الملاحظةَ نفسها فأحدثهما تحديثًا هي المعروضة', () => {
    const older = issueOf('older', { updatedAt: 1_000 })
    const newer = issueOf('newer', { updatedAt: 5_000 })

    expect(indexNoteIssues(CAPTURE, [newer, older]).get('n1')?.id).toBe('newer')
    expect(indexNoteIssues(CAPTURE, [older, newer]).get('n1')?.id).toBe('newer')
  })

  it('**فشل القراءة لا يرمي ولا يمنع فتح المحرر** — خريطةٌ فارغة', async () => {
    const spy = vi.spyOn(issues, 'byIndex')

    spy.mockRejectedValueOnce(new Error('boom'))
    expect((await loadNoteIssues(CAPTURE)).size).toBe(0)

    spy.mockResolvedValueOnce({
      ok: false,
      error: { code: 'unknown', message: 'x' },
    })
    expect((await loadNoteIssues(CAPTURE)).size).toBe(0)
  })

  it('ويحملها سياق المحرر مع قراءاته، ولقطةٌ بلا مشكلات تفتح كما كانت', async () => {
    await putCaptureWithBlob(captureRecord(), new Blob(['png'], { type: 'image/png' }))

    const bare = await loadEditorContext(CAPTURE, urls)
    expect(bare.ok && bare.value.noteIssues.size).toBe(0)

    await issues.put(issueOf('a'))
    const withIssue = await loadEditorContext(CAPTURE, urls)
    expect(withIssue.ok && withIssue.value.noteIssues.get('n1')?.id).toBe('a')
  })
})

describe('لوحة الملاحظات وملاحظةٌ مربوطة بمشكلة', () => {
  const scene = sceneOf(
    note('n1', { title: 'الفجوة بين زرّي البطل أصغر من التصميم', tag: 'spacing' }),
    note('n2', { title: 'ملاحظة بلا مشكلة' }),
  )

  const spacing = issueOf('a', {
    element: { ...issueOf('a').element, selector: '.hero-actions' },
    check: { kind: 'spacing', property: 'gap-left', actual: '8px', expected: '16px', tolerance: 1 },
  })

  it.each<readonly [IssueStatus, string, string]>([
    ['open', 'مشكلة · مفتوحة', 'danger'],
    ['needs-verification', 'مشكلة · تحتاج تحققًا', 'warning'],
    ['resolved', 'مشكلة · محلولة', 'success'],
  ])('**حالة %s رقاقة «%s» بدرجة %s**', (status, label, tone) => {
    const root = mount(scene, new Map([['n1', { ...spacing, status }]]))

    const block = q(root, '[data-note="n1"] [data-note-issue]')
    expect(block?.dataset.status).toBe(status)
    const chip = block?.querySelector('span')
    expect(chip?.textContent).toBe(label)
    expect(chip?.className).toContain(`tone-${tone}`)
  })

  it('وسطر الموضوع بخطّ القياس واتجاه LTR: المحدِّد والخاصية', () => {
    const root = mount(scene, new Map([['n1', spacing]]))

    const subject = q(root, '[data-note="n1"] [data-note-issue-subject] bdi')
    expect(subject?.textContent).toBe('.hero-actions · gap')
    expect(subject?.getAttribute('dir')).toBe('ltr')
  })

  it('والموضوع: المسافة `gap` والتباين `color / background` وغيرهما خاصية CSS', () => {
    const base = issueOf('a')
    const of = (kind: IssueRecord['check']['kind'], property: string) =>
      noteIssueSubject({ element: base.element, check: { ...base.check, kind, property } })

    expect(of('spacing', 'dx')).toBe('.cta-btn · gap')
    expect(of('contrast', 'color/background-color')).toBe('.cta-btn · color / background')
    expect(of('colour', 'background-color')).toBe('.cta-btn · background-color')
    expect(of('style', 'padding')).toBe('.cta-btn · padding')
  })

  it('**وملاحظةٌ بلا مشكلة تُرسم كما كانت** بلا رقاقة ولا رابط', () => {
    const linked = mount(scene, new Map([['n1', spacing]]))
    const unlinked = q(linked, '[data-note="n2"]')
    expect(unlinked?.querySelector('[data-note-issue]')).toBeNull()
    expect(unlinked?.textContent).not.toContain('افتح المشكلة')
    const withMap = unlinked?.outerHTML

    render(null, linked)
    linked.remove()
    container = null
    const plain = mount(scene)
    expect(q(plain, '[data-note-issue]')).toBeNull()
    expect(q(plain, '[data-note="n2"]')?.outerHTML).toBe(withMap)
  })

  it('ومشكلةٌ ملاحظتها لم تعد في المشهد لا تُرسم — الربط باتجاه واحد', () => {
    const root = mount(sceneOf(note('n2')), new Map([['n1', spacing]]))

    expect(q(root, '[data-note-issue]')).toBeNull()
    expect(q(root, '[data-note="n2"]')).not.toBeNull()
  })

  it('**«افتح المشكلة» يفتح تفصيلها في المكتبة** برسالة `page/open`', () => {
    const root = mount(scene, new Map([['n1', spacing]]))

    const link = q(root, '[data-note="n1"] [data-note-issue-open]')
    expect(link?.textContent).toBe('افتح المشكلة')
    link?.click()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('page/open', { page: 'library', params: { issue: 'a' } })
  })
})
