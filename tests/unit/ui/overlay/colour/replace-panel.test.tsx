/**
 * لوحة الاستبدال المؤقّت — `colors / replace` (`125:227`).
 *
 * ما يُحرَس هنا: ترتيب الرأس (نفس تصحيح مرآة `ColourPanel`/`PalettePanel`/
 * `ScalePanel`)، أن الأوضاع **ثلاثة لا أربعة** (`ReplaceScope`)، أن
 * `matchCount`/`variableName` يُعرضان جاهزَين لا يُحسبان هنا، وأن سياسة
 * الأرقام (`§3.5` البند 1) والعزل الاتجاهي (البند 2) مطبَّقان بدقّة.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReplacePanel, type ReplaceContrastView, type ReplacePanelProps } from '@/ui/overlay'

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

function panel(el: HTMLDivElement): HTMLElement {
  return el.querySelector('[data-rasd-ov="replace-panel"]') as HTMLElement
}

/** الحالة كاملةً من `125:227`: بديل مختار افتراضيًّا، ١٤ عنصرًا مطابقًا، AA. */
const CONTRAST: ReplaceContrastView = {
  ratio: '4.82 : 1',
  level: 'AA',
  badge: 'AA',
  against: 'مع الأبيض',
}

function panelProps(overrides: Partial<ReplacePanelProps> = {}): ReplacePanelProps {
  return {
    originalHex: '#7C3AED',
    originalSwatch: '#7C3AED',
    replacementHex: '#0EA5A3',
    replacementSwatch: '#0EA5A3',
    scope: 'variable',
    onScopeChange: vi.fn(),
    matchCount: 14,
    variableName: '--color-primary',
    contrast: CONTRAST,
    ...overrides,
  }
}

describe('ReplacePanel — يُصيَّر بلا رمي', () => {
  it('يحمل aria-label «استبدال مؤقّت»', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    expect(panel(el).getAttribute('aria-label')).toBe('استبدال مؤقّت')
  })

  it('يُصيَّر بلا رمي حين contrast و matchCount و variableName كلّها غائبة', () => {
    expect(() =>
      mount(
        <ReplacePanel {...panelProps({ contrast: null, matchCount: null, variableName: null })} />,
      ),
    ).not.toThrow()
  })
})

/*
 * عطلُ مرآة من `ColourPanel`/`PalettePanel`/`ScalePanel` — تحت
 * `justify-content: space-between` في RTL يقع أوّل عنصر في DOM يمينًا،
 * والإطار (`125:227`) يضع «×» يسارًا والعنوان يمينًا.
 */
describe('ReplacePanel — ترتيب الرأس', () => {
  it('العنوان يسبق زرّ الإغلاق في DOM فيقع يمينًا في RTL', () => {
    const el = mount(<ReplacePanel {...panelProps()} onClose={() => undefined} />)
    const head = el.querySelector('.rasd-ov-rep-head')
    expect(head?.firstElementChild?.className).toContain('rasd-ov-rep-title')
    expect(head?.lastElementChild?.getAttribute('aria-label')).toBe('إغلاق')
  })

  it('زرّ الإغلاق يستدعي onClose، ولا يرمي بلا معاودة', () => {
    const onClose = vi.fn()
    const el = mount(<ReplacePanel {...panelProps({ onClose })} />)
    ;(el.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledOnce()

    expect(() => {
      const noClose = mount(<ReplacePanel {...panelProps()} />)
      ;(noClose.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    }).not.toThrow()
  })
})

/** قياس مباشر لـ`125:227`: «الأصلي» يمينًا (بنفسجي) و«البديل» يسارًا (فيروزي). */
describe('ReplacePanel — صفّ المقارنة', () => {
  it('الأصلي أوّلًا في DOM، والبديل ثانيًا', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const swatches = [...el.querySelectorAll('.rasd-ov-rep-swatch')]
    expect(swatches).toHaveLength(2)
    expect(swatches[0]?.textContent).toContain('الأصلي')
    expect(swatches[1]?.textContent).toContain('البديل')
  })

  it('لون كل عيّنة يمرّ عبر --rasd-ov-sample سطريًا', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const colors = [...el.querySelectorAll('.rasd-ov-rep-swatch-color')] as HTMLElement[]
    expect(colors[0]?.style.getPropertyValue('--rasd-ov-sample')).toBe('#7C3AED')
    expect(colors[1]?.style.getPropertyValue('--rasd-ov-sample')).toBe('#0EA5A3')
  })

  it('عيّنة البديل وحدها تحمل data-role=replacement — حلقة التركيز الثابتة', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const colors = [...el.querySelectorAll('.rasd-ov-rep-swatch-color')]
    expect(colors[0]?.getAttribute('data-role')).toBe('original')
    expect(colors[1]?.getAttribute('data-role')).toBe('replacement')
  })

  it('القيمتان السداسيّتان تُعرضان بحرف كبير حتى إن وصلتا صغيرًا', () => {
    const el = mount(
      <ReplacePanel {...panelProps({ originalHex: '#7c3aed', replacementHex: '#0ea5a3' })} />,
    )
    const swatches = [...el.querySelectorAll('.rasd-ov-rep-swatch')]
    expect(swatches[0]?.textContent).toContain('#7C3AED')
    expect(swatches[1]?.textContent).toContain('#0EA5A3')
  })
})

