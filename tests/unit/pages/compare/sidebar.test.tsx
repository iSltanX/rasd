import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sidebar, type SidebarProps } from '@/pages/compare/parts/Sidebar'

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

function props(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    mode: 'adjacent',
    onModeChange: vi.fn(),
    diffRatio: 0,
    diffPixelCount: 0,
    comparedPixels: 0,
    regionItems: [],
    selectedRegionIndex: null,
    onSelectRegion: vi.fn(),
    onPrevRegion: vi.fn(),
    onNextRegion: vi.fn(),
    thresholdFraction: 0.1,
    onThresholdChange: vi.fn(),
    hasExtraRegion: false,
    ...overrides,
  }
}

/**
 * §17: «تعليم المنطقة الزائدة صراحةً» — بند الدليل الرابع («غير مُقارَن»)
 * كان غائبًا كليًّا (فجوة صامتة، لا `hasExtraRegion` ولا صفّ يستهلكه).
 */
describe('Sidebar — بند «غير مُقارَن» مشروط بـhasExtraRegion', () => {
  it('غائب حين الأبعاد متساوية (hasExtraRegion=false)', () => {
    const el = mount(<Sidebar {...props({ hasExtraRegion: false })} />)
    expect(el.textContent).not.toContain('غير مُقارَن')
  })

  it('ظاهر حين تختلف الأبعاد (hasExtraRegion=true) — إلى جانب الثلاثة الثابتة', () => {
    const el = mount(<Sidebar {...props({ hasExtraRegion: true })} />)
    expect(el.textContent).toContain('غير مُقارَن')
    expect(el.textContent).toContain('مُضاف')
    expect(el.textContent).toContain('محذوف')
    expect(el.textContent).toContain('بلا تغيير')
  })
})
