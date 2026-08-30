import { describe, expect, it } from 'vitest'

import {
  gapSegment,
  readGap,
  readMeasure,
  readSize,
  snapThresholdFor,
} from '@/modules/editor/measure-overlay'
import { asNodeId, imageToCss, type MeasureNode } from '@/modules/editor/scene'
import { SNAP_THRESHOLD_PX } from '@/modules/measure/snap'
import { deviceRect } from '@/shared/geometry'

/**
 * القياس — **ومعيار القبول كلّه رقمٌ واحد على لقطة كثافتها 2**.
 *
 * فجوةٌ صُمِّمت 16 بكسل CSS تُقاس 32 بكسل صورة. وعرضُ «32» صحيحٌ حسابيًّا
 * وخطأٌ تمامًا: المستخدم يقارن ما يراه بورقة التصميم، وتلك تقول 16.
 */

const node = (over: Partial<MeasureNode> = {}): MeasureNode => ({
  kind: 'measure',
  id: asNodeId('m'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: { colorToken: 'tool/measure/solid', widthPx: 2, dash: [], opacity: 1 },
  a: deviceRect(0, 0, 100, 50),
  b: null,
  show: 'size',
  ...over,
})

describe('**كثافة البكسل — معيار القبول**', () => {
  it('فجوة 32 بكسل صورة على لقطة كثافتها 2 تُعرَض `16px`', () => {
    const a = deviceRect(0, 0, 100, 100)
    const b = deviceRect(132, 0, 100, 100)
    expect(readGap(a, b, 2).label).toBe('16px')
    // والقيمة الخام تبقى بفضاء الصورة — الخطوط تُرسم بها.
    expect(readGap(a, b, 2).pixels).toBe(32)
  })

  it('والفجوة نفسها على لقطة كثافتها 1 تُعرَض `32px`', () => {
    const a = deviceRect(0, 0, 100, 100)
    const b = deviceRect(132, 0, 100, 100)
    expect(readGap(a, b, 1).label).toBe('32px')
  })

  it('**والمقاس كذلك** — 200×100 عند كثافة 2 يُعرَض 100×50', () => {
    expect(readSize(deviceRect(0, 0, 200, 100), 2)).toEqual({ width: '100px', height: '50px' })
  })

  it('وكثافة غير صحيحة تُقرَّب ولا تُظهر دقّةً لا تملكها', () => {
    // 16 ÷ 1.5 = 10.6666… — تُعرَض 10.7 لا 10.666666666666666.
    expect(readSize(deviceRect(0, 0, 16, 16), 1.5).width).toBe('10.7px')
  })

  it('والأرقام غربية — قياسٌ يُنسَخ إلى محرّر لا عدٌّ بشري', () => {
    expect(readSize(deviceRect(0, 0, 100, 50), 1).width).toBe('100px')
    expect(readSize(deviceRect(0, 0, 100, 50), 1).width).not.toContain('١')
  })
})

describe('**عتبة الالتقاط — معيار القبول الثاني**', () => {
  it('**عند كثافة 2 وتكبير 1 تقع عند 4 بكسل CSS للصفحة لا 2**', () => {
    const threshold = snapThresholdFor(1, 2)
    // ثمانية بكسلات صورة ⇒ أربعة بوحدات الصفحة الملتقَطة.
    expect(threshold).toBe(8)
    expect(imageToCss(threshold, 2)).toBe(4)
    // والقسمة على التكبير وحدها كانت تعطي 4 صورة = 2 صفحة — نصف الوعد.
    expect(imageToCss(SNAP_THRESHOLD_PX / 1, 2)).toBe(2)
  })

  it('وعند كثافة 1 تبقى أربعة', () => {
    expect(snapThresholdFor(1, 1)).toBe(SNAP_THRESHOLD_PX)
  })

  it('**وتتّسع بالتصغير** — اليد لا تصير أدقّ حين يُصغّر المستخدم', () => {
    expect(snapThresholdFor(0.25, 1)).toBe(SNAP_THRESHOLD_PX * 4)
    // وعند الكثافة 2 تغلب عتبة الصفحة حتى تكبير النصف.
    expect(snapThresholdFor(1, 2)).toBe(8)
    expect(snapThresholdFor(0.25, 2)).toBe(16)
  })

  it('ولا تضيق بالتكبير دون عتبة الصفحة', () => {
    expect(snapThresholdFor(4, 2)).toBe(8)
    expect(snapThresholdFor(4, 1)).toBe(SNAP_THRESHOLD_PX)
  })

  it('ولا تقسم على صفر عند تكبير منعدم', () => {
    expect(Number.isFinite(snapThresholdFor(0, 1))).toBe(true)
  })
})

describe('قراءة الفجوة', () => {
  it('تختار الاتجاه الأقرب', () => {
    const a = deviceRect(0, 0, 100, 100)
    expect(readGap(a, deviceRect(0, 150, 100, 100), 1).direction).toBe('bottom')
    expect(readGap(a, deviceRect(150, 0, 100, 100), 1).direction).toBe('right')
  })

  it('**والتداخل يُعلَن ولا يُعرَض رقمًا سالبًا**', () => {
    const a = deviceRect(0, 0, 100, 100)
    const b = deviceRect(50, 50, 100, 100)
    const reading = readGap(a, b, 1)
    expect(reading.overlapping).toBe(true)
    expect(reading.label).toBe('متداخلان')
    expect(reading.label).not.toContain('-')
  })

  it('وحافّتان متلامستان تعطيان صفرًا لا تداخلًا', () => {
    const a = deviceRect(0, 0, 100, 100)
    const b = deviceRect(100, 0, 100, 100)
    expect(readGap(a, b, 1).label).toBe('0px')
    expect(readGap(a, b, 1).overlapping).toBe(false)
  })
})

describe('قراءة العقدة', () => {
  it('بلا مستطيل ثانٍ تُقرأ مقاسًا', () => {
    expect(readMeasure(node(), 1).label).toBe('100px × 50px')
  })

  it('و`show: gap` مع مستطيل ثانٍ تُقرأ فجوة', () => {
    const m = node({ b: deviceRect(140, 0, 50, 50), show: 'gap' })
    expect(readMeasure(m, 1).label).toBe('40px')
  })

  it('و`show: size` تغلب حتى مع وجود مستطيل ثانٍ', () => {
    const m = node({ b: deviceRect(140, 0, 50, 50), show: 'size' })
    expect(readMeasure(m, 1).label).toContain('×')
  })
})

describe('قطعة الفجوة', () => {
  it('**تُرسم على محور التداخل المشترك** لا على حافّة أحدهما', () => {
    const a = deviceRect(0, 0, 100, 100)
    const b = deviceRect(140, 20, 100, 60)
    const seg = gapSegment(a, b, 'right')
    // التداخل الرأسي [20,80] ⇒ المنتصف 50.
    expect(seg.y1).toBe(50)
    expect(seg.y2).toBe(50)
    expect(seg.x1).toBe(100)
    expect(seg.x2).toBe(140)
  })

  it('وبلا تداخل تقع على متوسّط الأربعة — لا على حافّة تُقرأ حدًّا', () => {
    const a = deviceRect(0, 0, 100, 20)
    const b = deviceRect(140, 200, 100, 20)
    const seg = gapSegment(a, b, 'right')
    expect(seg.y1).toBe(seg.y2)
    expect(seg.y1).toBeGreaterThan(20)
    expect(seg.y1).toBeLessThan(220)
  })

  it('والاتجاهات الأربعة تعطي قطعًا في محاورها', () => {
    const a = deviceRect(100, 100, 50, 50)
    expect(gapSegment(a, deviceRect(100, 0, 50, 50), 'top').x1).toBe(125)
    expect(gapSegment(a, deviceRect(100, 200, 50, 50), 'bottom').x1).toBe(125)
    expect(gapSegment(a, deviceRect(0, 100, 50, 50), 'left').y1).toBe(125)
    expect(gapSegment(a, deviceRect(200, 100, 50, 50), 'right').y1).toBe(125)
  })
})