/**
 * `replace.ts` يصدّر `ReplaceScope = 'element' | 'matches' | 'variable'` —
 * ثلاث قيم بالضبط، و«التراجع/إعادة الضبط» فعل لا وضع رابع.
 */
describe('ReplacePanel — نطاق الاستبدال (ثلاثة أوضاع لا أربعة)', () => {
  it('مجموعة راديو واحدة بعنوان «نطاق الاستبدال»، وثلاثة صفوف فقط', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const group = el.querySelector('[role="radiogroup"]')
    expect(group?.getAttribute('aria-label')).toBe('نطاق الاستبدال')
    expect(group?.querySelectorAll('input[type="radio"]')).toHaveLength(3)
  })

  it('بترتيب DOM: عنصر واحد → كل العناصر المطابقة → متغيّر CSS كاملًا', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const labels = [...el.querySelectorAll('.rasd-ov-rep-scope-label')]
    expect(labels.map((l) => l.textContent)).toEqual([
      'عنصر واحد',
      'كل العناصر المطابقة',
      'متغيّر CSS كاملًا',
    ])
  })

  it('الصفّ المطابق لـscope محدَّد وحده (checked)', () => {
    const el = mount(<ReplacePanel {...panelProps({ scope: 'matches' })} />)
    const inputs = [...el.querySelectorAll('input[type="radio"]')] as HTMLInputElement[]
    expect(inputs.map((i) => i.checked)).toEqual([false, true, false])
  })

  it('النقر على صفّ «عنصر واحد» يستدعي onScopeChange(element)', () => {
    const onScopeChange = vi.fn()
    const el = mount(<ReplacePanel {...panelProps({ scope: 'matches', onScopeChange })} />)
    const inputs = [...el.querySelectorAll('input[type="radio"]')] as HTMLInputElement[]
    inputs[0]?.click()
    expect(onScopeChange).toHaveBeenCalledWith('element')
  })

  it('وصف «عنصر واحد» يقول «العنصر المحدَّد فقط» — تعميم عن «الزر» الحرفي في اللقطة', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[0]?.textContent).toContain('العنصر المحدَّد فقط')
  })
})

/**
 * `matchCount` مصدره الحقيقي `colourUsage.state.hits.length` خارج هذا
 * الملفّ — `null` قبل أوّل مسح، لا `0` (يخلط «لم يُمسح» بـ«مُسح فلم يوجد شيء»).
 */
