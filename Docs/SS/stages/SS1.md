---
id: SS1
title: أساس الهدفين — chromium وfirefox من مصدر واحد
status: done
delivery: merged
wave: A
order: 1
depends: []
model: Sonnet 5.5
size: S
branch: main
gate: all
commit: 071cd77
updated: 2026-10-02
resume: المرحلة مغلقة — لا استئناف. ما تنقله إلى SS2 وSS3 وSS4 وSS6 في سجلّ التنفيذ؛ والمهمّة 7 (تثبيت Firefox الحيّ) غير متحقَّقة ويغلقها SS7 أو إذنٌ صريح من المالك.
---

# SS1 — أساس الهدفين

> الحالة والاعتماديات ونقطة الاستئناف في الترويسة **وحدها**؛ اللوحة والجداول مشتقّة بـ`pnpm ss:sync`.
> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §4.1–4.4؛ هنا «متى وكيف».

## الهدف

هدفا بناء من شيفرة واحدة: `pnpm build` يعطي حزمة Chromium **ببصمتها الحالية نفسها**، و`pnpm build:firefox` يعطي
`dist-firefox/` ببيانٍ يقبله مدقّق AMO بصفر خطأ ويثبّته Firefox. ومجلّد `src/shared/platform/` هو المكان الوحيد الذي
يعرف الهدف، ويحرسه اختبارٌ يمنع `TARGET` وأسماء المتصفّحات خارجه — فلا يختلط Chromium بFirefox بOpera لاحقًا.

## لماذا الآن

كل مرحلة بعدها تحتاج `TARGET` أو `dist-firefox/` أو كليهما. صغيرة ومقيسة سلفًا: الشيفرة تعمل في Firefox بلا سطر
معدَّل، والفرق أربعة مفاتيح في البيان (`Docs/Firefox/firefox_rasd.md` §2 و§5).

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `manifest.config.ts` ⇐ `buildManifest(target)` والتصدير الافتراضي لـ`chromium` (منطقة حسّاسة: مراجعة مستقلّة)
- `vite.config.ts` و`vite.content.config.ts` ⇐ `RASD_TARGET` ومجلّد الخرج و`crx({ browser })`
- `vite-env.d.ts` ⇐ نوع `VITE_RASD_TARGET`
- `src/shared/platform/README.md` و`src/shared/platform/target.ts` (جديدان)
- `scripts/verify-dist.mjs` ⇐ `--target chromium|firefox` بتوقّعات البيان لكل هدف
- `package.json` ⇐ `build:firefox` و`web-ext` اعتماديةَ تطوير مثبَّتة النسخة
- `tests/unit/build/manifest-targets.test.ts` و`tests/unit/platform-isolation.test.ts` (جديدان)
- `Docs/Development.md` ⇐ أمر البناء الثاني

**خارج النطاق**

- حزم ZIP وحزمة المصدر وسير الإصدار (SS3)
- أيّ نقطة فرق وقت التشغيل (SS4) أو حقل بلاغ (SS2)
- حرّاس Firefox (SS7)

## المهامّ

1. `src/shared/platform/target.ts`: `export const TARGET = import.meta.env.VITE_RASD_TARGET ?? 'chromium'` بنوعٍ ضيّق، و`README.md`
   يكتب القاعدة: المجلّد الوحيد الذي يعرف المتصفّح، والكشف عن القدرة قبل الهدف.
2. `tests/unit/platform-isolation.test.ts` على نسق `egress-single-exit.test.ts`: يمسح `src/` بلا `platform/` وبلا
   التعليقات بحثًا عن `TARGET` و`firefox` و`Firefox` و`opera` و`brave` و`vivaldi` و`edge`؛ ويُثبَت سالبه بملفّ مصنوع.
3. `manifest.config.ts` ⇐ دالّة `buildManifest(target)` بجدول §4.4 من الدراسة: `background.scripts` و`gecko`
   (`id: "rasd@bysltan.com"` المعتمد، و`strict_min_version: "140.0"`، و`data_collection_permissions`) و`incognito: "not_allowed"` وحذف
   `minimum_chrome_version` و`use_dynamic_url` لـFirefox؛ و`chromium` كما اليوم حرفًا.
4. `vite.config.ts`: الهدف من `RASD_TARGET`، و`outDir` ⇐ `dist-firefox` للثاني، و`crx({ manifest, browser })`؛ و`vite.content.config.ts` يتبع المجلّد نفسه.
5. `scripts/verify-dist.mjs --target firefox`: `gecko.id` و`data_collection_permissions` موجودان، ولا `service_worker`،
   ولا `minimum_chrome_version`؛ و`--target chromium` يفرض العكس (الافتراضي كما اليوم).
