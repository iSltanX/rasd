/**
 * معرض المكوّنات — `src/pages/gallery/`: صفحة تطوير مستبعَدة من بناء الإنتاج، لكنها الأداة التي
 * تقيس بها الحرّاس المكوّنات؛ فانكسارها يعمي القياس كلّه. تُثبَّت هنا علاماتها التي يقرؤها
 * الحرّاس (`data-gallery-*`)، ومفتاحا السمة والاتجاه، وحصر عطل تركيبة واحدة في خليّتها.
 */
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '@/pages/gallery/ErrorBoundary'
import { Gallery } from '@/pages/gallery/Gallery'
import { OverlayStages } from '@/pages/gallery/OverlayStage'
import { TOOL_MODES } from '@/shared/modes'
import { MATRICES } from '@/ui/components/registry'

let container: HTMLDivElement | null = null

function mount(node: preact.ComponentChild): HTMLDivElement {
  container = document.createElement('div')
  container.id = 'root'
  document.body.appendChild(container)
  void act(() => render(node, container!))
  return container
}

afterEach(() => {
  if (container) {
    void act(() => render(null, container!))
    container.remove()
    container = null
  }
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
  vi.resetModules()
})

describe('Gallery — الصفحة', () => {
  it('تعلن جاهزيتها للحرّاس وتعرض مجموعة لكل مصفوفة مسجَّلة', () => {
    const root = mount(<Gallery />)

    expect(root.querySelector('main[data-gallery-ready="true"]')).not.toBeNull()
    for (const matrix of MATRICES) {
      expect(root.querySelector(`[data-gallery-group="${matrix.name}"]`)).not.toBeNull()
    }
  })

  it('كل خليّة تحمل اسم مجموعتها وتركيبتها مكتوبة محاورها', () => {
    const root = mount(<Gallery />)
    const cell = root.querySelector('[data-gallery-cell]')!

    expect(cell.getAttribute('data-gallery-cell')).toBeTruthy()
    expect(cell.textContent).toMatch(/\w+=/)
  })

  it('عدّاد كل مجموعة يطابق عدد الـvariant في Figma — لا صنف «mismatch» مرسوم', () => {
    const root = mount(<Gallery />)

    for (const matrix of MATRICES) {
      const group = root.querySelector(`section[data-gallery-group="${matrix.name}"]`)!
      const counter = group.querySelector('span')!
      expect(counter.textContent).toContain(`/ ${matrix.figmaCount} variant`)
    }
    expect(root.querySelector('[class*="mismatch"]')).toBeNull()
  })

  it('مصفوفة الحالات جدول قابل للتركيز بلا فخّ لوحة مفاتيح', () => {
    const root = mount(<Gallery />)
    const region = root.querySelector('[role="group"][tabindex="0"]')!

    expect(region.getAttribute('aria-label')).toContain('قابلة للتمرير')
    expect(region.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
  })
})

describe('Gallery — مفتاحا السمة والاتجاه', () => {
  const radio = (root: HTMLElement, group: string, label: string) =>
    [...root.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement

  it('الفاتح يكتب data-theme على الجذر ويحدّد الخيار الثاني', () => {
    const root = mount(<Gallery />)
    void act(() => radio(root, 'الوضع', 'فاتح').click())

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(radio(root, 'الوضع', 'فاتح').getAttribute('aria-checked')).toBe('true')

    void act(() => radio(root, 'الوضع', 'داكن').click())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('LTR يقلب dir وlang معًا، والعودة إلى RTL تعيدهما', () => {
    const root = mount(<Gallery />)
    void act(() => radio(root, 'الاتجاه', 'LTR').click())

    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(document.documentElement.getAttribute('lang')).toBe('en')

    void act(() => radio(root, 'الاتجاه', 'RTL').click())
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
  })
})

describe('OverlayStages — مسارح البدائيّات', () => {
  it('ثمانية مسارح بأسمائها، ولافتة الأوضاع تعدّ أوضاع الأدوات', () => {
    const root = mount(<OverlayStages />)
    const titles = [...root.querySelectorAll('[data-overlay-stage]')].map((s) =>
      s.getAttribute('data-overlay-stage'),
    )

    expect(titles).toEqual([
      'Marquee',
      'Node Label',
      'Dimension',
      'Dimension · Vertical',
      'Box Model',
      'Toolbar',
      'Crosshair',
      'Frame Blocked',
    ])
    expect(root.textContent).toContain(`${TOOL_MODES.length} أوضاع`)
  })

  it('المسرح ذو الملاحظة يعرضها، وغير ذي الملاحظة لا يترك عنصرًا فارغًا', () => {
    const root = mount(<OverlayStages />)
    const cells = [...root.querySelectorAll('[data-overlay-grid] > div')]

    const withNote = cells.filter((c) => c.children.length === 3)
    const without = cells.filter((c) => c.children.length === 2)
    expect(withNote).toHaveLength(1)
    expect(without).toHaveLength(7)
  })
})

describe('ErrorBoundary — حصر العطل', () => {
  it('يمرّر أبناءه سليمين حين لا عطل', () => {
    const root = mount(
      <ErrorBoundary>
        <b>سليم</b>
      </ErrorBoundary>,
    )
    expect(root.querySelector('b')?.textContent).toBe('سليم')
    expect(root.querySelector('[data-render-error]')).toBeNull()
  })

  it('مكوّن يرمي: يظهر نصّ الخطأ في خليّته ويُبلَّغ onError بالخطأ نفسه', () => {
    const boom = new Error('انكسر الرسم')
    const Bad = (): never => {
      throw boom
    }
    const onError = vi.fn()
    const root = mount(
      <ErrorBoundary onError={onError}>
        <Bad />
      </ErrorBoundary>,
    )

    expect(root.querySelector('[data-render-error="انكسر الرسم"]')?.textContent).toBe('انكسر الرسم')
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it('يعمل بلا onError — اختياريّ', () => {
    const Bad = (): never => {
      throw new Error('x')
    }
    expect(() =>
      mount(
        <ErrorBoundary>
          <Bad />
        </ErrorBoundary>,
      ),
    ).not.toThrow()
  })
})

describe('main — نقطة دخول المعرض', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('يركّب المعرض في #root إن وُجد', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    await import('@/pages/gallery/main')
    await Promise.resolve()

    expect(root.querySelector('[data-gallery-ready="true"]')).not.toBeNull()
  })

  it('بلا #root لا يرمي ولا يركّب شيئًا', async () => {
    await expect(import('@/pages/gallery/main')).resolves.toBeDefined()
    expect(document.querySelector('[data-gallery-ready]')).toBeNull()
  })
})
