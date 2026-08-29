/**
 * تحييد العناصر الثابتة — السبب الأول للتكرار في كل أدوات هذه الفئة.
 *
 * رأسٌ ثابت يظهر في كل بلاطة فيصير شريطًا مكرَّرًا عبر الصورة كلّها. قيس
 * بعدّ البكسلات من لقطات حقيقية: رأس `sticky` أعطى 12,650 بكسل في أربع
 * بلاطات متتالية، وشريط `fixed` أعطى 62,875 في كلٍّ منها.
 *
 * **وثلاث قواعد كانت في الخطّة وأسقطها القياس:**
 *
 *   1. «تُحوَّل إلى `position: absolute` بموضعها الأصلي» — مرفوض. يتطلّب
 *      حساب الكتلة الحاوية، والصيغة الشائعة تخطئ حتى 9,937px. والبديل
 *      المقيس أبسط وأدقّ: `sticky → relative` و`fixed → display: none`.
 *   2. «في البلاطة الأولى تُترك كما هي» — صحيح للمرساة العلوية وحدها.
 *      شريط مرسًى إلى **الأسفل** يُترك في البلاطة الأولى فيُزرع 89,102 بكسل
 *      من لافتة في وسط صفحة طولها 10,214px. البلاطة تُحدَّد بالمرساة
 *      الهندسية لا برقمها.
 *   3. «امسح كل عنصر `fixed`» — يشمل عناصر **محبوسة** بجدٍّ ذي `transform`
 *      أو `filter` أو `contain`. هذه كتلتها الحاوية ذلك الجدّ لا النافذة،
 *      فتمرّ مع الصفحة كمحتوى عادي ولا تتكرّر — ولمسها يُنتج خطأً بمقدار
 *      إزاحة التمرير.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/** مرساة العنصر في النافذة — تحدّد في أي بلاطة يصحّ ظهوره. */
export type Anchor =
  /** ملتصق بأعلى النافذة — يصحّ في البلاطة الأولى وحدها. */
  | 'top'
  /** ملتصق بأسفل النافذة — يصحّ في البلاطة الأخيرة وحدها. */
  | 'bottom'
  /** يغطّي النافذة من أعلاها إلى أسفلها — يبقى في كل البلاطات. */
  | 'stretch'
  /** عائم في الوسط (دردشة، زرّ «للأعلى») — يُخفى ويُعلَن عدده. */
  | 'float'

/** ما يُفعَل بالعنصر. */
export type Treatment =
  /** لا شيء — محبوس بجدّه فيمرّ مع الصفحة. */
  | 'leave'
  /** `position: relative` — يعيده إلى موضعه المستندي بلا كسر شجرته. */
  | 'unstick'
  /** `display: none` — خارج التدفّق أصلًا فحذفه لا يمسّ التخطيط. */
  | 'hide'

export interface Candidate {
  readonly el: Element
  readonly position: 'fixed' | 'sticky'
  readonly anchor: Anchor
  readonly treatment: Treatment
  /** نصيبه من مساحة النافذة — يُعرَض في قائمة «أخفِ هذه». */
  readonly share: number
}

/** هامش الالتصاق بحافّة النافذة، بالبكسل. */
const EDGE_EPSILON = 2

/** أقلّ تغطية تجعل العنصر «ممتدًّا» عبر النافذة. */
const STRETCH_SHARE = 0.9

/**
 * يصنّف المرساة هندسيًّا لا بقراءة `top`/`bottom`.
 *
 * القراءة النمطية تكذب: عنصر بـ`top: 0` قد يكون مزاحًا بـ`transform`،
 * وعنصر بلا `top` معلن قد يكون ملتصقًا بالأعلى بحكم التدفّق. المستطيل
 * المقيس هو الحقيقة.
 */
export function anchorOf(rect: DOMRectReadOnly, viewportHeight: number): Anchor {
  const nearTop = rect.top <= EDGE_EPSILON
  const nearBottom = viewportHeight - rect.bottom <= EDGE_EPSILON
  const covers = rect.height / viewportHeight

  if (nearTop && nearBottom && covers >= STRETCH_SHARE) return 'stretch'
  if (nearTop) return 'top'
  if (nearBottom) return 'bottom'
  return 'float'
}

/**
 * هل يصحّ ظهور هذا العنصر في هذه البلاطة؟
 *
 * `stretch` وحده يبقى في الكلّ: شريط جانبي `fixed; top:0; bottom:0` يُصنَّف
 * ممتدًّا، وإخفاؤه بعد البلاطة الأولى يفقد 2,139,000 بكسل على صفحة من ثلاث
 * عشرة بلاطة — أي 24 ضعف العيب الذي جاء التصنيف لإصلاحه.
 */
export function showsInTile(anchor: Anchor, tileIndex: number, lastIndex: number): boolean {
  switch (anchor) {
    case 'top':
      return tileIndex === 0
    case 'bottom':
      return tileIndex === lastIndex
    case 'stretch':
      return true
    case 'float':
      return false
  }
}

/**
 * العلاج المشتقّ من الموضع والمرساة.
 *
 * `fixed` يُخفى لأنه خارج التدفّق فحذفه لا يزيح شيئًا. و`sticky` **لا**
 * يُخفى أبدًا: قيس أن إخفاءه يكلّف −60px من ارتفاع الصفحة لأنه في التدفّق.
 */
export function treatmentOf(position: 'fixed' | 'sticky', trapped: boolean): Treatment {
  if (trapped) return 'leave'
  return position === 'sticky' ? 'unstick' : 'hide'
}

/**
 * هل هذا العنصر محبوس بجدٍّ فلا يتكرّر؟
 *
 * **الكشف تجريبي لا بقائمة خصائص.** قيست 22 خاصّية جدّ ضدّ الاختبار
 * الفعلي، فاختلفت النتيجة عن التوثيق الشائع في ثلاث منها على الأقلّ
 * (`contain: size` و`will-change: opacity` لا تحبسان، خلافًا للمتوقَّع).
 * القائمة الساكنة تتقادم مع كل إصدار Chrome؛ والقياس لا يتقادم.
 *
 * الاختبار: قارن مستطيل العنصر عند إزاحتَي تمرير. من لم يتحرّك = محبوس
 * بالنافذة (مرشّح حقيقي)؛ ومن تحرّك = يمرّ مع الصفحة (يُترك).
 */
export function isTrapped(rectBefore: DOMRectReadOnly, rectAfter: DOMRectReadOnly): boolean {
  return Math.abs(rectAfter.top - rectBefore.top) > EDGE_EPSILON
}

/**
 * يصنّف مرشّحًا واحدًا بعد جمع قياساته.
 *
 * تُفصَل عن المسح كي تُختبَر بلا متصفّح: كل مدخلاتها أرقام.
 */
export function classify(
  el: Element,
  position: 'fixed' | 'sticky',
  rect: DOMRectReadOnly,
  viewportHeight: number,
  viewportWidth: number,
  trapped: boolean,
): Candidate {
  const area = viewportHeight * viewportWidth
  return {
    el,
    position,
    anchor: anchorOf(rect, viewportHeight),
    treatment: treatmentOf(position, trapped),
    share: area > 0 ? (rect.width * rect.height) / area : 0,
  }
}
