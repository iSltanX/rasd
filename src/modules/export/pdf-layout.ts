/**
 * تخطيط صفحات PDF — حجم الصفحة واتجاهها، وأين تُقسم اللقطة الطويلة.
 *
 * **منفصل عن المولِّد عمدًا:** النافذة تحتاج عدد الصفحات قبل التصدير (صفّ «الحجم التقديري» في إطار
 * `export / pdf`، `290:480`)، والمولِّد يجرّ `pdf-lib` كلّها. فالحساب هنا بلا اعتمادية، يستورده الملخّص
 * ساكنًا، ويُحمَّل المولِّد كسولًا عند النقر وحده.
 *
 * **والوحدات اثنتان لا تختلطان:** بكسل الصورة (صفوف وأعمدة)، ونقطة PDF (1/72 بوصة). و`scale` في كل نافذة
 * هو الجسر الوحيد بينهما: نقاطٌ لكل بكسل.
 *
 * **«بلا قطع سطر»** وعدٌ في نصّ الإطار تحت «التقسيم». والقاطع لا يعرف النصّ ولا الـDOM — يعرف البكسلات
 * المخبوزة وحدها (فيها التعليقات، وهي ما سيُطبع). فيبحث قبل الحدّ المثالي عن **شريطٍ هادئ**: صفوفٌ متتالية
 * بلا انتقالات لونية تُذكر، أي فراغٌ بين سطرين. ولا يجده في صورةٍ ممتلئة (صورة فوتوغرافية، تدرّج)، فيقطع عند
 * الحدّ المثالي ويقول ذلك في اسمه لا في وعدٍ أوسع منه.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { CountForms } from '@/shared/bidi/numerals'

export type PageSizeId = 'a4' | 'letter'
export type PageOrientation = 'portrait' | 'landscape'
/** `multi` تقسم الطويلة على صفحات بعرض المحتوى، و`single` تُصغّرها لتسع صفحةً واحدة. */
export type PageSplit = 'multi' | 'single'

export interface PdfLayoutOptions {
  readonly size: PageSizeId
  readonly orientation: PageOrientation
  readonly split: PageSplit
}

/** المقاسات القياسية بالنقاط — A4 من ISO 216 (210 × 297 مم)، وLetter من ANSI (8.5 × 11 بوصة). */
export const PAGE_SIZES: Readonly<
  Record<PageSizeId, { readonly label: string; readonly width: number; readonly height: number }>
> = {
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  letter: { label: 'Letter', width: 612, height: 792 },
}

export const PAGE_SIZE_IDS: readonly PageSizeId[] = ['a4', 'letter']

export const ORIENTATION_LABEL: Readonly<Record<PageOrientation, string>> = {
  portrait: 'عمودي',
  landscape: 'أفقي',
}

/** «صفحة واحدة» · «صفحتان» · «٣ صفحات» · «١١ صفحة» — لـ`countText` في الملخّص والنتيجة. */
export const PAGE_FORMS: CountForms = {
  one: 'صفحة واحدة',
  two: 'صفحتان',
  many: 'صفحات',
  accusative: 'صفحة',
  singular: 'صفحة',
}

export const SPLIT_LABEL: Readonly<Record<PageSplit, string>> = {
  multi: 'متعدّد الصفحات',
  single: 'صفحة واحدة',
}

/** هامش الصفحة من كل جهة — ثلث بوصة: يبقى المحتوى داخل منطقة الطباعة الآمنة لأغلب الطابعات. */
export const PAGE_MARGIN = 24

/**
 * أقصى تكبير: 0.75 نقطة لكل بكسل، أي 96 بكسلًا في البوصة.
 *
 * لقطة عنصرٍ صغير (400 بكسل) تُمطّ لتملأ عرض A4 فتخرج ضبابية مكبَّرة ثلاث مرّات. والسقف يُبقيها بحجمها
 * الطبيعي على الشاشة، ويُصغِّر الكبيرة وحدها.
 */
export const MAX_SCALE = 0.75

/** نافذة البحث عن الفراغ: ثُمن الصفحة قبل حدّها المثالي. أوسع منها يهدر الصفحات، وأضيق يفوّت الفراغ. */
export const BREAK_WINDOW = 0.125

