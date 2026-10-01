# نطاق الإصدار 1.0

> قرارات المالك المعتمدة في 2026-09-29. **كل المراحل وكل الإضافات المقترحة تدخل الإصدار
> 1.0.** المالك اعتمد توصيات المساعد في كل ما يحتاج قراره، ثم قرّر ألّا يؤجَّل شيء.
> جرد عناصر الواجهة المعطَّلة والشاشات وإطاراتها أُضيفا في [`STAGES/02`](../STAGES/02.md). وفي
> 2026-09-30 اعتمد المالك ثلاث إضافات أخرى في 1.0 بعد 04، تُرسم في [31](../STAGES/31.md) وتُبنى في
> [32](../STAGES/32.md) و[33](../STAGES/33.md) و[34](../STAGES/34.md).

## داخل الإصدار 1.0

| البند                                                             | القرار                                                                                                                                                  | تملكه                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| شعار جديد                                                         | يُعتمد الاتجاه الذي يرشّحه المساعد بلا انتظار موافقة؛ وللمالك طلب تعديل بعد العرض                                                                       | [01](../STAGES/01.md)                           |
| أيقونة شريط الأدوات بحالتين، ونسخة أحادية اللون                   | معتمد                                                                                                                                                   | [01](../STAGES/01.md) ثمّ [03](../STAGES/03.md) |
| صفحة «عن رصد»، وورقة الاختصارات                                   | معتمد                                                                                                                                                   | [02](../STAGES/02.md) ثمّ [03](../STAGES/03.md) |
| التذييل                                                           | معتمد. رابط المستودع مخفيّ ما دام المستودع خاصًّا                                                                                                       | [02](../STAGES/02.md) ثمّ [03](../STAGES/03.md) |
| تغيير الاختصار يسري على جلسة نشطة                                 | يُوصَل                                                                                                                                                  | [03](../STAGES/03.md)                           |
| الكثافة                                                           | تسري على كل الصفحات                                                                                                                                     | [03](../STAGES/03.md)                           |
| PDF وتقرير المقارنة                                               | معتمد                                                                                                                                                   | [05](../STAGES/05.md)                           |
| `capture.saveLocation`                                            | يُوصَل بتدفّق التنزيلات                                                                                                                                 | [05](../STAGES/05.md)                           |
| دليل الخطوات وقوالب التصدير                                       | معتمد                                                                                                                                                   | [06](../STAGES/06.md)                           |
| نسخة احتياطية للمكتبة، والتخزين الدائم، ومؤشّر مساحة حقيقي        | معتمد                                                                                                                                                   | [07](../STAGES/07.md)                           |
| استيراد الإعدادات وتصديرها، وحذف كل البيانات، وإعادة الضبط بتأكيد | معتمد                                                                                                                                                   | [07](../STAGES/07.md)                           |
| قفل المكتبة                                                       | معتمد                                                                                                                                                   | [08](../STAGES/08.md)                           |
| التأهيل، و«ما الجديد» بعد التحديث                                 | معتمد                                                                                                                                                   | [09](../STAGES/09.md)                           |
| المشاركة المحلّية                                                 | معتمد                                                                                                                                                   | [10](../STAGES/10.md)                           |
| تكامل GitHub، وإنفاذ `localOnly`                                  | معتمد. اتّصال `api.github.com` بعد تفعيل المستخدم فقط                                                                                                   | [11](../STAGES/11.md) · [12](../STAGES/12.md)   |
| **الإبلاغ عن مشكلة**                                              | معتمد. القناة: نقطة استقبال على نطاق المالك تفتح Issue في مستودع دعم خاصّ؛ لا حساب على المستخدم، ولا نشر للعامة                                         | [13](../STAGES/13.md)                           |
| تدقيق تباين الصفحة كاملة                                          | معتمد                                                                                                                                                   | [14](../STAGES/14.md)                           |
| فحص دوري للاعتماديات                                              | معتمد                                                                                                                                                   | [25](../STAGES/25.md)                           |
| أتمتة الإصدار، وملفّ تراخيص الطرف الثالث                          | معتمد                                                                                                                                                   | [27](../STAGES/27.md)                           |
| روابط الدعم، ورابط بعد إلغاء التثبيت، وتجهيز متجر Edge            | معتمد                                                                                                                                                   | [28](../STAGES/28.md)                           |
| الملاحظة المرتبطة بالعنصر القابلة لإعادة الفحص                    | معتمد. المشكلة سجلّ مستقلّ يشير إلى الملاحظة ويحمل العنصر والقيمتين ونوع الفحص؛ حالاتها مفتوحة · تحتاج تحققًا · محلولة؛ وإعادة الفحص بطلب المستخدم وحده | [31](../STAGES/31.md) ثمّ [32](../STAGES/32.md) |
| حزمة التسليم للمطوّر ومساعد البرمجة                               | معتمد. Markdown وJSON من بيانات المشكلة، فوق تصديرات المطوّر القائمة، محلّية بلا شبكة                                                                   | [31](../STAGES/31.md) ثمّ [33](../STAGES/33.md) |
| استثناء المناطق المتغيّرة من المقارنة البصرية                     | معتمد. المناطق تُحفظ مع المرجع، والنسبة على المناطق المهمّة وحدها، ومناطق العنصر تعمل على المقاسات كلّها                                                | [31](../STAGES/31.md) ثمّ [34](../STAGES/34.md) |

