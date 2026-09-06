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

/*
 * عطلُ مرآة من المرحلة 13، قِيس في Chrome: تحت `space-between` في سياق RTL
 * يقع أوّلُ عنصر في DOM **يمينًا**. فترتيب «الإغلاق ثمّ العنوان» كان يرسم
 * «×» يمينًا، والإطار `65:55` يضع العكس.
 */
describe('ColourPanel — ترتيب الرأس', () => {
  it('العنوان يسبق زرّ الإغلاق في DOM فيقع يمينًا في RTL', () => {
    const el = mount(<ColourPanel {...BASE} onClose={() => undefined} />)
    const head = el.querySelector('.rasd-ov-cp-head')
    expect(head?.firstElementChild?.className).toContain('rasd-ov-cp-title')
    expect(head?.lastElementChild?.getAttribute('aria-label')).toBe('إغلاق')
  })
})

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
        usage={{ total: 0, rows: [], scanning: true, progress: 0.42 }}
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
      <ColourPanel {...BASE} usage={{ total: 14, rows: [], scanning: false, progress: 1 }} />,
    )
    const text = el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent ?? ''
    expect(text).toContain('يستخدمه')
    expect(text).toMatch(ARABIC_INDIC)
    expect(text).not.toMatch(/\b14\b/u)
  })

  it('المثنّى بلا رقم — «عنصران» لا «٢ عنصر»', () => {
    const el = mount(
      <ColourPanel {...BASE} usage={{ total: 2, rows: [], scanning: false, progress: 1 }} />,
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
      <ColourPanel {...BASE} usage={{ total: 0, rows: [], scanning: false, progress: 1 }} />,
    )
    const text = el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent ?? ''
    expect(text).toContain('لا عنصر يستخدمه')
    expect(text).not.toContain('أظهر العناصر')
  })

  it('«أبرِز الكل» يظهر مع نتائج فقط ويُبلّغ النقر', () => {
    const onHighlightAll = vi.fn()
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{ total: 3, rows: [], scanning: false, progress: 1 }}
        onHighlightAll={onHighlightAll}
      />,
    )
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent === 'أبرِز الكل')
    expect(btn).toBeDefined()
    btn?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onHighlightAll).toHaveBeenCalled()
  })

  it('لا «أبرِز الكل» فوق صفر — زرٌّ بلا ما يُبرزه', () => {
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{ total: 0, rows: [], scanning: false, progress: 1 }}
        onHighlightAll={() => undefined}
      />,
    )
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'أبرِز الكل')).toBe(
      false,
    )
  })

  /*
   * الإطار `65:55` يعرض ثلاثة صفوف لأربعة عشر عنصرًا — فالقائمة **عيّنة**
   * والعدّاد هو الحقيقة. والمكوّن يعرض ما وصله ولا يقصّ بنفسه.
   */
  it('يعرض قائمة العناصر بمحدِّداتها وخصائصها — لا عدّادًا وحده', () => {
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{
          total: 14,
          rows: [
            { selector: 'button.cta-btn', property: 'background-color' },
            { selector: 'a.nav-cta', property: 'background-color' },
            { selector: 'span.badge', property: 'color' },
          ],
          scanning: false,
          progress: 1,
        }}
      />,
    )
    const rows = el.querySelectorAll('.rasd-ov-cp-usage-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('button.cta-btn')
    expect(rows[0]?.textContent).toContain('background-color')
    expect(el.querySelector('[data-rasd-ov="colour-usage"]')?.textContent).toContain('١٤')
  })

  it('كل محدِّد وخاصية معزولان اتجاهيًّا — لا مقطع لاتيني عارٍ في RTL', () => {
    const el = mount(
      <ColourPanel
        {...BASE}
        usage={{
          total: 1,
          rows: [{ selector: 'button.cta-btn', property: 'color' }],
          scanning: false,
          progress: 1,
        }}
      />,
    )
    const row = el.querySelector('.rasd-ov-cp-usage-row')
    expect(row?.querySelectorAll('bdi[data-technical]')).toHaveLength(2)
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

  it('هو البارز و«حفظ» ثانوي — كما يرسمهما `65:55`', () => {
    const el = mount(<ColourPanel {...BASE} onReplace={() => undefined} />)
    const buttons = [...(el.querySelector('.rasd-ov-cp-actions')?.querySelectorAll('button') ?? [])]
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.textContent).toContain('جرّب بديلًا')
    expect(buttons[0]?.className).toContain('rasd-ov-cp-btn-primary')
    expect(buttons[1]?.className).not.toContain('rasd-ov-cp-btn-primary')
  })

  it('وحيث لا استبدال يَرِث «حفظ» البروز — لا زرّ وحيد يقرأ معطَّلًا', () => {
    const el = mount(<ColourPanel {...BASE} />)
    const buttons = [...(el.querySelector('.rasd-ov-cp-actions')?.querySelectorAll('button') ?? [])]
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.className).toContain('rasd-ov-cp-btn-primary')
  })
})
