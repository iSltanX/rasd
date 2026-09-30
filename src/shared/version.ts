/**
 * أرقام نسخ الإضافة — بصيغة Chrome: من رقم إلى أربعة أرقام صحيحة بنقاط (`1` · `1.2.3.4`).
 *
 * **مقارنةٌ رقمية لا نصّية.** `'1.10.0' > '1.9.0'` خطأ في مقارنة النصوص، وصحيحٌ هنا: كل مقطع
 * يُقارَن عددًا، والمقطع الغائب صفر (`1.2` = `1.2.0`). وهي التي تقرّر «ترقية لنسخة أعلى» في
 * `background/install-flow.ts` — فإعادة تحميل الإضافة بالنسخة نفسها (سبب `update` أيضًا) لا تعرض
 * «ما الجديد».
 */

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/

/** هل النصّ رقم نسخة بصيغة Chrome؟ */
export function isVersion(value: string): boolean {
  return VERSION_PATTERN.test(value)
}

/**
 * سالب إن كانت `a` أقدم، وموجب إن كانت أحدث، وصفر إن تساوتا. النسخة غير الصالحة ترمي: قرار
 * «أحدث أم لا» على قيمة مجهولة تخمين، والمستدعي يقرّر ما يفعل بها.
 */
export function compareVersions(a: string, b: string): number {
  if (!isVersion(a) || !isVersion(b)) throw new Error(`رقم نسخة غير صالح: ${a} · ${b}`)
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 4; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
