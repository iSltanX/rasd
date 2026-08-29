/**
 * اختبار الاستهداف — بهندسة محقونة.
 *
 * happy-dom بلا محرّك تخطيط: `getBoundingClientRect` يعطي أصفارًا دائمًا،
 * و`elementsFromPoint` غير موجود أصلًا. فما يُختبَر هنا هو **المنطق**:
 * الاستبعاد بالهُويّة، والنزول في الظلّ، وحساب إزاحة الإطار، والمشي في
 * الشجرة. أمّا صدق الأرقام نفسها (التحويلات، القصّ) فمقياسه Chrome حقيقي في
 * `scripts/verify-picker.mjs` — ولا تُدّعى هنا.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { descend, pickAt, probeFrame, stackAt, toFrameSpace } from '@/modules/dom-picker/hit-test'
import { isTargetable, walkDown, walkUp } from '@/modules/dom-picker/inspect'

/** يمنح عنصرًا هندسةً — happy-dom لا يحسبها. */
function setRect(el: Element, x: number, y: number, w: number, h: number): void {
  // `DOMRect` لا كائن حرفي: يعطي الجوانب الثمانية بنفسه، ويتفادى مفاتيح
  // `left`/`right` التي تمنعها قاعدة اللنت في واجهة RTL.
  const rect = new DOMRect(x, y, w, h)
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
  Object.defineProperty(el, 'getClientRects', {
    value: () => (w * h > 0 ? [rect] : []),
    configurable: true,
  })
}

/** عنصر بلا صندوق — `display: contents` أو `display: none`. */
function setBoxless(el: Element): void {
  Object.defineProperty(el, 'getClientRects', { value: () => [], configurable: true })
}

/** نمط مزيَّف يكفي `toFrameSpace`. */
function fakeStyle(props: Record<string, string>, transform = 'none'): CSSStyleDeclaration {
  return {
    transform,
    getPropertyValue: (p: string) => props[p] ?? '',
  } as unknown as CSSStyleDeclaration
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('stackAt — تجاوز طبقتنا', () => {
  it('يستبعد المضيف أيًّا كان موضعه في الكومة', () => {
    const host = document.createElement('rasd-host')
    const a = document.createElement('div')
    const b = document.createElement('div')
    // الحالة المتدهورة: `showPopover` فشل فعلا الصفحةُ مضيفَنا.
    const doc = { elementsFromPoint: () => [a, host, b] } as unknown as Document
    expect(stackAt(doc, 0, 0, host)).toEqual([a, b])
  })

  it('يُبقي الكومة كاملةً ومرتَّبةً حين لا مضيف فيها', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const doc = { elementsFromPoint: () => [a, b] } as unknown as Document
    expect(stackAt(doc, 0, 0, null)).toEqual([a, b])
  })

  it('لا يرمي حين تكون الكومة فارغة (نقطة خارج النافذة)', () => {
    const doc = { elementsFromPoint: () => [] } as unknown as Document
    expect(stackAt(doc, -5, -5, null)).toEqual([])
  })
})