/** أقلّ طول لشريطٍ هادئ يُقطع فيه — صفٌّ هادئ منفرد قد يكون قمّة حرفٍ مصقولة الحواف لا فراغًا. */
export const MIN_QUIET_RUN = 4

export interface PageBox {
  readonly width: number
  readonly height: number
}

export function pageBox(size: PageSizeId, orientation: PageOrientation): PageBox {
  const { width, height } = PAGE_SIZES[size]
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  return orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short }
}

/** الاتجاه الأنسب لصورة: الأعرض من طولها أفقية. افتراضٌ في النافذة يغيّره المستخدم. */
export function orientationFor(width: number, height: number): PageOrientation {
  return width > height ? 'landscape' : 'portrait'
}

/** جزءٌ من الصورة موضوعٌ على صفحة واحدة. */
export interface ImageWindow {
  /** أوّل صفّ من الصورة يظهر على الصفحة. */
  readonly top: number
  /** عدد صفوف الصورة الظاهرة. */
  readonly rows: number
  /** نقاطٌ لكل بكسل. */
  readonly scale: number
  /** يسار الصورة بالنقاط من يسار الصفحة — فضاء الصفحة فيزيائي كفضاء الصورة. */
  readonly x: number
  /** أعلى المحتوى بالنقاط من أعلى الصفحة. */
  readonly y: number
}

/** النقاط لكل بكسل في وضعٍ ما — بسقف `MAX_SCALE`. */
export function scaleFor(
  imageWidth: number,
  imageHeight: number,
  box: PageBox,
  split: PageSplit,
): number {
  const contentWidth = box.width - PAGE_MARGIN * 2
  const contentHeight = box.height - PAGE_MARGIN * 2
  const fitWidth = contentWidth / imageWidth
  const fit = split === 'single' ? Math.min(fitWidth, contentHeight / imageHeight) : fitWidth
  return Math.min(fit, MAX_SCALE)
}

/** صفوف الصورة التي تتّسع لها صفحةٌ واحدة بهذا المقياس. */
export function rowsPerPage(scale: number, box: PageBox): number {
  return Math.max(1, Math.floor((box.height - PAGE_MARGIN * 2) / scale))
}

/**
 * يختار صفّ القطع بين `earliest` و`ideal` — أو `ideal` حين لا فراغ.
 *
 * يُقرأ للخلف من الحدّ المثالي، فأوّل شريطٍ هادئ طوله `MIN_QUIET_RUN` فأكثر هو أقربها إليه (أقلّ صفحةٍ
 * مهدورة). والقطع في **منتصف** الشريط: يتوزّع الفراغ على الصفحتين، فلا يلتصق سطرٌ بحافّة الورقة.
 */
export function pickBreak(
  quiet: (row: number) => boolean,
  earliest: number,
  ideal: number,
): number {
  // `high` أسفل الشريط الجاري (أكبر صفوفه)، و`-1` حين لا شريط. والصفّ `earliest - 1` حارسٌ يُغلق آخر شريط.
  let high = -1
  for (let row = ideal - 1; row >= earliest - 1; row--) {
    if (row >= earliest && quiet(row)) {
      if (high < 0) high = row
      continue
    }
    if (high >= 0) {
      const low = row + 1
      const length = high - low + 1
      if (length >= MIN_QUIET_RUN) return low + Math.floor(length / 2)
      high = -1
    }
  }
  return ideal
}

/** فرقٌ أدنى منه في أيّ قناة ليس انتقالًا — ضجيج ضغطٍ وتنعيمٌ لا حدّ عنصر. */
const TRANSITION_DELTA = 12

/**
 * هل هذا الصفّ هادئ؟ — عدد الانتقالات اللونية بين بكسلين متجاورين.
 *
 * صفٌّ يمرّ بسطر نصّ فيه مئات الانتقالات (كل جذع حرف انتقالان)، وصفٌّ في فراغٍ بين سطرين فيه صفرٌ أو
 * حدود بطاقات وأعمدة: بضعة انتقالات لا تكسر شيئًا. فالعتبة `max(8, width/200)` تقبل حدود ثلاث بطاقات
 * متجاورة وترفض أقصر كلمة.
 */
