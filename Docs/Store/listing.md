# قائمة المتجر — Chrome Web Store وMicrosoft Edge Add-ons

> النصوص هنا تُلصق في لوحتي المتجرين كما هي. **لا تقول أكثر ممّا تفعله الإضافة:** كل بندٍ في الوصف يقابله حارس أو
> اختبار في [`features.md`](features.md)، وكل جملة عن البيانات مأخوذة من [`Docs/Privacy.md`](../Privacy.md) ولا تزيد
> عليه. وما لم يُنفَّذ لا يُذكر ولو كان «قريبًا». والحدود (132 حرفًا للوصف القصير، و250–10,000 للوصف الطويل في Edge،
> وسبعة مصطلحات بحث) يحرسها `tests/unit/store-materials.test.ts`.
>
> التقديم نفسه في [`STAGES/30`](../../STAGES/30.md) بأمر المالك وحده.

## الهوية

| الحقل             | القيمة                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- |
| الاسم             | `رصد` بالعربية · `Rasd` بالإنجليزية — من `public/_locales/*/messages.json` (`extName`)      |
| الوصف القصير      | `extDescription` في الملفّين نفسيهما — يقرؤه المتجران من البيان ولا يُحرَّر في اللوحة       |
| اللغة الأساسية    | العربية (`default_locale: "ar"`)، ومعها الإنجليزية                                          |
| الفئة             | Developer Tools (Chrome) · Developer tools (Edge)                                           |
| المحتوى للبالغين  | لا                                                                                          |
| الموقع (Homepage) | `https://www.bysltan.com` — يعيد 200 اليوم؛ ويُستبدل بصفحة رصد حين تُنشر (`owner-pages.md`) |
| الدعم (Support)   | `https://www.bysltan.com/rasd/support` — **ينتظر المالك** (`owner-pages.md`)                |
| سياسة الخصوصية    | `https://www.bysltan.com/rasd/privacy` — **ينتظر المالك**، ونصّها في `privacy-policy.md`    |
| الفيديو           | لا فيديو                                                                                    |

## الغرض الواحد (Single purpose)

```text
Rasd is a visual inspection tool for people who build and review web interfaces: it measures, inspects, compares against a reference and captures the page in the active tab, and keeps that work in a library on the user's device.
```

```text
رصد أداة فحص بصري لمن يبني واجهات الويب ويراجعها: تقيس الصفحة في التبويب النشط وتفحصها وتقارنها بمرجع وتلتقطها، وتحفظ هذا العمل في مكتبة على جهاز المستخدم.
```

## الوصف الطويل — العربية

```text
رصد أداة فحص بصري لمن يبني الواجهات ويراجعها: تقيس وتفحص وتقارن وتلتقط فوق الصفحة نفسها، وتحفظ عملك في مكتبة على جهازك وحده — بلا حساب ولا خادم.

ما تفعله:
• الالتقاط: الجزء الظاهر، أو الصفحة كاملة، أو عنصر، أو منطقة تحدّدها — من نافذة الإضافة أو قائمة الزر الأيمن أو اختصارات لوحة المفاتيح.
• القياس: اختر عنصرين فترى الفجوة بينهما وأبعاد كلٍّ منهما بالبكسل.
• فحص العنصر: الصندوق والخط واللون والإتاحة، وتنزيل أنماطه CSS أو Tailwind أو JSON.
• الألوان: قطّارة من أي نقطة، ولوحة ألوان الصفحة، وتدرّجات كل لون، وتدقيق تباين النصوص في الصفحة كاملة مرتّبًا بالخطورة.
• المقارنة بالمرجع: ضع تصميمًا أو لقطة فوق الصفحة الحيّة — تقسيم وتراكب وشفافية ووميض — مع نسبة فرق البكسلات، واستثناء المناطق المتغيّرة منها، وتقرير مقارنة PDF.
• المحرّر: أسهم وأشكال ونصوص وتعليقات وقصّ، وحجب بالتغطية أو البكسلة أو الضبابية يُخبز في بكسلات الصورة فلا يُستعاد من الملفّ.
• المشكلات: سجّل ملاحظة مربوطة بالعنصر وقيمتيها، وأعد فحصها لاحقًا لتعرف أهي محلولة.
• التصدير والتسليم: PNG وPDF، ودليل خطوات مرقّم بصيغ PDF وZIP وMarkdown وصفحة ويب واحدة، وحزمة تسليم للمطوّر بـMarkdown وJSON، وصفحة مشاركة في ملفّ واحد يُفتح بلا إنترنت.
• المكتبة: مشاريع ووسوم ومفضّلة وبحث، وسلّة محذوفات لثلاثين يومًا، وحذف دوري اختياري، ونسخة احتياطية واستعادة، وقفل برمز.

الخصوصية:
• كل ما تحفظه يبقى على جهازك. «الوضع المحلّي فقط» مفعّل افتراضيًّا، وما دام مفعّلًا لا يخرج من رصد طلب شبكة واحد.
• لا صلاحية دائمة على المواقع: تعمل على الصفحة التي تطلبها عليها بنقرتك أو اختصارك.
• اتّصالان اختياريان فقط، لا يعملان إلا بعد إطفاء «الوضع المحلّي فقط» وبنقرة منك بعد مراجعة ما سيُرسَل:
  – GitHub: لفتح Issue في مستودعك بعد أن تتّصل برمزك. الرمز يُحفظ مشفّرًا على جهازك ولا يُرسَل إلا إلى GitHub.
  – «أبلغ عن مشكلة»: يُرسَل إلى مطوّر رصد ما كتبته، وصورة إن أرفقتها (بعد حجب ما تريد)، ومعلومات تشخيص: إصدار رصد والنظام والمتصفّح ولغة الواجهة. لا يُرسَل رابط الصفحة ولا محتواها ولا مكتبتك ولا إعداداتك. يصل البلاغ إلى مستودع دعم خاصّ لا يُنشر.

الواجهة عربية من اليمين إلى اليسار، بالوضعين الداكن والفاتح.
```

