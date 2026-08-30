/**
 * مخرجات النسخ الثلاثة — والقاعدة الحاكمة: **لا يُخترَع صنف لا يعمل**.
 *
 * المسألة هنا ليست اكتمال الجدول بل صدقه. `padding: 15px` ليس `p-4`، واسم
 * لون في لوحة Tailwind يتغيّر بالإصدار والتخصيص — فالقيمة الصريحة تنجو
 * والاسم المخمَّن يكذب. وكل حالة أدناه تحرس هذا الحدّ.
 */
import { describe, expect, it } from 'vitest'

import { toCss, toJson, toTailwindText } from '@/modules/style-export/css'
import { mapProperty, mapSpacing, toTailwind } from '@/modules/style-export/tailwind'
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
