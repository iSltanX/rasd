/**
 * ما يفرضه كل هدفٍ من قيمٍ في البيان — مصدرٌ واحد يقرؤه `manifest.config.ts` (يبني) و`scripts/verify-dist.mjs` (يقارن
 * المبنيّ حرفًا). منفصلٌ عن `manifest.config.ts` لأن ذاك يستورد `@crxjs/vite-plugin` ولا يُستورد في Node خارج محمِّل Vite،
 * وفحص الحزمة يجري في Node العادي.
 *
 * جدول الفروق في `Docs/Browsers/Architecture.md` §4.4.
 */

/** الحدّ الأدنى لكروم — `minimum_chrome_version` في بيان `chromium` وحده (Firefox لا معنى له فيه). */
export const CHROMIUM_MIN_VERSION = '116'

/**
 * `browser_specific_settings` لـFirefox — يُشحَن في بيانه وحده (لا يُشحن في Chromium ما لا يقرؤه).
 *
 * - `gecko.id` إلزامي للتوقيع في MV3 و**دائم**: لا يُغيَّر بعد أوّل توقيع (قرار المالك 2026-10-02) — تغييره إضافةٌ جديدة
 *   بمستخدمين جدد لا تحديث. ويثبّته `tests/unit/build/manifest-targets.test.ts` حرفًا.
 * - `strict_min_version` 140 لأن موافقة جمع البيانات المضمَّنة تُعرض منه (وهي ESR 140).
 * - `data_collection_permissions` إلزامي للإضافات الجديدة منذ 2025-11-03: لا شيء مطلوب، والاختياريان يقابلان خدمتَي
 *   الإرسال بتأكيد المستخدم (ADR 0046). **وفئاتها تُراجَع على تعريفات Mozilla قبل التقديم** (SS6) — الإشعار الذي يرسله
 *   GitHub يحمل رابط الصفحة وعنوانها وملاحظات المستخدم، ويخرج الرمز في ترويسة `Authorization`.
 * - `gecko_android` قِيس لا افتُرض (`web-ext lint` 10.7.0): `strict_min_version` في `gecko` يسري على Firefox لأندرويد أيضًا،
 *   ولم يعرف `data_collection_permissions` قبل 142 — فسقط تحذير `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`. ومفتاحه
 *   بحدٍّ أدنى 142 هو ما يطلبه المدقّق، ولا يمسّ سطح المكتب. أندرويد خارج نطاق الدعم المعلَن (لا دعم بلا حرّاس)، فالمفتاح
 *   تصحيحُ تصريحٍ لا ادّعاءُ دعم. (وأثبت المراجع من شيفرة المدقّق أنه يقرأ `gecko_android` ثمّ يرجع إلى `gecko`.)
 *
 * ونوع CRXJS لا يعرف `gecko_android` ويرفض الحرفيةَ الطازجة بفحص الخصائص الزائدة؛ فهو ثابتٌ يمرّ بنيويًّا.
 */
export const FIREFOX_SETTINGS = {
  gecko: {
    id: 'rasd@bysltan.com',
    strict_min_version: '140.0',
    data_collection_permissions: {
      required: ['none' as const],
      optional: ['technicalAndInteraction' as const, 'websiteContent' as const],
    },
  },
  gecko_android: { strict_min_version: '142.0' },
}
