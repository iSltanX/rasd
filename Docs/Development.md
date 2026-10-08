# التطوير — المرجع التقني لرصد

> واجهة المنتج في [`README.md`](../README.md). هنا ما يحتاجه من يبني رصد أو يعمل عليه: البيئة والأوامر والبنية
> واستئناف العمل. وقواعد التنفيذ نفسها في [`AGENTS.md`](../AGENTS.md).

## المتطلّبات

| الأداة | النسخة                       |
| ------ | ---------------------------- |
| Node   | `24.x` — مثبَّتة في `.nvmrc` |
| pnpm   | `11.x`                       |
| Chrome | `116+`                       |

```bash
nvm use && corepack enable
```

## التشغيل

```bash
pnpm install
pnpm dev
```

`pnpm dev` يبني إلى `dist/` ويراقب التغييرات، ويعيد تحميل الإضافة تلقائيًا عبر HMR
من CRXJS. اتركه يعمل أثناء التطوير.

## البناء

```bash
pnpm build
```

يشغّل `typecheck` ثم `vite build` ثم **فحص الحزمة** (`verify:dist`) الذي يتأكّد من صحّة
البيان ووجود كل ملف يشير إليه ومطابقة أبعاد الأيقونات وعدم تسرّب ملفات المصدر.
فشل الفحص يعني أن صفحة الإضافات سترفض الحزمة.

### هدف Firefox

شيفرةٌ واحدة وهدفا بناء: `pnpm build` لـ**Chromium** (`dist/`)، و`pnpm build:firefox` لـ**Firefox** (`dist-firefox/`).
البيانان من دالّة واحدة (`buildManifest(target)` في `manifest.config.ts`) والفرق خمسة مفاتيح فيهما — جدولها في
[`Docs/Browsers/Architecture.md`](Browsers/Architecture.md) §4.4.

```bash
pnpm build:firefox
pnpm verify:dist --target firefox            # فحص البيان والحزمة بتوقّعات Firefox
pnpm exec web-ext lint --source-dir dist-firefox   # مدقّق addons.mozilla.org نفسه
```

- `RASD_TARGET=chromium|firefox` هو ما يختاره (الافتراضي `chromium`)، وقيمةٌ أخرى توقف البناء.
- `build:firefox` يبني ولا يفحص: الفحص أمرٌ منفصل كما في `build:bundle` و`verify:dist`. و`build:all` يبني الهدفين ويفحصهما.
- `content.js` بايتاتٌ واحدة في المجلّدين (`cmp dist/content.js dist-firefox/content.js`).
- المعرّف `rasd@bysltan.com` في بيان Firefox **دائم** — لا يُغيَّر بعد أوّل توقيع.
- كل معرفة بالهدف أو باسم متصفّح تُكتب في `src/shared/platform/` وحده، ويحرسه
  `tests/unit/platform-isolation.test.ts`.

### حرّاس Firefox

أربعة عشر حارسًا تحت `scripts/firefox/` فوق نواة `scripts/lib/bidi.mjs` (WebDriver BiDi في Firefox نفسه، بلا geckodriver —
ADR 0059)، كلٌّ بموجبٍ وسالب، **خارج `allGuards`**: لا يطيل بوّابة كروم ولا يدخل سجلّ ترقيتها.

```bash
pnpm verify:firefox                         # كلّها بترتيب القيمة، ويبني dist-firefox/ إن كان أقدم من مصدره
pnpm verify:firefox --only colour,report    # بأسمائها، بالقفل نفسه
pnpm firefox:load                           # حارسٌ واحد مباشرةً
RASD_GUARD_SABOTAGE=content.js pnpm firefox:measure   # السالب: يجب أن يسقط
pnpm verify:wave --base origin/main --firefox          # حرّاس كروم ثمّ Firefox
```

- **Firefox:** `FIREFOX_PATH` أو `/Applications/Firefox.app` أو `/usr/bin/firefox`. بلا نافذة افتراضًا، و`RASD_FIREFOX_HEADFUL=1`
  يُظهرها.
- **المنافذ:** BiDi لكل حارس 9231–9244، والعيّنات 5420–5421، والقفل 9228، و`store:package --browser=firefox` على 9245 — لا شيء
  منها من منافذ كروم.
- **ما تحتاجه النواة ولماذا** (قِيس في Firefox 157): صفحة فحص فارغة في نسخة الفحص لنداء `chrome.*`، و`nativeMouse` حيث يرفض
  BiDi المؤشّر في صفحات الإضافة، والطرفية من `Services.console` لأن `log.entryAdded` لا يراها، ومراقِب شبكة في المتصفّح لأن
  `network.*` لا يرى طلبات الإضافة، ومنتقٍ بديل لـ«احفظ باسم» لأن التصدير يطلب `saveAs: true`.
