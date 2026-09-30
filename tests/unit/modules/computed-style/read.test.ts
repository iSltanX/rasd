/**
 * قراءة الأنماط المحسوبة — بالمجموعة المنتقاة وبعلامة ثقة لكل قيمة.
 *
 * happy-dom يعطي كل عنصر مستطيلًا واحدًا (فهو «مخطَّط» دائمًا)، ولا يعرّف
 * `getAnimations`، ولا يقرّ `:hover` ولا غيره. فحالات «بلا تخطيط» و«حركة جارية»
 * تُحقَن هنا على العنصر والنافذة بالشكل الذي تسلّمه المتصفّحات، والمختبَر منطق
 * وسم الثقة لا المحرّك.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pageOffset, readInspectStyles, readPseudo, readState } from '@/modules/computed-style/read'
import { INSPECT_PROPS } from '@/shared/inspect-schema'

/** نافذة تُرجع القيم من جدول، وتسجّل ما طُلب من العناصر الزائفة. */
function fakeWin(values: Record<string, string>, pseudoLog: (string | undefined)[] = []): Window {
  return {
    getComputedStyle: (_el: Element, pseudo?: string) => {
      pseudoLog.push(pseudo)
      return { getPropertyValue: (p: string) => values[p] ?? '' }
    },
  } as unknown as Window
}

/** عنصر حقيقي يُقرِّر هل له صندوق (`getClientRects` يعود بمستطيلات أو بلا شيء). */
function element(laidOut: boolean): HTMLElement {
  const el = document.createElement('div')
  vi.spyOn(el, 'getClientRects').mockReturnValue((laidOut ? [{}] : []) as unknown as DOMRectList)
  return el
}

/** يعلّق على العنصر `getAnimations` تُرجع حركات بإطارات مفاتيح معطاة. */
function animate(el: Element, ...animations: unknown[]) {
  Object.assign(el, { getAnimations: () => animations })
}

