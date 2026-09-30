import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ExportModal,
  IMAGE_ONLY_REASON,
  NO_NOTES_REASON,
  STRIPPED_REASON,
  type ExportModalProps,
} from '@/pages/export/ExportModal'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(over: Partial<ExportModalProps>) {
  const noop = () => undefined
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <ExportModal
      title="لقطة"
      scale={1}
      format="png"
      quality="high"
      pdf={{ size: 'a4', orientation: 'landscape', split: 'multi' }}
      pdfSummary={{ pages: 3, bytes: 1_100_000 }}
      includeNotes
      includePageMeta={false}
      noteCount={2}
      stripMetadata={false}
      width={1280}
      height={800}
      blocked={null}
      busy={false}
      error={null}
      onScale={noop}
      onFormat={noop}
      onQuality={noop}
      onPdf={noop}
      onIncludeNotes={noop}
      onIncludePageMeta={noop}
      onDownload={noop}
      onCopy={noop}
      onClose={noop}
      {...over}
    />,
    container,
  )
  return container
}

/** أوّل عنصر في جسم النافذة — التنبيه في رأسها كما في `export / error` و`cancelled`. */
const firstInBody = (root: HTMLElement) =>
  root.querySelector('section[aria-labelledby="export-format-label"]')?.parentElement
    ?.firstElementChild ?? null

describe('ExportModal — الفشل والإلغاء في رأس النافذة', () => {
  it('الفشل تنبيه خطر أوّل الجسم، بخطّاف `data-export-error` ونصّ السبب', () => {
    const root = mount({ error: 'نفدت ذاكرة القماش' })
    const first = firstInBody(root)
    expect(first?.hasAttribute('data-export-error')).toBe(true)
    expect(first?.textContent).toContain('تعذّر حفظ الملف')
    expect(first?.textContent).toContain('نفدت ذاكرة القماش')
  })

  it('الإلغاء يُقال ولا تعود النافذة صامتة', () => {
    const root = mount({ cancelled: true })
    const first = firstInBody(root)
    expect(first?.hasAttribute('data-export-cancelled')).toBe(true)
    expect(first?.textContent).toContain('أُلغي التصدير')
  })

  it('بلا فشل ولا إلغاء ⟵ لا تنبيه، ولا `data-export-error` (يقرأ غيابه `verify:editor`)', () => {
    const root = mount({})
    expect(root.querySelector('[data-export-error]')).toBeNull()
    expect(root.querySelector('[data-export-cancelled]')).toBeNull()
  })
})

/**
 * `export / pdf` (`290:480`): PDF تعمل، وخياراتها تحلّ محلّ الدقّة والجودة، ومفتاحا الوثيقة يعملان معها
 * ويُعطَّلان مع الصور بسببٍ مرئيّ.
 */
describe('ExportModal — PDF', () => {
  const toggle = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLElement>(`[data-export-toggle="${id}"]`)!

  it('ثلاث صيغ تعمل كلّها — لا PDF معطَّلة ولا «قريبًا»', () => {
    const root = mount({})
    const tiles = [...root.querySelectorAll<HTMLInputElement>('[data-export-format]')]
    expect(tiles.map((t) => t.dataset.exportFormat)).toEqual(['png', 'webp', 'pdf'])
    expect(tiles.every((t) => !t.disabled)).toBe(true)
    expect(root.textContent).not.toContain('قريبًا')
  })

  it('مع PDF: «خيارات PDF» بحجم الصفحة والاتجاه والتقسيم، والملخّص بعدد الصفحات هنديًّا', () => {
    const root = mount({ format: 'pdf' })
    expect(root.querySelector('#export-options-label')?.textContent).toBe('خيارات PDF')
    expect(root.querySelector('[data-export-page-size]')).not.toBeNull()
    expect(root.querySelector('[data-export-orientation]')).not.toBeNull()
    expect(root.querySelector('[data-export-split]')).not.toBeNull()
    expect(root.querySelector('[data-export-scale-select]')).toBeNull()
    expect(root.textContent).toContain('بلا قطع سطر')
    const summary = root.querySelector<HTMLElement>('[data-export-pages]')!
    expect(summary.dataset.exportPages).toBe('3')
    expect(summary.textContent).toContain('٣ صفحات')
    // الحافظة لا تقبل PDF، والإطار يرسم «تنزيل» وحده.
    expect([...root.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain(
      'انسخ إلى الحافظة',
    )
  })

  it('مفتاحا الوثيقة يعملان مع PDF', () => {
    const root = mount({ format: 'pdf' })
    expect(toggle(root, 'notes').hasAttribute('data-export-toggle-disabled')).toBe(false)
    expect(toggle(root, 'page-meta').hasAttribute('data-export-toggle-disabled')).toBe(false)
  })

  it('ومع الصور معطَّلان وسببهما نصٌّ مرئيّ يدلّ على PDF', () => {
    const root = mount({ format: 'png' })
    expect(toggle(root, 'notes').hasAttribute('data-export-toggle-disabled')).toBe(true)
    expect(toggle(root, 'notes').textContent).toContain(IMAGE_ONLY_REASON.notes)
    expect(toggle(root, 'page-meta').textContent).toContain(IMAGE_ONLY_REASON.pageMeta)
  })

  it('**«بيانات الصفحة» تُعطَّل مع الحذف بسببه**، وقائمة الملاحظات بلا ملاحظات بسببها', () => {
    const root = mount({ format: 'pdf', stripMetadata: true, noteCount: 0 })
    expect(toggle(root, 'page-meta').hasAttribute('data-export-toggle-disabled')).toBe(true)
    expect(toggle(root, 'page-meta').textContent).toContain(STRIPPED_REASON)
    expect(toggle(root, 'notes').textContent).toContain(NO_NOTES_REASON)
  })
})
