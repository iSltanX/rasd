/**
 * حالات المتغيّر الأربع — من خلال نافذة مزيَّفة تعطي ما يعطيه Chrome.
 *
 * التفريق بين الفارغ والباطل يأتي من `computedStyleMap` وحدها، وهي غائبة في
 * happy-dom، فلا يُختبَر فوقه. ولذلك تُحقَن نافذة تحاكي الجدول المقيس في
 * ترويسة المصدر صفًّا صفًّا (انظر `tests/helpers/fake-computed-style.ts`).
 * وصدق الجدول نفسه على متصفّح حقيقي مقياسه `scripts/verify-inspect.mjs`.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { composedParent, customNames, readVar, usesFallback } from '@/modules/var-trace/value-state'

import {
  EMPTY,
  FakeComputedStyle,
  INVALID,
  type StyleMapMode,
} from '../../../helpers/fake-computed-style'

let el: HTMLElement

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="t"></div>'
  el = document.getElementById('t')!
})

/** نافذة بعنصر `el` معرَّفٌ عليه `--x` بما يُعطى. */
function withDef(def: string | typeof EMPTY | typeof INVALID, mode?: StyleMapMode): Window {
  return new FakeComputedStyle(mode).define(el, { '--x': def }).win
}

describe('readVar — الحالات الأربع من جدول القياس', () => {
  it('قيمة فعلية ⇒ value مع القيمة كما هي', () => {
    expect(readVar(el, '--x', withDef('12px'))).toEqual({ state: 'value', value: '12px' })
  })

  it('القيمة الفعلية لا تحتاج computedStyleMap — تُصنَّف قبل السؤال عنها', () => {
    // بيئة بلا خريطة أنماط ولا تُرمى منها شيء: القيمة غير الفارغة قاطعة.
    expect(readVar(el, '--x', withDef('1px', 'absent')).state).toBe('value')
    expect(readVar(el, '--x', withDef('1px', 'throws')).state).toBe('value')
  })

  it('غير معرَّف أصلًا ⇒ undefined — لا في التعداد ولا في القيمة', () => {
    const win = new FakeComputedStyle().win

    expect(readVar(el, '--nope', win)).toEqual({ state: 'undefined', value: '' })
  })

  it('معرَّف بقيمة فارغة ⇒ empty — الخريطة تحويه', () => {
    expect(readVar(el, '--x', withDef(EMPTY))).toEqual({ state: 'empty', value: '' })
  })

  it('باطل (دورة أو إشارة إلى غير معرَّف) ⇒ invalid — في التعداد لا في الخريطة', () => {
    // `""` نفسها كالفارغ، والفارق الوحيد أن الخريطة لا تحويه: هذا ما يمنع
    // الفاحص من القول «فارغ» عن متغيّر لا يُحسَب أصلًا.
    expect(readVar(el, '--x', withDef(INVALID))).toEqual({ state: 'invalid', value: '' })
  })

  it('الاسم يُبحَث عنه في التعداد كلّه لا في أوّل عنصر منه', () => {
    // اسم آخر يسبق `--x` في التعداد: المطابقة تكمل حتى تجده.
    const styles = new FakeComputedStyle().define(el, {
      '--first': '1px',
      color: 'red',
      '--x': EMPTY,
    })
    const win = styles.win

    expect(readVar(el, '--x', win).state).toBe('empty')
    // ويبقى غيرُه غير معرَّف رغم أن التعداد غير فارغ.
    expect(readVar(el, '--absent', win).state).toBe('undefined')
  })

  it('يقرأ الموروث: القيمة على السلف تظهر على الابن بقيمتها', () => {
    const child = document.createElement('span')
    el.append(child)
    const win = new FakeComputedStyle().define(el, { '--x': 'blue' }).win

    expect(readVar(child, '--x', win)).toEqual({ state: 'value', value: 'blue' })
  })
})

