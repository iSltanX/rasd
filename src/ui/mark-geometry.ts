/**
 * هندسة شعار رصد v3 — مصدر واحد يقرؤه المكوّن ومولِّد الأيقونات ومولِّد أصول الهوية.
 * القرار وعلّته في [ADR 0016](../../Docs/ADR/0016-mark-geometry-single-source.md)
 * و[ADR 0024](../../Docs/ADR/0024-mark-v3-in-code.md).
 *
 * يستورده ثلاثة: `RasdMark.tsx` في الواجهة، و`scripts/brand-icons.mjs` لأيقونات
 * الإضافة، و`Docs/Brand/build.mjs` لأصول الهوية. و`.tsx` لا يُستورَد من Node (لا
 * تُجرَّد الـJSX)، فالهندسة هنا لا في المكوّن. نسختان من الشكل تعنيان انحرافًا
 * صامتًا: يُصحَّح الشعار في الواجهة وتبقى الأيقونة على الشكل القديم.
 *
 * **الشكلان:** حلقة مفتوحة على القطر الصاعد إلى أعلى اليمين، ونقطة معيّنة في
 * مركزها. قطر الحلقة `16u`، والسماكة `3u`، والفتحة `4u`، ونصف قطر النقطة `3u`.
 * **القصّ الصغير** (16–20 بكسل) يوسّع الفتحة إلى `4.5u` ويكبّر النقطة إلى
 * `3.25u`: قِيس عند 16 بكسل أن فتحتَي `3u` و`4u` تذوبان في تنعيم الحوافّ فتُقرأ
 * الحلقة مغلقة (`Docs/Brand/tests/07-cuts.png`).
 *
 * **مسارات مصمتة لا حدود.** الفتحة شريط متوازي الحافّتين، وحافّتاها توازيان ضلعَي
 * النقطة — وهذا لا يُعبَّر عنه بحدّ مستدير الطرفين. فالحلقة مسار واحد بقوسين،
 * تُحسب نقاط تقاطعه في إطار محوره الفتحة ثم تُدار، فلا `transform` ولا `mask`.
 *
 * تحقّق سريع من أي تعديل: `pnpm vitest run tests/unit/ui/mark-geometry.test.ts`
 * يقارن المسارات بملفّات `Docs/Brand/svg/` المودَعة، و`node Docs/Brand/build.mjs`
 * يعيد الملفّات التسعة والخمسين نفسها بايتًا.
 */

/** قطر الحلقة بوحدات الشبكة. */
export const MARK_GRID = 16

/** سماكة الحلقة `W`، وعرض الفتحة `G`، ونصف قطر النقطة المعيّنة `N` — بوحدات الشبكة. */
export interface MarkCutSpec {
  readonly W: number
  readonly G: number
  readonly N: number
}

export type MarkCut = 'regular' | 'small'

export const MARK_CUT: Readonly<Record<MarkCut, MarkCutSpec>> = {
  regular: { W: 3, G: 4, N: 3 },
  small: { W: 3, G: 4.5, N: 3.25 },
}

/** القصّ الصغير حتى 20 بكسل، والعادي من 24 فصاعدًا. */
export const markCutFor = (px: number): MarkCut => (px <= 20 ? 'small' : 'regular')

/** نصف قطر زاوية البلاطة نسبةً إلى ضلعها — نسبة بلاطات النظام القائمة. */
export const MARK_TILE_RADIUS = 0.2237

/**
 * بلاطة أيقونة الإضافة: العلامة تشغل 75% من الضلع، إلا عند 16 فتشغل 87.5% بخطّ
 * أرفع قليلًا — منطق القصّات نفسه مطبَّقًا على الحشوة. القيم بوحدات بلاطة ضلعها
 * `side`، وقطر العلامة فيها `d`.
 */
export interface MarkTileSpec extends MarkCutSpec {
  readonly side: number
  readonly d: number
}

export const MARK_TILE: Readonly<Record<MarkCut, MarkTileSpec>> = {
  regular: { side: 32, d: 24, W: 4.5, G: 6, N: 4.5 },
  small: { side: 16, d: 14, W: 2.75, G: 4.5, N: 2.75 },
}

/**
 * كتابة «رصد» — Almarai ExtraBold عند 1000 بكسل، محوَّلة إلى مسارات في Figma
 * (العقدة `244:270`)، فلا تعتمد على وجود الخطّ. صندوق الحبر `1747 × 711`،
 * وخطّ القاعدة عند `y = 473`، وذيل الراء ينزل إلى 711.
 */