/** حركة مزيَّفة بإطارات مفاتيحها. */
const withFrames = (...frames: Record<string, unknown>[]) => ({
  effect: { getKeyframes: () => frames },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readInspectStyles — ثقة كل قيمة', () => {
  const win = fakeWin({ color: 'rgb(0, 0, 0)', padding: '40px', margin: '0px' })
  const props = ['color', 'padding', 'margin']

  it('عنصر مخطَّط بلا حركات: كل قيمة `used` بنصّها', () => {
    const reading = readInspectStyles(element(true), win, props)

    expect(reading.styles).toEqual({
      color: { value: 'rgb(0, 0, 0)', reliability: 'used' },
      padding: { value: '40px', reliability: 'used' },
      margin: { value: '0px', reliability: 'used' },
    })
    expect(reading.unlaid).toBe(false)
    expect(reading.animating).toBe(0)
    expect(reading.animated.size).toBe(0)
  })

  it('عنصر بلا صندوق: كل قيمة `unlaid` لأن النسب خام', () => {
    const reading = readInspectStyles(element(false), win, props)

    expect(reading.unlaid).toBe(true)
    expect(Object.values(reading.styles).map((s) => s.reliability)).toEqual([
      'unlaid',
      'unlaid',
      'unlaid',
    ])
    // القيمة نفسها تُنقَل كما هي؛ الوسم وحده هو الذي يتغيّر.
    expect(reading.styles.padding?.value).toBe('40px')
  })

  it('الخاصّية المتحرِّكة `animating` والباقي على حاله', () => {
    const el = element(true)
    animate(el, withFrames({ offset: 0, color: 'red' }, { offset: 1, color: 'blue' }))

    const reading = readInspectStyles(el, win, props)

    expect(reading.styles.color?.reliability).toBe('animating')
    expect(reading.styles.padding?.reliability).toBe('used')
    expect(reading.animated).toEqual(new Set(['color']))
    expect(reading.animating).toBe(1)
  })

  it('الحركة تتقدّم على «بلا تخطيط» في وسم الخاصّية نفسها', () => {
    const el = element(false)
    animate(el, withFrames({ padding: '10px' }))

    const reading = readInspectStyles(el, win, props)

    expect(reading.styles.padding?.reliability).toBe('animating')
    expect(reading.styles.color?.reliability).toBe('unlaid')
  })

  it('مفاتيح الإطار المحفوظة ليست خصائص: `offset` و`easing` و`composite`', () => {
    const el = element(true)
    animate(el, withFrames({ offset: 0, easing: 'ease-in', composite: 'add', margin: '1px' }))

    const reading = readInspectStyles(el, win, props)

    expect(reading.animated).toEqual(new Set(['margin']))
  })

  it('أسماء الخصائص تُحوَّل من camelCase إلى الشرطة', () => {
    const el = element(true)
    animate(el, withFrames({ backgroundColor: 'red', borderTopWidth: '4px' }))

    const reading = readInspectStyles(el, win, ['background-color', 'border-top-width'])

    expect(reading.animated).toEqual(new Set(['background-color', 'border-top-width']))
    expect(Object.values(reading.styles).map((s) => s.reliability)).toEqual([
      'animating',
      'animating',
    ])
  })

  it('العدّاد يحصي الخصائص المتحرِّكة المتمايزة لا الحركات', () => {
    // حركتان على `color` وواحدة على `margin`: خاصّيتان. وهو ما يقوله المستخدم
    // «حركة جارية على N خاصّية».
    const el = element(true)
    animate(
      el,
      withFrames({ color: 'red' }),
      withFrames({ color: 'blue', margin: '2px' }),
      withFrames({ margin: '3px' }),
    )

    const reading = readInspectStyles(el, win, props)

    expect(reading.animating).toBe(2)
    expect(reading.animated).toEqual(new Set(['color', 'margin']))
  })

  it('حركة بلا `effect` تُتخطّى وغيرها يُقرأ', () => {
    const el = element(true)
    animate(el, { effect: null }, withFrames({ margin: '1px' }))

    expect(readInspectStyles(el, win, props).animated).toEqual(new Set(['margin']))
  })

  it('تأثير بلا `getKeyframes` (تأثير حركة مخصّص) يُتخطّى', () => {
    const el = element(true)
    animate(el, { effect: {} }, withFrames({ margin: '1px' }))

    expect(readInspectStyles(el, win, props).animated).toEqual(new Set(['margin']))
  })

  it('إطارات مفاتيح تُرمى قراءتها لا تُسقط بقيّة الحركات', () => {
    const el = element(true)
    animate(
      el,
      {
        effect: {
          getKeyframes: () => {
            throw new Error('غير قابل للقراءة')
          },
        },
      },
      withFrames({ padding: '5px' }),
    )

    const reading = readInspectStyles(el, win, props)

    expect(reading.animated).toEqual(new Set(['padding']))
    expect(reading.styles.padding?.reliability).toBe('animating')
    expect(reading.styles.color?.reliability).toBe('used')
  })

  it('`getAnimations` التي تُرمى لا تُسقط القراءة كلّها', () => {
    const el = element(true)
    Object.assign(el, {
      getAnimations: () => {
        throw new Error('سياق منتهٍ')
      },
    })

    const reading = readInspectStyles(el, win, props)

    expect(reading.animated.size).toBe(0)
    expect(reading.styles.color?.value).toBe('rgb(0, 0, 0)')
  })

  it('بيئة بلا `getAnimations` تُقرأ كأن لا حركات', () => {
    // happy-dom نفسه: الدالّة غير معرَّفة أصلًا.
    const el = element(true)
    expect('getAnimations' in el).toBe(false)

    expect(readInspectStyles(el, win, props).animating).toBe(0)
  })

  it('قائمة الخصائص المعطاة هي ما يُقرأ وحده', () => {
    const reading = readInspectStyles(element(true), win, ['margin'])

    expect(Object.keys(reading.styles)).toEqual(['margin'])
  })

  it('الافتراضيات: `window` والمجموعة المنتقاة كلّها', () => {
    const el = document.createElement('div')
    el.style.color = 'red'
    document.body.append(el)

    const reading = readInspectStyles(el)

    expect(Object.keys(reading.styles)).toEqual([...INSPECT_PROPS])
    expect(reading.styles.color).toEqual({ value: 'red', reliability: 'used' })
    el.remove()
  })
})

