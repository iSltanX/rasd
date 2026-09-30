import { describe, expect, it } from 'vitest'

import { DEFAULT_REGION_OPTIONS, groupDiffRegions } from '@/modules/compare/regions'

const W = 20
const H = 20

function emptyMask(): Uint8Array {
  return new Uint8Array(W * H)
}

function fillRect(mask: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) mask[(y + dy) * W + (x + dx)] = 1
}

describe('groupDiffRegions — أنماط معروفة', () => {
  it('عنقودان منفصلان بمسافة كبيرة ← منطقتان بمستطيلين صحيحين، بترتيب راستر', () => {
    const mask = emptyMask()
    fillRect(mask, 2, 2, 3, 3) // أعلى-يسار: مستطيل 3×3 عند (2,2)
    fillRect(mask, 14, 14, 4, 2) // أسفل-يمين: مستطيل 4×2 عند (14,14)

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })

    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 2, y: 2, width: 3, height: 3 },
      pixels: 9,
    })
    expect(regions[1]).toMatchObject({
      id: 2,
      rect: { space: 'device', x: 14, y: 14, width: 4, height: 2 },
      pixels: 8,
    })
  })

  it('عنقودان متقاربان يندمجان في منطقة واحدة بعد الانتفاخ', () => {
    const mask = emptyMask()
    fillRect(mask, 2, 2, 2, 2) // (2,2)-(3,3)
    fillRect(mask, 6, 2, 2, 2) // (6,2)-(7,3) — فجوة عمودها عمودان (4 و5) بين العنقودين

    const separate = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })
    expect(separate).toHaveLength(2)

    const merged = groupDiffRegions(mask, W, H, { dilate: 3, minPixels: 1 })
    expect(merged).toHaveLength(1)
    expect(merged[0]?.rect).toEqual({ space: 'device', x: 2, y: 2, width: 6, height: 2 })
    // المساحة المبلَّغة تبقى بكسلات الفرق الحقيقية — 8 لا 12 (مساحة المستطيل المنتفخ).
    expect(merged[0]?.pixels).toBe(8)
  })

  it('minPixels يُسقط الضجيج أحادي البكسل مع إبقاء المناطق الحقيقية', () => {
    const mask = emptyMask()
    mask[5 * W + 5] = 1 // ضجيج معزول، بكسل واحد
    fillRect(mask, 10, 10, 5, 5) // منطقة حقيقية، 25 بكسلًا

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 4 })
    expect(regions).toHaveLength(1)
    expect(regions[0]?.rect).toEqual({ space: 'device', x: 10, y: 10, width: 5, height: 5 })
  })

  it('اتصال ثماني الجهات يدمج تراكب القطر', () => {
    const mask = emptyMask()
    mask[5 * W + 5] = 1
    mask[6 * W + 6] = 1 // متجاور قطريًّا لا أفقيًّا/عموديًّا فقط

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })
    expect(regions).toHaveLength(1)
    expect(regions[0]?.rect).toEqual({ space: 'device', x: 5, y: 5, width: 2, height: 2 })
  })

  it('قناع فارغ أو أبعاد غير متطابقة ← مصفوفة فارغة بلا استثناء', () => {
    expect(groupDiffRegions(new Uint8Array(0), 0, 0)).toEqual([])
    expect(groupDiffRegions(new Uint8Array(5), W, H)).toEqual([])
    expect(groupDiffRegions(emptyMask(), W, H)).toEqual([])
  })
})

/** قناع بأبعاد صريحة — `emptyMask`/`fillRect` أعلاه مربوطتان بـ`W`/`H` وحدهما. */
function blank(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h)
}

function paint(mask: Uint8Array, w: number, x: number, y: number, rw: number, rh: number): void {
  for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) mask[(y + dy) * w + (x + dx)] = 1
}

