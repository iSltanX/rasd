/**
 * أيّ شيء يمرّر هذه الصفحة؟ — اختيار المُمرِّر بالأرقام لا بالحدس.
 *
 * happy-dom بلا تخطيط: `scrollHeight` و`clientHeight` و`getBoundingClientRect`
 * كلّها أصفار. فتُبنى هنا **شجرة عناصر حقيقية مفصولة** (لأن `depthOf` يقرأ
 * `parentElement`) بهندسة مزروعة، ومستند ونافذة مزيَّفان يعطيان ما يقرؤه
 * المصدر وحده. والأرقام مأخوذة من الحالات المقيسة في ترويسة الملفّ المصدر:
 * لوحة SPA، وتذييل 20px، وقراءة ثلاثية الأجزاء.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MIN_OVERFLOW_PX,
  MIN_VIEWPORT_SHARE,
  RIVAL_FACTOR,
  findScrollTarget,
  readScroll,
  scrollToInstant,
  type ScrollTarget,
} from '@/modules/capture/scroller'

const VW = 1000
const VH = 1000

/** مستطيل بحدّيه: زاوية عليا (x0, y0) وسفلى (x1, y1) بإحداثيات النافذة. */
interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 })

/** مستطيل يغطّي النافذة كلّها — نصيبه 1. */
const FULL: Box = box(0, 0, VW, VH)

/** هندسة عنصر مزروعة: ما لا تعطيه happy-dom. */
interface Geo {
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly overflowY?: string
  readonly rect?: Box
}

/** يزرع الهندسة على عنصر حقيقي ويسجّل نمط تجاوزه في `overflows`. */
function plant<T extends Element>(el: T, geo: Geo, overflows: Map<Element, string>): T {
  Object.defineProperty(el, 'scrollHeight', { value: geo.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: geo.clientHeight, configurable: true })
  const r = geo.rect ?? FULL
  el.getBoundingClientRect = () => new DOMRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  overflows.set(el, geo.overflowY ?? 'visible')
  return el
}

/** فجوة التمرير المطلوبة بين `scrollHeight` و`clientHeight`. */
const geoOf = (maxScroll: number, extra: Partial<Geo> = {}): Geo => ({
  scrollHeight: 800 + maxScroll,
  clientHeight: 800,
  ...extra,
})

interface Scene {
  readonly doc: Document
  readonly html: HTMLElement
  readonly body: HTMLElement
  /** يضيف عنصرًا تحت `parent` (الجسم افتراضيًّا) بهندسة مزروعة. */
  add(geo: Geo, parent?: Element): HTMLElement
}

interface SceneOptions {
  /** مدى تمرير الجذر — `html`، أو `body` حين `scrollingElement = 'body'`. */
  readonly rootScroll?: number
  /** ما يشير إليه `scrollingElement`. */
  readonly scrollingElement?: 'html' | 'body' | null
  readonly bodyGeo?: Partial<Geo>
  /** تجاوز `html` — `visible` افتراضيًّا كما في صفحة عاديّة. */
  readonly htmlOverflowY?: string
  readonly innerWidth?: number
  readonly innerHeight?: number
}

/**
 * مشهد: مستند مزيَّف فوق شجرة `html > body` حقيقية.
 *
 * `querySelectorAll('*')` يُرجع `html` نفسه ثم أبناءه كلّهم بترتيب المستند —
 * وفيهم `body`، كما في المستند الحقيقي.
 */
function scene(opts: SceneOptions = {}): Scene {
  const overflows = new Map<Element, string>()
  const html = document.createElement('html')
  const body = document.createElement('body')
  html.append(body)

  plant(html, geoOf(opts.rootScroll ?? 0, { overflowY: opts.htmlOverflowY }), overflows)
  plant(body, geoOf(0, opts.bodyGeo), overflows)

  const win = {
    innerWidth: opts.innerWidth ?? VW,
    innerHeight: opts.innerHeight ?? VH,
    getComputedStyle: (el: Element) => ({ overflowY: overflows.get(el) ?? 'visible' }),
  }
  const scrolling =
    opts.scrollingElement === undefined || opts.scrollingElement === 'html'
      ? html
      : opts.scrollingElement === 'body'
        ? body
        : null

  const doc = {
    defaultView: win,
    scrollingElement: scrolling,
    documentElement: html,
    body,
    querySelectorAll: () => [html, ...html.querySelectorAll('*')],
  } as unknown as Document

  return {
    doc,
    html,
    body,
    add(geo, parent = body) {
      const el = plant(document.createElement('div'), geo, overflows)
      parent.append(el)
      return el
    },
  }
}

