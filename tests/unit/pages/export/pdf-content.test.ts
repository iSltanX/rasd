import { describe, expect, it } from 'vitest'

import { asNodeId, type NoteNode, type PinNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { STATUS_LABEL } from '@/modules/issues/labels'
import {
  captureDetails,
  captureMetadata,
  issueValues,
  notesSection,
  visibleNoteCount,
} from '@/pages/export/pdf-content'
import { stripIsolates } from '@/shared/bidi/isolate'
import { devicePoint } from '@/shared/geometry'

import { issueFixture } from '../../modules/issues/fixture'

import type { DocBlock, DocItem } from '@/modules/export/pdf-document'
import type { IssueRecord } from '@/shared/issue-schema'
import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * صفحة التفاصيل في PDF — معيار القبول في `STAGES/05`: «قائمة الملاحظات في PDF تحمل حالة كل مشكلة
 * وقيمتيها» (`STAGES/32`)، وبيانات الصفحة تُبنى أو تغيب كلّها مع الحذف.
 */

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

const pin = (id: string, ordinal: number, noteId: string): PinNode =>
  ({
    kind: 'pin',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(0, 0),
    shape: 'circle',
    ordinal,
    noteId: asNodeId(noteId),
    radiusPx: 12,
  }) as unknown as PinNode

const sceneOf = (...nodes: Scene['nodes']): Scene => ({
  ...emptyScene({ captureId: 'c1', width: 100, height: 100, dpr: 1 }),
  nodes,
})

const capture: CaptureRecord = {
  id: 'c1',
  createdAt: Date.UTC(2026, 8, 30, 9, 5),
  origin: 'https://northwind.example',
  url: 'https://northwind.example/pricing?plan=pro',
  title: 'منصّة — الأسعار',
  kind: 'viewport',
  status: 'ready',
  projectId: 'p1',
  tags: [],
  width: 2880,
  height: 1800,
  devicePixelRatio: 2,
  favorite: false,
  archived: false,
  trashedAt: null,
}

const itemsOf = (blocks: readonly DocBlock[]): DocItem[] =>
  blocks.flatMap((b) => (b.kind === 'items' ? [...b.items] : []))
const plain = (s: string) => stripIsolates(s)

describe('قائمة الملاحظات تقرأ المشكلات', () => {
  const open: IssueRecord = issueFixture({ id: 'i-open', status: 'open' })
  const resolved: IssueRecord = issueFixture({
    id: 'i-resolved',
    status: 'resolved',
    lastCheck: {
      at: 2_000,
      outcome: 'match',
      observed: '12px 24px',
      reason: null,
    },
  })
  const unsure: IssueRecord = issueFixture({
    id: 'i-unsure',
    status: 'needs-verification',
    lastCheck: {
      at: 2_000,
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
    },
  })

  const scene = sceneOf(
    note('n1', { title: 'الحشوة', body: 'أكبر من التصميم' }),
    note('n2', { title: 'اللون' }),
    note('n3', { title: 'العنوان' }),
    note('n4', { title: 'ملاحظة حرّة' }),
    pin('p1', 1, 'n1'),
    pin('p2', 2, 'n2'),
    pin('p3', 3, 'n3'),
  )
  const issues = new Map([
    ['n1', open],
    ['n2', resolved],
    ['n3', unsure],
  ])
  const items = itemsOf(notesSection(scene, issues))

  it('**كل ملاحظة مربوطة تحمل رقاقة حالتها** بنصّها في الواجهة ولونها', () => {
    expect(items.map((i) => i.chip)).toEqual([
      { text: STATUS_LABEL.open, tone: 'danger' },
      { text: STATUS_LABEL.resolved, tone: 'success' },
      { text: STATUS_LABEL['needs-verification'], tone: 'warning' },
      null,
    ])
  })

  it('**وقيمتيها: الآن والمتوقَّع** — من آخر فحص إن وُجد، وإلا من التسجيل', () => {
    const values = items.map((i) => i.lines.map((l) => plain(l.text)))
    expect(values[0]).toContain('الآن 14px 24px · المتوقَّع 12px 24px')
    expect(values[1]).toContain('الآن 12px 24px · المتوقَّع 12px 24px')
    // «تحتاج تحققًا» بلا قراءة: «—» مكان الآن، والمتوقَّع باقٍ، والسبب سطرٌ ثالث لا بديل.
    expect(values[2]).toContain('الآن — · المتوقَّع 12px 24px')
    expect(values[2]).toContain('لم يُعثر على العنصر في آخر فحص')
  })

  it('وسطر المحدِّد والخاصية تقنيٌّ يساري', () => {
    expect(items[0]!.lines).toContainEqual({ text: '.cta-btn · padding', mono: true })
  })

  it('مرقَّمة برقم الدبّوس هنديًّا، والحرّة تُذيَّل بلا رقم مخترَع', () => {
    expect(items.map((i) => i.number)).toEqual(['١', '٢', '٣', '·'])
    expect(items[0]!.title).toBe('الحشوة')
    expect(items[0]!.lines[0]).toEqual({ text: 'أكبر من التصميم', mono: false })
  })

  it('**المخفيّة لا تُدرج** — ما أخفاه صاحبه لا يُرسل في القائمة', () => {
    const hidden = sceneOf(
      note('n1', { title: 'ظاهرة' }),
      note('n2', { title: 'سرّ', hidden: true }),
    )
    expect(itemsOf(notesSection(hidden, new Map())).map((i) => i.title)).toEqual(['ظاهرة'])
    expect(visibleNoteCount(hidden)).toBe(1)
  })

  it('القيم معزولة الاتجاه — `12px` داخل العربي لا يقلب ما حوله', () => {
    expect(issueValues(open)).not.toBe(plain(issueValues(open)))
  })
})

describe('صفحة التفاصيل', () => {
  const base = {
    capture,
    projectName: 'منصّة المتجر',
    browser: 'Chrome 152',
    scene: sceneOf(note('n1', { title: 'ملاحظة' })),
    noteIssues: new Map(),
  }

  it('بلا مفتاحين: لا صفحة أصلًا', () => {
    expect(captureDetails({ ...base, pageMeta: false, notes: false })).toEqual([])
  })

  it('بيانات الصفحة: الرابط كاملًا والمشروع والمقاس', () => {
    const blocks = captureDetails({ ...base, pageMeta: true, notes: false })
    const rows = blocks.flatMap((b) => (b.kind === 'rows' ? b.rows : []))
    expect(rows.find((r) => r.label === 'الرابط')?.value).toBe(capture.url)
    expect(rows.find((r) => r.label === 'المشروع')?.value).toBe('منصّة المتجر')
    expect(rows.find((r) => r.label === 'المقاس')?.value).toContain('@2×')
  })

  it('**الملاحظات وحدها لا تحمل عنوان الصفحة ولا رابطها**', () => {
    const blocks = captureDetails({ ...base, pageMeta: false, notes: true })
    const all = JSON.stringify(blocks)
    expect(all).not.toContain(capture.url)
    expect(all).not.toContain(capture.title)
    expect(all).not.toContain('منصّة المتجر')
  })
})

describe('قاموس Info', () => {
  it('عربيٌّ كما هو حين لا حذف', () => {
    expect(captureMetadata(capture, 'منصّة المتجر', false, new Date(0))).toEqual({
      title: capture.title,
      subject: capture.url,
      keywords: ['منصّة المتجر'],
      createdAt: new Date(0),
    })
  })

  it('و`null` مع الحذف — لا نصف قاموس', () => {
    expect(captureMetadata(capture, 'منصّة المتجر', true, new Date(0))).toBeNull()
  })
})
