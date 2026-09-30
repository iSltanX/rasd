/**
 * مخرجات النسخ الثلاثة — والقاعدة الحاكمة: **لا يُخترَع صنف لا يعمل**.
 *
 * المسألة هنا ليست اكتمال الجدول بل صدقه. `padding: 15px` ليس `p-4`، واسم
 * لون في لوحة Tailwind يتغيّر بالإصدار والتخصيص — فالقيمة الصريحة تنجو
 * والاسم المخمَّن يكذب. وكل حالة أدناه تحرس هذا الحدّ.
 */
import { describe, expect, it } from 'vitest'

import { toCss, toJson, toTailwindText } from '@/modules/style-export/css'
import { mapProperty, mapShorthand, mapSpacing, toTailwind } from '@/modules/style-export/tailwind'
import { EMPTY_LIMITS, type InspectSnapshot, type StyleValue } from '@/shared/inspect-schema'

const used = (value: string): StyleValue => ({ value, reliability: 'used' })

const snapshot = (over: Partial<InspectSnapshot> = {}): InspectSnapshot => ({
  at: 1_700_000_000_000,
  tag: 'div',
  label: '.card',
  selector: '.card',
  unique: true,
  positional: false,
  inShadow: false,
  rect: { x: 10, y: 20, width: 100, height: 40, pageX: 10, pageY: 220 },
  styles: {
    color: used('rgb(17, 24, 39)'),
    'padding-block-start': used('16px'),
    display: used('flex'),
  },
  limits: EMPTY_LIMITS,
  ...over,
})

describe('mapSpacing — السلّم أو التصريح، ولا تخمين', () => {
  it('القيمة على السلّم تعطي درجة', () => {
    expect(mapSpacing('pt', '16px', 16)).toEqual({ kind: 'scale', cls: 'pt-4' })
    expect(mapSpacing('pt', '4px', 16)).toEqual({ kind: 'scale', cls: 'pt-1' })
    expect(mapSpacing('pt', '0px', 16)).toEqual({ kind: 'scale', cls: 'pt-0' })
  })

  it('الدرجات النصفية الصغيرة مقبولة', () => {
    expect(mapSpacing('pt', '2px', 16)).toEqual({ kind: 'scale', cls: 'pt-0.5' })
    expect(mapSpacing('pt', '6px', 16)).toEqual({ kind: 'scale', cls: 'pt-1.5' })
  })

  it('‏15px ليست p-4 — تُكتب صراحةً مع السبب', () => {
    /*
     * هذه هي الحالة التي تفصل المخرَج الصادق عن المريح: `p-4` تساوي 16px،
     * وإعطاؤها عن 15px يعني أن ما يلصقه المستخدم يختلف عمّا يرى.
     */
    const m = mapSpacing('p', '15px', 16)
    expect(m.kind).toBe('arbitrary')
    if (m.kind === 'arbitrary') {
      expect(m.cls).toBe('p-[15px]')
      expect(m.why).toContain('لا تقع على السلّم')
    }
  })

  it('حجم خطّ الجذر يُقرأ ولا يُفترَض', () => {
    // صفحة بـ`font-size: 62.5%` تجعل 1rem = 10px، فـ10px تصير `pt-4`.
    expect(mapSpacing('pt', '10px', 10)).toEqual({ kind: 'scale', cls: 'pt-4' })
    expect(mapSpacing('pt', '16px', 10).kind).toBe('arbitrary')
  })

  it('قيمة ليست بالبكسل تُعلَن ولا تُترجَم', () => {
    expect(mapSpacing('pt', '2em', 16).kind).toBe('untranslatable')
    expect(mapSpacing('pt', 'auto', 16).kind).toBe('untranslatable')
  })
})