/** منقول قناع مربّع — لفحص تماثل الانتفاخ بين المحورين. */
function transpose(mask: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x * n + y] = mask[y * n + x] ?? 0
  return out
}

/**
 * الانتفاخ كان مقيسًا بحالة **أفقية واحدة**: عنقودان في صفّ واحد تفصلهما
 * فجوة أعمدة. وذلك يمرّ حتى لو كانت التمريرة العمودية معطَّلة تمامًا، أو
 * مفهرسة بالمحور الخاطئ، أو بنصف قطر مختلف عن الأفقية. وحدود الصورة غير
 * مقيسة أصلًا رغم أن النافذة الانزلاقية تبدأ من `-radius` وتنتهي عند
 * `innerLen` — طرفان يسهل أن يُقصَّا بواحد فيُسقط بكسلات مصدرها الحافّة.
 */
describe('groupDiffRegions — الانتفاخ في المحورين وعند الحواف', () => {
  const N = 16

  it('الانتفاخ يعبر فجوة **رأسية** — لا الأفقية وحدها', () => {
    // كتلتان 2×2 في العمودين 5-6: الأولى صفوف 2-3، والثانية صفوف 6-7،
    // بينهما صفّان فارغان (4 و5). بنق=1 تبلغ الأولى الصفّ 4 والثانية الصفّ
    // 5، فيتلاصقان رأسيًّا ويندمجان؛ وبنق=0 تفصلهما ثلاثة صفوف.
    const mask = blank(N, N)
    paint(mask, N, 5, 2, 2, 2)
    paint(mask, N, 5, 6, 2, 2)

    expect(groupDiffRegions(mask, N, N, { dilate: 0, minPixels: 1 })).toHaveLength(2)

    const merged = groupDiffRegions(mask, N, N, { dilate: 1, minPixels: 1 })
    expect(merged).toHaveLength(1)
    // الحدود من القناع الأصلي: الأعمدة 5-6 والصفوف 2-7.
    expect(merged[0]?.rect).toEqual({ space: 'device', x: 5, y: 2, width: 2, height: 6 })
    expect(merged[0]?.pixels).toBe(8)
  })

  it('قرار الدمج نفسه في المحورين — القناعُ ومنقولُه يعطيان النتيجة نفسها منقولةً', () => {
    /*
     * ثلاث كتل 2×2: ك1 عند (1,1)، ك2 عند (6,1) — بينهما ثلاثة أعمدة (3,4,5)
     * — وك3 معزولة عند (10,10). نصف القطر الحرج **بالحساب**: ك1 تمتدّ إلى
     * `2 + نق` وك2 تبدأ من `6 − نق`، فيتلاصقان حين `(6 − نق) − (2 + نق) ≤ 1`
     * أي `نق ≥ 1.5` ⇐ نق=2 يدمج ونق=1 لا. وحرجيّته هي المقصودة: خطأ بواحد
     * في نصف قطر أحد المحورين يقلب النتيجة في ذلك المحور وحده.
     */
    const mask = blank(N, N)
    paint(mask, N, 1, 1, 2, 2)
    paint(mask, N, 6, 1, 2, 2)
    paint(mask, N, 10, 10, 2, 2)
    const flipped = transpose(mask, N)

    expect(groupDiffRegions(mask, N, N, { dilate: 1, minPixels: 1 })).toHaveLength(3)
    expect(groupDiffRegions(flipped, N, N, { dilate: 1, minPixels: 1 })).toHaveLength(3)

    const across = groupDiffRegions(mask, N, N, { dilate: 2, minPixels: 1 })
    expect(across).toHaveLength(2)
    expect(across[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 1, y: 1, width: 7, height: 2 },
      pixels: 8,
    })
    expect(across[1]).toMatchObject({
      id: 2,
      rect: { space: 'device', x: 10, y: 10, width: 2, height: 2 },
      pixels: 4,
    })

    const down = groupDiffRegions(flipped, N, N, { dilate: 2, minPixels: 1 })
    expect(down).toHaveLength(2)
    expect(down[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 1, y: 1, width: 2, height: 7 },
      pixels: 8,
    })
    expect(down[1]).toMatchObject({
      id: 2,
      rect: { space: 'device', x: 10, y: 10, width: 2, height: 2 },
      pixels: 4,
    })
  })

  it('منطقة ملاصقة للحافّة تُعامَل كنظيرتها في الوسط — بلا قصٍّ ولا تضخيم', () => {
    // نفس الشكل مرّتين: مرّة لاصقًا الحافّة العلوية-اليسرى، ومرّة مُزاحًا
    // خمسة بكسلات في المحورين. النتيجة يجب أن تكون الشكل نفسه مُزاحًا.
    const atEdge = blank(N, N)
    paint(atEdge, N, 0, 0, 2, 2)
    paint(atEdge, N, 5, 0, 2, 2)

    const inMiddle = blank(N, N)
    paint(inMiddle, N, 5, 5, 2, 2)
    paint(inMiddle, N, 10, 5, 2, 2)

    const edgeRegions = groupDiffRegions(atEdge, N, N, { dilate: 2, minPixels: 1 })
    const middleRegions = groupDiffRegions(inMiddle, N, N, { dilate: 2, minPixels: 1 })

    expect(edgeRegions).toHaveLength(1)
    expect(edgeRegions[0]).toMatchObject({
      rect: { space: 'device', x: 0, y: 0, width: 7, height: 2 },
      pixels: 8,
    })
    expect(middleRegions).toHaveLength(1)
    expect(middleRegions[0]).toMatchObject({
      rect: { space: 'device', x: 5, y: 5, width: 7, height: 2 },
      pixels: 8,
    })
  })

  it('الانتفاخ لا يُسقط بكسلًا مصدره عند أيّ من الزوايا الأربع', () => {
    /*
     * أربع نقاط في الزوايا الأربع تمامًا، بنصف قطر 4. النافذة الانزلاقية
     * تبدأ من `−نق` وتنتهي عند `innerLen`؛ قصُّ أيٍّ من الطرفين يُسقط
     * البكسل الملاصق للحافّة من القناع المنتفخ، فيفقد تسميته ويختفي من
     * الحصر كلّه — لا يتقلّص مستطيله فحسب بل تختفي المنطقة.
     * والزوايا متباعدة 15 بكسلًا، ونصف القطر 4 يمدّ كلًّا منها 4 بكسلات
     * فقط (0..4 مقابل 11..15)، فلا اندماج بينها.
     */
    const mask = blank(N, N)
    mask[0] = 1
    mask[N - 1] = 1
    mask[(N - 1) * N] = 1
    mask[N * N - 1] = 1

    const regions = groupDiffRegions(mask, N, N, { dilate: 4, minPixels: 1 })

    expect(regions).toHaveLength(4)
    expect(regions.map((r) => [r.rect.x, r.rect.y, r.rect.width, r.rect.height])).toEqual([
      [0, 0, 1, 1],
      [15, 0, 1, 1],
      [0, 15, 1, 1],
      [15, 15, 1, 1],
    ])
    expect(regions.map((r) => r.pixels)).toEqual([1, 1, 1, 1])
  })
})