## Long description — English

```text
Rasd is a visual inspection tool for people who build and review web interfaces. Measure, inspect, compare and capture right on the page, and keep your work in a library that stays on your device — no account, no server.

What it does:
• Capture: the visible area, the full page, a single element or a region you draw — from the toolbar popup, the right-click menu or keyboard shortcuts.
• Measure: pick two elements to see the gap between them and the size of each, in pixels.
• Inspect an element: box, type, colour and accessibility, and download its styles as CSS, Tailwind or JSON.
• Colour: an eyedropper for any point, the page's colour palette, shades for each colour, and a full-page text-contrast audit sorted by severity.
• Compare with a reference: lay a design or capture over the live page — split, overlay, opacity and blink — with a pixel-difference score, excluded regions for content that changes, and a PDF comparison report.
• Editor: arrows, shapes, text, comments and crop, plus redaction by cover, pixelate or blur that is baked into the image pixels and cannot be recovered from the file.
• Issues: log a finding tied to an element and its two values, then re-check it later to see whether it is resolved.
• Export and handoff: PNG and PDF; numbered step guides as PDF, ZIP, Markdown or a single web page; a developer handoff package in Markdown and JSON; and a share page in one file that opens offline.
• Library: projects, tags, favourites and search, a 30-day trash, optional automatic cleanup, backup and restore, and a passcode lock.

Privacy:
• Everything you save stays on your device. "Local only" mode is on by default, and while it is on Rasd sends no network request at all.
• No permanent access to websites: it works only on the page where you invoke it with a click or shortcut.
• Two optional connections, both off until you turn off "Local only" and confirm after reviewing exactly what will be sent:
  – GitHub: open an issue in your own repository after connecting your token. The token is stored encrypted on your device and is sent only to GitHub.
  – "Report a problem": sends the developer of Rasd what you wrote, an image if you attach one (after redacting what you choose), and diagnostics — the Rasd version, operating system, browser and interface language. The page address, page content, your library and your settings are never sent. Reports go to a private support repository and are not published.

Language: Rasd's interface is in Arabic, laid out right to left, in dark and light themes. In an English browser the extension name, this description and the keyboard-shortcut names appear in English; the screens themselves are Arabic.
```

## ممارسات البيانات (Privacy practices · Data usage)

الأسئلة كما في لوحة Chrome ولوحة Edge، والجواب مقيسٌ من الشيفرة (`Docs/Privacy.md`). وسياسة المتجر تعدّ ما يُعالَج
محلّيًّا «جمعًا» كذلك (User Data FAQ)، فالجواب يشمل المحلّي والمرسَل معًا.