6. `pnpm build:firefox` ثمّ `pnpm exec web-ext lint --source-dir dist-firefox`: صفر خطأ، وتحذيرا `innerHTML` وحدهما.
7. `node scripts/firefox-probe.mjs --only=package` على حزمة Firefox (يُعدَّل المسبار ليقرأ `dist-firefox/` مضغوطةً مؤقّتًا أو
   يُنتظر SS3): **تُثبَّت** لا تُرفض.

## معايير الإغلاق

- بصمة `dist-zip/rasd-<v>.zip` قبل المرحلة = بعدها (`pnpm build:bundle && pnpm zip` ثمّ `shasum -a 256 -c`)
- `pnpm vitest run tests/unit/build/manifest-targets.test.ts tests/unit/platform-isolation.test.ts` أخضر، ولكل قاعدة سالبها
- `pnpm build:firefox && pnpm verify:dist --target firefox` أخضر، و`web-ext lint` صفر خطأ
- `content.js` في `dist-firefox/` بايتاتٌ مطابقة لـ`dist/content.js` (`cmp`)
- مراجعة مستقلّة لـ`manifest.config.ts` (مراجع واحد، Sonnet 5.5) مكتوبة في سجلّ التنفيذ

## المخاطر

- وضع `browser: 'firefox'` في CRXJS 2.7.1 غير مجرَّب على رصد: إن أخرج ما يرفضه `web-ext lint` يُكتب البيان بعد البناء بملحق Vite صغير، لا بترقيع يدوي
- `gecko.id` معتمد من المالك في 2026-10-02: `rasd@bysltan.com` — دائم، لا يُغيَّر بعد أوّل توقيع، ويُكتب حرفًا في `buildManifest('firefox')` (ويحرسه `manifest-targets.test.ts`)

## المراجع

- `Docs/Browsers/Architecture.md` §4.1 و§4.3 و§4.4
- `Docs/Firefox/firefox_rasd.md` §2 و§5 (المقيس)
- `node_modules/@crxjs/vite-plugin/dist/index.d.ts` — خيار `browser`
- ADR 0057 (البناء الحتمي وبصمة الحزمة)