describe('mapProperty', () => {
  it('الكلمات المفتاحية تُقابَل مباشرةً', () => {
    expect(mapProperty('display', 'flex', 16)).toEqual({ kind: 'scale', cls: 'flex' })
    expect(mapProperty('display', 'none', 16)).toEqual({ kind: 'scale', cls: 'hidden' })
    expect(mapProperty('position', 'absolute', 16)).toEqual({ kind: 'scale', cls: 'absolute' })
  })

  it('المحاذاة المنطقية والفيزيائية كلتاهما مقروءة', () => {
    expect(mapProperty('text-align', 'start', 16)).toEqual({ kind: 'scale', cls: 'text-start' })
    // الصفحة قد تكتب `left` — نقرؤها ولا نؤلّفها.
    expect(mapProperty('text-align', 'left', 16)).toEqual({ kind: 'scale', cls: 'text-left' })
  })

  it('الأوزان على السلّم', () => {
    expect(mapProperty('font-weight', '700', 16)).toEqual({ kind: 'scale', cls: 'font-bold' })
    expect(mapProperty('font-weight', '450', 16)?.kind).toBe('arbitrary')
  })

  it('الألوان تُكتب صريحة — لا تُخمَّن أسماء اللوحة', () => {
    /*
     * `rgb(59, 130, 246)` قد يساوي `blue-500` وقد لا يساويه بحسب الإصدار
     * وتخصيص المشروع. والاسم الخطأ أسوأ من قيمة صريحة صحيحة.
     */
    const m = mapProperty('color', 'rgb(59, 130, 246)', 16)
    expect(m?.kind).toBe('arbitrary')
    if (m?.kind === 'arbitrary') {
      expect(m.cls).toBe('text-[rgb(59,130,246)]')
      expect(m.why).toContain('اللوحة')
    }
  })

  it('الظلال والتدرّجات تُعلَن بلا مقابل', () => {
    for (const prop of ['box-shadow', 'text-shadow', 'background-image']) {
      expect(mapProperty(prop, 'anything', 16)?.kind).toBe('untranslatable')
    }
  })

  it('الخصائص غير المعروفة لا تُنتج شيئًا', () => {
    expect(mapProperty('caret-color', 'red', 16)).toBeNull()
  })
})

describe('toTailwind — التصنيف الثلاثي', () => {
  it('يفصل السلّم عن الصريح عن المتعذّر', () => {
    const out = toTailwind(
      {
        display: 'flex',
        'padding-block-start': '15px',
        'box-shadow': '0 1px 2px black',
      },
      16,
    )
    expect(out.classes).toContain('flex')
    expect(out.classes).toContain('pt-[15px]')
    expect(out.arbitrary.map((a) => a.cls)).toContain('pt-[15px]')
    expect(out.untranslatable.map((u) => u.prop)).toContain('box-shadow')
    expect(out.target).toBe(4)
  })

  it('المتعذّر لا يدخل الأصناف', () => {
    const out = toTailwind({ 'box-shadow': 'x' }, 16)
    expect(out.classes).toHaveLength(0)
  })
})

describe('toCss', () => {
  it('يبني كتلة بالمحدِّد', () => {
    const css = toCss(snapshot())
    expect(css).toContain('.card {')
    expect(css).toContain('color: rgb(17, 24, 39);')
    expect(css).toContain('}')
  })

  it('يُسقط القيم الابتدائية عديمة المعنى', () => {
    const css = toCss(
      snapshot({
        styles: { color: used('red'), 'letter-spacing': used('normal'), width: used('auto') },
      }),
    )
    expect(css).toContain('color: red;')
    expect(css).not.toContain('letter-spacing')
    expect(css).not.toContain('width')
  })

  it('يكتب الحدود في المخرَج لا في الواجهة وحدها', () => {
    /*
     * المستخدم ينسخ النصّ إلى مكان آخر، فيجب أن يحمل معه ما لم نجزم به.
     */
    const css = toCss(
      snapshot({
        limits: {
          ...EMPTY_LIMITS,
          unlaid: true,
          unreadableSheets: 6,
          unreadableOrigins: ['https://js.stripe.com'],
        },
      }),
    )
    expect(css).toContain('/*')
    expect(css).toContain('بلا تخطيط')
    expect(css).toContain('js.stripe.com')
  })

  it('يعلّم القيمة اللحظية عند حركة جارية', () => {
    const css = toCss(snapshot({ styles: { color: { value: 'red', reliability: 'animating' } } }))
    expect(css).toContain('حركة جارية')
  })
})

describe('toJson', () => {
  it('يحمل المخطّط والحدود حقلًا لا تعليقًا', () => {
    const json = toJson(snapshot({ limits: { ...EMPTY_LIMITS, animating: 2 } }), 16)
    expect(json.schema).toBe('rasd.inspect/1')
    expect(json.limits.animating).toBe(2)
    expect(json.notes.some((n) => n.includes('حركة'))).toBe(true)
  })

  it('يحمل هوية العنصر وشارات محدِّده', () => {
    const json = toJson(snapshot({ positional: true, unique: false }), 16)
    expect(json.element.selector).toBe('.card')
    expect(json.element.positional).toBe(true)
    expect(json.element.unique).toBe(false)
  })

  it('يحمل موضع المستند لا النافذة وحدها', () => {
    // `Rasd_Ar.md §7.1` يفرض «الموقع داخل الصفحة».
    expect(toJson(snapshot(), 16).rect.pageY).toBe(220)
  })

  it('يحمل مخرَج Tailwind كاملًا', () => {
    expect(toJson(snapshot(), 16).tailwind.classes).toContain('flex')
  })
})

