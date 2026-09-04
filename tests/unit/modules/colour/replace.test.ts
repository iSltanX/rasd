import { afterEach, describe, expect, it } from 'vitest'

import {
  replaceOnElements,
  replaceVariable,
  revertAll,
  VARIABLE_STYLE_MARKER,
} from '@/modules/colour/replace'

/** يُعيد كل استبدال حيّ بعد كل اختبار — شبكة أمان لا اعتمادًا وحيدًا؛ كل
 * اختبار يُنظِّف مقابضه بنفسه أيضًا، تبعًا لعُرف `usage.test.ts` المجاور. */
afterEach(() => {
  revertAll()
})

describe('بلا أثر متبقٍّ — العقد الذي يفرضه §14 نصًّا', () => {
  it('عنصر بلا سمة style أصلًا يعود بلا سمة إطلاقًا بعد revert()', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    expect(target.hasAttribute('style')).toBe(false)

    const handle = replaceOnElements([target], 'color', 'rgb(1, 2, 3)')
    expect(target.getAttribute('style')).toBe('color:rgb(1, 2, 3)!important')

    handle.revert()
    expect(target.hasAttribute('style')).toBe(false)
    target.remove()
  })

  it('عنصر له سمة style أصلية يعود بنصّها الحرفي بعد revert()', () => {
    const target = document.createElement('div')
    const original = 'color: rgb(9, 9, 9); margin-top: 4px'
    target.setAttribute('style', original)
    document.body.appendChild(target)

    const handle = replaceOnElements([target], 'color', 'rgb(1, 2, 3)')
    expect(target.getAttribute('style')).toBe(`${original};color:rgb(1, 2, 3)!important`)

    handle.revert()
    expect(target.getAttribute('style')).toBe(original)
    target.remove()
  })

  it('سمة style أصلية فارغة نصًّا (`style=""`) تعود فارغة نصًّا، لا تختفي', () => {
    const target = document.createElement('div')
    target.setAttribute('style', '')
    document.body.appendChild(target)
    expect(target.hasAttribute('style')).toBe(true)

    const handle = replaceOnElements([target], 'color', 'rgb(1, 2, 3)')
    handle.revert()

    expect(target.hasAttribute('style')).toBe(true)
    expect(target.getAttribute('style')).toBe('')
    target.remove()
  })

  it('عنصر مكرَّر في القائمة لا يُفسد النسخة الأصلية المحفوظة', () => {
    const target = document.createElement('div')
    target.setAttribute('style', 'color: rgb(1, 1, 1)')
    document.body.appendChild(target)

    const handle = replaceOnElements([target, target], 'color', 'rgb(9, 9, 9)')
    handle.revert()

    expect(target.getAttribute('style')).toBe('color: rgb(1, 1, 1)')
    target.remove()
  })

  it('خاصية مركّبة (box-shadow): تُكتب القيمة حرفيًّا كما مُرِّرت، بلا تفكيك', () => {
    // موثَّق في ترويسة `replace.ts`: الوحدة لا تفهم دلالة `box-shadow`، وعلى
    // المستدعي تمرير تصريح الخاصية كاملًا حين تكون مركّبة.
    const target = document.createElement('div')
    document.body.appendChild(target)

    const handle = replaceOnElements([target], 'box-shadow', '0 1px 2px rgb(1, 2, 3)')
    expect(target.getAttribute('style')).toBe('box-shadow:0 1px 2px rgb(1, 2, 3)!important')

    handle.revert()
    expect(target.hasAttribute('style')).toBe(false)
    target.remove()
  })
})

describe('الورقة المحقونة — تزول بإزالتها', () => {
  it('لا يبقى عنصر <style> تابع لنا في المستند بعد revert()', () => {
    const marker = `style[${VARIABLE_STYLE_MARKER}="--rasd-test-residual"]`
    expect(document.head.querySelectorAll(marker)).toHaveLength(0)

    const handle = replaceVariable('--rasd-test-residual', 'rgb(1, 2, 3)')
    expect(document.head.querySelectorAll(marker)).toHaveLength(1)

    handle.revert()
    expect(document.head.querySelectorAll(marker)).toHaveLength(0)
  })
})

