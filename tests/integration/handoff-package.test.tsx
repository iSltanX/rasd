import 'fake-indexeddb/auto'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SCENE_SCHEMA_VERSION, type AnnotationColor, type RedactNode } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { createBlurClient } from '@/pages/editor/worker-client'
import { HandoffDialog } from '@/pages/handoff/HandoffDialog'
import { deviceRect } from '@/shared/geometry'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { annotations, blobs, captures, issues } from '@/shared/storage/repository'

import { endsAtIend, metadataChunks, parsePng } from '../helpers/png-chunks'
import { unzip } from '../helpers/unzip'
import { KNOWN_ISSUE } from '../unit/modules/handoff/fixture'

import { installCanvas } from './harness/canvas'
import { decodePng, encodePng, paint, pixelOf, type Pixels } from './harness/png'

import type { IssueRecord } from '@/shared/issue-schema'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * حزمة التسليم من المخزن إلى الملفّ المنزَّل (`STAGES/33`، الاختبار الأمني): لقطة دليلٍ فيها «سرّ» محجوبٌ في
 * مشهدها، تُخبَز عبر مخرج الترميز الواحد الحقيقي على قماشٍ يرسم فعلًا (`harness/canvas.ts`)، ثمّ تُجمَع
 * وتُنزَّل وتُنسخ من النافذة نفسها — وتُفكّ الحزمة بأداة قياسية وتُقرأ بكسلاتها.
 *
 * يثبت: بكسلات المنطقة المحجوبة مغطّاة، ولا مقطع بيانات وصفية في الصورة ولا حقل إضافي ولا تعليق في الحاوية،
 * ولا رابط بمعاملاته ولا عنوان خارج المستندين، ولا نداء شبكة أثناء البناء والتنزيل والنسخ.
 */

const BACKGROUND = [241, 245, 249] as const
const CARD = [37, 99, 235] as const
/** لون السرّ لا يشبه غيره ولا لون الغطاء — عدّه في الصورة المنزّلة هو الحكم. */
const SECRET = [250, 204, 21] as const

const PAGE_URL = 'https://example.com/pricing?plan=pro&token=s3cr3t-t0ken'
const PAGE_TITLE = 'Pricing — Example Checkout'
const NOW = Date.UTC(2026, 8, 30, 12)

const STYLE = {
  palette: {
    'tool/annotate/solid': '#f9a03f',
    'tool/capture/solid': '#3b82f6',
    'tool/inspect/solid': '#22c55e',
    'tool/measure/solid': '#a855f7',
    'tool/compare/solid': '#eab308',
    'status/danger/solid': '#dc2626',
    'status/success/solid': '#16a34a',
  } satisfies Record<AnnotationColor, string>,
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#00e3c9',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
}

const LAYOUT = {
  get: () => ({ lines: [], width: 0, height: 0, direction: 'rtl' as const, overflow: false }),
  metrics: () => ({ ascent: 10, descent: 3, lineHeight: 16 }),
  invalidate: () => undefined,
  size: 0,
}

/** لقطة الدليل: خلفية، وبطاقة، وسرٌّ في (120..240, 80..120). */
const SOURCE: Pixels = paint(240, 140, (x, y) => {
  if (x >= 120 && y >= 80 && y < 120) return [...SECRET, 255]
  if (x >= 40 && x < 200 && y >= 20 && y < 110) return [...CARD, 255]
  return [...BACKGROUND, 255]
})

const count = (img: Pixels, rgb: readonly number[]) => {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2]) n++
  }
  return n
}

function captureRecord(id: string): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: PAGE_URL,
    title: PAGE_TITLE,
    kind: 'element',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 240,
    height: 140,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

function issueOn(id: string, captureId: string): IssueRecord {
  return {
    ...KNOWN_ISSUE,
    id,
    title: `مشكلة ${id}`,
    page: { ...KNOWN_ISSUE.page, url: PAGE_URL, title: PAGE_TITLE },
    evidence: { ...KNOWN_ISSUE.evidence, captureId },
    note: null,
  }
}

