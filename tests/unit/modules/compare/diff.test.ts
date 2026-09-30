import { describe, expect, it } from 'vitest'

import { computeDiff, DEFAULT_DIFF_OPTIONS, type RasterImage } from '@/modules/compare/diff'
import { groupDiffRegions } from '@/modules/compare/regions'
import { deviceRect } from '@/shared/geometry'

/** صورة صلبة اللون — كل بكسل بنفس القيمة. */
function solid(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { data, width, height }
}

function clone(img: RasterImage): RasterImage {
  return { data: Uint8ClampedArray.from(img.data), width: img.width, height: img.height }
}

function setPixel(
  img: RasterImage,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  img.data.set(rgba, (y * img.width + x) * 4)
}

const WHITE = [255, 255, 255, 255] as const
const BLACK = [0, 0, 0, 255] as const
const GRAY = [100, 100, 100, 255] as const
const RED = [250, 10, 10, 255] as const

describe('computeDiff — الحالات الأساسية', () => {
  it('صورتان متطابقتان ← 0% اختلاف', () => {
    const a = solid(20, 20, GRAY)
    const b = clone(a)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
    expect(result.comparedPixels).toBe(400)
  })

  it('صورتان متعاكستان (أسود مقابل أبيض) ← 100% اختلاف', () => {
    const a = solid(20, 20, BLACK)
    const b = solid(20, 20, WHITE)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(400)
    expect(result.diffRatio).toBe(1)
  })

  it('فرق بكسل واحد يُكتشف بالعتبة الافتراضية', () => {
    const a = solid(20, 20, GRAY)
    const b = clone(a)
    setPixel(b, 10, 10, RED)
    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(1)
    expect(result.diffRatio).toBeCloseTo(1 / 400, 6)
    // القناع يطابق موضع الفرق بالضبط — يُغذّي groupDiffRegions بلا انزياح.
    expect(result.mask[10 * 20 + 10]).toBe(1)
    expect(result.mask.filter(Boolean)).toHaveLength(1)
  })

  it('التنعيم (anti-aliasing) لا يُنتج ضجيجًا فوق الحدّ المقبول', () => {
    // حافّة أفقية صلبة: الصفّان 0-2 أبيض، 3-5 أسود، على كلتا الصورتين.
    const edge = (fill: (img: RasterImage) => void): RasterImage => {
      const img = solid(6, 6, WHITE)
      for (let y = 3; y < 6; y++) for (let x = 0; x < 6; x++) setPixel(img, x, y, BLACK)
      fill(img)
      return img
    }
    const a = edge(() => {})
    // في ب وحدها: بكسل واحد بالضبط على الحافّة يتحوّل إلى رمادي متوسّط —
    // بالضبط الشكل الذي يترکه تنعيم عرضي حقيقي، لا فرقًا في المحتوى.
    const b = edge((img) => setPixel(img, 2, 2, GRAY))

    const result = computeDiff(a, b)
    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
  })
})

describe('computeDiff — اختلاف الأبعاد يُعالَج بلا استثناء (محاذاة من الأعلى-اليسار)', () => {
  it('عرضان مختلفان: التقاطع يُقارَن، والفائض يُعلَن في extraInB', () => {
    const a = solid(10, 10, GRAY)
    const b = solid(14, 10, GRAY)
    expect(() => computeDiff(a, b)).not.toThrow()
    const result = computeDiff(a, b)
    expect(result.overlap.width).toBe(10)
    expect(result.overlap.height).toBe(10)
    expect(result.comparedPixels).toBe(100)
    expect(result.extraInA.cols).toBeNull()
    expect(result.extraInB.cols).toEqual({ space: 'device', x: 10, y: 0, width: 4, height: 10 })
    expect(result.extraInB.rows).toBeNull()
  })

  it('ارتفاعان مختلفان: نفس المعالجة على المحور الآخر', () => {
    const a = solid(10, 16, GRAY)
    const b = solid(10, 10, GRAY)
    const result = computeDiff(a, b)
    expect(result.overlap.height).toBe(10)
    expect(result.extraInA.rows).toEqual({ space: 'device', x: 0, y: 10, width: 10, height: 6 })
    expect(result.extraInB.rows).toBeNull()
  })

  it('الأبعاد كلاهما مختلفان: شريطان في كلّ صورة، لا استثناء', () => {
    const a = solid(12, 8, GRAY)
    const b = solid(8, 12, GRAY)
    expect(() => computeDiff(a, b)).not.toThrow()
    const result = computeDiff(a, b)
    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 8, height: 8 })
    expect(result.extraInA.cols).toEqual({ space: 'device', x: 8, y: 0, width: 4, height: 8 })
    expect(result.extraInA.rows).toBeNull()
    expect(result.extraInB.rows).toEqual({ space: 'device', x: 0, y: 8, width: 8, height: 4 })
    expect(result.extraInB.cols).toBeNull()
  })
})

