/**
 * تفكيك تداخل CSS — استبدال `&` بمحدِّدات الأب.
 *
 * happy-dom لا يفهم التداخل: يسطّح `.a { .b {} }` إلى قاعدتين بلا `parentRule`.
 * فالقواعد هنا **مزيَّفة بالشكل الذي يسلّمه Chrome**: `selectorText` مطبَّعًا
 * (`& .txt` لا `.txt`) و`parentRule` يصعد إلى الجدّ. والمنطق المختبَر استبدال `&`
 * وتغليف الأب بـ`:is()` والمشي على الآباء — لا المحرّك.
 */
import { describe, expect, it } from 'vitest'

import {
  effectiveSelectors,
  ownerSelectorsOfNestedDeclarations,
} from '@/modules/computed-style/nesting'

/** قاعدة نمط مزيَّفة بأبيها. */
function styleRule(selectorText: string, parentRule: CSSRule | null = null): CSSStyleRule {
  return { selectorText, parentRule, style: {} } as unknown as CSSStyleRule
}

/** قاعدة مجموعة (`@media`…): بلا `selectorText` ولها `cssRules`. */
function groupRule(parentRule: CSSRule | null = null): CSSRule {
  return { parentRule, cssRules: [] } as unknown as CSSRule
}

/** كتلة تصريحات متداخلة: لها `style` ولا `selectorText`. */
function nestedDeclarations(parentRule: CSSRule | null): CSSRule {
  return { parentRule, style: {} } as unknown as CSSRule
}

describe('effectiveSelectors — بلا تداخل', () => {
  it('قاعدة بلا أب تُرجع محدِّداتها مفصولةً ومقصوصة', () => {
    expect(effectiveSelectors(styleRule('.a,  .b > c'))).toEqual(['.a', '.b > c'])
  })

  it('الفاصلة داخل `:is()` لا تقسم المحدِّد', () => {
    expect(effectiveSelectors(styleRule(':is(.a, .b) .c'))).toEqual([':is(.a, .b) .c'])
  })

  it('قاعدة داخل `@media` وحدها بلا أب نمط تبقى كما هي', () => {
    // الصعود يمرّ على المجموعة ولا يجد قاعدة نمط فلا تداخل.
    expect(effectiveSelectors(styleRule('.a', groupRule()))).toEqual(['.a'])
  })
})

describe('effectiveSelectors — استبدال `&`', () => {
  const card = styleRule('.card')
  const of = (selector: string) => effectiveSelectors(styleRule(selector, card))

  it('`&` في البداية تُستبدَل بالأب', () => {
    expect(of('& .txt')).toEqual(['.card .txt'])
  })

  it('`&` في الآخر تُستبدَل بالأب فيسبقها السياق', () => {
    expect(of('.dark &')).toEqual(['.dark .card'])
  })

  it('`&` الملتصقة تُنتج مركَّبًا واحدًا', () => {
    expect(of('&:hover')).toEqual(['.card:hover'])
    expect(of('&.on')).toEqual(['.card.on'])
  })

  it('`&` وحدها تعني الأب نفسه', () => {
    expect(of('&')).toEqual(['.card'])
  })

  it('كل `&` في المحدِّد الواحد تُستبدَل', () => {
    expect(of('& + &')).toEqual(['.card + .card'])
  })

  it('محدِّد بلا `&` يُلصَق بالأب بمسافة (التداخل الضمنّي)', () => {
    expect(of('.txt')).toEqual(['.card .txt'])
  })

  it('كل فرع من قائمة الابن يُفكّ على حدة', () => {
    expect(of('& > .a, .b, .c &')).toEqual(['.card > .a', '.card .b', '.c .card'])
  })

  it('`&` داخل سلسلة بين علامتَي اقتباس مزدوجتين تبقى نصًّا', () => {
    expect(of('[data-x="&"] &')).toEqual(['[data-x="&"] .card'])
  })

  it('`&` داخل سلسلة بين علامتَي اقتباس مفردتين تبقى نصًّا', () => {
    expect(of("[data-x='&'] &")).toEqual(["[data-x='&'] .card"])
  })

  it('اقتباس من النوع الآخر داخل السلسلة لا يُنهيها', () => {
    // `'` داخل `"…"` نصّ عاديّ، فتبقى `&` بعده داخل السلسلة.
    expect(of('[data-x="a\'&"] &')).toEqual(['[data-x="a\'&"] .card'])
  })

  it('اقتباس مهرَّب داخل السلسلة لا يُنهيها', () => {
    // لولا معالجة التهريب قبل الاقتباس لأغلق `\"` السلسلة وصارت `&` بعده بديلًا.
    expect(of('[title="a\\"&"] &')).toEqual(['[title="a\\"&"] .card'])
  })

  it('`&` المهرَّبة اسمُ صنف لا مُرجِع للأب', () => {
    expect(of('.a\\&b &')).toEqual(['.a\\&b .card'])
  })

  it('التهريب السداسي بمسافته الختامية يبقى كاملًا', () => {
    // `\32 xl` هو الصنف `2xl`؛ المسافة جزء من التهريب فلا تُعامَل فاصلًا.
    expect(of('.\\32 xl:flex &')).toEqual(['.\\32 xl:flex .card'])
  })
})

