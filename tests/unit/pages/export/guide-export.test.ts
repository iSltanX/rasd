import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_GUIDE_OPTIONS } from '@/shared/guide-schema'

import { unzip } from '../../../helpers/unzip'

import type { GuideExportInput } from '@/pages/export/guide-export'

/**
 * تنسيق تصدير الدليل — الخبز مُحاكًى (القماش في كروم وحده): ما يُختبر أيّ لقطة تُخبز وبأيّ ترميز، وأن الفشل
 * يُسمّى برقم خطوته، وأن الإلغاء لا يبدأ خبزًا.
 */

let abortDuringLoad: AbortController | null = null
const loads: string[] = []
const bakes: { format: string; captureId: string }[] = []
let missing = new Set<string>()

vi.mock('@/pages/handoff/evidence', () => ({
  loadEvidence: (captureId: string) => {
    loads.push(captureId)
    abortDuringLoad?.abort()
    if (missing.has(captureId)) {
      return Promise.resolve({ ok: false, error: { code: 'not-found', message: 'غائبة' } })
    }
    return Promise.resolve({
      ok: true,
      value: { scene: { captureId }, blob: new Blob([captureId]) },
    })
  },
}))

vi.mock('@/pages/editor/export', () => ({
  createBakeSurface: () => ({}),
  startExport: (o: { format: string; scene: { captureId: string } }) => {
    bakes.push({ format: o.format, captureId: o.scene.captureId })
    const bytes = new TextEncoder().encode(`${o.format}:${o.scene.captureId}`)
    return {
      done: Promise.resolve({
        ok: true,
        value: { blob: new Blob([bytes]), report: { width: 40, height: 30 } },
      }),
      cancel: () => undefined,
    }
  },
}))

const { runGuideExport } = await import('@/pages/export/guide-export')

const STEPS = [
  { captureId: 'c2', title: 'افتح', note: '' },
  { captureId: 'c1', title: '', note: 'ملاحظة' },
]

function input(over: Partial<GuideExportInput> = {}): GuideExportInput {
  return {
    title: 'دليل الفحص',
    steps: STEPS,
    captureTitles: new Map([['c1', 'السلّة']]),
    options: DEFAULT_GUIDE_OPTIONS,
    version: '0.1.0',
    now: Date.UTC(2026, 9, 1),
    tools: { style: {}, layout: {}, client: {}, stripMetadata: true } as never,
    signal: new AbortController().signal,
    ...over,
  }
}

beforeEach(() => {
  abortDuringLoad = null
  loads.length = 0
  bakes.length = 0
  missing = new Set()
})

describe('runGuideExport', () => {
  it('Markdown نصٌّ بلا خبز', async () => {
    const r = await runGuideExport(
      input({ options: { ...DEFAULT_GUIDE_OPTIONS, format: 'markdown' } }),
    )
    if (!r.ok) throw new Error(r.error.message)
    expect(bakes).toEqual([])
    expect(r.value.filename).toBe('دليل-الفحص.md')
    expect(await r.value.blob.text()).toContain('## ٢. السلّة')
  })

  it('ZIP: كل خطوة تُخبز PNG من لقطتها بترتيب الدليل، والحزمة تُفكّ', async () => {
    const r = await runGuideExport(input({ options: { ...DEFAULT_GUIDE_OPTIONS, format: 'zip' } }))
    if (!r.ok) throw new Error(r.error.message)
    expect(bakes).toEqual([
      { format: 'png', captureId: 'c2' },
      { format: 'png', captureId: 'c1' },
    ])
    const out = unzip(new Uint8Array(await r.value.blob.arrayBuffer()))
    try {
      expect(out.names).toEqual(['guide.md', 'images/step-01.png', 'images/step-02.png'])
      expect(new TextDecoder().decode(out.read('images/step-01.png'))).toBe('png:c2')
    } finally {
      out.dispose()
    }
  })

  it('الصفحة المستقلّة تُخبز WebP', async () => {
    const r = await runGuideExport(input({ options: { ...DEFAULT_GUIDE_OPTIONS, format: 'html' } }))
    if (!r.ok) throw new Error(r.error.message)
    expect(bakes.every((b) => b.format === 'webp')).toBe(true)
    expect(await r.value.blob.text()).toContain('data:image/webp;base64,')
  })

  it('لقطةٌ فُقدت تُسقط التصدير برقم خطوتها', async () => {
    missing = new Set(['c1'])
    const r = await runGuideExport(input({ options: { ...DEFAULT_GUIDE_OPTIONS, format: 'zip' } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('لم تُقرأ صورة الخطوة ٢ من المكتبة.')
  })

  /** المراجعة المستقلّة (`STAGES/06`): إلغاءٌ أثناء قراءة اللقطة كان يترك خبزها يجري كاملًا. */
  it('**إلغاءٌ أثناء قراءة اللقطة لا يبدأ خبزها**', async () => {
    const controller = new AbortController()
    abortDuringLoad = controller
    const r = await runGuideExport(
      input({ signal: controller.signal, options: { ...DEFAULT_GUIDE_OPTIONS, format: 'zip' } }),
    )
    expect(loads).toEqual(['c2'])
    expect(bakes).toEqual([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('cancelled')
  })

  it('دليلٌ بلا خطوات لا يُصدَّر', async () => {
    const r = await runGuideExport(input({ steps: [] }))
    expect(r.ok).toBe(false)
  })
})