- **قبل تجربة يدوية في Firefox:** `pnpm build:firefox` من الشجرة التي تجرّبها — حزمةٌ قديمة في `dist-firefox/` بُنيت قبل هوية
  SS2 أرسلت البلاغين #9 و#10 بمتصفّحٍ `unknown` (SS7)، وحارس `report` يقرأ ما يُبنى الآن.
- **CI:** وظيفة `firefox` غير حاجبة على لينكس بخطوةٍ لكل حارس، وسجلّ ترقيتها `.github/firefox-guards-ledger.json`
  (`pnpm guards:firefox-sync` بعد تعديل حارسٍ أو إضافته).

### الحزم والإصدار

وسمٌ واحد `vX.Y.Z` يعطي ثلاث حزم ببصماتها (`.github/workflows/release.yml`، مسوَّدةً لا نشرًا):

```bash
pnpm build:all                 # dist/ و dist-firefox/ — كلٌّ بـverify:dist
pnpm zip:all                   # الثلاث في dist-zip/ — كلٌّ معها .sha256
pnpm zip:all --tag v1.2.3      # كما في سير الإصدار: الوسم يطابق النسخة، وحزمة المصدر من الالتزام الموسوم
```

- `rasd-<v>.zip` (Chrome وEdge) · `rasd-<v>-opera.zip` (Opera — حزمة Chrome وفرقٌ وحيد في `short_name`، تُنتَج يدويًّا: `Docs/Store/opera/listing.md`) · `rasd-<v>-firefox.zip` (بعد `web-ext lint`: صفر خطأ، وتحذيرا `innerHTML` لأيقونات SVG
  ثابتة وحدهما) · `rasd-<v>-source.zip` (`git archive HEAD` وREADME البناء `Docs/Store/source-README.md` — ما يطلبه AMO وOpera).
  ويصلح كلٌّ وحده: `pnpm zip` · `pnpm zip:firefox` · `pnpm zip:source`.
- `zip:source` يرفض شجرةً غير نظيفة، و`zip:firefox` يرفض بيانًا بلا `gecko.id`. وفي `zip:all` أوّل رفضٍ يمنع كتابة أيٍّ منها.
- القنوات المنشورة وبصماتها في [`Docs/Release/channels.md`](Release/channels.md).

## التحميل في Chrome

1. افتح `chrome://extensions`.
2. فعّل **وضع المطوّر** (أعلى اليمين).
3. اضغط **تحميل غير مضغوطة** واختر مجلّد `dist/`.
4. يجب أن تظهر الإضافة باسم **رصد** وأيقونتها، **بلا أي تحذير صلاحيات**.

> `--load-extension` من سطر الأوامر **لا يعمل** في Chrome 137+ (يُتجاهل صمتًا).
> التحميل من الواجهة أعلاه هو الطريق الصحيح. للتحقّق الآلي استخدم `pnpm verify:load`
> الذي يستعمل `Extensions.loadUnpacked` عبر بروتوكول DevTools.

### الاختصارات الافتراضية

| الاختصار (macOS) | غير macOS      | الوظيفة            |
| ---------------- | -------------- | ------------------ |
| `⇧⌘T`            | `Ctrl+Shift+Q` | تصوير منطقة        |
| `⇧⌘E`            | `Ctrl+Shift+E` | تصوير عنصر         |
| `⇧⌘V`            | `Ctrl+Shift+V` | تصوير الجزء الظاهر |
| `⇧⌘S`            | `Ctrl+Shift+S` | تصوير الصفحة كاملة |

> `⇧⌘F` كانت الاختيار الأول لـ«تصوير منطقة» لكن Chrome يحجزها داخليًا
> ويتجاهلها صمتًا وقت التشغيل (بلا خطأ بناء) على ماك — اكتُشف
> عبر `pnpm verify:popup`. استُبدلت بـ`T` هناك. وعلى لينكس/ويندوز `Ctrl+Shift+T`
> محجوزة أيضًا، لأمرٍ مختلف («إعادة فتح التبويب المغلق») — مجموعة المحجوز
> تفترق بين ماك وغيرها لأن Chrome يبني كلًّا منها من جدول منفصل. اعتُمد
> `Ctrl+Shift+Q` لغير ماك، مقيسًا على عدّاء Linux حقيقي؛ انظر
> التعليق أعلى `commands` في `manifest.config.ts` و`Docs/Engineering.md §6` صفّ 99.

تُعدَّل من `chrome://extensions/shortcuts`. بقية خريطة الاختصارات تعمل داخل الصفحة،
وتُضبط من تبويب الاختصارات في الإعدادات.

