import { describe, expect, it, vi } from 'vitest'

import {
  contains,
  deviceToPage,
  deviceToViewport,
  fromDomRect,
  intersect,
  normalizeRect,
  pagePoint,
  pageRect,
  pageRectToDevice,
  pageRectToViewport,
  pageToDevice,
  pageToViewport,
  readSpace,
  viewportPoint,
  viewportRect,
  viewportRectToDevice,
  viewportRectToPage,
  viewportToDevice,
  viewportToPage,
  watchDpr,
  type CoordSpace,
} from '@/content/coords'

/**
 * الفضاءات الثلاثة — العقد الذي تعتمد عليه كل أداة لاحقة.
 *
 * الدوالّ نقيّة وتأخذ `CoordSpace` صراحةً، فتُختبَر بلا متصفّح: هذا هو سبب
 * تمرير اللقطة بدل قراءة `window` داخل كل تحويل.
 */

const space = (o: Partial<CoordSpace> = {}): CoordSpace => ({
  scrollX: 0,
  scrollY: 0,
  layoutWidth: 1280,
  layoutHeight: 720,
  pageWidth: 1280,
  pageHeight: 4000,
  dpr: 1,
  rtl: false,
  rootScaleX: 1,
  rootScaleY: 1,
  rootDistorted: false,
  ...o,
})

const DPRS = [1, 1.5, 2, 3]

describe('viewport ↔ page — ذهابًا وإيابًا', () => {
  for (const scroll of [
    { scrollX: 0, scrollY: 0 },
    { scrollX: 0, scrollY: 1337 },
    { scrollX: 240, scrollY: 980 },
    // RTL: التمرير الأفقي سالب في Chrome — يجب ألّا يُفترض ≥ 0.
    { scrollX: -1815, scrollY: 400 },
  ]) {
    it(`تمرير ${scroll.scrollX} × ${scroll.scrollY}`, () => {
      const s = space({ ...scroll, rtl: scroll.scrollX < 0 })
      const v = viewportPoint(120.5, 64.25)
      const back = pageToViewport(viewportToPage(v, s), s)
      expect(back).toEqual(v)

      const r = viewportRect(10, 20, 300, 150)
      expect(pageRectToViewport(viewportRectToPage(r, s), s)).toEqual(r)
    })
  }

  it('الإزاحة هي التمرير بالضبط', () => {
    const s = space({ scrollX: 40, scrollY: 500 })
    expect(viewportToPage(viewportPoint(0, 0), s)).toEqual(pagePoint(40, 500))
  })

  it('المقاس لا يتغيّر بالتحويل — التمرير إزاحة لا تحجيم', () => {
    const s = space({ scrollX: 40, scrollY: 500 })
    const r = viewportRectToPage(viewportRect(0, 0, 300, 150), s)
    expect([r.width, r.height]).toEqual([300, 150])
  })
})

describe('device — كثافة البكسل', () => {
  for (const dpr of DPRS) {
    it(`نقطة تعود كما هي عند dpr=${dpr} مع تمرير غير صفري`, () => {
      const s = space({ dpr, scrollX: 33, scrollY: 777 })
      const v = viewportPoint(101.5, 202.25)
      expect(deviceToViewport(viewportToDevice(v, s), s)).toEqual(v)
      const p = pagePoint(11.25, 22.5)
      expect(deviceToPage(pageToDevice(p, s), s)).toEqual(p)
    })

    it(`الضرب في dpr=${dpr} صريح`, () => {
      const s = space({ dpr })
      expect(viewportToDevice(viewportPoint(10, 20), s)).toEqual({
        space: 'device',
        x: 10 * dpr,
        y: 20 * dpr,
      })
    })
  }

  it('لا يخزّن dpr: لقطتان مختلفتان تعطيان نتيجتين', () => {
    const v = viewportPoint(100, 100)
    expect(viewportToDevice(v, space({ dpr: 1 })).x).toBe(100)
    expect(viewportToDevice(v, space({ dpr: 2 })).x).toBe(200)
  })
})

describe('تقريب حوافّ المستطيل — لا خيط بين البلاطات', () => {
  for (const dpr of DPRS) {
    it(`بلاطتان متلاصقتان تتشاركان الحافّة عند dpr=${dpr}`, () => {
      const s = space({ dpr })
      // حافّة كسرية بين البلاطتين — أسوأ حالة للتقريب.
      const a = viewportRectToDevice(viewportRect(0, 0, 100.5, 50), s)
      const b = viewportRectToDevice(viewportRect(100.5, 0, 99.5, 50), s)
      expect(a.x + a.width).toBe(b.x)
    })

    it(`سلسلة بلاطات لا تفقد ولا تكرّر بكسلًا عند dpr=${dpr}`, () => {
      const s = space({ dpr })
      const edges = [0, 33.3, 66.7, 100, 133.9, 200]
      const tiles = edges
        .slice(0, -1)
        .map((e, i) => pageRectToDevice(pageRect(e, 0, edges[i + 1]! - e, 10), s))
      for (let i = 0; i < tiles.length - 1; i++) {
        expect(tiles[i]!.x + tiles[i]!.width).toBe(tiles[i + 1]!.x)
      }
      const total = tiles.reduce((n, t) => n + t.width, 0)
      expect(total).toBe(Math.round(200 * dpr))
    })
  }

  it('التقريب على الحوافّ لا على الأصل والمقاس', () => {
    const s = space({ dpr: 2 })
    // 10.3×2 = 20.6 → 21 ، الحافّة 10.3+5.4=15.7 ×2 = 31.4 → 31 ، فالعرض 10
    const r = viewportRectToDevice(viewportRect(10.3, 0, 5.4, 1), s)
    expect(r.x).toBe(21)
    expect(r.width).toBe(10)
  })
})

