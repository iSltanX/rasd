/**
 * مفردات الإحداثيات — ثلاثة فضاءات ومحوّلاتها، بيانات ورياضيات خالصة.
 *
 * **لماذا في `shared/` لا في `content/`:** بُنيت هذه المفردات في المرحلة 6
 * داخل `content/coords.ts` لأن مستهلكها الوحيد يومها كان الطبقة داخل الصفحة.
 * المرحلة 8 أضافت مستهلكًا ثانيًا — `modules/capture/` — ومنطق خالص لا يجوز
 * أن يعتمد على طبقة تشغيل. النقل يصحّح اتجاه الاعتماد؛ و`content/coords.ts`
 * يعيد تصدير كل ما هنا، فلا مستورد قائم يتغيّر.
 *
 * ما بقي هناك هو ما **يقرأ نافذة حيّة** (`readSpace`, `watchDpr`) — وهو
 * بطبيعته شأن طبقة تشغيل لا منطق خالص.
 *
 * ثلاثة فضاءات، لكل واحد مرجع مختلف، وخلطها هو مصدر أخطاء القصّ والتجميع
 * التي يصعب تتبّعها لأنها تظهر متأخّرة وبانحراف صغير:
 *
 * | الفضاء     | المرجع              | يُستخدم في                          |
 * | ---------- | ------------------- | ----------------------------------- |
 * | `viewport` | زاوية النافذة       | رسم الطبقة، أحداث المؤشِّر           |
 * | `page`     | أصل المستند         | حفظ التحديد، الالتقاط الكامل        |
 * | `device`   | بكسل الجهاز (× dpr) | القصّ، التجميع، عيّنة البكسل         |
 *
 * **الوسم مزدوج عمدًا.** حقل `space` موجود وقت التشغيل لا وقت الترجمة فقط،
 * لأن هذه القيم تعبر حدود الرسائل بين الإطارات وservice worker: الوسم
 * الوهمي (phantom brand) يُمحى عند التسلسل فيعطي ثقة كاذبة على السلك.
 * ويُسنَد إليه `NoInfer` في الدوالّ ثنائية المعامل، وإلا استنتج TypeScript
 * اتحاد الفضاءين وقَبِل خلطهما بصمت.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها ولا تلمس `chrome.*`.
 */

/** فضاء إحداثيات. */
export type Space = 'viewport' | 'page' | 'device'

export interface Point<S extends Space = Space> {
  readonly space: S
  readonly x: number
  readonly y: number
}

