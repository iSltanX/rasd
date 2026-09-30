import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { identify } from '@/modules/dom-picker/identity'
import {
  contextOf,
  formatPx,
  formatRatioValue,
  observeIssue,
  readValue,
} from '@/modules/issues/observe'
import { CONTRAST_PROPERTY, type CheckKind, type IssueCheck } from '@/shared/issue-schema'

/**
 * قراءة الصفحة الحيّة وتحويلها إلى إحدى النتائج الخمس (ADR 0030 §2 و0031 §2).
 *
 * happy-dom بلا محرّك تخطيط ولا أنماط محسوبة كاملة، فالتخطيط والأنماط يُحقنان هنا بالشكل الذي تسلّمه
 * المتصفّحات، والمختبَر منطق الحكم: أيّ نتيجة لأي قراءة، وبأي سبب.
 */

type Styles = Record<string, string>

/** الأنماط المحسوبة لكل عنصر — ما ليس فيها يُقرأ فارغًا، ونمط الخطّ 16px. */
const styles = new Map<Element, Styles>()

beforeEach(() => {
  styles.clear()
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const own = styles.get(el) ?? {}
    return {
      getPropertyValue: (name: string) => own[name] ?? '',
      color: own.color ?? '',
      fontSize: own['font-size'] ?? '16px',
      backgroundColor: own['background-color'] ?? 'rgba(0, 0, 0, 0)',
      backgroundImage: own['background-image'] ?? 'none',
    } as unknown as CSSStyleDeclaration
  })
})

afterEach(() => {
  vi.restoreAllMocks()
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

/** عنصرٌ مخطَّط أو بلا صندوق، وبمستطيلٍ اختياري. */
function layout(
  el: Element,
  laidOut: boolean,
  box?: { x: number; y: number; width: number; height: number },
): void {
  vi.spyOn(el, 'getClientRects').mockReturnValue((laidOut ? [{}] : []) as unknown as DOMRectList)
  if (box) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(box.x, box.y, box.width, box.height),
    )
  }
}

const check = (kind: CheckKind, property: string, expected: string, tolerance = 0): IssueCheck => ({
  kind,
  property,
  actual: 'x',
  expected,
  tolerance,
})

/** مشكلةٌ على عنصرٍ حيّ — الهوية تُؤخذ منه الآن كما يأخذها التسجيل. */
function issueOn(el: Element, spec: IssueCheck, pair: Element | null = null) {
  return { id: 'i1', element: identify(el), pair: pair ? identify(pair) : null, check: spec }
}

const BUTTON = '<main><button id="buy" data-cta>اشترِ الآن</button></main>'