/** حاوية تمرّر بمدًى معيَّن — تجاوز `auto` وتغطية كاملة ما لم يُقَل غيره. */
const scroller = (maxScroll: number, extra: Partial<Geo> = {}): Geo =>
  geoOf(maxScroll, { overflowY: 'auto', ...extra })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('findScrollTarget — الجذر وحده يمرّر', () => {
  it('لا مرشّحين ⇒ الجذر هدفًا، يقينًا، بلا منافسين', () => {
    const s = scene({ rootScroll: 4200 })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.kind).toBe('viewport')
    expect(choice.target.el).toBe(s.html)
    expect(choice.target.maxScroll).toBe(4200)
    expect(choice.confidence).toBe('certain')
    expect(choice.rivals).toEqual([])
    expect(choice.rootAlsoScrolls).toBe(0)
  })

  it('صفحة أقصر من النافذة ⇒ المدى صفر لا سالب', () => {
    // `clientHeight > scrollHeight` يحدث في تخطيطات الحشو السالب — والمدى
    // السالب كان سيجعل الجذر «أبطأ من لا شيء» فيخسر أمام أي مرشّح.
    const s = scene()
    Object.defineProperty(s.html, 'scrollHeight', { value: 500, configurable: true })

    expect(findScrollTarget(s.doc).target.maxScroll).toBe(0)
  })

  it('يستعمل documentElement حين لا يوجد scrollingElement', () => {
    const s = scene({ scrollingElement: null, rootScroll: 900 })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.html)
    expect(choice.target.maxScroll).toBe(900)
  })
})

describe('findScrollTarget — حاوية داخلية تمرّر الصفحة', () => {
  it('لوحة SPA: الجذر خامل والحاوية مداها 10,350 ⇒ تُختار يقينًا', () => {
    const s = scene({ rootScroll: 0 })
    const panel = s.add(scroller(10_350))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.kind).toBe('element')
    expect(choice.target.el).toBe(panel)
    expect(choice.target.maxScroll).toBe(10_350)
    expect(choice.target.scrollHeight).toBe(11_150)
    expect(choice.target.clientHeight).toBe(800)
    expect(choice.confidence).toBe('certain')
    expect(choice.rivals).toEqual([])
    expect(choice.rootAlsoScrolls).toBe(0)
  })

  it('تذييل 20px: مدى الجذر 20 خامل، فتُنتزَع الحاوية — لا يُختار الجذر لأن مداه > 0', () => {
    const s = scene({ rootScroll: 20 })
    const panel = s.add(scroller(11_200))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(panel)
    // الجذر «يمرّر» تقنيًّا ويُبلَّغ عنه، لكنه لا يمثّل الصفحة.
    expect(choice.rootAlsoScrolls).toBe(20)
  })

  it('لوحة قراءة ثلاثية الأجزاء: تغطية 50% تكفي — العتبة 0.35 لا 0.6', () => {
    const s = scene()
    const pane = s.add(scroller(11_287, { rect: box(0, 0, VW / 2, VH) }))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(pane)
    expect(choice.target.maxScroll).toBe(11_287)
  })

  it('يقبل scroll وoverlay كما يقبل auto — ويرفض غيرها', () => {
    for (const overflowY of ['auto', 'scroll', 'overlay']) {
      const s = scene()
      const el = s.add(scroller(2000, { overflowY }))
      expect(findScrollTarget(s.doc).target.el, overflowY).toBe(el)
    }
    for (const overflowY of ['hidden', 'visible', 'clip']) {
      const s = scene()
      s.add(scroller(2000, { overflowY }))
      const choice = findScrollTarget(s.doc)
      // فيضٌ كبير بلا تمرير حقيقي — لا مرشّح، فيبقى الجذر.
      expect(choice.target.kind, overflowY).toBe('viewport')
      expect(choice.rivals, overflowY).toEqual([])
    }
  })

  it('يتجاهل html وbody في المسح العامّ — الجسم يُعالَج بحالته الخاصّة', () => {
    // الجسم بتجاوز `auto` ومدى كبير سيُضاف مرّة واحدة لا مرّتين: مرّة من
    // المسح ومرّة من الحالة الخاصّة لو لم يُتجاهَل في الأولى.
    const s = scene({ bodyGeo: { overflowY: 'auto', ...geoOf(3000) } })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.body)
    expect(choice.rivals).toEqual([])
    expect(choice.confidence).toBe('certain')
  })
})