## سجلّ التنفيذ

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                 | الدليل                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                            |
| 2026-10-02 | **الأساس قبل أي تعديل:** بصمة Chromium على `8021d0d`                                                                                                                                                                                     | `pnpm build:bundle && pnpm zip` ⇒ `rasd-0.1.0.zip` = `65cd172689555703c70e0acd98e93f0ecd3288f7d826df4f11562a960049f011` (تطابق المسجَّل في الدراسة)                                                                                          |
| 2026-10-02 | `src/shared/platform/` (`target.ts` + `README.md`) وحارس العزل `tests/unit/platform-isolation.test.ts`: يمنع `TARGET` و`RASD_TARGET` وأسماء `firefox` `opera` `brave` `vivaldi` `edge` `chromium` خارج المجلّد، بعدٍّ وسببٍ لكل استثناء  | موجب على الشجرة الحقيقية؛ سالب بملفّات مصنوعة **وبتسرّب فعليّ مزروع في `src/modules` و`src/ui` فاحمرّ باسم الملفّ** ثمّ أُزيل                                                                                                                |
| 2026-10-02 | `buildManifest(target)` في `manifest.config.ts` بجدول §4.4: خمسة مفاتيح تفترق (`background` · `minimum_chrome_version` · `browser_specific_settings` · `incognito` · `use_dynamic_url`)، والتصدير الافتراضي chromium                     | `tests/unit/build/manifest-targets.test.ts`: كل مفتاح بالقيمتين، و«ما عدا الخمسة متطابق»، وترتيب مفاتيح chromium مثبَّت، والمعرّف الدائم حرفًا. وتخريبٌ فعليّ للمصدر (5 حالات) فاحمرّ                                                        |
| 2026-10-02 | `RASD_TARGET` في `vite.config.ts` (مجلّد الخرج و`crx({ browser })` و`define` لثابت الهدف) و`vite.content.config.ts` (المجلّد وحده)، ومساعد الأدوات `scripts/build-target.ts`؛ هدفٌ خاطئ يوقف البناء                                      | `pnpm build:firefox` ⇒ `dist-firefox/`، وCRXJS في وضع `firefox` أخرج `background.scripts` + المحمِّل + `type: module` وحذف `use_dynamic_url` **دون ملحق ترقيع** (الخطر الأوّل في المواصفة لم يقع)                                            |
| 2026-10-02 | `scripts/verify-dist.mjs --target chromium\|firefox`: توقّعات البيان بالاتجاهين، ومطابقة `browser_specific_settings` و`minimum_chrome_version` حرفًا لما يبنيه البيان (`scripts/target-manifest.ts`)، ورفض التباس `RASD_TARGET` بلا علَم | سوالب بالعبث ببيانَي الخرج: 13 حالة سقطت كلٌّ بسبب واحد، و5 أخرى لمطابقة المبنيّ بالمصدر، واستُعيد البيان بعد كلٍّ؛ و`tests/unit/build/verify-dist-target.test.ts` يشغّل السكربت فعلًا (8 حالات)                                             |
| 2026-10-02 | `web-ext` 10.7.0 (النسخة المقيسة) اعتماديةَ تطوير مثبَّتة النسخة، و`build:firefox` في `package.json`، و`dist-firefox/` في `.gitignore` و`.prettierignore` و`eslint.config.js`، والتوثيق في `Docs/Development.md`                         | `web-ext lint --source-dir dist-firefox`: **0 أخطاء، 0 ملاحظات، تحذيرا `UNSAFE_VAR_ASSIGNMENT` (`innerHTML`) وحدهما**. قفل الحزم: الإصدارات المضمَّنة في الحزمة لم تتغيّر، وتغيّرت لاحقة نظير `(yauzl@3.4.0)` على lighthouse وpuppeteer-core |
| 2026-10-02 | **قياسان لم تذكرهما المواصفة**، صفّان في `Docs/Engineering.md §6`: 471 (تحذير أندرويد ⇐ `gecko_android` بحدٍّ أدنى 142) و472 (`RASD_TARGET` مصدَّرًا يعطي نجاحًا زائفًا على `dist/` قديمة)                                               | `pnpm build:firefox && pnpm exec web-ext lint --source-dir dist-firefox` · `RASD_TARGET=firefox node scripts/verify-dist.mjs` (يخرج 2) · `pnpm docs:lint` أخضر                                                                               |
| 2026-10-02 | **المراجعة المستقلّة** لـ`manifest.config.ts` (مراجع واحد، Sonnet 5.5، لم يكتب الشيفرة) — التفصيل أدناه                                                                                                                                  | أربع ملاحظات مثبتة، **حُسمت كلّها** بعد تحقّقٍ مستقلّ مني؛ وبنود «فُحص ووُجد سليمًا» أدناه                                                                                                                                                   |

### المراجعة المستقلّة

مراجع واحد (عدسة: صحّة البيان وعدم تسرّب مفتاح هدفٍ إلى آخر) لأن المنطقة الحسّاسة الملموسة `manifest.config.ts` وحده، لا الأمن أو التخزين أو عقد الرسائل. نموذجه Sonnet 5.5 مسمًّى في الاستدعاء.

**ملاحظات مثبتة، وحُسمت كلّها بتحقّقٍ مستقلّ مني قبل الأخذ بها:**

1. **مرتفعة — `eslint.config.js` لا يتجاهل `dist-firefox/`.** `pnpm lint` ثمّ `pnpm check` ثمّ `gate:a` تسقط ما دام المجلّد على القرص (`eslint dist-firefox/content.js` ⇒ 186 خطأً، و`dist/content.js` مُتجاهَل). فاتتني لأني فحصتُ ملفّاتي المتغيّرة وحدها. **أُصلحت:** `'dist-firefox/**'` في `ignores`، و`dist-firefox/` في `.prettierignore`؛ و`pnpm lint` و`pnpm format:check` الكاملان أخضران والمجلّد حاضر.
2. **متوسّطة — `verify:dist --target firefox` يمرّ أخضر على قيمٍ خاطئة** (`gecko.id` غريب، وحدٌّ أدنى 1.0، وفئة بيانات إلزامية مختلفة): كان يفحص الحضور لا القيمة، والمعرّف دائم. **أُصلحت:** المبنيّ يُقارَن حرفًا بما يبنيه البيان (`scripts/target-manifest.ts`، وحدةٌ آمنة في Node لأن `manifest.config.ts` لا يُستورد خارج محمِّل Vite)، وحدّ Chromium الأدنى كذلك. سوالب V1–V5 سقطت كلّها.
3. **منخفضة — `buildManifest` بلا حارس وقت تشغيل:** كل قيمةٍ غير `'firefox'` تخرج بيان chromium صامتًا (غير قابلة للبلوغ اليوم: `vite.config.ts` يرفضها قبل). **حُصِّنت:** `buildManifest` يرمي لما ليس هدفًا؛ واختبار على تسع قيم.
4. **منخفضة — اختبار «chromium كما كان» لا يحرس ترتيب المفاتيح** وهو يدخل البصمة (نقل `incognito` قبل `commands` يبقي `toEqual` أخضر ويغيّر البصمة). **أُصلحت:** ترتيب المفاتيح العليا وترتيب `background` ومجموعة الموارد مثبَّت حرفًا؛ ونقلٌ فعليّ لـ`incognito` في المصدر أحمره.