const REDACT: RedactNode = {
  kind: 'redact',
  id: 'r1' as RedactNode['id'],
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
  rect: deviceRect(120, 80, 120, 40),
  mode: 'cover',
  strength: 0,
  coverToken: 'tool/inspect/solid',
}

async function seedCapture(id: string, scene: unknown): Promise<void> {
  const png = encodePng(SOURCE)
  await captures.put(captureRecord(id))
  await blobs.put({
    id,
    blob: new Blob([new Uint8Array(png)], { type: 'image/png' }),
    mime: 'image/png',
    bytes: png.length,
  })
  if (scene !== null) {
    await annotations.put({
      captureId: id,
      scene,
      updatedAt: NOW,
      schemaVersion: SCENE_SCHEMA_VERSION,
    })
  }
}

let container: HTMLDivElement | null = null

beforeEach(async () => {
  installCanvas()
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(async () => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await closeDatabase()
})

function mount(list: readonly IssueRecord[], onClose = vi.fn()): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <HandoffDialog
      issues={list}
      source="اختبار"
      now={NOW}
      tools={{ style: STYLE, layout: LAYOUT, client: createBlurClient({ spawn: () => null }) }}
      onClose={onClose}
    />,
    container,
  )
  return container
}

const phaseOf = (root: ParentNode) =>
  root.querySelector('[data-handoff-dialog]')?.getAttribute('data-phase')

/** كل منافذ الشبكة في الصفحة — يُعدّ ما نودي منها. */
function watchNetwork(): () => number {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('شبكة')))
  vi.stubGlobal('fetch', fetchSpy)
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
  const socket = vi.fn()
  vi.stubGlobal('WebSocket', socket)
  const beacon = vi.fn(() => false)
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
  return () =>
    fetchSpy.mock.calls.length +
    xhr.mock.calls.length +
    socket.mock.calls.length +
    beacon.mock.calls.length
}