describe('descend — اختراق الظلّ', () => {
  it('ينزل مستوى واحدًا في ظلّ مفتوح', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('span')
    root.append(inner)
    Object.defineProperty(root, 'elementsFromPoint', { value: () => [inner], configurable: true })

    expect(descend(host, 5, 5)).toBe(inner)
  })

  it('ينزل عبر ظلال متعشّشة', () => {
    const outer = document.createElement('div')
    document.body.append(outer)
    const r1 = outer.attachShadow({ mode: 'open' })
    const mid = document.createElement('div')
    r1.append(mid)
    const r2 = mid.attachShadow({ mode: 'open' })
    const deep = document.createElement('b')
    r2.append(deep)
    Object.defineProperty(r1, 'elementsFromPoint', { value: () => [mid], configurable: true })
    Object.defineProperty(r2, 'elementsFromPoint', { value: () => [deep], configurable: true })

    expect(descend(outer, 5, 5)).toBe(deep)
  })

  it('يستبعد مضيفنا من داخل جذر الظلّ — الجذر يختبر المستند كلّه لا شجرته', () => {
    // `ShadowRoot.elementFromPoint` يُجري اختبار إصابة على المستند كلّه ثم
    // يُعيد الاستهداف. فما دامت طبقتنا فوق كل شيء يُرجع **مضيفنا**، فنستهدف
    // أنفسنا. رُصد في Chrome حقيقي، وهذا الاختبار يمنع عودته.
    const rasd = document.createElement('x-rasd')
    document.body.append(rasd)

    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const leaf = document.createElement('div')
    root.append(leaf)

    Object.defineProperty(root, 'elementsFromPoint', {
      value: () => [rasd, leaf, host, document.body],
      configurable: true,
    })

    expect(descend(host, 5, 5, rasd)).toBe(leaf)
  })

  it('يتجاهل مرشّحًا من خارج هذا الجذر', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const outsider = document.createElement('p')
    document.body.append(outsider)

    // الكومة كلّها من المستند لا من الظلّ — لا شيء صالح للنزول إليه.
    Object.defineProperty(root, 'elementsFromPoint', {
      value: () => [outsider, document.body],
      configurable: true,
    })

    expect(descend(host, 5, 5, null)).toBe(host)
  })

  it('يتوقّف عند مضيف الظلّ المغلق — وهو الهدف الصحيح', () => {
    const host = document.createElement('div')
    document.body.append(host)
    host.attachShadow({ mode: 'closed' }) // `.shadowRoot` يبقى null
    expect(descend(host, 5, 5)).toBe(host)
  })

  it('لا يدور إلى ما لا نهاية حين يعيد الجذر مضيفَه', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    Object.defineProperty(root, 'elementsFromPoint', { value: () => [host], configurable: true })
    expect(descend(host, 5, 5)).toBe(host)
  })
})

describe('toFrameSpace — إزاحة الإطار', () => {
  it('يطرح أصل صندوق المحتوى لا مستطيل الحدود', () => {
    const frame = document.createElement('iframe')
    setRect(frame, 100, 50, 320, 220) // 300×200 + حدّ 10px
    const style = fakeStyle({
      'border-left-width': '10px',
      'border-top-width': '10px',
      'padding-left': '0px',
      'padding-top': '0px',
    })
    // عنصر داخلي عند (20,100) محلّيًا ⇒ (130,160) في الأب.
    expect(toFrameSpace(frame, 130, 160, style)).toEqual({ x: 20, y: 100 })
  })

  it('يقسم على المقياس حين يكون الإطار مكبَّرًا', () => {
    const frame = document.createElement('iframe')
    setRect(frame, 100, 150, 180, 120)
    const style = fakeStyle(
      {
        'border-left-width': '8px',
        'border-top-width': '12px',
        'padding-left': '9px',
        'padding-top': '7px',
      },
      'matrix(0.6, 0, 0, 0.6, 0, 0)',
    )
    const p = toFrameSpace(frame, 194.2, 359.4, style)
    expect(p.x).toBeCloseTo((194.2 - 100) / 0.6 - 17, 4)
    expect(p.y).toBeCloseTo((359.4 - 150) / 0.6 - 19, 4)
  })

  it('يتعامل مع تحويل غير صالح كأنه بلا تحويل', () => {
    const frame = document.createElement('iframe')
    setRect(frame, 0, 0, 100, 100)
    const style = fakeStyle({}, 'not-a-matrix')
    expect(toFrameSpace(frame, 10, 20, style)).toEqual({ x: 10, y: 20 })
  })
})

describe('probeFrame — العابر للأصل يُعلَن لا يُخفى', () => {
  it('يُصنّف الإطار الذي يرمي عند القراءة عابرًا للأصل بلا خطأ', () => {
    const frame = document.createElement('iframe')
    Object.defineProperty(frame, 'contentDocument', {
      get() {
        throw new Error('cross-origin')
      },
      configurable: true,
    })
    expect(() => probeFrame(frame)).not.toThrow()
    expect(probeFrame(frame)).toBe('cross-origin')
  })

  it('يُصنّف الإطار المعزول (contentDocument === null) عابرًا للأصل', () => {
    const frame = document.createElement('iframe')
    Object.defineProperty(frame, 'contentDocument', { value: null, configurable: true })
    expect(probeFrame(frame)).toBe('cross-origin')
  })
})