export const WORDMARK = {
  w: 1747,
  h: 711,
  /** حجم الخطّ الذي قِيست عنده المسارات. */
  em: 1000,
  paths: [
    'M101 7C118.333 2.99999 142.333 0.999987 173 0.999987C255 0.999987 321 26.6667 371 78C415.667 124 438 182.333 438 253V302C438 320.667 438.333 334.667 439 344H464V473H451L414 427H411C405 433.667 399.667 439.333 395 444C371.667 462.667 345.333 472.333 316 473H0V344H270C279.333 344 284 339.333 284 330V265C284 224.333 271.333 191 246 165C221.333 139 189 126 149 126C128.333 126 112.333 127.333 101 130V7Z',
    'M789.023 136C875.69 45.3333 976.357 0 1091.02 0C1173.69 0 1242.36 25 1297.02 75C1348.36 121 1374.02 179 1374.02 249V349C1374.02 380.333 1363.69 407.667 1343.02 431C1318.36 459 1287.36 473 1250.02 473H456.023V344H636.023V13H790.023L789.023 136ZM1220.02 266C1220.02 239.333 1212.36 214 1197.02 190C1167.02 151.333 1125.02 132 1071.02 132C1020.36 132 971.023 150 923.023 186C871.023 224 826.357 276.667 789.023 344H1205.02C1215.02 344 1220.02 339.333 1220.02 330V266Z',
    'M1746.88 13V435C1746.88 525.667 1717.54 595 1658.88 643C1624.87 671.667 1584.54 691.667 1537.88 703C1514.54 708.333 1488.54 711 1459.88 711L1433.88 709L1370.88 630V577C1372.87 577.667 1376.54 578.333 1381.88 579C1399.21 582.333 1414.54 584 1427.88 584C1483.21 582.667 1524.21 569 1550.88 543C1578.21 515.667 1591.88 473.667 1591.88 417V13H1746.88Z',
  ],
} as const

/**
 * القفلان، بوحدات قطرها 160 (أي `u = 10`) كي تبقى الكسور مقروءة. الأفقي: الرمز يمين
 * الكلمة (يسبقها في اتجاه القراءة)، وحجم الخطّ `1.2 ×` القطر — عندها تساوي سماكة
 * القائم في الحرف (`0.155em`) سماكة الحلقة — والفراغ `5u`. الرأسي: `0.9 ×` و`4u`.
 */
export const MARK_LOCKUP = {
  d: 160,
  horizontal: { font: 1.2, gap: 5 },
  stacked: { font: 0.9, gap: 4 },
} as const

/** تقريب إلى أربع خانات — يحذف ضجيج الفاصلة العائمة من المسارات المكتوبة. */
export const round4 = (v: number): number => Number(v.toFixed(4))

/**
 * الحلقة المفتوحة مسارًا واحدًا. الفتحة شريط متوازي الحافّتين على القطر الصاعد
 * (−45°)، فحافّتاها توازيان ضلعَي النقطة المعيّنة.
 */
export function ringPath(cx: number, cy: number, R: number, W: number, G: number): string {
  const r = R - W
  const h = G / 2
  const k = Math.SQRT1_2
  const xo = Math.sqrt(R * R - h * h)
  const xi = Math.sqrt(r * r - h * h)
  const at = (x: number, y: number): string =>
    `${round4(cx + k * (x + y))} ${round4(cy + k * (y - x))}`
  return (
    `M${at(xo, -h)} A${round4(R)} ${round4(R)} 0 1 0 ${at(xo, h)} ` +
    `L${at(xi, h)} A${round4(r)} ${round4(r)} 0 1 1 ${at(xi, -h)} Z`
  )
}

/** النقطة المعيّنة — مربّع مُدار 45° نصف قطره `N`. */
export const nuqtaPath = (cx: number, cy: number, N: number): string =>
  `M${round4(cx)} ${round4(cy - N)} L${round4(cx + N)} ${round4(cy)} L${round4(cx)} ${round4(cy + N)} L${round4(cx - N)} ${round4(cy)} Z`

/** مسارا العلامة داخل مربّع ضلعه `d` يبدأ عند `(x, y)`. */
export interface MarkPaths {
  readonly ring: string
  readonly nuqta: string
}

export function markPaths(x: number, y: number, d: number, cut: MarkCutSpec): MarkPaths {
  const c = d / 2
  return {
    ring: ringPath(x + c, y + c, c, cut.W, cut.G),
    nuqta: nuqtaPath(x + c, y + c, cut.N),
  }
}

/** الرمز على شبكته (`viewBox="0 0 16 16"`) بقصَّيه — ما يرسمه `RasdMark`. */
export const MARK_SYMBOL: Readonly<Record<MarkCut, MarkPaths>> = {
  regular: markPaths(0, 0, MARK_GRID, MARK_CUT.regular),
  small: markPaths(0, 0, MARK_GRID, MARK_CUT.small),
}

/** مواضع القفل الأفقي داخل `viewBox` ارتفاعه `MARK_LOCKUP.d`. */
export interface HorizontalLockupLayout {
  readonly width: number
  readonly height: number
  /** إزاحة الكلمة ومقياسها. */
  readonly word: { readonly x: number; readonly y: number; readonly scale: number }
  /** مسارا الرمز في موضعه يمين الكلمة، بالقصّ العادي. */
  readonly mark: MarkPaths
}

export function horizontalLockup(): HorizontalLockupLayout {
  const { d } = MARK_LOCKUP
  const u = d / MARK_GRID
  const scale = (MARK_LOCKUP.horizontal.font * d) / WORDMARK.em
  const w = WORDMARK.w * scale
  const h = WORDMARK.h * scale
  const gap = MARK_LOCKUP.horizontal.gap * u
  const cut = MARK_CUT.regular
  return {
    width: round4(w + gap + d),
    height: d,
    word: { x: 0, y: round4((d - h) / 2), scale: round4(scale) },
    mark: markPaths(w + gap, 0, d, { W: cut.W * u, G: cut.G * u, N: cut.N * u }),
  }
}
