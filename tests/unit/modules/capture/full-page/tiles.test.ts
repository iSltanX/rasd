/**
 * رياضيات البلاطات — بالأرقام المقيسة في Chrome لا بأرقام مخترَعة.
 *
 * كل حالة كسرية هنا مأخوذة من قياس فعلي: مستويات التكبير السبعة، وشوط 29
 * بلاطة، وحدّ التمرير الذي خالف الحساب. الاختبار الذي يخترع أرقامه يثبت
 * اتّساق الشيفرة مع نفسها لا صحّتها.
 */
import { describe, expect, it } from 'vitest'

import {
  CANVAS_BUDGET_BYTES,
  maxTiles,
  planStitch,
  truncationOf,
} from '@/modules/capture/full-page/limits'
import {
  gutterOf,
  pinchBlocked,
  planSteps,
  scaleOf,
  stitchHeight,
  tileTop,
} from '@/modules/capture/full-page/tiles'
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '@/shared/canvas-limits'

describe('scaleOf — المقياس من الصورة لا من devicePixelRatio', () => {
  it('يطابق كثافة البكسل في مستويات التكبير المقيسة', () => {
    // لقطة 2560 عرضًا بقيت ثابتة في مستويات التكبير السبعة المقيسة.
    expect(scaleOf({ width: 2560 }, 1280)).toBe(2)
    expect(scaleOf({ width: 2560 }, 1024)).toBe(2.5)
    expect(scaleOf({ width: 2560 }, 2560)).toBe(1)
  })

  it('يستعمل innerWidth لا عرض نافذة العرض المرئية', () => {
    /*
     * `visualViewport.width` ينكمش مع شريط التمرير الأفقي: قيس 693 ← 678
     * بينما بقيت اللقطة 1386. القسمة عليه تعطي 2.0442 بدل 2 — انحراف 2.2%
     * يساوي ≈870 بكسل بعد 29 بلاطة.
     */
    const wrong = 1386 / 678
    const right = scaleOf({ width: 1386 }, 693)
    expect(right).toBe(2)
    expect(wrong).toBeGreaterThan(2.04)
  })

  it('لا يقسم على صفر', () => {
    expect(scaleOf({ width: 100 }, 0)).toBe(1)
  })
})

describe('tileTop — التقريب يقع على الحاصل لا على المدخلات', () => {
  it.each([
    // [scrollY المقروء, المقياس, المتوقَّع]
    [0, 2, 0],
    [100.5, 2, 201],
    [1000.5, 2, 2001],
    [12345.5, 2, 24691],
    [1000.4000244140625, 2.5, 2501], // قيس: 2501/2.5
    [1000.6666870117188, 3, 3002], // قيس: 3002/3
    [1000.5714111328125, 3.5, 3502], // قيس: 3502/3.5
    [1000.625, 1.6, 1601], // قيس: 1601/1.6
  ])('scrollY=%s × %s ⇒ %s', (y, scale, want) => {
    expect(tileTop(y, scale)).toBe(want)
  })
})

describe('stitchHeight — من آخر موضع محقَّق لا من scrollHeight', () => {
  it('يطابق الحالة المقيسة عند التكبير 1.25', () => {
    /*
     * قيس: `scrollHeight=5963` و`clientHeight=554`، فالحدّ **المحسوب** 5409؛
     * لكنّ Chrome مرّر فعلًا إلى 5409.200195 — وهو `scrollHeightExact − vvH`
     * بالضبط. الحساب من الرقم المقروء يعطي الارتفاع الصحيح.
     */
    expect(stitchHeight(5409.200195, 2.5, 1386)).toBe(14909)
  })

  it('الفرق بين المقروء والمحسوب يظهر حين يقع الكسر على جانبَي نصف البكسل', () => {
    /*
     * **درس من فشل هذا الاختبار نفسه**: صيغته الأولى ادّعت أن المقروء
     * يتجاوز المحسوب *دائمًا*، فسقطت — لأن 5409 و5409.200195 يقرّبان إلى
     * العدد نفسه عند مقياس 2.5 (13522.5 ← 13523 و13523.0005 ← 13523).
     * الادّعاء الصحيح أضيق: الفرق يقع حين **يعبر** الكسرُ نصفَ البكسل، لا
     * في كل حالة. وهو كافٍ ليكون الحساب من المقروء إلزاميًّا، لأن العبور
     * غير معلوم سلفًا.
     */
    expect(stitchHeight(5409.6, 2.5, 1386)).toBe(14910)
    expect(stitchHeight(5409, 2.5, 1386)).toBe(14909)
  })

  it('صفحة أقصر من نافذة واحدة: الارتفاع هو البلاطة وحدها', () => {
    expect(stitchHeight(0, 2, 1386)).toBe(1386)
  })

  it('التراكب يقع تلقائيًّا: قاع الأخيرة = قاع الصورة', () => {
    // 29 بلاطة، صفحة 19,737px، نافذة 693px، dpr 2.
    const step = 693
    const maxScroll = 19737 - 693
    const steps = planSteps(maxScroll, step)
    const last = steps[steps.length - 1]!
    expect(last).toBe(maxScroll)
    // البلاطة قبل الأخيرة كانت ستمتدّ أبعد من القاع لولا التثبيت.
    const prev = steps[steps.length - 2]!
    const overlapDevicePx = tileTop(prev, 2) + 1386 - tileTop(last, 2)
    expect(overlapDevicePx).toBeGreaterThan(0)
  })
})

