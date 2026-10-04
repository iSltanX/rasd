# اتفاقية ترخيص المستخدم النهائي — رصد (EULA)

> **نصّ قانوني خاصّ برصد** يُلصق في حقل EULA في لوحة **Opera Add-ons** ولوحة **Firefox Add-ons** (واجهة AMO تعرض `has_eula`)، ويصلح
> أصلًا لصفحة على موقع المالك. النسخة الإنجليزية هي **النصّ الملزِم للمتاجر**؛ والعربية **مرجعية للمالك** تطابقها بندًا ببند
> (يحرس التطابقَ العددي `tests/unit/store-materials.test.ts`). **لا يُنشر ولا يُرسَل لأي متجر الآن** — التقديم بأمر المالك وحده (SS10).
>
> **ما بُني عليه — لا ما افتُرض:**
>
> | الواقع في المستودع                                                                                                | أثره في النصّ                                                                                           |
> | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
> | `"license": "UNLICENSED"` في `package.json`، ولا ملفّ LICENSE، والمستودع عامّ للاطّلاع (منذ 2026-10-04) بلا ترخيص | رصد **برمجية مغلقة**: ترخيص استعمال محدود للمستخدم، لا ترخيص مصدر مفتوح ولا حقّ إعادة توزيع أو تعديل    |
> | README: «© 2026 — جميع الحقوق محفوظة»، والمطوّر «سلطان — Sultan» (bysltan.com)                                    | الجهة المرخِّصة «سلطان» مطوّر رصد، وحقوقه محفوظة                                                        |
> | `THIRD_PARTY_LICENSES.txt` في الحزمة (MIT وISC وOFL-1.1 …)                                                        | مكوّنات الطرف الثالث تبقى بتراخيصها ولا يقيّدها هذا النصّ                                               |
> | [`Docs/Privacy.md`](../Privacy.md) و[`privacy-policy.md`](privacy-policy.md)                                      | الخصوصية بالإحالة إلى السياسة لا بتكرارها؛ لا حساب، «الوضع المحلّي فقط» افتراضي، وخدمتان اختياريتان فقط |
> | حزمة المصدر تُرفع لمراجعي AMO وOpera ولا تُنشر ([`source-README.md`](source-README.md))                           | البند 3 يقول إنها للمراجعة وحدها ولا تمنح ترخيصًا                                                       |
>
> **متعمَّد الغياب** (لأنه غير موجود في رصد أو قرارٌ لم يُتّخذ): رسوم أو اشتراك أو حساب أو إعلانات أو قياس استعمال؛ **وقانون واجب
> التطبيق ومحكمة** — لم يحدّدهما المالك، والنصّ يحفظ حقوق المستهلك الإلزامية في بلده بدل اختيار قانونٍ نيابةً عنه (قرارٌ اختياري
> للمالك: إن أراد تحديد قانون ومحكمة أضاف بندًا). **وهذا النصّ مسوَّدة معدّة بعناية لا استشارة قانونية؛ يراجعه المالك (أو محامٍ) قبل
> التقديم.**
>
> - **البريد الرسمي للدعم والتواصل:** `isultanby@gmail.com` (قرار المالك 2026-10-02).
> - **التاريخ والنسخة:** سريان 2 أكتوبر 2026 · النسخة 1.0 — كتاريخ سياسة الخصوصية. وتغيير النصّ يرفع رقم النسخة وتاريخه.

## النصّ الإنجليزي — للمتاجر (Binding text)