describe('pickAt — الاستهداف الكامل', () => {
  it('يستهدف أوّل عنصر صالح ويتخطّى غير الصالح', () => {
    const bad = document.createElement('div')
    const good = document.createElement('p')
    document.body.append(bad, good)
    setBoxless(bad)
    setRect(good, 0, 0, 50, 20)
    const doc = { elementsFromPoint: () => [bad, good] } as unknown as Document

    expect(pickAt(doc, 5, 5, null)?.el).toBe(good)
  })

  it('يُعلِم الإطار العابر للأصل بلا رمي، والعنصر هو الإطار نفسه', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    setRect(frame, 0, 0, 300, 200)
    Object.defineProperty(frame, 'contentDocument', {
      get() {
        throw new Error('cross-origin')
      },
      configurable: true,
    })
    const doc = { elementsFromPoint: () => [frame] } as unknown as Document

    const hit = pickAt(doc, 10, 10, null)
    expect(hit).toEqual({ el: frame, frames: [], opaqueFrame: true })
  })

  it('ينزل في إطار مطابق للأصل ويسجّل سلسلة الإطارات', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    setRect(frame, 100, 50, 300, 200)

    const innerEl = document.createElement('span')
    setRect(innerEl, 0, 0, 40, 10)
    const innerDoc = { elementsFromPoint: () => [innerEl] } as unknown as Document
    Object.defineProperty(frame, 'contentDocument', { value: innerDoc, configurable: true })

    const view = {
      getComputedStyle: () =>
        fakeStyle({
          'border-left-width': '0px',
          'border-top-width': '0px',
          'padding-left': '0px',
          'padding-top': '0px',
        }),
    } as unknown as Window
    Object.defineProperty(frame, 'ownerDocument', {
      value: { defaultView: view },
      configurable: true,
    })

    const doc = { elementsFromPoint: () => [frame] } as unknown as Document
    const hit = pickAt(doc, 130, 90, null)
    expect(hit?.el).toBe(innerEl)
    expect(hit?.frames).toEqual([frame])
    expect(hit?.opaqueFrame).toBe(false)
  })

  it('يُرجع null حين لا شيء صالح', () => {
    const doc = { elementsFromPoint: () => [] } as unknown as Document
    expect(pickAt(doc, 0, 0, null)).toBeNull()
  })
})

describe('isTargetable', () => {
  it('يرفض ما لا صندوق له (display: contents)', () => {
    const el = document.createElement('div')
    setBoxless(el)
    expect(isTargetable(el)).toBe(false)
  })

  it('يرفض مستطيلًا مساحته صفر رغم وجوده', () => {
    const el = document.createElement('span')
    setRect(el, 0, 0, 0, 0)
    expect(isTargetable(el)).toBe(false)
  })

  it('يرفض ما دون الحدّ الأدنى', () => {
    const el = document.createElement('span')
    setRect(el, 0, 0, 1, 1)
    expect(isTargetable(el)).toBe(false)
  })

  it('يقبل عنصرًا ذا مساحة', () => {
    const el = document.createElement('div')
    setRect(el, 0, 0, 10, 10)
    expect(isTargetable(el)).toBe(true)
  })

  it('يجمع مساحات الأسطر في مضمَّن ملتفّ', () => {
    const el = document.createElement('a')
    Object.defineProperty(el, 'getClientRects', {
      value: () => [new DOMRect(0, 0, 100, 17), new DOMRect(0, 17, 83, 17)],
      configurable: true,
    })
    expect(isTargetable(el)).toBe(true)
  })

  it.each(['SCRIPT', 'STYLE', 'META', 'BR', 'TEMPLATE'])('يرفض <%s> مهما كانت هندسته', (tag) => {
    const el = document.createElement(tag)
    setRect(el, 0, 0, 100, 100)
    expect(isTargetable(el)).toBe(false)
  })

  it('يقبل عنصرًا شفّافًا تمامًا — قد يكون هو المقصود', () => {
    const el = document.createElement('div')
    el.style.opacity = '0'
    setRect(el, 0, 0, 40, 40)
    expect(isTargetable(el)).toBe(true)
  })

  it('يرفض null', () => {
    expect(isTargetable(null)).toBe(false)
  })
})