describe('revert() مرّتين لا يرمي ولا يُفسد', () => {
  it('عنصر واحد', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const handle = replaceOnElements([target], 'color', 'rgb(1, 2, 3)')

    expect(() => {
      handle.revert()
      handle.revert()
    }).not.toThrow()
    expect(target.hasAttribute('style')).toBe(false)
    target.remove()
  })

  it('متغيّر CSS', () => {
    const handle = replaceVariable('--rasd-test-twice', 'rgb(4, 5, 6)')

    expect(() => {
      handle.revert()
      handle.revert()
    }).not.toThrow()
    expect(
      document.head.querySelectorAll(`style[${VARIABLE_STYLE_MARKER}="--rasd-test-twice"]`),
    ).toHaveLength(0)
  })
})

describe('استبدال متغيّر يعيد طلاء كل مستخدميه — التزام §14 النصّي', () => {
  /*
   * **ما تثبته هذه الاختبارات فعلًا، لا ما تدّعيه**: happy-dom 20.11.12 (بيئة
   * هذا المشروع) يُحلّ `var()` عبر الـcascade فعليًّا وقت `getComputedStyle`
   * — قِيس صراحةً قبل كتابة هذا الملفّ: إعادة تعريف متغيّر في ورقة تُدرَج
   * لاحقًا تُغيّر القيمة المحسوبة لكل مستهلك، بما فيه مستهلكٌ داخل جذر ظلّ
   * (الوراثة تعبر حدّ الظلّ خلافًا لمطابقة المحدِّدات — التفصيل والتعليل في
   * ترويسة `replace.ts`). فهذه ليست اختبارات مصطنعة تفترض قدرة بيئة لا
   * تملكها فعلًا. **وما لا يثبته**: التطابق الحرفي مع محرّك Blink الحقيقي في
   * حالات حافّة (طبقات `@layer`، خصائص `@property` المسجَّلة، أو أوراق
   * `adoptedStyleSheets`) — محرّك CSS هنا محاكاة لا Blink، وتلك تبقى تحتاج
   * فحصًا بصريًّا حقيقيًّا (بند المرحلة البصري)، لا اختبار وحدة.
   */
  it('يُغيّر القيمة المحسوبة لعنصر يستهلك المتغيّر عبر نمط سطري', () => {
    const target = document.createElement('div')
    target.style.color = 'var(--rasd-test-live)'
    document.body.appendChild(target)

    const before = getComputedStyle(target).color
    const handle = replaceVariable('--rasd-test-live', 'rgb(10, 20, 30)')

    expect(getComputedStyle(target).color).toBe('rgb(10, 20, 30)')
    expect(getComputedStyle(target).color).not.toBe(before)

    handle.revert()
    target.remove()
  })

  it('يُغيّر كل المستخدمين معًا — خاصيتان مختلفتان من المتغيّر نفسه', () => {
    const a = document.createElement('div')
    a.style.color = 'var(--rasd-test-multi)'
    const b = document.createElement('div')
    b.style.backgroundColor = 'var(--rasd-test-multi)'
    document.body.append(a, b)

    const handle = replaceVariable('--rasd-test-multi', 'rgb(11, 22, 33)')
    expect(getComputedStyle(a).color).toBe('rgb(11, 22, 33)')
    expect(getComputedStyle(b).backgroundColor).toBe('rgb(11, 22, 33)')

    handle.revert()
    a.remove()
    b.remove()
  })

  it('الوراثة تعبر حدّ الظلّ — مستهلك داخل جذر ظلّ يتلوّن أيضًا', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('span')
    const innerStyle = document.createElement('style')
    innerStyle.textContent = 'span { color: var(--rasd-test-shadow); }'
    root.append(innerStyle, inner)

    const handle = replaceVariable('--rasd-test-shadow', 'rgb(44, 55, 66)')
    expect(getComputedStyle(inner).color).toBe('rgb(44, 55, 66)')

    handle.revert()
    host.remove()
  })
})

describe('الأسبقية — !important على كل تصريح محقون', () => {
  it('عنصر واحد/كل المطابقات: يهزم قاعدة !important في ورقة بمحدِّد صنف', () => {
    const style = document.createElement('style')
    style.textContent = '.rasd-test-cls { color: rgb(1, 1, 1) !important; }'
    document.head.appendChild(style)

    const target = document.createElement('div')
    target.className = 'rasd-test-cls'
    document.body.appendChild(target)
    expect(getComputedStyle(target).color).toBe('rgb(1, 1, 1)')

    const handle = replaceOnElements([target], 'color', 'rgb(9, 9, 9)')
    expect(getComputedStyle(target).color).toBe('rgb(9, 9, 9)')

    handle.revert()
    style.remove()
    target.remove()
  })

  it('متغيّر: إعادة تعريف لاحقة عند :root تهزم تعريفًا سابقًا بلا !important', () => {
    const base = document.createElement('style')
    base.textContent = ':root { --rasd-test-prec: rgb(1, 1, 1); }'
    document.head.appendChild(base)

    const target = document.createElement('div')
    target.style.color = 'var(--rasd-test-prec)'
    document.body.appendChild(target)
    expect(getComputedStyle(target).color).toBe('rgb(1, 1, 1)')

    const handle = replaceVariable('--rasd-test-prec', 'rgb(9, 9, 9)')
    expect(getComputedStyle(target).color).toBe('rgb(9, 9, 9)')

    handle.revert()
    base.remove()
    target.remove()
  })
})

