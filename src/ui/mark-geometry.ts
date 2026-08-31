/**
 * هندسة علامة رصد — مصدر واحد يقرؤه المكوّن ومولِّد الأيقونات معًا.
 * القرار وعلّته في [ADR 0016](../../Docs/ADR/0016-mark-geometry-single-source.md).
 *
 * وُضع هنا لا داخل `RasdMark.tsx` لأن `scripts/brand-icons.mjs` يحتاج نفس
 * الأرقام ليرسم أيقونات الإضافة، و`.tsx` لا يُستورَد من Node (لا تُجرَّد
 * الـJSX). نسختان من الشكل تعنيان انحرافًا صامتًا: يُصحَّح الشعار في
 * الواجهة وتبقى الأيقونة على الشكل القديم.
 *
 * **كل قياس مضاعف لسماكة الخط `W`** (وهي 100 في فضاء `viewBox` لكل قصّ):
 * ذراع القوس `3W : 4W : 5W`، والشعار `13W × 9W`، والفتحة `6W × 5W` بنصف
 * قطر `2W`، والداخلية `4W × 3W` بنصف قطر `1W`، والفراغ بين القوس والفتحة
 * `1.2W` مقيسًا **عموديًا على القوس** لا أفقيًا. الأرقام أدناه إحداثيات
 * الخطّ المركزيّ — يرسمها المتصفّح حدودًا، فتخرج الفتحة والفراغ صحيحين
 * دون حساب إزاحة يدوي.
 *
 * **القصّات السبعة ليست تحجيمًا لشكل واحد.** الزاوية واحدة في كلّها،
 * لكن كلما صغر حجم العرض غلُظ الخط نسبةً إلى الارتفاع (من 10.5% عند 128
 * إلى 15.4% عند 16) واتّسع الفراغ وكبُرت الفتحة — وإلّا انطمست الفتحة
 * وتلاصق القوسان. اسم القصّ هو حجم العرض بالبكسل الذي ضُبط له.
 *
 * تحقّق سريع من أي تعديل: قصّ 64 مقسومًا على 12.5 يعطي أعدادًا صحيحة —
 * `viewBox="0 0 104 72"`، سماكة 8، و`M28 4 L4 36 L28 68`.
 */

export interface MarkCut {
  readonly viewBox: string
  /** القوسان: الأيسر ثم الأيمن — خطّ مركزيّ من ثلاث نقاط لكلٍّ. */
  readonly brackets: readonly [string, string]
  /** الفتحة — مستطيل بخطّ مركزيّ، نصف قطره `2W − W/2`. */
  readonly aperture: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
    readonly rx: number
  }
}

/** سماكة الخط في فضاء الـ`viewBox` — ثابتة عبر القصّات، والنسبة تتغيّر بتغيّر الـ`viewBox`. */
export const MARK_STROKE = 100

export const MARK_CUT_16: MarkCut = {
  viewBox: '0 0 1052 650',
  brackets: ['M256.25 50 L50 325 L256.25 600', 'M795.75 50 L1002 325 L795.75 600'],
  aperture: { x: 372, y: 205, w: 308, h: 240, rx: 86 },
}

export const MARK_CUT_20: MarkCut = {
  viewBox: '0 0 1098.5 700',
  brackets: ['M275 50 L50 350 L275 650', 'M823.5 50 L1048.5 350 L823.5 650'],
  aperture: { x: 377.25, y: 215, w: 344, h: 270, rx: 98 },
}

export const MARK_CUT_24: MarkCut = {
  viewBox: '0 0 1145 750',
  brackets: ['M293.75 50 L50 375 L293.75 700', 'M851.25 50 L1095 375 L851.25 700'],
  aperture: { x: 382.5, y: 225, w: 380, h: 300, rx: 110 },
}

export const MARK_CUT_32: MarkCut = {
  viewBox: '0 0 1222.5 825',
  brackets: ['M321.875 50 L50 412.5 L321.875 775', 'M900.625 50 L1172.5 412.5 L900.625 775'],
  aperture: { x: 391.25, y: 237.5, w: 440, h: 350, rx: 130 },
}

export const MARK_CUT_48: MarkCut = {
  viewBox: '0 0 1280.625 875',
  brackets: ['M340.625 50 L50 437.5 L340.625 825', 'M940 50 L1230.625 437.5 L940 825'],
  aperture: { x: 397.8125, y: 243.75, w: 485, h: 387.5, rx: 145 },
}

export const MARK_CUT_64: MarkCut = {
  viewBox: '0 0 1300 900',
  brackets: ['M350 50 L50 450 L350 850', 'M950 50 L1250 450 L950 850'],
  aperture: { x: 400, y: 250, w: 500, h: 400, rx: 150 },
}

export const MARK_CUT_128: MarkCut = {
  viewBox: '0 0 1338.75 950',
  brackets: ['M368.75 50 L50 475 L368.75 900', 'M970 50 L1288.75 475 L970 900'],
  aperture: { x: 404.375, y: 262.5, w: 530, h: 425, rx: 160 },
}

/**
 * كل القصّات مفهرسة بحجم العرض. يستهلكها `scripts/brand-icons.mjs`؛ المكوّن
 * يستورد القصّين اللذين يحتاجهما وحدهما فتُسقِط الحزمةُ الباقي.
 */
export const MARK_CUTS = {
  16: MARK_CUT_16,
  20: MARK_CUT_20,
  24: MARK_CUT_24,
  32: MARK_CUT_32,
  48: MARK_CUT_48,
  64: MARK_CUT_64,
  128: MARK_CUT_128,
} as const

export type MarkCutSize = keyof typeof MARK_CUTS