/**
 * «ترتيب راستر» موثَّق في ترويسة `groupDiffRegions`، والاختبار القائم لا
 * يفرّق بينه وبين ترتيب عمودي: منطقتاه على قطرٍ موافق (أعلى-يسار ثم
 * أسفل-يمين) فيتّفق كلّ ترتيبين ممكنين عليهما. هاتان الحالتان تُفرّقان فعلًا.
 */
describe('groupDiffRegions — ترتيب الترقيم راستر لا سواه', () => {
  it('قطرٌ معاكس: الأعلى أوّلًا مهما كان أقصى اليمين', () => {
    // منطقتان: العليا عند (14,2) والسفلى عند (2,12). ترتيب راستر (y ثم x)
    // يعطي العليا رقم 1؛ وترتيب عمودي (x ثم y) كان يعطي السفلى رقم 1.
    const mask = emptyMask()
    fillRect(mask, 14, 2, 3, 3)
    fillRect(mask, 2, 12, 3, 3)

    const regions = groupDiffRegions(mask, W, H, { dilate: 0, minPixels: 1 })

    expect(regions.map((r) => [r.id, r.rect.x, r.rect.y])).toEqual([
      [1, 14, 2],
      [2, 2, 12],
    ])
  })

  it('والترقيم يتبع القناع الأصلي لا ترتيب اكتشاف العناقيد المنتفخة', () => {
    /*
     * بلا هذه الحالة يبقى الفرز نفسه بلا حراسة: مع `dilate: 0` يوافق ترتيبُ
     * التسمية (مسحٌ راستريّ للقناع) ترتيبَ الفرز دائمًا، فحذف `sort` كلّه
     * يمرّ أخضر.
     *
     * أ: خطّ قطريّ من (20,3) إلى (2,21) — 19 بكسلًا متجاورة قطريًّا،
     * فمتّصلة بثماني جهات بلا انتفاخ. حدوده من القناع: x من 2 إلى 20،
     * y من 3 إلى 21.
     * ب: كتلة 2×2 عند (6,3) — 4 بكسلات.
     *
     * **ترتيب الاكتشاف يخالف ترتيب الفرز هنا**: الصفّ الأعلى في القناع
     * المنتفخ (نق=2) هو 1 لكليهما، وفيه تمتدّ ب على الأعمدة 4..9 وأ على
     * الأعمدة 18..22 — فالمسح يلقى ب أوّلًا. بينما الفرز على القناع الأصلي
     * يقارن `y0` (3 لكليهما) ثم `x0` (2 لأ، 6 لب) فيقدّم أ.
     *
     * ولا يندمجان: أدنى عمود لأ عند الصفوف ≤ 6 هو 13 (من البكسل (15,8)
     * المنتفخ إلى x∈[13,17]، y∈[6,10])، وأقصى عمود لب المنتفخة 9.
     */
    const n = 30
    const mask = blank(n, n)
    for (let k = 0; k < 19; k++) mask[(3 + k) * n + (20 - k)] = 1
    paint(mask, n, 6, 3, 2, 2)

    const regions = groupDiffRegions(mask, n, n, { dilate: 2, minPixels: 1 })

    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 2, y: 3, width: 19, height: 19 },
      pixels: 19,
    })
    expect(regions[1]).toMatchObject({
      id: 2,
      rect: { space: 'device', x: 6, y: 3, width: 2, height: 2 },
      pixels: 4,
    })
  })
})

