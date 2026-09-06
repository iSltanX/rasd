import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ScalePanel,
  type ScalePanelProps,
  type ScaleSampleRow,
  type ScaleStripStop,
} from '@/ui/overlay'

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

/** ترتيب `SCALE_STEPS` نفسه (`modules/colour/scale.ts`) — تصاعديًّا 50→950. */
const STOPS: readonly ScaleStripStop[] = [
  { step: 50, hex: '#FBF4FF' },
  { step: 100, hex: '#F3E4FF' },
  { step: 200, hex: '#E7D0FF' },
  { step: 300, hex: '#CEB5FF' },
  { step: 400, hex: '#B389FF' },
  { step: 500, hex: '#A867FF' },
  { step: 600, hex: '#9333EA' },
  { step: 700, hex: '#7D00DA' },
  { step: 800, hex: '#6A00B8' },
  { step: 900, hex: '#400075' },
  { step: 950, hex: '#2E0057' },
]

/** القيم الأربع من اللقطة المرجعية `125:355` بالضبط — انظر ترويسة `ScalePanel.tsx`. */
const SAMPLE: readonly ScaleSampleRow[] = [
  { step: 300, hex: '#CEB5FF', oklch: '0.82 0.105 300', contrastRatio: '1.80 : 1' },
  { step: 500, hex: '#A867FF', oklch: '0.66 0.218 300', contrastRatio: '3.47 : 1' },
  { step: 700, hex: '#7D00DA', oklch: '0.49 0.262 300', contrastRatio: '7.28 : 1' },
  { step: 900, hex: '#400075', oklch: '0.31 0.166 300', contrastRatio: '14.24 : 1' },
]

function panelProps(overrides: Partial<ScalePanelProps> = {}): ScalePanelProps {
  return {
    baseHex: '#7c3aed',
    baseSwatch: '#7c3aed',
    steps: 11,
    stops: STOPS,
    sample: SAMPLE,
    onStepsChange: vi.fn(),
    ...overrides,
  }
}

function panel(el: HTMLDivElement) {
  return el.querySelector('[data-rasd-ov="scale-panel"]') as HTMLElement
}

describe('ScalePanel — يُصيَّر بلا رمي', () => {
  it('يرسم العنوان وصفّ المصدر بحرف كبير للقيمة السداسية', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(panel(el).getAttribute('aria-label')).toBe('توليد درجات اللون')
    expect(el.textContent).toContain('توليد درجات اللون')
    expect(el.textContent).toContain('اللون الأساس')
    // `baseHex` وصلت بحرف صغير — العرض بحرف كبير مثل ColourPanel تمامًا.
    expect(el.querySelector('.rasd-ov-scl-base-text')?.textContent).toContain('#7C3AED')
  })

  it('عيّنة الأساس تحمل اللون عبر المتغيّر السطري --rasd-ov-sample', () => {
    const el = mount(<ScalePanel {...panelProps({ baseSwatch: 'oklch(55% 0.2 300)' })} />)
    const sw = el.querySelector('.rasd-ov-scl-base-sw') as HTMLElement
    expect(sw.style.getPropertyValue('--rasd-ov-sample')).toBe('oklch(55% 0.2 300)')
  })

  it('زرّ الإغلاق يستدعي onClose، ولا يرمي بلا معاودة', () => {
    const onClose = vi.fn()
    const el = mount(<ScalePanel {...panelProps({ onClose })} />)
    ;(el.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledOnce()

    expect(() => {
      const noClose = mount(<ScalePanel {...panelProps()} />)
      ;(noClose.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    }).not.toThrow()
  })
})

describe('ScalePanel — تجزئة عدد الدرجات', () => {
  it('تعرض تبويبين فقط، بترتيب DOM «١١» ثم «٩»', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const tabs = [...el.querySelectorAll('[role="tab"]')]
    expect(tabs).toHaveLength(2)
    expect(tabs[0]?.textContent).toBe('١١ درجة')
    expect(tabs[1]?.textContent).toBe('٩ درجات')
  })

  it('التبويب المطابق لـsteps محدَّد وحده (aria-selected)', () => {
    const el = mount(<ScalePanel {...panelProps({ steps: 9 })} />)
    const selected = [...el.querySelectorAll('[role="tab"]')].filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('٩ درجات')
  })

  it('النقر على «٩ درجات» يستدعي onStepsChange(9)', () => {
    const onStepsChange = vi.fn()
    const el = mount(<ScalePanel {...panelProps({ steps: 11, onStepsChange })} />)
    const nine = [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent === '٩ درجات')
    ;(nine as HTMLButtonElement).click()
    expect(onStepsChange).toHaveBeenCalledWith(9)
  })

  it('النقر على «١١ درجة» يستدعي onStepsChange(11)', () => {
    const onStepsChange = vi.fn()
    const el = mount(<ScalePanel {...panelProps({ steps: 9, onStepsChange })} />)
    const eleven = [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent === '١١ درجة')
    ;(eleven as HTMLButtonElement).click()
    expect(onStepsChange).toHaveBeenCalledWith(11)
  })
})

