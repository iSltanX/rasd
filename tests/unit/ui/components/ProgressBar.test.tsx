import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import styles from '@/ui/components/ProgressBar/ProgressBar.module.css'

/**
 * `Rasd_Plan.md §6` صفّ 73 — `tone` كانت غائبة، فحالتا التحذير والمنع في
 * `QuotaIndicator` لا تُلوَّنان. الافتراضي `primary` يبقي كل مستهلك قديم
 * (نافذة الإضافة، تقدّم الالتقاط) بلا أثر — هذا ما تثبته الحالة الأولى هنا.
 */

let host: HTMLDivElement | null = null

function mount(ui: preact.ComponentChild): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  render(ui, host)
  return host
}

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

describe('ProgressBar — tone', () => {
  it('بلا tone: primary افتراضيًا — لا يكسر المستهلكين القائمين', () => {
    const el = mount(<ProgressBar value={50} />).querySelector('[role="progressbar"]')
    expect(el?.className).toContain(styles['tone-primary'])
    expect(el?.className).not.toContain(styles['tone-warning'])
    expect(el?.className).not.toContain(styles['tone-danger'])
  })

  it('tone="warning" يضيف صنف التحذير', () => {
    const el = mount(<ProgressBar value={80} tone="warning" />).querySelector(
      '[role="progressbar"]',
    )
    expect(el?.className).toContain(styles['tone-warning'])
  })

  it('tone="danger" يضيف صنف المنع', () => {
    const el = mount(<ProgressBar value={97} tone="danger" />).querySelector('[role="progressbar"]')
    expect(el?.className).toContain(styles['tone-danger'])
  })
})