describe('toTailwindText', () => {
  it('يذكر ما لا مقابل له بدل إسقاطه صامتًا', () => {
    const text = toTailwindText(
      snapshot({ styles: { display: used('flex'), 'box-shadow': used('0 1px 2px black') } }),
      16,
    )
    expect(text).toContain('flex')
    expect(text).toContain('بلا مقابل في Tailwind v4')
    expect(text).toContain('box-shadow')
  })
})

describe('mapSpacing — حدود السلّم', () => {
  it('القيمة السالبة لا تقع على السلّم فتُكتب صراحةً بإشارتها', () => {
    // السلّم لا سالب فيه: `ms-[-4px]` تحفظ الهامش السالب، و`ms--1` أداةٌ لا يعرفها v4 بهذا الشكل.
    const m = mapSpacing('ms', '-4px', 16)
    expect(m).toEqual({
      kind: 'arbitrary',
      cls: 'ms-[-4px]',
      why: '-4px لا تقع على السلّم (وحدته 4px)',
    })
  })

  it('الدرجات النصفية مقبولة حتى الرابعة فقط ثم تُكتب صراحةً', () => {
    // 14px = 3.5 درجة داخل السقف، و18px = 4.5 درجة خارجه.
    expect(mapSpacing('pt', '14px', 16)).toEqual({ kind: 'scale', cls: 'pt-3.5' })
    expect(mapSpacing('pt', '16px', 16)).toEqual({ kind: 'scale', cls: 'pt-4' })
    expect(mapSpacing('pt', '18px', 16).kind).toBe('arbitrary')
    expect(mapSpacing('pt', '22px', 16)).toMatchObject({ kind: 'arbitrary', cls: 'pt-[22px]' })
  })

  it('الدرجات الصحيحة الكبيرة تبقى على السلّم', () => {
    expect(mapSpacing('pt', '96px', 16)).toEqual({ kind: 'scale', cls: 'pt-24' })
  })

  it('الأرباع لا تقع على السلّم — لا تُقرَّب إلى أقرب درجة', () => {
    // 5px = 1.25 درجة و3px = 0.75 درجة؛ تقريبهما إلى `pt-1` يعطي 4px لا 5px ولا 3px.
    expect(mapSpacing('pt', '5px', 16)).toMatchObject({ kind: 'arbitrary', cls: 'pt-[5px]' })
    expect(mapSpacing('pt', '3px', 16)).toMatchObject({ kind: 'arbitrary', cls: 'pt-[3px]' })
  })

  it('السبب يذكر وحدة السلّم محسوبةً من حجم الجذر المقروء', () => {
    // جذر 10px ⇒ الدرجة 2.5px، فـ16px = 6.4 درجة خارج السلّم.
    const m = mapSpacing('pt', '16px', 10)
    expect(m).toEqual({
      kind: 'arbitrary',
      cls: 'pt-[16px]',
      why: '16px لا تقع على السلّم (وحدته 2.5px)',
    })
  })

  it('القيمة الطويلة تُقصَّر إلى أربع خانات فلا يتسرّب ضجيج الفاصلة', () => {
    expect(mapSpacing('pt', '15.12345678px', 16)).toMatchObject({ cls: 'pt-[15.1235px]' })
  })

  it('رقم مشوَّه لا يصير NaN في صنف بل يُعلَن متعذّرًا', () => {
    const m = mapSpacing('pt', '.px', 16)
    expect(m).toMatchObject({ kind: 'untranslatable', prop: 'pt', value: '.px' })
  })
})

