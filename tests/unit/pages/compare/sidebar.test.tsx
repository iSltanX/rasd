import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sidebar, type SidebarProps } from '@/pages/compare/parts/Sidebar'
import { addZone } from '@/pages/compare/session-zones'
import { deviceRect } from '@/shared/geometry'

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
    zones: [],
    excludedPixels: 0,
    drawing: false,
    onToggleDrawing: vi.fn(),
    onRemoveZone: vi.fn(),
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

/** `compare / session-zones` (`393:2742`) — لقطتان بلا مرجع، مناطق مؤقّتة تقول إنها غير محفوظة. */
describe('Sidebar — قسم «مناطق هذه الجلسة»', () => {
  // معرّفان 5 و9 عمدًا: يُثبتان أن الحذف بالمعرّف لا بالفهرس (1 و2) ولا برقم العرض.
  const zones = [
    { id: 5, rect: deviceRect(10, 20, 120, 40) },
    { id: 9, rect: deviceRect(0, 0, 300, 90) },
  ] as const

  it('يعرض العنوان والشارة «غير محفوظة» والشرح، وبلا مناطق يقول ذلك صراحةً', () => {
    const el = mount(<Sidebar {...props()} />)
    const section = el.querySelector('[data-compare-zones]')
    expect(section?.querySelector('h2')?.textContent).toBe('مناطق هذه الجلسة')
    expect(section?.textContent).toContain('غير محفوظة')
    expect(section?.textContent).toContain(
      'لقطتان بلا مرجع: تُطبَّق المناطق هنا وتُنسى عند إغلاق الصفحة. للحفظ، ثبّت إحداهما مرجعًا.',
    )
    expect(section?.textContent).toContain('لا مناطق مستثناة — كل البكسلات تدخل الفرق.')
    expect(el.querySelectorAll('[data-compare-zone]')).toHaveLength(0)
  })

  it('القسم بعد قسم المناطق المتغيّرة وقبل الدليل', () => {
    const el = mount(<Sidebar {...props()} />)
    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual(['طريقة العرض', 'مناطق هذه الجلسة', 'الدليل'])
  })

  it('صفٌّ لكل منطقة: رقم هنديّ، «مستطيل»، الأبعاد غربية معزولة LTR، وزرّ حذف باسمه', () => {
    const el = mount(<Sidebar {...props({ zones })} />)
    const rows = [...el.querySelectorAll('[data-compare-zone]')]
    expect(rows).toHaveLength(2)
    expect(el.textContent).not.toContain('لا مناطق مستثناة')

    const first = rows[0] as HTMLElement
    expect(first.textContent).toContain('١')
    expect(first.textContent).toContain('مستطيل')
    expect(first.querySelector('bdi[dir="ltr"]')?.textContent).toBe('120 × 40')
    expect(first.querySelector('button')?.getAttribute('aria-label')).toBe('احذف المنطقة ١')

    const second = rows[1] as HTMLElement
    expect(second.textContent).toContain('٢')
    expect(second.querySelector('bdi[dir="ltr"]')?.textContent).toBe('300 × 90')
    expect(second.querySelector('button')?.getAttribute('aria-label')).toBe('احذف المنطقة ٢')
  })

  it('الحذف يستدعي onRemoveZone بمعرّف المنطقة المقصودة', () => {
    const onRemoveZone = vi.fn()
    const el = mount(<Sidebar {...props({ zones, onRemoveZone })} />)
    ;(el.querySelector('[aria-label="احذف المنطقة ٢"]') as HTMLButtonElement).click()
    expect(onRemoveZone).toHaveBeenCalledTimes(1)
    expect(onRemoveZone).toHaveBeenCalledWith(9)
  })

  it('زرّ «ارسم مستطيلًا» يعلن حالته بـaria-pressed ويستدعي التبديل', () => {
    const onToggleDrawing = vi.fn()
    const el = mount(<Sidebar {...props({ drawing: false, onToggleDrawing })} />)
    const button = el.querySelector('[data-compare-zone-draw]') as HTMLButtonElement
    expect(button.textContent).toContain('ارسم مستطيلًا')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.click()
    expect(onToggleDrawing).toHaveBeenCalledTimes(1)

    render(null, el)
    const pressed = mount(<Sidebar {...props({ drawing: true })} />)
    expect(pressed.querySelector('[data-compare-zone-draw]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('كل الأزرار المضافة لها اسم مقروء', () => {
    const el = mount(<Sidebar {...props({ zones })} />)
    const section = el.querySelector('[data-compare-zones]') as HTMLElement
    for (const button of section.querySelectorAll('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      expect(name.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('Sidebar — بطاقة النسبة مع مناطق الجلسة', () => {
  const zones = addZone([], deviceRect(0, 0, 100, 50))

  function ratio(el: HTMLElement) {
    return {
      label: el.querySelector('[class*="ratioLabel"]')?.textContent ?? '',
      detail: el.querySelector('[class*="ratioDetail"]')?.textContent ?? '',
    }
  }

  it('بلا مناطق: التسمية الأصلية ولا أثر لـ«استُثني»', () => {
    const el = mount(
      <Sidebar {...props({ diffPixelCount: 3412, comparedPixels: 1296000, diffRatio: 0.0026 })} />,
    )
    const { label, detail } = ratio(el)
    expect(label).toBe('نسبة الاختلاف')
    expect(detail).toBe('3412 بكسل مختلف من 1296000')
    expect(detail).not.toContain('استُثني')
  })

  it('مع منطقة: التسمية «على المناطق المهمّة» ويُلحَق المستثنى غربيًّا بعد `من N` دون مساس به', () => {
    const el = mount(
      <Sidebar
        {...props({
          zones,
          excludedPixels: 5000,
          diffPixelCount: 3412,
          comparedPixels: 1291000,
          diffRatio: 0.0026,
        })}
      />,
    )
    const { label, detail } = ratio(el)
    expect(label).toBe('نسبة الاختلاف · على المناطق المهمّة')
    expect(detail).toBe('3412 بكسل مختلف من 1291000 · استُثني 5000')
    // الحرّاس يقرؤون المقام بهذا النمط — يجب أن يبقى أوّل ما يطابق هو المقام لا المستثنى.
    expect(/من\s+(\d+)/.exec(detail)?.[1]).toBe('1291000')
  })

  it('منطقة لم تمسّ التقاطع: «استُثني 0» صادقة لا محذوفة', () => {
    const el = mount(<Sidebar {...props({ zones, excludedPixels: 0 })} />)
    expect(ratio(el).detail).toContain('استُثني 0')
  })
})

/**
 * المراجعة المستقلّة (`STAGES/34`): «اللقطتان متطابقتان — لا بكسل مختلف بينهما» كان يُقال ومنطقةٌ تخفي جزءًا
 * منهما — وما أُخفي قد يختلف. الحكم على جزءٍ يُسمّى بجزئه (ADR 0034 §2).
 */
describe('Sidebar — الحكم مع مناطق الجلسة', () => {
  const zone = { id: 1, rect: { space: 'device' as const, x: 0, y: 0, width: 100, height: 90 } }

  it('بلا فرقٍ خارج المناطق: «لا فرق على المناطق المهمّة»، لا «متطابقتان»', () => {
    const el = mount(
      <Sidebar
        {...props({ zones: [zone], excludedPixels: 9000, comparedPixels: 1000, diffPixelCount: 0 })}
      />,
    )
    expect(el.querySelector('[data-compare-verdict="identical"]')).toBeNull()
    expect(el.querySelector('[data-compare-verdict="unchanged-important"]')?.textContent).toContain(
      'لا فرق على المناطق المهمّة',
    )
  })

  it('المناطق تغطّي التقاطع كلّه: لا حكمَ بتطابق — لا بكسل بقي للمقارنة', () => {
    const el = mount(
      <Sidebar
        {...props({ zones: [zone], excludedPixels: 10000, comparedPixels: 0, diffPixelCount: 0 })}
      />,
    )
    expect(el.querySelector('[data-compare-verdict="identical"]')).toBeNull()
    expect(el.querySelector('[data-compare-verdict="all-excluded"]')?.textContent).toContain(
      'لا بكسل بقي للمقارنة',
    )
  })
})