```text eula-en
Rasd — End-User License Agreement
Effective 2 October 2026 · Version 1.0

This agreement is between you and Sultan, the developer of Rasd ("the developer", "we"; bysltan.com), and governs your use of the Rasd browser extension ("Rasd"), including the updates the developer publishes through the extension store. By installing or using Rasd you accept this agreement. If you do not accept it, do not install or use Rasd.

1. Ownership
Rasd — its code, interface, design, text, name, logo and the packaged extension — is owned by the developer and protected by copyright and other intellectual-property law. All rights not expressly granted in this agreement are reserved. Rasd is proprietary software; it is not open-source software. Third-party libraries and fonts included in Rasd remain under their own licences, listed in THIRD_PARTY_LICENSES.txt inside the package, and nothing in this agreement limits the rights those licences give you for those components.

2. Licence to use
The developer grants you a personal, non-exclusive, non-transferable, revocable licence to install Rasd in the browsers you use and to use it, for personal or professional work, to inspect, measure, compare and capture web pages and to keep the results in a library on your own device.

3. Restrictions
Except where applicable law allows it despite this restriction, or where the developer has given you written permission, you may not: (a) copy, sell, resell, rent, lease, sublicense or redistribute Rasd or any part of it, including by publishing it in any store or website; (b) modify Rasd, create derivative works from it, or use its code, design or branding to build another product; (c) reverse engineer, decompile or try to extract source code from Rasd; (d) remove or alter ownership or licence notices; (e) use Rasd to break the law or to violate the rights of others; or (f) use the name or logo of Rasd in a way that suggests endorsement by, or confusion with, the developer. The source package that the developer submits to store reviewers is provided only so that they can verify the build; it does not grant you any licence.

4. Your content and the pages you capture
What you capture, annotate, export or save with Rasd remains yours; Rasd claims no ownership of it and no licence to it. Rasd is a tool that works on the pages you choose. You are responsible for having the right to capture, keep and share the content of those pages, for following applicable law and the terms of the sites where you use Rasd, and for what you choose to send in a report.

5. Privacy and data
Rasd needs no account. Your library and settings stay on your device. "Local only" mode is on by default, and while it is on Rasd sends no network request. Rasd has two optional connections, which work only after you turn off "Local only" and confirm, having reviewed exactly what will be sent: opening an issue in your own GitHub repository with your own token, and "Report a problem", which sends a report to the developer. What is handled, why, and how to have it deleted is described in the Rasd privacy policy at https://www.bysltan.com/rasd/privacy, which applies together with this agreement; if the two differ on personal data, the privacy policy prevails. Your use of GitHub is governed by GitHub's own terms. Reports you send are used to investigate and fix the problem you describe.

6. Browser permissions
Rasd asks only for the permissions described in its store listing. Optional permissions are requested from your own action, and you can withdraw them at any time from your browser's extension settings.

7. Updates and changes
The extension store or your browser may update Rasd automatically. The developer may change, add or remove features, or stop offering Rasd, and is not obliged to provide maintenance or support, although support is offered on a best-effort basis (see section 12). An updated version is licensed under the version of this agreement published with it. If you do not accept a changed agreement, uninstall Rasd.

8. No warranty
To the maximum extent permitted by law, Rasd is provided "as is" and "as available", without warranties of any kind, including warranties of merchantability, fitness for a particular purpose and non-infringement. The developer does not promise that Rasd will work on every website or browser version, or without errors or interruption. Measurements, colour readings and comparison scores are produced automatically and may differ from the source design or from other tools; check them before relying on them for an important decision.

9. Limitation of liability
To the maximum extent permitted by law, the developer is not liable for indirect, incidental, special or consequential damages, or for loss of data, profits or business, arising from your use of or inability to use Rasd. Your library is stored on your own device, so keep your own backups (Rasd can export a backup). The developer's total liability for any claim relating to Rasd is limited to the amount you paid the developer for Rasd, which is zero if you paid nothing. Nothing in this agreement excludes or limits liability that cannot be excluded or limited by law, including for fraud or intentional misconduct.

10. Term and termination
This agreement applies from when you install or first use Rasd and ends when you uninstall it. The developer may end your licence if you breach this agreement. On termination you must stop using Rasd and remove all copies of it. Files you exported or downloaded remain yours. Sections 1, 3, 4, 8, 9, 10 and 11 continue to apply after termination.

11. Stores and third parties
You obtain Rasd through a browser extension store, which has its own terms. This agreement is between you and the developer only. The store operator and the browser vendor are not parties to it and are not responsible for Rasd, for its maintenance or support, or for any warranty or claim relating to it. Names of other products and companies belong to their owners, and Rasd is not affiliated with or endorsed by them.

12. General and contact
If any part of this agreement is found unenforceable, the rest remains in force. This agreement and the privacy policy are the whole agreement between you and the developer about Rasd. You may not assign this agreement; the developer may assign it to a successor of Rasd. Nothing in this agreement limits any mandatory consumer-protection rights you have in your country of residence.
Questions, support and legal notices: isultanby@gmail.com. You can also use Settings → About → "Report a problem" inside Rasd.
```

## النصّ العربي — مرجعيّ للمالك

