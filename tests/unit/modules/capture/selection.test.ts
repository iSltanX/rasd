import { describe, expect, it } from 'vitest'

import {
  ASPECT_PRESETS,
  centerOf,
  solveDrag,
  clampRatioRect,
  clampRect,
  describeRatio,
  drawRect,
  HANDLES,
  handlePoint,
  isCapturable,
  MIN_SELECTION,
  moveRect,
  resizeRect,
  type Handle,
} from '@/modules/capture/selection'
import { viewportPoint, viewportRect, type ViewportRect } from '@/shared/geometry'

/**
 * هندسة التحديد — النواة الرياضية لأداة «تصوير منطقة».
 *
 * تُختبَر هنا بلا متصفّح لأنها خالصة عمدًا. الأخطاء التي تمنعها هذه
 * الاختبارات (نسبة منقلبة في اتجاه سحب واحد، مستطيل ينزاح عن مرساته عند
 * السحب لأعلى) تظهر في المنتج كقصّ خاطئ بانحراف صغير يصعب ربطه بسببه.
 */

const P = viewportPoint
const R = viewportRect

/** مقارنة بتسامح عشري — النسب تُنتج كسورًا. */
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

function expectRect(actual: ViewportRect, x: number, y: number, w: number, h: number) {
  near(actual.x, x)
  near(actual.y, y)
  near(actual.width, w)
  near(actual.height, h)
  expect(actual.space).toBe('viewport')
}

// ─────────────────────────────────────────────────────────────────

