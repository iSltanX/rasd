import { describe, expect, it } from 'vitest'

import {
  contains,
  deviceToPage,
  deviceToViewport,
  intersect,
  normalizeRect,
  pagePoint,
  pageRect,
  pageRectToDevice,
  pageRectToViewport,
  pageToDevice,
  pageToViewport,
  viewportFit,
  viewportPoint,
  viewportRect,
  viewportRectToDevice,
  viewportRectToPage,
  viewportToDevice,
  viewportToPage,
  type CoordSpace,
  type Rect,
  type Space,
} from '@/shared/geometry'

import { fc } from './fc'

/**
 * خصائص `shared/geometry` — ما يجب أن يصحّ لكل مدخل، لا لأمثلةٍ مختارة.
 *
 * **مجال الإحداثيات شبكة 1/64 بكسل**، وهي دقّة `LayoutUnit` في كروم: كل ما تُرجعه
 * `getBoundingClientRect()` مضاعفٌ لها. واختيارها ليس تسهيلًا: على هذه الشبكة يكون جمع الحافّة
 * وطرحها دقيقًا في الفاصلة العائمة، فخاصّية «لا خيط بين مستطيلين متلاصقين» تُختبَر على ما يقع
 * فعلًا لا على كسورٍ لا يُنتجها المتصفّح. والتحويل بين الفضاءات بمعامل عشوائي يُقاس بتسامح نسبي.
 */

const SPAN = 20_000

/** إحداثيٌّ على شبكة 1/64 في `[-SPAN, SPAN]`. */
const coord = fc.integer({ min: -SPAN * 64, max: SPAN * 64 }).map((n) => n / 64)
/** طولٌ غير سالب على الشبكة نفسها. */
const length = fc.integer({ min: 0, max: SPAN * 64 }).map((n) => n / 64)
/** طولٌ موجب — مستطيلٌ له مساحة. */
const positive = fc.integer({ min: 1, max: SPAN * 64 }).map((n) => n / 64)

/**
 * كثافات بكسل حقيقية ثمّ أي كثافة: القيم الشائعة (ومنها `1.1` تكبير 110% التي لا تُمثَّل
 * ثنائيًّا) أوّلًا، ثمّ مدًى متّصل يلتقط ما لم يُتوقَّع.
 */
const dpr = fc.oneof(
  fc.constantFrom(1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.625, 3, 3.5, 4),
  fc.double({ min: 0.25, max: 5, noNaN: true, noDefaultInfinity: true }),
)

const space = fc
  .record({
    scrollX: coord,
    scrollY: coord,
    dpr,
  })
  .map(({ scrollX, scrollY, dpr: d }): CoordSpace => ({
    scrollX,
    scrollY,
    layoutWidth: 1280,
    layoutHeight: 800,
    pageWidth: 1280,
    pageHeight: 4000,
    dpr: d,
    rtl: false,
    rootScaleX: 1,
    rootScaleY: 1,
    rootDistorted: false,
  }))

const rectOf = <S extends Space>(build: (x: number, y: number, w: number, h: number) => Rect<S>) =>
  fc.tuple(coord, coord, length, length).map(([x, y, w, h]) => build(x, y, w, h))

/** تسامحٌ نسبي لما يمرّ بضربٍ وقسمة على معامل غير دقيق. */
const close = (actual: number, expected: number) =>
  Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected))

describe('التحويل بين الفضاءات — ذهابًا وإيابًا', () => {
  it('نافذة ← صفحة ← نافذة هوية بالضبط، والوسم يتبع الفضاء', () => {
    fc.assert(
      fc.property(coord, coord, space, (x, y, s) => {
        const page = viewportToPage(viewportPoint(x, y), s)
        const back = pageToViewport(page, s)
        expect(page.space).toBe('page')
        expect(back).toEqual(viewportPoint(x, y))
      }),
    )
  })

  it('نافذة ← جهاز ← نافذة، وصفحة ← جهاز ← صفحة: هوية ضمن دقّة الفاصلة', () => {
    fc.assert(
      fc.property(coord, coord, space, (x, y, s) => {
        const v = deviceToViewport(viewportToDevice(viewportPoint(x, y), s), s)
        const p = deviceToPage(pageToDevice(pagePoint(x, y), s), s)
        expect(v.space).toBe('viewport')
        expect(p.space).toBe('page')
        expect(close(v.x, x) && close(v.y, y)).toBe(true)
        expect(close(p.x, x) && close(p.y, y)).toBe(true)
      }),
    )
  })

  it('مستطيل نافذة ← صفحة ← نافذة هوية، والمقاس لا يتغيّر بالتمرير', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), space, (r, s) => {
        const page = viewportRectToPage(r, s)
        expect(page.width).toBe(r.width)
        expect(page.height).toBe(r.height)
        expect(pageRectToViewport(page, s)).toEqual(r)
      }),
    )
  })
})

