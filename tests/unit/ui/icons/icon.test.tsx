import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { Icon } from '@/ui/icons/Icon'

/**
 * `Icon` واسم الإتاحة — عطل حقيقي أُثبت ثم أُصلح: `dangerouslySetInnerHTML`
 * و children لا يجتمعان على نفس عنصر الـsvg في Preact، فالأول يبتلع الثاني
 * بصمت. حين كان الاسم يُمرَّر عبر `<title>` كابن، لم يكن يُرسَم في الـDOM
 * إطلاقًا رغم أن `role="img"` يوحي بأن الأيقونة معلوماتية — انظر
 * `src/ui/icons/Icon.tsx`.
 */

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

describe('Icon — اسم الإتاحة', () => {
  it('بلا title: زخرفية — aria-hidden، بلا role وبلا aria-label', () => {
    const el = mount(<Icon name="star" />).querySelector('svg')
    expect(el?.getAttribute('aria-hidden')).toBe('true')
    expect(el?.hasAttribute('role')).toBe(false)
    expect(el?.hasAttribute('aria-label')).toBe(false)
  })

  it('مع title: يظهر فعليًا كـaria-label على الـsvg نفسه — لا يُبتلع', () => {
    const el = mount(<Icon name="star" title="مفضَّلة" />).querySelector('svg')
    expect(el?.getAttribute('role')).toBe('img')
    expect(el?.getAttribute('aria-label')).toBe('مفضَّلة')
    expect(el?.hasAttribute('aria-hidden')).toBe(false)
  })

  it('markup الأيقونة يُعرض رغم وجود title — لا تعارض بين dangerouslySetInnerHTML والاسم', () => {
    const el = mount(<Icon name="star" title="مفضَّلة" />).querySelector('svg')
    expect(el?.querySelector('path')).not.toBeNull()
  })
})