describe('findScrollTarget — حدود الفيض والتغطية', () => {
  it(`الفيض ${MIN_OVERFLOW_PX - 1}px ضجيج تخطيط، و${MIN_OVERFLOW_PX}px مرشّح`, () => {
    const below = scene()
    below.add(scroller(MIN_OVERFLOW_PX - 1))
    const noise = findScrollTarget(below.doc)
    expect(noise.target.kind).toBe('viewport')
    expect(noise.rivals).toEqual([])

    const at = scene()
    const el = at.add(scroller(MIN_OVERFLOW_PX))
    expect(findScrollTarget(at.doc).target.el).toBe(el)
  })

  it('نصيب النافذة: أقلّ من العتبة يُهمَل، وعندها بالضبط يُقبَل', () => {
    const under = scene()
    under.add(
      scroller(5000, {
        rect: box(0, 0, VW, VH * MIN_VIEWPORT_SHARE - 1),
      }),
    )
    expect(findScrollTarget(under.doc).target.kind).toBe('viewport')

    const exact = scene()
    const el = exact.add(
      scroller(5000, {
        rect: box(0, 0, VW, VH * MIN_VIEWPORT_SHARE),
      }),
    )
    expect(findScrollTarget(exact.doc).target.el).toBe(el)
  })

  it('الجزء الظاهر وحده يُحسَب: مستطيل يفيض عن النافذة يُقصّ إليها', () => {
    // عرضه 3000 لكن الظاهر منه 1000: 1000 × 400 = 40% فيُقبَل.
    const wide = scene()
    const el = wide.add(scroller(5000, { rect: box(-1000, -100, 2000, 400) }))
    expect(findScrollTarget(wide.doc).target.el).toBe(el)

    // بلا القصّ كان نصيب هذين 60% و80% فيُقبلان؛ وبه 20% و30% فيسقطان.
    const clippedX = scene()
    clippedX.add(scroller(5000, { rect: box(-2000, 0, 1000, 200) }))
    const clippedY = scene()
    clippedY.add(scroller(5000, { rect: box(0, -500, 1000, 300) }))
    expect(findScrollTarget(clippedX.doc).target.kind).toBe('viewport')
    expect(findScrollTarget(clippedY.doc).target.kind).toBe('viewport')
  })

  it('حاوية خارج النافذة كلّيًّا لا تُحسَب — لا نصيب سالب ولا موجب من سالبين', () => {
    const s = scene()
    // أيمن النافذة تمامًا: لا تقاطع أفقي.
    s.add(scroller(5000, { rect: box(VW + 100, 0, VW + 900, VH) }))
    // أسفل النافذة تمامًا: لا تقاطع رأسي.
    s.add(scroller(5000, { rect: box(0, VH + 100, VW, VH + 900) }))
    // قطريًّا خارجها: البُعدان سالبان، وحاصلهما لو لم يُصفَّرا موجب كبير (4×).
    s.add(scroller(5000, { rect: box(3000, 3000, 4000, 4000) }))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.kind).toBe('viewport')
    expect(choice.rivals).toEqual([])
  })

  it('نافذة بلا مساحة (عرض أو ارتفاع صفر) ⇒ لا نصيب لأيّ حاوية', () => {
    for (const dims of [{ innerWidth: 0 }, { innerHeight: 0 }]) {
      const s = scene(dims)
      s.add(scroller(5000))
      const choice = findScrollTarget(s.doc)
      expect(choice.target.kind, JSON.stringify(dims)).toBe('viewport')
      expect(choice.rivals, JSON.stringify(dims)).toEqual([])
    }
  })
})