describe('مستطيل ← جهاز — تقريب الحوافّ', () => {
  it('الناتج أعداد صحيحة غير سالبة، وكل حافّة على نصف بكسل من موضعها الدقيق', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), space, (r, s) => {
        const d = viewportRectToDevice(r, s)
        expect(d.space).toBe('device')
        for (const v of [d.x, d.y, d.width, d.height]) expect(Number.isInteger(v)).toBe(true)
        expect(d.width).toBeGreaterThanOrEqual(0)
        expect(d.height).toBeGreaterThanOrEqual(0)
        expect(Math.abs(d.x - r.x * s.dpr)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.x + d.width - (r.x + r.width) * s.dpr)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.y - r.y * s.dpr)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(d.y + d.height - (r.y + r.height) * s.dpr)).toBeLessThanOrEqual(0.5)
      }),
    )
  })

  /*
   * الثابت الذي كُتبت الدالّة من أجله: مستطيلان متلاصقان يتشاركان حافّةً واحدة بعد التقريب،
   * فلا خيط شفّاف بينهما عند التجميع ولا تداخل. تقريب الأصل والعرض كلٍّ على حدة يُسقط هذا.
   */
  it('قصّ مستطيل في أي موضع يعطي قطعتين بلا خيط ولا تداخل، أفقيًّا ورأسيًّا', () => {
    /*
     * موضع القصّ بوحدات الشبكة لا كسرًا عشريًّا: كسرٌ من `fc.double` صغّره `fast-check` مليون
     * مرّة في دقيقتين قبل أن يطبع مثاله. والمقارنة بـ`===` لا `toBe`: `Math.round(-1/64)` يعطي
     * `-0`، و`toBe` يفرّقه عن `+0` بـ`Object.is` — فرقٌ لا وجود له في بكسل.
     */
    const units = fc.integer({ min: 0, max: SPAN * 64 })
    fc.assert(
      fc.property(coord, coord, units, units, units, units, space, (x, y, w, h, kx, ky, s) => {
        const width = w / 64
        const height = h / 64
        const whole = viewportRectToDevice(viewportRect(x, y, width, height), s)

        const cx = x + (kx % (w + 1)) / 64
        const left = viewportRectToDevice(viewportRect(x, y, cx - x, height), s)
        const right = viewportRectToDevice(viewportRect(cx, y, x + width - cx, height), s)
        expect(left.x + left.width === right.x).toBe(true)
        expect(left.width + right.width === whole.width).toBe(true)

        const cy = y + (ky % (h + 1)) / 64
        const top = viewportRectToDevice(viewportRect(x, y, width, cy - y), s)
        const bottom = viewportRectToDevice(viewportRect(x, cy, width, y + height - cy), s)
        expect(top.y + top.height === bottom.y).toBe(true)
        expect(top.height + bottom.height === whole.height).toBe(true)
      }),
    )
  })

  it('مستطيل الصفحة يُقرَّب بالقاعدة نفسها — لا فرق بين الفضاءين عند الأرقام نفسها', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), space, (r, s) => {
        const asPage = pageRectToDevice(pageRect(r.x, r.y, r.width, r.height), s)
        expect(asPage).toEqual(viewportRectToDevice(r, s))
      }),
    )
  })
})

