/**
 * لوحة استخراج لوحة الصفحة — `colors / palette-extract` (`122:157`).
 *
 * ما يُحرَس هنا: ترتيب الرأس (نفس تصحيح مرآة `ColourPanel`)، أن «كل الصفحة»
 * غائبة من تبويبات المصدر (سابقة المرحلة 7: لا محرّك لها)، أن تبويب «مخصّص»
 * وظيفي لا ديكوريّ، وأن سياسة الأرقام (`§3.5` البند 1) مطبَّقة بدقّة: عدّ
 * الألوان هنديّ في الموضعين معًا (يصحّح تناقض الإطار المرجعي نفسه)، والنِّسَب
 * غربية رغم أن اللقطة ترسمها هندية.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PalettePanel, type PalettePanelProps, type PaletteSwatchView } from '@/ui/overlay'

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

const ARABIC_INDIC = /[٠-٩]/u

/** اللوحة الثمانية من اللقطة المرجعية `122:256` — الحصص والتصنيفات حرفيًّا. */
const SWATCHES: readonly PaletteSwatchView[] = [
  { hex: '#7C3AED', share: 0.34, count: 3400, neutral: false, source: 'background' },
  { hex: '#111827', share: 0.22, count: 2200, neutral: false, source: 'text' },
  { hex: '#F7F8FB', share: 0.16, count: 1600, neutral: true, source: 'background' },
  { hex: '#4B5563', share: 0.11, count: 1100, neutral: false, source: 'text' },
  { hex: '#E7EAF0', share: 0.08, count: 800, neutral: true, source: 'border' },
  { hex: '#F3EFFF', share: 0.04, count: 400, neutral: true, source: 'background' },
  { hex: '#22C55E', share: 0.03, count: 300, neutral: false, source: null },
  { hex: '#F59E0B', share: 0.02, count: 200, neutral: false, source: null },
]

function panelProps(overrides: Partial<PalettePanelProps> = {}): PalettePanelProps {
  return {
    source: 'viewport',
    onSourceChange: vi.fn(),
    count: 8,
    onCountChange: vi.fn(),
    readMethod: 'pixel',
    onReadMethodChange: vi.fn(),
    hideNeutrals: true,
    onHideNeutralsChange: vi.fn(),
    separateSources: true,
    onSeparateSourcesChange: vi.fn(),
    swatches: SWATCHES,
    ...overrides,
  }
}

function panel(el: HTMLDivElement): HTMLElement {
  return el.querySelector('[data-rasd-ov="palette-panel"]') as HTMLElement
}

describe('PalettePanel — يُصيَّر بلا رمي', () => {
  it('يحمل aria-label «لوحة الصفحة»', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    expect(panel(el).getAttribute('aria-label')).toBe('لوحة الصفحة')
  })

  it('لوحة فارغة (صفر ألوان) تُرسَم بلا رمي', () => {
    expect(() => mount(<PalettePanel {...panelProps({ swatches: [] })} />)).not.toThrow()
  })
})

/*
 * عطلُ مرآة من `ColourPanel` — تحت `justify-content: space-between` في RTL
 * يقع أوّل عنصر في DOM يمينًا، والإطار يضع «×» يسارًا والعنوان يمينًا.
 */
describe('PalettePanel — ترتيب الرأس', () => {
  it('العنوان يسبق زرّ الإغلاق في DOM فيقع يمينًا في RTL', () => {
    const el = mount(<PalettePanel {...panelProps()} onClose={() => undefined} />)
    const head = el.querySelector('.rasd-ov-pal-head')
    expect(head?.firstElementChild?.className).toContain('rasd-ov-pal-title')
    expect(head?.lastElementChild?.getAttribute('aria-label')).toBe('إغلاق')
  })

  it('زرّ الإغلاق يستدعي onClose، ولا يرمي بلا معاودة', () => {
    const onClose = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ onClose })} />)
    ;(el.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledOnce()

    expect(() => {
      const noClose = mount(<PalettePanel {...panelProps()} />)
      ;(noClose.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    }).not.toThrow()
  })
})

