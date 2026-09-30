/**
 * ما وجده axe-core في الصفحات والطبقة (`pnpm design:shots --axe`، `STAGES/04`) — كلٌّ خطير عنده:
 * شريطا تقدّم بلا اسم، ولوحة تمرير لا تبلغها لوحة المفاتيح، وهيكل تحميل يحمل `aria-label` بلا دور
 * يقبله. تُثبَت هنا بالسمة نفسها، والفحص الكامل في Chrome حقيقي بالأمر أعلاه.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { ExportProgress } from '@/pages/editor/parts/ExportProgress'
import { FullPageStatus } from '@/ui/overlay/FullPageStatus'
import { InspectPanel } from '@/ui/overlay/inspect/InspectPanel'

import type { InspectSnapshot } from '@/shared/inspect-schema'
import type { ComponentChild } from 'preact'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(ui: ComponentChild): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(ui, container)
  return container
}

describe('شريطا التقدّم باسميهما (`aria-progressbar-name`)', () => {
  it('تقدّم التصدير', () => {
    const root = mount(
      <ExportProgress
        fraction={0.5}
        width={1280}
        height={800}
        scale={2}
        error={null}
        onCancel={() => undefined}
      />,
    )
    expect(root.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'تقدّم التصدير',
    )
  })

  it('تقدّم التقاط الصفحة كاملة', () => {
    const root = mount(
      <FullPageStatus bounds={{ x: 0, y: 0, width: 1440, height: 900 }} done={2} total={5} />,
    )
    expect(root.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'تقدّم التقاط الصفحة',
    )
  })
})

describe('لوحة الفحص (`scrollable-region-focusable`)', () => {
  it('جسم التبويب يقبل التركيز فيُمرَّر من لوحة المفاتيح', () => {
    const snapshot = {
      tag: 'div',
      label: '.card',
      selector: '.card',
      rect: { x: 0, y: 0, width: 10, height: 10, pageX: 0, pageY: 0 },
      styles: {},
    } as unknown as InspectSnapshot
    const root = mount(
      <InspectPanel
        snapshot={snapshot}
        groups={{ styles: [], box: [], text: [], color: [], a11y: [] } as never}
      />,
    )
    expect(root.querySelector('[role="tabpanel"]')?.getAttribute('tabindex')).toBe('0')
  })
})
