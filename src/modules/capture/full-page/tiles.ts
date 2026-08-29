/**
 * رياضيات البلاطات — أين تُوضَع كل لقطة في القماش، وكم يبلغ ارتفاعه.
 *
 * **المبدأ الحاكم: لا رقم مفترَض.** ثلاثة أرقام يغري افتراضها وكلّها خاطئ
 * مقيسًا في Chrome:
 *
 *   1. `scrollY === y` بعد `scrollTo(0, y)` — **لا**. القانون المقيس
 *      `scrollY = round(y × dpr) / dpr`: طُلب 100.3 فأُعطي 100.5 عند dpr 2،
 *      و1000.5 فأُعطي 1000.4000244 عند dpr 2.5. الفرق نصف بكسل جهاز في كل
 *      بلاطة، ويتراكم.
 *   2. ارتفاع اللقطة = `innerHeight × dpr` — **لا**. `innerHeight` عدد صحيح
 *      مقرَّب فيخطئ حتى بكسلَي جهاز عند التكبير. الارتفاع يؤخذ من الصورة
 *      نفسها.
 *   3. ارتفاع القماش = `scrollHeight × dpr` — **لا**. `scrollHeight` عدد
 *      صحيح، وحدّ التمرير الحقيقي مختلف عنه: قيس حدًّا محسوبًا 5409 بينما
 *      مرّر Chrome فعلًا إلى 5409.200195.
 *
 * فكل رقم هنا يُشتقّ من **مقروء** لا من مطلوب.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/** لقطة بلاطة واحدة، كما وصلت من المتصفّح. */
export interface TileShot {
  /** موضع التمرير **المقروء** بعد الاستقرار، بالبكسل المنطقي. */
  readonly scrollY: number
  /** أبعاد الصورة كما جاءت، بالبكسل الجهازي. */
  readonly width: number
  readonly height: number
}

/**
 * المقياس من الصورة نفسها لا من `devicePixelRatio`.
 *
 * `innerWidth` هو المقام الصحيح لا `visualViewport.width`: الأخير ينكمش مع
 * شريط التمرير الأفقي (قيس 693 ← 678 بينما بقيت اللقطة 1386)، فيعطي مقياسًا
 * منحرفًا 2.2% — أي ≈870 بكسل بعد 29 بلاطة.
 */
export function scaleOf(shot: Pick<TileShot, 'width'>, innerWidth: number): number {
  if (innerWidth <= 0) return 1
  return shot.width / innerWidth
}

/** موضع أعلى البلاطة في القماش، بالبكسل الجهازي. */
export function tileTop(scrollY: number, scale: number): number {
  return Math.round(scrollY * scale)
}

/**
 * ارتفاع القماش، من **آخر موضع تمرير محقَّق** لا من `scrollHeight`.
 *
 * البلاطة الأخيرة تُرسَم عند `tileTop(lastScrollY)` وتمتدّ بارتفاعها
 * الكامل، فقاعها هو قاع الصورة بالضبط. وهذه الصيغة تُنتج **التراكب الصحيح
 * تلقائيًّا**: المتصفّح لا يمرّر أبعد من الحدّ، فالبلاطة الأخيرة تغطّي ما
 * قبلها بمقدار ما قصر عنه — ولا حاجة إلى قصّ صريح ولا إلى تراكب متعمَّد.
 * قيس على 29 بلاطة: تراكب تلقائي 720 بكسل جهاز، والصورة صحيحة بلا خيط ولا
 * فقد.
 */
export function stitchHeight(lastScrollY: number, scale: number, tileHeight: number): number {
  return tileTop(lastScrollY, scale) + tileHeight
}

/**
 * عرض شريط التمرير داخل اللقطة، بالبكسل الجهازي.
 *
 * `captureVisibleTab` يلتقط الشريط ضمن الصورة: قيس `innerWidth × dpr = 2560`
 * بينما `clientWidth × dpr = 2530` — أي 30 بكسل جهاز رمادية على الحافّة.
 * تُقصّ من كل بلاطة قبل الرسم، وإلا ظهر عمود رمادي بطول الصفحة كلّها.
 */
export function gutterOf(innerWidth: number, clientWidth: number, scale: number): number {
  const gutter = Math.round((innerWidth - clientWidth) * scale)
  return gutter > 0 ? gutter : 0
}

/**
 * تكبير القرص يكسر النموذج كلّه.
 *
 * `innerHeight` و`devicePixelRatio` **أعميان** عنه (قيس: بقيا 693 و2 بينما
 * `visualViewport.scale = 2`)، واللقطة تبقى بالأبعاد نفسها لكنّ محتواها
 * مرسوم بمقياس آخر. لا تعويض ممكن، فالصواب الرفض الصريح لا صورة خاطئة.
 *
 * الهامش لأن القيمة عائمة ولا تعود إلى 1 بالضبط بعد إعادة التكبير.
 */
export const PINCH_EPSILON = 1e-3

export function pinchBlocked(visualScale: number): boolean {
  return Math.abs(visualScale - 1) > PINCH_EPSILON
}

/**
 * خطوات التمرير المخطَّطة.
 *
 * تُحسب من `maxScroll` المقروء لا من `scrollHeight`: الأخير عدد صحيح مقرَّب
 * والحدّ الحقيقي كسريّ. والخطوة الأخيرة تُثبَّت عند الحدّ بالضبط فلا تتجاوزه.
 *
 * **خطّة مبدئية لا نهائية**: الصفحة قد تنمو أثناء الالتقاط، فتُعاد الحلقة
 * الحساب عند كل بلاطة من `scrollHeight` الحيّ.
 */
export function planSteps(maxScroll: number, step: number): number[] {
  if (step <= 0) return [0]
  const out: number[] = []
  for (let y = 0; y < maxScroll; y += step) out.push(y)
  // القاع دائمًا: بلا هذا يسقط آخر جزء حين لا يقسم `step` المدى بالتساوي.
  if (out.length === 0 || out[out.length - 1]! < maxScroll) out.push(maxScroll)
  return out
}
