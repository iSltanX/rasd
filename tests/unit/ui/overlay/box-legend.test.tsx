/**
 * مفتاح نموذج الصندوق تحت العنصر المفحوص (`62:2`): أربعة ألوان بأسمائها بترتيب القراءة، من الخارج
 * إلى الداخل كما تتداخل الصناديق.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { BoxLegend } from '@/ui/overlay'

let host: HTMLDivElement | null = null

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

describe('BoxLegend', () => {
  it('الهامش · الحدّ · الحشوة · المحتوى، ولكلٍّ لون صندوقه', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    render(<BoxLegend at={{ x: 10, y: 20 }} />, host)
    const keys = [...host.querySelectorAll('[data-part]')]
    expect(keys.map((k) => k.textContent)).toEqual(['الهامش', 'الحدّ', 'الحشوة', 'المحتوى'])
    expect(keys.map((k) => k.getAttribute('data-part'))).toEqual([
      'margin',
      'border',
      'padding',
      'content',
    ])
  })
})