describe('observeIssue — إيجاد العنصر', () => {
  it('عنصرٌ غاب ⟵ not-found بسبب الغياب ولا قيمة مرصودة', () => {
    mount(BUTTON)
    const issue = issueOn($('#buy'), check('style', 'padding', '12px'))
    $('#buy').remove()

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
    })
  })

  it('المحدِّد يطابق عنصرين ⟵ changed بسبب التعدّد', () => {
    mount('<button class="primary">أ</button>')
    const issue = issueOn($('.primary'), check('style', 'padding', '12px'))
    document.body.insertAdjacentHTML('beforeend', '<button class="primary">أ</button>')

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'changed',
      observed: null,
      reason: 'multiple',
    })
  })

  it('مضيف الطبقة المستثنى لا يُعدّ مطابقًا ثانيًا فيُقرأ العنصر', () => {
    mount('<button class="primary">أ</button>')
    const first = $('.primary')
    styles.set(first, { padding: '12px' })
    const issue = issueOn(first, check('style', 'padding', '12px'))
    document.body.insertAdjacentHTML('beforeend', '<button class="primary">أ</button>')
    const overlay = document.querySelectorAll('.primary')[1] ?? null

    expect(observeIssue(issue, document, overlay).outcome).toBe('match')
  })

  it('نصّ العنصر تغيّر فتغيّرت بصمته ⟵ changed بسبب البصمة', () => {
    mount(BUTTON)
    const issue = issueOn($('#buy'), check('style', 'padding', '12px'))
    $('#buy').textContent = 'اطلب الآن'

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'changed',
      observed: null,
      reason: 'fingerprint',
    })
  })

  it('تغيّر الصنف والنمط والمقاس ليس تغيّرًا: هذا ما يتغيّر حين يُصلَح الخلل', () => {
    mount(BUTTON)
    const el = $('#buy') as HTMLElement
    styles.set(el, { padding: '12px' })
    const issue = issueOn(el, check('style', 'padding', '12px'))
    el.className = 'fixed'
    el.style.padding = '12px'

    expect(observeIssue(issue, document).outcome).toBe('match')
  })

  it('محدِّدٌ لم يعد صالحًا ⟵ not-found بسببه', () => {
    mount(BUTTON)
    const issue = { ...issueOn($('#buy'), check('style', 'padding', '12px')) }
    issue.element = { ...issue.element, selector: '<<غير صالح>>' }

    const result = observeIssue(issue, document)
    expect(result.outcome).toBe('not-found')
    expect(result.reason).toBe('invalid-selector')
    expect(result.observed).toBeNull()
  })

  it('مضيفٌ في السلسلة غاب ⟵ not-found بسبب المضيف', () => {
    mount(BUTTON)
    const base = issueOn($('#buy'), check('style', 'padding', '12px'))
    const issue = { ...base, element: { ...base.element, hosts: ['#gone'] } }

    expect(observeIssue(issue, document)).toMatchObject({
      outcome: 'not-found',
      reason: 'host-missing',
    })
  })

  it('مضيفٌ جذره مغلق ⟵ not-found بسبب الجذر المغلق لا «غير موجود»', () => {
    mount('<div id="host"></div><button id="buy">أ</button>')
    $('#host').attachShadow({ mode: 'closed' })
    const base = issueOn($('#buy'), check('style', 'padding', '12px'))
    const issue = { ...base, element: { ...base.element, hosts: ['#host'] } }

    expect(observeIssue(issue, document)).toMatchObject({
      outcome: 'not-found',
      reason: 'closed-shadow',
    })
  })

  it('العنصر داخل جذر ظلّ مفتوح يُعثر عليه ويُقرأ', () => {
    mount('<div id="host"></div>')
    const root = $('#host').attachShadow({ mode: 'open' })
    root.innerHTML = '<button id="inner">أ</button>'
    const inner = root.querySelector('#inner') as Element
    styles.set(inner, { padding: '12px' })

    const base = issueOn(inner, check('style', 'padding', '12px'))
    const issue = { ...base, element: { ...base.element, hosts: ['#host'], inShadow: true } }

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'match',
      observed: '12px',
      reason: null,
    })
  })
})

describe('observeIssue — الأنماط والألوان', () => {
  it('القيمة ضمن المتوقَّعة ⟵ match بالقيمة المرصودة', () => {
    mount(BUTTON)
    styles.set($('#buy'), { padding: '12px 24px' })
    const issue = issueOn($('#buy'), check('style', 'padding', '12px 24px'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'match',
      observed: '12px 24px',
      reason: null,
    })
  })

  it('القيمة خارج المتوقَّعة ⟵ mismatch بالقيمة المرصودة', () => {
    mount(BUTTON)
    styles.set($('#buy'), { padding: '14px 24px' })
    const issue = issueOn($('#buy'), check('style', 'padding', '12px 24px'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'mismatch',
      observed: '14px 24px',
      reason: null,
    })
  })

  it('السماح يُحترم: فرق بكسلين ضمن سماح اثنين ⟵ match', () => {
    mount(BUTTON)
    styles.set($('#buy'), { 'border-radius': '10px' })
    expect(
      observeIssue(issueOn($('#buy'), check('style', 'border-radius', '12px', 2)), document)
        .outcome,
    ).toBe('match')
    expect(
      observeIssue(issueOn($('#buy'), check('style', 'border-radius', '12px', 1)), document)
        .outcome,
    ).toBe('mismatch')
  })

  it('اللون بنوع «لون» يقارَن على المعنى لا على الصيغة', () => {
    mount(BUTTON)
    styles.set($('#buy'), { 'background-color': 'rgb(59, 130, 246)' })
    const issue = issueOn($('#buy'), check('colour', 'background-color', '#3b82f6'))

    expect(observeIssue(issue, document)).toMatchObject({ outcome: 'match', reason: null })
  })

  it('`rem` المتوقَّعة يحلّها خطّ الجذر الحيّ الآن', () => {
    mount(BUTTON)
    styles.set($('#buy'), { 'font-size': '16px' })
    const issue = issueOn($('#buy'), check('style', 'font-size', '1rem'))

    expect(observeIssue(issue, document).outcome).toBe('match')

    styles.set(document.documentElement, { 'font-size': '20px' })
    expect(observeIssue(issue, document).outcome).toBe('mismatch')
  })

  it('عنصرٌ بلا صندوق ⟵ unreliable بسبب عدم العرض ومعه القيمة الخام', () => {
    mount(BUTTON)
    styles.set($('#buy'), { padding: '10%' })
    layout($('#buy'), false)
    const issue = issueOn($('#buy'), check('style', 'padding', '12px'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: '10%',
      reason: 'unlaid',
    })
  })

  it('حركةٌ جارية على الخاصّية ⟵ unreliable بسبب الحركة', () => {
    mount(BUTTON)
    styles.set($('#buy'), { padding: '12px' })
    Object.assign($('#buy'), {
      getAnimations: () => [{ effect: { getKeyframes: () => [{ offset: 0, padding: '1px' }] } }],
    })
    const issue = issueOn($('#buy'), check('style', 'padding', '12px'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: '12px',
      reason: 'animating',
    })
  })

  it('قيمةٌ فارغة لا تُقرأ ⟵ unreliable بسبب تعذّر القراءة ولا قيمة', () => {
    mount(BUTTON)
    const issue = issueOn($('#buy'), check('style', 'padding', '12px'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: null,
      reason: 'unreadable',
    })
  })

  it('متوقَّعةٌ لا تُفهم لونًا ⟵ unreliable لا «مفتوحة» ولا «محلولة»', () => {
    mount(BUTTON)
    styles.set($('#buy'), { 'background-color': 'rgb(59, 130, 246)' })
    const issue = issueOn($('#buy'), check('colour', 'background-color', 'أزرق'))

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: 'rgb(59, 130, 246)',
      reason: 'unreadable',
    })
  })
})

