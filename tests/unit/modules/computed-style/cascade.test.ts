/**
 * حلّ التتالي من طرف إلى طرف — بأوراق أنماط حقيقية في happy-dom.
 *
 * **ما يُختبَر هنا هو المنطق لا المحرّك**: happy-dom بلا `@layer` حقيقي ولا
 * `@container` ولا `adoptedStyleSheets` كاملة، فالشروط تُحقَن مزيَّفة
 * (`RuleContext`) عمدًا — وهو بالضبط سبب كون العقد قابلًا للحقن. وصدق
 * الأرقام على متصفّح حقيقي مقياسه `scripts/verify-inspect.mjs`.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  collectCandidates,
  resolveAll,
  resolveProperty,
  type RuleContext,
} from '@/modules/computed-style/cascade'
import { LayerOrder } from '@/modules/computed-style/layer-order'
import { effectiveSelectors } from '@/modules/computed-style/nesting'
import {
  entriesForSelector,
  indexRules,
  type IndexedRule,
} from '@/modules/computed-style/selector-index'

/** يبني ورقة أنماط حقيقية في المستند ويُرجع قواعدها. */
function sheet(css: string): CSSStyleRule[] {
  const el = document.createElement('style')
  el.textContent = css
  document.head.append(el)
  const rules = Array.from(el.sheet?.cssRules ?? [])
  return rules.filter(
    (r): r is CSSStyleRule => typeof (r as CSSStyleRule).selectorText === 'string',
  )
}

/** يبني فهرسًا من قواعد، بترتيب ظهورها. */
function indexOf(rules: readonly CSSStyleRule[]) {
  const entries: IndexedRule[] = []
  rules.forEach((rule, i) => {
    entries.push(...entriesForSelector(rule, effectiveSelectors(rule), i))
  })
  return indexRules(entries)
}

