import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { QuotaIndicator } from '@/pages/library/parts/QuotaIndicator'
import progressBarStyles from '@/ui/components/ProgressBar/ProgressBar.module.css'

import type { QuotaState } from '@/shared/storage/quota'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(state: QuotaState) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<QuotaIndicator state={state} />, container)
  return container
}

describe('QuotaIndicator', () => {
  it('لا حدّ مُبلَّغ (quotaBytes صفر) ⇒ لا يُرسَم شيء', () => {
    const root = mount({ usageBytes: 0, quotaBytes: 0, ratio: 0, level: 'ok' })
    expect(root.innerHTML).toBe('')
  })

  it('حالة ok: يعرض شريط التقدّم والاستخدام بلا تلميح', () => {
    const root = mount({
      usageBytes: 100 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      ratio: 0.1,
      level: 'ok',
    })
    const bar = root.querySelector('[role="progressbar"]')
    expect(bar).toBeTruthy()
    expect(bar?.getAttribute('aria-valuenow')).toBe('10')
    expect(root.textContent).not.toContain('اقترب التخزين')
    expect(root.textContent).not.toContain('التخزين ممتلئ')
  })

  it('حالة warn: يعرض تلميحًا يقترح الأرشفة، والشريط بدرجة التحذير — §6 صفّ 73', () => {
    const root = mount({
      usageBytes: 800 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      ratio: 0.8,
      level: 'warn',
    })
    expect(root.textContent).toContain('اقترب التخزين من الامتلاء')
    const bar = root.querySelector('[role="progressbar"]')
    expect(bar?.className).toContain(progressBarStyles['tone-warning'])
  })

  it('حالة block: يعرض تلميح المنع، والشريط بدرجة الخطر — §6 صفّ 73', () => {
    const root = mount({
      usageBytes: 950 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      ratio: 0.95,
      level: 'block',
    })
    expect(root.textContent).toContain('التخزين ممتلئ تقريبًا')
    const bar = root.querySelector('[role="progressbar"]')
    expect(bar?.className).toContain(progressBarStyles['tone-danger'])
  })

  it('الأرقام غربية — قياس تقني لا عدّ بشري (§3.5)', () => {
    const root = mount({
      usageBytes: 100 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      ratio: 0.1,
      level: 'ok',
    })
    // لا رقم هندي في نصّ حجم التخزين أو النسبة.
    expect(root.textContent).not.toMatch(/[٠-٩]/)
  })
})