```text eula-ar
رصد — اتفاقية ترخيص المستخدم النهائي
سارية من 2 أكتوبر 2026 · النسخة 1.0

هذه الاتفاقية بينك وبين سلطان، مطوّر رصد («المطوّر»، «نحن»؛ bysltan.com)، وتحكم استعمالك لإضافة المتصفّح رصد («رصد»)، ومنه التحديثات التي ينشرها المطوّر عبر متجر الإضافات. بتثبيتك رصد أو استعمالها فإنك تقبل هذه الاتفاقية. وإن لم تقبلها فلا تثبّت رصد ولا تستعملها.

1. الملكية
رصد — شيفرتها وواجهتها وتصميمها ونصوصها واسمها وشعارها والحزمة المجمَّعة للإضافة — مملوكة للمطوّر ومحمية بحقوق المؤلف وبقية أنظمة الملكية الفكرية. وكل حقٍّ لم تمنحه هذه الاتفاقية صراحةً محفوظ. رصد برمجية مملوكة وليست مفتوحة المصدر. والمكتبات والخطوط الخارجية المضمَّنة فيها تبقى بتراخيصها هي، المسرودة في THIRD_PARTY_LICENSES.txt داخل الحزمة، ولا يقيّد شيءٌ في هذه الاتفاقية ما تمنحك تلك التراخيص من حقوق في تلك المكوّنات.

2. ترخيص الاستعمال
يمنحك المطوّر ترخيصًا شخصيًّا غير حصري وغير قابل للتحويل وقابلًا للسحب لتثبيت رصد في المتصفّحات التي تستعملها واستعمالها، لعملك الشخصي أو المهني، في فحص صفحات الويب وقياسها ومقارنتها والتقاطها وحفظ النتائج في مكتبة على جهازك أنت.

3. القيود
ما لم يسمح النظام المطبَّق بخلافه رغم هذا القيد، أو يأذن لك المطوّر كتابةً، فلا يجوز لك: (أ) نسخ رصد أو أي جزء منها أو بيعها أو إعادة بيعها أو تأجيرها أو ترخيصها من الباطن أو إعادة توزيعها، ومنه نشرها في أي متجر أو موقع؛ (ب) تعديلها أو إنشاء أعمال مشتقة منها أو استعمال شيفرتها أو تصميمها أو علامتها في بناء منتج آخر؛ (ج) الهندسة العكسية أو فكّ التجميع أو محاولة استخراج الشيفرة المصدرية منها؛ (د) إزالة إشعارات الملكية أو الترخيص أو تغييرها؛ (هـ) استعمالها في مخالفة النظام أو انتهاك حقوق الآخرين؛ (و) استعمال اسم رصد أو شعارها بما يوحي بتزكية من المطوّر أو يلبس به. وحزمة المصدر التي يرسلها المطوّر إلى مراجعي المتاجر مقدَّمة ليتحقّقوا من البناء وحده، ولا تمنحك أي ترخيص.

4. محتواك والصفحات التي تلتقطها
ما تلتقطه أو تعلّق عليه أو تصدّره أو تحفظه بواسطة رصد يبقى لك؛ ولا تدّعي رصد ملكيته ولا ترخيصًا فيه. ورصد أداة تعمل على الصفحات التي تختارها أنت. وأنت المسؤول عن أن يكون لك الحق في التقاط محتوى تلك الصفحات وحفظه ومشاركته، وعن التزام النظام وشروط المواقع التي تستعمل رصد عليها، وعمّا تختار إرساله في بلاغ.

5. الخصوصية والبيانات
لا تحتاج رصد حسابًا. ومكتبتك وإعداداتك تبقى على جهازك. و«الوضع المحلّي فقط» مفعَّل افتراضيًّا، وما دام مفعَّلًا فلا ترسل رصد أي طلب شبكة. وفي رصد اتصالان اختياريان لا يعملان إلا بعد أن تُطفئ «الوضع المحلّي فقط» وتؤكّد وقد راجعتَ ما سيُرسَل بالضبط: فتح مشكلة (Issue) في مستودع GitHub الخاص بك برمزك أنت، و«أبلغ عن مشكلة» الذي يرسل بلاغًا إلى المطوّر. وما يُعالَج ولماذا وكيف يُحذف مشروحٌ في سياسة خصوصية رصد على https://www.bysltan.com/rasd/privacy، وهي تسري مع هذه الاتفاقية؛ وإن اختلفتا في البيانات الشخصية فالغلبة لسياسة الخصوصية. واستعمالك GitHub محكوم بشروط GitHub نفسها. وتُستعمل البلاغات التي ترسلها للتحقيق في المشكلة التي وصفتها وإصلاحها.

6. صلاحيات المتصفّح
لا تطلب رصد إلا الصلاحيات الموصوفة في قائمتها بالمتجر. والصلاحيات الاختيارية تُطلب من فعلٍ منك، ويمكنك سحبها في أي وقت من إعدادات الإضافات في متصفّحك.

7. التحديثات والتغييرات
قد يحدّث متجر الإضافات أو متصفّحك رصد تلقائيًّا. وللمطوّر أن يغيّر الميزات أو يضيف أو يزيل منها، أو يتوقّف عن تقديم رصد، وهو غير ملزَم بالصيانة ولا بالدعم، وإن كان الدعم مقدَّمًا بأقصى جهد (انظر البند 12). والنسخة المحدَّثة مرخَّصة بنسخة هذه الاتفاقية المنشورة معها. وإن لم تقبل اتفاقية معدَّلة فأزل رصد.

8. لا ضمان
بأقصى ما يسمح به النظام، تُقدَّم رصد «كما هي» و«كما تتوافر»، دون أي ضمان من أي نوع، ومنه ضمانات الصلاحية للتسويق والملاءمة لغرض معيّن وعدم الانتهاك. ولا يَعِد المطوّر بأن تعمل رصد على كل موقع أو إصدار متصفّح، أو بلا أخطاء أو انقطاع. والقياسات وقراءات الألوان ونسب المقارنة تُنتَج آليًّا وقد تختلف عن التصميم الأصلي أو عن أدواتٍ أخرى؛ فتحقّق منها قبل الاعتماد عليها في قرارٍ مهم.

9. حدّ المسؤولية
بأقصى ما يسمح به النظام، لا يكون المطوّر مسؤولًا عن الأضرار غير المباشرة أو العارضة أو الخاصة أو التبعية، ولا عن فقد البيانات أو الأرباح أو الأعمال، الناشئة عن استعمالك رصد أو عجزك عن استعمالها. ومكتبتك مخزَّنة على جهازك أنت، فاحتفظ بنسخك الاحتياطية (يمكن لرصد تصدير نسخة احتياطية). ومسؤولية المطوّر الكلية عن أي مطالبة تتعلق برصد محدودة بما دفعتَه للمطوّر مقابل رصد، وهو صفر إن لم تدفع شيئًا. ولا يستثني شيءٌ في هذه الاتفاقية مسؤوليةً لا يجوز استثناؤها أو تحديدها نظامًا، ومنها الاحتيال والتعمّد.

10. المدّة والإنهاء
تسري هذه الاتفاقية من تثبيتك رصد أو أول استعمال لها وتنتهي بإزالتها. وللمطوّر إنهاء ترخيصك إن أخللتَ بها. وعند الإنهاء عليك التوقف عن استعمال رصد وإزالة كل نسخها. والملفات التي صدّرتَها أو نزّلتَها تبقى لك. وتستمر البنود 1 و3 و4 و8 و9 و10 و11 بعد الإنهاء.

11. المتاجر والأطراف الثالثة
تحصل على رصد عبر متجر إضافات للمتصفّح له شروطه الخاصة. وهذه الاتفاقية بينك وبين المطوّر وحده. ومشغّل المتجر وشركة المتصفّح ليسا طرفًا فيها ولا مسؤولين عن رصد ولا عن صيانتها ودعمها ولا عن أي ضمان أو مطالبة تتعلق بها. وأسماء المنتجات والشركات الأخرى لأصحابها، ورصد غير تابعة لها ولا مزكّاة منها.

12. أحكام عامة والتواصل
إن تبيّن أن جزءًا من هذه الاتفاقية غير نافذ بقي الباقي نافذًا. وهذه الاتفاقية وسياسة الخصوصية هما الاتفاق الكامل بينك وبين المطوّر بشأن رصد. ولا يجوز لك التنازل عن هذه الاتفاقية؛ وللمطوّر التنازل عنها لمن يخلفه في رصد. ولا يقيّد شيءٌ فيها أي حقوق إلزامية لحماية المستهلك تثبت لك في بلد إقامتك.
للأسئلة والدعم والإشعارات القانونية: isultanby@gmail.com. ويمكنك أيضًا استعمال الإعدادات ← «عن رصد» ← «أبلغ عن مشكلة» داخل رصد.
```
