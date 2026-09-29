import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { MARK_SYMBOL } from '@/ui/mark-geometry'
import { RasdLockup, RasdMark } from '@/ui/RasdMark'

/**
 * `RasdMark` يختار القصّ من المقاس لا من المستدعي، ويترك اللون لـ`base.css`.
 * القصّ الخاطئ عند 20 بكسل يعني حلقة تُقرأ مغلقة — قِيس في `Docs/Brand/tests/07-cuts.png`.
 */

let host: HTMLDivElement | null = null

function mount(ui: preact.ComponentChild): SVGSVGElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  render(ui, host)
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('لم يُرسم svg')
  return svg
}

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

const dOf = (svg: SVGSVGElement, cls: string): string | null =>
  svg.querySelector(`.${cls}`)?.getAttribute('d') ?? null

describe('RasdMark — القصّ والدرجة والمقاس', () => {
  it('عند 20 بكسل (md) يرسم القصّ الصغير، وعند 40 (2xl) العادي', () => {
    const md = mount(<RasdMark size="md" />)
    expect(md.getAttribute('data-cut')).toBe('small')
    expect(dOf(md, 'rasd-mark-ring')).toBe(MARK_SYMBOL.small.ring)
    render(null, host!)
    host!.remove()
    host = null

    const xl = mount(<RasdMark size="2xl" />)
    expect(xl.getAttribute('data-cut')).toBe('regular')
    expect(dOf(xl, 'rasd-mark-ring')).toBe(MARK_SYMBOL.regular.ring)
    expect(dOf(xl, 'rasd-mark-nuqta')).toBe(MARK_SYMBOL.regular.nuqta)
  })

  it('المقاس صنف من سلّم icon/* والدرجة الافتراضية adaptive بلا لون مضمَّن', () => {
    const svg = mount(<RasdMark size="lg" />)
    expect(svg.getAttribute('class')).toContain('rasd-mark-lg')
    expect(svg.getAttribute('data-tone')).toBe('adaptive')
    expect(svg.innerHTML).not.toMatch(/fill=|#[0-9a-f]{3,8}/i)
  })

  it('بلا عنوان زخرفة مخفيّة، ومع العنوان صورة مسمّاة', () => {
    expect(mount(<RasdMark />).getAttribute('aria-hidden')).toBe('true')
    render(null, host!)
    host!.remove()
    host = null
    const named = mount(<RasdMark title="رصد" />)
    expect(named.getAttribute('role')).toBe('img')
    expect(named.querySelector('title')?.textContent).toBe('رصد')
  })

  it('القفل: الكتابة ثم الرمز، بنسبة القفل لا مربّعًا', () => {
    const svg = mount(<RasdLockup size="xl" />)
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect((w ?? 0) / (h ?? 1)).toBeCloseTo(3.409, 2)
    expect(svg.querySelector('.rasd-mark-word')).not.toBeNull()
    expect(svg.querySelector('.rasd-mark-ring')).not.toBeNull()
  })
})
