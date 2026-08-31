import { describe, expect, it } from 'vitest'

import { classifyViewport, VIEWPORT_LABELS, VIEWPORT_ORDER } from '@/modules/compare/viewport'

describe('classifyViewport — النقاط الأربع المرجعية من إطار Figma 127:315', () => {
  it('375×812 (بطاقة «هاتف» في الإطار) ⇒ phone', () => {
    expect(classifyViewport(375)).toBe('phone')
  })

  it('1024×768 (بطاقة «لوحي» في الإطار) ⇒ tablet', () => {
    expect(classifyViewport(1024)).toBe('tablet')
  })

  it('1440×900 (بطاقة «سطح المكتب» في الإطار) ⇒ desktop', () => {
    expect(classifyViewport(1440)).toBe('desktop')
  })

  it('1920×1080 (بطاقة «مخصّص» في الإطار رغم كونه عرضًا شائعًا) ⇒ custom', () => {
    expect(classifyViewport(1920)).toBe('custom')
  })
})

describe('classifyViewport — الحدود', () => {
  it('767 آخر عرض في phone، 768 أوّل عرض في tablet', () => {
    expect(classifyViewport(767)).toBe('phone')
    expect(classifyViewport(768)).toBe('tablet')
  })

  it('1279 آخر عرض في tablet، 1280 أوّل عرض في desktop', () => {
    expect(classifyViewport(1279)).toBe('tablet')
    expect(classifyViewport(1280)).toBe('desktop')
  })

  it('1599 آخر عرض في desktop، 1600 أوّل عرض في custom', () => {
    expect(classifyViewport(1599)).toBe('desktop')
    expect(classifyViewport(1600)).toBe('custom')
  })

  it('عرض صفري أو سالب أو NaN يُعامَل كـphone — لا قياس أضيق ممكن', () => {
    expect(classifyViewport(0)).toBe('phone')
    expect(classifyViewport(-10)).toBe('phone')
    expect(classifyViewport(Number.NaN)).toBe('phone')
  })

  it('عرض هائل (شاشة 8K) يبقى custom — لا حدّ علوي', () => {
    expect(classifyViewport(7680)).toBe('custom')
  })
})

describe('VIEWPORT_ORDER / VIEWPORT_LABELS', () => {
  it('أربعة مقاسات فقط، مطابقة لنوع Viewport في المخطَّط', () => {
    expect(VIEWPORT_ORDER).toEqual(['custom', 'phone', 'tablet', 'desktop'])
  })

  it('كل عنصر في VIEWPORT_ORDER له تسمية عربية', () => {
    for (const v of VIEWPORT_ORDER) {
      expect(VIEWPORT_LABELS[v]).toBeTypeOf('string')
      expect(VIEWPORT_LABELS[v].length).toBeGreaterThan(0)
    }
  })
})
