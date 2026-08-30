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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { evaluateMedia, evaluateScope, evaluateSupports } from '@/modules/computed-style/conditions'

beforeEach(() => {
  document.body.innerHTML = ''
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
})