export interface Rect<S extends Space = Space> {
  readonly space: S
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type ViewportPoint = Point<'viewport'>
export type PagePoint = Point<'page'>
export type DevicePoint = Point<'device'>
export type ViewportRect = Rect<'viewport'>
export type PageRect = Rect<'page'>
export type DeviceRect = Rect<'device'>

// ─────────────────────────────────────────────────────────────────
// بنّاؤون
// ─────────────────────────────────────────────────────────────────

const point = <S extends Space>(space: S, x: number, y: number): Point<S> => ({ space, x, y })
const rect = <S extends Space>(
  space: S,
  x: number,
  y: number,
  width: number,
  height: number,
): Rect<S> => ({ space, x, y, width, height })

export const viewportPoint = (x: number, y: number): ViewportPoint => point('viewport', x, y)
export const pagePoint = (x: number, y: number): PagePoint => point('page', x, y)
export const devicePoint = (x: number, y: number): DevicePoint => point('device', x, y)

export const viewportRect = (x: number, y: number, w: number, h: number): ViewportRect =>
  rect('viewport', x, y, w, h)
export const pageRect = (x: number, y: number, w: number, h: number): PageRect =>
  rect('page', x, y, w, h)
export const deviceRect = (x: number, y: number, w: number, h: number): DeviceRect =>
  rect('device', x, y, w, h)

/**
 * `DOMRect` → مستطيل نافذة.
 *
 * `getBoundingClientRect()` ترجع دائمًا إحداثيات **فيزيائية** نسبةً إلى
 * زاوية النافذة، بصرف النظر عن اتجاه العنصر أو وضع كتابته — ولهذا يقع
 * ناتجها في فضاء `viewport` مباشرةً بلا أي تصحيح اتجاه.
 */
export const fromDomRect = (r: DOMRect | DOMRectReadOnly): ViewportRect =>
  viewportRect(r.x, r.y, r.width, r.height)

// ─────────────────────────────────────────────────────────────────
// لقطة البيئة
// ─────────────────────────────────────────────────────────────────

/**
 * قراءة واحدة متّسقة لحالة النافذة.
 *
 * تُؤخَذ لقطة وتُمرَّر إلى المحوِّلات بدل قراءة `window` داخل كل تحويل:
 * سلسلة تحويلات تقرأ التمرير مرّتين قد تلتقط قيمتين مختلفتين إن حدث تمرير
 * بينهما، فتنتج هندسة غير متّسقة مع نفسها.
 *
 * النوع هنا (بيانات خالصة) ودالّة قراءته في `content/coords.ts` (تلمس نافذة).
 */
export interface CoordSpace {
  readonly scrollX: number
  readonly scrollY: number
  /** مقاس النافذة المرئية بالبكسل المنطقي (بلا شريط التمرير). */
  readonly layoutWidth: number
  readonly layoutHeight: number
  /** مقاس المستند كاملًا. */
  readonly pageWidth: number
  readonly pageHeight: number
  readonly dpr: number
  /**
   * اتجاه **إطار العرض** لا اتجاه الجذر وحده.
   *
   * Chrome ينشر `direction` من `<body>` إلى إطار العرض، بينما
   * `getComputedStyle(documentElement).direction` يبقى يبلّغ قيمة الجذر
   * نفسه. وصفحة عربية نموذجية تكتب `<body dir="rtl">` مع `<html>` بلا
   * اتجاه — فقراءة الجذر وحده تصنّفها LTR وتقلب حساب حدود التمرير كلّه.
   */
  readonly rtl: boolean
  /**
   * تحجيم مفروض على الجذر (`transform` على `<html>`).
   *
   * الإزاحة الخالصة (`translate`) لا تشوّه الهندسة إطلاقًا — تجعل الجذر
   * containing block فحسب. ما يشوّهها هو التحجيم أو الدوران أو الميل.
   * لذلك يُخزَّن المعامل المفكّك لا راية «متحوَّل» واحدة تُنذر خطأً على
   * أشيع الحالات وأقلّها ضررًا.
   */
  readonly rootScaleX: number
  readonly rootScaleY: number
  /** هل يشوّه تحوّل الجذر القياس فعلًا (تحجيم ≠ 1 أو دوران أو ميل). */
  readonly rootDistorted: boolean
}

// ─────────────────────────────────────────────────────────────────
// المحوِّلات
// ─────────────────────────────────────────────────────────────────

export function viewportToPage(p: ViewportPoint, s: CoordSpace): PagePoint {
  return pagePoint(p.x + s.scrollX, p.y + s.scrollY)
}

export function pageToViewport(p: PagePoint, s: CoordSpace): ViewportPoint {
  return viewportPoint(p.x - s.scrollX, p.y - s.scrollY)
}

export function viewportRectToPage(r: ViewportRect, s: CoordSpace): PageRect {
  return pageRect(r.x + s.scrollX, r.y + s.scrollY, r.width, r.height)
}

export function pageRectToViewport(r: PageRect, s: CoordSpace): ViewportRect {
  return viewportRect(r.x - s.scrollX, r.y - s.scrollY, r.width, r.height)
}

export function viewportToDevice(p: ViewportPoint, s: CoordSpace): DevicePoint {
  return devicePoint(p.x * s.dpr, p.y * s.dpr)
}

export function deviceToViewport(p: DevicePoint, s: CoordSpace): ViewportPoint {
  return viewportPoint(p.x / s.dpr, p.y / s.dpr)
}

export function pageToDevice(p: PagePoint, s: CoordSpace): DevicePoint {
  return devicePoint(p.x * s.dpr, p.y * s.dpr)
}

export function deviceToPage(p: DevicePoint, s: CoordSpace): PagePoint {
  return pagePoint(p.x / s.dpr, p.y / s.dpr)
}

/**
 * مستطيل نافذة → مستطيل جهاز، **بتقريب الحوافّ لا الأصل والمقاس**.
 *
 * القاعدة تُهمّ عند القصّ: لو قُرِّب الأصل والعرض كلٌّ على حدة، أعطى
 * مستطيلان متلاصقان حافّتين مختلفتين فظهر خيط شفّاف بينهما بعد التجميع.
 * تقريب الحافّتين يضمن أن حافّة أحدهما **هي** حافّة الآخر بالضبط.
 */
export function viewportRectToDevice(r: ViewportRect, s: CoordSpace): DeviceRect {
  const x1 = Math.round(r.x * s.dpr)
  const y1 = Math.round(r.y * s.dpr)
  const x2 = Math.round((r.x + r.width) * s.dpr)
  const y2 = Math.round((r.y + r.height) * s.dpr)
  return deviceRect(x1, y1, x2 - x1, y2 - y1)
}

export function pageRectToDevice(r: PageRect, s: CoordSpace): DeviceRect {
  const x1 = Math.round(r.x * s.dpr)
  const y1 = Math.round(r.y * s.dpr)
  const x2 = Math.round((r.x + r.width) * s.dpr)
  const y2 = Math.round((r.y + r.height) * s.dpr)
  return deviceRect(x1, y1, x2 - x1, y2 - y1)
}

// ─────────────────────────────────────────────────────────────────
// عمليات داخل فضاء واحد
// ─────────────────────────────────────────────────────────────────

/**
 * `NoInfer` على المعامل الثاني يمنع استنتاج اتحاد الفضاءين.
 *
 * بدونه يستنتج TypeScript من موقعَي الاستدلال `S = 'page' | 'viewport'`،
 * ويقبل `intersect(pageRect(…), viewportRect(…))` بلا شكوى — وهو بالضبط
 * الخطأ الذي وُجد هذا النوع لمنعه.
 */
export function intersect<S extends Space>(a: Rect<S>, b: Rect<NoInfer<S>>): Rect<S> | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return null
  return rect(a.space, x1, y1, x2 - x1, y2 - y1)
}

