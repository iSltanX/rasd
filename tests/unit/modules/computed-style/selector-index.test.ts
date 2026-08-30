/**
 * فهرس المحدِّدات — والإصلاحات الأربعة التي قِيس أثر كلٍّ منها.
 *
 * المرجع المقيس: فهرس خام خالف المسح الخطّي في 545 حالة على 2000 عنصر عبر
 * خمسة مواقع؛ وبالإصلاحات الأربعة صار الفرق **صفرًا**. وكل حالة هنا تمثّل
 * إصلاحًا بعينه — فسقوطها يعني عودة فرق مقيس لا تراجعًا نظريًّا.
 */
import { describe, expect, it } from 'vitest'

import {
  bucketKey,
  bucketsFor,
  candidatesFor,
  CATCH_ALL,
  entriesForSelector,
  indexRules,
  unescapeIdent,
  type IndexedRule,
} from '@/modules/computed-style/selector-index'

describe('bucketKey — المفتاح الأساسي', () => {
  it.each([
    ['#main', '#main'],
    ['.card', '.card'],
    ['div', 'div'],
    ['*', CATCH_ALL],
    ['', CATCH_ALL],
    ['div.card', '.card'],
    ['#a.b', '#a'],
    ['.a.b', '.a'],
  ])('%s ⇒ %s', (sel, want) => {
    expect(bucketKey(sel)).toBe(want)
  })

  it('يأخذ آخر مُركِّب لا أوّله', () => {
    expect(bucketKey('.wrap .inner')).toBe('.inner')
    expect(bucketKey('#page > article .title')).toBe('.title')
    expect(bucketKey('nav + main')).toBe('main')
  })

  it('لا يُقسَم عند مسافة داخل أقواس', () => {
    expect(bucketKey(':is(a b) .last')).toBe('.last')
    expect(bucketKey('.x:has(> .y)')).toBe('.x')
  })
})

describe('الإصلاح 1 — فكّ التهريب', () => {
  it('الصنف المُهرَّب يعطي اسمه الحقيقي', () => {
    expect(bucketKey('.md\\:flex')).toBe('.md:flex')
    expect(unescapeIdent('md\\:flex')).toBe('md:flex')
  })

  it('يطابق ما يعطيه classList', () => {
    // العنصر يحمل الصنف `md:flex` غير مُهرَّب؛ والمحدِّد يحمله مُهرَّبًا.
    const el = document.createElement('div')
    el.className = 'md:flex'
    expect(bucketsFor(el)).toContain(bucketKey('.md\\:flex'))
  })
})

describe('الإصلاح 2 — القطع عند السمة', () => {
  it('الصنف يسبق السمة', () => {
    expect(bucketKey('.a[data-x]')).toBe('.a')
    expect(bucketKey('input[type="text"]')).toBe('input')
  })

  it('السمة وحدها بلا مفتاح', () => {
    expect(bucketKey('[data-x]')).toBe(CATCH_ALL)
  })

  it('لا يخدعه محتوى السمة', () => {
    expect(bucketKey('[title=".fake"]')).toBe(CATCH_ALL)
    expect(bucketKey('a[href="#frag"]')).toBe('a')
  })
})

describe('الإصلاح 3 — localName لا tagName', () => {
  it('العنصر يعطي اسمًا بحروف صغيرة', () => {
    const el = document.createElement('DIV')
    expect(el.tagName).toBe('DIV')
    expect(bucketsFor(el)).toContain('div')
  })

  it('المحدِّد بحروف كبيرة يعطي المفتاح نفسه', () => {
    expect(bucketKey('DIV')).toBe('div')
  })
})

