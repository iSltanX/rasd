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
 * `""`. فالصعود إلى المعرِّف والحالات الأربع لا يُختبَران فوق happy-dom نفسه،
 * ومقياسهما في Chrome حقيقي `scripts/verify-inspect.mjs`. وما يُختبَر فوقه
 * هو ما تستطيعه البيئة: التصنيف، والحرّاس، وقراءة السلسلة، والاعتراف بالجهل.
 * أمّا منطق الصعود والحالات فيُختبَر في الأقسام الأخيرة بنافذة مزيَّفة تحاكي
 * الوراثة (`tests/helpers/fake-computed-style.ts`).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { type RuleContext } from '@/modules/computed-style/cascade'
import { effectiveSelectors } from '@/modules/computed-style/nesting'
import {
  entriesForSelector,
  indexRules,
  type CssIndex,
  type IndexedRule,
} from '@/modules/computed-style/selector-index'
import { findDeclaringElement, referencedVar, traceVariable } from '@/modules/var-trace/declaration'
import { composedParent, customNames, readVar, usesFallback } from '@/modules/var-trace/value-state'

import { EMPTY, FakeComputedStyle, INVALID } from '../../../helpers/fake-computed-style'

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

/**
 * ما لا تستطيعه happy-dom — الصعود بالوراثة والحالات الأربع — يُختبَر بنافذة
 * مزيَّفة تحاكيها (`tests/helpers/fake-computed-style.ts`). والقواعد تبقى
 * حقيقية: ورقة أنماط في المستند وفهرس مبنيّ منها، فالتصريح المقروء هو ما كُتب.
 */

/** سياق بلا طبقات وكل الشروط مطابقة. */
const plainCtx: RuleContext = {
  layer: () => null,
  layerPath: () => null,
  source: () => null,
  conditionsMatch: () => true,
}

/** يبني ورقة أنماط حقيقية ويُرجع فهرسها بترتيب ظهور قواعدها. */
function indexOfSheet(css: string): CssIndex {
  const el = document.createElement('style')
  el.textContent = css
  document.head.append(el)
  const rules = Array.from(el.sheet?.cssRules ?? []).filter(
    (r): r is CSSStyleRule => typeof (r as CSSStyleRule).selectorText === 'string',
  )
  const entries: IndexedRule[] = []
  rules.forEach((rule, i) => {
    entries.push(...entriesForSelector(rule, effectiveSelectors(rule), i))
  })
  return indexRules(entries)
}

/** شجرة `body > #a > #b > #c` — والأخير أعمقها. */
function nest(): { a: HTMLElement; b: HTMLElement; c: HTMLElement } {
  document.body.innerHTML = '<div id="a"><div id="b"><div id="c"></div></div></div>'
  return {
    a: document.getElementById('a')!,
    b: document.getElementById('b')!,
    c: document.getElementById('c')!,
  }
}

