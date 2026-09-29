import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { REPO_URL, SHOW_REPO_LINK, SITE_URL } from '@/shared/links'
import { Footer } from '@/ui/components/Footer/Footer'

/**
 * التذييل — معيار قبول في `STAGES/03`: النصّ والرابطان و`rel`، ورابط المستودع غائب
 * حين يكون ثابت البناء «مخفيّ». المستودع خاصّ اليوم، ورابطه يعطي زائرًا غير مسجَّل 404
 * — ولا يُعرض في الواجهة رابط يعطي 404 (`AGENTS.md` §7).
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

const linkTo = (el: HTMLElement, href: string): HTMLAnchorElement | null =>
  el.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)

describe('Footer', () => {
  it('النصّ «تصميم وتطوير: سلطان» ورابط الموقع بتبويب جديد وrel آمن', () => {
    const el = mount(<Footer />)
    expect(el.textContent).toContain('تصميم وتطوير: سلطان')
    const site = linkTo(el, SITE_URL)
    expect(SITE_URL).toBe('https://www.bysltan.com')
    expect(site?.textContent).toBe('bysltan.com')
    expect(site?.getAttribute('target')).toBe('_blank')
    expect(site?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('ثابت البناء مخفيّ افتراضيًّا، فلا رابط للمستودع بلا تمرير صريح', () => {
    expect(SHOW_REPO_LINK).toBe(false)
    const el = mount(<Footer />)
    expect(linkTo(el, REPO_URL)).toBeNull()
    expect(el.querySelectorAll('a')).toHaveLength(1)
  })

  it('حين يُظهَر: رابط المستودع بتبويب جديد وrel آمن', () => {
    const el = mount(<Footer showRepo />)
    const repo = linkTo(el, REPO_URL)
    expect(REPO_URL).toBe('https://github.com/iSltanX/rasd')
    expect(repo?.textContent).toBe('المستودع')
    expect(repo?.getAttribute('target')).toBe('_blank')
    expect(repo?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('المخفيّ صراحةً يبقى مخفيًّا في التخطيطين', () => {
    for (const layout of ['inline', 'stacked'] as const) {
      const el = mount(<Footer layout={layout} showRepo={false} />)
      expect(linkTo(el, REPO_URL)).toBeNull()
      render(null, el)
      el.remove()
      host = null
    }
  })
})