describe('الإصلاح 4 — التهريب السداسي العشري ينتهي بمسافة', () => {
  it('‏\\32 لا يُقرأ فاصلًا فيُقرأ ما بعده وسمًا', () => {
    /*
     * قيس: هذا الشكل وحده أنتج **ستّ فروق من أربعمئة** على tailwindcss.com
     * بعد الإصلاحات الثلاثة الأولى، وصفرًا بعده. الحارس القديم يتخطّى
     * محرفًا واحدًا بعد `\` فيقرأ المسافة فاصلًا، ثم يقرأ `xl\:flex` وسمًا.
     */
    expect(bucketKey('.\\32 xl\\:flex')).toBe('.2xl:flex')
    expect(bucketKey('.\\32 xl\\:visible')).toBe('.2xl:visible')
    expect(bucketKey('div .\\32 xl\\:flex')).toBe('.2xl:flex')
    expect(bucketKey('.\\31 \\/2')).toBe('.1/2')
  })

  it('يطابق ما يعطيه classList لصنف يبدأ برقم', () => {
    const el = document.createElement('div')
    el.className = '2xl:flex'
    expect(bucketsFor(el)).toContain(bucketKey('.\\32 xl\\:flex'))
  })

  it('unescapeIdent يفكّ السداسي العشري', () => {
    expect(unescapeIdent('\\32 xl')).toBe('2xl')
    expect(unescapeIdent('\\31 \\/2')).toBe('1/2')
    expect(unescapeIdent('\\0000e9')).toBe('é')
  })
})

describe('bucketsFor', () => {
  it('يضمّ الجامع والوسم والمعرّف والأصناف', () => {
    const el = document.createElement('section')
    el.id = 'hero'
    el.className = 'a b'
    expect(bucketsFor(el)).toEqual([CATCH_ALL, 'section', '#hero', '.a', '.b'])
  })

  it('بلا معرّف ولا أصناف', () => {
    expect(bucketsFor(document.createElement('p'))).toEqual([CATCH_ALL, 'p'])
  })
})

describe('الفهرس والمرشّحون', () => {
  const rule = (sel: string) => ({ selectorText: sel, style: {} }) as unknown as CSSStyleRule

  it('يوزّع القاعدة على دلو مفتاحها', () => {
    const entries: IndexedRule[] = [
      { rule: rule('.card'), selector: '.card', order: 0 },
      { rule: rule('div'), selector: 'div', order: 1 },
      { rule: rule('[data-x]'), selector: '[data-x]', order: 2 },
    ]
    const index = indexRules(entries)
    expect(index.byKey.get('.card')).toHaveLength(1)
    expect(index.byKey.get('div')).toHaveLength(1)
    // ما لا مفتاح له يقع في الجامع.
    expect(index.rest).toHaveLength(1)
  })

  it('المرشّحون يشملون الجامع دائمًا', () => {
    const index = indexRules([{ rule: rule('[data-x]'), selector: '[data-x]', order: 0 }])
    const el = document.createElement('p')
    expect(candidatesFor(index, el)).toHaveLength(1)
  })

  it('المرشّحون مرتَّبون بترتيب المستند عبر الدلاء', () => {
    const el = document.createElement('div')
    el.className = 'c'
    const index = indexRules([
      { rule: rule('.c'), selector: '.c', order: 5 },
      { rule: rule('div'), selector: 'div', order: 1 },
      { rule: rule('*'), selector: '*', order: 3 },
    ])
    expect(candidatesFor(index, el).map((c) => c.order)).toEqual([1, 3, 5])
  })

  it('لا يُرجع قواعد لا تخصّ العنصر', () => {
    const el = document.createElement('div')
    const index = indexRules([{ rule: rule('.other'), selector: '.other', order: 0 }])
    expect(candidatesFor(index, el)).toHaveLength(0)
  })
})

describe('entriesForSelector — الفواصل تُفهرَس كلٌّ بمفتاحه', () => {
  it('يقسم القائمة إلى مدخلات', () => {
    const r = { selectorText: '.a, #b' } as unknown as CSSStyleRule
    const entries = entriesForSelector(r, ['.a, #b'], 7)
    expect(entries.map((e) => e.selector)).toEqual(['.a', '#b'])
    expect(entries.every((e) => e.order === 7)).toBe(true)
  })

  it('كل فرع يدخل دلوه', () => {
    const r = { selectorText: '.a, #b' } as unknown as CSSStyleRule
    const index = indexRules(entriesForSelector(r, ['.a, #b'], 0))
    expect(index.byKey.get('.a')).toHaveLength(1)
    expect(index.byKey.get('#b')).toHaveLength(1)
  })
})