## الأوامر

| الأمر                       | ماذا يفعل                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | تطوير مع HMR                                                                                      |
| `pnpm build`                | بناء + فحص الحزمة                                                                                 |
| `pnpm build:firefox`        | بناء هدف Firefox إلى `dist-firefox/`                                                              |
| `pnpm build:all`            | بناء الهدفين وفحصهما                                                                              |
| `pnpm typecheck`            | فحص الأنواع (المصدر وملفات الإعداد)                                                               |
| `pnpm lint`                 | ESLint، بلا تسامح مع أي تحذير                                                                     |
| `pnpm format`               | Prettier                                                                                          |
| `pnpm test`                 | اختبارات الوحدة والتكامل                                                                          |
| `pnpm test:coverage`        | مع تقرير التغطية                                                                                  |
| `pnpm check`                | الفحوص الساكنة والاختبارات معًا                                                                   |
| `pnpm zip`                  | فحص `dist/` ثمّ حزمة `.zip` حتمية ببصمتها                                                         |
| `pnpm zip:firefox`          | `web-ext lint` ثمّ حزمة Firefox · `zip:source` حزمة المصدر · `zip:all` الثلاث                     |
| `pnpm tokens:sync`          | توليد التوكنز من لقطة Figma                                                                       |
| `pnpm gate:a`               | البوّابة المحلّية، مرّة قبل الالتزام النهائي لتغيير                                               |
| `pnpm verify:wave`          | حرّاس كروم لمخروط أثر التغيير (`--base origin/main`) أو كلّها (`--size all`)، بقفل                |
| `pnpm verify:<اسم>`         | حارس متصفّح حقيقي — 26 حارسًا                                                                     |
| `pnpm verify:firefox`       | حرّاس Firefox كلّها بقفلها (`--only load,popup` · `--list`) — أو `verify:wave --firefox` بعد كروم |
| `pnpm firefox:<اسم>`        | حارس Firefox حقيقي — 14 حارسًا فوق نواة BiDi                                                      |
| `pnpm guards:firefox-check` | سجلّ ترقية حرّاس Firefox يطابق الحرّاس وخطوات CI — بلا شبكة                                       |
| `pnpm test:e2e`             | المسارات الأربعة بالكثافتين 1 و2، بقفل                                                            |
| `pnpm store:package`        | الحزمة مفكوكةً في كل متصفّح Chromium مثبَّت · `--browser=firefox` حزمة Firefox عبر BiDi           |
| `pnpm launch:images`        | مواد الإطلاق من لقطات `design:shots`                                                              |

## البنية

```
src/
  background/   Service Worker — دورة الحياة وتوجيه الرسائل
  content/      داخل صفحة الطرف الثالث — Shadow Root ومدير الأوضاع
  pages/        صفحات الإضافة — popup · editor · library · settings · onboarding
  modules/      الوحدات الثماني — منطق خالص بلا واجهة
  ui/           نظام التصميم — مكوّنات Preact على التوكنز الدلالية
  shared/       الطبقة القاعدية — الأنواع والرسائل وbidi والتوطين
  tokens/       مولَّد من Figma — لا يُحرَّر يدويًا
tests/
  unit/ integration/ e2e/ fixtures/
```

كل مجلّد في `src/` يحمل `README.md` يشرح دوره وحدوده.

### حدود الاستيراد

ثلاث قواعد **مفروضة آليًا** — خرقها يُسقط `pnpm lint` و`pnpm test`:

- `modules/` لا يستورد من `ui/`
- `content/` لا يستورد من `pages/`
- `shared/` لا يستورد من أي طبقة أعلى منه

التفاصيل والسبب في [ADR 0004](ADR/0004-architecture-boundaries.md).

## الحالة والمتبقّي

- **المنشور:** Chrome Web Store وFirefox Add-ons بالإصدار `1.0.0` (2026-10-03). **غير المنشور:** Microsoft Edge Add-ons
  وOpera Add-ons — موادّهما وحزمهما جاهزة، وتقديمهما بأمر المالك وحده. **Opera: قُبل رفع `rasd-1.0.0-opera.zip` والنشر لم يُؤكَّد.** الجدول وبصمات الحزم في [`Docs/Release/channels.md`](Release/channels.md).
- **مسوَّدة إصدار `v1.0.0` على GitHub** غير منشورة عمدًا؛ فيها الحزم الثلاث ببصماتها.
- **الإصدار `1.0.1` مُعدّ ولم يُنشر** (2026-10-08): النسخة في `package.json` و`CHANGELOG.md`، والوسم `v1.0.1` على `8fc3198`، والحزم الأربع
  ببصماتها في [`Docs/Release/channels.md`](Release/channels.md). يحمل إصلاح لوحة الصفحة وحده. التقديم للمتاجر بأمر المالك.
