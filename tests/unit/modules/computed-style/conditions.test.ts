/**
 * تقييم الشروط — والقرار الحاكم: **لا كتابة خارج ظلّنا**.
 *
 * العرّاف في نطاق المستند رُفض بثلاثة قياسات: 71× أغلى على github، ومرئيّ
 * لأي سكربت صفحة (`adoptedStyleSheets.length` تنتقل 0 ← 1)، ويُطلق
 * `transitionstart` مرّتين. وما هنا بديله: `matchMedia` و`CSS.supports`
 * و`matches`/`querySelectorAll` — بلا مساس بالصفحة.
 *
 * **حدّ بيئة**: happy-dom بلا `@container` حقيقي وبلا `CSSStyleSheet`
 * قابلة للبناء، فتقييم الحاويات يُقاس في Chrome (`verify-inspect.mjs`).
 * وما يُختبَر هنا هو ما تستطيعه البيئة: `@media` و`@supports` و`@scope`
 * والاعتراف بما لم يُقيَّم.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createContainerProbe,
  disposeContainerProbe,
  evaluateContainer,
  evaluateMedia,
  evaluateScope,
  evaluateSupports,
  type ContainerProbe,
} from '@/modules/computed-style/conditions'

beforeEach(() => {
  document.body.innerHTML = ''
})

/** وصف `defaultView` الأصلي — happy-dom يعرّفه على المستند نفسه لا على نموذجه. */
const ORIGINAL_VIEW = Object.getOwnPropertyDescriptor(document, 'defaultView')

afterEach(() => {
  // الاختبارات تحقن `defaultView` على المستند نفسه؛ بلا هذا يتسرّب الحقن من
  // اختبار إلى ما بعده فيصير النجاح رهنًا بالترتيب.
  if (ORIGINAL_VIEW) Object.defineProperty(document, 'defaultView', ORIGINAL_VIEW)
  else Reflect.deleteProperty(document, 'defaultView')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mediaRule = (text: string): CSSMediaRule =>
  ({ conditionText: text, media: { mediaText: text } }) as unknown as CSSMediaRule

describe('evaluateMedia — من نافذة العنصر لا من نافذتنا', () => {
  it('يستعمل نافذة العنصر', () => {
    /*
     * قيس أن `window.matchMedia` يخطئ 0/3 لعنصر داخل إطار عرضه 400px
     * بينما النافذة 1280px، وأن نافذة العنصر تصيب 3/3. وكل صفحة فيها إطار
     * مضمَّن تقع في هذا.
     */
    const el = document.createElement('div')
    document.body.append(el)
    const spy = vi.fn(() => ({ matches: true }) as MediaQueryList)
    Object.defineProperty(el.ownerDocument, 'defaultView', {
      value: { matchMedia: spy },
      configurable: true,
    })

    expect(evaluateMedia(mediaRule('(min-width: 100px)'), el)).toEqual({
      kind: 'matched',
      value: true,
    })
    expect(spy).toHaveBeenCalledWith('(min-width: 100px)')
  })

  it('شرط فارغ يعني «مطابق دائمًا»', () => {
    const el = document.createElement('div')
    document.body.append(el)
    expect(evaluateMedia(mediaRule(''), el)).toEqual({ kind: 'matched', value: true })
  })

  it('عنصر بلا نافذة يُعلَن غير مقيَّم لا مطابقًا', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'ownerDocument', {
      value: { defaultView: null },
      configurable: true,
    })
    expect(evaluateMedia(mediaRule('(min-width: 1px)'), el)).toEqual({
      kind: 'unevaluated',
      reason: 'detached-view',
    })
  })

  it('شرط يرمي يُعامَل غير مطابق لا مطابقًا', () => {
    const el = document.createElement('div')
    document.body.append(el)
    Object.defineProperty(el.ownerDocument, 'defaultView', {
      value: {
        matchMedia: () => {
          throw new Error('bad')
        },
      },
      configurable: true,
    })
    expect(evaluateMedia(mediaRule('(bogus)'), el)).toEqual({ kind: 'matched', value: false })
  })
})