/**
 * مستوى رمادي دالّةً في `(x, y)` — ثمانية مستويات متباعدة 32.
 *
 * **لماذا رماديّ:** مركّبتا I وQ في مقياس `pixelmatch` تنعدمان للرماديات
 * (معاملاتهما تجمع صفرًا حين `r = g = b`)، فيبقى `delta = 0.5053 × d²` حيث
 * `d` فرق قيمة الرمادي — رقمٌ يُشتقّ يدويًّا لا يُقرأ من تشغيل. وسقف العتبة
 * الافتراضية `35215 × 0.1² = 352.15`، فأصغر فرق مستوى ممكن (32) يعطي
 * `0.5053 × 1024 = 517.4` وهو فوق السقف.
 *
 * **ولماذا 13 و29:** كلاهما ≡ 5 (mod 8)، فانزياح بكسل واحد في أيّ من
 * المحورين ينقل رقم المستوى خمس خانات — فرق قيمة 160 أو 96 (بعد الالتفاف)،
 * وكلاهما فوق السقف بأضعاف. أي أن كل بكسل من الصورة يتغيّر بانزياح واحد، بلا
 * دورية تُخفي إزاحةً زوجية كما تفعل رقعة الشطرنج.
 */
const level = (x: number, y: number): number => ((13 * x + 29 * y) % 8) * 32

