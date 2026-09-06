import { describe, expect, it } from 'vitest'

import {
  extraStripBoxes,
  imageBox,
  percentBox,
  percentBoxStyle,
  splitPercentInImage,
  stageSize,
} from '@/pages/compare/layout'
import { deviceRect } from '@/shared/geometry'

import type { ExtraStrip } from '@/modules/compare/diff'

const NONE: ExtraStrip = { cols: null, rows: null }

describe('stageSize', () => {
  it('يأخذ أكبر عرض وأكبر ارتفاع بين الصورتين', () => {
    expect(stageSize({ width: 1000, height: 500 }, { width: 800, height: 700 })).toEqual({
      width: 1000,
      height: 700,
    })
  })

  it('لا يقلّ عن 1×1 حتى مع مدخل صفري', () => {
    expect(stageSize({ width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({
      width: 1,
      height: 1,
    })
  })
})

describe('percentBox', () => {
  const stage = { width: 1000, height: 500 }

  it('يحوِّل مستطيلًا كامل المسرح إلى 0/0/100/100', () => {
    expect(percentBox({ x: 0, y: 0, width: 1000, height: 500 }, stage)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })
  })

  it('يحوِّل مستطيلًا فرعيًّا بنسبته الصحيحة', () => {
    expect(percentBox({ x: 100, y: 50, width: 200, height: 100 }, stage)).toEqual({
      left: 10,
      top: 10,
      width: 20,
      height: 20,
    })
  })

  it('فيزيائي لا يُقلَب: مستطيل قرب الحافّة اليمنى يبقى قرب اليمين رقميًّا بصرف النظر عن اتجاه الصفحة', () => {
    // x=150 من عرض 200 — 75% من اليسار الفعلي، لا 75% من «بداية القراءة»
    // (التي كانت ستعني اليمين في صفحة RTL فتقلب الموضع بالكامل).
    const box = percentBox({ x: 150, y: 0, width: 30, height: 20 }, { width: 200, height: 150 })
    expect(box.left).toBeCloseTo(75)
  })

  it('لا تشويه: نسبة عرض:ارتفاع الصورة الفرعية تبقى كما هي عبر مسرح غير مربّع', () => {
    // صورة 800×700 داخل مسرح 1000×700 — أعرض بمقدار مختلف عن الارتفاع.
    const box = percentBox({ x: 0, y: 0, width: 800, height: 700 }, { width: 1000, height: 700 })
    // العرض 80% من مسرح عرضه 1000، والارتفاع 100% من مسرح ارتفاعه 700 — نفس أصل الصورة 800×700.
    expect(box.width).toBeCloseTo(80)
    expect(box.height).toBeCloseTo(100)
  })

  it('صندوق صفري حين المسرح صفري الأبعاد', () => {
    expect(percentBox({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })
  })
})

describe('percentBoxStyle', () => {
  it('يحوِّل الأرقام إلى نصوص بوحدة ٪ — خصائص فيزيائية لا منطقية', () => {
    expect(percentBoxStyle({ left: 10, top: 20, width: 30, height: 40 })).toEqual({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
    })
  })
})

/**
 * §17: «تعليم المنطقة الزائدة صراحةً بدل رفض المقارنة» — الفجوة التي كانت
 * صامتة (البيانات موجودة في `DiffOutcome` منذ الدفعة السابقة، لا مستهلِك لها).
 */
describe('extraStripBoxes — تعليم المنطقة الزائدة (فجوة §17 المُصلَحة)', () => {
  const stage = { width: 200, height: 150 }

  it('لا صناديق حين تتساوى الأبعاد (extraInA وextraInB كلاهما null)', () => {
    expect(extraStripBoxes(NONE, NONE, stage)).toEqual([])
  })

  it('صندوق واحد من a-cols حين أ أعرض من ب فقط', () => {
    const extraInA: ExtraStrip = { cols: deviceRect(150, 0, 50, 150), rows: null }
    const boxes = extraStripBoxes(extraInA, NONE, stage)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toEqual({
      key: 'a-cols',
      box: { left: 75, top: 0, width: 25, height: 100 },
    })
  })

  it('حتى أربعة صناديق معًا — عمود وصفّ من كل صورة', () => {
    const extraInA: ExtraStrip = {
      cols: deviceRect(180, 0, 20, 150),
      rows: deviceRect(0, 140, 200, 10),
    }
    const extraInB: ExtraStrip = {
      cols: deviceRect(190, 0, 10, 150),
      rows: deviceRect(0, 145, 200, 5),
    }
    const boxes = extraStripBoxes(extraInA, extraInB, stage)
    expect(boxes.map((b) => b.key)).toEqual(['a-cols', 'a-rows', 'b-cols', 'b-rows'])
  })

  it('يتجاوز أي محور null دون صندوق فارغ', () => {
    const extraInB: ExtraStrip = { cols: null, rows: deviceRect(0, 100, 200, 50) }
    const boxes = extraStripBoxes(NONE, extraInB, stage)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]?.key).toBe('b-rows')
  })
})

describe('imageBox — الصورة تُموضَع بفضاء المسرح لا بفرشها على الحاوية', () => {
  it('الصورة التي تبلغ الحدّ الأقصى في المحورين تملأ المسرح كاملًا', () => {
    expect(imageBox({ width: 280, height: 220 }, { width: 280, height: 220 })).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })
  })

  it('الصورة الأصغر تشغل نسبتها الحقيقية — لا تُكبَّر لتملأ', () => {
    // الحالة المقيسة حيًّا: `object-fit: contain` كان يرسمها 1.400× أكبر.
    const box = imageBox({ width: 200, height: 150 }, { width: 280, height: 220 })
    expect(box.left).toBe(0)
    expect(box.top).toBe(0)
    expect(box.width).toBeCloseTo((200 / 280) * 100, 10)
    expect(box.height).toBeCloseTo((150 / 220) * 100, 10)
  })

  it('صندوق الصورة ومستطيلٌ داخلها يتّفقان في المقياس — لا فضاءان', () => {
    const stage = { width: 280, height: 220 }
    const image = { width: 200, height: 150 }
    const box = imageBox(image, stage)
    // مستطيل عند الحافة اليمنى-السفلى للصورة يجب أن ينتهي عند حافة صندوقها
    const edge = percentBox({ x: 190, y: 140, width: 10, height: 10 }, stage)
    expect(edge.left + edge.width).toBeCloseTo(box.left + box.width, 10)
    expect(edge.top + edge.height).toBeCloseTo(box.top + box.height, 10)
  })

  it('صورة أصغر في المحورين معًا — الحالة التي رصدتها المراجعة الخصمية', () => {
    const box = imageBox({ width: 100, height: 50 }, { width: 200, height: 200 })
    expect(box.width).toBe(50)
    expect(box.height).toBe(25)
  })
})

