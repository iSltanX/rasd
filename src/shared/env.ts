/**
 * ثوابت البيئة.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها — تُفرض هذه القاعدة
 * بـ`import-x/no-restricted-paths` في `eslint.config.js`.
 */

/** بناء تطوير — يُزال كل ما خلفه من الحزمة في الإنتاج. */
export const IS_DEV: boolean = import.meta.env.DEV

/**
 * نسخة الإضافة، مقروءة من البيان المحمَّل فعلًا لا محقونة وقت البناء —
 * فلا يمكن أن تفترق النسخة المعروضة عن نسخة الحزمة.
 */
export const VERSION: string = chrome.runtime.getManifest().version

/** اسم المنتج كما يظهر للمستخدم. */
export const PRODUCT_NAME = 'رصد' as const

/** سابقة كل مفاتيح التخزين والرسائل — تمنع التصادم داخل الصفحة المضيفة. */
export const NAMESPACE = 'rasd' as const

/**
 * هل نعمل داخل نافذة تصفّح خاص؟
 *
 * البيان يعلن `incognito: "split"`، فالإضافة تحصل على نسخة منفصلة تمامًا هناك.
 * هذه الدالة هي البدائية التي تعتمد عليها طبقة التخزين في المرحلة 3 لمنع
 * الحفظ التلقائي، وشاشة الخصوصية في المرحلة 20.
 *
 * `chrome.extension.inIncognitoContext` غير متاح في كل السياقات، فالغياب
 * يُعامَل كـ«ليس تصفّحًا خاصًا» — وهو الافتراض الصحيح لأن السياقات التي
 * تفتقده (مثل الـservice worker في الوضع العادي) ليست خاصة أصلًا.
 */
export function isIncognitoContext(): boolean {
  return chrome.extension?.inIncognitoContext ?? false
}