/*
 * `shared/messaging/contract.ts` يوثِّق مصدرين فقط لرسالة `palette/extract`
 * (`viewport` و`capture`)، ويُعلن «الصفحة كاملة» غير مدعومة صراحةً — فسابقة
 * المرحلة 7 («ما لا محرّك له يُحذَف») تمنع خامس تبويب زخرفيّ.
 */
describe('PalettePanel — تبويبات المصدر (§6.1)', () => {
  it('أربعة تبويبات فقط — لا «كل الصفحة» غير المدعومة', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const list = el.querySelector('[aria-label="مصدر اللوحة"]')
    const tabs = [...(list?.querySelectorAll('[role="tab"]') ?? [])]
    expect(tabs).toHaveLength(4)
    expect(el.textContent).not.toContain('كل الصفحة')
  })

  it('بترتيب DOM: الظاهر → عنصر → منطقة → من لقطة', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const tabs = [
      ...(el.querySelector('[aria-label="مصدر اللوحة"]')?.querySelectorAll('[role="tab"]') ?? []),
    ]
    expect(tabs.map((t) => t.textContent)).toEqual(['الظاهر', 'عنصر', 'منطقة', 'من لقطة'])
  })

  it('التبويب المطابق لـsource محدَّد وحده', () => {
    const el = mount(<PalettePanel {...panelProps({ source: 'element' })} />)
    const tabs = [
      ...(el.querySelector('[aria-label="مصدر اللوحة"]')?.querySelectorAll('[role="tab"]') ?? []),
    ]
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('عنصر')
  })

  it('النقر على «من لقطة» يستدعي onSourceChange(capture)', () => {
    const onSourceChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ onSourceChange })} />)
    const tabs = [
      ...(el.querySelector('[aria-label="مصدر اللوحة"]')?.querySelectorAll('[role="tab"]') ?? []),
    ]
    const capture = tabs.find((t) => t.textContent === 'من لقطة')
    ;(capture as HTMLButtonElement).click()
    expect(onSourceChange).toHaveBeenCalledWith('capture')
  })
})

describe('PalettePanel — تجزئة عدد الألوان (§6.2)', () => {
  it('أربعة تبويبات: ٥ · ٨ · ١٢ · مخصّص، بأرقام هندية للثلاثة الجاهزة', () => {
    const el = mount(<PalettePanel {...panelProps({ count: 8 })} />)
    const tabs = [...el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')]
    expect(tabs.map((t) => t.textContent)).toEqual(['٥', '٨', '١٢', 'مخصّص'])
  })

  it('«٨» محدَّد حين count=8، ولا حقل مخصّص ظاهر', () => {
    const el = mount(<PalettePanel {...panelProps({ count: 8 })} />)
    const tabs = [...el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')]
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('٨')
    expect(el.querySelector('.rasd-ov-pal-custom-count-input')).toBeNull()
  })

  it('النقر على «١٢» يستدعي onCountChange(12)', () => {
    const onCountChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ count: 8, onCountChange })} />)
    const tabs = [...el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')]
    const twelve = tabs.find((t) => t.textContent === '١٢')
    ;(twelve as HTMLButtonElement).click()
    expect(onCountChange).toHaveBeenCalledWith(12)
  })

  it('عدد لا يطابق أيّ خيار جاهز يُفعِّل «مخصّص» ويعرضه هنديًّا، مع حقل رقم', () => {
    const el = mount(<PalettePanel {...panelProps({ count: 20 })} />)
    const tabs = [...el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')]
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('٢٠')
    const input = el.querySelector('.rasd-ov-pal-custom-count-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('20') // قيمة حقل رقم HTML — أرقام غربية بحكم المعيار، لا خيارًا هنا
  })

  it('النقر على «مخصّص» من عدد جاهز يستدعي onCountChange ببداية تعسّفية موثَّقة', () => {
    const onCountChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ count: 8, onCountChange })} />)
    const tabs = [...el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')]
    const customTab = tabs.find((t) => t.textContent === 'مخصّص')
    ;(customTab as HTMLButtonElement).click()
    expect(onCountChange).toHaveBeenCalledOnce()
    const value = onCountChange.mock.calls[0]?.[0] as number
    expect(value).toBeGreaterThan(0)
    expect([5, 8, 12]).not.toContain(value)
  })

  it('تعديل حقل «مخصّص» يستدعي onCountChange بالرقم الجديد', () => {
    const onCountChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ count: 20, onCountChange })} />)
    const input = el.querySelector('.rasd-ov-pal-custom-count-input') as HTMLInputElement
    input.value = '30'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onCountChange).toHaveBeenCalledWith(30)
  })

  it('حقل «مخصّص» لا يمرّر صفرًا أو قيمة غير صالحة — أدنى ١', () => {
    const onCountChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ count: 20, onCountChange })} />)
    const input = el.querySelector('.rasd-ov-pal-custom-count-input') as HTMLInputElement
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onCountChange).toHaveBeenCalledWith(1)
  })
})

