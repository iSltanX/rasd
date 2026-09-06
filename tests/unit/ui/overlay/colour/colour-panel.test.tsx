/**
 * لوحة اللون — الكتلتان اللتان أجّلتهما المرحلة 13 إلى 14.
 *
 * ما يُحرَس هنا ثلاثة: أن الكتلتين **اختياريتان** فلا تنكسر الاستدعاءات
 * القديمة، وأن حالات المسح الثلاث متمايزة (قبل · أثناء · بعد)، وأن العدّ
 * بشريٌّ بأرقام هندية كما يفرض نصّ `§17` لهذه المرحلة صراحةً.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ColourPanel, type ColourPanelProps } from '@/ui/overlay/colour/ColourPanel'

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

const BASE: ColourPanelProps = {
  hex: '#7C3AED',
  swatch: 'rgb(124, 58, 237)',
  rows: [{ label: 'HEX', shown: '#7C3AED', copy: '#7C3AED' }],
  variable: null,
  contrast: null,
}

const ARABIC_INDIC = /[٠-٩]/u

describe('ColourPanel — كتلة «العناصر التي تستخدم اللون»', () => {
  it('بلا `usage` ولا `onScanUsage`: لا كتلة إطلاقًا — لا صفر كاذب', () => {
    const el = mount(<ColourPanel {...BASE} />)
    expect(el.querySelector('[data-rasd-ov="colour-usage"]')).toBeNull()
  })

  it('قبل المسح: زرّ يدعو إليه، بلا عدد', () => {
    const el = mount(<ColourPanel {...BASE} onScanUsage={() => undefined} />)
    const block = el.querySelector('[data-rasd-ov="colour-usage"]')
    expect(block?.textContent).toContain('أظهر العناصر التي تستخدمه')
    expect(block?.textContent).not.toMatch(ARABIC_INDIC)
  })

  it('أثناء المسح: تقدّم وإيقاف، لا رقم نهائي', () => {
    const onCancelScan = vi.fn()
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{ total: 0, current: null, scanning: true, progress: 0.42 }}
        onCancelScan={onCancelScan}
      />,
    )
    const block = el.querySelector('[data-rasd-ov="colour-usage"]')
    expect(block?.textContent).toContain('جارٍ المسح')
    // النسبة قياسٌ تقني فبأرقام غربية (`§3.5`)، ولذلك 42% لا ٤٢٪.
    expect(block?.textContent).toContain('42%')
    block?.querySelector('button')?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onCancelScan).toHaveBeenCalled()
  })

  it('بعد المسح: العدّ بشريٌّ بأرقام هندية ومصرَّفٌ عربيًّا', () => {
    const el = mount(
      <ColourPanel {...BASE} usage={{ total: 14, current: null, scanning: false, progress: 1 }} />,
    )
    const text = el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent ?? ''
    expect(text).toContain('يستخدمه')
    expect(text).toMatch(ARABIC_INDIC)
    expect(text).not.toMatch(/\b14\b/u)
  })

  it('المثنّى بلا رقم — «عنصران» لا «٢ عنصر»', () => {
    const el = mount(
      <ColourPanel {...BASE} usage={{ total: 2, current: null, scanning: false, progress: 1 }} />,
    )
    const text = el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent ?? ''
    expect(text).toContain('عنصران')
    expect(text).not.toMatch(ARABIC_INDIC)
  })

  /*
   * «مُسح فلم يوجد» ≠ «لم يُمسح بعد». خلطهما كان سيقول «لا عنصر يستخدمه»
   * عن لون لم يُبحَث عنه أصلًا.
   */
  it('مسحٌ بلا نتيجة يقول ذلك صراحةً — لا يعود إلى حالة ما قبل المسح', () => {
    const el = mount(
      <ColourPanel {...BASE} usage={{ total: 0, current: null, scanning: false, progress: 1 }} />,
    )
    const text = el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent ?? ''
    expect(text).toContain('لا عنصر يستخدمه')
    expect(text).not.toContain('أظهر العناصر')
  })

  it('التنقّل يظهر مع نتائج فقط، ويُبلّغ الاتجاه', () => {
    const onStepUsage = vi.fn()
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{ total: 3, current: 0, scanning: false, progress: 1 }}
        onStepUsage={onStepUsage}
      />,
    )
    const nav = el.querySelector('.rasd-ov-cp-usage-nav')
    expect(nav).not.toBeNull()
    const buttons = [...(nav?.querySelectorAll('button') ?? [])]
    expect(buttons).toHaveLength(2)
    buttons[1]?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onStepUsage).toHaveBeenCalledWith(1)
  })

  it('لا تنقّل حين لا نتائج — سهمان فوق صفر لا معنى لهما', () => {
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{ total: 0, current: null, scanning: false, progress: 1 }}
        onStepUsage={() => undefined}
      />,
    )
    expect(el.querySelector('.rasd-ov-cp-usage-nav')).toBeNull()
  })
})

describe('ColourPanel — زرّ «جرّب بديلًا» (§6.11)', () => {
  it('غائب بلا معاودة — لا زرّ يَعِد بما لا يوجد', () => {
    const el = mount(<ColourPanel {...BASE} />)
    expect(el.textContent).not.toContain('جرّب بديلًا')
  })

  it('حاضرٌ مع معاودته، ويُبلّغ النقر', () => {
    const onReplace = vi.fn()
    const el = mount(<ColourPanel {...BASE} onReplace={onReplace} />)
    const btn = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('جرّب بديلًا'),
    )
    expect(btn).toBeDefined()
    btn?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onReplace).toHaveBeenCalled()
  })

  it('لا يزاحم «حفظ» — كلاهما في صفّ الإجراءات', () => {
    const el = mount(<ColourPanel {...BASE} onReplace={() => undefined} />)
    const actions = el.querySelector('.rasd-ov-cp-actions')
    expect(actions?.querySelectorAll('button')).toHaveLength(2)
  })
})