- **حزم `1.0.0` تُعاد بايتًا ببايت:** `pnpm build:all && pnpm zip && pnpm zip:firefox` تعطي `rasd-1.0.0.zip` و`rasd-1.0.0-firefox.zip`
  بالبصمتين المدوَّنتين في `channels.md` (قِيس 2026-10-04 بعد تنظيف المستودع). **حزمة المراجعين** `rasd-<v>-source.zip` تُبنى من
  `git archive` للالتزام الذي يشير إليه الوسم، فلا تُعاد من `main` بعد أن تقدّم عنه؛ والنسخة المرفوعة محفوظة في مسوَّدة
  الإصدار على GitHub. لا تُحرَّك الوسوم.
- **البوّابة المحلّية** (`pnpm gate:a`) تتجاوز سقفها (48s) على بعض الأجهزة — تحذيرٌ لا فشل؛ تقليمها قرارٌ مفتوح.
- **طلبات Dependabot المفتوحة** (ترقيات اعتماديات وإجراءات CI) لم تُراجَع بعد؛ كلٌّ منها يمرّ بـ`pnpm gate:a` وحرّاس كروم قبل دمجه.
- **مخرَجات تُعاد ولا تُلتزَم:** `dist/` · `dist-firefox/` · `dist-zip/` · `coverage/` · `artifacts/` · `.cache/`.

## البدء من نسخة جديدة

1. [`AGENTS.md`](../AGENTS.md) — قواعد التنفيذ والتحقّق والالتزام.
2. هذا الملفّ — البيئة والأوامر والبنية.
3. [`Docs/Engineering.md`](Engineering.md) و[`Docs/ADR/`](ADR/) — المرجع الهندسي والقرارات وأسبابها.
4. [`Docs/Browsers/Architecture.md`](Browsers/Architecture.md) — «ماذا ولماذا» لدعم المتصفّحات.

```bash
git clone https://github.com/iSltanX/rasd.git && cd rasd
nvm use && corepack enable
pnpm install --frozen-lockfile
pnpm gate:a
```

على نسخة جديدة تُشغَّل `pnpm gate:a` مرّة لإثبات البيئة، ويجب أن تخرج خضراء. بعدها تُشغَّل
مرّة قبل الالتزام النهائي لكل تغيير، لا بعد كل تعديل — «اقتصاد الفحوص» في [`AGENTS.md`](../AGENTS.md).
وحرّاس المتصفّح الحقيقي بعدها: `pnpm verify:wave --base origin/main` (والأعطال المتقطّعة المعروفة في
[`Docs/Flaky.md`](Flaky.md)).

### الترقيم التاريخي في الشيفرة والوثائق

تعليقات الشيفرة والـADR وصفوف `Docs/Engineering.md §6` تذكر `STAGES/NN` و`SSn` والموجات و«المرحلة N». هذه إحالاتٌ إلى خطّة
التنفيذ الداخلية (المراحل 01–34 ثمّ نظام SS) التي بُني بها 1.0، وملفّاتها نُقلت في 2026-10-04 إلى أرشيف التخطيط خارج
المستودع العامّ — فتُقرأ أسماءً لمصدر القرار لا روابط. والقرار نفسه وسببه في الـADR أو في صفّ §6 المذكور معها.

## المصادر المرجعية

| المصدر                                                      | الدور                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`Docs/Rasd_Ar.md`](Rasd_Ar.md)                             | وثيقة المنتج — الفكرة والأقسام والأولويات                                        |
| [`Docs/Engineering.md`](Engineering.md)                     | المرجع الهندسي، وسجلّ القرارات والتناقضات (§6)                                   |
| [`Docs/ADR/`](ADR/)                                         | القرارات المعمارية وأسبابها                                                      |
| [`Docs/EntryPoints.md`](EntryPoints.md)                     | جرد نقاط الدخول، محروس بـ`pnpm entrypoints:lint`                                 |
| [`Docs/Browsers/Architecture.md`](Browsers/Architecture.md) | الدراسة المعمارية لدعم المتصفّحات: Firefox وOpera والقنوات الأربع، وخطّة مراحلها |
| ملف Figma `Gr0dOsmjcVBcaX9M1slf5m`                          | نظام التصميم — مصدر التوكنز والشاشات                                             |

عند اختلاف التنفيذ عن الإطار المعتمد في Figma، فالتنفيذ هو الخطأ. والإطارات المعتمدة
في `Docs/Design.md`.