describe('groupDiffRegions — الحدّيات: بكسل واحد، وقناع فارغ، وقناع ممتلئ', () => {
  const N = 16

  it('منطقة بحجم بكسل واحد: المستطيل 1×1 من القناع الأصلي لا من المنتفخ', () => {
    // نق=4 يمدّ البكسل الواحد إلى مربّع 9×9 في القناع المنتفخ. لو اشتُقّت
    // الحدود منه لخرج مستطيل (3,5,9,9) — تضخيم صامت بتسعة أضعاف المساحة.
    const mask = blank(N, N)
    mask[9 * N + 7] = 1

    const regions = groupDiffRegions(mask, N, N, { dilate: 4, minPixels: 1 })

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 7, y: 9, width: 1, height: 1 },
      pixels: 1,
    })
  })

  it('قناع فارغ تمامًا مع انتفاخ فعّال وأدنى بكسلات 1 ← لا مناطق', () => {
    // الحالة القائمة تفحص الفارغ بالخيارات الافتراضية وحدها، فترشيح
    // `minPixels` يستر أي منطقة مخترَعة. هنا لا مرشِّح يستر شيئًا: انتفاخٌ
    // يشتغل على عدم يجب أن يبقى عدمًا.
    expect(groupDiffRegions(blank(N, N), N, N, { dilate: 4, minPixels: 1 })).toEqual([])
  })

  it('قناع ممتلئ تمامًا ← منطقة واحدة تغطّي الصورة، ومساحتها كل البكسلات', () => {
    const mask = new Uint8Array(N * N).fill(1)

    const regions = groupDiffRegions(mask, N, N, { dilate: 4, minPixels: 1 })

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 0, y: 0, width: N, height: N },
      pixels: N * N,
    })
  })

  it('صورة 1×1 ببكسل فرق واحد ← منطقة واحدة، والنافذة الانزلاقية لا تنفجر', () => {
    // أصغر مدخل ممكن: طول النافذة الداخلية 1 ونصف القطر 4، أي أن حلقة
    // النافذة تدور من −4 إلى 0 بلا عنصر تُضيفه بعد الأوّل.
    const regions = groupDiffRegions(new Uint8Array([1]), 1, 1, { dilate: 4, minPixels: 1 })

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 0, y: 0, width: 1, height: 1 },
      pixels: 1,
    })
  })
})