describe('PalettePanel — طريقة القراءة (§6.4)', () => {
  it('تبويبان فقط، بترتيب DOM: من البكسل → من CSS', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const tabs = [...el.querySelectorAll('[aria-label="طريقة القراءة"] [role="tab"]')]
    expect(tabs.map((t) => t.textContent)).toEqual(['من البكسل', 'من CSS'])
  })

  it('النقر على «من CSS» يستدعي onReadMethodChange(css)', () => {
    const onReadMethodChange = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ readMethod: 'pixel', onReadMethodChange })} />)
    const tabs = [...el.querySelectorAll('[aria-label="طريقة القراءة"] [role="tab"]')]
    const css = tabs.find((t) => t.textContent === 'من CSS')
    ;(css as HTMLButtonElement).click()
    expect(onReadMethodChange).toHaveBeenCalledWith('css')
  })
})

describe('PalettePanel — المفتاحان (§6.3 و§6.5)', () => {
  it('حالتا المفتاحين تُعرضان عبر checked، ونصّاهما §6.3 حرفيًّا', () => {
    const el = mount(
      <PalettePanel {...panelProps({ hideNeutrals: true, separateSources: false })} />,
    )
    const switches = [...el.querySelectorAll('input[role="switch"]')] as HTMLInputElement[]
    expect(switches).toHaveLength(2)
    expect(switches[0]?.checked).toBe(true)
    expect(switches[1]?.checked).toBe(false)
    expect(el.textContent).toContain('إخفاء الألوان الحيادية')
    expect(el.textContent).toContain('الأبيض والأسود والرماديات')
    expect(el.textContent).toContain('افصل ألوان الواجهة عن الصور')
    expect(el.textContent).toContain('يعرض مصدر كل لون')
  })

  it('تبديل «إخفاء الألوان الحيادية» يستدعي onHideNeutralsChange', () => {
    const onHideNeutralsChange = vi.fn()
    const el = mount(
      <PalettePanel {...panelProps({ hideNeutrals: false, onHideNeutralsChange })} />,
    )
    const sw = el.querySelectorAll('input[role="switch"]')[0] as HTMLInputElement
    sw.checked = true
    sw.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onHideNeutralsChange).toHaveBeenCalledWith(true)
  })

  it('تبديل «افصل ألوان الواجهة عن الصور» يستدعي onSeparateSourcesChange', () => {
    const onSeparateSourcesChange = vi.fn()
    const el = mount(
      <PalettePanel {...panelProps({ separateSources: true, onSeparateSourcesChange })} />,
    )
    const sw = el.querySelectorAll('input[role="switch"]')[1] as HTMLInputElement
    sw.checked = false
    sw.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onSeparateSourcesChange).toHaveBeenCalledWith(false)
  })
})

/**
 * `Docs/Engineering.md §3.5` البند 1: عدّ بشري هنديّ، وقياس تقني غربي. الاستطلاع
 * البصري لـ`122:157` رصد أن الإطار نفسه يخالف هذا في موضعين: رأس النتائج
 * يكتب «8» غربيًّا (لا «٨» كتجزئة العدد)، والنِّسَب هندية (`٣٤٪` لا `34%`).
 * كلاهما يُصحَّح هنا وفق النصّ لا يُنسَخ حرفيًّا من اللقطة.
 */