describe('gutterOf — شريط التمرير داخل اللقطة', () => {
  it('يقصّ 30 بكسل جهاز في الحالة المقيسة', () => {
    // قيس: innerWidth×dpr = 2560 بينما clientWidth×dpr = 2530.
    expect(gutterOf(1280, 1265, 2)).toBe(30)
  })

  it('صفر حين لا شريط', () => {
    expect(gutterOf(1280, 1280, 2)).toBe(0)
  })

  it('لا يُرجع سالبًا حين يتجاوز clientWidth (شريط متراكب)', () => {
    expect(gutterOf(1280, 1290, 2)).toBe(0)
  })
})

describe('pinchBlocked — تكبير القرص يُرفَض لا يُعوَّض', () => {
  it('يمرّ عند 1 ويرفض عند 2', () => {
    expect(pinchBlocked(1)).toBe(false)
    expect(pinchBlocked(2)).toBe(true)
  })

  it('يتسامح مع انحراف عائم بعد إعادة التكبير', () => {
    expect(pinchBlocked(1.0000001)).toBe(false)
    expect(pinchBlocked(0.9999999)).toBe(false)
  })

  it('يمسك تكبيرًا طفيفًا مقصودًا', () => {
    expect(pinchBlocked(1.01)).toBe(true)
  })
})

describe('planSteps', () => {
  it('يثبّت الخطوة الأخيرة عند الحدّ بالضبط', () => {
    const steps = planSteps(1000, 300)
    expect(steps).toEqual([0, 300, 600, 900, 1000])
  })

  it('يقسم بالتساوي بلا خطوة زائدة', () => {
    expect(planSteps(900, 300)).toEqual([0, 300, 600, 900])
  })

  it('صفحة لا تمرّر: خطوة واحدة عند الصفر', () => {
    expect(planSteps(0, 713)).toEqual([0])
  })

  it('خطوة غير صالحة لا تُنتج حلقة لا تنتهي', () => {
    expect(planSteps(1000, 0)).toEqual([0])
  })
})

describe('planStitch — الذاكرة هي المُلزِم لا الأبعاد', () => {
  it('الذاكرة تحكم عند العرض النمطي', () => {
    const plan = planStitch(2560)
    expect(plan.bound).toBe('memory')
    // قيس: فرع الضلع 65,535 وفرع المساحة 104,857 وفرع الذاكرة 28,672.
    expect(plan.maxHeight).toBe(Math.floor(CANVAS_BUDGET_BYTES / (2560 * 4)))
    expect(plan.maxHeight).toBeLessThan(Math.floor(MAX_CANVAS_AREA / 2560))
  })

  it('الضلع يحكم على صفحة ضيّقة جدًّا بميزانية سخيّة', () => {
    const plan = planStitch(4, 100 * 1024 * 1024 * 1024)
    expect(plan.bound).toBe('side')
    expect(plan.maxHeight).toBe(MAX_CANVAS_SIDE)
  })

  it('المساحة تحكم بين الاثنين', () => {
    const plan = planStitch(8192, 100 * 1024 * 1024 * 1024)
    expect(plan.bound).toBe('area')
    expect(plan.maxHeight).toBe(Math.floor(MAX_CANVAS_AREA / 8192))
  })

  it('لا يتجاوز الضلع أبدًا مهما اتّسعت الميزانية', () => {
    expect(planStitch(1, Number.MAX_SAFE_INTEGER).maxHeight).toBe(MAX_CANVAS_SIDE)
  })

  it('عرض صفر لا يقسم على صفر', () => {
    expect(planStitch(0).maxHeight).toBe(0)
  })
})

describe('truncationOf', () => {
  it('null حين تسع الصفحة', () => {
    expect(truncationOf(2560, 10_000)).toBeNull()
  })

  it('يبلّغ الفرع المُلزِم لا الرقم وحده', () => {
    const t = truncationOf(2560, 60_000)
    expect(t).not.toBeNull()
    expect(t?.bound).toBe('memory')
    expect(t?.requestedHeight).toBe(60_000)
    expect(t?.allowedHeight).toBeLessThan(60_000)
  })

  it('هدف المرحلة نفسه يقع تحت الحدّ: 20 شاشة × dpr 2', () => {
    // 20 × 693 × 2 = 27,720 صفًّا عند عرض 2560.
    const t = truncationOf(2560, 27_720)
    expect(t).toBeNull()
  })
})

describe('maxTiles', () => {
  it('نصف العدد عند ضِعف كثافة البكسل', () => {
    const at1 = maxTiles(1280, 713)
    const at2 = maxTiles(2560, 1386)
    expect(at2).toBeLessThan(at1)
  })

  it('بلاطة واحدة على الأقلّ مهما ضاقت الميزانية', () => {
    expect(maxTiles(2560, 1386, 1)).toBe(1)
  })

  it('ارتفاع صفر لا يقسم على صفر', () => {
    expect(maxTiles(2560, 0)).toBe(0)
  })
})