| الفئة                               | الجواب  | لماذا                                                                                                                                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personally identifiable information | لا      | لا حساب ولا بريد ولا اسم. البلاغ بلا وسيلة تواصل، ومعرّفه عشوائي لكل بلاغ لا يعرّف المستخدم ولا جهازه                                                  |
| Health information                  | لا      | —                                                                                                                                                      |
| Financial and payment information   | لا      | —                                                                                                                                                      |
| Authentication information          | **نعم** | رمز GitHub الذي يلصقه المستخدم إن اتّصل: يُحفظ مشفّرًا (AES-GCM) على الجهاز، ولا يُرسَل إلا في ترويسة `Authorization` إلى `api.github.com`             |
| Personal communications             | لا      | لا قراءة لبريد ولا رسائل. نصّ البلاغ يكتبه المستخدم ليرسله إلى الدعم بنفسه                                                                             |
| Location                            | لا      | لا موقع جغرافي. وصورة البلاغ يُعاد ترميزها فلا تخرج بيانات GPS فيها                                                                                    |
| Web history                         | لا      | لا قراءة لسجلّ التصفّح (`history` محظورة). عنوان الصفحة يُحفظ مع لقطتها في المكتبة المحلّية وحدها، ولا يدخل البلاغ                                     |
| User activity                       | لا      | لا قياس استعمال ولا تتبّع نقرات ولا تقارير أعطال صامتة                                                                                                 |
| Website content                     | **نعم** | لقطات الصفحات ونصوصها وأنماط عناصرها تُعالَج وتُحفظ على الجهاز بطلب المستخدم؛ ولا تغادره إلا حين يرسلها هو إلى GitHub أو يرفق صورةً ببلاغ بعد مراجعتها |

**الإقرارات الثلاثة — نعم لكلٍّ منها:** لا بيع ولا نقل لأطرافٍ ثالثة خارج الحالات المسموحة · لا استعمال ولا نقل لغرضٍ
لا يتّصل بالغرض الواحد · لا استعمال ولا نقل لتقدير الجدارة الائتمانية أو الإقراض.

**وما يقرؤه إنسان:** البلاغ وحده، يقرؤه مطوّر رصد بعد أن يرسله المستخدم بنفسه لهذا الغرض — موافقةٌ صريحة لغرضٍ محدّد
كما تشترط Limited Use. وCloudflare (خادم الاستقبال) وGitHub (مستودع الدعم الخاصّ) مزوّدا خدمة للمطوّر لا مستقبلا بيانات.

## مصطلحات البحث — Edge

سبعة على الأكثر، كلٌّ حتى 30 حرفًا، ومجموعها حتى 21 كلمة.

```text search-terms-ar
لقطة شاشة
قياس المسافات
منتقي الألوان
مقارنة التصميم
فحص العناصر
تباين الألوان
تدقيق الواجهة
```

```text search-terms-en
screenshot
measure spacing
color picker
design comparison
inspect element
contrast checker
UI review
```

## ملاحظات الاعتماد — Edge (Notes for certification)

```text
No account or sign-in is needed. Install, open any https page, click the Rasd toolbar icon and pick a tool (Measure, Inspect, Colour, Compare, Capture). Captures open in the editor and appear in the Library (popup > Library).

Network: "Local only" is on by default, so the extension makes no network request. Two optional features need it turned off (Settings > Privacy):
1. Report a problem (Settings > About > Report a problem): sends a reviewed report to the developer's support endpoint https://app-reports.isultantf.workers.dev, which is live. Reports from reviewers are welcome and are not published.
2. GitHub integration (Settings > Integrations): requires the reviewer's own GitHub personal access token; it only opens an issue in a repository the user chooses after reviewing the content.

The interface is Arabic (right to left). Optional permissions (downloads, per-site host access, the two service origins) are requested only from a user gesture.
```

## ما بعد إزالة الإضافة

`chrome.runtime.setUninstallURL` إلى `https://www.bysltan.com/rasd/uninstall` بلا معرّف ولا استعلام
([`src/background/uninstall-url.ts`](../../src/background/uninstall-url.ts)) — **مطفأ في البناء** حتى تعيد الصفحة 200،
ثمّ يُشعل بـ`VITE_RASD_UNINSTALL_SURVEY=1 pnpm build`. ونصّ الصفحة في [`owner-pages.md`](owner-pages.md).