describe('PalettePanel — سياسة الأرقام (§3.5)', () => {
  it('رأس النتائج هنديّ («٨ ألوان») لا غربيّ — يصحّح تناقض الإطار', () => {
    const el = mount(<PalettePanel {...panelProps({ swatches: SWATCHES })} />)
    const head = el.querySelector('.rasd-ov-pal-results-head')
    expect(head?.textContent).toContain('٨ ألوان')
    expect(head?.textContent).not.toContain('8 ألوان')
    expect(head?.textContent).not.toMatch(/\b8\b/u)
  })

  it('المثنّى بلا رقم — «لونين» عند لونين بالضبط', () => {
    const el = mount(<PalettePanel {...panelProps({ swatches: SWATCHES.slice(0, 2) })} />)
    const head = el.querySelector('.rasd-ov-pal-results-head')
    expect(head?.textContent).toContain('لونين')
    expect(head?.textContent).not.toMatch(ARABIC_INDIC)
  })

  it('صفر ألوان يقول «٠ لون» صراحةً — نفس تصريف `plural(0, …)` في بقيّة المستودع', () => {
    const el = mount(<PalettePanel {...panelProps({ swatches: [] })} />)
    expect(el.querySelector('.rasd-ov-pal-results-head')?.textContent).toContain('٠ لون')
  })

  it('نسبة كل عيّنة غربية عبر formatPercent — خلافًا للأرقام الهندية في اللقطة', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const first = el.querySelectorAll('.rasd-ov-pal-card')[0]
    expect(first?.querySelector('.rasd-ov-pal-card-meta')?.textContent).toContain('34%')
    expect(first?.textContent).not.toMatch(ARABIC_INDIC)
  })

  it('تبويبات عدد الألوان الجاهزة هندية بأرقامها', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const tabs = el.querySelectorAll('[aria-label="عدد الألوان"] [role="tab"]')
    expect(tabs[0]?.textContent).toBe('٥')
    expect(tabs[1]?.textContent).toBe('٨')
    expect(tabs[2]?.textContent).toBe('١٢')
  })
})

/*
 * قياس مباشر لـ`122:256`: مربّع اللون يقع عند الحافّة اليمنى لكل بطاقة،
 * فيكون أوّل عنصر في DOM — خلافًا لترتيب `ColourPanel.rasd-ov-cp-swatch-block`
 * (النصّ أوّلًا هناك). وترتيب امتلاء الشبكة يتبع `swatches` كما وصلت، بلا
 * عكس يدويّ — مبدأ `ScalePanel.tsx` نفسه.
 */
describe('PalettePanel — شبكة العيّنات (§6.1/§6.5)', () => {
  it('بطاقة لكل عيّنة، بترتيب swatches كما وصل دون عكس', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const cards = [...el.querySelectorAll('.rasd-ov-pal-card')]
    expect(cards).toHaveLength(8)
    expect(cards[0]?.textContent).toContain('#7C3AED')
    expect(cards[1]?.textContent).toContain('#111827')
    expect(cards[7]?.textContent).toContain('#F59E0B')
  })

  it('مربّع اللون أوّل عنصر في DOM داخل البطاقة، لا كتلة النصّ', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const first = el.querySelector('.rasd-ov-pal-card') as HTMLElement
    expect(first.firstElementChild?.className).toContain('rasd-ov-pal-card-sw')
    expect(first.lastElementChild?.className).toContain('rasd-ov-pal-card-text')
  })

  it('لون العيّنة يمرّ عبر --rasd-ov-sample سطريًا', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const sw = el.querySelector('.rasd-ov-pal-card-sw') as HTMLElement
    expect(sw.style.getPropertyValue('--rasd-ov-sample')).toBe('#7C3AED')
  })

  it('القيمة السداسية تُعرض بحرف كبير حتى إن وصلت صغيرًا', () => {
    const el = mount(
      <PalettePanel
        {...panelProps({
          swatches: [{ hex: '#a867ff', share: 0.5, count: 10, neutral: false, source: null }],
        })}
      />,
    )
    expect(el.querySelector('.rasd-ov-pal-card-text')?.textContent).toContain('#A867FF')
  })

  it('تصنيف المصدر يُعرض حين لا يكون null فقط — النسبة وحدها حين null', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const cards = [...el.querySelectorAll('.rasd-ov-pal-card')]
    expect(cards[0]?.querySelector('.rasd-ov-pal-card-meta')?.textContent).toContain('خلفية')
    expect(cards[6]?.querySelector('.rasd-ov-pal-card-meta')?.textContent).not.toContain('·')
  })
})

