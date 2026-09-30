/**
 * معاينة طبقة الالتقاط — `src/pages/capture-preview/`: أداة مقارنة بصرية مع إطار Figma
 * `capture / area-select` تشغّلها الحرّاس، فتُثبَّت هنا هندستها المقيسة وقراءتها للسمة من العنوان.
 */
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CapturePreview } from '@/pages/capture-preview/CapturePreview'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = null
  }
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
  vi.resetModules()
})

describe('CapturePreview — الحالات الأربع', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => render(<CapturePreview />, container!))
  })

  it('أربعة مسارح بعناوينها: التحديد القائم والسحب وما قبل السحب والعدّاد', () => {
    const captions = [...container!.querySelectorAll('figcaption')].map((c) => c.textContent)

    expect(captions).toHaveLength(4)
    expect(captions[0]).toContain('تحديد قائم')
    expect(captions[1]).toContain('أثناء السحب')
    expect(captions[2]).toContain('قبل أوّل سحب')
    expect(captions[3]).toContain('العدّاد')
  })

  it('كل مسرح يضع الصفحة المضيفة والطبقة شقيقتين لا متداخلتين', () => {
    for (const stage of container!.querySelectorAll('.stage')) {
      expect(stage.querySelector(':scope > .mock')).not.toBeNull()
      expect(stage.querySelector(':scope > .rasd-ov-layer')).not.toBeNull()
      expect(stage.querySelector('.mock .rasd-ov-layer')).toBeNull()
    }
  })

  it('التحديد القائم يحمل نسبته بهندسة الإطار 768×336 كما قِيست', () => {
    const first = container!.querySelectorAll('.stage')[0]!
    expect(first.textContent).toMatch(/768/)
    expect(first.textContent).toMatch(/336/)
  })

  it('مسرح السحب بلا مقابض، ومسرح التحديد القائم بمقابضه', () => {
    const stages = container!.querySelectorAll('.stage')
    const handles = (s: Element) => s.querySelectorAll('[data-handle], [class*="handle"]').length

    expect(handles(stages[0]!)).toBeGreaterThan(0)
    expect(handles(stages[1]!)).toBe(0)
  })
})

describe('main — نقطة الدخول', () => {
  function withRoot(): HTMLDivElement {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    return root
  }

  it('?theme=light يكتب السمة على الجذر ويركّب المعاينة', async () => {
    const root = withRoot()
    window.history.replaceState(null, '', '/?theme=light')

    await import('@/pages/capture-preview/main')

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(root.querySelectorAll('figcaption')).toHaveLength(4)
  })

  it('?theme=dark كذلك', async () => {
    withRoot()
    window.history.replaceState(null, '', '/?theme=dark')

    await import('@/pages/capture-preview/main')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('قيمة غير معروفة للسمة تُتجاهَل فلا تُكتب سمة عشوائية على الجذر', async () => {
    withRoot()
    window.history.replaceState(null, '', '/?theme=neon')

    await import('@/pages/capture-preview/main')

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('بلا #root لا يرمي ولا يركّب شيئًا', async () => {
    await expect(import('@/pages/capture-preview/main')).resolves.toBeDefined()
    expect(document.querySelector('figcaption')).toBeNull()
  })
})