describe('evaluateSupports', () => {
  const rule = (text: string): CSSSupportsRule =>
    ({ conditionText: text }) as unknown as CSSSupportsRule

  /** عنصر نافذته محقونة — كما تُحقَن في `evaluateMedia`. */
  const withCss = (supports: (c: string) => boolean): Element => {
    const el = document.createElement('div')
    document.body.append(el)
    Object.defineProperty(el.ownerDocument, 'defaultView', {
      value: { CSS: { supports } },
      configurable: true,
    })
    return el
  }

  it('يمرّر النصّ إلى CSS.supports أحاديّ الوسيط', () => {
    const spy = vi.fn(() => true)
    expect(evaluateSupports(rule('(display: grid)'), withCss(spy))).toEqual({
      kind: 'matched',
      value: true,
    })
    expect(spy).toHaveBeenCalledWith('(display: grid)')
  })

  it('بيئة بلا CSS.supports تُعامَل معاملة «مدعوم»', () => {
    /*
     * وجود `@supports` في الورقة يعني أن متصفّحًا ما قبلها؛ وإسقاط قواعدها
     * بلا دليل أسوأ من قبولها.
     */
    const el = document.createElement('div')
    document.body.append(el)
    Object.defineProperty(el.ownerDocument, 'defaultView', { value: {}, configurable: true })
    expect(evaluateSupports(rule('(display: grid)'), el)).toEqual({ kind: 'matched', value: true })
  })

  it('شرط فارغ مطابق', () => {
    expect(evaluateSupports(rule(''))).toEqual({ kind: 'matched', value: true })
  })

  it('الرمي يعني غير مطابق', () => {
    const el = withCss(() => {
      throw new Error('bad')
    })
    expect(evaluateSupports(rule('nonsense'), el)).toEqual({ kind: 'matched', value: false })
  })

  it('يستدعي supports على كائن CSS نفسه لا مفكوكةً منه', () => {
    /*
     * `CSS.supports` تحتاج `this` صحيحًا في المتصفّح وترمي «Illegal
     * invocation» إن فُصلت. فتُستدعى بـ`call` على كائن النافذة نفسه.
     */
    const spy = vi.fn(() => true)
    const cssObject = { supports: spy }
    const el = document.createElement('div')
    document.body.append(el)
    Object.defineProperty(el.ownerDocument, 'defaultView', {
      value: { CSS: cssObject },
      configurable: true,
    })

    evaluateSupports(rule('(display: grid)'), el)
    expect(spy.mock.contexts[0]).toBe(cssObject)
  })

  it('بلا عنصر يُقرأ CSS من النطاق العامّ', () => {
    const spy = vi.fn(() => false)
    vi.stubGlobal('CSS', { supports: spy })

    expect(evaluateSupports(rule('(display: subgrid)'))).toEqual({ kind: 'matched', value: false })
    expect(spy).toHaveBeenCalledWith('(display: subgrid)')
  })

  it('عنصر بلا نافذة يرجع إلى النطاق العامّ أيضًا', () => {
    const spy = vi.fn(() => false)
    vi.stubGlobal('CSS', { supports: spy })
    const el = document.createElement('div')
    Object.defineProperty(el, 'ownerDocument', {
      value: { defaultView: null },
      configurable: true,
    })

    expect(evaluateSupports(rule('(display: grid)'), el)).toEqual({ kind: 'matched', value: false })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('CSS بلا دالّة supports تُعامَل معاملة «مدعوم» كغيابها', () => {
    const el = document.createElement('div')
    document.body.append(el)
    Object.defineProperty(el.ownerDocument, 'defaultView', {
      value: { CSS: { supports: 'not-a-function' } },
      configurable: true,
    })
    expect(evaluateSupports(rule('(display: grid)'), el)).toEqual({ kind: 'matched', value: true })
  })
})

describe('evaluateScope — بلا كتابة', () => {
  const scope = (start: string | null, end: string | null = null) => ({ start, end })

  it('العنصر داخل النطاق', () => {
    document.body.innerHTML = '<div class="a"><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, '.c')).toEqual({ kind: 'matched', value: true })
  })

  it('العنصر خارج النطاق', () => {
    document.body.innerHTML = '<div class="x"><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, '.c').kind).toBe('matched')
    expect(evaluateScope(scope('.a'), t, '.c')).toEqual({ kind: 'matched', value: false })
  })

  it('النطاق الضمنيّ علاقةُ سليلٍ صارمة — الجذر لا يطابق محدِّدًا مجرَّدًا', () => {
    /*
     * قيس: `@scope (.a) { .c {} }` على `<div class="a c">` يعطي **كاذبًا**.
     * وهو فرق لا يُخمَّن: الحدس يقول إن الجذر داخل نطاقه فيطابق.
     */
    document.body.innerHTML = '<div class="a c" id="t"></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, '.c')).toEqual({ kind: 'matched', value: false })
  })

  it('و‏:scope الصريح يطابق الجذر', () => {
    document.body.innerHTML = '<div class="a" id="t"></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, ':scope')).toEqual({ kind: 'matched', value: true })
  })

  it('الحدّ يُقصي ما تحته', () => {
    document.body.innerHTML = '<div class="a"><div class="b"><p class="c" id="t"></p></div></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a', '.b'), t, '.c')).toEqual({ kind: 'matched', value: false })
  })

  it('وما فوق الحدّ يبقى داخل النطاق', () => {
    document.body.innerHTML = '<div class="a"><p class="c" id="t"></p><div class="b"></div></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a', '.b'), t, '.c')).toEqual({ kind: 'matched', value: true })
  })

  it('بلا جذر مطابق ⇒ غير مطابق', () => {
    document.body.innerHTML = '<p class="c" id="t"></p>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.nope'), t, '.c')).toEqual({ kind: 'matched', value: false })
  })

  it('محدِّد جذر غير صالح لا يرمي', () => {
    document.body.innerHTML = '<p id="t"></p>'
    const t = document.getElementById('t')!
    expect(() => evaluateScope(scope('!!!'), t, 'p')).not.toThrow()
  })

  it('بلا بداية يكون النطاق المستند كلّه', () => {
    /*
     * `@scope { … }` بلا محدِّد بداية لا جذر لها غير جذر المستند. والنطاق
     * الضمنيّ يبقى علاقة سليل صارمة كذلك: الجذر نفسه لا يطابق محدِّدًا مجرَّدًا.
     */
    document.body.innerHTML = '<div><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope(null), t, '.c')).toEqual({ kind: 'matched', value: true })
    expect(evaluateScope(scope(null), t, '.other')).toEqual({ kind: 'matched', value: false })
    expect(evaluateScope(scope(null), document.documentElement, 'html')).toEqual({
      kind: 'matched',
      value: false,
    })
  })

  it('مستند بلا جذر لا نطاق فيه ⇒ غير مطابق', () => {
    // عنصر أُنشئ في مستند نُزع منه `documentElement` — لا جذر يُقاس عليه.
    const detached = document.implementation.createHTMLDocument('x')
    detached.removeChild(detached.documentElement)
    const orphan = detached.createElement('p')

    expect(evaluateScope(scope(null), orphan, 'p')).toEqual({ kind: 'matched', value: false })
  })

  it('محدِّد الحدّ الذي يحمل :scope يُستعمل كما كُتب', () => {
    /*
     * `to (:scope > .b)` حدّه أبناء الجذر المباشرون وحدهم. فما تحت `.b` مباشرةً
     * مُقصى، و`.b` الأعمق ليست حدًّا فما تحتها داخل النطاق.
     */
    document.body.innerHTML =
      '<div class="a">' +
      '<div class="b"><p class="c" id="under-direct"></p></div>' +
      '<section><div class="b"><p class="c" id="under-deep"></p></div></section>' +
      '</div>'
    const limit = ':scope > .b'

    expect(
      evaluateScope(scope('.a', limit), document.getElementById('under-direct')!, '.c'),
    ).toEqual({ kind: 'matched', value: false })
    expect(evaluateScope(scope('.a', limit), document.getElementById('under-deep')!, '.c')).toEqual(
      { kind: 'matched', value: true },
    )
  })

  it('حدّ لا يطابق شيئًا لا يُقصي أحدًا', () => {
    document.body.innerHTML = '<div class="a"><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a', '.nowhere'), t, '.c')).toEqual({
      kind: 'matched',
      value: true,
    })
  })

  it('حدّ غير صالح يُعامَل كأنه غير موجود لا كأنه يُقصي', () => {
    document.body.innerHTML = '<div class="a"><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a', '!!!'), t, '.c')).toEqual({ kind: 'matched', value: true })
  })

  it('& الصريحة تُقرأ :scope — على الجذر نفسه', () => {
    document.body.innerHTML = '<div class="a c" id="t"></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, '&.c')).toEqual({ kind: 'matched', value: true })
    expect(evaluateScope(scope('.a'), t, '&.other')).toEqual({ kind: 'matched', value: false })
  })

  it('& الصريحة على عنصر داخل النطاق تحكمها علاقتها بالجذر', () => {
    /*
     * `& > .c` تعني أبناء الجذر المباشرين: الابن يطابق، والحفيد لا — بخلاف
     * `.c` الضمنيّة التي تطابق كل سليل.
     */
    document.body.innerHTML =
      '<div class="a"><p class="c" id="child"></p><div><p class="c" id="grand"></p></div></div>'
    const child = document.getElementById('child')!
    const grand = document.getElementById('grand')!

    expect(evaluateScope(scope('.a'), child, '& > .c')).toEqual({ kind: 'matched', value: true })
    expect(evaluateScope(scope('.a'), grand, '& > .c')).toEqual({ kind: 'matched', value: false })
    expect(evaluateScope(scope('.a'), grand, '.c')).toEqual({ kind: 'matched', value: true })
  })

  it('محدِّد صريح غير صالح لا يرمي ويُعدّ غير مطابق', () => {
    document.body.innerHTML = '<div class="a"><p class="c" id="t"></p></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a'), t, ':scope !!!')).toEqual({ kind: 'matched', value: false })
  })

  it('جذر أُقصي بحدّه لا يمنع جذرًا أبعد من تسويغ العنصر', () => {
    /*
     * الجذر الأقرب `#inner` حدّه `.stop` ابنه المباشر فيُقصي العنصر. أمّا
     * `#outer` فليس `.stop` ابنًا مباشرًا له، فحدّه لا يبلغ العنصر — والعنصر
     * داخل نطاقه.
     */
    document.body.innerHTML =
      '<div class="a" id="outer"><div class="a" id="inner">' +
      '<div class="stop"><p class="c" id="t"></p></div></div></div>'
    const t = document.getElementById('t')!
    expect(evaluateScope(scope('.a', ':scope > .stop'), t, '.c')).toEqual({
      kind: 'matched',
      value: true,
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// ‏@container
// ─────────────────────────────────────────────────────────────────

/*
 * الحكم الحقيقي على `@container` يصدر من محرّك التنسيق ويُقاس في Chrome. وما
 * يُختبَر هنا **عقد البناء** الذي يسبقه: أي سلسلة تُستنسَخ، وبأي أبعاد وخصائص،
 * ومتى تُلصق الورقة، وأن الظلّ يُنظَّف بعد كل تقييم نجح أو فشل. والمتصفّح
 * يُحاكى بنافذة مزيَّفة تُجيب عن `getComputedStyle` وتقرأ ما بُني في الظلّ لحظة
 * السؤال عن الهدف.
 */

type Decls = Record<string, string>

/** نمط محسوب مزيَّف — الأسماء بالترتيب كما يعدّدها `item()`. */
function computedOf(decls: Decls): CSSStyleDeclaration {
  const names = Object.keys(decls)
  return {
    width: decls.width ?? '',
    height: decls.height ?? '',
    length: names.length,
    item: (i: number) => names[i] ?? '',
    getPropertyValue: (name: string) => decls[name] ?? '',
  } as unknown as CSSStyleDeclaration
}

const TARGET_ID = 'rasd-cond-target'

/**
 * يحقن نافذة للعنصر: أنماط الأصل من `styles`، وقيمة `--r` للهدف المستنسَخ
 * تُحسب بـ`onTarget` لحظة السؤال — أي والسلسلة مبنيّة في الظلّ.
 */
function installContainerView(styles: Map<Element, Decls>, onTarget: (target: Element) => string) {
  const view = {
    getComputedStyle: vi.fn((node: Element) =>
      node.id === TARGET_ID
        ? ({ getPropertyValue: () => onTarget(node) } as unknown as CSSStyleDeclaration)
        : computedOf(styles.get(node) ?? {}),
    ),
  }
  Object.defineProperty(document, 'defaultView', { value: view, configurable: true })
  return view
}

const containerRule = (text: string): CSSContainerRule =>
  ({ conditionText: text }) as unknown as CSSContainerRule

/** سلسلة العناصر المبنيّة داخل الظلّ، من الجذر إلى الهدف. */
function builtChain(probe: ContainerProbe): Element[] {
  const out: Element[] = []
  let node: Element | null = probe.root.firstElementChild
  while (node) {
    out.push(node)
    node = node.firstElementChild
  }
  return out
}

describe('createContainerProbe — مضيف دائم مخفيّ بلا صندوق مهدوم', () => {
  it('يُلحَق بجذر المستند ويُخفى بـvisibility لا display', () => {
    /*
     * `display: none` يهدم الاستعلام لأن العنصر بلا صندوق فلا حاوية له —
     * والإخفاء بـ`visibility: hidden` يُبقي الصندوق.
     */
    const probe = createContainerProbe(document)
    try {
      expect(probe.host.parentElement).toBe(document.documentElement)
      expect(probe.doc).toBe(document)
      expect(probe.host.style.visibility).toBe('hidden')
      expect(probe.host.style.display).not.toBe('none')
      expect(probe.host.style.pointerEvents).toBe('none')
    } finally {
      disposeContainerProbe(probe)
    }
  })

  it('ظلّه مغلق: الصفحة لا تصل إليه من مضيفه', () => {
    const probe = createContainerProbe(document)
    try {
      expect(probe.host.shadowRoot).toBeNull()
      expect(probe.root).toBeInstanceOf(ShadowRoot)
    } finally {
      disposeContainerProbe(probe)
    }
  })

  it('التخلّص يزيل المضيف من المستند', () => {
    const probe = createContainerProbe(document)
    disposeContainerProbe(probe)
    expect(probe.host.isConnected).toBe(false)
    expect(document.documentElement.contains(probe.host)).toBe(false)
  })
})

describe('evaluateContainer — عقد البناء قبل حكم المحرّك', () => {
  let probe: ContainerProbe

  beforeEach(() => {
    probe = createContainerProbe(document)
  })

  afterEach(() => {
    disposeContainerProbe(probe)
  })

  it('شرط فارغ مطابق بلا مساس بالظلّ', () => {
    const el = document.createElement('div')
    document.body.append(el)
    const view = installContainerView(new Map(), () => '')
    const replace = vi.spyOn(probe.root, 'replaceChildren')

    expect(evaluateContainer(containerRule(''), el, probe)).toEqual({
      kind: 'matched',
      value: true,
    })
    expect(replace).not.toHaveBeenCalled()
    expect(view.getComputedStyle).not.toHaveBeenCalled()
  })

  it('scroll-state يُردّ غير مقيَّم قبل أن يُسأل عنه أي أب', () => {
    /*
     * دالّة حالة تمرير حيّة لا تُستنسَخ: السلسلة المستنسَخة كانت ستعطي جوابًا
     * يبدو صحيحًا وهو خطأ، فيُعلَن العجز بدل ذلك.
     */
    const el = document.createElement('div')
    document.body.append(el)
    const view = installContainerView(new Map(), () => '1')

    expect(evaluateContainer(containerRule('scroll-state(stuck: top)'), el, probe)).toEqual({
      kind: 'unevaluated',
      reason: 'scroll-state',
    })
    expect(view.getComputedStyle).not.toHaveBeenCalled()
  })

  it('عنصر بلا نافذة يُعلَن غير مقيَّم', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'ownerDocument', {
      value: { defaultView: null },
      configurable: true,
    })
    expect(evaluateContainer(containerRule('(min-width: 300px)'), el, probe)).toEqual({
      kind: 'unevaluated',
      reason: 'detached-view',
    })
  })

  it('يستنسخ سلسلة الحاويات كاملةً من الأبعد إلى الأقرب بأبعادها وخصائصها', () => {
    document.body.innerHTML =
      '<section id="outer"><div id="mid"><article id="plain"><p id="t"></p></article></div></section>'
    const outer = document.getElementById('outer')!
    const mid = document.getElementById('mid')!
    const plain = document.getElementById('plain')!
    const t = document.getElementById('t')!

    const styles = new Map<Element, Decls>([
      [
        outer,
        {
          'container-type': 'inline-size',
          'container-name': 'page',
          width: '800px',
          height: '600px',
          'font-size': '16px',
          direction: 'rtl',
          'writing-mode': 'horizontal-tb',
          '--brand': 'red',
          color: 'blue',
        },
      ],
      // عرض `auto` ليس رقمًا فيُقرأ صفرًا، وحاويةٌ بلا اسم لا تُنسَخ لها `container-name`.
      [mid, { 'container-type': 'size', width: 'auto', height: '320.5px' }],
      // ليست حاوية: `normal` لا تدخل السلسلة.
      [plain, { 'container-type': 'normal', width: '99px' }],
    ])
    let seen: Element[] = []
    installContainerView(styles, () => {
      seen = builtChain(probe)
      return '1'
    })

    evaluateContainer(containerRule('page (min-width: 300px)'), t, probe)

    // خارجية ← وسطى ← الهدف؛ و`plain` وجسم الصفحة وجذرها ليسوا فيها.
    expect(seen).toHaveLength(3)
    const [outerClone, midClone, target] = seen as [HTMLElement, HTMLElement, HTMLElement]
    expect(target.id).toBe(TARGET_ID)

    expect(outerClone.style.getPropertyValue('width')).toBe('800px')
    expect(outerClone.style.getPropertyValue('height')).toBe('600px')
    expect(outerClone.style.getPropertyValue('container-type')).toBe('inline-size')
    expect(outerClone.style.getPropertyValue('container-name')).toBe('page')
    expect(outerClone.style.getPropertyValue('font-size')).toBe('16px')
    expect(outerClone.style.getPropertyValue('direction')).toBe('rtl')
    expect(outerClone.style.getPropertyValue('writing-mode')).toBe('horizontal-tb')
    // الخصائص المخصَّصة لازمة لشروط `style()`؛ وما عداها من الخصائص لا يُنسَخ.
    expect(outerClone.style.getPropertyValue('--brand')).toBe('red')
    expect(outerClone.style.getPropertyValue('color')).toBe('')

    expect(midClone.style.getPropertyValue('width')).toBe('0px')
    expect(midClone.style.getPropertyValue('height')).toBe('320.5px')
    expect(midClone.style.getPropertyValue('container-type')).toBe('size')
    expect(midClone.style.getPropertyValue('container-name')).toBe('')
  })

  it('بلا حاويات يكون الهدف وحده جذر الظلّ', () => {
    const el = document.createElement('div')
    document.body.append(el)
    let seen: Element[] = []
    installContainerView(new Map(), () => {
      seen = builtChain(probe)
      return '1'
    })

    evaluateContainer(containerRule('(min-width: 300px)'), el, probe)

    expect(seen).toHaveLength(1)
    expect(seen[0]!.id).toBe(TARGET_ID)
  })

  it('يلصق نصّ الشرط حرفيًّا في ورقة تُتبنّى لحظة القراءة', () => {
    const el = document.createElement('div')
    document.body.append(el)
    const replaceSync = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync')
    let adoptedDuring = -1
    installContainerView(new Map(), () => {
      adoptedDuring = probe.root.adoptedStyleSheets.length
      return '1'
    })

    evaluateContainer(containerRule('sidebar (min-width: 300px)'), el, probe)

    expect(replaceSync).toHaveBeenCalledWith(
      '@container sidebar (min-width: 300px) { #rasd-cond-target { --r: 1 } }',
    )
    expect(adoptedDuring).toBe(1)
  })

  it('المتغيّر يساوي 1 ⇒ مطابق، وأي غيره ⇒ غير مطابق', () => {
    const el = document.createElement('div')
    document.body.append(el)
    let answer = ' 1 '
    installContainerView(new Map(), () => answer)

    // المسافات حول القيمة لا تفسدها.
    expect(evaluateContainer(containerRule('(min-width: 1px)'), el, probe)).toEqual({
      kind: 'matched',
      value: true,
    })
    // غياب المتغيّر ⇒ لم تُطبَّق القاعدة ⇒ الشرط كاذب.
    answer = ''
    expect(evaluateContainer(containerRule('(min-width: 1px)'), el, probe)).toEqual({
      kind: 'matched',
      value: false,
    })
    answer = '2'
    expect(evaluateContainer(containerRule('(min-width: 1px)'), el, probe)).toEqual({
      kind: 'matched',
      value: false,
    })
  })

  it('ينظّف الظلّ بعد التقييم ويُعاد استعمال المضيف بلا تراكم', () => {
    document.body.innerHTML = '<section id="outer"><p id="t"></p></section>'
    const styles = new Map<Element, Decls>([
      [document.getElementById('outer')!, { 'container-type': 'inline-size', width: '10px' }],
    ])
    const lengths: number[] = []
    installContainerView(styles, () => {
      lengths.push(probe.root.childNodes.length)
      return '1'
    })
    const t = document.getElementById('t')!

    evaluateContainer(containerRule('(min-width: 1px)'), t, probe)
    expect(probe.root.childNodes).toHaveLength(0)
    expect(probe.root.adoptedStyleSheets).toHaveLength(0)

    evaluateContainer(containerRule('(min-width: 1px)'), t, probe)
    // في المرّتين جذر واحد في الظلّ لحظة القراءة: لم يبقَ شيء من الأولى.
    expect(lengths).toEqual([1, 1])
    expect(probe.root.childNodes).toHaveLength(0)
  })

  it('فشل بناء الورقة يُعلَن غير مقيَّم ويُنظَّف الظلّ مع ذلك', () => {
    const el = document.createElement('div')
    document.body.append(el)
    installContainerView(new Map(), () => '1')
    vi.spyOn(CSSStyleSheet.prototype, 'replaceSync').mockImplementation(() => {
      throw new SyntaxError('unsupported')
    })

    expect(evaluateContainer(containerRule('(min-width: 1px)'), el, probe)).toEqual({
      kind: 'unevaluated',
      reason: 'detached-view',
    })
    expect(probe.root.childNodes).toHaveLength(0)
    expect(probe.root.adoptedStyleSheets).toHaveLength(0)
  })

  it('رمي القراءة نفسها لا يُسرَّب ويُنظَّف الظلّ', () => {
    const el = document.createElement('div')
    document.body.append(el)
    installContainerView(new Map(), () => {
      throw new Error('boom')
    })

    expect(evaluateContainer(containerRule('(min-width: 1px)'), el, probe)).toEqual({
      kind: 'unevaluated',
      reason: 'detached-view',
    })
    expect(probe.root.childNodes).toHaveLength(0)
  })
})