describe('effectiveSelectors — قائمة الأب', () => {
  it('أب بقائمة يُلَفّ بـ`:is()` فتصحّ أولويته', () => {
    const parent = styleRule('.a, .b')

    expect(effectiveSelectors(styleRule('& .x', parent))).toEqual([':is(.a, .b) .x'])
  })

  it('اللفّ يشمل المحدِّد الضمنّي أيضًا', () => {
    const parent = styleRule('.a, .b')

    expect(effectiveSelectors(styleRule('.x', parent))).toEqual([':is(.a, .b) .x'])
  })

  it('أب مفرد يُترَك بلا لفّ حتى لو بداخله فاصلة عميقة', () => {
    // القائمة المحسوبة على المستوى الأعلى فقط: `:is(.a, .b)` عضو واحد.
    const parent = styleRule(':is(.a, .b)')

    expect(effectiveSelectors(styleRule('& .x', parent))).toEqual([':is(.a, .b) .x'])
  })

  it('كل فرع من الابن يستعمل الأب المغلَّف نفسه', () => {
    const parent = styleRule('.a, .b')

    expect(effectiveSelectors(styleRule('& > .x, .y &', parent))).toEqual([
      ':is(.a, .b) > .x',
      '.y :is(.a, .b)',
    ])
  })
})

describe('effectiveSelectors — تداخل متعدّد المستويات', () => {
  it('الجدّ يُفكّ صعودًا قبل الأب', () => {
    const a = styleRule('.a')
    const b = styleRule('& .b', a)
    const c = styleRule('& > .c', b)

    expect(effectiveSelectors(c)).toEqual(['.a .b > .c'])
  })

  it('جدّ بقائمة يتراكب لفّه مع لفّ الأب', () => {
    const outer = styleRule('.a, .b')
    const inner = styleRule('.c, .d', outer)
    const leaf = styleRule('& > .e', inner)

    expect(effectiveSelectors(leaf)).toEqual([':is(:is(.a, .b) .c, :is(.a, .b) .d) > .e'])
  })

  it('`@media` بين القاعدة وأبيها لا تقطع الصعود', () => {
    // الأب النحوي ليس الأب المباشر: القاعدة داخل `@media` داخل `.card`.
    const media = groupRule(styleRule('.card'))

    expect(effectiveSelectors(styleRule('& .txt', media))).toEqual(['.card .txt'])
  })

  it('سلسلة مجموعات متداخلة قبل قاعدة النمط تُعبَر', () => {
    const inner = groupRule(groupRule(groupRule(styleRule('.card'))))

    expect(effectiveSelectors(styleRule('.txt', inner))).toEqual(['.card .txt'])
  })

  it('سلسلة آباء دائرية لا تعلّق الصعود', () => {
    // خلل في كائنات المتصفّح لا يجب أن يجمّد الفاحص: الصعود محدود الخطوات.
    const loop = { parentRule: null, cssRules: [] } as unknown as { parentRule: CSSRule | null }
    loop.parentRule = loop as unknown as CSSRule

    expect(effectiveSelectors(styleRule('.a', loop as unknown as CSSRule))).toEqual(['.a'])
  })

  it('قاعدة النمط الأبعد من حدّ الصعود لا تُبلَغ', () => {
    let chain: CSSRule = styleRule('.far')
    for (let i = 0; i < 200; i++) chain = groupRule(chain)

    // تسقط إلى «لا تداخل» بدل أن تُنتج محدِّدًا مبنيًّا على أب مجهول القرب.
    expect(effectiveSelectors(styleRule('.txt', chain))).toEqual(['.txt'])
  })

  it('أب `selectorText` فيه ليس نصًّا لا يُعدّ قاعدة نمط', () => {
    const notStyle = {
      selectorText: 42,
      parentRule: styleRule('.real'),
    } as unknown as CSSRule

    // يُتخطّى إلى الجدّ الحقيقي.
    expect(effectiveSelectors(styleRule('& .x', notStyle))).toEqual(['.real .x'])
  })
})

describe('ownerSelectorsOfNestedDeclarations', () => {
  it('كتلة التصريحات تخصّ محدِّد أبيها', () => {
    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(styleRule('.card')))).toEqual([
      '.card',
    ])
  })

  it('أب بقائمة يُرجع أعضاءها بلا لفّ', () => {
    // المستهلك يطابق كل عضو على حدة، فلا `:is()` هنا.
    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(styleRule('.a, .b')))).toEqual([
      '.a',
      '.b',
    ])
  })

  it('أب متداخل يُفكّ تداخله أيضًا', () => {
    const b = styleRule('& .b', styleRule('.a'))

    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(b))).toEqual(['.a .b'])
  })

  it('كتلة داخل `@media` داخل قاعدة نمط تخصّ قاعدة النمط', () => {
    const media = groupRule(styleRule('.card'))

    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(media))).toEqual(['.card'])
  })

  it('قاعدة نمط عادية ليست كتلة تصريحات متداخلة', () => {
    // لها `style` و`selectorText` معًا.
    expect(ownerSelectorsOfNestedDeclarations(styleRule('.a', styleRule('.p')))).toBeNull()
  })

  it('قاعدة مجموعة بلا `style` ليست كتلة تصريحات', () => {
    expect(ownerSelectorsOfNestedDeclarations(groupRule(styleRule('.p')))).toBeNull()
  })

  it('`style` ليس كائنًا لا يجعلها كتلة تصريحات', () => {
    const rule = { parentRule: styleRule('.p'), style: 'color: red' } as unknown as CSSRule

    expect(ownerSelectorsOfNestedDeclarations(rule)).toBeNull()
  })

  it('كتلة بلا قاعدة نمط فوقها لا مالك لها', () => {
    // من المستوى الأعلى أو داخل `@media` وحدها: لا محدِّد تخصّه.
    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(null))).toBeNull()
    expect(ownerSelectorsOfNestedDeclarations(nestedDeclarations(groupRule()))).toBeNull()
  })
})
