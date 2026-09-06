import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ViewportGallery, type ViewportGalleryCard } from '@/ui/overlay'

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

const FILLED_CARD: ViewportGalleryCard = {
  viewport: 'desktop',
  image: { url: 'blob:x', naturalWidth: 1440, naturalHeight: 900 },
  diffRatio: null,
}

describe('ViewportGallery — يُصيَّر بلا رمي', () => {
  it('يرسم أربع بطاقات دومًا — واحدة لكل مقاس، بمرجع محفوظ أو بلا', () => {
    const el = mount(<ViewportGallery cards={[FILLED_CARD]} />)
    expect(el.querySelectorAll('[data-rasd-ov="viewport-card"]')).toHaveLength(4)
  })

  it('بطاقة بمرجع محفوظ تعرض الصورة والأبعاد الطبيعية', () => {
    const el = mount(<ViewportGallery cards={[FILLED_CARD]} />)
    const img = el.querySelector('img')
    expect(img?.getAttribute('src')).toBe('blob:x')
    expect(el.textContent).toContain('1440 × 900')
  })

  it('بطاقة بلا مرجع تعرض منطقة إفلات لا صورة', () => {
    const el = mount(<ViewportGallery cards={[]} />)
    expect(el.querySelectorAll('img')).toHaveLength(0)
    expect(el.querySelectorAll('[data-drag-over]').length).toBeGreaterThan(0)
  })

  it('بطاقة بلا فرق مقيس تبقى «لم يُقارَن» + «—» — لا رقم يُخترَع لمقاس لم يُقَس', () => {
    const el = mount(<ViewportGallery cards={[FILLED_CARD]} />)
    const chips = el.querySelectorAll('.rasd-ov-vpg-chip')
    expect(chips).toHaveLength(4)
    for (const chip of chips) expect(chip.textContent).toBe('لم يُقارَن')
    expect(el.querySelectorAll('.rasd-ov-vpg-pct')).toHaveLength(4)
    for (const pct of el.querySelectorAll('.rasd-ov-vpg-pct')) expect(pct.textContent).toBe('—')
  })

  /**
   * سدادُ دَيْن المرحلة 16: النسبة والرقاقة الدلالية كانتا مُستبعَدتين
   * لغياب محرّك `pixelmatch`، والمحرّك قائم الآن في الخلفية.
   */
  it('بطاقة مقيسة تعرض النسبة بأرقام غربية ورقاقة دلالية', () => {
    const el = mount(<ViewportGallery cards={[{ ...FILLED_CARD, diffRatio: 0.079 }]} />)
    const card = el.querySelector('[aria-label="سطح المكتب"]')
    expect(card?.querySelector('.rasd-ov-vpg-pct')?.textContent).toBe('7.9%')
    const chip = card?.querySelector('.rasd-ov-vpg-chip')
    expect(chip?.textContent).toBe('فروق كبيرة')
    expect(chip?.getAttribute('data-status')).toBe('major')
  })

  it('البطاقات الأخرى تبقى «لم يُقارَن» حين تُقاس واحدة وحدها', () => {
    const el = mount(<ViewportGallery cards={[{ ...FILLED_CARD, diffRatio: 0.079 }]} />)
    const chips = [...el.querySelectorAll('.rasd-ov-vpg-chip')].map((c) => c.textContent)
    expect(chips.filter((t) => t === 'لم يُقارَن')).toHaveLength(3)
  })

  it('فرقٌ صفريّ يعرض «مطابق» و0% لا «لم يُقارَن»', () => {
    const el = mount(<ViewportGallery cards={[{ ...FILLED_CARD, diffRatio: 0 }]} />)
    const card = el.querySelector('[aria-label="سطح المكتب"]')
    expect(card?.querySelector('.rasd-ov-vpg-chip')?.textContent).toBe('مطابق')
    expect(card?.querySelector('.rasd-ov-vpg-pct')?.textContent).toBe('0%')
  })

  it('زرّ الإغلاق يستدعي onClose', () => {
    const onClose = vi.fn()
    const el = mount(<ViewportGallery cards={[]} onClose={onClose} />)
    const btn = el.querySelector<HTMLButtonElement>('[aria-label="إغلاق"]')
    btn?.click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('إفلات صورة على بطاقة فارغة يستدعي onDropImage بالمقاس الصحيح', () => {
    const onDropImage = vi.fn()
    const el = mount(<ViewportGallery cards={[]} onDropImage={onDropImage} />)
    const zone = el.querySelector('[aria-label="هاتف"] .rasd-ov-vpg-thumb-empty') as HTMLElement
    expect(zone).toBeTruthy()
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    const dataTransfer = { files: [file] } as unknown as DataTransfer
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }))
    expect(onDropImage).toHaveBeenCalledWith('phone', file)
  })
})