**ما بعد المراجعة:** استُخرج `FIREFOX_SETTINGS` إلى `scripts/target-manifest.ts` (نقلٌ بلا أثر على المخرج، تثبته بقاء البصمة) وأُضيف حارس `buildManifest` — وكلاهما من ملاحظات المراجع نفسها؛ ولم يُعَد استدعاؤه لهذا الفرق الصغير.

**فُحص ووُجد سليمًا (عن المراجع):** بيان Chromium من المصدر سطرًا سطرًا (نصّ JSON وترتيب المفاتيح والبصمة متطابقة مع HEAD) ومن المخرَج (`cmp` للبيان، وبصمة الزيب، و`content.js` واحد في الأساس و`dist/` و`dist-firefox/`) · Firefox مقابل §4.4 على المبنيّ (الفرق بين البيانين المبنيَّين خمسة مفاتيح لا غير) · تساوي الصلاحيات و`optional_*` وCSP والأوامر والأيقونات وموارد الواجهة في الهدفين · `gecko_android`: شيفرة المدقّق (`addons-linter` 10.13.0) تقرؤه ثمّ ترجع إلى `gecko` عند غيابه، فهو قيدٌ على الحدّ الأدنى لا إعلان دعم، ولا أثر على سطح المكتب · الخصوصية: `incognito: not_allowed` أشدّ من `split`، وصفحة الأحداث تحت CSP نفسها، وحذف `use_dynamic_url` لا يكشف المعرّف عبر مسار الطبقة · لا حالة مشتركة بين الاستدعاءات · لا مسار يتجاوز `resolveBuildTarget` · `define` لا يغيّر بايتات Chromium.

**أُسقط لعدم إمكان الإثبات:** تسرّب UUID `moz-extension://` في Firefox حيًّا (يحتاج Firefox؛ مرشّح لحارس في SS7) · اكتمال فئات `data_collection_permissions` (يتوقّف على تعريفات Mozilla — يُحال إلى SS6، انظر أدناه) · معاملة AMO لتوافق أندرويد من حضور `gecko_android` (لا تُقاس دون تقديم) · `Ctrl+Shift+Q` على ويندوز (معلوم ومؤجَّل في دراسة Firefox).

### انحرافات عن المواصفة وقراراتها

- **`src/vite-env.d.ts` لم يُمسّ.** نوع `VITE_RASD_TARGET` يُعلَن في `src/shared/platform/target.ts` نفسه (`declare global`)، فلا يحمل ملفٌّ خارج المجلّد اسم الهدف ولا حاجة لإعفائه في حارس العزل — والقاعدة مطلقة بلا استثناء.
- **ملفّان جديدان خارج قائمة النطاق:** `scripts/build-target.ts` (هدف الأدوات ومجلّداته) و`scripts/target-manifest.ts` (ما يفرضه كل هدف). الأوّل لا يستورد `target.ts` لأن ذاك يقرأ `import.meta.env` ولا يُفحَص بـ`tsconfig.node.json`؛ ويثبّت الاختبار أن نوعَي الهدف واحد.
- **حارس العزل أوسع من القائمة المكتوبة:** يضيف `chromium` وقراءة المتغيّر مباشرةً (`RASD_TARGET`) — الثانية تتجاوز الثابت فتُسدّ.
- **استثناءات حارس العزل أربعة، كلٌّ بعدّه وسببه:** `shared/restricted.ts` (مخطّطات الروابط الداخلية `edge:` `brave:` `opera:` `vivaldi:`) · `modules/dom-picker/hit-test.ts` (دالّة `edge` الهندسية) · `modules/report/diagnostics.ts` و`pages/editor/page-meta.ts` (هويّة المتصفّح — **تنتقل إلى `platform/identity.ts` في SS2 فيُحذف بندهما**).
- **`build.target` يبقى `chrome116` للهدفين.** الخفض إلى أدنى ما يعرفه كروم يعمل في Firefox 140، وبقاء الشيفرة المنقولة واحدة يجعل الفرق بين الحزمتين البيانَ والمحمِّل وحدهما (يثبته `cmp` على `content.js`).
- **`gecko_android: { strict_min_version: "142.0" }`** خارج جدول §4.4 — القياس كشف التحذير (§6 صفّ 471). أندرويد يبقى خارج الدعم المعلَن.
- **`src/shared/platform.ts`** (كشف نظام التشغيل `isMacPlatform`) بقي بجوار المجلّد `platform/` خارجه، ولا اسم متصفّح فيه؛ ولم يُنقل (خارج النطاق، وله خمسة مستوردين).
- **لا حارس كروم عُدِّل** (`verify-dist` ضمن `NOT_GUARDS` في `scripts/wave-verify.mjs`: حارس بوّابة لا حارس متصفّح) ⇒ لا `guards:sync` ولا تصفير سلاسل.

