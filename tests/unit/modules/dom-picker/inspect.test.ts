import { afterEach, describe, expect, it } from 'vitest'

import {
  boxEdges,
  boxGap,
  describeElement,
  elementBounds,
  marginRect,
  walkDown,
  walkUp,
  ZERO_EDGES,
  type Edges,
} from '@/modules/dom-picker/inspect'
import { viewportRect } from '@/shared/geometry'

/**
 * قراءة العنصر — القياسات والصناديق والمشي في الشجرة.
 *
 * happy-dom بلا محرّك تخطيط: الأرقام الحقيقية للتخطيط مقياسها Chrome في
 * `scripts/verify-picker.mjs`. ما يُختبَر هنا **منطق القراءة**: أي وحدة تُقبَل،
 * وأي عنصر يُعدّ حاوية، وكيف تُركَّب الحدود، وكيف يتخطّى المشي ما لا مساحة له.
 */

let mounted: HTMLElement[] = []

afterEach(() => {
  for (const el of mounted) el.remove()
  mounted = []
})

function mount<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (style) el.style.cssText = style
  document.body.append(el)
  mounted.push(el)
  return el
}

/** يمنح عنصرًا هندسةً — happy-dom لا يحسبها. */
function setRect(el: Element, x: number, y: number, w: number, h: number): void {
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

/** نافذة مزيَّفة تُرجع نمطًا محسوبًا بقيم خام كما يعطيها المتصفّح. */
function windowWith(props: Record<string, string>): Window {
  const style = {
    display: props.display ?? 'block',
    getPropertyValue: (name: string) => props[name] ?? '',
  }
  return { getComputedStyle: () => style } as unknown as Window
}

/** الجوانب بترتيب `inset`: أعلى، يمين، أسفل، يسار. */
const sides = (e: Edges) => [e.top, e.right, e.bottom, e.left]

/**
 * جوانب بترتيب `inset` — تُبنى بالمرور على الأسماء لا بمفاتيح `left`/`right`
 * حرفية، لأن اللنت يمنعها في واجهة RTL وهذه قياسات لا أنماط (كالمصدر تمامًا).
 */
const edgesOf = (...values: [number, number, number, number]): Edges =>
  Object.fromEntries(
    (['top', 'right', 'bottom', 'left'] as const).map((side, i) => [side, values[i]]),
  ) as unknown as Edges

describe('elementBounds', () => {
  it('يعيد مستطيل الحدود بفضاء النافذة كما يبلّغه المتصفّح', () => {
    const el = mount('div')
    setRect(el, 12, 34, 200, 80)
    expect(elementBounds(el)).toEqual(viewportRect(12, 34, 200, 80))
  })
})

describe('boxEdges — الوحدة تُفحَص لا يُكتفى بـparseFloat', () => {
  it('يقرأ الهامش والحدّ والحشوة بجهاتها الفيزيائية من النمط المحسوب', () => {
    const win = windowWith({
      'margin-top': '4px',
      'margin-right': '8px',
      'margin-bottom': '12px',
      'margin-left': '16px',
      'border-top-width': '1px',
      'border-right-width': '2px',
      'border-bottom-width': '3px',
      'border-left-width': '5px',
      'padding-top': '6.5px',
      'padding-right': '7px',
      'padding-bottom': '9px',
      'padding-left': '10px',
    })
    const edges = boxEdges(mount('div'), win)
    expect(sides(edges.margin)).toEqual([4, 8, 12, 16])
    expect(sides(edges.border)).toEqual([1, 2, 3, 5])
    expect(sides(edges.padding)).toEqual([6.5, 7, 9, 10])
  })

  /**
   * على عنصر `display: none` لا تخطيط يحلّ النسب، فتصل القيمة خامًا (`10%`).
   * `parseFloat('10%')` يعطي `10` بلا شكوى — فيُرسَم صندوق بأرقام مخترَعة.
   */
  it.each(['10%', 'auto', 'calc(1px + 2%)', '', '2em'])(
    'قيمة «%s» ليست بكسلًا فتُقرأ صفرًا لا رقمًا مخترَعًا',
    (raw) => {
      const win = windowWith({ 'padding-top': raw, 'margin-left': raw })
      const edges = boxEdges(mount('div'), win)
      expect(edges.padding.top).toBe(0)
      expect(edges.margin.left).toBe(0)
    },
  )

  it.each(['px', 'Infinitypx', 'NaNpx'])(
    'قيمة «%s» تنتهي بـpx لكنها ليست عددًا منتهيًا فتُقرأ صفرًا',
    (raw) => {
      const win = windowWith({ 'margin-top': raw, 'border-left-width': raw })
      const edges = boxEdges(mount('div'), win)
      expect(edges.margin.top).toBe(0)
      expect(edges.border.left).toBe(0)
    },
  )

  it('بلا نافذة صريحة يقرأ من نافذة الصفحة نفسها', () => {
    const el = mount(
      'button',
      'margin: 4px 8px 12px 16px; padding: 1px 2px 3px 5px; border: 2px solid',
    )
    const edges = boxEdges(el)
    expect(sides(edges.margin)).toEqual([4, 8, 12, 16])
    expect(sides(edges.padding)).toEqual([1, 2, 3, 5])
    expect(sides(edges.border)).toEqual([2, 2, 2, 2])
  })
})

describe('boxGap — الفجوة للحاويات وحدها', () => {
  it.each(['flex', 'grid', 'inline-flex', 'inline-grid'])(
    'display: %s حاوية — تُقرأ فجوتاها',
    (display) => {
      const win = windowWith({ display, 'row-gap': '12px', 'column-gap': '20px' })
      expect(boxGap(mount('div'), win)).toEqual({ row: 12, column: 20 })
    },
  )

  /**
   * `getComputedStyle` يُرجع `normal` أو قيمةً لأي عنصر بصرف النظر عن `display`،
   * فلو قُرئت الفجوة بلا فحص العرض لظهرت فجوة وهمية على فقرة عادية.
   */
  it.each(['block', 'inline', 'none', 'contents', 'table'])(
    'display: %s ليس حاوية فلا فجوة له حتى لو وُجدت قيمة',
    (display) => {
      const win = windowWith({ display, 'row-gap': '12px', 'column-gap': '20px' })
      expect(boxGap(mount('div'), win)).toEqual({ row: 0, column: 0 })
    },
  )

  it('حاوية بفجوة `normal` (غير محدَّدة) تُقرأ صفرًا', () => {
    const win = windowWith({ display: 'flex', 'row-gap': 'normal', 'column-gap': 'normal' })
    expect(boxGap(mount('div'), win)).toEqual({ row: 0, column: 0 })
  })

  it('الصفّ والعمود مستقلّان', () => {
    const win = windowWith({ display: 'grid', 'row-gap': '7px', 'column-gap': '0px' })
    expect(boxGap(mount('div'), win)).toEqual({ row: 7, column: 0 })
  })

  it('بلا نافذة صريحة يقرأ من نافذة الصفحة: الحاوية بفجوتها والكتلة بلا فجوة', () => {
    const container = mount('div', 'display: flex; row-gap: 9px; column-gap: 11px')
    expect(boxGap(container)).toEqual({ row: 9, column: 11 })

    // القيمتان نفسهما على كتلة عادية لا تعنيان شيئًا — العرض هو الحَكَم.
    const block = mount('div', 'row-gap: 9px; column-gap: 11px')
    expect(boxGap(block)).toEqual({ row: 0, column: 0 })
  })
})

describe('marginRect — أوسع الصناديق', () => {
  it('يوسّع المستطيل بالهامش من الجهات الأربع', () => {
    const margin = edgesOf(4, 8, 12, 16)
    // الأصل يتراجع بالهامش العلوي والأيسر، والمقاس يزيد بمجموع كل جهتين متقابلتين.
    expect(marginRect(viewportRect(100, 50, 200, 80), margin)).toEqual(
      viewportRect(84, 46, 224, 96),
    )
  })

  it('هامش صفري لا يغيّر شيئًا', () => {
    const rect = viewportRect(10, 20, 30, 40)
    expect(marginRect(rect, ZERO_EDGES)).toEqual(rect)
  })

  it('هامش سالب يضيّق المستطيل — القيمة السالبة حقيقية في CSS', () => {
    const margin = edgesOf(-5, -5, -5, -5)
    expect(marginRect(viewportRect(0, 0, 100, 100), margin)).toEqual(viewportRect(5, 5, 90, 90))
  })
})

describe('describeElement', () => {
  it('يجمع الوسم بحروف صغيرة وحدود العنصر وصناديقه بقراءة واحدة', () => {
    const el = mount('section')
    setRect(el, 5, 6, 70, 30)
    const win = windowWith({ 'padding-left': '3px', 'margin-top': '2px' })

    const info = describeElement(el, win)

    expect(info.el).toBe(el)
    // `tagName` في HTML بحروف كبيرة؛ الواجهة تعرض الصغيرة كما يكتبها المؤلّف.
    expect(info.tag).toBe('section')
    expect(info.rect).toEqual(viewportRect(5, 6, 70, 30))
    expect(info.edges.padding.left).toBe(3)
    expect(info.edges.margin.top).toBe(2)
    expect(info.edges.border).toEqual(ZERO_EDGES)
  })

  it('بلا نافذة صريحة يقرأ الأنماط من نافذة الصفحة', () => {
    const el = mount('p', 'padding: 4px 6px')
    setRect(el, 0, 0, 10, 10)
    const info = describeElement(el)
    expect(sides(info.edges.padding)).toEqual([4, 6, 4, 6])
  })
})

describe('المشي في الشجرة — ما لا يغطّيه اختبار الاستهداف', () => {
  it('↑ من عنصر منفصل عن المستند يُرجع null بدل أن يدور', () => {
    const detached = document.createElement('div')
    expect(walkUp(detached)).toBeNull()
  })

  it('↓ يتخطّى غلافًا بلا مساحة ولا محتوى إلى الأخ التالي ولا يتوقّف عنده', () => {
    const section = mount('section')
    const emptyWrap = document.createElement('div')
    const ghost = document.createElement('i')
    const next = document.createElement('p')
    emptyWrap.append(ghost)
    section.append(emptyWrap, next)
    setRect(section, 0, 0, 100, 60)
    setBoxless(emptyWrap)
    setBoxless(ghost)
    setRect(next, 0, 30, 100, 20)

    expect(walkDown(section)).toBe(next)
  })

  it('↓ يُرجع null حين كل الأحفاد بلا مساحة', () => {
    const section = mount('section')
    const wrap = document.createElement('div')
    wrap.append(document.createElement('i'))
    section.append(wrap)
    setRect(section, 0, 0, 100, 60)
    setBoxless(wrap)
    setBoxless(wrap.firstElementChild!)

    expect(walkDown(section)).toBeNull()
  })
})