describe('readPseudo — العنصر الزائف الموجود فعلًا', () => {
  const props = ['color', 'margin']

  it('محتوى فعلي يُرجع `content` وكل الخصائص', () => {
    const log: (string | undefined)[] = []
    const win = fakeWin({ content: '"›"', color: 'red', margin: '0px' }, log)

    const out = readPseudo(document.createElement('div'), '::before', win, props)

    expect(out).toEqual({ content: '"›"', color: 'red', margin: '0px' })
    // يُسأل المحرّك عن العنصر الزائف المطلوب لا عن العنصر نفسه.
    expect(log).toEqual(['::before'])
  })

  it('يطلب `::after` حين يُطلب', () => {
    const log: (string | undefined)[] = []

    readPseudo(document.createElement('div'), '::after', fakeWin({ content: '"x"' }, log), props)

    expect(log).toEqual(['::after'])
  })

  it.each([
    ['none', 'none'],
    ['normal', 'normal'],
    ['فارغ', ''],
  ])('المحتوى %s يعني أن العنصر الزائف غير موجود', (_name, content) => {
    // عرض أنماط غير موجود يوهم بوجوده.
    expect(
      readPseudo(
        document.createElement('div'),
        '::before',
        fakeWin({ content, color: 'red' }),
        props,
      ),
    ).toBeNull()
  })

  it('`content: ""` (سلسلة فارغة مقتبسة) عنصر موجود', () => {
    // النصّ المقتبس الفارغ يُنشئ العنصر الزائف فعلًا — الحيلة المعروفة للتزيين.
    const out = readPseudo(
      document.createElement('div'),
      '::before',
      fakeWin({ content: '""', color: 'red' }),
      props,
    )

    expect(out).toMatchObject({ content: '""', color: 'red' })
  })

  it('الافتراضيات: `window` والمجموعة المنتقاة', () => {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (p: string) => (p === 'content' ? '"•"' : `v:${p}`),
    } as unknown as CSSStyleDeclaration)
    const el = document.createElement('div')

    const out = readPseudo(el, '::after')

    expect(spy).toHaveBeenCalledWith(el, '::after')
    expect(out?.content).toBe('"•"')
    for (const prop of INSPECT_PROPS.filter((p) => p !== 'content')) {
      expect(out?.[prop]).toBe(`v:${prop}`)
    }
  })
})

describe('readState — بـ`matches()` لا بافتراض', () => {
  it('كل حالة تُقرأ من مطابقة محدِّدها', () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'matches').mockImplementation(
      (sel: string) => sel === ':hover' || sel === ':focus-within',
    )

    expect(readState(el)).toEqual({
      hover: true,
      focus: false,
      active: false,
      focusWithin: true,
    })
  })

  it('محدِّد لا يدعمه المحرّك يُقرأ `false` ولا يُسقط بقيّة الحالات', () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'matches').mockImplementation((sel: string) => {
      if (sel === ':focus-within') throw new SyntaxError('unsupported selector')
      return sel === ':active'
    })

    expect(readState(el)).toEqual({
      hover: false,
      focus: false,
      active: true,
      focusWithin: false,
    })
  })

  it('عنصر عادي بلا تفاعل: كل الحالات `false`', () => {
    expect(readState(document.createElement('div'))).toEqual({
      hover: false,
      focus: false,
      active: false,
      focusWithin: false,
    })
  })
})

describe('pageOffset — موضع المستند لا النافذة', () => {
  /** مستطيل بلا عرض ولا ارتفاع: حافّتاه `left` و`top` هما `x` و`y` نفساهما. */
  const rectAt = (el: Element, x: number, y: number) =>
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, 0, 0))

  it('عنصر عند أعلى النافذة بعد تمرير 2000px موضعه المستندي 2000', () => {
    const el = document.createElement('div')
    rectAt(el, 0, 0)

    expect(pageOffset(el, { scrollX: 0, scrollY: 2000 } as Window)).toEqual({
      pageX: 0,
      pageY: 2000,
    })
  })

  it('يجمع الإزاحتين الأفقية والرأسية معًا', () => {
    const el = document.createElement('div')
    rectAt(el, 12.5, -30)

    expect(pageOffset(el, { scrollX: 100, scrollY: 400 } as Window)).toEqual({
      pageX: 112.5,
      pageY: 370,
    })
  })

  it('النافذة الافتراضية هي `window`', () => {
    const el = document.createElement('div')
    rectAt(el, 7, 9)
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(3)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(5)

    expect(pageOffset(el)).toEqual({ pageX: 10, pageY: 14 })
  })
})