describe('ScalePanel — شريط التدرّج', () => {
  it('يرسم عدد الدرجات كما وصلت، بترتيب stops دون عكس', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const items = [...el.querySelectorAll('.rasd-ov-scl-stop')]
    expect(items).toHaveLength(11)
    // العنصر الأوّل في DOM هو أوّل عنصر في stops (50) لا آخره — ترتيب RTL
    // الطبيعي (انظر فقرة «ترتيب DOM» في ترويسة `ScalePanel.tsx`) يقلبه
    // بصريًّا بلا حاجة لعكس المصفوفة هنا.
    expect(items[0]?.textContent).toBe('50')
    expect(items[10]?.textContent).toBe('950')
  })

  it('كل عيّنة تحمل لونها عبر --rasd-ov-sample، ورقمها بأرقام غربية', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const first = el.querySelectorAll('.rasd-ov-scl-stop')[3] as HTMLElement // step 300
    const sw = first.querySelector('.rasd-ov-scl-stop-sw') as HTMLElement
    expect(sw.style.getPropertyValue('--rasd-ov-sample')).toBe('#CEB5FF')
    expect(first.querySelector('.rasd-ov-scl-stop-num')?.textContent).toBe('300')
  })

  it('شريط فارغ يُرسَم بلا رمي', () => {
    expect(() => mount(<ScalePanel {...panelProps({ stops: [] })} />)).not.toThrow()
  })
})

describe('ScalePanel — جدول العيّنة', () => {
  it('يعرض صفوف sample كما وصلت — أربعة في اللقطة المرجعية، لا 11', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const rows = el.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(4)
  })

  it('رأس الجدول بالترتيب: الدرجة · HEX · OKLCH · التباين على الأبيض', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const headers = [...el.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(headers).toEqual(['الدرجة', 'HEX', 'OKLCH', 'التباين على الأبيض'])
  })

  it('صفّ 500 يعرض HEX وOKLCH ونسبة التباين حرفيًّا كما وصلت', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const row = [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes('500'))
    const cells = [...(row?.querySelectorAll('td') ?? [])]
    expect(cells[0]?.textContent).toContain('500')
    expect(cells[1]?.textContent).toBe('#A867FF')
    expect(cells[2]?.textContent).toBe('0.66 0.218 300')
    expect(cells[3]?.textContent).toBe('3.47 : 1')
  })

  it('القيمة السداسية في الجدول تُعرض بحرف كبير حتى إن وصلت صغيرًا', () => {
    const el = mount(
      <ScalePanel
        {...panelProps({ sample: [{ step: 500, hex: '#a867ff', oklch: '', contrastRatio: '' }] })}
      />,
    )
    expect(el.querySelector('tbody td')?.textContent).toBe('500')
    expect([...el.querySelectorAll('tbody td')][1]?.textContent).toBe('#A867FF')
  })

  it('جدول فارغ يُرسَم بلا رمي', () => {
    expect(() => mount(<ScalePanel {...panelProps({ sample: [] })} />)).not.toThrow()
  })
})

describe('ScalePanel — الإجراءات', () => {
  it('أربعة أزرار بالترتيب: احفظ في المكتبة (بارز) · JSON · Tailwind config · CSS Variables', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-scl-actions button')]
    expect(buttons.map((b) => b.textContent)).toEqual([
      'احفظ في المكتبة',
      'JSON',
      'Tailwind config',
      'CSS Variables',
    ])
    expect(buttons[0]?.getAttribute('data-primary')).toBe('true')
    expect(buttons[1]?.getAttribute('data-primary')).toBeNull()
  })

  it('زرّ «احفظ في المكتبة» يستدعي onSave، ولا يرمي بلا معاودة', () => {
    const onSave = vi.fn()
    const el = mount(<ScalePanel {...panelProps({ onSave })} />)
    ;(el.querySelector('.rasd-ov-scl-actions button') as HTMLButtonElement).click()
    expect(onSave).toHaveBeenCalledOnce()

    expect(() => {
      const noSave = mount(<ScalePanel {...panelProps()} />)
      ;(noSave.querySelector('.rasd-ov-scl-actions button') as HTMLButtonElement).click()
    }).not.toThrow()
  })

  it('أزرار التصدير الثلاثة تستدعي onExport بالصيغة الصحيحة، ولا ترمي بلا معاودة', () => {
    const onExport = vi.fn()
    const el = mount(<ScalePanel {...panelProps({ onExport })} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-scl-actions button')]
    ;(buttons[1] as HTMLButtonElement).click() // JSON
    ;(buttons[2] as HTMLButtonElement).click() // Tailwind config
    ;(buttons[3] as HTMLButtonElement).click() // CSS Variables
    expect(onExport).toHaveBeenNthCalledWith(1, 'json')
    expect(onExport).toHaveBeenNthCalledWith(2, 'tailwind')
    expect(onExport).toHaveBeenNthCalledWith(3, 'css')

    expect(() => {
      const noExport = mount(<ScalePanel {...panelProps()} />)
      const btn = noExport.querySelectorAll('.rasd-ov-scl-actions button')[1] as HTMLButtonElement
      btn.click()
    }).not.toThrow()
  })

  /**
   * لا صيغة «نصّ قابل للنسخ» هنا — الرابعة في `exportPalette`
   * (`modules/colour/export.ts`) لا زرّ لها في اللقطة المرجعية.
   */
  it('لا زرّ خامس، ولا صيغة "text"', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(el.querySelectorAll('.rasd-ov-scl-actions button')).toHaveLength(4)
    expect(el.textContent).not.toContain('نص قابل للنسخ')
  })
})

