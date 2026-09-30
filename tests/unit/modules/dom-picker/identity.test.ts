import { afterEach, describe, expect, it } from 'vitest'

import {
  fingerprintOf,
  fnv1a,
  identify,
  refind,
  sameFingerprint,
} from '@/modules/dom-picker/identity'

/**
 * هوية العنصر وإعادة العثور بحكمٍ مسمًّى (ADR 0031): المحدِّد يجد، والبصمة تقول إن كان هو.
 */

afterEach(() => {
  document.body.innerHTML = ''
})

function mount(html: string): void {
  document.body.innerHTML = html
}

const $ = (selector: string): Element => {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`لا عنصر ${selector}`)
  return el
}

describe('refind', () => {
  it('العنصر نفسه بعد تغيّر موضعه وأصنافه ومقاسه: موجود', () => {
    mount('<main><button id="buy" data-cta class="a">اشترِ الآن</button></main>')
    const identity = identify($('#buy'))
    expect(identity.selector).toBe('#buy')

    const el = $('#buy') as HTMLElement
    el.className = 'b c'
    el.style.padding = '40px'
    document.body.prepend(document.createElement('header'))

    const found = refind(identity, document)
    expect(found.kind).toBe('found')
    expect(found.kind === 'found' && found.el).toBe(el)
  })

  it('العنصر حُذف ⟵ not-found بسبب الغياب', () => {
    mount('<main><button id="buy">اشترِ</button></main>')
    const identity = identify($('#buy'))
    $('#buy').remove()
    expect(refind(identity, document)).toEqual({ kind: 'not-found', reason: 'missing' })
  })

  it('المحدِّد صار يطابق عنصرًا آخر ⟵ changed', () => {
    // محدِّدٌ موضعي: البطاقة الثانية. تُحذف الأولى فيصير «الثاني» بطاقةً أخرى نصّها مختلف.
    mount(
      '<ul><li><p>أوّل</p></li><li><p>ثانٍ</p></li><li><p>ثالث</p></li></ul>'.replaceAll(
        '<li>',
        '<li class="card">',
      ),
    )
    const second = document.querySelectorAll('li')[1] as Element
    const identity = identify(second)
    expect(identity.positional || identity.selector.includes('nth')).toBe(true)

    document.querySelector('li')?.remove()
    const verdict = refind(identity, document)
    expect(verdict.kind).toBe('changed')
    expect(verdict.kind === 'changed' && verdict.el.textContent).toBe('ثالث')
  })

  it('المحدِّد يطابق أكثر من عنصر ⟵ multiple بعددها', () => {
    mount('<button class="primary">أ</button>')
    const identity = identify($('.primary'))
    document.body.insertAdjacentHTML('beforeend', '<button class="primary">أ</button>')
    expect(refind(identity, document)).toEqual({ kind: 'multiple', count: 2 })
  })

  it('مضيف الطبقة لا يُعدّ مطابقًا ثانيًا', () => {
    mount('<button class="primary">أ</button><button class="primary">أ</button>')
    const [first, overlay] = Array.from(document.querySelectorAll('.primary'))
    const identity = { ...identify(first as Element), selector: '.primary' }
    expect(refind(identity, document, overlay).kind).toBe('found')
  })

  it('محدِّدٌ لم يعد صالحًا لا يرمي', () => {
    mount('<button id="buy">أ</button>')
    const identity = { ...identify($('#buy')), selector: 'button[' }
    expect(refind(identity, document)).toEqual({ kind: 'not-found', reason: 'invalid-selector' })
  })
})

describe('الظلّ', () => {
  function shadowHost(mode: 'open' | 'closed'): { host: Element; inner: Element } {
    mount('<x-card id="card"></x-card>')
    const host = $('#card')
    const root = host.attachShadow({ mode })
    root.innerHTML = '<span class="price">٩٩</span>'
    const inner = root.querySelector('.price') as Element
    return { host, inner }
  }

  it('تُحفظ سلسلة المضيفين ويُعاد العثور درجةً درجة', () => {
    const { inner } = shadowHost('open')
    const identity = identify(inner)
    expect(identity.inShadow).toBe(true)
    expect(identity.hosts).toEqual(['#card'])
    const found = refind(identity, document)
    expect(found.kind === 'found' && found.el).toBe(inner)
  })

  it('المضيف غاب ⟵ not-found بسببه', () => {
    const { host, inner } = shadowHost('open')
    const identity = identify(inner)
    host.remove()
    expect(refind(identity, document)).toEqual({ kind: 'not-found', reason: 'host-missing' })
  })

  it('جذرٌ مغلق لا طريق إليه ⟵ unreachable', () => {
    const { inner } = shadowHost('closed')
    const identity = identify(inner)
    expect(refind(identity, document)).toEqual({ kind: 'unreachable' })
  })
})

describe('البصمة', () => {
  it('أسماء السمات الثابتة وحدها، مرتّبة، بلا قيمها', () => {
    mount(
      '<button id="buy" data-cta="primary" aria-label="اشترِ الآن" aria-expanded="true" class="x" style="color:red" disabled onclick="void 0">اشترِ</button>',
    )
    const print = fingerprintOf($('#buy'))
    expect(print.tag).toBe('button')
    expect(print.attrs).toEqual(['aria-label', 'data-cta', 'id'])
    expect(JSON.stringify(print)).not.toContain('primary')
  })

  it('النصّ الخام لا يُحفظ — بصمته وطوله بعد طيّ المسافات', () => {
    mount('<p id="t">  مرحبا\n   بالعالم  </p>')
    const print = fingerprintOf($('#t'))
    expect(print.textLength).toBe('مرحبا بالعالم'.length)
    expect(print.textHash).toBe(fnv1a('مرحبا بالعالم'))
    expect(JSON.stringify(identify($('#t')))).not.toContain('مرحبا')
  })

  it('تبدّل الحالة لا يغيّر البصمة، وتغيّر الوسم أو النصّ يغيّرها', () => {
    mount('<button id="b" aria-pressed="false">حفظ</button>')
    const before = fingerprintOf($('#b'))
    $('#b').setAttribute('aria-pressed', 'true')
    $('#b').setAttribute('disabled', '')
    expect(sameFingerprint(before, fingerprintOf($('#b')))).toBe(true)

    $('#b').textContent = 'احفظ'
    expect(sameFingerprint(before, fingerprintOf($('#b')))).toBe(false)
    expect(sameFingerprint(before, { ...before, tag: 'a' })).toBe(false)
    expect(sameFingerprint(before, { ...before, attrs: [...before.attrs, 'role'] })).toBe(false)
  })

  it('FNV-1a بقيمه المرجعية', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
  })
})