describe('mapProperty — المسافات والكلمات المفتاحية', () => {
  it('القيمة الفارغة أو البيضاء لا تنتج شيئًا', () => {
    expect(mapProperty('display', '', 16)).toBeNull()
    expect(mapProperty('padding-block-start', '   ', 16)).toBeNull()
  })

  it('الفراغات حول القيمة تُقصّ قبل المطابقة', () => {
    expect(mapProperty('display', '  flex  ', 16)).toEqual({ kind: 'scale', cls: 'flex' })
  })

  it.each([
    ['padding-block-start', 'pt'],
    ['padding-block-end', 'pb'],
    ['padding-inline-start', 'ps'],
    ['padding-inline-end', 'pe'],
    ['margin-block-start', 'mt'],
    ['margin-block-end', 'mb'],
    ['margin-inline-start', 'ms'],
    ['margin-inline-end', 'me'],
    ['row-gap', 'gap-y'],
    ['column-gap', 'gap-x'],
  ])('‏%s تُقابَل بالبادئة المنطقية %s لا الفيزيائية', (prop, prefix) => {
    // الواجهة RTL: `ps`/`pe` تنقلبان مع الاتجاه، و`pl`/`pr` لا — فالمنطقية وحدها تحفظ المعنى.
    expect(mapProperty(prop, '16px', 16)).toEqual({ kind: 'scale', cls: `${prefix}-4` })
  })

  it('مسافة بغير البكسل تُعلَن متعذّرة عبر الخاصّية أيضًا', () => {
    const m = mapProperty('margin-block-start', '2rem', 16)
    expect(m?.kind).toBe('untranslatable')
    if (m?.kind === 'untranslatable') expect(m.value).toBe('2rem')
  })

  it.each([
    ['display', 'inline-block', 'inline-block'],
    ['display', 'inline-flex', 'inline-flex'],
    ['display', 'grid', 'grid'],
    ['display', 'contents', 'contents'],
    ['position', 'sticky', 'sticky'],
    ['position', 'fixed', 'fixed'],
    ['text-align', 'center', 'text-center'],
    ['text-align', 'end', 'text-end'],
    ['text-align', 'justify', 'text-justify'],
    ['text-align', 'right', 'text-right'],
    ['font-style', 'italic', 'italic'],
    ['font-style', 'normal', 'not-italic'],
    ['visibility', 'hidden', 'invisible'],
    ['visibility', 'collapse', 'collapse'],
    ['box-sizing', 'border-box', 'box-border'],
    ['box-sizing', 'content-box', 'box-content'],
  ])('‏%s: %s ⇒ %s', (prop, value, cls) => {
    expect(mapProperty(prop, value, 16)).toEqual({ kind: 'scale', cls })
  })

  it('كلمة خارج مفردات الأداة تُعلَن متعذّرة ولا يُخترَع لها صنف', () => {
    expect(mapProperty('display', 'table', 16)).toEqual({
      kind: 'untranslatable',
      prop: 'display',
      value: 'table',
      why: 'قيمة خارج مفردات الأداة',
    })
    expect(mapProperty('position', 'inherit', 16)?.kind).toBe('untranslatable')
  })
})

describe('mapProperty — z-index والعتمة والأبعاد', () => {
  it('z-index: auto على السلّم، والعدد الصحيح صريح، وغيره لا يُنتج شيئًا', () => {
    expect(mapProperty('z-index', 'auto', 16)).toEqual({ kind: 'scale', cls: 'z-auto' })
    expect(mapProperty('z-index', '10', 16)).toMatchObject({ kind: 'arbitrary', cls: 'z-[10]' })
    expect(mapProperty('z-index', '-1', 16)).toMatchObject({ kind: 'arbitrary', cls: 'z-[-1]' })
    expect(mapProperty('z-index', 'inherit', 16)).toBeNull()
    // عدد كسريّ ليس z-index صالحًا في CSS.
    expect(mapProperty('z-index', '1.5', 16)).toBeNull()
  })

  it('opacity: النسبة الصحيحة تقع على السلّم', () => {
    expect(mapProperty('opacity', '0.5', 16)).toEqual({ kind: 'scale', cls: 'opacity-50' })
    expect(mapProperty('opacity', '1', 16)).toEqual({ kind: 'scale', cls: 'opacity-100' })
    expect(mapProperty('opacity', '0', 16)).toEqual({ kind: 'scale', cls: 'opacity-0' })
  })

  it('opacity: ضجيج الفاصلة العائمة لا يُخرج نسبةً صحيحة من السلّم', () => {
    // 0.07 × 100 = 7.000000000000001 في الفاصلة العائمة — وهو 7% بلا جدال.
    expect(mapProperty('opacity', '0.07', 16)).toEqual({ kind: 'scale', cls: 'opacity-7' })
  })

  it('opacity: النسبة الكسرية تُكتب صراحةً مع السبب', () => {
    expect(mapProperty('opacity', '0.333', 16)).toEqual({
      kind: 'arbitrary',
      cls: 'opacity-[0.333]',
      why: 'نسبة كسرية',
    })
  })

  it('opacity: قيمة غير رقمية لا تنتج شيئًا', () => {
    expect(mapProperty('opacity', 'inherit', 16)).toBeNull()
  })

  it('width وheight: auto على السلّم، والبكسل يمرّ بسلّم المسافات', () => {
    expect(mapProperty('width', 'auto', 16)).toEqual({ kind: 'scale', cls: 'w-auto' })
    expect(mapProperty('height', 'auto', 16)).toEqual({ kind: 'scale', cls: 'h-auto' })
    expect(mapProperty('width', '64px', 16)).toEqual({ kind: 'scale', cls: 'w-16' })
    expect(mapProperty('height', '15px', 16)).toMatchObject({ kind: 'arbitrary', cls: 'h-[15px]' })
  })

  it('width بنسبة مئوية تُعلَن متعذّرة لا تُحوَّل إلى بكسل', () => {
    const m = mapProperty('width', '100%', 16)
    expect(m?.kind).toBe('untranslatable')
    if (m?.kind === 'untranslatable') expect(m.value).toBe('100%')
  })
})