/** سياق بسيط: بلا طبقات، وكل الشروط مطابقة. */
const plainCtx: RuleContext = {
  layer: () => null,
  layerPath: () => null,
  source: () => null,
  conditionsMatch: () => true,
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('الأساس — أي قاعدة فازت', () => {
  it('الأولوية الأعلى تفوز', () => {
    const rules = sheet('.a { color: blue } div.a { color: red }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    const win = resolveProperty(el, 'color', indexOf(rules), plainCtx)
    expect(win?.declared).toBe('red')
    expect(win?.selector).toBe('div.a')
  })

  it('ترتيب المستند يفصل عند تساوي الأولوية', () => {
    const rules = sheet('.a { color: blue } .b { color: green }')
    const el = document.createElement('div')
    el.className = 'a b'
    document.body.append(el)

    expect(resolveProperty(el, 'color', indexOf(rules), plainCtx)?.declared).toBe('green')
  })

  it('‏!important يغلب أولوية أعلى', () => {
    const rules = sheet('#x { color: blue } .a { color: red !important }')
    const el = document.createElement('div')
    el.id = 'x'
    el.className = 'a'
    document.body.append(el)

    const win = resolveProperty(el, 'color', indexOf(rules), plainCtx)
    expect(win?.declared).toBe('red')
    expect(win?.important).toBe(true)
  })

  it('النمط السطري يغلب كل قاعدة عادية', () => {
    const rules = sheet('#x { color: blue }')
    const el = document.createElement('div')
    el.id = 'x'
    el.setAttribute('style', 'color: purple')
    document.body.append(el)

    const win = resolveProperty(el, 'color', indexOf(rules), plainCtx)
    expect(win?.inline).toBe(true)
    expect(win?.declared).toContain('purple')
  })

  it('قاعدة مُهمّة تغلب النمط السطري العادي', () => {
    const rules = sheet('#x { color: blue !important }')
    const el = document.createElement('div')
    el.id = 'x'
    el.setAttribute('style', 'color: purple')
    document.body.append(el)

    expect(resolveProperty(el, 'color', indexOf(rules), plainCtx)?.inline).toBe(false)
  })

  it('null حين لا قاعدة مؤلِّف صرّحت بالخاصّية', () => {
    const rules = sheet('.a { color: blue }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    expect(resolveProperty(el, 'z-index', indexOf(rules), plainCtx)).toBeNull()
  })

  it('لا يُنسَب إلى العنصر ما لا يطابقه', () => {
    const rules = sheet('.other { color: red }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    expect(resolveProperty(el, 'color', indexOf(rules), plainCtx)).toBeNull()
  })
})

describe('المحلِّل يُسقط الباطل قبلنا — يُشترى ولا يُبنى', () => {
  it('التصريح غير الصالح لا يصل الفهرس أصلًا', () => {
    // قيس في Chrome: `color:nosuchcolor` و`margin:bogus` يُسقطان، وتبقى
    // `width` وحدها. وhappy-dom يتصرّف المتصرَّف نفسه هنا.
    const rules = sheet('.bad { color: nosuchcolor; width: 10px }')
    const el = document.createElement('div')
    el.className = 'bad'
    document.body.append(el)

    const index = indexOf(rules)
    expect(resolveProperty(el, 'width', index, plainCtx)?.declared).toBe('10px')
  })
})

describe('الطبقات تتقدّم على الأولوية', () => {
  it('الطبقة الأخيرة تغلب أولوية أعلى', () => {
    const rules = sheet('#x { color: blue } .a { color: green }')
    const el = document.createElement('div')
    el.id = 'x'
    el.className = 'a'
    document.body.append(el)

    const order = new LayerOrder()
    order.register('base')
    order.register('theme')

    // `#x` في `base` و`.a` في `theme` — والأخيرة تفوز رغم أولويتها الأدنى.
    const ctx: RuleContext = {
      ...plainCtx,
      layer: (rule) =>
        (rule as CSSStyleRule).selectorText === '#x' ? order.key('base') : order.key('theme'),
      layerPath: (rule) => ((rule as CSSStyleRule).selectorText === '#x' ? 'base' : 'theme'),
    }

    const win = resolveProperty(el, 'color', indexOf(rules), ctx)
    expect(win?.declared).toBe('green')
    expect(win?.layer).toBe('theme')
  })

  it('خارج الطبقات يغلب المُطبَّق', () => {
    const rules = sheet('.a { color: blue } .b { color: green }')
    const el = document.createElement('div')
    el.className = 'a b'
    document.body.append(el)

    const order = new LayerOrder()
    order.register('late')

    // `.b` متأخّرة لكنها داخل طبقة، و`.a` خارجها — فتفوز `.a`.
    const ctx: RuleContext = {
      ...plainCtx,
      layer: (rule) => ((rule as CSSStyleRule).selectorText === '.b' ? order.key('late') : null),
    }
    expect(resolveProperty(el, 'color', indexOf(rules), ctx)?.declared).toBe('blue')
  })
})

describe('الشروط المحقونة تُقصي القاعدة', () => {
  it('قاعدة بشرط غير مطابق لا تُحتسَب', () => {
    const rules = sheet('.a { color: blue } .a { color: red }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    const ctx: RuleContext = {
      ...plainCtx,
      conditionsMatch: (rule) => (rule as CSSStyleRule).style.getPropertyValue('color') !== 'red',
    }
    expect(resolveProperty(el, 'color', indexOf(rules), ctx)?.declared).toBe('blue')
  })
})

describe('resolveAll — مرور واحد يعطي ما تعطيه النداءات المفردة', () => {
  it('يطابق resolveProperty لكل خاصّية', () => {
    const rules = sheet(`
      .card { color: blue; padding-block-start: 4px }
      #hero { color: green }
      .card { padding-block-start: 8px }
    `)
    const el = document.createElement('div')
    el.id = 'hero'
    el.className = 'card'
    document.body.append(el)

    const index = indexOf(rules)
    const props = ['color', 'padding-block-start', 'z-index']
    const all = resolveAll(el, props, index, plainCtx)

    for (const prop of props) {
      const one = resolveProperty(el, prop, index, plainCtx)
      expect(all.get(prop)?.declared ?? null).toBe(one?.declared ?? null)
    }
    expect(all.get('color')?.declared).toBe('green')
    expect(all.get('padding-block-start')?.declared).toBe('8px')
    expect(all.get('z-index')).toBeNull()
  })

  it('يشمل النمط السطري', () => {
    const rules = sheet('.a { color: blue }')
    const el = document.createElement('div')
    el.className = 'a'
    el.setAttribute('style', 'color: orange')
    document.body.append(el)

    expect(resolveAll(el, ['color'], indexOf(rules), plainCtx).get('color')?.inline).toBe(true)
  })

  it('يُرجع مدخلًا لكل خاصّية مطلوبة ولو معدومًا', () => {
    const el = document.createElement('div')
    document.body.append(el)
    const all = resolveAll(el, ['color', 'width'], indexOf([]), plainCtx)
    expect(all.size).toBe(2)
    expect(all.get('color')).toBeNull()
  })
})

describe('collectCandidates', () => {
  it('يُرجع المرشّحين كلّهم لا الفائز وحده', () => {
    const rules = sheet('.a { color: blue } .a { color: red }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    expect(collectCandidates(el, 'color', indexOf(rules), plainCtx)).toHaveLength(2)
  })

  it('يتخطّى القاعدة التي لم تصرّح بالخاصّية', () => {
    const rules = sheet('.a { color: blue } .a { width: 1px }')
    const el = document.createElement('div')
    el.className = 'a'
    document.body.append(el)

    expect(collectCandidates(el, 'color', indexOf(rules), plainCtx)).toHaveLength(1)
  })
})