/** صورة بنمط لكل بكسل — `originX/Y` تُزيح النمط لا الصورة. */
function patterned(width: number, height: number, originX = 0, originY = 0): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = level(x + originX, y + originY)
      data.set([v, v, v, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

/**
 * قصّ الزاوية العلوية-اليسرى هو أعقد ما في هذا الملفّ: نسخٌ صفًّا بصفّ بخطوة
 * `img.width` لا `w`. وصورةٌ صلبة اللون تُخفي كل أخطاء الخطوة الممكنة — أي
 * إزاحة تقرأ اللون نفسه فتعطي النتيجة نفسها. هذه المجموعة تُدخل نمطًا لكل
 * بكسل كي ينكشف انزياح بكسل واحد، وكي تفشل الخطوة الخاطئة (`y * w * 4`)
 * التي كانت تمرّ صامتة.
 */
describe('computeDiff — قصّ التقاطع بخطوة الصفّ الصحيحة (نمط لكل بكسل)', () => {
  it('صورة أعرض مقابل صورة بحجم التقاطع ← صفر فروق، لأنهما متطابقتان بالبناء', () => {
    // أ: 14×10 بالنمط نفسه. ب: 10×10 بالنمط نفسه. زاوية أ العلوية-اليسرى
    // 10×10 هي ب حرفيًّا — بشرط أن يقرأ القصّ كل صفّ من إزاحة `y × 14 × 4`.
    const a = patterned(14, 10)
    const b = patterned(10, 10)

    const result = computeDiff(a, b)

    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 10, height: 10 })
    expect(result.diffPixelCount).toBe(0)
    expect(result.mask.some(Boolean)).toBe(false)
  })

  it('والحالة السابقة تميّز انزياح بكسل واحد فعلًا — أفقيًّا وعموديًّا', () => {
    // بلا هذه الحالة يبقى `toBe(0)` أعلاه ادّعاءً بلا حساسية مُثبتة.
    // كل بكسل يتغيّر بالانزياح (انظر اشتقاق `level`)، فالعدّ المتوقّع هو
    // مساحة التقاطع كاملة: 10 × 10 = 100.
    const wide = patterned(14, 10)

    expect(computeDiff(wide, patterned(10, 10, 1, 0)).diffPixelCount).toBe(100)
    expect(computeDiff(wide, patterned(10, 10, 0, 1)).diffPixelCount).toBe(100)
  })

  it('اختلاف في المحورين معًا وبأبعاد فردية: 14×13 مقابل 9×11 ← صفر فروق', () => {
    // عرض التقاطع 9 (فردي) وارتفاعه 11 (فردي) — كي لا تُخفي مضاعفاتُ
    // العرض خطأَ خطوةٍ يصادف أن ينقسم بلا باقٍ.
    const result = computeDiff(patterned(14, 13), patterned(9, 11))

    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 9, height: 11 })
    expect(result.comparedPixels).toBe(99)
    expect(result.diffPixelCount).toBe(0)
  })

  it('وموضع الفرق يبقى في مكانه عبر القصّ — لا انزياح بكسل في الإحداثيات', () => {
    const a = patterned(14, 10)
    const b = patterned(10, 10)
    // بكسل واحد عند (3, 7): إزاحة قيمته 128 تبقى داخل شبكة المستويات
    // (مضاعفات 32) وتعطي `0.5053 × 128² = 8278.8` — فوق السقف 352.15.
    const target = (7 * 10 + 3) * 4
    const shifted = (b.data[target]! + 128) % 256
    b.data.set([shifted, shifted, shifted, 255], target)

    const result = computeDiff(a, b)

    expect(result.diffPixelCount).toBe(1)
    expect(result.mask[7 * 10 + 3]).toBe(1)
    expect(result.mask.filter(Boolean)).toHaveLength(1)
  })
})

/**
 * لا اختبار كان يفحص بايتًا واحدًا من `diff.data`. والافتراضي يجعل الفحص
 * مستحيلًا أصلًا: `removedColor` و`addedColor` كلاهما `[255, 0, 0]`، فتبديل
 * التخصيصين (`diffColor`/`diffColorAlt`) يمرّ صامتًا على أي اختبار افتراضي.
 * هذه المجموعة تمرّر لونين متمايزين، فتحرس اتجاه الألوان وشفافية الخلفية
 * (`diffMask: true`) معًا.
 */
describe('computeDiff — بايتات الخريطة الحرارية واتجاه الألوان', () => {
  const REMOVED = [7, 11, 13] as const
  const ADDED = [19, 23, 29] as const

  /** صفّ بكسلات واحد — أصغر شكل يحمل الاتجاهين والخلفية معًا. */
  function row(pixels: readonly (readonly [number, number, number, number])[]): RasterImage {
    const data = new Uint8ClampedArray(pixels.length * 4)
    pixels.forEach((p, i) => data.set(p, i * 4))
    return { data, width: pixels.length, height: 1 }
  }

  const pixelAt = (img: RasterImage, i: number): number[] =>
    Array.from(img.data.slice(i * 4, i * 4 + 4))

  it('أ أفتح من ب ⇒ addedColor، وأ أغمق ⇒ removedColor — الادّعاء في ComparePage مُقاسًا', () => {
    // ثلاثة بكسلات: [0] أ أبيض وب أسود، [1] أ أسود وب أبيض، [2] متطابقان.
    const a = row([WHITE, BLACK, GRAY])
    const b = row([BLACK, WHITE, GRAY])

    const result = computeDiff(a, b, { removedColor: REMOVED, addedColor: ADDED })

    expect(pixelAt(result.diff, 0)).toEqual([...ADDED, 255])
    expect(pixelAt(result.diff, 1)).toEqual([...REMOVED, 255])
    // خلفية شفّافة تمامًا — لا رمادي مخفَّف. هذا هو ما يجعل اشتقاق القناع من
    // قناة ألفا صحيحًا؛ سقوط `diffMask: true` كان يملأ ألفا 255 في كل بكسل
    // فيصير القناع كلّه آحادًا والمناطق منطقةً واحدة تغطّي الصورة.
    expect(pixelAt(result.diff, 2)).toEqual([0, 0, 0, 0])
    expect(Array.from(result.mask)).toEqual([1, 1, 0])
    expect(result.diffPixelCount).toBe(2)
  })

  it('واللونان الافتراضيان متطابقان — ولهذا لا يكشف اختبارٌ افتراضي انقلاب الاتجاه', () => {
    // حارس على الافتراضي نفسه: لو صار اللونان مختلفين هناك يومًا، فالحالة
    // السابقة وحدها لم تعد كافية لتوثيق سبب الحاجة إلى ألوان صريحة هنا.
    expect(DEFAULT_DIFF_OPTIONS.removedColor).toEqual(DEFAULT_DIFF_OPTIONS.addedColor)

    const a = row([WHITE, BLACK])
    const b = row([BLACK, WHITE])
    const result = computeDiff(a, b)

    expect(pixelAt(result.diff, 0)).toEqual(pixelAt(result.diff, 1))
  })
})