describe('المشي في الشجرة ↑↓', () => {
  it('↑ يعطي الأب ذا المساحة', () => {
    document.body.innerHTML = '<main><section><p>x</p></section></main>'
    const p = document.querySelector('p')!
    const section = document.querySelector('section')!
    setRect(p, 0, 0, 50, 20)
    setRect(section, 0, 0, 100, 40)
    setRect(document.querySelector('main')!, 0, 0, 200, 80)
    expect(walkUp(p)).toBe(section)
  })

  it('↑ يتخطّى الأغلفة عديمة الصندوق بدل التوقّف عندها', () => {
    document.body.innerHTML = '<main><div id="wrap"><p>x</p></div></main>'
    const p = document.querySelector('p')!
    const wrap = document.getElementById('wrap')!
    const main = document.querySelector('main')!
    setRect(p, 0, 0, 50, 20)
    setBoxless(wrap)
    setRect(main, 0, 0, 200, 80)
    expect(walkUp(p)).toBe(main)
  })

  it('↑ يتوقّف عند <html> فلا يصعد إلى المستند', () => {
    setRect(document.documentElement, 0, 0, 800, 600)
    setRect(document.body, 0, 0, 800, 600)
    expect(walkUp(document.body)).toBeNull()
  })

  it('↓ يعطي أوّل ابن ذي مساحة بترتيب DOM', () => {
    document.body.innerHTML = '<section><p id="one">a</p><p id="two">b</p></section>'
    const section = document.querySelector('section')!
    const one = document.getElementById('one')!
    const two = document.getElementById('two')!
    setRect(section, 0, 0, 100, 60)
    setRect(one, 0, 0, 100, 20)
    setRect(two, 0, 30, 100, 20)
    expect(walkDown(section)).toBe(one)
  })

  it('↓ يغوص داخل غلاف عديم الصندوق', () => {
    document.body.innerHTML = '<section><div id="wrap"><b id="deep">x</b></div></section>'
    const section = document.querySelector('section')!
    setRect(section, 0, 0, 100, 60)
    setBoxless(document.getElementById('wrap')!)
    const deep = document.getElementById('deep')!
    setRect(deep, 0, 0, 20, 10)
    expect(walkDown(section)).toBe(deep)
  })

  it('↓ يُرجع null على ورقة', () => {
    document.body.innerHTML = '<p>x</p>'
    const p = document.querySelector('p')!
    setRect(p, 0, 0, 50, 20)
    expect(walkDown(p)).toBeNull()
  })

  it('↑ ثم ↓ يعودان إلى نقطة البدء — شرط ألّا يبدو التنقّل عشوائيًا', () => {
    document.body.innerHTML = '<main><section><p id="a">a</p><p id="b">b</p></section></main>'
    const a = document.getElementById('a')!
    const section = document.querySelector('section')!
    setRect(document.querySelector('main')!, 0, 0, 300, 200)
    setRect(section, 0, 0, 200, 100)
    setRect(a, 0, 0, 100, 20)
    setRect(document.getElementById('b')!, 0, 30, 100, 20)

    const up = walkUp(a)
    expect(up).toBe(section)
    expect(walkDown(up!)).toBe(a)
  })
})

describe('لا نداء إلى getComputedStyle في مسار الاستهداف', () => {
  it('الاستهداف والمشي لا يمسّان الأنماط المحسوبة', () => {
    const spy = vi.spyOn(globalThis, 'getComputedStyle')
    document.body.innerHTML = '<section><p>x</p></section>'
    const section = document.querySelector('section')!
    const p = document.querySelector('p')!
    setRect(section, 0, 0, 100, 60)
    setRect(p, 0, 0, 50, 20)

    walkDown(section)
    walkUp(p)
    isTargetable(p)

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
