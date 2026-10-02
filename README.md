<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="Docs/Brand/svg/rasd-lockup-horizontal-dark.svg">
    <img src="Docs/Brand/svg/rasd-lockup-horizontal-light.svg" alt="رصد" width="220">
  </picture>
</p>

<h3 align="center">افحص الواجهة كما تُرسم</h3>

<p align="center">
  إضافة متصفّح للفحص البصري، عربيةٌ أوّلًا: تلتقط وتقيس وتفحص وتقارن فوق الصفحة نفسها،<br>
  وتحفظ ما وجدته على جهازك، وتسلّمه للمطوّر بصيغٍ يفهمها.
</p>

<p align="center">
  <a href="#english">English</a> · <a href="Docs/Privacy.md">الخصوصية</a> · <a href="#developer">للمطوّر</a> ·
  <a href="https://bysltan.com">bysltan.com</a>
</p>

<p><img src="Docs/Launch/readme/browsers-ar.png" alt="يعمل في Chrome وEdge وBrave وOpera وVivaldi وFirefox" width="100%"></p>

<p><img src="Docs/Launch/readme/hero-ar.png" alt="العنوان تحت حدود تحديد رصد، وقياسٌ حيّ بين عنصرين في صفحة عربية بتكبير الفجوة 32px" width="100%"></p>

## ما يفعله رصد

<p><img src="Docs/Launch/readme/inspect-ar.png" alt="لوحة الفحص: العرض المحسوب 254.67px" width="100%"></p>

الفحص يقرأ الأنماط المحسوبة والصندوق والخط واللون والإتاحة لأي عنصر، ويُنزّلها CSS أو Tailwind أو JSON.

<p><img src="Docs/Launch/readme/colours-ar.png" alt="البكسل تحت القطّارة مكبَّرًا: #2B7FFF" width="100%"></p>

القطّارة تقرأ اللون كما يُرسم ومتغيّر CSS الذي جاء منه، ومعها لوحة ألوان الصفحة وتدرّجاتها وتدقيق التباين في الصفحة كاملة.

<p><img src="Docs/Launch/readme/compare-ar.png" alt="المقارنة بالتقسيم فوق الصفحة الحيّة: 1.7% من البكسلات مختلفة" width="100%"></p>

المقارنة تضع تصميمًا أو لقطة فوق الصفحة — تقسيم وتراكب وشفافية ووميض — بنسبة البكسلات المختلفة واستثناء المناطق
المتغيّرة وتقرير PDF.

<p><img src="Docs/Launch/readme/editor-ar.png" alt="المحرّر: حجبٌ بالتغطية والضبابية مخبوزٌ في البكسلات" width="100%"></p>

المحرّر: ملاحظات مرقّمة وأسهم ونصوص وقصّ، وحجبٌ يُخبز في بكسلات الصورة فلا يُستعاد من الملفّ.

<p>
  <img src="Docs/Launch/readme/library-ar.png" alt="المكتبة: كل شيء على هذا الجهاز" width="49%">
  <img src="Docs/Launch/readme/capture-ar.png" alt="الالتقاط: منطقة بأبعادها" width="49%">
</p>

ومعها القياس بين عنصرين بالبكسل، والمشكلات المربوطة بالعنصر، والتسليم: صورٌ وتقارير ودليل خطوات وحزمة Markdown
وJSON، وصفحة مشاركة تُفتح بلا إنترنت.

## كيف يعمل

<p><img src="Docs/Launch/readme/workflow-ar.png" alt="لاحظ ثمّ قِس ثمّ افحص ثمّ قارن ثمّ وثّق ثمّ سلّم — ولكلّ خطوة قيمتها" width="100%"></p>

## الخصوصية

<p><img src="Docs/Launch/readme/privacy-ar.png" alt="صفر طلب شبكة، وصفر صلاحية دائمة، وصفر حساب، واتّصالان اختياريان" width="100%"></p>

- **محلّيٌّ افتراضيًّا.** «الوضع المحلّي فقط» مفعّل من أوّل تشغيل، وما دام مفعّلًا لا يخرج من رصد طلب شبكة واحد —
  مقيسًا في متصفّح حقيقي على كل مسار، لا موعودًا.
- **لا صلاحية دائمة على المواقع.** رصد يعمل على الصفحة التي تطلبه عليها بنقرتك.
- **اتّصالان اختياريان فقط**، بعد إطفاء «الوضع المحلّي» وبنقرتك بعد مراجعة ما سيُرسَل: فتح Issue في مستودعك على GitHub،
  و«أبلغ عن مشكلة» إلى المطوّر — بلا رابط الصفحة ولا محتواها ولا مكتبتك.

التفصيل جملةً جملة بموضعها في الشيفرة: [`Docs/Privacy.md`](Docs/Privacy.md).

## يعمل حيث تعمل أنت

الحزمة نفسها بلا تعديل، مجرَّبةً في كل متصفّح على macOS: تُحمَّل بلا تحذير، ثمّ تجري رحلات رصد فيه — الالتقاط والفحص
والقياس والألوان والمقارنة والمحرّر والمكتبة والتصدير وصفر طلب شبكة. التفصيل والأوامر والفروق في
[`Docs/Launch/browsers.md`](Docs/Launch/browsers.md).

<div dir="rtl">

