# صفحات رصد في موقع المالك — ما يُنشر وكيف يُفعَّل

> ثلاث صفحات تحت `https://www.bysltan.com/rasd/` يحتاجها التقديم ولا يملك المستودع نشرها: الموقع خارجه. **قِيس في
> 2026-10-02:** `https://www.bysltan.com` يعيد 200، والثلاث تعيد 404. فهي في الإضافة خلف ثابتٍ ملتزَم واحد
> (`OWNER_PAGES_LIVE` في [`src/shared/links.ts`](../../src/shared/links.ts)) قيمته `false`، ولا يُعرض رابطٌ إليها ولا
> يُفتح بعد الإزالة حتى تُنشر.

## التفعيل — بالترتيب

1. ينشر المالك الصفحات الثلاث أدناه.
2. تُقاس من جهازٍ غير مسجَّل الدخول، وكلٌّ يعيد `200`:

   ```text
   for p in privacy support uninstall; do curl -s -o /dev/null -w "%{http_code} $p\n" -L https://www.bysltan.com/rasd/$p; done
   ```

3. التزامٌ يقلب `OWNER_PAGES_LIVE` إلى `true`، ومعه الاختباران اللذان يثبتان قيمتها اليوم
   (`tests/unit/background/uninstall-url.test.ts` و`tests/unit/pages/settings/about-section.test.tsx`) — فيصير صفّ
   «سياسة الخصوصية» في «عن رصد» زرًّا يفتحها، ويُضبط رابط ما بعد الإزالة.
4. في [`listing.md`](listing.md): الموقع (Homepage) يصير `https://www.bysltan.com/rasd`، والبنود الثلاثة في
   [`checklist.md`](checklist.md) تُحدَّث بتاريخ القياس.

## 1. `/rasd/privacy` — سياسة الخصوصية

النصّ كاملًا بالعربية والإنجليزية في [`privacy-policy.md`](privacy-policy.md). الشرط الوحيد على الصفحة: أن تُفتح بلا
تسجيل دخول، وأن تحمل تاريخ السريان، وألّا تضيف إليها أداة تتبّع تناقض ما فيها.

## 2. `/rasd/support` — الدعم

```text
الدعم — رصد

أسرع طريق: من داخل رصد. افتح الإعدادات ← «عن رصد» ← «أبلغ عن مشكلة». تكتب ما حدث، وترفق صورة إن شئت وتحجب منها
ما تريد، وتراجع ما سيُرسَل بالضبط قبل أن ترسله. يصلني البلاغ في مستودع دعم خاصّ ولا يُنشر. وإن ظهرت لك رسالة خطأ في
رصد ففيها رابط «أبلغ عن المشكلة» يملأ الأداة ورمز الخطأ عنك.

البلاغ يحتاج أن توقف «الوضع المحلّي فقط» من «الخصوصية». وإن أردت إبقاءه مفعّلًا فانسخ البلاغ نصًّا من النافذة نفسها
وأرسله إليّ من صفحة التواصل في هذا الموقع أو على البريد isultanby@gmail.com.

لحذف بلاغ أرسلته: أرسل بلاغًا جديدًا تكتب فيه «احذف البلاغ #رقمه».

سياسة الخصوصية: https://www.bysltan.com/rasd/privacy
```

```text
Support — Rasd

The fastest way is from inside Rasd: open Settings → About → "Report a problem". Describe what happened, attach an image
if you like and redact anything in it, and review exactly what will be sent before sending. Reports reach a private
support repository and are never published. Error messages in Rasd also carry a "Report the problem" link that fills in
the tool and error code for you.

Sending a report needs "Local only" turned off in Privacy. If you prefer to keep it on, copy the report as text from the
same dialog and send it through the contact page on this site or by email to isultanby@gmail.com.

To delete a report you sent, send a new report saying "delete report #number".

Privacy policy: https://www.bysltan.com/rasd/privacy
```

## 3. `/rasd/uninstall` — بعد الإزالة

يفتحها المتصفّح بعد إزالة رصد، **بالرابط حرفًا بلا استعلام** — فلا تعرف الصفحة من الزائر شيئًا. وشروطها:

- **سؤالٌ واحد اختياري**، ويمكن إغلاق الصفحة بلا جواب.
- لا حقل بريد ولا اسم، ولا معرّف في الرابط ولا ملفّ تعريف ارتباط ولا أداة تحليلات. والجواب نفسه لا يُربط بزائر.
- إن أُرسل الجواب إلى خادم فبطلبٍ واحد بنقرة «أرسل»، وتذكره سياسة الخصوصية قبل أن يعمل.

```text
أزلت رصد — شكرًا لأنك جرّبتها.

سؤالٌ واحد، اختياري: ما الذي جعلك تزيلها؟
○ لم أعد أحتاجها   ○ لم تعمل كما توقّعت   ○ ينقصها ما أحتاجه   ○ الواجهة العربية لا تناسبني   ○ سببٌ آخر
[ أرسل ]   — أو أغلق الصفحة، لا بأس.

بياناتك في رصد مُحيت مع الإضافة. لا نعرف من أنت، ولا نسأل.
```

```text
You removed Rasd — thank you for trying it.

One optional question: why did you remove it?
○ I no longer need it   ○ It didn't work as expected   ○ It's missing something I need   ○ The Arabic interface doesn't suit me   ○ Another reason
[ Send ]   — or just close this page.

Your Rasd data was erased with the extension. We don't know who you are, and we don't ask.
```