export function isQuietRow(rgba: Uint8ClampedArray, width: number, row: number): boolean {
  const limit = Math.max(8, Math.floor(width / 200))
  const base = row * width * 4
  let transitions = 0
  for (let x = 1; x < width; x++) {
    const i = base + x * 4
    const j = i - 4
    if (
      Math.abs(rgba[i]! - rgba[j]!) > TRANSITION_DELTA ||
      Math.abs(rgba[i + 1]! - rgba[j + 1]!) > TRANSITION_DELTA ||
      Math.abs(rgba[i + 2]! - rgba[j + 2]!) > TRANSITION_DELTA
    ) {
      transitions++
      if (transitions > limit) return false
    }
  }
  return true
}

/** يختار صفّ القطع لنافذةٍ بين صفّين — يُحقن لأن قراءة البكسلات عمل الصفحة لا هذا الملفّ. */
export type BreakFinder = (earliest: number, ideal: number) => Promise<number>

/**
 * نوافذ الصورة على الصفحات.
 *
 * `single` نافذة واحدة بالصورة كلّها. و`multi` نوافذ بعرض المحتوى، كلٌّ منها حتى الحدّ المثالي أو قبله
 * بما يختاره `findBreak` داخل `BREAK_WINDOW` — ولا يُقبل منه ما يقع خارجها ولا ما لا يتقدّم: قاطعٌ معيب
 * يُنتج حلقةً لا تنتهي أو صفحةً بصفرِ صفوف، والقصّ هنا يمنعهما مهما أعاد.
 */
export async function planImagePages(
  imageWidth: number,
  imageHeight: number,
  box: PageBox,
  split: PageSplit,
  findBreak?: BreakFinder,
): Promise<ImageWindow[]> {
  const scale = scaleFor(imageWidth, imageHeight, box, split)
  const contentWidth = box.width - PAGE_MARGIN * 2
  const x = PAGE_MARGIN + (contentWidth - imageWidth * scale) / 2
  const y = PAGE_MARGIN

  if (split === 'single') return [{ top: 0, rows: imageHeight, scale, x, y }]

  const perPage = rowsPerPage(scale, box)
  const window = Math.floor(perPage * BREAK_WINDOW)
  const pages: ImageWindow[] = []
  let top = 0
  while (top < imageHeight) {
    const ideal = top + perPage
    if (ideal >= imageHeight) {
      pages.push({ top, rows: imageHeight - top, scale, x, y })
      break
    }
    const earliest = Math.max(top + 1, ideal - window)
    const found = findBreak ? await findBreak(earliest, ideal) : ideal
    const cut = Number.isFinite(found)
      ? Math.min(ideal, Math.max(earliest, Math.round(found)))
      : ideal
    pages.push({ top, rows: cut - top, scale, x, y })
    top = cut
  }
  return pages
}

/**
 * عدد صفحات الصورة قبل الخبز — للملخّص في النافذة.
 *
 * **حدٌّ أدنى لا عددٌ نهائي:** القطع في الفراغ يسبق الحدّ المثالي بما لا يتجاوز ثُمن الصفحة، فقد يُضيف
 * صفحةً في أطول اللقطات. والرقم النهائي تعرضه شاشة النتيجة من الملفّ المُنتَج.
 */
export function estimateImagePages(
  imageWidth: number,
  imageHeight: number,
  options: PdfLayoutOptions,
): number {
  if (options.split === 'single') return 1
  const box = pageBox(options.size, options.orientation)
  const scale = scaleFor(imageWidth, imageHeight, box, options.split)
  return Math.max(1, Math.ceil(imageHeight / rowsPerPage(scale, box)))
}

/** مقاس بكسلات صفحة نصّية مرسومة — ضعف النقاط (144 نقطة في البوصة): حادّةٌ مطبوعةً بلا ملفٍّ ثقيل. */
export const TEXT_PAGE_DENSITY = 2

export function textPagePixels(box: PageBox): { readonly width: number; readonly height: number } {
  return {
    width: Math.round(box.width * TEXT_PAGE_DENSITY),
    height: Math.round(box.height * TEXT_PAGE_DENSITY),
  }
}

/** نافذة صفحةٍ نصّية: الصورة تملأ الصفحة كلّها بلا هامش — الهامش مرسومٌ داخلها. */
export function fullPageWindow(box: PageBox, pixelWidth: number, pixelHeight: number): ImageWindow {
  return { top: 0, rows: pixelHeight, scale: box.width / pixelWidth, x: 0, y: 0 }
}
