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

### الحزم والإصدار

وسمٌ واحد `vX.Y.Z` يعطي ثلاث حزم ببصماتها (`.github/workflows/release.yml`، مسوَّدةً لا نشرًا):

```bash
pnpm build:all                 # dist/ و dist-firefox/ — كلٌّ بـverify:dist
pnpm zip:all                   # الثلاث في dist-zip/ — كلٌّ معها .sha256
pnpm zip:all --tag v1.2.3      # كما في سير الإصدار: الوسم يطابق النسخة، وحزمة المصدر من الالتزام الموسوم
```

- `rasd-<v>.zip` (Chrome وEdge وOpera) · `rasd-<v>-firefox.zip` (بعد `web-ext lint`: صفر خطأ، وتحذيرا `innerHTML` لأيقونات SVG
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

| الأمر                | ماذا يفعل                                                                     |
| -------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`           | تطوير مع HMR                                                                  |
| `pnpm build`         | بناء + فحص الحزمة                                                             |
| `pnpm build:firefox` | بناء هدف Firefox إلى `dist-firefox/`                                          |
| `pnpm build:all`     | بناء الهدفين وفحصهما                                                          |
| `pnpm typecheck`     | فحص الأنواع (المصدر وملفات الإعداد)                                           |
| `pnpm lint`          | ESLint، بلا تسامح مع أي تحذير                                                 |
| `pnpm format`        | Prettier                                                                      |
| `pnpm test`          | اختبارات الوحدة والتكامل                                                      |
| `pnpm test:coverage` | مع تقرير التغطية                                                              |
| `pnpm check`         | الفحوص الساكنة والاختبارات معًا                                               |
| `pnpm zip`           | فحص `dist/` ثمّ حزمة `.zip` حتمية ببصمتها                                     |
| `pnpm zip:firefox`   | `web-ext lint` ثمّ حزمة Firefox · `zip:source` حزمة المصدر · `zip:all` الثلاث |
| `pnpm tokens:sync`   | توليد التوكنز من لقطة Figma                                                   |
| `pnpm gate:a`        | البوّابة المحلّية، مرّة عند إغلاق المرحلة                                     |
| `pnpm ss:sync`       | نظام SS: الكتلة المشتقّة في `Docs/SS/README.md` واللوحة `Docs/SS/board.html`  |
| `pnpm ss:check`      | قواعد SS ومطابقة المشتقّ — في البوّابة A وCI                                  |
| `pnpm ss:prompt SS3` | البرومبت الكامل لمرحلة (أو `wave B` لإغلاق موجة)                              |
| `pnpm stages:sync`   | أرشيف 01–34: اشتقاق `STATUS.md` وجدول `ROADMAP.md`                            |
| `pnpm waves:check`   | اتّساق خطّة الموجات مع ترويسات المراحل                                        |
| `pnpm waves:board`   | توليد لوحة التشغيل `Docs/Waves/board.html`                                    |
| `pnpm verify:wave`   | حرّاس كروم لمرحلة أو لبوّابة موجة، بقفل                                       |
| `pnpm verify:<اسم>`  | حارس متصفّح حقيقي — 26 حارسًا                                                 |
| `pnpm test:e2e`      | المسارات الأربعة بالكثافتين 1 و2، بقفل                                        |
| `pnpm store:package` | الحزمة مفكوكةً في كل متصفّح Chromium مثبَّت                                   |
| `pnpm launch:images` | مواد الإطلاق من لقطات `design:shots`                                          |

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

## استئناف العمل

مدخل أي جلسة جديدة، من أي جهاز أو حساب له صلاحية على المستودع:

1. [`AGENTS.md`](../AGENTS.md) — قواعد التنفيذ والتحقّق والالتزام والرفع.
2. [`Docs/SS/README.md`](SS/README.md) — **الخطّة النشطة**: مراحل SS وموجاتها وأدوارها، ولوحتها
   [`Docs/SS/board.html`](SS/board.html): تُفتح بـ`open Docs/SS/board.html`، ومنها يُنسخ أمر كل جلسة
   (`/ss SSn` أو `/ss-merge X`) أو البرومبت الكامل.
3. [`Docs/SS/stages/SSn.md`](SS/stages/) — مواصفة المرحلة وسجلّ تنفيذها ونقطة استئنافها.
4. [`Docs/Browsers/Architecture.md`](Browsers/Architecture.md) — «ماذا ولماذا» لدعم المتصفّحات.
5. الأرشيف (01–34): [`STATUS.md`](../STATUS.md) و[`ROADMAP.md`](../ROADMAP.md) و[`STAGES/`](../STAGES/) و
   [`Docs/Waves.md`](Waves.md) ولوحته [`Docs/Waves/board.html`](Waves/board.html).

```bash
git clone https://github.com/iSltanX/rasd.git && cd rasd
nvm use && corepack enable
pnpm install --frozen-lockfile
pnpm gate:a
```

على نسخة جديدة تُشغَّل `pnpm gate:a` مرّة لإثبات البيئة، ويجب أن تخرج خضراء. بعدها تُشغَّل
مرّة عند إغلاق كل مرحلة، لا بعد كل تعديل — «اقتصاد الفحوص» في [`AGENTS.md`](../AGENTS.md).
المستودع خاصّ: الوصول من حساب آخر يتطلّب
منحه صلاحية على المستودع.

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
توثّقها `Docs/Design.md` عند إغلاق [`STAGES/02`](../STAGES/02.md).