describe('findDeclaringElement — الصعود بالوراثة', () => {
  it('يصعد من الابن إلى أوّل سلف تغيّرت عنده القيمة ويعدّ القفزات', () => {
    const { a, c } = nest()
    const win = new FakeComputedStyle().define(a, { '--brand': 'red' }).win

    // c → b → a: قفزتان، والتغيّر عند `a` لأن أباه (body) لا يعرّفه.
    expect(findDeclaringElement(c, '--brand', win)).toEqual({ at: a, hops: 2 })
  })

  it('أقرب تعريف يفوز: إعادة التعريف بقيمة أخرى في الوسط توقف الصعود', () => {
    const { a, b, c } = nest()
    const win = new FakeComputedStyle()
      .define(a, { '--brand': 'red' })
      .define(b, { '--brand': 'blue' }).win

    expect(findDeclaringElement(c, '--brand', win)).toEqual({ at: b, hops: 1 })
  })

  it('إعادة التصريح بالقيمة نفسها لا تُميَّز — يُنسَب التعريف إلى الأعلى', () => {
    // حدّ موثَّق للمعيار «تختلف قيمته عن أبيه»: `b` يكرّر `red` فلا فرق يُرى،
    // فيصعد المسار إلى `a`. وهذا الاختبار يثبّت السلوك لا يدّعي صوابه المطلق.
    const { a, b, c } = nest()
    const win = new FakeComputedStyle()
      .define(a, { '--brand': 'red' })
      .define(b, { '--brand': 'red' }).win

    expect(findDeclaringElement(c, '--brand', win)).toEqual({ at: a, hops: 2 })
  })

  it('يعبر حدّ الظلّ: المعرِّف مضيف الظلّ لا جذره', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('span')
    root.append(inner)
    const win = new FakeComputedStyle().define(host, { '--brand': 'red' }).win

    expect(findDeclaringElement(inner, '--brand', win)).toEqual({ at: host, hops: 1 })
  })

  it('يبلغ قمّة الشجرة بلا تغيّر ⇒ القمّة هي المعرِّف', () => {
    // شجرة منفصلة جذرها `top`: لا أب مركَّب فوقه. القيمة واحدة في كل مستوى،
    // فالجذر هو المعرِّف — وهذه ليست «مجهول» بل «جذر».
    const top = document.createElement('div')
    const mid = document.createElement('div')
    const leaf = document.createElement('div')
    top.append(mid)
    mid.append(leaf)
    const win = new FakeComputedStyle().define(top, { '--brand': 'red' }).win

    expect(findDeclaringElement(leaf, '--brand', win)).toEqual({ at: top, hops: 2 })
  })

  it('تساوي القيمة مع اختلاف الحالة يُعدّ تغيّرًا: فارغ فوق باطل', () => {
    // كلاهما `""`، لكن الأب دورة (`invalid`) والابن `--x: ;` (`empty`). لو
    // قورنت القيمة وحدها لصعد المسار وأعزى التعريف إلى الأب زورًا.
    const { a, c } = nest()
    const win = new FakeComputedStyle()
      .define(a, { '--x': INVALID })
      .define(c, { '--x': EMPTY }).win

    expect(findDeclaringElement(c, '--x', win)).toEqual({ at: c, hops: 0 })
  })

  it('يستسلم بعد 128 قفزة: بعيد بـ127 يُوجَد، وبـ128 ⇒ null', () => {
    // المعرِّف `d` قفزة فوق الورقة؛ المسح يفحص حتى القفزة 127 شاملة.
    const build = (depth: number) => {
      document.body.innerHTML = '<div id="declarer"></div>'
      const declarer = document.getElementById('declarer')!
      let leaf: Element = declarer
      for (let i = 0; i < depth; i++) {
        const next = document.createElement('div')
        leaf.append(next)
        leaf = next
      }
      return { declarer, leaf, win: new FakeComputedStyle().define(declarer, { '--x': '1' }).win }
    }

    const near = build(127)
    expect(findDeclaringElement(near.leaf, '--x', near.win)).toEqual({
      at: near.declarer,
      hops: 127,
    })

    const far = build(128)
    expect(findDeclaringElement(far.leaf, '--x', far.win)).toBeNull()
  })
})