## جرد عناصر الواجهة المعطَّلة أو التي بلا محرّك

جُرد في 2026-09-29 بالأمر:
`grep -rn 'aria-disabled\|state="disabled"\|قيد التطوير' src/pages src/ui` — ثلاثة عشر
سطرًا. كل سطر له صفّ، وكل عنصر له مرحلة تبنيه أو قرار بحذفه. إطار كل عنصر في
[`Docs/Design.md`](Design.md).

| الموضع                                        | العنصر                                | المصير                                                                        | تملكه                                           |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/pages/settings/parts/PrivacyTab.tsx:225` | صفّ «شفّر المكتبة المحلية»            | يُبنى. يبقى «قريبًا» حتى مرحلته                                               | [08](../STAGES/08.md)                           |
| `src/pages/settings/parts/PrivacyTab.tsx:228` | تلميح الصفّ نفسه «افتحها برمز»        | يتبع صفّه                                                                     | [08](../STAGES/08.md)                           |
| `src/pages/settings/parts/PrivacyTab.tsx:235` | صفّ «احذف كل البيانات»                | يُبنى بتأكيد مزدوج بعد النسخة الاحتياطية                                      | [07](../STAGES/07.md)                           |
| `src/pages/settings/parts/PrivacyTab.tsx:239` | تلميح الصفّ نفسه                      | يتبع صفّه                                                                     | [07](../STAGES/07.md)                           |
| `src/pages/compare/parts/Header.tsx:46`       | تلميح «تصدير التقرير»                 | يتبع زرّه                                                                     | [05](../STAGES/05.md)                           |
| `src/pages/compare/parts/Header.tsx:47`       | زرّ «تصدير التقرير»                   | يُبنى: تقرير المقارنة                                                         | [05](../STAGES/05.md)                           |
| `src/pages/compare/parts/Header.tsx:52`       | زرّ «التقط الفرق»                     | يُبنى مع التقرير: صورة الفرق تُحفظ لقطةً في المكتبة. كان بلا مالك مكتوب       | [05](../STAGES/05.md)                           |
| `src/pages/export/ExportModal.tsx:62`         | ضابط «تضمين قائمة الملاحظات»          | يُبنى مع PDF والتقرير                                                         | [05](../STAGES/05.md)                           |
| `src/pages/export/ExportModal.tsx:180`        | صيغة **PDF** المعطَّلة                | تُبنى                                                                         | [05](../STAGES/05.md)                           |
| `src/pages/export/ExportModal.tsx:180`        | صيغة **SVG** المعطَّلة                | **مستبعدة** — تُحذف من التصميم ثمّ من الواجهة                                 | [02](../STAGES/02.md) ثمّ [03](../STAGES/03.md) |
| `src/pages/export/ExportModal.tsx:245`        | ضابط «تضمين بيانات الصفحة»            | يُبنى مع البيانات الوصفية للتصدير. كان بلا مالك مكتوب                         | [05](../STAGES/05.md)                           |
| `src/pages/export/ExportModal.tsx:245`        | ضابط «خلفية شفافة»                    | **يُحذف:** اللقطة صورة صفحة معتمة، ولا محرّك له في أي مرحلة                   | [02](../STAGES/02.md) ثمّ [03](../STAGES/03.md) |
| `src/pages/export/ExportModal.tsx:245`        | ضابط «دمج التعليقات في الصورة»        | **يُحذف ضابطًا:** الدمج دائم (ADR 0015)، فيصير سطر معلومة لا مفتاحًا معطَّلًا | [02](../STAGES/02.md) ثمّ [03](../STAGES/03.md) |
| `src/pages/onboarding/index.html:15`          | صفحة التأهيل النائبة                  | تُبنى                                                                         | [09](../STAGES/09.md)                           |
| `src/ui/components/Menu/Menu.tsx:45` و`:100`  | آلية `aria-disabled` في مكوّن القائمة | ليست عنصرًا معطَّلًا: آلية عامّة يستعملها أي بند. تبقى                        | —                                               |

## الشاشات وإطاراتها المعتمدة

لكل شاشة إطارها الأساسي بوضعَيه. حالاتها كلّها في القسم المسمّى من
[`Docs/Design.md`](Design.md) §5، وتغطيتها في §6. «قائمة» تعني أن محرّكها مبنيّ، وتطبيق التصميم
عليها في [03](../STAGES/03.md).

| الشاشة                      | الإطار                       | الداكن                                                                                    | الفاتح                                                                                    | محرّكها                                       | حالاتها                                   |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| النافذة                     | `popup / default`            | [`50:13`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=50-13)         | [`86:1726`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1726)     | قائمة                                         | Design.md §5 «النافذة»                    |
| الالتقاط                    | `capture / area-select`      | [`59:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=59-2)           | [`310:26505`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-26505) | قائمة                                         | Design.md §5 «الالتقاط»                   |
| المحرّر                     | `editor / annotating`        | [`70:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=70-2)           | [`310:27639`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-27639) | قائمة                                         | Design.md §5 «المحرّر»                    |
| القياس                      | `measure / two-elements`     | [`64:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=64-2)           | [`310:29105`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29105) | قائمة                                         | Design.md §5 «القياس»                     |
| الفحص                       | `inspect / element-selected` | [`62:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=62-2)           | [`310:29794`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-29794) | قائمة                                         | Design.md §5 «الفحص وتدقيق التباين»       |
| تدقيق تباين الصفحة          | `contrast-audit / results`   | [`303:20977`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=303-20977) | [`310:30171`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-30171) | [14](../STAGES/14.md)                         | Design.md §5 «الفحص وتدقيق التباين»       |
| الألوان                     | `colors / sampling`          | [`65:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=65-2)           | [`310:31472`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-31472) | قائمة                                         | Design.md §5 «الألوان»                    |
| المقارنة                    | `compare / two-captures`     | [`127:196`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=127-196)     | [`310:33040`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33040) | قائمة                                         | Design.md §5 «المقارنة وتقريرها»          |
| تقرير المقارنة              | `compare / report`           | [`291:12538`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=291-12538) | [`310:33162`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-33162) | [05](../STAGES/05.md)                         | Design.md §5 «المقارنة وتقريرها»          |
| المكتبة                     | `library / grid`             | [`66:20`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=66-20)         | [`86:1825`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=86-1825)     | قائمة                                         | Design.md §5 «المكتبة والأدلّة»           |
| دليل الخطوات                | `guide / editor`             | [`304:1506`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=304-1506)   | [`310:35507`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-35507) | [06](../STAGES/06.md)                         | Design.md §5 «المكتبة والأدلّة»           |
| المشاريع                    | `projects / overview`        | [`72:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-2)           | [`310:40776`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-40776) | قائمة                                         | Design.md §5 «المشاريع»                   |
| التصدير، ومعه PDF           | `export / modal`             | [`73:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-2)           | [`310:43256`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-43256) | قائمة · PDF في [05](../STAGES/05.md)          | Design.md §5 «التصدير»                    |
| المشاركة المحلّية           | `share / modal`              | [`73:361`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=73-361)       | [`310:45733`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-45733) | [10](../STAGES/10.md)                         | Design.md §5 «المشاركة المحلّية»          |
| اتّصالات GitHub             | `integrations / connections` | [`72:488`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=72-488)       | [`310:48570`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48570) | [11](../STAGES/11.md) · [12](../STAGES/12.md) | Design.md §5 «التكاملات وgithub»          |
| مؤلِّف البلاغ               | `github / issue-compose`     | [`293:19271`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-19271) | [`310:48731`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-48731) | [12](../STAGES/12.md)                         | Design.md §5 «التكاملات وgithub»          |
| الإعدادات                   | `settings / capture`         | [`68:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-2)           | [`310:51416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51416) | قائمة                                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| البيانات: نسخ واستيراد وحذف | `settings / data`            | [`282:1318`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1318)   | [`310:51522`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51522) | [07](../STAGES/07.md)                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| ورقة الاختصارات             | `shortcuts / sheet`          | [`292:1691`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=292-1691)   | [`310:51577`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51577) | [03](../STAGES/03.md)                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| عن رصد                      | `settings / about`           | [`282:1656`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=282-1656)   | [`310:51551`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-51551) | [03](../STAGES/03.md)                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| الإبلاغ عن مشكلة            | `support / form`             | [`293:4050`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-4050)   | [`310:52134`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52134) | [13](../STAGES/13.md)                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| ما الجديد                   | `whats-new / card`           | [`293:5723`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-5723)   | [`310:52615`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-52615) | [09](../STAGES/09.md)                         | Design.md §5 «الإعدادات والبيانات والدعم» |
| الخصوصية                    | `privacy / controls`         | [`68:416`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=68-416)       | [`310:58971`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-58971) | قائمة                                         | Design.md §5 «الخصوصية وقفل المكتبة»      |
| قفل المكتبة                 | `lock / setup`               | [`293:16890`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=293-16890) | [`310:59085`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=310-59085) | [08](../STAGES/08.md)                         | Design.md §5 «الخصوصية وقفل المكتبة»      |
| التأهيل                     | `onboarding / step-1`        | [`74:2`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=74-2)           | [`308:40`](https://www.figma.com/design/Gr0dOsmjcVBcaX9M1slf5m/Rasd?node-id=308-40)       | [09](../STAGES/09.md)                         | Design.md §5 «التأهيل»                    |

## يُحذف من التصميم والواجهة

| البند                                                 | السبب                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| صيغة SVG                                              | مستبعدة بقرار سابق، واللقطات صور نقطية. لا تُعاد تلقائيًّا            |
| Linear وJira وSlack وFigma في شاشة التكاملات والمحرّر | خارج النطاق. يبقى GitHub وحده                                         |
| كتلة «كشف تلقائي» في لوحة الحجب                       | لا محرّك لها ولا مرحلة تملكها                                         |
| الحساب و«مساحة عمل محلية» وعدّاد «1.8 / 5 GB»         | لا حساب ولا مزامنة في المنتج. يحلّ محلّ العدّاد مؤشّر المساحة الحقيقي |
| ضابط «خلفية شفافة» في نافذة التصدير                   | لا محرّك له ولا قيمة: اللقطة صورة صفحة معتمة                          |
| صلاحية `desktopCapture`                               | ميزتها (التقاط نافذة المتصفّح) خارج النطاق — أُسقطت في `STAGES/23`    |
| صلاحية `tabs`                                         | لا مستهلك لها مقيسًا — أُسقطت في `STAGES/23` (ADR 0055)               |

## خارج الإصدار 1.0

| البند                                                     | السبب                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| روابط المشاركة السحابية · Linear · Jira · التعليق الجماعي | تحتاج خادمًا وأسرارًا لا تُضمَّن بأمان في إضافة               |
| التقاط نافذة المتصفّح                                     | يتجاوز حدود إضافة المتصفّح                                    |
| إعادة فحص المشكلات دوريًّا أو في الخلفية بلا طلب المستخدم | صلاحيات وخصوصية: الفحص بإيماءة وحدها في 1.0                   |
| مقارنة بصرية آلية مجدولة للصفحات                          | نموذج [34](../STAGES/34.md) يخدمها بلا تغيير، والمشغِّل لـ1.1 |
| الواجهة الإنجليزية                                        | ADR 0022 — رصد عربي فقط. قائمة المتجر وحدها بلغتين            |

إعادة أيٍّ منها قرار مالك يُكتب هنا.

## ما يبقى بأمر المالك الصريح وقت تنفيذه

هذه **أفعال** لا قرارات نطاق، فلا يشملها التفويض العامّ:

- تقديم الإضافة لمتجر Chrome أو Edge ونشرها — [30](../STAGES/30.md).
- إنشاء قناة استقبال البلاغات: حساب Cloudflare، ومستودع الدعم الخاصّ، وإدخال المفتاح.
- تغيير خصوصية المستودع. رابطه في التذييل يبقى مخفيًّا حتى يعيد 200 لزائر غير مسجَّل.
- حذف بيانات، أو إعادة كتابة تاريخ Git.