describe('findScrollTarget — الجسم هو المُمرِّر', () => {
  it('scrollingElement يشير إلى html والمُمرِّر الفعلي body ⇒ يُختار الجسم', () => {
    // التخطيط المقيس: `html{overflow:hidden} + body{overflow:auto}`. الجذر
    // المُعلَن هو `html` ومداه صفر، والحركة كلّها في الجسم.
    const s = scene({ rootScroll: 0, bodyGeo: geoOf(7000) })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.kind).toBe('element')
    expect(choice.target.el).toBe(s.body)
    expect(choice.target.maxScroll).toBe(7000)
  })

  it('الجسم يُضاف بلا فحص التغطية — فلو كان مداه ضجيجًا لم يُضَف', () => {
    const s = scene({ rootScroll: 3000, bodyGeo: geoOf(MIN_OVERFLOW_PX - 1) })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.html)
    expect(choice.rivals).toEqual([])
    expect(choice.confidence).toBe('certain')
  })

  it('حين يكون الجسم نفسه scrollingElement فهو الجذر لا مرشّحًا مكرَّرًا', () => {
    const s = scene({ scrollingElement: 'body', bodyGeo: geoOf(6000) })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.kind).toBe('viewport')
    expect(choice.target.el).toBe(s.body)
    expect(choice.rivals).toEqual([])
  })

  it('html غير الجذر لا يُحسَب مرشّحًا ولو كان تجاوزه auto ومداه كبيرًا', () => {
    // `scrollingElement` هو الجسم، و`html` يعلن `overflow:auto` بمدًى معتبر.
    // المسح العامّ يمرّ عليه أوّلًا (المستند الحقيقي يُعدِّده)، فلولا التجاهل
    // لدخل منافسًا مكرَّرًا وسقط الاختيار إلى «ملتبس».
    const s = scene({
      scrollingElement: 'body',
      bodyGeo: geoOf(6000),
      rootScroll: 3000,
      htmlOverflowY: 'auto',
    })

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.body)
    expect(choice.rivals).toEqual([])
    expect(choice.confidence).toBe('certain')
  })

  it('مستند بلا body لا يكسر الاختيار', () => {
    const s = scene({ rootScroll: 100 })
    const bodyless = { ...s.doc, body: null } as unknown as Document

    const choice = findScrollTarget(bodyless)

    expect(choice.target.el).toBe(s.html)
    expect(choice.rivals).toEqual([])
  })
})

describe('findScrollTarget — الجذر يمرّر أيضًا: المقارنة بين المدَيات', () => {
  it(`منافس مداه ≤ ${RIVAL_FACTOR}× مدى الجذر لا يُنتزَع به الاختيار — يبقى الجذر ومعه تنبيه`, () => {
    // الجذر 100 (غير خامل: ≥ 64)، والحاوية 1000 = 10× بالضبط، والشرط «>» صارم.
    const s = scene({ rootScroll: 100 })
    const rival = s.add(scroller(100 * RIVAL_FACTOR))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.html)
    expect(choice.target.kind).toBe('viewport')
    expect(choice.confidence).toBe('ambiguous')
    expect(choice.rivals.map((r) => r.el)).toEqual([rival])
    // الفرع الأخير يصفّر التنبيه: الهدف هو الجذر نفسه.
    expect(choice.rootAlsoScrolls).toBe(0)
  })

  it('منافس يفوق مدى الجذر بأكثر من الحدّ يُنتزَع منه، ويُبلَّغ مدى الجذر', () => {
    const s = scene({ rootScroll: 100 })
    const winner = s.add(scroller(100 * RIVAL_FACTOR + 1))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(winner)
    expect(choice.rootAlsoScrolls).toBe(100)
  })

  it('جذر أدنى من الحدّ الأدنى للفيض خامل مهما صغر المنافس', () => {
    // الجذر 63 (خامل) والمنافس 100: `100 > 630` كاذبة، فالذي يحسم هو الخمول.
    const s = scene({ rootScroll: MIN_OVERFLOW_PX - 1 })
    const rival = s.add(scroller(MIN_OVERFLOW_PX + 36))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(rival)
    expect(choice.rootAlsoScrolls).toBe(MIN_OVERFLOW_PX - 1)
  })

  it('جذر على الحدّ الأدنى بالضبط ليس خاملًا — فلا ينتزعه منافس صغير', () => {
    const s = scene({ rootScroll: MIN_OVERFLOW_PX })
    s.add(scroller(MIN_OVERFLOW_PX + 36))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(s.html)
    expect(choice.confidence).toBe('ambiguous')
  })
})