describe('mapProperty — الألوان والخطّ', () => {
  it('لون الخلفية يُكتب صريحًا بأداة bg', () => {
    expect(mapProperty('background-color', 'rgb(17, 24, 39)', 16)).toMatchObject({
      kind: 'arbitrary',
      cls: 'bg-[rgb(17,24,39)]',
    })
  })

  it.each([
    'border-block-start-color',
    'border-block-end-color',
    'border-inline-start-color',
    'border-inline-end-color',
  ])('‏%s تُقابَل بأداة border', (prop) => {
    expect(mapProperty(prop, 'rgb(1, 2, 3)', 16)).toMatchObject({ cls: 'border-[rgb(1,2,3)]' })
  })

  it('لون الإطار الخارجي يُقابَل بأداة outline', () => {
    expect(mapProperty('outline-color', 'rgba(0, 0, 0, 0.5)', 16)).toMatchObject({
      kind: 'arbitrary',
      cls: 'outline-[rgba(0,0,0,0.5)]',
    })
  })

  it('خصائص اللون الأخرى لا تُبتلع بأداة حدّ', () => {
    // البحث بـ`endsWith('-color')` كان سيعطي `accent-color` و`text-decoration-color` صنف border.
    expect(mapProperty('accent-color', 'red', 16)).toBeNull()
    expect(mapProperty('text-decoration-color', 'red', 16)).toBeNull()
  })

  it('لون سداسي يمرّ كما هو بلا فراغات', () => {
    expect(mapProperty('color', '#111827', 16)).toMatchObject({ cls: 'text-[#111827]' })
  })

  it('حجم الخطّ يُكتب صريحًا لأن السلّم مسمّى ومرتبط بارتفاع السطر', () => {
    expect(mapProperty('font-size', '16px', 16)).toEqual({
      kind: 'arbitrary',
      cls: 'text-[16px]',
      why: 'سلّم الخطّ مسمّى ومرتبط بارتفاع السطر',
    })
  })

  it.each(['writing-mode', 'fill', 'stroke'])('‏%s بلا مقابل حسابيّ فتُعلَن', (prop) => {
    expect(mapProperty(prop, 'vertical-rl', 16)).toMatchObject({
      kind: 'untranslatable',
      prop,
      value: 'vertical-rl',
    })
  })
})

describe('toTailwind — ما لا يُنتج شيئًا', () => {
  it('الخصائص غير المعروفة وقيمها غير الصالحة تُتخطّى من القوائم الثلاث كلّها', () => {
    const out = toTailwind({ 'caret-color': 'red', 'z-index': 'inherit', display: 'flex' }, 16)
    expect(out.classes).toEqual(['flex'])
    expect(out.arbitrary).toEqual([])
    expect(out.untranslatable).toEqual([])
  })

  it('المدخل الفارغ يعطي مخرجًا فارغًا بالإصدار المستهدَف', () => {
    expect(toTailwind({}, 16)).toEqual({
      classes: [],
      arbitrary: [],
      untranslatable: [],
      target: 4,
    })
  })

  it('الصريح يدخل الأصناف والقائمة الصريحة معًا بترتيب الإدخال', () => {
    const out = toTailwind({ display: 'flex', opacity: '0.333', position: 'relative' }, 16)
    expect(out.classes).toEqual(['flex', 'opacity-[0.333]', 'relative'])
    expect(out.arbitrary).toEqual([{ cls: 'opacity-[0.333]', why: 'نسبة كسرية' }])
  })

  it('حجم الجذر المقروء يصل إلى سلّم المسافات', () => {
    // جذر 10px: الدرجة 2.5px، فـ10px = `pt-4`؛ وعلى جذر 16 كانت 2.5 درجة (pt-2.5).
    expect(toTailwind({ 'padding-block-start': '10px' }, 10).classes).toEqual(['pt-4'])
    expect(toTailwind({ 'padding-block-start': '10px' }, 16).classes).toEqual(['pt-2.5'])
  })
})

