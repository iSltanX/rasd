import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildSelector,
  selectorLength,
  shortLabel,
  stableClasses,
} from '@/modules/dom-picker/selector'
import { generatorOf, isUnstableClass, isUnstableId } from '@/modules/dom-picker/unstable-names'

/**
 * مولّد المحدِّدات — أخطر وحدة في المرحلة 9.
 *
 * ثلاث خصائص تُختبَر منفصلة لأنها تنكسر منفصلة:
 *   **التفرّد** شرط صحّة — يُفحَص بتشغيل المحدِّد على المستند نفسه لا بالثقة.
 *   **الاستقرار** شرط نفع — يُفحَص بتوليد، ثم تغيير لا صلة له، ثم إعادة توليد.
 *   **القصر** راحة — يُقاس بحدّ أعلى لكل بنية.
 */

let host: HTMLElement | null = null

afterEach(() => {
  host?.remove()
  host = null
  vi.unstubAllGlobals()
})

/** يبني شجرة ويُرجع جذرها. */
function mount(html: string): HTMLElement {
  host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

/** يتحقّق أن المحدِّد يطابق العنصر المقصود وحده فعلًا. */
function expectResolves(selector: string, el: Element) {
  const found = document.querySelectorAll(selector)
  expect(found.length, `«${selector}» طابق ${found.length} عنصرًا`).toBe(1)
  expect(found[0]).toBe(el)
}

// ─────────────────────────────────────────────────────────────────

describe('كشف الأصناف المولَّدة', () => {
  it.each([
    ['sc-bdVaJa', 'styled-components'],
    ['sc-gsTCUz', 'styled-components'],
    ['css-1x2y3z', 'emotion'],
    ['css-0', 'emotion'],
    ['jsx-1234567890', 'styled-jsx'],
    ['svelte-1x2y3z', 'svelte'],
    ['_ngcontent-abc-c12', 'angular'],
    ['_nghost-xyz', 'angular'],
    ['Button_root__2Ab3d', 'css-modules'],
    ['_root_1a2b3_4', 'css-modules'],
  ] as const)('%s يُرفَض (%s)', (name, tool) => {
    expect(isUnstableClass(name)).toBe(true)
    // الأداة المُبلَّغة تُثبت أن القاعدة المسمّاة هي التي طابقت، لا الاحتياطي.
    expect(generatorOf(name)).toBe(tool)
  })

  it('بصمة غير معروفة الأداة تُرفَض احتياطًا', () => {
    expect(isUnstableClass('a1b2c3d4')).toBe(true)
    expect(generatorOf('a1b2c3d4')).toBe('hash-like')
  })

  it.each([
    'btn',
    'card',
    'hero-title',
    'MuiButton-root',
    'btn-primary',
    'grid-cols-12',
    'mt-4',
    'z-50',
    'text-2xl',
    'is-active',
    'has-error',
    'col-md-6',
  ])('%s يُقبَل — اسم مقروء لا بصمة', (name) => {
    expect(isUnstableClass(name), `${name} رُفض خطأً`).toBe(false)
  })

  it('الأصناف المستقرّة وحدها تُستخرَج', () => {
    const root = mount('<div class="card css-1x2y3z sc-bdVaJa hero"></div>')
    const el = root.firstElementChild as Element
    expect(stableClasses(el)).toEqual(['card', 'hero'])
  })
})

describe('كشف المعرّفات المولَّدة', () => {
  it.each([':r1:', ':r2a:', '«r7»', 'radix-0', 'headlessui-menu-1', 'cdk-overlay-3', 'input-42'])(
    '%s يُرفَض',
    (id) => {
      expect(isUnstableId(id)).toBe(true)
    },
  )

  it.each(['main', 'app', 'site-header', 'nav-primary', 'checkout-form'])('%s يُقبَل', (id) => {
    expect(isUnstableId(id), `${id} رُفض خطأً`).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────

/**
 * أربعون بنية — كل واحدة تُوثَّق بما تختبره، لا مجرّد عدّ.
 *
 * `pick` يعطي العنصر المستهدَف من الجذر المركَّب، و`maxLen` حدّ القصر
 * المقبول لتلك البنية.
 */
const STRUCTURES: ReadonlyArray<{
  name: string
  html: string
  pick: (root: HTMLElement) => Element
  maxLen: number
  /** هل يُقبَل أن يسقط إلى محدِّد موضعي؟ */
  positionalOk?: boolean
}> = [
  {
    name: 'معرّف مستقرّ — أقصر ما يمكن',
    html: '<div id="main"><p>x</p></div>',
    pick: (r) => r.querySelector('#main')!,
    maxLen: 6,
  },
  {
    name: 'معرّف مولَّد يُتجاهَل لصالح الصنف',
    html: '<div id=":r1:" class="panel"></div>',
    pick: (r) => r.querySelector('.panel')!,
    maxLen: 20,
  },
  {
    name: 'سمة اختبار تسبق الأصناف',
    html: '<button data-testid="submit" class="btn btn-lg">go</button>',
    pick: (r) => r.querySelector('button')!,
    maxLen: 30,
  },
  {
    name: 'صنف واحد فريد',
    html: '<div class="hero"></div><div class="other"></div>',
    pick: (r) => r.querySelector('.hero')!,
    maxLen: 12,
  },
  {
    name: 'صنف مكرَّر يحتاج جدًّا',
    html: '<section class="a"><i class="x"></i></section><section class="b"><i class="x"></i></section>',
    pick: (r) => r.querySelector('.b .x')!,
    maxLen: 24,
  },
  {
    name: 'أصناف مولَّدة كلّها — يسقط إلى الوسم والموضع',
    html: '<div class="css-1a2b3c"></div><div class="css-4d5e6f"></div>',
    pick: (r) => r.querySelectorAll('div')[1]!,
    maxLen: 90,
    positionalOk: true,
  },
  {
    name: 'وسم فريد في المستند',
    html: '<main><article></article></main>',
    pick: (r) => r.querySelector('article')!,
    maxLen: 16,
  },
  {
    name: 'إخوة متطابقون تمامًا',
    html: '<ul><li></li><li></li><li></li></ul>',
    pick: (r) => r.querySelectorAll('li')[2]!,
    maxLen: 90,
    positionalOk: true,
  },
  {
    name: 'عنصر عميق داخل معرّف',
    html: '<div id="app"><div><div><span class="leaf"></span></div></div></div>',
    pick: (r) => r.querySelector('.leaf')!,
    maxLen: 24,
  },
  {
    name: 'أصناف متعدّدة، واحد منها يكفي',
    html: '<div class="a b c unique-one"></div><div class="a b c"></div>',
    pick: (r) => r.querySelector('.unique-one')!,
    maxLen: 20,
  },
  {
    name: 'معرّف مكرَّر (HTML غير صالح) — لا يُعتمَد عليه',
    html: '<div id="dup" class="first"></div><div id="dup" class="second"></div>',
    pick: (r) => r.querySelector('.second')!,
    maxLen: 20,
  },
  {
    name: 'صنف يحتاج تهريبًا',
    html: '<div class="md:flex"></div>',
    pick: (r) => r.querySelector('div')!,
    maxLen: 30,
  },
  {
    name: 'سمة اختبار بديلة data-cy',
    html: '<a data-cy="link-home">home</a>',
    pick: (r) => r.querySelector('a')!,
    maxLen: 30,
  },
  {
    name: 'عنصر بلا أصناف بين إخوة مختلفي الوسوم',
    html: '<div><span></span><em></em><b></b></div>',
    pick: (r) => r.querySelector('em')!,
    maxLen: 16,
  },
  {
    name: 'جدول متداخل',
    html: '<table><tbody><tr><td class="cell"></td></tr></tbody></table>',
    pick: (r) => r.querySelector('.cell')!,
    maxLen: 20,
  },
  {
    name: 'نموذج بحقول متشابهة',
    html: '<form><input name="a" class="fld"><input name="b" class="fld"></form>',
    pick: (r) => r.querySelectorAll('input')[1]!,
    maxLen: 90,
    positionalOk: true,
  },
  {
    name: 'عنصر بمعرّف عدّاد يُتجاهَل',
    html: '<div id="row-17" class="row-special"></div>',
    pick: (r) => r.querySelector('.row-special')!,
    maxLen: 24,
  },
  {
    name: 'صنف Tailwind مع رقم دلالي',
    html: '<div class="grid-cols-12"></div>',
    pick: (r) => r.querySelector('div')!,
    maxLen: 24,
  },
  {
    name: 'خليط: صنف ثابت وصنف مولَّد',
    html: '<div class="Card css-9z8y7x"></div>',
    pick: (r) => r.querySelector('.Card')!,
    maxLen: 16,
  },
  {
    name: 'وسم مخصَّص (web component)',
    html: '<my-widget class="w"></my-widget>',
    pick: (r) => r.querySelector('my-widget')!,
    maxLen: 20,
  },
]

describe(`أربعون بنية — التفرّد إلزامي (${STRUCTURES.length} صريحة + مولَّدة)`, () => {
  for (const s of STRUCTURES) {
    it(s.name, () => {
      const root = mount(s.html)
      const el = s.pick(root)
      const result = buildSelector(el)

      expect(result.selector, 'محدِّد فارغ').not.toBe('')
      expectResolves(result.selector, el)
      expect(result.unique).toBe(true)

      if (!s.positionalOk) {
        expect(result.positional, 'سقط إلى محدِّد موضعي بلا داعٍ').toBe(false)
      }
      expect(
        selectorLength(result),
        `«${result.selector}» أطول من ${s.maxLen}`,
      ).toBeLessThanOrEqual(s.maxLen)
    })
  }

  /** عشرون بنية مولَّدة: عمق متزايد بأصناف مكرَّرة — الحالة الأصعب. */
  for (let depth = 1; depth <= 20; depth++) {
    it(`عمق ${depth} بأصناف مكرَّرة`, () => {
      const inner = '<span class="dup"></span>'
      let html = inner
      for (let i = 0; i < depth; i++) html = `<div class="wrap">${html}</div>`
      const root = mount(`<div class="tree-a">${html}</div><div class="tree-b">${html}</div>`)

      const el = root.querySelector('.tree-b')!.querySelector('.dup')!
      const result = buildSelector(el)

      expectResolves(result.selector, el)
      expect(result.unique).toBe(true)
    })
  }
})

// ─────────────────────────────────────────────────────────────────

describe('الاستقرار — تغيير لا صلة له لا يغيّر المحدِّد', () => {
  const BASE = `
    <div id="app">
      <header class="site-head"><h1 class="title">عنوان</h1></header>
      <main class="content"><p class="para">نصّ</p></main>
    </div>`

  const MUTATIONS: ReadonlyArray<{ name: string; apply: (root: HTMLElement) => void }> = [
    {
      name: 'إضافة أخ بعد الهدف',
      apply: (r) => r.querySelector('main')!.append(document.createElement('div')),
    },
    {
      name: 'إضافة أخ قبل الهدف',
      apply: (r) => r.querySelector('main')!.prepend(document.createElement('div')),
    },
    { name: 'إضافة صنف على عنصر آخر', apply: (r) => r.querySelector('h1')!.classList.add('extra') },
    {
      name: 'إضافة عنصر في الترويسة',
      apply: (r) => r.querySelector('header')!.append(document.createElement('nav')),
    },
    {
      name: 'تغيير نصّ عنصر آخر',
      apply: (r) => {
        r.querySelector('h1')!.textContent = 'آخر'
      },
    },
    {
      name: 'إضافة سمة style',
      apply: (r) => r.querySelector('main')!.setAttribute('style', 'color:red'),
    },
    {
      name: 'إضافة صنف مولَّد على الهدف',
      apply: (r) => r.querySelector('.para')!.classList.add('css-9a8b7c'),
    },
    { name: 'إزالة عنصر لا صلة له', apply: (r) => r.querySelector('h1')!.remove() },
    {
      name: 'تبديل ترتيب عناصر الترويسة',
      apply: (r) => {
        const h = r.querySelector('header')!
        h.append(h.firstElementChild!)
      },
    },
  ]

  for (const m of MUTATIONS) {
    it(m.name, () => {
      const root = mount(BASE)
      const before = buildSelector(root.querySelector('.para')!).selector

      m.apply(root)

      const target =
        root.querySelector('#app .content > .para') ?? root.querySelector('.content .para')!
      const after = buildSelector(target).selector

      expect(after, `تغيّر المحدِّد من «${before}» إلى «${after}»`).toBe(before)
    })
  }

  /**
   * ثلاثة تغييرات **ذات صلة** يجب أن تغيّر المحدِّد — وإلا كذب.
   *
   * أوّل اختبار كتبته هنا صنّف «إضافة شجرة في مكان آخر» تغييرًا لا صلة له،
   * وفشل. والفشل كان في الاختبار لا في الشيفرة: تلك الشجرة تحوي عنصرًا بصنف
   * الهدف نفسه، فـ`p.para` لم يعد فريدًا. تغييره **صواب** لا انحراف.
   */
  it('تكرار صنف الهدف في مكان آخر يوسّع المحدِّد — والنتيجة تبقى فريدة', () => {
    const root = mount(BASE)
    const before = buildSelector(root.querySelector('.para')!).selector

    const twin = document.createElement('section')
    twin.innerHTML = '<p class="para"></p>'
    root.querySelector('header')!.append(twin)

    const target = root.querySelector('.content .para')!
    const after = buildSelector(target)

    expect(after.selector).not.toBe(before)
    expect(after.unique).toBe(true)
    expectResolves(after.selector, target)
  })

  it('تغيير **ذو صلة** يجوز أن يغيّره — إعادة تسمية صنف الهدف', () => {
    const root = mount(BASE)
    const before = buildSelector(root.querySelector('.para')!).selector
    root.querySelector('.para')!.className = 'paragraph'
    const after = buildSelector(root.querySelector('.paragraph')!).selector
    expect(after).not.toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('جذر الظلّ', () => {
  it('يُولَّد داخل الجذر ويوسَم به', () => {
    const root = mount('<div id="hostel"></div>')
    const shadowHost = root.querySelector('#hostel')!
    const shadow = shadowHost.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<div class="inner"><b class="deep"></b></div>'

    const el = shadow.querySelector('.deep')!
    const result = buildSelector(el)

    expect(result.inShadow).toBe(true)
    expect(result.unique).toBe(true)
    // يُشغَّل على الجذر لا على المستند — والمستند لا يراه إطلاقًا.
    expect(shadow.querySelectorAll(result.selector)).toHaveLength(1)
    expect(document.querySelectorAll(result.selector)).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('الاسم المختصر للبطاقة', () => {
  it('يفضّل المعرّف ثم الصنف ثم الوسم', () => {
    const root = mount(
      '<div id="main" class="a"></div><div class="hero-title"></div><em></em><div class="css-1a2b3c"></div>',
    )
    expect(shortLabel(root.querySelector('#main')!)).toBe('#main')
    expect(shortLabel(root.querySelector('.hero-title')!)).toBe('.hero-title')
    expect(shortLabel(root.querySelector('em')!)).toBe('em')
    // صنف مولَّد لا يُعرَض — الوسم أصدق منه.
    expect(shortLabel(root.querySelector('.css-1a2b3c')!)).toBe('div')
  })
})

// ─────────────────────────────────────────────────────────────────

describe('سمة الاختبار', () => {
  it('سمة مكرَّرة على عنصرين لا تكفي — يُميَّز الهدف بصنفه', () => {
    // السمة أقوى إشارة نيّة، لكن تفرّدها يُختبَر فعلًا: حين تتكرّر يُجرَّب
    // ما بعدها بدل ادّعاء تفرّد باطل.
    const root = mount(
      '<button data-testid="action" class="first"></button><button data-testid="action" class="second"></button>',
    )
    const el = root.querySelector('.second')!
    const result = buildSelector(el)

    expect(result.selector).toBe('button.second')
    expect(result.unique).toBe(true)
    expectResolves(result.selector, el)
  })

  it('سمة الجدّ الفريدة تُستعمل في المسار حين لا يميّز العنصر شيءٌ بنفسه', () => {
    const root = mount('<div data-testid="panel"><i></i></div><div class="other"><i></i></div>')
    const el = root.querySelector('[data-testid="panel"] > i')!
    const result = buildSelector(el)

    expect(result.selector).toBe('[data-testid="panel"] i')
    expect(result.positional).toBe(false)
    expectResolves(result.selector, el)
  })

  it('قيمة تحوي علامة اقتباس تُهرَّب داخل المحدِّد', () => {
    // النصّ الناتج يُقرأ من الاسم المختصر لأن محرّك المحدِّدات في happy-dom لا
    // يقرأ الاقتباس المهرَّب داخل قيمة سمة (يرمي)، فلا يُقاس هنا أنه يُطابق —
    // ما يُقاس أن العلامة لا تخرج من الاقتباس المحيط فتكسر المحدِّد.
    const root = mount('<button data-testid=\'say "hi"\'>x</button>')
    expect(shortLabel(root.querySelector('button')!)).toBe('[data-testid="say \\"hi\\""]')
  })

  it('الاسم المختصر يرجع إلى سمة الاختبار حين لا معرّف ولا صنف مستقرّ', () => {
    const root = mount('<button class="css-1a2b3c" data-testid="go">x</button>')
    expect(shortLabel(root.querySelector('button')!)).toBe('[data-testid="go"]')
  })
})

describe('معرّف الجدّ', () => {
  it('معرّف الجدّ المستقرّ يقصّر المسار ويجعله فريدًا', () => {
    const root = mount('<div id="a"><p class="x"></p></div><div id="b"><p class="x"></p></div>')
    const el = root.querySelector('#b > p')!
    const result = buildSelector(el)

    expect(result.selector).toBe('#b p.x')
    expect(result.positional).toBe(false)
    expectResolves(result.selector, el)
  })

  it('معرّف الجدّ المولَّد لا يدخل المحدِّد أبدًا', () => {
    // `:r1:` يتغيّر مع كل تركيب — محدِّد يحمله يموت عند أوّل إعادة عرض.
    const root = mount(
      '<div id=":r1:"><p class="x"></p></div><div id="keep"><p class="x"></p></div>',
    )
    const el = root.querySelector('[id=":r1:"] > p')!
    const result = buildSelector(el)

    // التهريب يحوّل `:r1:` إلى `\:r1\:` فلا يكفي البحث عن النصّ الخام — يُبحَث عن الاسم نفسه.
    expect(result.selector).not.toContain('r1')
    expect(result.unique).toBe(true)
    expectResolves(result.selector, el)
  })

  it('معرّف جدّ مستقرّ لا يكفي وحده يُتجاوَز إلى الموضع بلا ادّعاء تفرّد كاذب', () => {
    // شقيقان متطابقان تحت الجدّ نفسه: `#list span.x` يطابق الاثنين.
    const root = mount('<div id="list"><span class="x"></span><span class="x"></span></div>')
    const el = root.querySelectorAll('span')[1]!
    const result = buildSelector(el)

    expect(result.positional).toBe(true)
    expect(result.unique).toBe(true)
    expectResolves(result.selector, el)
  })
})

describe('المسار الموضعي', () => {
  it('لا يحتسب الإخوة من وسوم أخرى في ترتيب `nth-of-type`', () => {
    // `em` قبل `i` لا يزيح رقم الموضع: `nth-of-type` يعدّ الوسم نفسه فقط.
    const root = mount('<div><em></em><i class="css-1a2b3"></i><i class="css-4c5d6"></i></div>')
    const el = root.querySelectorAll('i')[1]!
    const result = buildSelector(el)

    expect(result.positional).toBe(true)
    expect(result.selector.endsWith('i:nth-of-type(2)')).toBe(true)
    expect(result.unique).toBe(true)
    expectResolves(result.selector, el)
  })

  /**
   * الوسم `unique` صادق دائمًا: يُقاس بتشغيل المحدِّد لا يُفترَض. أخوان
   * متطابقان في أعلى جذر ظلّ لا أب لهما يصعد إليه المسار الموضعي، فلا موضع
   * يُكتب لهما — والنتيجة ألّا يُدَّعى تفرّد لا يثبت.
   */
  it('الوسم `unique` يطابق ما يثبت فعلًا داخل جذر الظلّ', () => {
    const root = mount('<div id="hostel"></div>')
    const shadow = root.querySelector('#hostel')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<i></i><i></i>'
    const el = shadow.querySelectorAll('i')[1]!

    const result = buildSelector(el)

    const found = shadow.querySelectorAll(result.selector)
    expect(result.inShadow).toBe(true)
    expect(result.positional).toBe(true)
    expect(result.unique).toBe(found.length === 1 && found[0] === el)
  })
})

describe('تهريب المعرّفات بلا CSS.escape', () => {
  // بيئات قديمة بلا `CSS` أو بلا `CSS.escape`: الاحتياطي يغطّي الحالة الشائعة.
  it.each([
    ['CSS غائب', undefined],
    ['CSS بلا escape', {}],
  ] as const)('%s — صنف بنقطتين يُهرَّب ويبقى المحدِّد فريدًا', (_name, stub) => {
    vi.stubGlobal('CSS', stub)
    const root = mount('<div class="md:flex"></div>')
    const el = root.querySelector('div')!

    const result = buildSelector(el)

    expect(result.selector).toBe('div.md\\:flex')
    expect(result.unique).toBe(true)
    expectResolves(result.selector, el)
  })
})
