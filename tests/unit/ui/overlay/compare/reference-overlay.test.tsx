import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { identityOverlayTransform, type OverlayTransform } from '@/modules/compare/overlay'
import { ReferenceOverlay, type ReferenceOverlayProps } from '@/ui/overlay'

/**
 * صورة المرجع العائمة — نفس حدّ `primitives.test.tsx`: happy-dom بلا محرّك
 * تخطيط، فما يُختبَر هنا العقد (السمات وقيم الأنماط المحسوبة في JS)، لا
 * الموضع الفعلي على الشاشة.
 */

let host: HTMLDivElement | null = null

function mount(props: Partial<ReferenceOverlayProps> = {}): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  render(
    <ReferenceOverlay
      imageUrl="blob:ref"
      transform={identityOverlayTransform}
      displayMode="opacity"
      blendMode="difference"
      opacity={100}
      splitPosition={50}
      splitAxis="vertical"
      blinkShowingLive={false}
      {...props}
    />,
    host,
  )
  return host
}

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

describe('ReferenceOverlay — يُصيَّر بلا رمي', () => {
  it('يرسم عنصر <img> بالسمات الأساسية', () => {
    const el = mount()
    const img = el.querySelector('img[data-rasd-ov="compare-reference"]')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('blob:ref')
    expect(img?.getAttribute('alt')).toBe('') // زخرفة أداة — انظر تعليل الملفّ المصدر.
  })
})

describe('التحويل — متغيّرات CSS مطابقة لحقول OverlayTransform', () => {
  it('tx/ty/rotation/scale تصل كمتغيّرات مخصَّصة', () => {
    const t: OverlayTransform = { scale: 1.5, tx: 20, ty: -10, rotation: 33 }
    const el = mount({ transform: t })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.getPropertyValue('--rasd-ov-x')).toBe('20px')
    expect(img.style.getPropertyValue('--rasd-ov-y')).toBe('-10px')
    expect(img.style.getPropertyValue('--rasd-ov-rotate')).toBe('33deg')
    expect(img.style.getPropertyValue('--rasd-ov-scale')).toBe('1.5')
  })
})

describe('الشفافية', () => {
  it('opacity يُقسَم على 100 في كل الأنماط', () => {
    const el = mount({ opacity: 40, displayMode: 'split' })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.opacity).toBe('0.4')
  })
})

describe('وضع التراكب (blend)', () => {
  it('يضبط mix-blend-mode من blendMode', () => {
    const el = mount({ displayMode: 'blend', blendMode: 'multiply' })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.mixBlendMode).toBe('multiply')
  })

  it('الأنماط الأخرى لا تضبط mix-blend-mode', () => {
    const el = mount({ displayMode: 'opacity' })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.mixBlendMode).toBe('')
  })
})

describe('وضع التقسيم (split)', () => {
  it('محور رأسي: يقصّ من اليسار — المرجع يظهر يمينًا (بند القبول الصريح: مرآة واجهتنا لا الصفحة)', () => {
    const el = mount({ displayMode: 'split', splitAxis: 'vertical', splitPosition: 43 })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.clipPath).toBe('inset(0 0 0 43%)')
  })

  it('محور أفقي: يقصّ من الأعلى', () => {
    const el = mount({ displayMode: 'split', splitAxis: 'horizontal', splitPosition: 30 })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.clipPath).toBe('inset(30% 0 0 0)')
  })

  it('موضع الفاصل يُحصَر بين 0 و100 حتى لو وصل مُشوَّهًا', () => {
    const el = mount({ displayMode: 'split', splitPosition: 150 })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.clipPath).toBe('inset(0 0 0 100%)')
  })

  it('الأنماط الأخرى لا تضبط clip-path', () => {
    const el = mount({ displayMode: 'blend' })
    const img = el.querySelector('img') as HTMLElement
    expect(img.style.clipPath).toBe('')
  })
})

describe('وضع الوميض (blink)', () => {
  it('blinkShowingLive=false: المرجع يظهر', () => {
    const el = mount({ displayMode: 'blink', blinkShowingLive: false })
    expect(el.querySelector('img')).toBeTruthy()
  })

  it('blinkShowingLive=true: المرجع يختفي كليًا — لا style.display وحدها', () => {
    const el = mount({ displayMode: 'blink', blinkShowingLive: true })
    expect(el.querySelector('img')).toBeNull()
  })

  it('blinkShowingLive في غير وضع blink لا أثر له', () => {
    const el = mount({ displayMode: 'opacity', blinkShowingLive: true })
    expect(el.querySelector('img')).toBeTruthy()
  })
})