describe('readVar — التدهور المعلَن حين تغيب computedStyleMap', () => {
  const cases: readonly [string, StyleMapMode][] = [
    ['غائبة (بيئة اختبار قديمة)', 'absent'],
    ['ترمي (عنصر منفصل)', 'throws'],
  ]

  it.each(cases)('الباطل يُخلَط بالفارغ حين تكون الخريطة %s', (_label, mode) => {
    // ثلاث حالات لا أربع: لا سبيل إلى التفريق، فيُختار `empty` (الأقلّ ضررًا:
    // لا يدّعي أن الاحتياطي سيُستعمَل).
    expect(readVar(el, '--x', withDef(INVALID, mode)).state).toBe('empty')
    expect(readVar(el, '--x', withDef(EMPTY, mode)).state).toBe('empty')
  })

  it.each(cases)('وغير المعرَّف يبقى undefined حين تكون الخريطة %s', (_label, mode) => {
    const win = new FakeComputedStyle(mode).win

    expect(readVar(el, '--nope', win).state).toBe('undefined')
  })

  it('خاصية computedStyleMap ليست دالّة ⇒ تُعامَل كغائبة', () => {
    // عنصر يحمل الاسم نفسه بقيمة غير قابلة للاستدعاء: `typeof` هو الحارس، لا
    // وجود الخاصية وحده — وإلا رُمي `TypeError` من الاستدعاء.
    Object.defineProperty(el, 'computedStyleMap', { value: 'not-a-function', configurable: true })
    const win = {
      getComputedStyle: () => ({ getPropertyValue: () => '', length: 1, item: () => '--x' }),
    } as unknown as Window

    expect(readVar(el, '--x', win)).toEqual({ state: 'empty', value: '' })
  })

  it('بلا نافذة ممرَّرة يقرأ النافذة العامّة: value وundefined', () => {
    const style = document.createElement('style')
    style.textContent = '#t { --ok: 12px }'
    document.head.append(style)

    expect(readVar(el, '--ok').state).toBe('value')
    expect(readVar(el, '--nope').state).toBe('undefined')
  })
})

describe('usesFallback — قرار الاحتياطي من الحالة', () => {
  it.each([
    ['undefined', true],
    ['invalid', true],
    ['empty', false],
    ['value', false],
  ] as const)('%s ⇒ %s', (state, want) => {
    expect(usesFallback({ state, value: '' })).toBe(want)
  })
})

describe('customNames — أسماء `--` وحدها، بترتيب التعداد', () => {
  it('يستبعد الخصائص العادية ويُبقي المخصَّصة', () => {
    const win = new FakeComputedStyle().define(el, {
      color: 'red',
      '--brand': '#3b82f6',
      'font-size': '12px',
      '--gap': EMPTY,
    }).win

    expect(customNames(el, win)).toEqual(['--brand', '--gap'])
  })

  it('يعدّد الموروثة أيضًا، والباطلة بلا قيمة', () => {
    const child = document.createElement('span')
    el.append(child)
    const win = new FakeComputedStyle().define(el, { '--inherited': '1px', '--bad': INVALID }).win

    expect(customNames(child, win)).toEqual(['--inherited', '--bad'])
  })

  it('لا شيء مخصَّصًا ⇒ قائمة فارغة', () => {
    const win = new FakeComputedStyle().define(el, { color: 'red' }).win

    expect(customNames(el, win)).toEqual([])
    expect(customNames(el, new FakeComputedStyle().win)).toEqual([])
  })

  it('لا يعدّ الاسمَ الذي يبدأ بشرطة واحدة مخصَّصًا', () => {
    // `-webkit-…` خاصّية محرّك لا متغيّر.
    const win = new FakeComputedStyle().define(el, { '-webkit-x': '1', '--x': '2' }).win

    expect(customNames(el, win)).toEqual(['--x'])
  })
})

describe('composedParent — أعماق الظلّ', () => {
  it('ظلّ داخل ظلّ: كل قفزة تصعد مستوى واحدًا إلى مضيفه', () => {
    const outerHost = document.createElement('div')
    document.body.append(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerRoot.append(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const leaf = document.createElement('span')
    innerRoot.append(leaf)

    expect(composedParent(leaf)).toBe(innerHost)
    expect(composedParent(innerHost)).toBe(outerHost)
    expect(composedParent(outerHost)).toBe(document.body)
  })

  it('عنصر منفصل عن المستند ⇒ null — جذره عنصر لا ظلّ', () => {
    const detached = document.createElement('div')
    const child = document.createElement('span')
    detached.append(child)

    expect(composedParent(child)).toBe(detached)
    expect(composedParent(detached)).toBeNull()
  })
})