| المتصفّح    | الإصدار المجرَّب | المحرّك      | الحالة                                                                                       |
| ----------- | ---------------- | ------------ | -------------------------------------------------------------------------------------------- |
| **Chrome**  | 154.0.8037.93    | Chromium 154 | ✓ مدعوم                                                                                      |
| **Edge**    | 154.0.4258.53    | Chromium 154 | ✓ مدعوم                                                                                      |
| **Brave**   | 1.96.59          | Chromium 154 | ✓ مدعوم — الألوان بالبكسل دقيقة: القطّارة تفكّ اللقطة بـImageDecoder فلا يمسّها تمويه البصمة |
| **Opera**   | 136.0.6008.80    | Chromium 152 | ✓ مدعوم — ثلاثة اختصارات يحجزها فتُسند يدويًّا                                               |
| **Vivaldi** | 8.2.4133.80      | Chromium 152 | ✓ مدعوم                                                                                      |
| **Firefox** | 157.0            | Gecko 157    | ✓ مدعوم — بحزمته الخاصّة من المصدر نفسه، ولا يعمل في النوافذ الخاصّة                         |

</div>

## التثبيت

**من المتاجر** — قريبًا في Chrome Web Store وMicrosoft Edge Add-ons وFirefox Add-ons وOpera Add-ons. تُضاف روابطها هنا
حين تُنشر رصد.

**من الحزمة** (للمطوّر والمختبِر):

1. `pnpm install --frozen-lockfile && pnpm build && pnpm zip` — أو حزمةٌ جاهزة `rasd-<النسخة>.zip`، تُفكّ في مجلّد.
2. افتح صفحة الإضافات: `chrome://extensions` · `edge://extensions` · `brave://extensions` · `opera://extensions` ·
   `vivaldi://extensions`.
3. فعّل **وضع المطوّر**، ثمّ **تحميل غير مضغوطة** واختر المجلّد.
4. تظهر رصد بأيقونتها **بلا تحذير صلاحيات**. ثبّتها في شريط الأدوات، وافتح أي صفحة واضغط الأيقونة.

الاختصارات الافتراضية: `⇧⌘T` منطقة · `⇧⌘E` عنصر · `⇧⌘V` الجزء الظاهر · `⇧⌘S` الصفحة كاملة (على ويندوز ولينكس
`Ctrl+Shift` مع `Q` و`E` و`V` و`S`)، وتُعدَّل من صفحة اختصارات الإضافات في المتصفّح.

<a id="developer"></a>

## للمطوّر

```bash
nvm use && corepack enable
pnpm install --frozen-lockfile
pnpm dev            # تطوير مع إعادة تحميل تلقائية
pnpm build          # أنواع + بناء + فحص الحزمة
pnpm gate:a         # البوّابة المحلّية كاملة
```

مبنيّ بـPreact وTypeScript وVite فوق Manifest V3، بلا خادم ولا حساب. البنية والأوامر كلّها والحرّاس وطريقة العمل في
[`Docs/Development.md`](Docs/Development.md)، وقواعد التنفيذ في [`AGENTS.md`](AGENTS.md).

## Firefox

**مدعوم** بحزمةٍ خاصّة من المصدر نفسه: `pnpm build:firefox && pnpm zip:firefox` ⇐ `dist-zip/rasd-<النسخة>-firefox.zip`.
والدعم مقيسٌ بالمعيار نفسه الذي يُقاس به Chromium: أربعة عشر حارسًا في Firefox حقيقي (`pnpm verify:firefox`) — التثبيت
ومدقّق addons.mozilla.org، والنافذة، والتفعيل والقياس والفحص والألوان، والالتقاط الظاهر والكامل ونسخة التنزيلات، والمحرّر
والحجب، والتصدير PNG وPDF، والمكتبة، وتشخيص البلاغ، وبقاء الخلفية، وصفر طلب شبكة. والفروق: لا يعمل في النوافذ الخاصّة،
وإصدار النظام لا يكشفه Firefox فيصل في البلاغ `unknown`. التجربة قبل النشر في المتجر: `about:debugging` ← «This Firefox» ←
«Load Temporary Add-on» ← `manifest.json` من الحزمة مفكوكة. الدراسة والقياس في
[`Docs/Firefox/firefox_rasd.md`](Docs/Firefox/firefox_rasd.md)، والحرّاس في [`Docs/Development.md`](Docs/Development.md).

---

<a id="english"></a>

## English

<p><img src="Docs/Launch/readme/hero-en.png" alt="The headline under Rasd's selection bounds, and a live measurement on an Arabic page with the 32px gap zoomed" width="100%"></p>

**Rasd** is an Arabic-first visual inspection extension for people who build and review web interfaces. Capture,
measure, inspect, check colour and compare against a reference right on the live page, keep your findings in a library on
your device, and hand developers what they need — CSS, Tailwind, JSON, Markdown, step guides and comparison reports.

<p><img src="Docs/Launch/readme/browsers-en.png" alt="Works in Chrome, Edge, Brave, Opera, Vivaldi and Firefox" width="100%"></p>

<p><img src="Docs/Launch/readme/privacy-en.png" alt="Zero network requests, zero permanent site access, zero accounts, two optional connections" width="100%"></p>

- **Local by default** — "Local only" is on from the first run; while it is on, Rasd sends no network request at all.
- **No permanent site access** — it works only on the page where you invoke it.
- **Arabic-first** — the interface is Arabic and right-to-left, in dark and light themes.

Firefox is supported with its own package from the same source (`pnpm zip:firefox`), proven by fourteen guards in real
Firefox (`pnpm verify:firefox`); it does not run in private windows.
Store links will be added here once Rasd is published.

---

<p align="center">
  تصميم وتطوير <b>سلطان — Sultan</b> · <a href="https://bysltan.com">bysltan.com</a><br>
  © 2026 — جميع الحقوق محفوظة. وتراخيص المكتبات مفتوحة المصدر المضمَّنة في <code>THIRD_PARTY_LICENSES.txt</code> داخل الحزمة.
</p>