/**
 * `PaletteExtraction.droppedNeutrals` موسومٌ صراحةً «يُعلَن ولا يُخفى بصمت»
 * في `shared/messaging/contract.ts`.
 */
describe('PalettePanel — إعلان الحياديات المُسقَطة', () => {
  it('غيابه أو صفره لا يرسم شيئًا — يطابق حال اللقطة المرجعية', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    expect(el.querySelector('.rasd-ov-pal-note')).toBeNull()
  })

  it('قيمة موجبة تُعلَن، بعدّ هنديّ', () => {
    const el = mount(<PalettePanel {...panelProps({ droppedNeutrals: 3 })} />)
    const note = el.querySelector('.rasd-ov-pal-note')
    expect(note?.textContent).toContain('أُسقطت')
    expect(note?.textContent).toMatch(ARABIC_INDIC)
  })
})

/**
 * `colors / palette-empty` (`303:22513`) — لوحة بلا لون كانت شبكة فارغة تحت «٠ لون»: لا سبب ولا
 * مخرج. والسبب الغالب أن ألوان الصفحة حيادية كلّها وأُخفيت، فالمخرج إظهارها بنقرة.
 */
describe('PalettePanel — لوحة فارغة تقول لماذا', () => {
  it('كلّها حيادية مُخفاة: رسالة تسمّي المفتاح، وزرّ يُظهرها', () => {
    const onHideNeutralsChange = vi.fn()
    const el = mount(
      <PalettePanel
        {...panelProps({
          swatches: [],
          droppedNeutrals: 4,
          hideNeutrals: true,
          onHideNeutralsChange,
        })}
      />,
    )
    expect(el.querySelector('.rasd-ov-pal-grid')).toBeNull()
    const empty = el.querySelector('[data-rasd-ov="palette-empty"]')
    expect(empty?.textContent).toContain('لم يبقَ لون في اللوحة')
    expect(empty?.textContent).toContain('«إخفاء الألوان الحيادية»')
    const show = empty?.querySelector('button') as HTMLButtonElement
    expect(show.textContent).toBe('أظهر الحيادية')
    show.click()
    expect(onHideNeutralsChange).toHaveBeenCalledWith(false)
  })

  it('لا حياديات أُسقطت: رسالة بلا زرّ لا يُغيّر شيئًا', () => {
    const el = mount(<PalettePanel {...panelProps({ swatches: [], hideNeutrals: false })} />)
    const empty = el.querySelector('[data-rasd-ov="palette-empty"]')
    expect(empty?.textContent).toContain('لم يُعثر على لون في المصدر')
    expect(empty?.querySelector('button')).toBeNull()
  })

  it('لوحة فيها ألوان لا تحمل الرسالة', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    expect(el.querySelector('[data-rasd-ov="palette-empty"]')).toBeNull()
  })
})

/** على نمط `ColourUsageView.scanning`/`ComparePanelProps.diffBusy` — حالة ثالثة صريحة. */
describe('PalettePanel — الاستخراج الجاري', () => {
  it('يُخفي الشبكة والعدّاد، ويعرض نصّ التقدّم بدلًا منهما', () => {
    const el = mount(<PalettePanel {...panelProps({ extracting: true })} />)
    expect(el.querySelector('.rasd-ov-pal-grid')).toBeNull()
    expect(el.querySelectorAll('.rasd-ov-pal-card')).toHaveLength(0)
    expect(el.querySelector('.rasd-ov-pal-results-count')).toBeNull()
    expect(el.querySelector('.rasd-ov-pal-status')?.textContent).toContain('جارٍ الاستخراج')
  })
})

/*
 * قياس مباشر للأزرار الأربعة في `122:157`: الأيقونة عند الحافّة اليمنى لكل
 * زرّ فتقع أوّلًا في DOM — خلافًا لِزرَّي `ColourPanel` (نصّ ثم أيقونة).
 */