describe('ReplacePanel — matchCount (عدّ بشري هنديّ)', () => {
  it('null قبل أوّل مسح يعرض نصًّا محايدًا لا رقمًا كاذبًا', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: null })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('لم يُحسب العدد بعد')
    expect(rows[1]?.textContent).not.toContain('٠')
  })

  it('١٤ عنصرًا — نفس نصّ اللقطة المرجعية حرفيًّا (125:293)', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: 14 })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('١٤ عنصرًا يستخدم اللون نفسه')
  })

  it('عنصر واحد بالضبط — «عنصر واحد يستخدم اللون نفسه» بلا رقم', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: 1 })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('عنصر واحد يستخدم اللون نفسه')
  })

  it('عنصران — المثنّى بلا رقم', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: 2 })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('عنصران يستخدمان اللون نفسه')
    expect(rows[1]?.textContent).not.toMatch(ARABIC_INDIC)
  })

  it('مدى ٣–١٠ — جمع «عناصر» بعدد هنديّ', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: 5 })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('٥ عناصر تستخدم اللون نفسه')
  })

  it('صفر — لا يُخلَط بحالة «لم يُحسب بعد»', () => {
    const el = mount(<ReplacePanel {...panelProps({ matchCount: 0 })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[1]?.textContent).toContain('٠ عنصرًا يستخدم اللون نفسه')
  })
})

