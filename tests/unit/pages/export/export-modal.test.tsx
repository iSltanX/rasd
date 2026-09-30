import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { ExportModal, type ExportModalProps } from '@/pages/export/ExportModal'

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
      width={1280}
      height={800}
      blocked={null}
      busy={false}
      error={null}
      onScale={noop}
      onFormat={noop}
      onQuality={noop}
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