/**
 * خلافًا لـ`ColourPanel`: لا زرّ نسخ فرديًّا لأي قيمة هنا — انظر تعليل
 * القرار في ترويسة `ScalePanel.tsx`. الأزرار كلّها في `.rasd-ov-scl-actions`
 * وحدها (2 تبويب + إغلاق + 4 إجراءات = 7)، لا أيقونات نسخ إضافية بجانب
 * القيم.
 */
describe('ScalePanel — بلا نسخ فرديّ (خلافًا لـColourPanel)', () => {
  it('لا أيقونة نسخ عند أي قيمة، وعدد الأزرار الكلّي 7 فقط', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(el.querySelectorAll('[aria-label^="انسخ"]')).toHaveLength(0)
    expect(el.querySelectorAll('button')).toHaveLength(7)
  })
})

/** `Rasd_Plan.md §3.5` البند 1 — القسمة بين عدٍّ بشري وقياس تقني. */
describe('ScalePanel — سياسة الأرقام (§3.5)', () => {
  it('عدد الدرجات في التجزئة هنديٌّ (عدٌّ بشري)', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(el.textContent).toContain('١١ درجة')
    expect(el.textContent).toContain('٩ درجات')
    expect(el.textContent).not.toContain('11 درجة')
    expect(el.textContent).not.toContain('9 درجات')
  })

  it('تسميات الدرجات وHEX وOKLCH والتباين كلّها غربية — تسميات تقنية لا عدّ', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const stopLabels = [...el.querySelectorAll('.rasd-ov-scl-stop-num')].map((n) => n.textContent)
    expect(stopLabels).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '950',
    ])
    expect(el.querySelector('tbody td')?.textContent).toBe('300')
  })
})

/**
 * `Rasd_Plan.md §3.5` البند 2 — كل قيمة تقنية داخل نصّ عربي تمرّ عبر
 * `<TechnicalValue>` (`<bdi dir="ltr" data-technical>`).
 */
describe('ScalePanel — عزل bidi', () => {
  it('القيمة السداسية للأساس معزولة بـbdi kind=color', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const hex = el.querySelector('.rasd-ov-scl-base-text [data-kind="color"]')
    expect(hex?.tagName).toBe('BDI')
    expect(hex?.getAttribute('dir')).toBe('ltr')
  })

  it('رأسا HEX وOKLCH معزولان بـkind=format', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const heads = [...el.querySelectorAll('thead [data-kind="format"]')]
    expect(heads).toHaveLength(2)
    expect(heads.every((h) => h.tagName === 'BDI')).toBe(true)
  })

  it('أرقام الدرجات في الشريط والجدول معزولة بـkind=code', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(el.querySelectorAll('.rasd-ov-scl-stop-num [data-kind="code"]')).toHaveLength(11)
    expect(el.querySelectorAll('.rasd-ov-scl-cell-step [data-kind="code"]')).toHaveLength(4)
  })

  it('HEX وOKLCH في الجدول معزولان بـkind=color، والتباين بـkind=code', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    expect(el.querySelectorAll('tbody [data-kind="color"]')).toHaveLength(8) // 4×(hex+oklch)
    expect(el.querySelectorAll('tbody [data-kind="code"]')).toHaveLength(8) // 4×(step+ratio)
  })

  it('أسماء صيغ التصدير معزولة بـkind=format', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const labels = [...el.querySelectorAll('.rasd-ov-scl-actions [data-kind="format"]')]
    expect(labels).toHaveLength(3)
    expect(labels.map((l) => l.textContent)).toEqual(['JSON', 'Tailwind config', 'CSS Variables'])
  })
})

describe('ScalePanel — الجملة التفسيرية خارج بطاقة اللوحة', () => {
  it('تُعرض بنصّها الحرفي، وعنصر شقيق للقسم لا طفل داخله', () => {
    const el = mount(<ScalePanel {...panelProps()} />)
    const note = el.querySelector('.rasd-ov-scl-note')
    expect(note?.textContent).toBe(
      'يبني رصد السلّم في OKLCH على شبكة إضاءة ثابتة، فتبقى كل درجة متساوية الوزن مع نظيرتها في أي لون آخر.',
    )
    expect(panel(el).contains(note)).toBe(false)
  })
})
