/**
 * مَن أرسل الرسالة — التعريف الواحد لـ«صفحتنا» في الخلفية.
 *
 * كان تعريفان: `issues.ts` يقارن بأصل الإضافة، و`lifecycle.ts` بالمخطّط `chrome-extension://` مكتوبًا — وأصل صفحة
 * الإضافة في Firefox `moz-extension://<uuid>`، فكانت صفحتنا هناك تُعامَل سكربتَ محتوى. قِيس في Firefox 157 (2026-10-02):
 * صفحة إضافة تطلب تبويب الموقع صراحةً رُدّت `not-injectable`، وبهذا التعريف التُقط تبويب الموقع. تعريفٌ واحد لا يفترق.
 */
import type { MessageContext } from '@/shared/messaging'

/**
 * مصدر الرسالة صفحةٌ من **هذه** الإضافة — النافذة أو صفحةٌ منها في تبويب — لا سكربت محتوى (أصله أصل الصفحة)
 * ولا إضافةٌ أخرى. الأصل يملؤه المتصفّح من إطار المُرسِل، لا الحمولة.
 *
 * **بالنصّ لا بـ`new URL(…).origin`.** `getURL('')` هو `‹المخطّط›://‹المضيف›/` في كل محرّك، و`sender.origin` هو نفسه
 * بلا الشرطة الأخيرة. أمّا `URL.origin` لمخطّطٍ غير خاصّ فـ`"null"` بنصّ المعيار: Firefox يعطي أصله لمخطّطه وحده
 * و`"null"` لـ`chrome-extension:`، وNode يعطي `"null"` للاثنين (قِيس 2026-10-02). والمقارنة بـ`"null"` تصدّق إطارًا
 * أصله معتم، وتجعل الاختبار يقارن `"null"` بـ`"null"` فيمرّ بلا معنى.
 */
export function fromExtensionPage(context: MessageContext): boolean {
  return context.origin !== undefined && `${context.origin}/` === chrome.runtime.getURL('')
}