describe('عمليات داخل الفضاء', () => {
  it('intersect يعطي التقاطع', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(50, 50, 100, 100)
    expect(intersect(a, b)).toEqual(viewportRect(50, 50, 50, 50))
  })

  it('intersect يعطي null بلا تداخل', () => {
    expect(intersect(viewportRect(0, 0, 10, 10), viewportRect(50, 50, 10, 10))).toBeNull()
  })

  it('intersect يحفظ الفضاء', () => {
    const r = intersect(pageRect(0, 0, 10, 10), pageRect(5, 5, 10, 10))
    expect(r?.space).toBe('page')
  })

  it('normalizeRect يقبل السحب من أي ركن', () => {
    const a = viewportPoint(100, 100)
    const b = viewportPoint(20, 40)
    expect(normalizeRect(a, b)).toEqual(viewportRect(20, 40, 80, 60))
    expect(normalizeRect(b, a)).toEqual(viewportRect(20, 40, 80, 60))
  })

  it('contains يشمل الحافّة', () => {
    const r = viewportRect(0, 0, 10, 10)
    expect(contains(r, viewportPoint(10, 10))).toBe(true)
    expect(contains(r, viewportPoint(11, 5))).toBe(false)
  })

  it('fromDomRect يقع في فضاء النافذة', () => {
    const r = fromDomRect({ x: 5, y: 6, width: 7, height: 8 } as DOMRect)
    expect(r).toEqual(viewportRect(5, 6, 7, 8))
  })
})

describe('سلامة الفضاءات وقت الترجمة', () => {
  it('خلط فضاءين لا يُترجم', () => {
    // كل توجيه هنا **يجب** أن يُطفأ عليه خطأ؛ لو لم يقع الخطأ لأخفق
    // `tsc` برسالة «توجيه غير مستعمَل» — فالاختبار يفشل عند البناء لا هنا.
    // @ts-expect-error فضاءان مختلفان
    intersect(pageRect(0, 0, 1, 1), viewportRect(0, 0, 1, 1))
    // @ts-expect-error فضاءان مختلفان
    normalizeRect(pagePoint(0, 0), viewportPoint(1, 1))
    // @ts-expect-error فضاءان مختلفان
    contains(pageRect(0, 0, 1, 1), viewportPoint(0, 0))
    // @ts-expect-error نقطة صفحة لا نقطة نافذة
    viewportToPage(pagePoint(0, 0), space())
    expect(true).toBe(true)
  })

  it('الوسم موجود وقت التشغيل — يعبر حدّ الرسائل', () => {
    const r = pageRect(1, 2, 3, 4)
    expect(JSON.parse(JSON.stringify(r)).space).toBe('page')
  })
})

describe('readSpace — التصلّب ضدّ بيئة بلا تخطيط', () => {
  it('لا يعطي مقاسًا صفريًا حتى حين ترجع البيئة أصفارًا', () => {
    // happy-dom: clientWidth/Height صفر، و`compatMode` غير معرَّف.
    const s = readSpace(globalThis.window)
    expect(s.layoutWidth).toBeGreaterThan(0)
    expect(s.layoutHeight).toBeGreaterThan(0)
    expect(s.pageWidth).toBeGreaterThan(0)
    expect(s.pageHeight).toBeGreaterThan(0)
    expect(s.dpr).toBeGreaterThan(0)
  })

  it('التمرير غير المنتهي يعود صفرًا لا NaN', () => {
    const win = {
      document: globalThis.window.document,
      getComputedStyle: () => ({ direction: 'ltr', transform: 'none' }),
      scrollX: Number.NaN,
      scrollY: undefined,
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 0,
    } as unknown as Window
    const s = readSpace(win)
    expect(s.scrollX).toBe(0)
    expect(s.scrollY).toBe(0)
    // dpr صفر مستحيل — يعود إلى 1 لا يقسم على صفر لاحقًا.
    expect(s.dpr).toBe(1)
  })

  it('RTL يُقرأ من `body` أيضًا لا من الجذر وحده', () => {
    const mk = (rootDir: string, bodyDir: string) =>
      ({
        document: {
          documentElement: globalThis.window.document.documentElement,
          body: globalThis.window.document.body,
          compatMode: 'CSS1Compat',
        },
        getComputedStyle: (el: Element) => ({
          direction: el === globalThis.window.document.body ? bodyDir : rootDir,
          transform: 'none',
        }),
        scrollX: 0,
        scrollY: 0,
        innerWidth: 800,
        innerHeight: 600,
        devicePixelRatio: 1,
      }) as unknown as Window

    // الشكل الشائع في الصفحات العربية: الاتجاه على `body` لا على `html`.
    expect(readSpace(mk('ltr', 'rtl')).rtl).toBe(true)
    expect(readSpace(mk('rtl', 'ltr')).rtl).toBe(true)
    expect(readSpace(mk('ltr', 'ltr')).rtl).toBe(false)
  })
})

describe('watchDpr', () => {
  it('يشترك ويُلغي بلا تسريب', () => {
    const remove = vi.fn()
    const add = vi.fn()
    const matchMedia = vi.fn(() => ({ addEventListener: add, removeEventListener: remove }))
    const win = { devicePixelRatio: 2, matchMedia } as unknown as Window

    const stop = watchDpr(() => undefined, win)
    expect(matchMedia).toHaveBeenCalledWith('(resolution: 2dppx)')
    expect(add).toHaveBeenCalledTimes(1)
    stop()
    expect(remove).toHaveBeenCalled()
  })

  it('لا ينهار حين تغيب `matchMedia`', () => {
    const win = { devicePixelRatio: 1 } as unknown as Window
    expect(() => watchDpr(() => undefined, win)()).not.toThrow()
  })
})