/** حدود مكتملة: فهرس القواعد مقروء ولا شيء مجهول — فلا تعليقات في الرأس. */
const COMPLETE_LIMITS = { ...EMPTY_LIMITS, indexComplete: true }

describe('toCss — رأس الحدود', () => {
  it('بلا حدود لا يُكتب تعليق ولا سطر فارغ قبل المحدِّد', () => {
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: { color: used('red'), display: used('flex') },
      }),
    )
    // العنصر (display) قبل الألوان (color) بترتيب اللوحة نفسه.
    expect(css).toBe('.card {\n  display: flex;\n  color: red;\n}')
  })

  it('التعليقات تسبق الكتلة وتفصلها عنها سطرٌ فارغ', () => {
    const css = toCss(
      snapshot({ limits: { ...COMPLETE_LIMITS, unlaid: true }, styles: { display: used('flex') } }),
    )
    expect(css.split('\n')).toEqual([
      '/* العنصر بلا تخطيط — النسب لم تُحلّ إلى قيم مستعمَلة. */',
      '',
      '.card {',
      '  display: flex;',
      '}',
    ])
  })

  it('فهرس القواعد الناقص يُعلَن', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, indexComplete: false } }))
    expect(css).toContain('/* فهرس القواعد غير مكتمل — مصدر بعض القيم غير محسوم. */')
  })

  it('حالات التفاعل غير المقيَّمة تُعلَن', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, interactiveStateUnknown: true } }))
    expect(css).toContain('/* حالات :hover و:focus و:active لم تُقيَّم تحت طبقة الفحص. */')
  })

  it('جذر الظلّ المغلق يُعلَن', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, closedShadowHost: true } }))
    expect(css).toContain('/* العنصر داخل جذر ظلّ مغلق — قواعده غير مقروءة. */')
  })

  it('الإطار العابر للأصل يُعلَن', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, opaqueFrame: true } }))
    expect(css).toContain('/* العنصر داخل إطار عابر للأصل. */')
  })

  it('الحركة الجارية تذكر عدد الخصائص المتحرِّكة', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, animating: 3 } }))
    expect(css).toContain('/* حركة جارية على 3 خاصّية — القيم لحظية. */')
  })

  it('الأوراق المحجوبة بلا أصول معروفة تُعدّ بلا قوسين', () => {
    const css = toCss(snapshot({ limits: { ...COMPLETE_LIMITS, unreadableSheets: 2 } }))
    // السطر الأوّل بتمامه: لا قوسين فارغين ولا فاصلة زائدة حين تغيب الأصول.
    expect(css.split('\n')[0]).toBe(
      '/* 2 ورقة أنماط تعذّرت قراءتها — القيم صحيحة ومصادرها غير معروفة. */',
    )
  })

  it('الأصول المحجوبة تُسرَد بفاصلة عربية داخل قوسين', () => {
    const css = toCss(
      snapshot({
        limits: {
          ...COMPLETE_LIMITS,
          unreadableSheets: 2,
          unreadableOrigins: ['https://a.example', 'https://b.example'],
        },
      }),
    )
    expect(css).toContain('(https://a.example، https://b.example)')
  })

  it('كل حدّ في سطر تعليق مستقلّ حين تجتمع', () => {
    const css = toCss(
      snapshot({
        limits: {
          ...COMPLETE_LIMITS,
          unlaid: true,
          closedShadowHost: true,
          opaqueFrame: true,
        },
      }),
    )
    const comments = css.split('\n').filter((l) => l.startsWith('/*'))
    expect(comments).toHaveLength(3)
  })
})

