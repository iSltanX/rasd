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
    sizeA: { width: 1280, height: 800 },
    sizeB: { width: 1280, height: 800 },
    computed: true,
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

/** سطر الحكم — `compare / identical` (`291:12984`) و`size-mismatch` (`291:13076`). */
describe('Sidebar — «متطابقتان» و«مقاسان مختلفان» يُقالان', () => {
  it('صفر بكسل مختلف بعد الحساب ⟵ «اللقطتان متطابقتان»', () => {
    const el = mount(<Sidebar {...props({ diffPixelCount: 0, diffRatio: 0 })} />)
    expect(el.querySelector('[data-compare-verdict="identical"]')?.textContent).toContain(
      'اللقطتان متطابقتان',
    )
  })

  it('قبل الحساب لا يُقال «متطابقتان» عن صفرٍ لم يُحسب', () => {
    const el = mount(<Sidebar {...props({ diffPixelCount: 0, computed: false })} />)
    expect(el.querySelector('[data-compare-verdict]')).toBeNull()
  })

  it('فرقٌ قائم ⟵ لا حكم', () => {
    const el = mount(<Sidebar {...props({ diffPixelCount: 120, diffRatio: 0.02 })} />)
    expect(el.querySelector('[data-compare-verdict]')).toBeNull()
  })

  it('مقاسان مختلفان ⟵ تنبيه بالمقاسين معزولين LTR، ولو كان الفرق صفرًا', () => {
    const el = mount(
      <Sidebar {...props({ diffPixelCount: 0, sizeB: { width: 1280, height: 960 } })} />,
    )
    const verdict = el.querySelector('[data-compare-verdict="size-mismatch"]')
    expect(verdict?.textContent).toContain('بمقاسين مختلفين')
    expect(
      [...(verdict?.querySelectorAll('bdi[dir="ltr"]') ?? [])].map((b) => b.textContent),
    ).toEqual(['1280 × 800', '1280 × 960'])
    expect(el.querySelector('[data-compare-verdict="identical"]')).toBeNull()
  })
})