/** `ColourVarView.origin` في `ColourPanel` سابقة مطابقة: الفجوة تُعلَن لا تُخفى. */
describe('ReplacePanel — variableName (متغيّر CSS كاملًا)', () => {
  it('null يُعطِّل الصفّ ويشرح السبب، بلا إخفائه', () => {
    const el = mount(<ReplacePanel {...panelProps({ variableName: null })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    expect(rows[2]?.getAttribute('data-disabled')).toBe('true')
    expect(rows[2]?.textContent).toContain('لا متغيّر CSS يعرّف هذا اللون')
    const input = rows[2]?.querySelector('input[type="radio"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('النقر على صفّ معطَّل لا يستدعي onScopeChange', () => {
    const onScopeChange = vi.fn()
    const el = mount(<ReplacePanel {...panelProps({ variableName: null, onScopeChange })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    ;(rows[2]?.querySelector('input[type="radio"]') as HTMLInputElement).click()
    expect(onScopeChange).not.toHaveBeenCalled()
  })

  it('اسم المتغيّر يسبق «في كل الصفحة» في DOM — ترتيب منطقي، لا انقلاب اللقطة', () => {
    const el = mount(<ReplacePanel {...panelProps({ variableName: '--color-primary' })} />)
    const rows = [...el.querySelectorAll('.rasd-ov-rep-scope-row')]
    const desc = rows[2]?.querySelector('.rasd-ov-rep-scope-desc') as HTMLElement
    expect(desc.firstElementChild?.tagName).toBe('BDI')
    expect(desc.firstElementChild?.textContent).toBe('--color-primary')
    expect(desc.lastElementChild?.textContent).toContain('في كل الصفحة')
  })

  it('اسم المتغيّر معزول بـbdi dir=ltr kind=variable', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const varValue = el.querySelector('.rasd-ov-rep-scope-desc [data-kind="variable"]')
    expect(varValue?.tagName).toBe('BDI')
    expect(varValue?.getAttribute('dir')).toBe('ltr')
  })
})

describe('ReplacePanel — شريط التباين', () => {
  it('null لا يرسم الشريط', () => {
    const el = mount(<ReplacePanel {...panelProps({ contrast: null })} />)
    expect(el.querySelector('.rasd-ov-rep-contrast')).toBeNull()
  })

  it('يعرض النسبة والشارة و«التباين مع الأبيض» من contrast جاهزة', () => {
    const el = mount(<ReplacePanel {...panelProps({ contrast: CONTRAST })} />)
    const bar = el.querySelector('.rasd-ov-rep-contrast')
    expect(bar?.textContent).toContain('4.82 : 1')
    expect(bar?.textContent).toContain('مع الأبيض')
    expect(bar?.querySelector('.rasd-ov-rep-verdict')?.textContent).toBe('AA')
    expect(bar?.querySelector('.rasd-ov-rep-verdict')?.getAttribute('data-level')).toBe('AA')
  })

  it('النسبة معزولة بـbdi dir=ltr kind=code — أرقام غربية عبر formatRatio لدى المستدعي', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const ratio = el.querySelector('.rasd-ov-rep-contrast [data-kind="code"]')
    expect(ratio?.tagName).toBe('BDI')
    expect(ratio?.getAttribute('dir')).toBe('ltr')
    expect(ratio?.textContent).toBe('4.82 : 1')
  })

  it('against نصّ حرّ من المستدعي — لا يُجمَّد داخل المكوّن', () => {
    const el = mount(
      <ReplacePanel {...panelProps({ contrast: { ...CONTRAST, against: 'مع الأسود' } })} />,
    )
    expect(el.querySelector('.rasd-ov-rep-against')?.textContent).toBe('مع الأسود')
  })
})

describe('ReplacePanel — شريط الملاحظة', () => {
  it('يعرض نصّ التحذير الثابت من اللقطة حرفيًّا', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    expect(el.querySelector('.rasd-ov-rep-note')?.textContent).toContain(
      'المعاينة مؤقتة داخل المتصفح ولا تُعدّل أي ملف في المشروع',
    )
  })
})

/*
 * قياس مباشر لزرَّي `125:227`: الأيقونة عند الحافّة اليسرى فالنصّ يسبقها في
 * DOM — يطابق زرَّي `ColourPanel` (نصّ ثم أيقونة)، يخالف `PalettePanel`/
 * `ScalePanel` (أيقونة ثم نصّ).
 */
describe('ReplacePanel — الإجراءات', () => {
  it('زرّان بالترتيب: طبّق المعاينة (بارز، يمينًا) · أعد الضبط', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-rep-actions button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['طبّق المعاينة', 'أعد الضبط'])
    expect(buttons[0]?.className).toContain('rasd-ov-rep-btn-primary')
    expect(buttons[1]?.className).not.toContain('rasd-ov-rep-btn-primary')
  })

  it('النصّ أوّل عنصر في DOM داخل كل زرّ، لا الأيقونة', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-rep-actions button')]
    for (const b of buttons) {
      expect(b.firstElementChild?.tagName).toBe('SPAN')
      expect(b.lastElementChild?.tagName).toBe('svg')
    }
  })

  it('زرّ «طبّق المعاينة» يستدعي onApply، ولا يرمي بلا معاودة', () => {
    const onApply = vi.fn()
    const el = mount(<ReplacePanel {...panelProps({ onApply })} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-rep-actions button')]
    ;(buttons[0] as HTMLButtonElement).click()
    expect(onApply).toHaveBeenCalledOnce()

    expect(() => {
      const noApply = mount(<ReplacePanel {...panelProps()} />)
      const btn = noApply.querySelectorAll('.rasd-ov-rep-actions button')[0] as HTMLButtonElement
      btn.click()
    }).not.toThrow()
  })

  it('زرّ «أعد الضبط» يستدعي onReset، ولا يرمي بلا معاودة', () => {
    const onReset = vi.fn()
    const el = mount(<ReplacePanel {...panelProps({ onReset })} />)
    const buttons = [...el.querySelectorAll('.rasd-ov-rep-actions button')]
    ;(buttons[1] as HTMLButtonElement).click()
    expect(onReset).toHaveBeenCalledOnce()

    expect(() => {
      const noReset = mount(<ReplacePanel {...panelProps()} />)
      const btn = noReset.querySelectorAll('.rasd-ov-rep-actions button')[1] as HTMLButtonElement
      btn.click()
    }).not.toThrow()
  })
})

describe('ReplacePanel — عزل الاتجاه (§3.5 البند 2)', () => {
  it('القيمتان السداسيّتان في صفّ المقارنة معزولتان بـbdi kind=color', () => {
    const el = mount(<ReplacePanel {...panelProps()} />)
    const bdis = [...el.querySelectorAll('.rasd-ov-rep-swap bdi[data-kind="color"]')]
    expect(bdis).toHaveLength(2)
    for (const b of bdis) expect(b.getAttribute('dir')).toBe('ltr')
  })
})