### ما تنقله هذه المرحلة إلى ما بعدها

- **SS3:** `scripts/firefox-probe.mjs` لم يُمسّ ويقرأ `dist-zip/rasd-<v>.zip` (حزمة Chromium) — يُعدَّل ليقرأ `rasd-<v>-firefox.zip`. و`scripts/zip.mjs` يستدعي `verify-dist.mjs` بلا علَم فيرفض الضغط في صدفةٍ عليها `RASD_TARGET=firefox` (§6 صفّ 472) — وهو الصواب اليوم لأن الضغط لـ`dist/` وحدها؛ يُجعل `--target` صريحًا حين يضغط الهدفين. ومدخلات `newestInput` فيه و`BUILD_INPUTS` في `wave-verify.mjs` لا تذكر `scripts/build-target.ts` ولا `scripts/target-manifest.ts` (يمسّان البيان لا بايتات Chromium).
- **SS2 وSS4:** لا يستورد سكربت المحتوى `platform/target.ts` — `vite.content.config.ts` بلا `define` عمدًا (بايتات `content.js` واحدة)، فلو استورده لصار `TARGET` في `dist-firefox/content.js` يساوي `chromium` دون أي تنبيه، و`cmp` لا يرى ذلك لأن البايتات تبقى متطابقة. الكشف عن القدرة (`capabilities.ts`) هو الطريق، لا `TARGET`.
- **SS6:** فئات `data_collection_permissions` (`required: ['none']`) تُراجَع على تعريفات Mozilla قبل أي تقديم: إشعار GitHub يحمل افتراضيًّا رابط الصفحة وعنوانها وملاحظات المستخدم والصورة (`DEFAULT_ISSUE_OPTIONS.pageLink = true` في `src/modules/export/integrations/issue.ts`)، ويخرج الرمز في ترويسة `Authorization` إلى `api.github.com`. هل يستلزم ذلك `browsingActivity` أو `authenticationInfo` لم يُحسم هنا.
- **لم يُقَس:** `pnpm dev` بهدف Firefox (CRXJS يبني محمِّلًا مختلفًا في وضع الخدمة)؛ خارج نطاق SS1.

### المهمّة 7 — **لم تُنفَّذ**

`node scripts/firefox-probe.mjs --only=package` على حزمة Firefox: **Firefox غير مثبّت على هذا الجهاز** (لا في `/Applications` ولا في ذاكرة Playwright أو Puppeteer). وُجد `firefox--157.0.dmg` في ذاكرة Homebrew من جلسةٍ سابقة، ولم يُركَّب ولم يُشغَّل: تثبيت متصفّحٍ وتشغيله تفويضٌ لا يُستنتَج من جلسةٍ أخرى. فما يثبت اليوم أن **المدقّق يقبل البيان بصفر خطأ** (وهو مدقّق AMO نفسه)، ولا يثبت أن **Firefox يُثبّت الحزمة المبنيّة**. والخطر المتبقّي صغير: النسخة التجريبية المقيسة (`Docs/Firefox/firefox_rasd.md`) حملت المفاتيح نفسها وثُبِّتت، والمحمِّل الذي بناه CRXJS هو نفسه (`service-worker-loader.js` + `type: module`). **لا يلزم لمعايير الإغلاق**، ويُغلقه SS7 بحرّاس تُثبّت فعلًا، أو المالك بإذنٍ صريح بالتجربة الآن.

**المتبقّي:** لا شيء داخل نطاق المعايير، عدا المهمّة 7 أعلاه (غير متحقَّقة).