describe('عنصر يختفي من DOM قبل revert() — لا يرمي', () => {
  it('عنصر واحد يُزال من الشجرة، والاستعادة تقع على المرجع المنفصل بأمان', () => {
    const target = document.createElement('div')
    target.setAttribute('style', 'color: rgb(1, 1, 1)')
    document.body.appendChild(target)

    const handle = replaceOnElements([target], 'color', 'rgb(9, 9, 9)')
    target.remove() // يختفي من DOM قبل التراجع — لا يُلغي صلاحية المرجع

    expect(() => handle.revert()).not.toThrow()
    expect(target.getAttribute('style')).toBe('color: rgb(1, 1, 1)')
  })

  it('ورقة المتغيّر تُزال يدويًا قبل revert() فلا يرمي', () => {
    const handle = replaceVariable('--rasd-test-gone', 'rgb(1, 2, 3)')
    document.head.querySelector(`style[${VARIABLE_STYLE_MARKER}="--rasd-test-gone"]`)?.remove()

    expect(() => handle.revert()).not.toThrow()
  })
})

describe('revertAll — يُلغي كل الاستبدالات الحيّة', () => {
  it('يُعيد عنصرًا وورقة متغيّر معًا، واستدعاء ثانٍ فارغ لا يرمي', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    replaceOnElements([target], 'color', 'rgb(1, 2, 3)')

    const consumer = document.createElement('div')
    consumer.style.color = 'var(--rasd-test-all)'
    document.body.appendChild(consumer)
    replaceVariable('--rasd-test-all', 'rgb(4, 5, 6)')

    expect(target.hasAttribute('style')).toBe(true)
    expect(getComputedStyle(consumer).color).toBe('rgb(4, 5, 6)')

    revertAll()
    expect(target.hasAttribute('style')).toBe(false)
    expect(
      document.head.querySelectorAll(`style[${VARIABLE_STYLE_MARKER}="--rasd-test-all"]`),
    ).toHaveLength(0)

    expect(() => revertAll()).not.toThrow()
    target.remove()
    consumer.remove()
  })

  it('ترتيب LIFO يحفظ الأصل الحقيقي عند تداخل مقبضين على العنصر نفسه', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    expect(target.hasAttribute('style')).toBe(false)

    replaceOnElements([target], 'color', 'rgb(1, 1, 1)') // الأقدم
    replaceOnElements([target], 'color', 'rgb(2, 2, 2)') // الأحدث، فوقه
    expect(target.getAttribute('style')).toBe(
      'color:rgb(1, 1, 1)!important;color:rgb(2, 2, 2)!important',
    )

    revertAll() // يُلغي الأحدث أولًا ثم الأقدم — لا العكس
    expect(target.hasAttribute('style')).toBe(false)
    target.remove()
  })
})

describe('scope — يُشتقّ من طول القائمة (انظر تعليل ترويسة `replace.ts`)', () => {
  it("عنصر واحد بالضبط ← 'element'", () => {
    const target = document.createElement('div')
    const handle = replaceOnElements([target], 'color', 'rgb(1, 2, 3)')
    expect(handle.scope).toBe('element')
    handle.revert()
  })

  it("أكثر من عنصر ← 'matches'", () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const handle = replaceOnElements([a, b], 'color', 'rgb(1, 2, 3)')
    expect(handle.scope).toBe('matches')
    handle.revert()
  })

  it("قائمة فارغة ← 'matches'، ولا يرمي", () => {
    const handle = replaceOnElements([], 'color', 'rgb(1, 2, 3)')
    expect(handle.scope).toBe('matches')
    expect(() => handle.revert()).not.toThrow()
  })

  it("replaceVariable ← 'variable' دومًا", () => {
    const handle = replaceVariable('--rasd-test-scope', 'rgb(1, 2, 3)')
    expect(handle.scope).toBe('variable')
    handle.revert()
  })
})