describe('findScrollTarget — الترتيب والالتباس بين المرشّحين', () => {
  it('الأكبر مدًى يُختار، والبقية منافسون بترتيب المدى التنازلي', () => {
    const s = scene()
    const small = s.add(scroller(1000))
    const big = s.add(scroller(9000))
    const mid = s.add(scroller(3000))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(big)
    expect(choice.rivals.map((r) => r.el)).toEqual([mid, small])
  })

  it('منافس أقلّ من نصف مدى الفائز لا يُلبِس الاختيار', () => {
    const s = scene()
    s.add(scroller(10_000))
    const other = s.add(scroller(5000))

    const choice = findScrollTarget(s.doc)

    // النصف بالضبط لا يكفي: الشرط «>» صارم.
    expect(choice.confidence).toBe('certain')
    // لكنه يبقى مسجَّلًا في المنافسين — لا يُخفى.
    expect(choice.rivals.map((r) => r.el)).toEqual([other])
  })

  it('منافس فوق النصف يجعل الاختيار ملتبسًا', () => {
    const s = scene()
    const winner = s.add(scroller(10_000))
    s.add(scroller(5001))

    const choice = findScrollTarget(s.doc)

    expect(choice.target.el).toBe(winner)
    expect(choice.confidence).toBe('ambiguous')
    expect(choice.rivals).toHaveLength(1)
  })

  it('تعادل المدى يحسمه العمق: الحاوية الخارجية تسبق المتداخلة', () => {
    // ترتيب المسح الطبيعي يضع الخارجية قبل الداخلية فلا يكشف الفرز شيئًا؛
    // لذلك تُقدَّم الداخلية في القائمة المُعادة ليُختبَر الفرز لا ترتيب الوصول.
    const s = scene()
    const outer = s.add(scroller(4000))
    const inner = s.add(scroller(4000), outer)
    const doc = {
      ...(s.doc as unknown as object),
      querySelectorAll: () => [inner, outer],
    } as unknown as Document

    const choice = findScrollTarget(doc)

    expect(choice.target.el).toBe(outer)
    expect(choice.rivals.map((r) => r.el)).toEqual([inner])
    // مداهما متساويان فالالتباس مسجَّل.
    expect(choice.confidence).toBe('ambiguous')
  })

  it('عمق الحاوية يُعَدّ بسلاسل الآباء كلّها', () => {
    // ثلاث حاويات بمدًى واحد على أعماق 2 و3 و4، تُقدَّم بأعمقها أوّلًا.
    const s = scene()
    const shallow = s.add(scroller(4000))
    const wrapper = s.add({ scrollHeight: 0, clientHeight: 0 })
    const wrapper2 = s.add({ scrollHeight: 0, clientHeight: 0 }, wrapper)
    const deep = s.add(scroller(4000), wrapper2)
    const mid = s.add(scroller(4000), wrapper)
    const doc = {
      ...(s.doc as unknown as object),
      querySelectorAll: () => [deep, mid, shallow],
    } as unknown as Document

    const choice = findScrollTarget(doc)

    expect(choice.target.el).toBe(shallow)
    expect(choice.rivals.map((r) => r.el)).toEqual([mid, deep])
  })
})

