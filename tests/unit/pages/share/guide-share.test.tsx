import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { err, ok, type Result } from '@/shared/result'

import type { GuideExportInput } from '@/pages/export/guide-export'

/**
 * مشاركة دليل — الصفحة والملفّ من `runGuideExport` نفسه (يُحاكى هنا؛ مولِّداته مُختبَرة في `STAGES/06`)، والحافظة
 * نصّ الخطوات بـMarkdown يُكتب في نبضة النقرة.
 */

const runs: GuideExportInput[] = []
let outcome: () => Promise<Result<{ blob: Blob; filename: string; pages: number | null }>>

vi.mock('@/pages/export/guide-export', () => ({
  runGuideExport: (input: GuideExportInput) => {
    runs.push(input)
    return outcome()
  },
}))
vi.mock('@/pages/handoff/evidence', () => ({
  createBakeTools: (stripMetadata: boolean) =>
    Promise.resolve({
      style: {},
      layout: {},
      client: {},
      stripMetadata,
      dispose: () => undefined,
    }),
}))
const delivered: string[] = []
vi.mock('@/pages/export/deliver', () => ({
  deliver: (input: { filename: string; route: string }) => {
    delivered.push(input.filename)
    return Promise.resolve({ route: input.route, downloadId: null, shown: input.filename })
  },
  revealDownload: () => undefined,
}))
vi.mock('@/shared/permissions', () => ({
  hasPermission: () => Promise.resolve(false),
  requestPermission: () => Promise.resolve('denied'),
}))
vi.mock('@/shared/settings', () => ({
  getSettingsResult: () =>
    Promise.resolve({ ok: true, value: { privacy: { stripMetadataOnExport: false } } }),
}))

const { resetRefusalMemory } = await import('@/pages/export/permission-memory')
const { GuideShare } = await import('@/pages/share/GuideShare')

const NOW = 1_780_000_000_000
const STEPS = [
  { captureId: 'a', title: 'افتح السلّة', note: 'من الشريط العلوي' },
  { captureId: 'b', title: '', note: '' },
]

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('انتهت مهلة الانتظار')
    await flush()
  }
}

let container: HTMLDivElement
const written: string[] = []
let writeOutcome: () => Promise<void> = () => Promise.resolve()

async function mount(steps = STEPS) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <GuideShare
      title="كيف تُبلّغ عن خطأ"
      steps={steps}
      captureTitles={new Map([['b', 'صفحة الدفع']])}
      onClose={() => undefined}
      now={() => NOW}
    />,
    container,
  )
  await flush()
  await flush()
}

const q = <T extends Element>(selector: string) => container.querySelector<T>(selector)
const phase = () => q('[data-share]')?.getAttribute('data-phase')
async function choose(path: string) {
  q<HTMLInputElement>(`input[data-share-path="${path}"]`)!.click()
  await flush()
}
const run = () => q<HTMLButtonElement>('[data-share-run]')!.click()

beforeEach(() => {
  runs.length = 0
  delivered.length = 0
  written.length = 0
  resetRefusalMemory()
  outcome = () =>
    Promise.resolve(
      ok({ blob: new Blob(['<!doctype html>']), filename: 'كيف-تُبلّغ.html', pages: null }),
    )
  writeOutcome = () => Promise.resolve()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text)
        return writeOutcome()
      },
    },
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  render(null, container)
  container.remove()
  vi.restoreAllMocks()
})

describe('GuideShare', () => {
  it('ترويسة الدليل وملخّص الإطار `291:1262`', async () => {
    await mount()
    expect(q('#share-title')?.textContent).toBe('مشاركة دليل')
    expect(container.textContent).toContain('كيف تُبلّغ عن خطأ · خطوتان')
    expect(q('[data-share-summary="guide-page"]')?.textContent).toContain('مضمَّنة في الملفّ')
    expect(q('[data-share-summary="guide-page"]')?.textContent).toContain('من اليمين إلى اليسار')
    expect(q<HTMLInputElement>('input[data-share-cloud]')?.disabled).toBe(true)
  })

  it('صفحة ويب: صيغة `html` من المولِّد نفسه، ثمّ التسليم', async () => {
    await mount()
    run()
    await waitFor(() => phase() === 'done')
    expect(runs).toHaveLength(1)
    expect(runs[0]!.options.format).toBe('html')
    expect(runs[0]!.options.numbered).toBe(true)
    expect(runs[0]!.tools.stripMetadata).toBe(false)
    expect(delivered).toEqual(['كيف-تُبلّغ.html'])
    expect(q('[data-share-done]')?.getAttribute('data-share-done')).toBe('page')
  })

  it('الحافظة: نصّ الخطوات بـMarkdown في نبضة النقرة، بلا مولِّد ولا تنزيل', async () => {
    await mount()
    await choose('clipboard')
    expect(q('[data-share-summary="guide-clipboard"]')?.textContent).toContain('لا تحملها الحافظة')
    run()
    expect(written).toHaveLength(1)
    expect(written[0]).toContain('افتح السلّة')
    expect(written[0]).toContain('صفحة الدفع')
    expect(written[0]).not.toContain('](')
    await waitFor(() => phase() === 'copied')
    expect(q('[data-share-copied]')?.textContent).toContain('نُسخت الخطوات')
    expect(runs).toHaveLength(0)
    expect(delivered).toHaveLength(0)
  })

  it('رفض الحافظة يُعرض خطأً', async () => {
    writeOutcome = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await mount()
    await choose('clipboard')
    run()
    await waitFor(() => phase() === 'error')
    expect(q('[data-share-error]')?.textContent).toContain('انقر داخل الصفحة')
    expect(q('[data-share-error]')?.textContent).toContain('الدليل لم يتغيّر.')
  })

  it('ملفّ: PDF افتراضًا وZIP اختيارًا', async () => {
    await mount()
    await choose('file')
    const select = q<HTMLSelectElement>('select[data-share-format]')!
    expect(select.value).toBe('pdf')
    select.value = 'zip'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    run()
    await waitFor(() => phase() === 'done')
    expect(runs[0]!.options.format).toBe('zip')
  })

  it('فشل المولِّد: طور الخطأ برسالته', async () => {
    outcome = () =>
      Promise.resolve(err({ code: 'not-found', message: 'لم تُقرأ صورة الخطوة ٢ من المكتبة.' }))
    await mount()
    run()
    await waitFor(() => phase() === 'error')
    expect(q('[data-share-error]')?.textContent).toContain('لم تُقرأ صورة الخطوة ٢')
  })

  it('الإلغاء يُجهض المولِّد ولا يُسلَّم شيء', async () => {
    let release: (v: Result<never>) => void = () => undefined
    outcome = () => new Promise((r) => (release = r))
    await mount()
    run()
    await waitFor(() => runs.length === 1)
    q<HTMLButtonElement>('[data-share-cancel]')!.click()
    await flush()
    expect(phase()).toBe('cancelled')
    expect(runs[0]!.signal.aborted).toBe(true)
    release(err({ code: 'cancelled', message: 'أُلغي التصدير.' }))
    await flush()
    expect(delivered).toHaveLength(0)
    expect(phase()).toBe('cancelled')
  })

  it('دليلٌ بلا خطوات لا يُشارَك', async () => {
    await mount([])
    expect(q('[data-share-blocked]')?.textContent).toContain('لا خطوات')
    expect(q<HTMLButtonElement>('[data-share-run]')?.disabled).toBe(true)
  })
})
