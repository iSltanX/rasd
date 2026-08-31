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

  it('كل بطاقة تعرض رقاقة «لم يُقارَن» و«—» — لا نسبة فرق محسوبة هنا', () => {
    const el = mount(<ViewportGallery cards={[FILLED_CARD]} />)
    const chips = el.querySelectorAll('.rasd-ov-vpg-chip')
    expect(chips).toHaveLength(4)
    for (const chip of chips) expect(chip.textContent).toBe('لم يُقارَن')
    expect(el.querySelectorAll('.rasd-ov-vpg-pct')).toHaveLength(4)
    for (const pct of el.querySelectorAll('.rasd-ov-vpg-pct')) expect(pct.textContent).toBe('—')
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
