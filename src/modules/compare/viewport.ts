/**
 * تصنيف عرض العرض الحيّ إلى أحد المقاسات الأربعة — `Docs/Rasd_Ar.md §8.6`
 * («مقارنة أحجام الشاشات»)، تُستهلَك من `compare / viewports` (`127:315`).
 *
 * **الحدود هنا قرارٌ هندسيّ موثَّق لا رقمٌ من الخطّة**: لا `Docs/Engineering.md`
 * ولا `Rasd_Ar.md` يذكران أرقامًا (تعليق `content/index.ts` السابق كان
 * صريحًا بذلك). المصدر الوحيد المتاح ثلاث نقاط في إطار Figma `127:315`
 * نفسه — بطاقاته الأربع تحمل قياسات فعلية: `375×812` بتصنيف «هاتف»،
 * `1024×768` بتصنيف «لوحي»، `1440×900` بتصنيف «سطح المكتب»، **و`1920×1080`
 * بتصنيف «مخصّص» لا «سطح المكتب»** — أي أن سطح المكتب نطاقٌ محدود من
 * الأعلى لا "كل ما فوق اللوحي"، وهذا ما يحسم حدّه العلوي هنا (بين 1440
 * و1920، اختير 1600 رقمًا مستديرًا موثَّقًا لا مشتقًّا بصيغة).
 *
 * `phone`/`tablet` بلا حدّ سفلي (نطاقهما مفتوح للأسفل) — لا دليل في
 * الإطار على حالة أضيق من هاتف تحتاج تصنيفًا خامسًا، والمخطَّط أصلًا أربعة
 * فقط (`Viewport` في `shared/storage/schema.ts` منذ المرحلة 3).
 *
 * دالّة محضة — بلا DOM ولا `chrome.*`، على غرار بقيّة `modules/compare/*`.
 */

import type { Viewport } from '@/shared/storage/schema'

/** الحدّان العلويان لـ`phone` و`tablet` — أدناهما ينتقل للفئة التالية. */
const PHONE_MAX_WIDTH = 767
const TABLET_MAX_WIDTH = 1279
/** الحدّ العلوي لـ`desktop` — عنده وما فوقه: `custom` (انظر تعليق الرأس، `1920×1080`). */
const DESKTOP_MAX_WIDTH = 1599

/** يصنِّف عرضًا حيًّا بالبكسل CSS إلى أحد المقاسات الأربعة. عرضٌ غير موجب يُعامَل كـ`phone` — لا قياس أضيق ممكن أصلًا. */
export function classifyViewport(width: number): Viewport {
  if (!Number.isFinite(width) || width <= PHONE_MAX_WIDTH) return 'phone'
  if (width <= TABLET_MAX_WIDTH) return 'tablet'
  if (width <= DESKTOP_MAX_WIDTH) return 'desktop'
  return 'custom'
}

/**
 * ترتيب البطاقات في `compare / viewports` — مطابقٌ لترتيب الإطار نفسه
 * حرفيًّا (`127:328`→`127:381`→`127:435`→`127:489`): مخصّص أولًا (مقاس
 * النافذة الحيّ أيًّا كان)، ثم الثلاثة المسمّاة من الأضيق إلى الأوسع.
 */
export const VIEWPORT_ORDER: readonly Viewport[] = ['custom', 'phone', 'tablet', 'desktop']

/** تسميات العربية المعروضة — نفس نصّ الإطار حرفيًّا. */
export const VIEWPORT_LABELS: Readonly<Record<Viewport, string>> = {
  custom: 'مخصّص',
  phone: 'هاتف',
  tablet: 'لوحي',
  desktop: 'سطح المكتب',
}
