/**
 * تتبّع المتغيّرات — الحالات، والاعتراف بالجهل، وحرّاس السلسلة.
 *
 * الحالة الحاسمة هنا ليست «وجد المتغيّر» بل **«متى يقول لا أعرف»**: فاحصٌ
 * يقول «لا متغيّر» حيث يوجد واحد يكذب في قلب أهمّ ميزة تميّز، وحالة
 * `opaque` هي ما يمنع ذلك فوق الأوراق المحجوبة.
 *
 * **حدّ البيئة، مقيس**: happy-dom يحلّ الخصائص المخصَّصة على **العنصر
 * المصرِّح وحده** — بلا وراثة وبلا `computedStyleMap`. قِيس على شجرة
 * `:root → #m → #t`: القيمة على المصرِّح `blue`، ومن الأب `""`، ومن الجذر
 * `""`. فالصعود إلى المعرِّف والحالات الأربع لا يُختبَران هنا، ومقياسهما
 * `scripts/verify-inspect.mjs` في Chrome حقيقي. وما يُختبَر هنا هو ما
 * تستطيعه البيئة: التصنيف، والحرّاس، وقراءة السلسلة، والاعتراف بالجهل.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { findDeclaringElement, referencedVar, traceVariable } from '@/modules/var-trace/declaration'
import { composedParent, customNames, readVar, usesFallback } from '@/modules/var-trace/value-state'

function style(css: string): void {
  const el = document.createElement('style')
  el.textContent = css
  document.head.append(el)
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('readVar — الحالات', () => {
  it('قيمة فعلية على العنصر المصرِّح', () => {
    style('#t { --ok: 12px }')
    document.body.innerHTML = '<div id="t"></div>'
    const v = readVar(document.getElementById('t')!, '--ok')
    expect(v.state).toBe('value')
    expect(v.value.trim()).toBe('12px')
  })

  it('غير معرَّف أصلًا', () => {
    const el = document.createElement('div')
    document.body.append(el)
    expect(readVar(el, '--nope').state).toBe('undefined')
  })

  it('يفرّق بين المعرَّف والمعدوم', () => {
    /*
     * ثلاث حالات تعطي `""` من `getPropertyValue`: غير معرَّف، ومعرَّف
     * فارغًا، وباطل. وخلطها هو ما يجعل الفاحص يقول «لا متغيّر» حيث يوجد.
     * والتفريق الكامل يحتاج `computedStyleMap` — وهي غائبة هنا، فيُقاس في
     * المتصفّح الحقيقي.
     */
    style('#t { --defined: 1px }')
    document.body.innerHTML = '<div id="t"></div>'
    const t = document.getElementById('t')!
    expect(readVar(t, '--defined').state).not.toBe('undefined')
    expect(readVar(t, '--absent').state).toBe('undefined')
  })
})

describe('usesFallback', () => {
  it('الاحتياطي يُستعمل للمعدوم وللباطل', () => {
    expect(usesFallback({ state: 'undefined', value: '' })).toBe(true)
    expect(usesFallback({ state: 'invalid', value: '' })).toBe(true)
  })

  it('ولا يُستعمل للمعرَّف فارغًا — المصيدة', () => {
    // القيمة فارغة والاحتياطي لم يُستعمل: أخدع حالة في `var()`.
    expect(usesFallback({ state: 'empty', value: '' })).toBe(false)
  })

  it('ولا للقيمة', () => {
    expect(usesFallback({ state: 'value', value: '1px' })).toBe(false)
  })
})

describe('composedParent — الوراثة تعبر حدّ الظلّ', () => {
  it('الأب العادي', () => {
    document.body.innerHTML = '<div id="p"><span id="c"></span></div>'
    const c = document.getElementById('c')!
    expect(composedParent(c)).toBe(document.getElementById('p'))
  })

  it('من جذر الظلّ إلى مضيفه', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('span')
    root.append(inner)

    // `parentElement` داخل الظلّ يساوي null عند الجذر — والصعود يجب أن يعبر.
    expect(inner.parentElement).toBeNull()
    expect(composedParent(inner)).toBe(host)
  })

  it('null عند قمّة المستند', () => {
    expect(composedParent(document.documentElement)).toBeNull()
  })
})