describe('PalettePanel — الإجراءات (§6.14)', () => {
  it('أربعة أزرار بالترتيب: احفظ اللوحة (بارز) · Tailwind · JSON · CSS', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-pal-actions button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['احفظ اللوحة', 'Tailwind', 'JSON', 'CSS'])
    expect(buttons[0]?.getAttribute('data-primary')).toBe('true')
    expect(buttons[1]?.getAttribute('data-primary')).toBeNull()
  })

  it('الأيقونة أوّل عنصر في DOM داخل كل زرّ، لا النصّ', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-pal-actions button')]
    for (const b of buttons) {
      expect(b.firstElementChild?.tagName).toBe('svg')
    }
  })

  it('زرّ «احفظ اللوحة» يستدعي onSave، ولا يرمي بلا معاودة', () => {
    const onSave = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ onSave })} />)
    ;(el.querySelector('.rasd-ov-pal-actions button') as HTMLButtonElement).click()
    expect(onSave).toHaveBeenCalledOnce()

    expect(() => {
      const noSave = mount(<PalettePanel {...panelProps()} />)
      ;(noSave.querySelector('.rasd-ov-pal-actions button') as HTMLButtonElement).click()
    }).not.toThrow()
  })

  it('أزرار التصدير الثلاثة تستدعي onExport بالصيغة الصحيحة، ولا ترمي بلا معاودة', () => {
    const onExport = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ onExport })} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-pal-actions button')]
    ;(buttons[1] as HTMLButtonElement).click() // Tailwind
    ;(buttons[2] as HTMLButtonElement).click() // JSON
    ;(buttons[3] as HTMLButtonElement).click() // CSS
    expect(onExport).toHaveBeenNthCalledWith(1, 'tailwind')
    expect(onExport).toHaveBeenNthCalledWith(2, 'json')
    expect(onExport).toHaveBeenNthCalledWith(3, 'css')

    expect(() => {
      const noExport = mount(<PalettePanel {...panelProps()} />)
      const btn = noExport.querySelectorAll('.rasd-ov-pal-actions button')[1] as HTMLButtonElement
      btn.click()
    }).not.toThrow()
  })

  /** لا صيغة «نصّ قابل للنسخ» — نفس قرار `ScalePanel` ولنفس السبب: لا زرّ خامس في اللقطة. */
  it('لا زرّ خامس، ولا صيغة "text"', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    expect(el.querySelectorAll('.rasd-ov-pal-actions button')).toHaveLength(4)
    expect(el.textContent).not.toContain('نص قابل للنسخ')
  })
})

/**
 * خلافًا لـ`ColourPanel`: لا زرّ نسخ فرديّ لأي قيمة هنا — نفس قرار
 * `ScalePanel.tsx` ولنفس التعليل (فُحصت البطاقات الثماني في `122:256`، ولا
 * أيقونة نسخ عند أيّ سداسي).
 */
describe('PalettePanel — بلا نسخ فرديّ (خلافًا لـColourPanel)', () => {
  it('لا أيقونة نسخ عند أي عيّنة', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    expect(el.querySelectorAll('[aria-label^="انسخ"]')).toHaveLength(0)
  })
})

describe('PalettePanel — عزل الاتجاه (§3.5 البند 2)', () => {
  it('القيمة السداسية والنسبة كلتاهما داخل <bdi dir="ltr">', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const first = el.querySelector('.rasd-ov-pal-card') as HTMLElement
    const bdis = [...first.querySelectorAll('bdi[data-technical]')]
    expect(bdis.length).toBeGreaterThanOrEqual(2)
    for (const b of bdis) expect(b.getAttribute('dir')).toBe('ltr')
  })
})

describe('PalettePanel — لا حفظ ولا تصدير بلا ألوان', () => {
  const footer = (el: HTMLDivElement) => [
    ...el.querySelectorAll<HTMLButtonElement>('.rasd-ov-pal-actions button'),
  ]

  it('صفر ألوان (جارٍ الاستخراج أو مصدرٌ غير متاح) ⟵ الأزرار الأربعة معطَّلة، فلا زرّ صامت ولا ملفّ فارغ', () => {
    const onSave = vi.fn()
    const onExport = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ swatches: [], onSave, onExport })} />)
    const buttons = footer(el)
    expect(buttons).toHaveLength(4)
    expect(buttons.every((b) => b.disabled)).toBe(true)
    for (const b of buttons) b.click()
    expect(onSave).not.toHaveBeenCalled()
    expect(onExport).not.toHaveBeenCalled()
  })

  it('مع ألوان ⟵ الأزرار فاعلة', () => {
    const onSave = vi.fn()
    const el = mount(<PalettePanel {...panelProps({ onSave })} />)
    const buttons = footer(el)
    expect(buttons.some((b) => b.disabled)).toBe(false)
    buttons[0]!.click()
    expect(onSave).toHaveBeenCalledOnce()
  })
})