describe('toCss — اختيار الخصائص وترتيبها', () => {
  it('المجموعات بترتيب اللوحة مهما كان ترتيب إدخال الأنماط', () => {
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: {
          color: used('red'),
          'padding-block-start': used('8px'),
          'font-size': used('14px'),
          display: used('flex'),
        },
      }),
    )
    const order = css
      .split('\n')
      .filter((l) => l.startsWith('  '))
      .map((l) => l.trim().split(':')[0])
    // عنصر ← نصّ ← مسافات ← ألوان.
    expect(order).toEqual(['display', 'font-size', 'padding-block-start', 'color'])
  })

  it('الخاصّية خارج المجموعات المنتقاة لا تُنسَخ', () => {
    // نسخ كل ما يعيده getComputedStyle يعطي آلاف الأسطر — والمنتقى وحده يصف العنصر.
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: { 'caret-color': used('red'), display: used('flex') },
      }),
    )
    expect(css).not.toContain('caret-color')
    expect(css).toContain('display: flex;')
  })

  it('القيم الابتدائية الأربع وقيمة الفراغ تُسقَط، وما سواها يبقى', () => {
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: {
          'letter-spacing': used('normal'),
          'word-spacing': used('  '),
          width: used('auto'),
          'text-decoration-line': used('none'),
          'padding-block-start': used('0px'),
        },
      }),
    )
    expect(css).toBe('.card {\n  padding-block-start: 0px;\n}')
  })

  it('العنصر الفارغ من الخصائص يعطي كتلة فارغة لا رمي', () => {
    expect(toCss(snapshot({ limits: COMPLETE_LIMITS, styles: {} }))).toBe('.card {\n}')
  })

  it('القيمة غير الموثوقة تحمل تعليقها على سطرها نفسه', () => {
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: {
          'padding-block-start': { value: '10%', reliability: 'unlaid' },
          color: { value: 'red', reliability: 'animating' },
        },
      }),
    )
    expect(css).toContain('  padding-block-start: 10%;  /* العنصر بلا تخطيط */')
    expect(css).toContain('  color: red;  /* قيمة لحظية — حركة جارية */')
  })

  it('القيمة الموثوقة بلا تعليق', () => {
    const css = toCss(snapshot({ limits: COMPLETE_LIMITS, styles: { color: used('red') } }))
    expect(css).not.toMatch(/red;\s*\/\*/)
  })
})

describe('toJson — حقول لا تعليقات', () => {
  it('الحدود المكتملة تعطي ملاحظات فارغة', () => {
    expect(toJson(snapshot({ limits: COMPLETE_LIMITS }), 16).notes).toEqual([])
  })

  it('الملاحظات هي نصوص الحدود نفسها التي يكتبها CSS', () => {
    const json = toJson(
      snapshot({ limits: { ...COMPLETE_LIMITS, closedShadowHost: true, opaqueFrame: true } }),
      16,
    )
    expect(json.notes).toEqual([
      'العنصر داخل جذر ظلّ مغلق — قواعده غير مقروءة.',
      'العنصر داخل إطار عابر للأصل.',
    ])
  })

  it('الأنماط تحمل درجة الثقة كما هي بينما Tailwind يُحسب من القيم وحدها', () => {
    const json = toJson(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: { display: { value: 'flex', reliability: 'animating' } },
      }),
      16,
    )
    expect(json.styles.display).toEqual({ value: 'flex', reliability: 'animating' })
    expect(json.tailwind.classes).toEqual(['flex'])
  })

  it('حجم الجذر يمرّ إلى مخرج Tailwind', () => {
    const json = toJson(
      snapshot({ limits: COMPLETE_LIMITS, styles: { 'padding-block-start': used('10px') } }),
      10,
    )
    expect(json.tailwind.classes).toEqual(['pt-4'])
  })
})

describe('toTailwindText — الصياغة الكاملة', () => {
  it('بلا حدود ولا متعذّر يعطي سطر الأصناف وحده', () => {
    const text = toTailwindText(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: { display: used('flex'), 'padding-block-start': used('16px') },
      }),
      16,
    )
    expect(text).toBe('flex pt-4')
  })

  it('الحدود تسبق الأصناف تعليقات JSX', () => {
    const text = toTailwindText(
      snapshot({ limits: { ...COMPLETE_LIMITS, unlaid: true }, styles: { display: used('flex') } }),
      16,
    )
    expect(text.split('\n')).toEqual([
      '{/* العنصر بلا تخطيط — النسب لم تُحلّ إلى قيم مستعمَلة. */}',
      'flex',
    ])
  })

  it('المتعذّر يُسرَد بعد سطر فارغ مع سببه ورقم الإصدار', () => {
    const text = toTailwindText(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: { display: used('flex'), 'box-shadow': used('0 1px 2px black') },
      }),
      16,
    )
    expect(text.split('\n')).toEqual([
      'flex',
      '',
      '{/* بلا مقابل في Tailwind v4: */}',
      '{/*   box-shadow: 0 1px 2px black — سلّم مسمّى في Tailwind — لا مقابل حسابيًّا */}',
    ])
  })
})