/**
 * فرع «لا تقاطع أصلًا» كان بلا اختبار رغم أنه قرارٌ دُوفع عنه أمام مراجعة
 * خصمية. المحروس هنا هو ما ينصّ عليه تعليقه حرفيًّا: `(0, 0)` لا
 * `overlapW`/`overlapH` الفعليّين — فتمرير بُعدٍ موجب كان يزعم أن أعمدة أو
 * صفوفًا قد قُورنت، وهو كذبٌ يزيد على الصمت.
 */
describe('computeDiff — بُعدٌ صفريّ ⇐ لا تقاطع، والصورتان كاملتان «غير مُقارَنتين»', () => {
  it('عرض صفري في أ: لا استثناء، ولا بكسل واحد يُعدّ مُقارَنًا', () => {
    const a: RasterImage = { data: new Uint8ClampedArray(0), width: 0, height: 10 }
    const b = solid(8, 6, GRAY)

    expect(() => computeDiff(a, b)).not.toThrow()
    const result = computeDiff(a, b)

    expect(result.comparedPixels).toBe(0)
    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
    expect(result.diff.width).toBe(0)
    expect(result.diff.height).toBe(0)
    expect(result.diff.data).toHaveLength(0)
    expect(result.mask).toHaveLength(0)

    /*
     * الارتفاع المشترك 6 موجب — وهو بالضبط الرقم الذي كانت المراجعة تقترح
     * تمريره. `(0, 0)` تعني: `overlap` بلا مساحة، و**كل** بكسل في ب واقع
     * في شريط فائض. لو مُرِّر `overlapH = 6` لصار `extraInB.rows` عدمًا
     * (`6 > 6` كاذبة) فتُعلَن صفوف ب الستّة مُقارَنةً وهي لم تُقارَن.
     */
    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 0, height: 0 })
    expect(result.extraInB.cols).toEqual({ space: 'device', x: 0, y: 0, width: 8, height: 6 })
    expect(result.extraInB.rows).toEqual({ space: 'device', x: 0, y: 0, width: 8, height: 6 })
    // وأ نفسها بلا مساحة: عمودها مفقود، وصفوفها شريط عرضه صفر — صدقٌ لا ادّعاء.
    expect(result.extraInA.cols).toBeNull()
    expect(result.extraInA.rows).toEqual({ space: 'device', x: 0, y: 0, width: 0, height: 10 })
  })

  it('ارتفاع صفري في ب: نفس العقد على المحور الآخر', () => {
    const a = solid(9, 7, GRAY)
    const b: RasterImage = { data: new Uint8ClampedArray(0), width: 5, height: 0 }

    const result = computeDiff(a, b)

    expect(result.overlap).toEqual({ space: 'device', x: 0, y: 0, width: 0, height: 0 })
    expect(result.comparedPixels).toBe(0)
    // العرض المشترك 5 موجب أيضًا، ومع ذلك أ كاملة في الشريطين.
    expect(result.extraInA.cols).toEqual({ space: 'device', x: 0, y: 0, width: 9, height: 7 })
    expect(result.extraInA.rows).toEqual({ space: 'device', x: 0, y: 0, width: 9, height: 7 })
    expect(result.extraInB.cols).toEqual({ space: 'device', x: 0, y: 0, width: 5, height: 0 })
    expect(result.extraInB.rows).toBeNull()
  })
})