/**
 * **اللوحة لا تتجاوز حافّة النافذة — ويبقى «احفظ اللوحة» في المتناول.**
 *
 * قِيس في Chrome حقيقي بنافذة ١٢٨٠×٨٠٠ (`innerHeight` ٧١٣): اللوحة ٨٢٣px وقاعها عند y≈٨٦٧،
 * فزرّ الحفظ وأزرار التصدير تحت الحافّة لا يبلغها نقر ولا تمرير. happy-dom بلا محرّك تخطيط، فلا
 * يُقاس الموضع هنا؛ يُحرَس ما يصنع النتيجة: البنية (رأسٌ وإجراءات خارج الجسم المتمرِّر) وعقد
 * الأنماط (سقف الارتفاع وتمرير الجسم وسقف الرصيف). والقياس الحيّ في Chrome حقيقي جرى بنوافذ ٧١٣ و٦٤٠ و٤٨٠px
 * وأبقى زرّ الحفظ داخل النافذة في الثلاث.
 */
describe('PalettePanel — يبقى داخل النافذة', () => {
  const css = readFileSync(join(process.cwd(), 'src/ui/overlay/overlay.css'), 'utf8')

  /** متن أول قاعدة مُحدِّدها بالضبط `selector` (بلا حالات ولا أحفاد). */
  function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)
    if (!m) throw new Error(`قاعدة ${selector} غير موجودة`)
    return m[1]!
  }

  it('الرأس والإجراءات ابنان مباشران للّوحة، والتحكّمات والنتيجة داخل جسمٍ واحد', () => {
    const el = mount(<PalettePanel {...panelProps()} />)
    const kids = [...panel(el).children].map((c) => c.className)
    expect(kids).toEqual(['rasd-ov-pal-head', 'rasd-ov-pal-body', 'rasd-ov-pal-actions'])
    const body = panel(el).querySelector('.rasd-ov-pal-body')!
    expect([...body.children].map((c) => c.className)).toEqual([
      'rasd-ov-pal-controls',
      'rasd-ov-pal-results',
    ])
    // الأزرار الأربعة كلّها خارج الجسم المتمرِّر — لا يخبّئها تمريره.
    expect(body.querySelector('button[data-primary="true"]')).toBeNull()
    expect(panel(el).querySelectorAll('.rasd-ov-pal-actions button')).toHaveLength(4)
  })

  it('اللوحة مسقوفة بارتفاع النافذة، وجسمها وحده يتمرّر', () => {
    expect(rule('.rasd-ov-pal')).toMatch(/max-block-size:\s*var\(--rasd-ov-fit\)/)
    const body = rule('.rasd-ov-pal-body')
    expect(body).toMatch(/overflow-y:\s*auto/)
    expect(body).toMatch(/min-block-size:\s*0/)
    expect(rule('.rasd-ov-pal-head,\n.rasd-ov-pal-actions')).toMatch(/flex:\s*none/)
  })

  it('السقف يُحسب من ارتفاع النافذة وإزاحة الرصيف، لا من قيمة حرفية', () => {
    const fit = /--rasd-ov-fit:\s*([^;]+);/.exec(rule('.rasd-ov-place'))?.[1] ?? ''
    expect(fit).toMatch(/100vh/)
    expect(fit).toMatch(/var\(--rasd-ov-y/)
    expect(fit).toMatch(/var\(--rasd-space-/)
  })

  it('اللوحات الشقيقة الثلاث تأخذ السقف نفسه وتتمرّر عند تجاوزه', () => {
    for (const sel of ['.rasd-ov-cp', '.rasd-ov-scl', '.rasd-ov-cmp']) {
      const body = rule(sel)
      expect(body, sel).toMatch(/max-block-size:\s*var\(--rasd-ov-fit\)/)
      expect(body, sel).toMatch(/overflow-y:\s*auto/)
    }
  })
})
