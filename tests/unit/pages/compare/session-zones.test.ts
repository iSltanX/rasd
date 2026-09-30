import { describe, expect, it } from 'vitest'

import {
  MIN_ZONE_PX,
  addZone,
  dragToImageBounds,
  dragToImageRect,
  removeZone,
  zoneChipLabel,
  zoneDimensions,
} from '@/pages/compare/session-zones'
import { deviceRect } from '@/shared/geometry'

/*
 * أرقام ثنائية الأساس عمدًا (256، 128، 512) كي تكون القسمة والضرب دقيقَين بلا خطأ فاصلة عائمة
 * — فحدودٌ كـ`100.00000000000001` لا تُقرَّب خارجًا بصمت وتفسد توقّعًا صحيحًا.
 *
 * الصندوق: 256×128 عند (8، 16) على الشاشة. المسرح: 512×256 بكسل صورة — مقياس 2 في المحورين.
 */
const BOX = new DOMRect(8, 16, 256, 128)
const STAGE = { width: 512, height: 256 }

describe('dragToImageRect — التحويل من بكسل الشاشة إلى بكسل الصورة', () => {
  it('سحبة عادية تُقاس من حافّة الصندوق وتُضرب في مقياس الصورة', () => {
    // x: (24−8)/256×512 = 32 → (88−8)/256×512 = 160 · y: (32−16)/128×256 = 32 → (96−16)/128×256 = 160
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 88, y: 96 }, BOX, STAGE)).toEqual(
      deviceRect(32, 32, 128, 128),
    )
  })

  it('لا أثر لاتجاه السحب — الزوايا الأربع تعطي المستطيل نفسه', () => {
    const expected = deviceRect(32, 32, 128, 128)
    const topLeft = { x: 24, y: 32 }
    const bottomRight = { x: 88, y: 96 }
    const topRight = { x: 88, y: 32 }
    const bottomLeft = { x: 24, y: 96 }
    expect(dragToImageRect(bottomRight, topLeft, BOX, STAGE)).toEqual(expected)
    expect(dragToImageRect(topRight, bottomLeft, BOX, STAGE)).toEqual(expected)
    expect(dragToImageRect(bottomLeft, topRight, BOX, STAGE)).toEqual(expected)
  })

  it('لا أثر لاتجاه الصفحة: الصفر عند حافّة الصندوق اليسرى دائمًا، يمين الصفحة كانت أو يسارها', () => {
    const before = document.documentElement.dir
    try {
      for (const dir of ['ltr', 'rtl']) {
        document.documentElement.dir = dir
        // من حافّة الصندوق اليسرى إلى اليمنى = العرض كلّه، يبدأ من العمود 0 لا من عمود الصفحة الأخير.
        expect(dragToImageRect({ x: 8, y: 16 }, { x: 8 + 256, y: 16 + 128 }, BOX, STAGE)).toEqual(
          deviceRect(0, 0, 512, 256),
        )
        // ربع العرض الأيسر فيزيائيًّا = الأعمدة 0–128.
        expect(dragToImageRect({ x: 8, y: 16 }, { x: 8 + 64, y: 16 + 128 }, BOX, STAGE)).toEqual(
          deviceRect(0, 0, 128, 256),
        )
      }
    } finally {
      document.documentElement.dir = before
    }
  })

  it('المقياس يختلف بين المحورين في صندوق غير مربّع', () => {
    // صندوق 256×128 لمسرح 1024×1024: مقياس x = 4، مقياس y = 8.
    const box = new DOMRect(0, 0, 256, 128)
    const stage = { width: 1024, height: 1024 }
    expect(dragToImageRect({ x: 32, y: 16 }, { x: 64, y: 48 }, box, stage)).toEqual(
      deviceRect(128, 128, 128, 256),
    )
  })

  it('المسرح الأصغر من المعروض (مقياس ½): بكسلا صورة = أربعة بكسلات شاشة', () => {
    const box = new DOMRect(0, 0, 400, 400)
    const stage = { width: 200, height: 200 }
    // 3 بكسلات شاشة = 1.5 بكسل صورة ⟵ أقلّ من الحدّ.
    expect(dragToImageRect({ x: 100, y: 100 }, { x: 103, y: 200 }, box, stage)).toBeNull()
    // 4 بكسلات شاشة = بكسلا صورة بالضبط ⟵ مقبولة.
    expect(dragToImageRect({ x: 100, y: 100 }, { x: 104, y: 200 }, box, stage)).toEqual(
      deviceRect(50, 50, 2, 50),
    )
  })

  it('التقريب إلى الخارج: البداية floor والنهاية ceil', () => {
    const box = new DOMRect(0, 0, 100, 100)
    const stage = { width: 100, height: 100 }
    // 10.4 → 10 · 20.6 → 21 ⟵ عرض 11 لا 10.
    expect(dragToImageRect({ x: 10.4, y: 30.25 }, { x: 20.6, y: 40.75 }, box, stage)).toEqual(
      deviceRect(10, 30, 11, 11),
    )
  })

  it('يُقصّ إلى المسرح: سحبةٌ تبدأ خارج الصندوق وتنتهي خارجه تغطّي المسرح كلّه', () => {
    expect(dragToImageRect({ x: -500, y: -500 }, { x: 5000, y: 5000 }, BOX, STAGE)).toEqual(
      deviceRect(0, 0, 512, 256),
    )
  })

  it('يُقصّ من طرف واحد: البداية داخل الصندوق والنهاية بعد حافّته', () => {
    // x من 32 إلى حافّة المسرح 512.
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 9999, y: 96 }, BOX, STAGE)).toEqual(
      deviceRect(32, 32, 480, 128),
    )
  })

  it('سحبةٌ كلّها خارج الصندوق من جهة واحدة تنهار إلى صفر عرض ⟵ null', () => {
    expect(dragToImageRect({ x: -40, y: 32 }, { x: -10, y: 96 }, BOX, STAGE)).toBeNull()
  })

  it('سحبة أصغر من بكسلَي صورة في أيّ محور ⟵ null', () => {
    // عرض 1 بكسل صورة (0.5 شاشة) وارتفاع كبير.
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 24.5, y: 96 }, BOX, STAGE)).toBeNull()
    // ارتفاع 1 بكسل صورة وعرض كبير.
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 88, y: 32.5 }, BOX, STAGE)).toBeNull()
    // نقرة بلا سحب.
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 24, y: 32 }, BOX, STAGE)).toBeNull()
  })

  it('الحدّ الأدنى شاملٌ: بكسلان بالضبط يُقبلان', () => {
    expect(MIN_ZONE_PX).toBe(2)
    // 1 بكسل شاشة = 2 بكسل صورة على مقياس 2.
    expect(dragToImageRect({ x: 24, y: 32 }, { x: 25, y: 33 }, BOX, STAGE)).toEqual(
      deviceRect(32, 32, 2, 2),
    )
  })

  it('الحدّ يُقاس على السحبة لا على ما بعد التقريب', () => {
    const box = new DOMRect(0, 0, 100, 100)
    const stage = { width: 100, height: 100 }
    // 10.9 → 12.1 = 1.2 بكسل فقط ولو عبر ثلاثة أعمدة بعد التقريب (10..13).
    expect(dragToImageRect({ x: 10.9, y: 10 }, { x: 12.1, y: 60 }, box, stage)).toBeNull()
  })

  it('صندوق بلا مساحة أو مسرح بلا مساحة ⟵ null بلا قسمة على صفر', () => {
    expect(dragToImageRect({ x: 1, y: 1 }, { x: 9, y: 9 }, new DOMRect(0, 0, 0, 100), STAGE)).toBe(
      null,
    )
    expect(dragToImageRect({ x: 1, y: 1 }, { x: 9, y: 9 }, new DOMRect(0, 0, 100, 0), STAGE)).toBe(
      null,
    )
    expect(dragToImageRect({ x: 1, y: 1 }, { x: 9, y: 9 }, BOX, { width: 0, height: 10 })).toBe(
      null,
    )
  })

  it('إحداثيات غير منتهية ⟵ null لا NaN في المستطيل', () => {
    expect(dragToImageRect({ x: Number.NaN, y: 1 }, { x: 9, y: 9 }, BOX, STAGE)).toBeNull()
    expect(
      dragToImageRect({ x: 1, y: 1 }, { x: Number.POSITIVE_INFINITY, y: 9 }, BOX, STAGE),
    ).toBeNull()
  })
})