describe('toCss — الخصائص المسمّاة خارج المجموعات (حزمة التسليم، ADR 0036 §2)', () => {
  it('تُلحق بعد المجموعات بترتيب تسميتها، وما لم يُسمَّ يبقى خارجًا', () => {
    const css = toCss(
      snapshot({
        limits: COMPLETE_LIMITS,
        styles: {
          'border-radius': used('8px'),
          padding: used('14px 24px'),
          'caret-color': used('red'),
          display: used('flex'),
        },
      }),
      ['padding', 'border-radius', 'display'],
    )
    const order = css
      .split('\n')
      .filter((l) => l.startsWith('  '))
      .map((l) => l.trim())
    expect(order).toEqual(['display: flex;', 'padding: 14px 24px;', 'border-radius: 8px;'])
  })

  it('المسمّى يمرّ بقاعدة القيم الابتدائية نفسها', () => {
    const css = toCss(snapshot({ limits: COMPLETE_LIMITS, styles: { gap: used('normal') } }), [
      'gap',
    ])
    expect(css).not.toContain('gap')
  })
})

describe('mapShorthand — اختصارات لقطة المشكلة', () => {
  it('القيمة الواحدة أداةٌ واحدة، والمتناظرة محوران، والأربع المختلفة جهاتٌ فيزيائية', () => {
    expect(mapShorthand('padding', '16px', 16)).toEqual([{ kind: 'scale', cls: 'p-4' }])
    expect(mapShorthand('padding', '14px 24px', 16)).toEqual([
      { kind: 'scale', cls: 'py-3.5' },
      { kind: 'scale', cls: 'px-6' },
    ])
    expect(
      mapShorthand('margin', '4px 8px 12px 16px', 16)?.map((m) => 'cls' in m && m.cls),
    ).toEqual(['mt-1', 'mr-2', 'mb-3', 'ml-4'])
    expect(mapShorthand('margin', '4px 8px 12px', 16)?.map((m) => 'cls' in m && m.cls)).toEqual([
      'mt-1',
      'mr-2',
      'mb-3',
      'ml-2',
    ])
  })

  it('ما لا يُقرأ جهاتٍ يُعلَن متعذّرًا ولا يُخترَع له صنف', () => {
    expect(mapShorthand('padding', '1px 2px 3px 4px 5px', 16)?.[0]?.kind).toBe('untranslatable')
    expect(mapShorthand('padding', '', 16)?.[0]?.kind).toBe('untranslatable')
    expect(mapShorthand('margin', 'auto', 16)?.[0]?.kind).toBe('untranslatable')
  })

  it('الفجوة بقيمتيها، و`normal` لا شيء', () => {
    expect(mapShorthand('gap', 'normal', 16)).toEqual([])
    expect(mapShorthand('gap', '8px', 16)).toEqual([{ kind: 'scale', cls: 'gap-2' }])
    expect(mapShorthand('gap', '8px 15px', 16)?.map((m) => 'cls' in m && m.cls)).toEqual([
      'gap-y-2',
      'gap-x-[15px]',
    ])
    expect(mapShorthand('gap', '1px 2px 3px', 16)?.[0]?.kind).toBe('untranslatable')
  })

  it('الحواف صريحةٌ بقيمتها، والمسافات فيها شرطات سفلية', () => {
    expect(mapShorthand('border-radius', '8px 4px', 16)).toEqual([
      { kind: 'arbitrary', cls: 'rounded-[8px_4px]', why: expect.any(String) },
    ])
  })

  it('ما ليس اختصارًا يمرّ إلى `mapProperty`، وخصائص لوحة الفحص لا تبلغه', () => {
    expect(mapShorthand('padding-block-start', '16px', 16)).toBeNull()
    expect(toTailwind({ 'padding-block-start': '16px' }, 16).classes).toEqual(['pt-4'])
    expect(toTailwind({ padding: '14px 24px', 'line-height': '24px' }, 16).classes).toEqual([
      'py-3.5',
      'px-6',
    ])
  })
})