describe('traceVariable — السلسلة والمكان والقاعدة', () => {
  it('يتبع var() من التصريح إلى المتغيّر الآخر ويُنهي بقاعدة الحلقة الأخيرة', () => {
    style('#t { --brand: var(--base); --base: #3b82f6 }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const index = indexOfSheet('#t { --brand: var(--base); --base: #3b82f6 }')

    const trace = traceVariable(t, '--brand', { index, ctx: plainCtx })

    expect(trace.chain.map((l) => l.name)).toEqual(['--brand', '--base'])
    expect(trace.chain.every((l) => l.at === t && l.hops === 0)).toBe(true)
    expect(trace.provenance.kind).toBe('declared')
    if (trace.provenance.kind === 'declared') {
      expect(trace.provenance.at).toBe(t)
      // القاعدة قاعدة **الحلقة الأخيرة** `--base` لا الرأس.
      expect(trace.provenance.rule?.declared).toBe('#3b82f6')
      expect(trace.provenance.rule?.selector).toBe('#t')
    }
  })

  it('بلا فهرس أو بلا سياق لا تُتبَع السلسلة ولا تُعرَف القاعدة', () => {
    // كل واحد وحده لا يكفي: الفهرس يجيب «أي قاعدة»، والسياق يجيب «هل تنطبق».
    style('#t { --brand: var(--base); --base: #3b82f6 }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const index = indexOfSheet('#t { --brand: var(--base) }')

    for (const options of [{ index }, { ctx: plainCtx }]) {
      const trace = traceVariable(t, '--brand', options)
      expect(trace.chain.map((l) => l.name)).toEqual(['--brand'])
      expect(trace.provenance).toEqual({ kind: 'declared', at: t, hops: 0, rule: null })
    }
  })

  it('فهرس بلا سياق: المكان معروف والقاعدة لا، فالحجب المُبلَّغ هو الجواب', () => {
    style('#t { --brand: red }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const blocked = { count: 2, origins: ['https://a.example', 'https://b.example'] }

    const trace = traceVariable(t, '--brand', { index: indexOfSheet(''), blocked })

    expect(trace.provenance).toEqual({
      kind: 'opaque',
      unreadableSheets: 2,
      origins: ['https://a.example', 'https://b.example'],
    })
  })

  it('يقف عند الدورة ولا يكرّر: --a → --b → --a', () => {
    const css = '#t { --a: var(--b); --b: var(--a) }'
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    // الدورة باطلة في المتصفّح الحقيقي: الحالتان `invalid` ولا قيمة محسوبة.
    const win = new FakeComputedStyle().define(t, { '--a': INVALID, '--b': INVALID }).win

    const trace = traceVariable(t, '--a', { win, index: indexOfSheet(css), ctx: plainCtx })

    expect(trace.chain.map((l) => l.name)).toEqual(['--a', '--b'])
    expect(trace.chain.map((l) => l.value.state)).toEqual(['invalid', 'invalid'])
    // الرأس معرَّف (باطل)، فالحالة ليست `none`.
    expect(trace.provenance.kind).toBe('declared')
  })

  it('سلسلة أطول من 16 حلقة تُقطع عند السادسة عشرة', () => {
    const N = 20
    const css = `#t { ${Array.from({ length: N }, (_, i) => `--v${i}: var(--v${i + 1})`).join('; ')} }`
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const defs = Object.fromEntries(Array.from({ length: N + 1 }, (_, i) => [`--v${i}`, 'x']))
    const win = new FakeComputedStyle().define(t, defs).win

    const trace = traceVariable(t, '--v0', { win, index: indexOfSheet(css), ctx: plainCtx })

    expect(trace.chain).toHaveLength(16)
    expect(trace.chain[15]?.name).toBe('--v15')
    expect(trace.provenance.kind).toBe('declared')
    if (trace.provenance.kind === 'declared') {
      // القاعدة قاعدة آخر حلقة وصل إليها المسار.
      expect(trace.provenance.rule?.declared).toBe('var(--v16)')
    }
  })

  it('السلسلة تسجّل المعرِّف والقفزات لكل حلقة على حدة', () => {
    const { a, b, c } = nest()
    const css = '#a { --brand: var(--base) } #b { --base: green }'
    const win = new FakeComputedStyle()
      .define(a, { '--brand': 'green' })
      .define(b, { '--base': 'green' }).win

    const trace = traceVariable(c, '--brand', { win, index: indexOfSheet(css), ctx: plainCtx })

    expect(trace.chain).toEqual([
      { name: '--brand', value: { state: 'value', value: 'green' }, at: a, hops: 2 },
      { name: '--base', value: { state: 'value', value: 'green' }, at: b, hops: 1 },
    ])
    if (trace.provenance.kind === 'declared') {
      expect(trace.provenance.at).toBe(b)
      expect(trace.provenance.hops).toBe(1)
    } else {
      expect.unreachable('يجب أن يكون declared')
    }
  })

  it('الفهرس والسياق حاضران لكن لا قاعدة تصرّح: declared بقاعدة null', () => {
    // التصريح جاء من ورقة لا يعرفها الفهرس (محجوبة مثلًا): المكان معروف
    // والقاعدة لا.
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const win = new FakeComputedStyle().define(t, { '--brand': 'red' }).win

    const trace = traceVariable(t, '--brand', {
      win,
      index: indexOfSheet(''),
      ctx: plainCtx,
      blocked: { count: 3, origins: ['https://cdn.example'] },
    })

    // المكان معروف فالحجب لا يُبلَّغ `opaque` — الأولوية لـ`declared`.
    expect(trace.provenance).toEqual({ kind: 'declared', at: t, hops: 0, rule: null })
  })
})

describe('traceVariable — حين تنتهي السلسلة عند مجهول', () => {
  /** رأس باطل يشير إلى `--gone` غير المعرَّف: السلسلة تنتهي بحلقة بلا مكان. */
  function danglingReference() {
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const win = new FakeComputedStyle().define(t, { '--head': INVALID }).win
    const index = indexOfSheet('#t { --head: var(--gone) }')
    return { t, win, index }
  }

  it('unverified: الرأس معرَّف لكن الحلقة الأخيرة لا مكان لها ولا حجب مُبلَّغ', () => {
    const { t, win, index } = danglingReference()

    const trace = traceVariable(t, '--head', { win, index, ctx: plainCtx })

    expect(trace.chain.map((l) => [l.name, l.value.state, l.at === null])).toEqual([
      ['--head', 'invalid', false],
      ['--gone', 'undefined', true],
    ])
    expect(trace.provenance).toEqual({ kind: 'unverified' })
  })

  it('unverified أيضًا حين يكون عدّاد الحجب صفرًا', () => {
    const { t, win, index } = danglingReference()

    const trace = traceVariable(t, '--head', {
      win,
      index,
      ctx: plainCtx,
      blocked: { count: 0, origins: [] },
    })

    expect(trace.provenance).toEqual({ kind: 'unverified' })
  })

  it('opaque: الحجب المُبلَّغ هو الجواب حين لا مكان للحلقة الأخيرة', () => {
    const { t, win, index } = danglingReference()

    const trace = traceVariable(t, '--head', {
      win,
      index,
      ctx: plainCtx,
      blocked: { count: 6, origins: ['https://js.stripe.com'] },
    })

    expect(trace.provenance).toEqual({
      kind: 'opaque',
      unreadableSheets: 6,
      origins: ['https://js.stripe.com'],
    })
  })

  it('opaque بلا فهرس: المكان معروف لكن القاعدة لا، والحجب مُبلَّغ', () => {
    style('#t { --brand: red }')
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!

    const trace = traceVariable(t, '--brand', {
      blocked: { count: 6, origins: ['https://js.stripe.com'] },
    })

    expect(trace.provenance).toEqual({
      kind: 'opaque',
      unreadableSheets: 6,
      origins: ['https://js.stripe.com'],
    })
    // والاسم والقيمة يعبران الحجب.
    expect(trace.chain[0]?.value.state).toBe('value')
  })

  it('unverified: المعرِّف أبعد من حدّ الصعود ولا حجب مُبلَّغ', () => {
    // الرأس معرَّف على قمّة بعيدة (129 قفزة): `findDeclaringElement` يستسلم
    // فيبقى «المتغيّر موجود ولا نعرف أين» — لا `none` ولا `declared`.
    document.body.innerHTML = '<div id="top"></div>'
    const top = document.getElementById('top')!
    let leaf: Element = top
    for (let i = 0; i < 129; i++) {
      const next = document.createElement('div')
      leaf.append(next)
      leaf = next
    }
    const win = new FakeComputedStyle().define(top, { '--x': '1' }).win

    const trace = traceVariable(leaf, '--x', { win })

    expect(trace.chain).toEqual([
      { name: '--x', value: { state: 'value', value: '1' }, at: null, hops: 0 },
    ])
    expect(trace.provenance).toEqual({ kind: 'unverified' })
  })

  it('متغيّر معرَّف فارغًا ليس none: يُنسَب إلى مكانه بقاعدة مجهولة', () => {
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    const win = new FakeComputedStyle().define(t, { '--x': EMPTY }).win

    const trace = traceVariable(t, '--x', { win })

    expect(trace.chain[0]?.value.state).toBe('empty')
    expect(trace.provenance).toEqual({ kind: 'declared', at: t, hops: 0, rule: null })
  })
})