/** مستطيل من نقطتين — السحب قد يبدأ من أي ركن. */
export function normalizeRect<S extends Space>(a: Point<S>, b: Point<NoInfer<S>>): Rect<S> {
  return rect(
    a.space,
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
  )
}

export function contains<S extends Space>(r: Rect<S>, p: Point<NoInfer<S>>): boolean {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height
}

/**
 * هل يسع مستطيلٌ نافذةً بمقاسها، وهل هو داخلها الآن؟
 *
 * ثلاث حالات لا حالتان، لأنّ «غير مرئي كاملًا» يتفرّع بحسب ما يصلحه التمرير:
 *
 * - `'contained'`: مرئي كاملًا الآن — لا فعل مطلوب.
 * - `'off-screen'`: يسع النافذة (لا يتجاوز ارتفاعها ولا عرضها) لكنه خارج
 *   حدودها جزئيًا أو كليًا — تمرير واحد يحلّه.
 * - `'oversized'`: أطول من النافذة أو أعرض منها — **لا تمرير يجعله مرئيًا
 *   كاملًا دفعة واحدة**. هذا هو الشرط الذي يُحيل إلى مسار التقاط مختلف
 *   (البند 51 في `Rasd_Plan.md §6`؛ الإحالة نفسها مؤجَّلة إلى المرحلة 22).
 *
 * القياس بفضاء `viewport` وحده منطقي: هو الفضاء الذي تُقاس فيه النافذة.
 */
export type ViewportFit = 'contained' | 'off-screen' | 'oversized'

export function viewportFit(r: ViewportRect, viewportWidth: number, viewportHeight: number): ViewportFit {
  if (r.height > viewportHeight || r.width > viewportWidth) return 'oversized'
  const withinX = r.x >= 0 && r.x + r.width <= viewportWidth
  const withinY = r.y >= 0 && r.y + r.height <= viewportHeight
  return withinX && withinY ? 'contained' : 'off-screen'
}