describe('findScrollTarget — الإعدادات الافتراضية', () => {
  it('بلا وسيط يقرأ المستند العامّ', () => {
    // happy-dom بلا تخطيط: كل الفيض صفر ⇒ جذر خامل ولا مرشّح.
    const choice = findScrollTarget()

    expect(choice.target.kind).toBe('viewport')
    expect(choice.target.el).toBe(document.scrollingElement ?? document.documentElement)
    expect(choice.target.maxScroll).toBe(0)
    expect(choice.confidence).toBe('certain')
  })

  it('مستند بلا defaultView يرجع إلى النافذة العامّة لا يرمي', () => {
    const s = scene({ rootScroll: 0 })
    const panel = s.add(scroller(5000))
    // ما تعطيه النافذة العامّة هو ما يُسأل عنه: نجعلها ترى `panel` ممرِّرًا.
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(
        (el: Element) => ({ overflowY: el === panel ? 'auto' : 'visible' }) as CSSStyleDeclaration,
      )
    const doc = { ...(s.doc as unknown as object), defaultView: null } as unknown as Document
    // عرض النافذة العامّة وارتفاعها من happy-dom (لا نُحكِمهما)؛ المستطيل أكبر منهما فيغطّيهما.
    panel.getBoundingClientRect = () => new DOMRect(0, 0, 1e6, 1e6)

    const choice = findScrollTarget(doc)

    expect(spy).toHaveBeenCalled()
    expect(choice.target.el).toBe(panel)
  })
})

describe('readScroll — الموضع بالمحورين', () => {
  const target = (kind: ScrollTarget['kind'], el: Element): ScrollTarget => ({
    kind,
    el,
    clientHeight: 800,
    scrollHeight: 5000,
    maxScroll: 4200,
  })

  it('الإطار: من النافذة، بالإزاحة الأفقية السالبة كما في RTL', () => {
    const win = { scrollX: -320, scrollY: 1500 } as unknown as Window

    expect(readScroll(target('viewport', document.documentElement), win)).toEqual({
      x: -320,
      y: 1500,
    })
  })

  it('العنصر: من scrollLeft وscrollTop لا من النافذة', () => {
    const el = document.createElement('div')
    el.scrollTop = 640
    el.scrollLeft = 12
    // النافذة تُعطي أرقامًا مختلفة لتكشف القراءة من المصدر الخطأ.
    const win = { scrollX: 1, scrollY: 2 } as unknown as Window

    const pos = readScroll(target('element', el), win)

    expect(pos).toEqual({ x: el.scrollLeft, y: el.scrollTop })
    expect(pos.y).toBe(640)
  })

  it('بلا نافذة صريحة تقرأ النافذة العامّة', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { value: 987, configurable: true })
    try {
      expect(readScroll(target('viewport', document.documentElement)).y).toBe(987)
    } finally {
      if (original) Object.defineProperty(window, 'scrollY', original)
      else Reflect.deleteProperty(window, 'scrollY')
    }
  })
})

describe('scrollToInstant — يمرّر فورًا بالخيار لا بمسّ نمط الصفحة', () => {
  /** المفتاح الأفقي محسوب: قاعدة اللنت تمنع كتابته حرفيًّا في كائن. */
  const inlineKey = 'left' as const

  const target = (kind: ScrollTarget['kind'], el: Element): ScrollTarget => ({
    kind,
    el,
    clientHeight: 800,
    scrollHeight: 5000,
    maxScroll: 4200,
  })

  it('الإطار: win.scrollTo بالمحورين وbehavior instant', () => {
    const scrollTo = vi.fn()
    const win = { scrollTo } as unknown as Window
    const el = document.createElement('div')
    const elScrollTo = vi.fn()
    el.scrollTo = elScrollTo

    scrollToInstant(target('viewport', el), { x: -40, y: 3000 }, win)

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ [inlineKey]: -40, top: 3000, behavior: 'instant' })
    // الإطار لا يمرّر العنصر.
    expect(elScrollTo).not.toHaveBeenCalled()
  })

  it('العنصر: el.scrollTo بالخيارات نفسها، ولا يمسّ النافذة', () => {
    const scrollTo = vi.fn()
    const win = { scrollTo } as unknown as Window
    const el = document.createElement('div')
    const elScrollTo = vi.fn()
    el.scrollTo = elScrollTo

    scrollToInstant(target('element', el), { x: 0, y: 7200 }, win)

    expect(elScrollTo).toHaveBeenCalledTimes(1)
    expect(elScrollTo).toHaveBeenCalledWith({ [inlineKey]: 0, top: 7200, behavior: 'instant' })
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('بلا نافذة صريحة تمرّر النافذة العامّة', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    scrollToInstant(target('viewport', document.documentElement), { x: 5, y: 60 })

    expect(spy).toHaveBeenCalledWith({ [inlineKey]: 5, top: 60, behavior: 'instant' })
  })
})
