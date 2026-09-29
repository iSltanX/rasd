/**
 * قراءة معرِّفَي اللقطتين من رابط الصفحة — منطق خالص لا DOM.
 *
 * الصفحة تُفتح بـ`compare/index.html?a=<captureId>&b=<captureId>` (رسالة
 * `page/open`، `background/lifecycle.ts`) — لا آلية أخرى، ولا سلك اختيار من
 * المكتبة في هذه الدفعة (نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`)، الاعتماديات).
 */

export interface CompareQuery {
  readonly a: string | null
  readonly b: string | null
}

/** يقرأ `a`/`b` من `location.search` — يُمرَّر نصًّا صريحًا كي يبقى الملفّ خاليًا من DOM. */
export function parseCompareQuery(search: string): CompareQuery {
  const params = new URLSearchParams(search)
  return { a: params.get('a'), b: params.get('b') }
}
