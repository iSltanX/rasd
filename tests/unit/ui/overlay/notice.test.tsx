import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNoticeCenter } from '@/content/notices'
import { NoticeLayer } from '@/content/overlay-app'
import { InspectIdle } from '@/ui/overlay/inspect/InspectPanel'
import { MeasureIdle } from '@/ui/overlay/MeasureIdle'
import { NoticeToast } from '@/ui/overlay/Notice'

import type { CoordSpace } from '@/shared/geometry'
import type { JSX } from 'preact'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(node: JSX.Element): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(node, container)
  return container
}

const SPACE = { layoutWidth: 1280, layoutHeight: 800 } as unknown as CoordSpace

describe('NoticeToast — إشعار الطبقة', () => {
  it('الخطر يُقاطع قارئ الشاشة، والنجاح ينتظر دوره', () => {
    const danger = mount(
      <NoticeToast notice={{ tone: 'danger', title: 'تعذّر' }} onClose={vi.fn()} />,
    )
    expect(danger.querySelector('[role="alert"]')?.getAttribute('data-tone')).toBe('danger')
    render(null, danger)
    render(<NoticeToast notice={{ tone: 'success', title: 'حُفظت' }} onClose={vi.fn()} />, danger)
    expect(danger.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
  })

  it('العنوان فالتفصيل فالفعل فالإغلاق — والزرّان يعملان', () => {
    const run = vi.fn()
    const close = vi.fn()
    const root = mount(
      <NoticeToast
        notice={{
          tone: 'success',
          title: 'حُفظت اللقطة',
          detail: 'في المكتبة',
          action: { label: 'افتح', run },
        }}
        onClose={close}
      />,
    )
    expect(root.textContent).toBe('حُفظت اللقطةفي المكتبةافتح')
    const [action, dismiss] = [...root.querySelectorAll('button')]
    action!.click()
    dismiss!.click()
    expect(run).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(dismiss!.getAttribute('aria-label')).toBe('إغلاق')
  })
})

describe('NoticeLayer — موضع الإشعار', () => {
  const y = (root: HTMLElement) =>
    root
      .querySelector<HTMLElement>('[data-rasd-ov="notice"]')
      ?.style.getPropertyValue('--rasd-ov-y')

  it('لا شيء بلا إشعار', () => {
    const root = mount(<NoticeLayer notices={createNoticeCenter()} space={SPACE} mode="idle" />)
    expect(root.innerHTML).toBe('')
  })

  it('في الخمول مكان الشريط، ومع أداة فوقه، ومع المنطقة فوق التلميحات', () => {
    const center = createNoticeCenter()
    center.show({ tone: 'info', title: 'خرجت من الفحص' })
    const idle = mount(<NoticeLayer notices={center} space={SPACE} mode="idle" />)
    expect(y(idle)).toBe('760px')
    render(<NoticeLayer notices={center} space={SPACE} mode="inspect" />, idle)
    expect(y(idle)).toBe('700px')
    render(<NoticeLayer notices={center} space={SPACE} mode="area" />, idle)
    expect(y(idle)).toBe('656px')
  })

  it('الإغلاق يُخفيه', () => {
    const center = createNoticeCenter()
    center.show({ tone: 'success', title: 'نُسخ اللون' })
    const root = mount(<NoticeLayer notices={center} space={SPACE} mode="colour" />)
    root.querySelector<HTMLButtonElement>('button[aria-label="إغلاق"]')!.click()
    expect(center.current.value).toBeNull()
  })
})

describe('بطاقتا الإرشاد — مفاتيح بمحرّك لا وعود', () => {
  it('الفحص: النقر وEsc وحدهما — لا ⇧ ولا ⌘C ولا ↑↓، فلا محرّك لها في الفحص', () => {
    const root = mount(<InspectIdle />)
    const keys = [...root.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(keys).toEqual(['انقر', 'Esc'])
  })

  it('القياس: بطاقته لا تلتقط المؤشِّر — الطبقة تقرأ ما تحتها', () => {
    const root = mount(<MeasureIdle />)
    const card = root.querySelector('[data-rasd-ov="measure-idle"]')
    expect(card?.classList.contains('rasd-ov-insp-passive')).toBe(true)
    expect([...root.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'انقر',
      'اسحب',
      '⌥',
      'Esc',
    ])
  })
})