describe('observeIssue — المسافة بين عنصرين', () => {
  const MARKUP = '<div id="a">أ</div><span id="b">ب</span>'

  /** (ب) على يسار (أ) بفجوة 16: ‏(أ) عند x=200 و(ب) تنتهي عند x=184. */
  function mountPair(): { a: Element; b: Element } {
    mount(MARKUP)
    const a = $('#a')
    const b = $('#b')
    layout(a, true, { x: 200, y: 100, width: 100, height: 40 })
    layout(b, true, { x: 100, y: 100, width: 84, height: 40 })
    return { a, b }
  }

  it('الفجوة اليسرى 16px والمتوقَّعة 16px ⟵ match بالقيمة المرصودة', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), b)

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'match',
      observed: '16px',
      reason: null,
    })
  })

  it('المتوقَّعة 24px ⟵ mismatch والمرصودة 16px', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '24px'), b)

    expect(observeIssue(issue, document)).toMatchObject({ outcome: 'mismatch', observed: '16px' })
  })

  it('السماح بالبكسل يُحترم على المسافة', () => {
    const { a, b } = mountPair()
    expect(
      observeIssue(issueOn(a, check('spacing', 'gap-left', '15px', 1), b), document).outcome,
    ).toBe('match')
    expect(
      observeIssue(issueOn(a, check('spacing', 'gap-left', '14px', 1), b), document).outcome,
    ).toBe('mismatch')
  })

  it.each([
    ['dx', '100px'],
    ['dy', '0px'],
  ])('الفرق `%s` بين موضعَي العنصرين = %s', (property, observed) => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', property, observed), b)

    expect(observeIssue(issue, document)).toMatchObject({ outcome: 'match', observed })
  })

  it('العنصر الثاني غاب ⟵ not-found بسبب الغياب', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), b)
    b.remove()

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
    })
  })

  it('العنصر الثاني تغيّرت بصمته ⟵ changed بسبب البصمة', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), b)
    b.textContent = 'نصّ آخر'

    expect(observeIssue(issue, document)).toMatchObject({
      outcome: 'changed',
      reason: 'fingerprint',
    })
  })

  it('فحص مسافة بلا عنصر ثانٍ في السجلّ ⟵ not-found بسبب الغياب', () => {
    const { a } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), null)

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'not-found',
      observed: null,
      reason: 'missing',
    })
  })

  it('أحد العنصرين بلا صندوق ⟵ unreliable بسبب عدم العرض ولا قيمة', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), b)
    layout(b, false)

    expect(observeIssue(issue, document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: null,
      reason: 'unlaid',
    })
  })

  it('عنصرٌ أوّل غاب يُحكم عليه قبل النظر في الثاني', () => {
    const { a, b } = mountPair()
    const issue = issueOn(a, check('spacing', 'gap-left', '16px'), b)
    a.remove()

    expect(observeIssue(issue, document)).toMatchObject({ outcome: 'not-found', reason: 'missing' })
  })
})