describe('dragToImageBounds — للمعاينة الحيّة', () => {
  it('كسريّة ومقصوصة، وتقبل نقرةً بلا سحب (عرضها صفر) كي تُرسَم المعاينة فور الضغط', () => {
    expect(dragToImageBounds({ x: 24, y: 32 }, { x: 24, y: 32 }, BOX, STAGE)).toEqual({
      x: 32,
      y: 32,
      width: 0,
      height: 0,
    })
    expect(dragToImageBounds({ x: 24.25, y: 32 }, { x: 88, y: 96 }, BOX, STAGE)?.x).toBe(32.5)
  })
})

describe('addZone / removeZone', () => {
  const r1 = deviceRect(0, 0, 10, 10)
  const r2 = deviceRect(20, 20, 30, 40)
  const r3 = deviceRect(5, 5, 6, 6)

  it('المعرّفات تتزايد من 1، والمستطيل يُحفَظ كما هو', () => {
    const a = addZone([], r1)
    const b = addZone(a, r2)
    expect(a).toEqual([{ id: 1, rect: r1 }])
    expect(b.map((z) => z.id)).toEqual([1, 2])
    expect(b[1]?.rect).toBe(r2)
  })

  it('لا يعدّل القائمة الأصلية', () => {
    const a = addZone([], r1)
    const snapshot = [...a]
    addZone(a, r2)
    removeZone(a, 1)
    expect(a).toEqual(snapshot)
  })

  it('الحذف بالمعرّف لا بالفهرس، ولا يُعاد استعمال معرّف منطقةٍ لا تزال قائمة', () => {
    let zones = addZone(addZone(addZone([], r1), r2), r3)
    zones = removeZone(zones, 2)
    expect(zones.map((z) => z.id)).toEqual([1, 3])
    // المعرّف التالي يتجاوز الأكبر القائم (3) فلا يصادم الثالثة.
    const next = addZone(zones, deviceRect(1, 1, 4, 4))
    expect(next.map((z) => z.id)).toEqual([1, 3, 4])
  })

  it('حذف معرّف غائب لا يغيّر شيئًا', () => {
    const zones = addZone([], r1)
    expect(removeZone(zones, 99)).toEqual(zones)
  })
})

describe('تسميات العرض', () => {
  it('شارة المسرح: رقم هنديّ من فهرس صفريّ + «غير محفوظة»', () => {
    expect(zoneChipLabel(0)).toBe('١ · غير محفوظة')
    expect(zoneChipLabel(11)).toBe('١٢ · غير محفوظة')
  })

  it('الأبعاد قياسٌ غربي W × H', () => {
    expect(zoneDimensions(deviceRect(3, 4, 120, 40))).toBe('120 × 40')
  })
})
