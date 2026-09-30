import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { templates } from '@/shared/storage/repository'

import type { GuideExportInput } from '@/pages/export/guide-export'
import type { Result } from '@/shared/result'

/**
 * نافذة تصدير الدليل (`guide / export` وأطوارها) — الخبز والتنزيل مُحاكَيان: ما يُختبر هنا الأطوار والقوالب
 * وما يُمرَّر إلى المولِّد. والمولِّدات نفسها في `modules/export/guide.test.ts`.
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
  createBakeTools: () =>
    Promise.resolve({
      style: {},
      layout: {},
      client: {},
      stripMetadata: true,
      dispose: () => undefined,
    }),
}))
vi.mock('@/pages/export/deliver', () => ({
  deliver: (input: { filename: string }) =>
    Promise.resolve({ route: 'anchor', downloadId: null, shown: input.filename }),
  revealDownload: () => undefined,
}))
vi.mock('@/shared/permissions', () => ({
  hasPermission: () => Promise.resolve(false),
  requestPermission: () => Promise.resolve('denied'),
}))

const { GuideExportDialog, togglesLabel } = await import('@/pages/export/GuideExportDialog')

const NOW = 1_780_000_000_000
const STEPS = [
  { captureId: 'a', title: 'افتح', note: 'ملاحظة' },
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
let closed = 0

function mount(format?: 'pdf' | 'zip' | 'markdown' | 'html') {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <GuideExportDialog
      title="كيف تُبلّغ عن خطأ بصري"
      steps={STEPS}
      captureTitles={new Map([['b', 'السلّة']])}
      sourceBytes={[400_000, 300_000]}
      {...(format ? { format } : {})}
      onClose={() => (closed += 1)}
      now={() => NOW}
    />,
    container,
  )
  return container
}

const q = <T extends Element>(selector: string) => container.querySelector<T>(selector)
const phase = () => q('[data-guide-export]')?.getAttribute('data-phase')
const radio = (format: string) =>
  q<HTMLInputElement>(`[data-guide-format="${format}"] input`) ??
  q<HTMLInputElement>(`input[value="${format}"]`)

beforeEach(async () => {
  runs.length = 0
  closed = 0
  outcome = () =>
    Promise.resolve({
      ok: true,
      value: { blob: new Blob(['%PDF-']), filename: 'دليل.pdf', pages: 3 },
    })
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await flush()
})

afterEach(() => {
  render(null, container)
  container.remove()
})

describe('الخيارات', () => {
  it('تُفتح على الصيغة التي طُلبت، والأربع بترتيب الإطار', async () => {
    mount('html')
    await flush()
    const formats = [...container.querySelectorAll('[data-guide-format]')].map((el) =>
      el.getAttribute('data-guide-format'),
    )
    expect(formats).toEqual(['pdf', 'zip', 'markdown', 'html'])
    expect(radio('html')?.checked).toBe(true)
  })

  it('حجم الصفحة معطَّلٌ بسببٍ مرئيّ لغير PDF، ويعمل مع PDF', async () => {
    mount('zip')
    await flush()
    expect(q<HTMLSelectElement>('[data-guide-page-size]')?.disabled).toBe(true)
    expect(container.textContent).toContain('في PDF وحدها')
    radio('pdf')?.click()
    await flush()
    expect(q<HTMLSelectElement>('[data-guide-page-size]')?.disabled).toBe(false)
    expect(q('[data-guide-export-pages]')?.getAttribute('data-guide-export-pages')).toBe('3')
  })

  it('«صدّر» يمرّر الإعدادات والخطوات كما هي، ثمّ طور النجاح باسم الملفّ وصفحاته', async () => {
    mount()
    await flush()
    q<HTMLElement>(
      '[data-guide-toggle="notes"] button, [data-guide-toggle="notes"] [role="switch"]',
    )?.click()
    await flush()
    q<HTMLButtonElement>('[data-guide-export-run]')?.click()
    await waitFor(() => phase() === 'done')
    expect(runs).toHaveLength(1)
    expect(runs[0]!.options).toEqual({
      format: 'pdf',
      pageSize: 'a4',
      numbered: true,
      notes: false,
    })
    expect(runs[0]!.steps).toEqual(STEPS)
    expect(runs[0]!.now).toBe(NOW)
    expect(container.textContent).toContain('الدليل جاهز')
    expect(container.textContent).toContain('دليل.pdf')
    expect(container.textContent).toContain('٣ صفحات')
  })
})

describe('الأطوار', () => {
  it('الفشل يُقال برسالته، و«أعد المحاولة» تعيد التصدير', async () => {
    outcome = () =>
      Promise.resolve({
        ok: false,
        error: { code: 'not-found', message: 'لم تُقرأ صورة الخطوة ٢ من المكتبة.' },
      })
    mount()
    await flush()
    q<HTMLButtonElement>('[data-guide-export-run]')?.click()
    await waitFor(() => phase() === 'error')
    expect(container.textContent).toContain('تعذّر تصدير الدليل')
    expect(container.textContent).toContain('لم تُقرأ صورة الخطوة ٢ من المكتبة. الدليل لم يتغيّر.')
    q<HTMLButtonElement>('[data-guide-export-retry]')?.click()
    await waitFor(() => runs.length === 2)
  })

  it('الإلغاء أثناء التصدير: طور الإلغاء، و«صدّر من جديد» يعيد الخيارات', async () => {
    let release: () => void = () => undefined
    outcome = () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ ok: false, error: { code: 'cancelled', message: 'أُلغي التصدير.' } })
      })
    mount()
    await flush()
    q<HTMLButtonElement>('[data-guide-export-run]')?.click()
    await waitFor(() => phase() === 'running')
    expect(container.textContent).toContain('٠ من ٢')
    q<HTMLButtonElement>('[data-guide-export-cancel]')?.click()
    await flush()
    release()
    await waitFor(() => phase() === 'cancelled')
    expect(runs[0]!.signal.aborted).toBe(true)
    expect(container.textContent).toContain('لم يُحفظ ملفّ. الدليل كما هو.')
    q<HTMLButtonElement>('[data-guide-export-again]')?.click()
    await flush()
    expect(phase()).toBe('options')
  })

  it('Escape يغلق النافذة، والتركيز أوّل ما تُفتح على زرّ الإغلاق', async () => {
    mount()
    // آثار Preact تجري بعد الرسم — التركيز علامة أن مستمع المفاتيح سُجّل.
    await waitFor(() => document.activeElement === q('[data-guide-export-close]'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed).toBe(1)
  })
})

describe('القوالب', () => {
  it('«احفظ قالبًا» يحفظ الإعدادات باسمها، ثمّ يعود القالب مختارًا في القائمة', async () => {
    mount('markdown')
    await flush()
    q<HTMLButtonElement>('[data-guide-template-open]')?.click()
    await flush()
    expect(phase()).toBe('template')
    expect(container.textContent).toContain('Markdown')
    expect(container.textContent).toContain('مفعَّلان')
    const input = q<HTMLInputElement>('#guide-template-name')!
    input.value = 'توثيق الفريق'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    q<HTMLButtonElement>('[data-guide-template-save]')?.click()
    await waitFor(() => phase() === 'options')
    const stored = await templates.getAll()
    expect(stored.ok && stored.value.map((t) => [t.name, t.options.format])).toEqual([
      ['توثيق الفريق', 'markdown'],
    ])
    await waitFor(() => (q<HTMLSelectElement>('[data-guide-template-select]')?.value ?? '') !== '')
    expect(container.textContent).toContain('حُفظ القالب «توثيق الفريق»')
  })

  it('اختيار قالبٍ يطبّق إعداداته، وتعديل أيٍّ منها يعيد القائمة إلى «بلا قالب»', async () => {
    await templates.put({
      id: 't1',
      name: 'صفحة للعميل',
      options: { format: 'html', pageSize: 'letter', numbered: false, notes: true },
      createdAt: NOW,
      updatedAt: NOW,
    })
    mount()
    await waitFor(
      () => (q('[data-guide-template-select]')?.querySelectorAll('option').length ?? 0) > 1,
    )
    const select = q<HTMLSelectElement>('[data-guide-template-select]')!
    select.value = 't1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    expect(radio('html')?.checked).toBe(true)
    expect(q<HTMLSelectElement>('[data-guide-page-size]')?.value).toBe('letter')
    expect(q<HTMLSelectElement>('[data-guide-template-select]')?.value).toBe('t1')

    radio('zip')?.click()
    await flush()
    expect(q<HTMLSelectElement>('[data-guide-template-select]')?.value).toBe('')
  })

  it('togglesLabel بحالاته الأربع', () => {
    const base = { format: 'pdf', pageSize: 'a4' } as const
    expect(togglesLabel({ ...base, numbered: true, notes: true })).toBe('مفعَّلان')
    expect(togglesLabel({ ...base, numbered: true, notes: false })).toBe('الترقيم وحده')
    expect(togglesLabel({ ...base, numbered: false, notes: true })).toBe('الملاحظات وحدها')
    expect(togglesLabel({ ...base, numbered: false, notes: false })).toBe('مطفآن')
  })
})
