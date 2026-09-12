/**
 * تنزيل نصٍّ ملفًّا — من داخل صفحة المستخدم مباشرةً، بلا `chrome.downloads`.
 *
 * **البوّابة بلا صلاحية عمدًا.** `chrome.downloads` غير متاحة لسكربت
 * المحتوى أصلًا (هي واجهة صفحات الإضافة والـservice worker وحدهما)، وقاعدة
 * البناء تمنع `content/` من استيراد `pages/` (‏`architecture-boundaries.test.ts`)
 * فلا سبيل لإعادة استعمال `src/pages/export/deliver.ts`. ومسار المرساة
 * (`<a download>`) هو **الفرع الاحتياطي نفسه** الذي يسلكه ذلك الملفّ حين
 * تُرفَض صلاحية `downloads` — هنا يُسلَك دائمًا لا احتياطًا: ملفّات المطوّر
 * (‏CSS·JSON·DTCG) نصوصٌ صغيرة لا تحتاج حوار «حفظ باسم» ولا صلاحيةً اختيارية.
 *
 * تصديرات المطوّر (`modules/colour/export.ts` و`modules/style-export/`) —
 * الوحدة 19.2.
 */

/**
 * **لا ترمي — على نمط `navigator.clipboard.writeText().catch(...)` الذي تحلّ
 * محلّه.** الصفحة المضيفة قد تحجب إنشاء عناصر أو تُفسد `URL.createObjectURL`
 * (سياسات أمان صارمة، إطارٌ مقيَّد)؛ وتصديرٌ فشل تنزيله لا يجوز أن يُسقط
 * معالج النقرة بخطأ غير مُمسوك — نفس الدرس من مسار الحافظة المجاور تمامًا.
 */
export function saveTextFile(
  filename: string,
  mime: string,
  text: string,
  doc: Document = document,
): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = doc.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    doc.body.appendChild(a)
    a.click()
    a.remove()
    // إبطالٌ مؤجَّل: كروم يبدأ التنزيل من نداء `click()` لا ينتظر عودته.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch {
    console.warn('[رصد] تعذّر تنزيل الملفّ.')
  }
}