/** الأسماء والحقول الإضافية والتعليقات كما يقرؤها `zipfile` — قارئٌ قياسيّ لرؤوس الحاوية. */
function zipHeaders(bytes: Uint8Array): {
  comment: number
  entries: { extra: number; comment: number }[]
} {
  const dir = mkdtempSync(join(tmpdir(), 'rasd-zip-meta-'))
  try {
    const file = join(dir, 'p.zip')
    writeFileSync(file, bytes)
    const script =
      'import json,sys,zipfile\n' +
      'z=zipfile.ZipFile(sys.argv[1])\n' +
      'print(json.dumps({"comment":len(z.comment),"entries":[{"extra":len(i.extra),"comment":len(i.comment)} for i in z.infolist()]}))'
    return JSON.parse(execFileSync('python3', ['-c', script, file]).toString('utf8')) as {
      comment: number
      entries: { extra: number; comment: number }[]
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('حزمة التسليم من المخزن إلى الملفّ', () => {
  it('الحجب يسري، ولا بيانات وصفية، والرابط بلا معاملاته، ولا شبكة — بالبناء والنسخ والتنزيل', async () => {
    const scene = { ...emptyScene({ captureId: 'cap-red', width: 240, height: 140, dpr: 2 }) }
    await seedCapture('cap-red', { ...scene, nodes: [REDACT] })
    await seedCapture('cap-plain', null)
    const list = [issueOn('red', 'cap-red'), issueOn('plain', 'cap-plain')]

    const network = watchNetwork()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const made: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj) => {
      made.push(obj as Blob)
      return `blob:rasd/${made.length}`
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const root = mount(list)
    await vi.waitFor(() => expect(phaseOf(root)).toBe('ready'), { timeout: 5000 })

    // المعاينة هي ما يُنسخ: Markdown كما في الحزمة، والرابط بلا معاملاته.
    const preview = root.querySelector('[data-handoff-preview]')!.textContent
    expect(preview).toContain('https://example.com/pricing')
    expect(preview).not.toContain('s3cr3t')
    expect(root.querySelector('[data-handoff-size]')?.textContent).toMatch(/\d/u)

    root.querySelector<HTMLButtonElement>('[data-handoff-copy]')!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]).toEqual([preview])
    await vi.waitFor(() => expect(root.textContent).toContain('الصور في الحزمة المنزّلة وحدها'))

    root.querySelector<HTMLButtonElement>('[data-handoff-download]')!.click()
    await vi.waitFor(() => expect(phaseOf(root)).toBe('done'), { timeout: 5000 })
    expect(root.textContent).toContain('rasd-handoff-2026-09-30.zip')

    // لا نداء شبكة في البناء ولا النسخ ولا التنزيل.
    expect(network()).toBe(0)

    const zip = made.find((b) => b.type === 'application/zip')!
    const bytes = new Uint8Array(await zip.arrayBuffer())
    expect(new TextDecoder().decode(bytes)).not.toContain('s3cr3t')

    const out = unzip(bytes)
    try {
      expect(out.test).toContain('No errors detected')
      expect(out.names).toEqual([
        'rasd-handoff.md',
        'rasd-handoff.json',
        'images/issue-01.png',
        'images/issue-02.png',
      ])

      // الصورة المحجوبة: لا بكسل واحد من السرّ، والغطاء لونٌ واحد، وما حوله كما رُسم.
      const redacted = new Uint8Array(out.read('images/issue-01.png'))
      const img = decodePng(redacted)
      expect({ w: img.width, h: img.height }).toEqual({ w: 240, h: 140 })
      expect(count(img, SECRET)).toBe(0)
      const cover = pixelOf(img, 120, 80)
      expect(pixelOf(img, 239, 119)).toEqual(cover)
      expect(pixelOf(img, 60, 40)).toEqual([...CARD, 255])

      // اللقطة بلا مشهد: تُخبَز كما هي — لا حجب يُخترَع ولا يُفقَد.
      const plain = decodePng(new Uint8Array(out.read('images/issue-02.png')))
      expect(count(plain, SECRET)).toBe(120 * 40)

      // لا بيانات وصفية في الصورتين، ولا بايت بعد `IEND`، ولا رابط ولا عنوان فيهما.
      for (const name of ['images/issue-01.png', 'images/issue-02.png']) {
        const png = new Uint8Array(out.read(name))
        const info = parsePng(png)
        expect(metadataChunks(info), name).toEqual([])
        expect(endsAtIend(info, png.length), name).toBe(true)
        const text = Buffer.from(png).toString('latin1')
        expect(text).not.toContain('example.com')
        expect(text).not.toContain('Checkout')
      }

      // الحاوية: لا حقل إضافي ولا تعليق على ملفّ ولا على الحزمة.
      const headers = zipHeaders(bytes)
      expect(headers.comment).toBe(0)
      expect(headers.entries.every((e) => e.extra === 0 && e.comment === 0)).toBe(true)

      // المستندان يحملان الرابط بلا معاملاته، والعنوان نصًّا فيهما وحدهما.
      const json = JSON.parse(out.read('rasd-handoff.json').toString('utf8')) as {
        issues: { page: { url: string; title: string } }[]
      }
      expect(json.issues.map((i) => i.page.url)).toEqual([
        'https://example.com/pricing',
        'https://example.com/pricing',
      ])
      expect(out.read('rasd-handoff.md').toString('utf8')).toBe(preview)
    } finally {
      out.dispose()
    }
  })

  it('مشهدٌ محفوظ لا يُقرأ يُسقط صورته باسم مشكلتها — لا يُخبَز بلا حجبه', async () => {
    await seedCapture('cap-broken', { schemaVersion: SCENE_SCHEMA_VERSION, nodes: 'تالف' })
    await seedCapture('cap-ok', null)
    const list = [issueOn('broken', 'cap-broken'), issueOn('ok', 'cap-ok')]
    for (const issue of list) await issues.put(issue)
    const root = mount(list)
    await vi.waitFor(() => expect(phaseOf(root)).toBe('failed'), { timeout: 5000 })
    expect(root.textContent).toContain('تعليقات لقطة الدليل غير مقروءة')
    expect(root.textContent).toContain('مشكلة broken')

    // «أزلها وتابع» تُخرجها من هذه الحزمة وحدها، والباقية تُبنى بصورتها.
    root.querySelector<HTMLButtonElement>('[data-handoff-remove]')!.click()
    await vi.waitFor(() => expect(phaseOf(root)).toBe('ready'))
    const preview = root.querySelector('[data-handoff-preview]')!.textContent
    expect(preview).toContain('مشكلة ok')
    expect(preview).not.toContain('مشكلة broken')
    expect(preview).toContain('images/issue-01.png')
    // النافذة تقرأ ولا تكتب: المشكلتان في المخزن كما كانتا.
    const stored = await issues.getAll()
    expect(stored.ok && [...stored.value].sort((a, b) => a.id.localeCompare(b.id))).toEqual(list)
  })

  it('اقتصاص المحرّر: الصورة بنافذته، وموضع العنصر في JSON نسبةً إليها (المراجعة المستقلّة)', async () => {
    const scene = emptyScene({ captureId: 'cap-crop', width: 240, height: 140, dpr: 2 })
    await seedCapture('cap-crop', {
      ...scene,
      meta: { ...scene.meta, crop: deviceRect(100, 60, 140, 80) },
    })
    const issue = {
      ...issueOn('crop', 'cap-crop'),
      evidence: {
        ...issueOn('crop', 'cap-crop').evidence,
        crop: { x: 120, y: 80, width: 120, height: 40 },
      },
    }
    const root = mount([issue])
    await vi.waitFor(() => expect(phaseOf(root)).toBe('ready'), { timeout: 5000 })
    root.querySelector<HTMLElement>('[data-handoff-format="json"]')!.click()
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-handoff-preview]')?.getAttribute('data-handoff-preview'),
      ).toBe('json'),
    )
    const json = JSON.parse(root.querySelector('[data-handoff-preview]')!.textContent) as {
      issues: { evidence: { crop: unknown } }[]
    }
    expect(json.issues[0]?.evidence.crop).toEqual({ x: 20, y: 20, width: 120, height: 40 })
  })

  it('لقطةٌ فُقدت ودليلُ مشكلتين: الشريط يسمّي المشكلتين اللتين تُزالان معًا', async () => {
    await seedCapture('cap-ok', null)
    const root = mount([
      issueOn('one', 'cap-lost'),
      issueOn('two', 'cap-lost'),
      issueOn('ok', 'cap-ok'),
    ])
    await vi.waitFor(() => expect(phaseOf(root)).toBe('failed'), { timeout: 5000 })
    const named = [...root.querySelectorAll('[data-handoff-failure]')].map((n) =>
      n.getAttribute('data-handoff-failure'),
    )
    expect(named).toEqual(['one', 'two'])
  })

  it('عطل تخزين عابر يُقال بسببه — لا «لم تعد في المكتبة» عن لقطةٍ لم تُحذف', async () => {
    await seedCapture('cap-flaky', null)
    vi.spyOn(captures, 'get').mockResolvedValueOnce({
      ok: false,
      error: { code: 'unknown', message: 'تعذّرت القراءة من التخزين.' },
    })
    const root = mount([issueOn('flaky', 'cap-flaky')])
    await vi.waitFor(() => expect(phaseOf(root)).toBe('failed'), { timeout: 5000 })
    expect(root.textContent).toContain('تعذّرت القراءة من التخزين.')
    expect(root.textContent).not.toContain('لم تعد في المكتبة')
  })

  it('لقطة دليلٍ حُذفت: خطأٌ يقول ما يُفعل، ولا مصغَّرة بديلة', async () => {
    const root = mount([issueOn('gone', 'cap-gone')])
    await vi.waitFor(() => expect(phaseOf(root)).toBe('failed'), { timeout: 5000 })
    expect(root.textContent).toContain('لم تعد في المكتبة')
    expect(root.textContent).toContain('أعد تسجيلها من الصفحة')
    // لا مشكلة جاهزة تبقى — فلا «أزلها وتابع» إلى حزمةٍ فارغة.
    expect(root.querySelector('[data-handoff-remove]')).toBeNull()
  })
})