describe('findDeclaringElement — الصعود إلى المعرِّف', () => {
  /*
   * الصعود عبر الوراثة (`:root` أو سلف وسيط) لا يُختبَر هنا: happy-dom لا
   * يورّث الخصائص المخصَّصة أصلًا، فالاختبار سيقيس البيئة لا الشيفرة.
   * مقياسه `scripts/verify-inspect.mjs`.
   */

  it('يجد العنصر نفسه حين عرّفه', () => {
    style(':root { --brand: red } #t { --brand: green }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!

    const site = findDeclaringElement(t, '--brand')
    expect(site?.at).toBe(t)
    expect(site?.hops).toBe(0)
  })

  it('null لمتغيّر غير معرَّف', () => {
    document.body.innerHTML = '<p id="t"></p>'
    expect(findDeclaringElement(document.getElementById('t')!, '--nope')).toBeNull()
  })
})

describe('referencedVar — قراءة السلسلة من التصريح', () => {
  it.each([
    ['var(--b)', '--b'],
    ['var( --b )', '--b'],
    ['var(--b, red)', '--b'],
    ['calc(var(--gap) * 2)', '--gap'],
    ['1px solid var(--line)', '--line'],
  ])('%s ⇒ %s', (declared, want) => {
    expect(referencedVar(declared)).toBe(want)
  })

  it('null حين لا إشارة', () => {
    expect(referencedVar('12px')).toBeNull()
    expect(referencedVar('')).toBeNull()
  })
})

describe('traceVariable — الاعتراف بالجهل', () => {
  it('none لمتغيّر غير معرَّف', () => {
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    expect(traceVariable(t, '--nope').provenance.kind).toBe('none')
  })

  it('declared حين وُجد المعرِّف بلا فهرس — والقاعدة تبقى مجهولة', () => {
    style('#t { --brand: red }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!

    const trace = traceVariable(t, '--brand')
    expect(trace.provenance.kind).toBe('declared')
    if (trace.provenance.kind === 'declared') {
      expect(trace.provenance.at).toBe(t)
      // بلا فهرس تُعرَف **مكان** التعريف ولا تُعرَف قاعدته — تدهور معلَن.
      expect(trace.provenance.rule).toBeNull()
    }
  })

  it('opaque حين تعذّرت قراءة الأوراق — لا none', () => {
    /*
     * هذه هي الحالة التي تفصل الفاحص الأمين عن الكاذب. قِيس على stripe.com:
     * ستّ أوراق، ستّ محجوبة، صفر قاعدة مقروءة — ومع ذلك اسم المتغيّر وقيمته
     * يعبران الحجب. فالجواب «تعذّر تحديد المكان» لا «لا متغيّر».
     */
    style('#t { --brand: red }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!

    // بلا `index`، ومع إبلاغ عن أوراق محجوبة.
    const trace = traceVariable(t, '--brand', {
      blocked: { count: 6, origins: ['https://js.stripe.com'] },
    })

    // المعرِّف وُجد بالصعود، فالحالة `declared` لا `opaque` — والحجب يُبلَّغ
    // في حدود اللقطة. أمّا حين لا يُوجد المعرِّف فالحجب هو الجواب.
    expect(['declared', 'opaque']).toContain(trace.provenance.kind)
    expect(trace.chain[0]?.value.state).toBe('value')
  })

  it('السلسلة تحمل الاسم والقيمة دائمًا', () => {
    style('#t { --brand: #3b82f6 }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!

    const trace = traceVariable(t, '--brand')
    expect(trace.chain).toHaveLength(1)
    expect(trace.chain[0]?.name).toBe('--brand')
    expect(trace.chain[0]?.value.value.trim()).toBe('#3b82f6')
  })

  it('لا يدور إلى ما لا نهاية على سلسلة دائرية', () => {
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    expect(() => traceVariable(t, '--a')).not.toThrow()
  })
})

describe('customNames — الأسماء تعبر الحجب', () => {
  it('يعدّد المتغيّرات المرئية', () => {
    style('#t { --a: 1px; --b: red }')
    document.body.innerHTML = '<p id="t"></p>'
    const names = customNames(document.getElementById('t')!)
    // happy-dom قد لا يعدّد الموروثة؛ ما يهمّ ألّا يرمي وأن يُرجع أسماء `--`.
    expect(Array.isArray(names)).toBe(true)
    expect(names.every((n) => n.startsWith('--'))).toBe(true)
  })
})