describe('observeIssue — التباين', () => {
  const contrast = (expected: string) => check('contrast', CONTRAST_PROPERTY, expected)

  /** نصٌّ بلون معطى على جسم أبيض معتم. */
  function mountText(color: string): Element {
    mount(BUTTON)
    const el = $('#buy')
    styles.set(el, { color })
    styles.set(document.body, { 'background-color': 'rgb(255, 255, 255)' })
    return el
  }

  it('أسود على أبيض = 21.00 والمتوقَّعة الحدّ الأدنى 4.5 ⟵ match', () => {
    const el = mountText('rgb(0, 0, 0)')

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toEqual({
      id: 'i1',
      outcome: 'match',
      observed: '21.00',
      reason: null,
    })
  })

  it('الحدّ الأدنى حدّان: 4.54 على الأبيض يمرّ و4.47 يسقط', () => {
    const pass = observeIssue(issueOn(mountText('rgb(118, 118, 118)'), contrast('4.5')), document)
    expect(pass).toMatchObject({ outcome: 'match', observed: '4.54' })

    const fail = observeIssue(issueOn(mountText('rgb(119, 119, 119)'), contrast('4.5')), document)
    expect(fail).toMatchObject({ outcome: 'mismatch', observed: '4.47' })
  })

  it('نسبةٌ تحت الحدّ بجزءٍ من الألف لا تُقرَّب إليه: 4.4995 ⟵ mismatch لا «محلولة» (ADR 0035)', () => {
    // `rgb(100, 125, 102)` على الأبيض 4.4995 — كانت تُكتب `4.50` فتطابق الحدّ وهي تسقطه.
    const el = mountText('rgb(100, 125, 102)')

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toMatchObject({
      outcome: 'mismatch',
      observed: '4.49',
    })
  })

  it('لون النصّ بألفاه يُركَّب فوق خلفيته: أسود بنصف شفافية على الأبيض 4.00 لا 21', () => {
    const el = mountText('rgba(0, 0, 0, 0.5)')

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toMatchObject({
      outcome: 'mismatch',
      observed: '4.00',
    })
  })

  it('خلفية العنصر نفسه تُركَّب فوق جدّه', () => {
    const el = mountText('rgb(255, 255, 255)')
    styles.set(el, { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(0, 0, 0)' })

    expect(observeIssue(issueOn(el, contrast('7')), document)).toMatchObject({
      outcome: 'match',
      observed: '21.00',
    })
  })

  it('خلفيةٌ بصورة ⟵ unreliable بسبب الصورة ومعها القيمة التقريبية', () => {
    const el = mountText('rgb(0, 0, 0)')
    styles.set(document.body, {
      'background-color': 'rgb(255, 255, 255)',
      'background-image': 'url(hero.png)',
    })

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: '21.00',
      reason: 'background-image',
    })
  })

  it('عنصرٌ بلا صندوق ⟵ unreliable بسبب عدم العرض ومعه القيمة', () => {
    const el = mountText('rgb(0, 0, 0)')
    layout(el, false)

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: '21.00',
      reason: 'unlaid',
    })
  })

  it('لونُ نصٍّ لا يُقرأ ⟵ unreliable بسبب تعذّر القراءة ولا قيمة', () => {
    const el = mountText('ليس لونًا')

    expect(observeIssue(issueOn(el, contrast('4.5')), document)).toEqual({
      id: 'i1',
      outcome: 'unreliable',
      observed: null,
      reason: 'unreadable',
    })
  })

  it('متوقَّعةٌ ليست نسبةً ⟵ unreliable لا مقارنة مخترَعة', () => {
    const el = mountText('rgb(0, 0, 0)')

    expect(observeIssue(issueOn(el, contrast('AA')), document)).toMatchObject({
      outcome: 'unreliable',
      observed: '21.00',
      reason: 'unreadable',
    })
  })
})