describe('السحب الحرّ', () => {
  const anchor = P(100, 100)

  it.each([
    ['يمين-أسفل', P(300, 250), 100, 100, 200, 150],
    ['يسار-أسفل', P(40, 250), 40, 100, 60, 150],
    ['يمين-أعلى', P(300, 30), 100, 30, 200, 70],
    ['يسار-أعلى', P(40, 30), 40, 30, 60, 70],
  ] as const)('%s', (_name, pointer, x, y, w, h) => {
    expectRect(drawRect(anchor, pointer), x, y, w, h)
  })

  it('نقرة بلا سحب تعطي مستطيلًا صفريًا', () => {
    expectRect(drawRect(anchor, anchor), 100, 100, 0, 0)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('تثبيت النسبة — الاتجاهات الأربعة', () => {
  const anchor = P(500, 400)
  const ratio = 16 / 9

  /**
   * المعيار الذي تفرضه المرحلة: النسبة صحيحة في كل اتجاه سحب، **والمرساة
   * تبقى ركنًا للمستطيل**. الثاني هو ما ينكسر عمليًا: حساب المقاس صحيحًا ثم
   * اشتقاق الأصل خطأً يعطي مستطيلًا بنسبة سليمة ينزلق بعيدًا عن نقطة البداية.
   */
  it.each([
    ['يمين-أسفل', P(820, 600)],
    ['يسار-أسفل', P(180, 600)],
    ['يمين-أعلى', P(820, 200)],
    ['يسار-أعلى', P(180, 200)],
  ] as const)('%s — النسبة محفوظة والمرساة ركن', (_name, pointer) => {
    const r = drawRect(anchor, pointer, { ratio })

    near(r.width / r.height, ratio)

    const isCorner =
      (r.x === anchor.x || Math.abs(r.x + r.width - anchor.x) < 1e-9) &&
      (r.y === anchor.y || Math.abs(r.y + r.height - anchor.y) < 1e-9)
    expect(isCorner, 'المرساة يجب أن تبقى أحد أركان المستطيل').toBe(true)
  })

  it('يمتدّ في اتجاه السحب لا عكسه', () => {
    // سحب لأعلى-اليسار: المستطيل كلّه يجب أن يقع أعلى المرساة ويسارها.
    const r = drawRect(anchor, P(180, 200), { ratio })
    expect(r.x + r.width).toBeCloseTo(anchor.x, 9)
    expect(r.y + r.height).toBeCloseTo(anchor.y, 9)
  })

  it('البُعد المهيمن هو الذي يقود', () => {
    // سحب عريض جدًّا: العرض يقود، والارتفاع يُشتقّ منه.
    const wide = drawRect(anchor, P(1300, 410), { ratio })
    near(wide.width, 800)
    near(wide.height, 800 / ratio)

    // سحب طويل جدًّا: الارتفاع يقود.
    const tall = drawRect(anchor, P(510, 900), { ratio })
    near(tall.height, 500)
    near(tall.width, 500 * ratio)
  })

  it('سحب أفقي خالص لا يقسم على صفر', () => {
    const r = drawRect(anchor, P(820, 400), { ratio })
    expect(Number.isFinite(r.width)).toBe(true)
    expect(Number.isFinite(r.height)).toBe(true)
    near(r.width, 320)
    near(r.height, 320 / ratio)
  })

  const LOCKED: readonly { label: string; ratio: number }[] = ASPECT_PRESETS.flatMap((p) =>
    p.ratio === null ? [] : [{ label: p.label, ratio: p.ratio }],
  )

  it.each(LOCKED)('نسبة $label', ({ ratio: r0 }) => {
    const r = drawRect(anchor, P(900, 700), { ratio: r0 })
    near(r.width / r.height, r0)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('السحب من المركز', () => {
  const anchor = P(400, 300)

  it('المرساة تبقى المركز في كل اتجاه', () => {
    for (const pointer of [P(500, 380), P(300, 380), P(500, 220), P(300, 220)]) {
      const r = drawRect(anchor, pointer, { fromCenter: true })
      const c = centerOf(r)
      near(c.x, anchor.x)
      near(c.y, anchor.y)
      near(r.width, 200)
      near(r.height, 160)
    }
  })

  it('مع النسبة معًا — مركز محفوظ ونسبة محفوظة', () => {
    const ratio = 1
    const r = drawRect(anchor, P(500, 340), { fromCenter: true, ratio })
    const c = centerOf(r)
    near(c.x, anchor.x)
    near(c.y, anchor.y)
    near(r.width / r.height, ratio)
    // البُعد المهيمن (100 أفقيًا مقابل 40 رأسيًا) يقود نصف المقاس.
    near(r.width, 200)
    near(r.height, 200)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('مقابض تغيير الحجم', () => {
  const base = R(100, 100, 400, 200)

  it('ثمانية مقابض', () => {
    expect(HANDLES).toHaveLength(8)
  })

  it('كل مقبض يقع على المستطيل في موضعه المتوقَّع', () => {
    const expected: Record<Handle, [number, number]> = {
      nw: [100, 100],
      n: [300, 100],
      ne: [500, 100],
      e: [500, 200],
      se: [500, 300],
      s: [300, 300],
      sw: [100, 300],
      w: [100, 200],
    }
    for (const h of HANDLES) {
      const p = handlePoint(base, h)
      expect([p.x, p.y], h).toEqual(expected[h])
    }
  })

  it('المقبض يحرّك حافّته ويترك المقابلة ثابتة', () => {
    // `se` يحرّك x2 و y2 — الأصل ثابت.
    expectRect(resizeRect(base, 'se', P(700, 500)), 100, 100, 600, 400)
    // `nw` يحرّك x1 و y1 — الحافّة المقابلة (500, 300) ثابتة.
    expectRect(resizeRect(base, 'nw', P(50, 50)), 50, 50, 450, 250)
    // `n` رأسي فقط — العرض لا يتغيّر.
    expectRect(resizeRect(base, 'n', P(999, 40)), 100, 40, 400, 260)
    // `w` أفقي فقط — الارتفاع لا يتغيّر.
    expectRect(resizeRect(base, 'w', P(0, 999)), 0, 100, 500, 200)
  })

  it('السحب عبر الحافّة المقابلة يقلب المستطيل ولا يُصفّره', () => {
    // `se` مسحوب إلى يسار وأعلى الأصل: ينقلب حول (100,100).
    expectRect(resizeRect(base, 'se', P(40, 60)), 40, 60, 60, 40)
    expect(resizeRect(base, 'se', P(40, 60)).width).toBeGreaterThan(0)
  })

  it('مقبض زاوية مع نسبة يرسو على الزاوية المقابلة', () => {
    const ratio = 1
    const r = resizeRect(base, 'se', P(800, 600), { ratio })
    near(r.width / r.height, ratio)
    // المرساة هي `nw` الأصلية (100,100) وتبقى ركنًا.
    near(r.x, 100)
    near(r.y, 100)
  })

  it('مقبض حافّة مع نسبة ينمو متمركزًا على المحور الآخر', () => {
    const ratio = 2
    // `e` يقود العرض؛ الارتفاع يُشتقّ ويتمركز على مركز المستطيل الرأسي (200).
    const r = resizeRect(base, 'e', P(500, 0), { ratio })
    near(r.width, 400)
    near(r.height, 200)
    near(centerOf(r).y, 200)
    near(r.x, 100)
  })

  it('مقبض رأسي مع نسبة يتمركز أفقيًا', () => {
    const ratio = 2
    const r = resizeRect(base, 's', P(0, 400), { ratio })
    near(r.height, 300)
    near(r.width, 600)
    near(centerOf(r).x, 300)
  })

  /**
   * المرساة هي الحافّة المقابلة للمقبض، والمستطيل يمتدّ من المرساة **نحو المؤشِّر**.
   * سحب `w` إلى يسار المرساة (الوضع العاديّ لمقبض غربي) يجب أن يبقي الحافّة
   * الشرقية حيث هي، لا أن يزحزحها.
   */
  it('مقبض غربي مع نسبة يمتدّ يسارًا من الحافّة الشرقية الثابتة', () => {
    const ratio = 2
    // المرساة (500,200): العرض |300-500| = 200، الارتفاع 100 متمركز على 200.
    const r = resizeRect(base, 'w', P(300, 0), { ratio })
    expectRect(r, 300, 150, 200, 100)
    near(r.x + r.width, 500) // الحافّة الشرقية لم تتحرّك
  })

  it('مقبض شرقي مع نسبة يقلب المستطيل حين يعبر المؤشِّر الحافّة الغربية', () => {
    const ratio = 2
    // المرساة (100,200): المؤشِّر على x=40 أي يسار المرساة ⇒ العرض 60 والأصل 40.
    const r = resizeRect(base, 'e', P(40, 0), { ratio })
    expectRect(r, 40, 185, 60, 30)
    near(r.x + r.width, 100)
  })

  it('مقبض شمالي مع نسبة يمتدّ إلى أعلى من الحافّة الجنوبية الثابتة', () => {
    const ratio = 2
    // المرساة (300,300): الارتفاع |100-300| = 200، العرض 400 متمركز على 300.
    const r = resizeRect(base, 'n', P(0, 100), { ratio })
    expectRect(r, 100, 100, 400, 200)
    near(r.y + r.height, 300) // الحافّة الجنوبية لم تتحرّك
  })

  it('مقبض جنوبي مع نسبة يقلب المستطيل حين يعبر المؤشِّر الحافّة الشمالية', () => {
    const ratio = 2
    // المرساة (300,100): المؤشِّر على y=40 أي فوق المرساة ⇒ الارتفاع 60 والأصل 40.
    const r = resizeRect(base, 's', P(0, 40), { ratio })
    expectRect(r, 240, 40, 120, 60)
    near(r.y + r.height, 100)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('solveDrag — الحصر حول المرساة', () => {
  const bounds = R(0, 0, 1000, 800)

  /**
   * الخاصية الحاسمة: **المرساة لا تتحرّك أبدًا**.
   *
   * `clampRatioRect` تُصغِّر حول الزاوية العليا اليسرى. وفي السحب لأعلى أو
   * لليسار تلك الزاوية هي المؤشِّر لا المرساة — فينزلق المستطيل من تحت يد
   * المستخدم، ويرتدّ في الإطار التالي حين يُعاد الحلّ من المرساة الأصلية.
   * هذا الارتجاف هو ما تمنعه هذه الاختبارات.
   */
  const anchorStays = (anchor: ReturnType<typeof P>, r: ViewportRect) => {
    const onX = Math.abs(r.x - anchor.x) < 1e-9 || Math.abs(r.x + r.width - anchor.x) < 1e-9
    const onY = Math.abs(r.y - anchor.y) < 1e-9 || Math.abs(r.y + r.height - anchor.y) < 1e-9
    expect(onX && onY, `المرساة (${anchor.x},${anchor.y}) خرجت من أركان ${JSON.stringify(r)}`).toBe(
      true,
    )
  }

  it.each([
    ['يمين-أسفل', P(900, 700), P(5000, 5000)],
    ['يسار-أعلى', P(100, 100), P(-5000, -5000)],
    ['يمين-أعلى', P(900, 100), P(5000, -5000)],
    ['يسار-أسفل', P(100, 700), P(-5000, 5000)],
  ] as const)('%s — سحب يتجاوز الحافّة يُبقي المرساة ثابتة', (_n, anchor, far) => {
    const r = solveDrag(anchor, far, bounds)
    anchorStays(anchor, r)
    expect(r.x).toBeGreaterThanOrEqual(-1e-9)
    expect(r.y).toBeGreaterThanOrEqual(-1e-9)
    expect(r.x + r.width).toBeLessThanOrEqual(bounds.width + 1e-9)
    expect(r.y + r.height).toBeLessThanOrEqual(bounds.height + 1e-9)
  })

  it.each([
    ['يمين-أسفل', P(900, 700), P(5000, 5000)],
    ['يسار-أعلى', P(100, 100), P(-5000, -5000)],
    ['يمين-أعلى', P(900, 100), P(5000, -5000)],
    ['يسار-أسفل', P(100, 700), P(-5000, 5000)],
  ] as const)('%s — مع نسبة: المرساة ثابتة **والنسبة محفوظة**', (_n, anchor, far) => {
    const ratio = 16 / 9
    const r = solveDrag(anchor, far, bounds, { ratio })
    anchorStays(anchor, r)
    near(r.width / r.height, ratio, 1e-6)
    expect(r.x + r.width).toBeLessThanOrEqual(bounds.width + 1e-9)
    expect(r.y + r.height).toBeLessThanOrEqual(bounds.height + 1e-9)
  })

  it('ثابت عبر الإطارات — سحب أبعد لا يزحزح النتيجة', () => {
    const anchor = P(100, 100)
    const ratio = 1
    const a = solveDrag(anchor, P(-5000, -5000), bounds, { ratio })
    const b = solveDrag(anchor, P(-9999, -9999), bounds, { ratio })
    // لو تحرّكت المرساة لاختلف الناتجان — وهو بالضبط شكل الارتجاف.
    expectRect(b, a.x, a.y, a.width, a.height)
  })

  it('داخل الحدود لا يُغيّر شيئًا عن `drawRect`', () => {
    const anchor = P(400, 300)
    const pointer = P(600, 420)
    expectRect(solveDrag(anchor, pointer, bounds), 400, 300, 200, 120)
  })

  it('من المركز يبقى متمركزًا حتى عند الحافّة', () => {
    const anchor = P(50, 400)
    const r = solveDrag(anchor, P(-5000, 500), bounds, { fromCenter: true })
    near(centerOf(r).x, anchor.x)
    near(centerOf(r).y, anchor.y)
    expect(r.x).toBeGreaterThanOrEqual(-1e-9)
  })

  it('من المركز مع نسبة يحفظ الاثنين', () => {
    const anchor = P(500, 400)
    const ratio = 4 / 3
    const r = solveDrag(anchor, P(9999, 9999), bounds, { fromCenter: true, ratio })
    near(centerOf(r).x, anchor.x)
    near(centerOf(r).y, anchor.y)
    near(r.width / r.height, ratio, 1e-6)
    expect(r.width).toBeLessThanOrEqual(bounds.width + 1e-9)
    expect(r.height).toBeLessThanOrEqual(bounds.height + 1e-9)
  })

  it('مرساة على الحافّة تمامًا لا تُنتج مقاسًا سالبًا', () => {
    const r = solveDrag(P(0, 0), P(-100, -100), bounds, { ratio: 1 })
    expect(r.width).toBeGreaterThanOrEqual(0)
    expect(r.height).toBeGreaterThanOrEqual(0)
  })

  /**
   * من المركز بلا نسبة: التصغير يُطبَّق بمعامل **واحد** على المحورين، فيبقى
   * شكل ما رسمه المستخدم (400×740 هنا) لا أن يُقصّ محورٌ وحده.
   */
  it('من المركز بلا نسبة يصغّر المحورين بمعامل واحد حين يفيض أحدهما', () => {
    // المرساة قرب الحافّة العليا: أقصى ارتفاع متاح 60 (ضعف المسافة إلى الحافّة).
    const anchor = P(500, 30)
    const r = solveDrag(anchor, P(700, 400), bounds, { fromCenter: true })

    near(centerOf(r).x, anchor.x)
    near(centerOf(r).y, anchor.y)
    near(r.height, 60)
    // الشكل الأصلي 400:740 محفوظ بعد التصغير.
    near(r.width / r.height, 400 / 740, 1e-9)
    expect(r.y).toBeGreaterThanOrEqual(-1e-9)
  })

  it('من المركز بسحب رأسي خالص (عرض صفر) لا يقسم على صفر', () => {
    const r = solveDrag(P(500, 30), P(500, 400), bounds, { fromCenter: true })
    // العرض صفر أصلًا فيبقى صفرًا، والارتفاع يُحصر إلى 60 حول المرساة.
    expectRect(r, 500, 0, 0, 60)
  })

  it('من المركز بسحب أفقي خالص (ارتفاع صفر) لا يقسم على صفر', () => {
    const r = solveDrag(P(30, 400), P(500, 400), bounds, { fromCenter: true })
    expectRect(r, 0, 400, 60, 0)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('التحريك', () => {
  it('يزيح بلا تغيير المقاس', () => {
    expectRect(moveRect(R(10, 20, 100, 50), 5, -8), 15, 12, 100, 50)
  })

  it('خطوة لوحة المفاتيح — 1px و10px', () => {
    const r = R(100, 100, 50, 50)
    expectRect(moveRect(r, 1, 0), 101, 100, 50, 50)
    expectRect(moveRect(r, 0, -10), 100, 90, 50, 50)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('الحصر داخل النافذة', () => {
  const bounds = R(0, 0, 1280, 720)

  it('مستطيل داخلي لا يتغيّر', () => {
    const r = R(100, 100, 300, 200)
    expectRect(clampRect(r, bounds), 100, 100, 300, 200)
  })

  it('الخارج جزئيًا يُزاح لا يُقصّ', () => {
    expectRect(clampRect(R(1200, 650, 300, 200), bounds), 980, 520, 300, 200)
    expectRect(clampRect(R(-50, -30, 300, 200), bounds), 0, 0, 300, 200)
  })

  it('الأكبر من الحدود يُقصّ إلى الحدود', () => {
    expectRect(clampRect(R(-100, -100, 2000, 1000), bounds), 0, 0, 1280, 720)
  })

  it('الحصر مع النسبة يحفظ النسبة', () => {
    const ratio = 16 / 9
    // أعرض من النافذة: يجب أن يصغر البُعدان معًا لا العرض وحده.
    const r = clampRatioRect(R(0, 0, 2000, 2000 / ratio), bounds, ratio)
    near(r.width / r.height, ratio)
    expect(r.width).toBeLessThanOrEqual(bounds.width + 1e-9)
    expect(r.height).toBeLessThanOrEqual(bounds.height + 1e-9)
  })

  it('الحصر مع النسبة يبقى داخل الحدود رأسيًا أيضًا', () => {
    const ratio = 1 / 4
    const r = clampRatioRect(R(0, 0, 400, 1600), bounds, ratio)
    near(r.width / r.height, ratio)
    expect(r.height).toBeLessThanOrEqual(bounds.height + 1e-9)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('أسئلة عن التحديد', () => {
  it(`لا يُلتقَط تحت ${MIN_SELECTION}px`, () => {
    expect(isCapturable(R(0, 0, MIN_SELECTION, MIN_SELECTION))).toBe(true)
    expect(isCapturable(R(0, 0, MIN_SELECTION - 1, MIN_SELECTION))).toBe(false)
    expect(isCapturable(R(0, 0, MIN_SELECTION, MIN_SELECTION - 1))).toBe(false)
    expect(isCapturable(R(0, 0, 0, 0)), 'نقرة بلا سحب').toBe(false)
  })

  it('يختصر إلى نسبة صحيحة كما يعرضها Figma', () => {
    expect(describeRatio(R(0, 0, 1600, 900))).toBe('16 : 9')
    expect(describeRatio(R(0, 0, 800, 600))).toBe('4 : 3')
    expect(describeRatio(R(0, 0, 500, 500))).toBe('1 : 1')
    // القيمة التي يعرضها إطار `capture / area-select` نفسه.
    expect(describeRatio(R(0, 0, 768, 336))).toBe('16 : 7')
    expect(describeRatio(R(0, 0, 1700, 1000))).toBe('17 : 10')
  })

  it('يسقط إلى العشري حين لا يختصر إلى حدَّين صغيرين', () => {
    // 1920:1079 نسبة صحيحة وعديمة النفع — الحدّ 40 يمنع ادّعاءها.
    expect(describeRatio(R(0, 0, 1920, 1079))).toBe('1.78 : 1')
    expect(describeRatio(R(0, 0, 997, 331))).toBe('3.01 : 1')
  })

  it('مستطيل صفري لا يقسم على صفر', () => {
    expect(describeRatio(R(0, 0, 0, 0))).toBe('—')
    expect(describeRatio(R(0, 0, 100, 0))).toBe('—')
  })

  /**
   * شريحة أدقّ من بكسل: العرض ليس صفرًا لكنه يُقرَّب إليه. الاختصار بالقاسم
   * يقسم على صفر لو بقي — فيُعرَض العشري بدلًا من نسبة مخترَعة.
   */
  it('شريحة دون نصف بكسل تُعرَض عشريًا لا كسرًا', () => {
    expect(describeRatio(R(0, 0, 0.3, 100))).toBe('0.00 : 1')
    expect(describeRatio(R(0, 0, 100, 0.4))).toBe('250.00 : 1')
  })
})
