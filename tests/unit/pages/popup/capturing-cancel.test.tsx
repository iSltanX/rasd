import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Capturing } from '@/pages/popup/views/Capturing'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

/**
 * زرّ إلغاء الالتقاط — عقد `verify:capturing` الحاجب: أوّل `span` في الزرّ نصّه وحده،
 * و`<kbd>` بالمفتاح الذي يُلغي من الصفحة. سقط هذا العقد مرّة حين أُعيد بناء الزرّ بمكوّن
 * `Button` (المفتاح غاب)، ولم يكشفه إلا الحارس في Chrome — فصار هنا أيضًا.
 */
describe('Capturing — زرّ الإلغاء', () => {
  it('نصّه «إلغاء الالتقاط» في أوّل span، ومفتاحه Esc في kbd، والنقر يُلغي', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onCancel = vi.fn()
    render(<Capturing done={2} total={6} onCancel={onCancel} />, container)

    const cancel = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('إلغاء الالتقاط'),
    ) as HTMLButtonElement
    expect(cancel.querySelector('span')?.textContent).toBe('إلغاء الالتقاط')
    expect(cancel.querySelector('kbd')?.textContent).toBe('Esc')
    cancel.click()
    expect(onCancel).toHaveBeenCalled()
  })
})