describe('intersect', () => {
  it('تبادلية، وناتجها داخل المستطيلين معًا، وفضاؤها فضاء المدخل', () => {
    fc.assert(
      fc.property(rectOf(pageRect), rectOf(pageRect), (a, b) => {
        const ab = intersect(a, b)
        expect(ab).toEqual(intersect(b, a))
        if (!ab) return
        expect(ab.space).toBe('page')
        expect(ab.width).toBeGreaterThan(0)
        expect(ab.height).toBeGreaterThan(0)
        for (const r of [a, b]) {
          expect(ab.x).toBeGreaterThanOrEqual(r.x)
          expect(ab.y).toBeGreaterThanOrEqual(r.y)
          expect(ab.x + ab.width).toBeLessThanOrEqual(r.x + r.width)
          expect(ab.y + ab.height).toBeLessThanOrEqual(r.y + r.height)
        }
      }),
    )
  })

  it('`null` إن وفقط إن لم يتشاركا مساحةً موجبة', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), rectOf(viewportRect), (a, b) => {
        const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(intersect(a, b) === null).toBe(overlapW <= 0 || overlapH <= 0)
      }),
    )
  })

  it('تقاطع مستطيلٍ ذي مساحة مع نفسه هو نفسه، والتقاطع تجميعي', () => {
    fc.assert(
      fc.property(
        fc.tuple(coord, coord, positive, positive),
        rectOf(viewportRect),
        rectOf(viewportRect),
        ([x, y, w, h], b, c) => {
          const a = viewportRect(x, y, w, h)
          expect(intersect(a, a)).toEqual(a)

          const left = intersect(a, b)
          const right = intersect(b, c)
          const lhs = left ? intersect(left, c) : null
          const rhs = right ? intersect(a, right) : null
          expect(lhs).toEqual(rhs)
        },
      ),
    )
  })
})

describe('normalizeRect و contains', () => {
  it('المستطيل من نقطتين لا يعتمد على ترتيبهما، وأبعاده غير سالبة، ويحوي النقطتين', () => {
    fc.assert(
      fc.property(coord, coord, coord, coord, (ax, ay, bx, by) => {
        const a = viewportPoint(ax, ay)
        const b = viewportPoint(bx, by)
        const r = normalizeRect(a, b)
        expect(normalizeRect(b, a)).toEqual(r)
        expect(r.width).toBeGreaterThanOrEqual(0)
        expect(r.height).toBeGreaterThanOrEqual(0)
        expect(contains(r, a)).toBe(true)
        expect(contains(r, b)).toBe(true)
      }),
    )
  })

  it('نقطة خارج أي حافّة ليست داخله', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), positive, fc.integer({ min: 0, max: 3 }), (r, d, side) => {
        const outside = [
          viewportPoint(r.x - d, r.y),
          viewportPoint(r.x + r.width + d, r.y),
          viewportPoint(r.x, r.y - d),
          viewportPoint(r.x, r.y + r.height + d),
        ][side]!
        expect(contains(r, outside)).toBe(false)
      }),
    )
  })
})

describe('viewportFit — ثلاث حالات لا تتداخل', () => {
  const view = fc.tuple(positive, positive)

  it('«أكبر من النافذة» إن وفقط إن زاد ضلعٌ عن ضلعها', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), view, (r, [vw, vh]) => {
        expect(viewportFit(r, vw, vh) === 'oversized').toBe(r.width > vw || r.height > vh)
      }),
    )
  })

  it('«داخلها» يعني أن حوافّه الأربع داخل النافذة', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), view, (r, [vw, vh]) => {
        if (viewportFit(r, vw, vh) !== 'contained') return
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(vw)
        expect(r.y + r.height).toBeLessThanOrEqual(vh)
      }),
    )
  })

  it('ما يسع النافذة يصير «داخلها» بتمريرٍ واحد إلى أصلها — «خارجها» يحلّه التمرير دائمًا', () => {
    fc.assert(
      fc.property(rectOf(viewportRect), view, (r, [vw, vh]) => {
        if (viewportFit(r, vw, vh) === 'oversized') return
        expect(viewportFit(viewportRect(0, 0, r.width, r.height), vw, vh)).toBe('contained')
      }),
    )
  })
})