/**
 * الخيارات الافتراضية تُطبَّق حين لا يُمرَّر شيء، وتُدمَج **جزئيًّا** حين يُمرَّر
 * بعضها. الحالات القائمة كلّها تعطي الخيارين معًا فلا تكشف أيًّا من الأمرين —
 * وهما ما يتّصل به الاستدعاء الحقيقي (الخلفية والعامل يستدعيان بلا خيارات).
 */
describe('groupDiffRegions — الخيارات الافتراضية والدمج الجزئي', () => {
  const N = 24

  it('الافتراضيّان مقيسان: نصف قطر 4 وأدنى 4 بكسلات', () => {
    expect(DEFAULT_REGION_OPTIONS).toEqual({ dilate: 4, minPixels: 4 })
  })

  it('بلا خيارات: مجموعة من 3 بكسلات ضجيج ومن 4 منطقة — الحدّ شاملٌ لا صارم', () => {
    const mask = blank(N, N)
    paint(mask, N, 2, 2, 3, 1) // 3 بكسلات
    paint(mask, N, 15, 15, 2, 2) // 4 بكسلات بالضبط

    const regions = groupDiffRegions(mask, N, N)

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      id: 1,
      rect: { space: 'device', x: 15, y: 15, width: 2, height: 2 },
      pixels: 4,
    })
  })

  it('تمرير الانتفاخ وحده يُبقي أدنى البكسلات الافتراضي (4)', () => {
    const mask = blank(N, N)
    paint(mask, N, 2, 2, 3, 1) // 3 بكسلات: دون الحدّ الافتراضي
    paint(mask, N, 12, 12, 2, 2) // 4 بكسلات

    const regions = groupDiffRegions(mask, N, N, { dilate: 0 })

    expect(regions.map((r) => r.pixels)).toEqual([4])
  })

  it('تمرير أدنى البكسلات وحده يُبقي الانتفاخ الافتراضي (4)', () => {
    // كتلتان تفصلهما 4 أعمدة فارغة: الانتفاخ 4 يدمجهما، والصفر يفصلهما.
    const mask = blank(N, N)
    paint(mask, N, 2, 2, 2, 2)
    paint(mask, N, 8, 2, 2, 2)

    const viaDefault = groupDiffRegions(mask, N, N, { minPixels: 1 })
    const viaZero = groupDiffRegions(mask, N, N, { minPixels: 1, dilate: 0 })

    expect(viaDefault).toHaveLength(1)
    expect(viaDefault[0]?.rect).toEqual({ space: 'device', x: 2, y: 2, width: 8, height: 2 })
    expect(viaZero).toHaveLength(2)
  })
})