/**
 * المناطق المستثناة (ADR 0034) — البكسل المستثنى لا يدخل البسط ولا المقام ولا القناع الذي يغذّي المناطق.
 *
 * كُتبت هذه الحالات **قبل** `DiffOptions.exclude` (`STAGES/34` الدفعة 1): سقطت كلّها على المحرّك السابق — النسبة
 * على التقاطع كلّه، والمناطق من القناع كلّه.
 */
describe('computeDiff — المناطق المستثناة', () => {
  /** صورتان 40×30 رماديّتان، وب فيها رقعة حمراء `w×h` عند `(x, y)`. */
  function withPatch(x: number, y: number, w: number, h: number) {
    const a = solid(40, 30, GRAY)
    const b = clone(a)
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPixel(b, x + dx, y + dy, RED)
    return { a, b }
  }

  it('اختلافٌ داخل منطقة مستثناة وحدها ⟵ النسبة صفر، والقناع والخريطة خاليان، ولا مناطق', () => {
    const { a, b } = withPatch(10, 10, 6, 4)
    const result = computeDiff(a, b, { exclude: [deviceRect(8, 8, 10, 8)] })

    expect(result.diffPixelCount).toBe(0)
    expect(result.diffRatio).toBe(0)
    expect(result.mask.every((m) => m === 0)).toBe(true)
    // ألفا الخريطة الحرارية صفرٌ حيث صُفِّر القناع — العميل يشتقّ القناع منها (`worker-client.ts`).
    for (let i = 0; i < result.mask.length; i++) expect(result.diff.data[i * 4 + 3]).toBe(0)
    expect(groupDiffRegions(result.mask, result.overlap.width, result.overlap.height)).toEqual([])
  })

  it('والمقام يستبعد بكسلات المنطقة بقيمتها المعروفة: 40×30 − 10×8', () => {
    const { a, b } = withPatch(10, 10, 6, 4)
    const result = computeDiff(a, b, { exclude: [deviceRect(8, 8, 10, 8)] })

    expect(result.excludedPixels).toBe(80)
    expect(result.comparedPixels).toBe(40 * 30 - 80)
    expect(result.overlap).toEqual(deviceRect(0, 0, 40, 30))
  })

  it('اختلافٌ خارج المنطقة يُعدّ كاملًا، على مقامٍ بلا المنطقة', () => {
    const { a, b } = withPatch(28, 20, 6, 4)
    const without = computeDiff(a, b)
    const result = computeDiff(a, b, { exclude: [deviceRect(0, 0, 10, 10)] })

    expect(without.diffPixelCount).toBe(24)
    expect(result.diffPixelCount).toBe(24)
    expect(result.comparedPixels).toBe(1200 - 100)
    expect(result.diffRatio).toBe(24 / 1100)
    expect(groupDiffRegions(result.mask, 40, 30)).toEqual([
      { id: 1, rect: deviceRect(28, 20, 6, 4), pixels: 24 },
    ])
  })

  it('رقعةٌ تعبر حدّ المنطقة: ما داخلها يسقط وما خارجها يبقى، بكسلًا بكسلًا', () => {
    const { a, b } = withPatch(10, 10, 6, 4) // 24 بكسلًا، عمودان منها (x=10،11) داخل المنطقة
    const result = computeDiff(a, b, { exclude: [deviceRect(0, 0, 12, 30)] })

    expect(result.diffPixelCount).toBe(16)
    expect(result.excludedPixels).toBe(12 * 30)
    expect(groupDiffRegions(result.mask, 40, 30)).toEqual([
      { id: 1, rect: deviceRect(12, 10, 4, 4), pixels: 16 },
    ])
  })

  it('منطقتان متراكبتان تُعدّ مساحتهما المشتركة مرّة واحدة', () => {
    const a = solid(20, 20, GRAY)
    const result = computeDiff(a, clone(a), {
      exclude: [deviceRect(0, 0, 10, 10), deviceRect(5, 5, 10, 10)],
    })
    // 100 + 100 − 25 مشتركة.
    expect(result.excludedPixels).toBe(175)
    expect(result.comparedPixels).toBe(400 - 175)
  })

  it('منطقةٌ على حدّ التقاطع تُقصّ ولا ترمي، ومنطقةٌ خارجه تُهمَل', () => {
    const a = solid(30, 20, GRAY)
    const b = solid(20, 30, GRAY) // التقاطع 20×20
    const exclude = [
      deviceRect(15, 15, 10, 10), // تعبر الحدّين: 5×5 داخله
      deviceRect(-4, 0, 6, 3), // تبدأ قبل الأصل: 2×3 داخله
      deviceRect(22, 0, 5, 5), // داخل أ وحدها — خارج التقاطع
      deviceRect(0, 25, 5, 5), // داخل ب وحدها — خارج التقاطع
    ]
    expect(() => computeDiff(a, b, { exclude })).not.toThrow()
    const result = computeDiff(a, b, { exclude })
    expect(result.excludedPixels).toBe(25 + 6)
    expect(result.comparedPixels).toBe(400 - 31)
    // الفائض يبقى كما هو: الاستثناء على التقاطع وحده.
    expect(result.extraInA.cols).toEqual(deviceRect(20, 0, 10, 20))
  })

  it('مستطيلٌ غير منتهٍ أو بلا مساحة يُتجاهل، والكسور تُوسَّع إلى البكسلات التي تمسّها', () => {
    const a = solid(10, 10, GRAY)
    const result = computeDiff(a, clone(a), {
      exclude: [
        deviceRect(Number.NaN, 0, 5, 5),
        deviceRect(0, 0, Number.POSITIVE_INFINITY, 5),
        deviceRect(2, 2, 0, 5),
        deviceRect(2, 2, -3, 5),
        deviceRect(0.5, 0.5, 1, 1), // تمسّ البكسلات (0..1)×(0..1): أربعة
      ],
    })
    expect(result.excludedPixels).toBe(4)
  })

  it('التقاطع كلّه مستثنى ⟵ لا مقام، والنسبة صفر لا NaN', () => {
    const { a, b } = withPatch(10, 10, 6, 4)
    const result = computeDiff(a, b, { exclude: [deviceRect(0, 0, 40, 30)] })
    expect(result.comparedPixels).toBe(0)
    expect(result.diffRatio).toBe(0)
    expect(result.excludedPixels).toBe(1200)
  })

  it('بلا مناطق: `excludedPixels` صفر والنتيجة كما كانت بايتًا بايتًا', () => {
    const { a, b } = withPatch(10, 10, 6, 4)
    const plain = computeDiff(a, b)
    const empty = computeDiff(a, b, { exclude: [] })
    expect(plain.excludedPixels).toBe(0)
    expect(empty.diffPixelCount).toBe(plain.diffPixelCount)
    expect(empty.diff.data).toEqual(plain.diff.data)
  })

  it('المحرّك لا يمسّ مخزنَي الدخل — ولو تساوى العرضان فكان التقاطع عرضًا على مخزن أ نفسه', () => {
    const { a, b } = withPatch(10, 10, 6, 4)
    const beforeA = Uint8ClampedArray.from(a.data)
    const beforeB = Uint8ClampedArray.from(b.data)
    computeDiff(a, b, { exclude: [deviceRect(0, 0, 40, 30)] })
    expect(a.data).toEqual(beforeA)
    expect(b.data).toEqual(beforeB)
  })
})