describe('readValue', () => {
  it('خاصّية مسافة مجهولة ⟵ value: null بسبب تعذّر القراءة', () => {
    mount('<div id="a">أ</div><span id="b">ب</span>')
    expect(readValue('spacing', 'gap-diagonal', $('#a'), $('#b'))).toEqual({
      value: null,
      reason: 'unreadable',
    })
  })

  it('المسافة بلا قرين ⟵ تعذّر القراءة، وبلا صندوق ⟵ عدم العرض', () => {
    mount('<div id="a">أ</div><span id="b">ب</span>')
    expect(readValue('spacing', 'gap-left', $('#a'), null)).toEqual({
      value: null,
      reason: 'unreadable',
    })

    layout($('#b'), false)
    expect(readValue('spacing', 'gap-left', $('#a'), $('#b'))).toEqual({
      value: null,
      reason: 'unlaid',
    })
  })

  it('كل خاصّيات المسافة الست الصالحة تُقرأ بلا سبب', () => {
    mount('<div id="a">أ</div><span id="b">ب</span>')
    layout($('#a'), true, { x: 200, y: 100, width: 100, height: 40 })
    layout($('#b'), true, { x: 100, y: 100, width: 84, height: 40 })

    const read = (property: string) => readValue('spacing', property, $('#a'), $('#b'))
    expect(read('gap-left')).toEqual({ value: '16px', reason: null })
    expect(read('gap-top')).toEqual({ value: '-40px', reason: null })
    expect(read('gap-right')).toEqual({ value: '-200px', reason: null })
    expect(read('gap-bottom')).toEqual({ value: '-40px', reason: null })
    expect(read('dx')).toEqual({ value: '100px', reason: null })
    expect(read('dy')).toEqual({ value: '0px', reason: null })
  })

  it('النمط يُقصّ من مسافاته، وما هو فارغ بعد القصّ لا يُقرأ', () => {
    mount(BUTTON)
    styles.set($('#buy'), { padding: '  12px  ', margin: '   ' })
    const win = window
    expect(readValue('style', 'padding', $('#buy'), null, win)).toEqual({
      value: '12px',
      reason: null,
    })
    expect(readValue('style', 'margin', $('#buy'), null, win)).toEqual({
      value: null,
      reason: 'unreadable',
    })
  })
})

describe('formatPx', () => {
  it('منزلتان على الأكثر بلا أصفار ذيلية', () => {
    expect(formatPx(16)).toBe('16px')
    expect(formatPx(12.5)).toBe('12.5px')
    expect(formatPx(12.345)).toBe('12.35px')
    expect(formatPx(0.1 + 0.2)).toBe('0.3px')
  })

  it('الصفر والسالب: سالبٌ ضئيل لا يُطبع `-0px`', () => {
    expect(formatPx(0)).toBe('0px')
    expect(formatPx(-0.001)).toBe('0px')
    expect(formatPx(-40)).toBe('-40px')
  })
})

describe('formatRatioValue', () => {
  it('منزلتان ثابتتان تُقصّان ولا تُقرَّبان — المقارنة على الرقم والعرض يضيف `: 1`', () => {
    expect(formatRatioValue(3.678)).toBe('3.67')
    expect(formatRatioValue(21)).toBe('21.00')
    expect(formatRatioValue(4.5)).toBe('4.50')
    expect(formatRatioValue(4.35)).toBe('4.35')
    expect(formatRatioValue(4.4995)).toBe('4.49')
  })
})

describe('contextOf', () => {
  it('مقاما `rem` و`em` من خطّ الجذر وخطّ العنصر', () => {
    mount(BUTTON)
    styles.set(document.documentElement, { 'font-size': '20px' })
    styles.set($('#buy'), { 'font-size': '12.5px' })

    expect(contextOf($('#buy'), window)).toEqual({ rootFontPx: 20, fontPx: 12.5 })
  })

  it('خطٌّ لا يُقرأ رقمًا موجبًا يرجع إلى 16', () => {
    mount(BUTTON)
    for (const bad of ['normal', '', 'abc', '0px', '-4px']) {
      styles.set($('#buy'), { 'font-size': bad })
      expect(contextOf($('#buy'), window).fontPx).toBe(16)
    }
  })

  it('الجذر كذلك يرجع إلى 16 حين لا خطّ مقروءًا', () => {
    mount(BUTTON)
    styles.set(document.documentElement, { 'font-size': 'medium' })
    expect(contextOf($('#buy'), window).rootFontPx).toBe(16)
  })
})