describe('splitPercentInImage — المقبض في فضاء المسرح، القصّ في فضاء الصورة', () => {
  it('صورةٌ بمقاس المسرح: النسبة نفسها بلا تحويل', () => {
    expect(splitPercentInImage(50, { width: 280, height: 220 }, { width: 280, height: 220 })).toBe(
      50,
    )
  })

  it('صورة أضيق: نفس بكسل المسرح نسبةٌ أكبر منها', () => {
    // 50٪ من مسرح 280 = بكسل 140، وهو 70٪ من صورة عرضها 200.
    expect(splitPercentInImage(50, { width: 200, height: 150 }, { width: 280, height: 220 })).toBe(
      70,
    )
  })

  it('تُقصّ إلى 100 حين يتجاوز المقبض حافة الصورة الأضيق', () => {
    // 90٪ من 280 = 252 > 200، فالصورة كلّها مقصوصة لا نسبة تتجاوز 100.
    expect(splitPercentInImage(90, { width: 200, height: 150 }, { width: 280, height: 220 })).toBe(
      100,
    )
  })

  it('صفر عند صورة بلا عرض — لا قسمة على صفر تتسرّب إلى CSS', () => {
    expect(splitPercentInImage(50, { width: 0, height: 0 }, { width: 280, height: 220 })).toBe(0)
  })
})
