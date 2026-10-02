---
id: SS7
title: نواة BiDi وحرّاس Firefox
status: done
delivery: merged
wave: C
order: 1
depends: [SS3, SS4]
model: Opus 5.5
why_model: أكبر بند في الخطّة — نواة اختبار جديدة فوق بروتوكول آخر، واثنا عشر حارسًا بموجب وسالب، وسجلّ ترقية لا يمسّ سلاسل حرّاس كروم
size: L
branch: ss/7-firefox-guards
gate: all
commit: a54a2c4
updated: 2026-10-02
resume: المرحلة مغلقة — دُمجت في الموجة C. المتبقّي جولة لينكس لوظيفة `firefox` في الجولة اليدوية ثمّ `pnpm guards:firefox-sync` والتزامه (ينتظر الجولة اليدوية).
---

# SS7 — نواة BiDi وحرّاس Firefox

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §4.7 و§4.9. **قبل اكتمالها لا
> يُكتب «Firefox مدعوم»** — المعيار نفسه الذي حُكم به على Chromium.

## الهدف

رحلات رصد في Firefox حقيقي بحرّاس تُعاد — كلٌّ بموجبٍ وسالب — محلّيًّا وعلى عدّاء لينكس، بنواة BiDi منفصلة عن نواة CDP
التي لا تُمسّ، وبقفلٍ ومنافذ خاصّة فلا يطول زمن بوّابة Chromium ولا يُدرج حارس Firefox في `allGuards`. وفي ختامها
`Docs/Launch/browsers.json` يقول عن Firefox `supported` بدليله.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `scripts/lib/bidi.mjs` (جديد) من `scripts/firefox-probe.mjs`: الإقلاع والتثبيت المؤقّت وتثبيت UUID وفتح صفحات الإضافة بـ`tabs.create` والتقييم والانتظار واللقطة والتنظيف
- `scripts/firefox/verify-<name>.mjs` (≈12): `load` · `popup` · `activate` · `measure` · `inspect` · `colour` · `capture` · `fullpage` · `editor` · `export` · `library` · `lifecycle` · `network`
- `scripts/firefox-verify.mjs` (جديد): المنسّق بقفلٍ (منفذ خاصّ) ومهلة لكل حارس، و`--only`
- `package.json` ⇐ `firefox:<name>` و`verify:firefox` (الأسماء خارج نمط `verify:` للحرّاس كي لا تدخل `allGuards`)
- `scripts/wave-verify.mjs` ⇐ `--firefox` يشغّل `verify:firefox` بعد حرّاس كروم (ليس حارسًا مثبَّت البصمة)
- `scripts/store-package.mjs --browser=firefox` ⇐ الحزمة المضغوطة مفكوكةً في Firefox: التثبيت وصفر خطأ طرفية
- `.github/workflows/ci.yml` ⇐ وظيفة `firefox` غير حاجبة على لينكس بـ`setup-firefox`
- سجلّ ترقية حرّاس Firefox في ملفّه (لا `.github/guards-ledger.json`) — القرار يُكتب هنا بـADR
- `Docs/Waves.md` لا يُمسّ (أرشيف)؛ القواعد في `Docs/SS/README.md` («التحقّق») و`Docs/Development.md`
- `Docs/Launch/browsers.json` و`browsers.md` و`README.md` ⇐ Firefox `supported`
- `Docs/ADR/00NN-firefox-guards.md` (جديد)

**خارج النطاق**

- أيّ تعديل في `scripts/lib/cdp.mjs` أو `scripts/verify-*.mjs` (مثبَّتة البصمة)
- E2E بـPlaywright لـFirefox
- `lighthouse` و`memory` و`visual` و`accessibility` لـFirefox (أدوات Chrome أو خطوط أساس Chrome)

## المهامّ

1. `bidi.mjs`: الحلول المقيسة في المسبار تنتقل إليه (`-remote-allow-system-access`، وفتح صفحات الإضافة من صفحة لها، وتثبيت UUID، ولقطات الطبقة صورًا وصفحات الإضافة نصًّا)، وبصمة النواة تدخل بصمة كل حارس.
2. الحرّاس بترتيب القيمة: `load` (التثبيت + `web-ext lint` صفر خطأ) ثمّ `popup` ثمّ `activate` … ثمّ `network` بـBiDi `network.*`. كلٌّ بسالبه عبر `RASD_GUARD_SABOTAGE`.
3. المنسّق والقفل والمهلة، و`--firefox` في `wave-verify.mjs`.
4. CI: وظيفة Firefox غير حاجبة؛ وسجلّ ترقيتها بقراره (ADR).
5. `store:package --browser=firefox`، ثمّ `browsers.json`: Firefox `supported` بالدليل.

## معايير الإغلاق

- `pnpm verify:firefox` خضراء كلّها محلّيًّا مرّتين متتاليتين، ومرّة على عدّاء لينكس (الجولة اليدوية)
- لكل حارس سالبٌ ثابت بـ`RASD_GUARD_SABOTAGE` مكتوبٌ في السجلّ بأمره
- `pnpm verify:wave --base ss-C/base` لـChromium **لم يتغيّر زمنه** ولا قائمته (الحرّاس الجديدة خارج `allGuards`)
- `pnpm guards:check` أخضر بلا تعديل في `scripts/verify-*.mjs` ولا `cdp.mjs` (`git diff --stat ss-C/base -- scripts/lib/cdp.mjs scripts/verify-*.mjs` فارغ)
- `pnpm store:package --browser=firefox` صفر خطأ، و`pnpm vitest run tests/unit/store-materials.test.ts` أخضر مع Firefox `supported`

## المخاطر

- BiDi لا يلتقط صفحات الإضافة صورًا [مقيس] فحكمها نصّي؛ و`network.*` في BiDi غير `Network` في CDP — حارس `network` يُبنى من جديد لا يُنقل
- Firefox على عدّاء CI ووقته المفوتر: الوظيفة غير حاجبة، وتُقرأ استشاريةً (ADR 0026)
- الحجم L: تُسلَّم على دفعات ملتزَمة محلّيًّا، والدفعة الأولى (`load` و`popup`) تثبت النواة قبل البقيّة

## المراجع

- `Docs/Browsers/Architecture.md` §4.7 و§4.9
- `Docs/Firefox/firefox_rasd.md` §6 (الطبقات) و«كيف قِيس» (قيود BiDi المقيسة)
- `scripts/firefox-probe.mjs` (النواة الأولى) · ADR 0042 (النواة المشتركة) · ADR 0019 (سجلّ الترقية)

## سجلّ التنفيذ

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | الدليل                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                    |
| 2026-10-02 | **دفعة 1 — النواة:** `scripts/lib/bidi.mjs` من `firefox-probe.mjs` بعقد `startGuard` في `cdp.mjs`، لا تستورد منه. قِيس في Firefox 157 ما لا ينقله النقل الحرفي: `input.performActions` و`captureScreenshot` يرفضان السياق المميَّز (صفحات الإضافة ونافذة المتصفّح)؛ `log.entryAdded` أعمى عن `console.error` في صفحة إضافة؛ `network.*` أعمى عن `fetch` الإضافة وخلفيتها؛ `--window-size` مجهول. فصارت في النواة: صفحة فحص فارغة في نسخة الفحص تُفتح من سياق المتصفّح (`gBrowser.addTab`)، والطرفية من `Services.console` والخَرْج القياسي، و`--width/--height`. ثمّ `load` و`popup` والمنسّق `firefox-verify.mjs` (قفل 9228، مهلة، `--only`)، و`verify:wave --firefox`، و`firefox` في `NOT_GUARDS`، ومخروط الأثر يعرف `scripts/firefox/` و`bidi.mjs` (كان `scripts/lib/` يطلب الستّة والعشرين)                                                                                                                                                                                                                                                                                                                                                                                                                | `35a14d4` · `pnpm firefox:load` · `pnpm firefox:popup` · `tests/unit/firefox-verify.test.ts` · `tests/unit/impact.test.ts`                                           |
| 2026-10-02 | **دفعة 2 — الطبقة:** `activate` و`measure` و`inspect` و`colour` بالمسار الحقيقي (`tool/activate`) ومؤشّر BiDi موثوق، والحكم من الجلسة الحيّة (`window.__rasdSession`) دون إقلاع واحدة. **عطلٌ حابس كشفه `colour`:** `src/content/sampler.ts` (SS5) يمرّر `Uint8Array` من حجرة سكربت المحتوى إلى `ImageDecoder` من حجرة الصفحة، فيُبلغ Firefox «Permission denied to access object» غير ملتقَط عند المُنشئ والفكّ نفسه ينجح — قِيس بسبع صيغ: العرض يُبلغه، و`ArrayBuffer` لا. يمرّر المخزن الآن (البايتات نفسها)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `c10da86` · `pnpm vitest run tests/unit/content/sampler.test.ts` يسقط قبله وينجح بعده · `pnpm firefox:colour`                                                        |
| 2026-10-02 | **دفعة 3 — الالتقاط والمحرّر والتصدير، وملاحظة المالك:** `capture` (منطقةٌ من سكربت المحتوى بأبعادٍ دقيقة وبكسلاتٍ حمراء بعد الحفظ، و«احفظ نسخة في التنزيلات» ملفّ PNG على القرص من `blob:`؛ و`captureVisibleTab` يشمل شريط التمرير في Firefox) · `fullpage` (24 علامة، مرّة، وبالترتيب) · `editor` (حجبٌ بسحبٍ أصليّ `nativeMouse` — `sendNativeMouseEvent` من نافذة المتصفّح أحداثٌ `isTrusted` والتقاط المؤشّر يعمل؛ وCSP صفحات الإضافة في Firefox يمنع `fetch(blob:)` فالبايتات من الملفّ المنزَّل بنقرٍ أصليّ) · `export` (`saveAs: true` يفتح منتقيًا أصليًّا معلّقًا بلا رأس ⇐ `acceptSavePrompts`). **ملاحظة المالك (البلاغ #10: المتصفّح وإصداره وإصدار النظام والمعمارية `unknown`):** السبب مقيس — `dist-firefox/` في النسخة الرئيسية بُني 08:17 قبل هوية SS2 (لا `getBrowserInfo` ولا `install_source` في حزمته)، والبلاغان #9 و#10 يحملان مفتاحين فقط يطابقانه وبلاغ كروم #8 ثمانية؛ و`aarch64` اسم Firefox لـARM64 لم يكن في قاموس `diagnostics.ts` — أُصلح؛ وإصدار النظام لا يكشفه Firefox (`navigator.oscpu` مجمَّدٌ على `Intel Mac OS X 10.15` على ماك ARM بـmacOS 27) فيبقى `unknown` صادقًا. وحارسٌ جديد `report` يقرأ «ما سيُرسَل» مقابل `Services.appinfo`، وسالبه المسمّى يعيد عَرَض #10 | `bd24f5c` · `pnpm vitest run tests/unit/modules/report/diagnostics.test.ts` يسقط قبله وينجح بعده · `gh issue view 10 -R iSltanX/app-reports` · `pnpm firefox:report` |
| 2026-10-02 | **دفعة 4:** `library` (لقطة حقيقية ومصغّرتها، و5000 مزروعة بتمريرٍ افتراضي وبحث) · `lifecycle` (قِيس: صفحة الأحداث تتوقّف عند ≈30ث بلا قناة وتبقى `running` معها؛ شاهدان: `uptimeMs` و`backgroundState` من Firefox) · `network` (مراقِب `http-on-opening-request` من قبل التثبيت يلغي كل ما ليس محلّيًّا؛ 21 مسارًا بأثرها؛ طلبات Firefox الداخلية `system` تُعدّ ولا تُحاكَم، و`RSLoader` محمّل تجارب Nimbus بالاسم خارج حكم الطرفية)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `31f3d1b` · `pnpm firefox:lifecycle` · `pnpm firefox:network`                                                                                                        |
| 2026-10-02 | **دفعة 5 — CI والسجلّ:** وظيفة `firefox` في `ci.yml` غير حاجبة على لينكس بـ`setup-firefox` وخطوةٌ لكل حارس (`firefox:<name>`) بمهلة 6 دقائق، و`guards:firefox-check` في «فحوص ساكنة» وفي `gate:a`. سجلّ الترقية `.github/firefox-guards-ledger.json` بـ`scripts/firefox-ledger.mjs` (قواعد `guards-sync.mjs` مستوردة؛ خاتمة الخطوة؛ جولات ما قبل الوظيفة مستبعدة — 88 في أوّل التقاط). ADR 0059                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `ce3c6cf` · `pnpm guards:firefox-check` · `tests/unit/firefox-ledger.test.ts`                                                                                        |
| 2026-10-02 | **دفعة 6 — الحزمة والإعلان:** `store:package --browser=firefox` (الحزمة المضغوطة مفكوكةً كما هي: `web-ext lint`، والتثبيت عبر BiDi، وصفر تحذير بيان — `extension.warnings` وطرفيّته، لا `nsIScriptError` — وصفر خطأ تشغيل)، و`browsers.json` وREADME و`browsers.md`: Firefox `supported` بدليله، و`Docs/Development.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `e7a24bf` · `pnpm store:package --browser=firefox` · `pnpm vitest run tests/unit/store-materials.test.ts`                                                            |
| 2026-10-02 | **التحقّق:** `RASD_GATE_BASE=ss-C/base pnpm gate:a` أخضر (6243 اختبارًا؛ 91ث فوق سقف 48 — موروث كما سُجّل في إغلاق B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `cd5617c`                                                                                                                                                            |

| 2026-10-02 | **الجولة الختامية على الحالة النهائية:** `RASD_FIXTURES_PORT=5481 pnpm verify:wave --base ss-C/base --size all --firefox` — كروم 26/26 في 11.1 دقيقة (القائمة 26 كما هي، والحرّاس الجديدة خارجها) ثمّ Firefox 14/14 في 2.5 دقيقة، كلّها من أوّل محاولة؛ ثمّ `pnpm verify:firefox` 14/14 مرّةً ثانية متتالية؛ ثمّ السوالب العشرون كلّها حمراء (الجدول أدناه). و`5481` لأن خادم عيّنات يتيمًا من worktree المرحلة 17 (منذ 2026-10-01) يحتلّ 5399 ويخدم عيّناته هو — السابقة نفسها في إغلاق B، ولم يُمسّ | `cd5617c` |

### السوالب — كلٌّ بأمره، وكلّها حمراء على الحالة النهائية

| الحارس          | الأمر                                                                   | أوّل سطر ساقط                                                                           |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `load`          | `RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:load`        | جولة التعريف لم تُفتح عند التثبيت (ومعها: الخلفية لا تردّ، و`rasd-sabotage` في الطرفية) |
| `popup`         | `RASD_GUARD_SABOTAGE=src/pages/popup/index.html pnpm firefox:popup`     | النافذة لم تُرسم                                                                        |
| `activate`      | `RASD_GUARD_SABOTAGE=content.js pnpm firefox:activate`                  | صفر مضيف بعد التفعيل — `boot-failed`                                                    |
| `measure`       | `RASD_GUARD_SABOTAGE=content.js pnpm firefox:measure`                   | تعذّر تفعيل القياس                                                                      |
| `inspect`       | `RASD_GUARD_SABOTAGE=content.js pnpm firefox:inspect`                   | تعذّر تفعيل الفحص                                                                       |
| `colour`        | `RASD_GUARD_SABOTAGE=content.js pnpm firefox:colour`                    | تعذّر تفعيل الألوان                                                                     |
| `capture`       | `RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:capture`     | التقاط المنطقة فشل                                                                      |
| `fullpage`      | `RASD_GUARD_SABOTAGE=content.js pnpm firefox:fullpage`                  | full-page لم تُحفظ لقطته                                                                |
| `editor`        | `RASD_GUARD_SABOTAGE=src/pages/editor/index.html pnpm firefox:editor`   | المحرّر لم يرسم مسرحه                                                                   |
| `export`        | `RASD_GUARD_SABOTAGE=src/pages/editor/index.html pnpm firefox:export`   | زرّ «تصدير» لم يظهر                                                                     |
| `library`       | `RASD_GUARD_SABOTAGE=src/pages/library/index.html pnpm firefox:library` | الشبكة لم تظهر                                                                          |
| `report`        | `RASD_GUARD_SABOTAGE=src/pages/settings/index.html pnpm firefox:report` | نافذة البلاغ لم تُفتح                                                                   |
| `report`        | `RASD_BREAK_IDENTITY=1 pnpm firefox:report`                             | `browser=unknown` و`browser_version=unknown` — عَرَض البلاغ #10 نفسه                    |
| `lifecycle`     | `RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:lifecycle`   | `diagnostics/ping` بلا مستقبِل                                                          |
| `lifecycle`     | `RASD_BREAK_KEEPALIVE=1 pnpm firefox:lifecycle`                         | الخلفية `stopped` عند Firefox وعمرها صُفِّر                                             |
| `network`       | `RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:network`     | لا إعدادات تُقرأ — المسارات لم تجرِ                                                     |
| `network`       | `RASD_BREAK_EGRESS=worker pnpm firefox:network`                         | `api.github.com/rasd-egress-probe` ← مبدؤه `moz-extension://…` (أُلغي قبل الخروج)       |
| `network`       | `RASD_BREAK_EGRESS=content pnpm firefox:network`                        | `rasd-leak.invalid` ← مبدأ سكربت المحتوى الموسَّع                                       |
| `store:package` | `RASD_STORE_BREAK=warning pnpm store:package --browser=firefox`         | تحذير بيان: `rasd_unknown_key`                                                          |
| `store:package` | `RASD_STORE_BREAK=runtime pnpm store:package --browser=firefox`         | خطأ تشغيل في النافذة                                                                    |

**المتبقّي:** الجولة على عدّاء لينكس — الشقّ الثالث من معيار الإغلاق الأوّل: وظيفة `firefox` غير الحاجبة في الجولة اليدوية عند
إغلاق الموجة C (جلسة المرحلة لا تطلق جولة CI)، ثمّ `pnpm guards:firefox-sync`. وإن سقطت على لينكس يُعاد `browsers.json` إلى
ما قبل «مدعوم» حتى تُصلَح.

### تقرير التسليم — SS7

- الفرع: `ss/7-firefox-guards` · الأساس: `ss-C/base` (`3f042af`) · آخر التزام عمل: `cd5617c`
- الفرق: 43 files changed, 5041 insertions(+), 126 deletions(-) (`git diff --stat ss-C/base...HEAD` بعد الالتزام الأخير)
- الملفّات الحسّاسة الملموسة: لا شيء من قائمة `AGENTS.md` §4. وشيفرة المنتج الملموسة سطران بإصلاحين حابسين مع اختباريهما:
  `src/content/sampler.ts` (`ImageDecoder` يأخذ المخزن لا العرض) و`src/modules/report/diagnostics.ts` (`aarch64` ⇐ `arm64`)
- معايير الإغلاق:
  - `pnpm verify:firefox` خضراء مرّتين متتاليتين محلّيًّا: ✓ 14/14 داخل `verify:wave --firefox` ثمّ 14/14 منفردة، من أوّل
    محاولة. **ومرّة على عدّاء لينكس: لم تجرِ** — في الجولة اليدوية عند الإغلاق
  - لكل حارس سالبٌ ثابت بأمره: ✓ عشرون سالبًا حمراء (الجدول أعلاه)
  - `verify:wave --base ss-C/base` لـChromium: ✓ القائمة 26 كما هي (`tests/unit/wave-verify.test.ts` و`firefox-verify.test.ts`)،
    وزمنها 11.1 دقيقة، والحرّاس الجديدة لا تجري فيها إلا بـ`--firefox`
  - `pnpm guards:check` أخضر بلا تعديل: ✓، و`git diff --stat ss-C/base -- scripts/lib/cdp.mjs 'scripts/verify-*.mjs'` فارغ
  - `pnpm store:package --browser=firefox` صفر خطأ: ✓، و`pnpm vitest run tests/unit/store-materials.test.ts` أخضر مع Firefox
    `supported`: ✓ (21/21)
- مخروط الأثر: `RASD_GATE_BASE=ss-C/base pnpm gate:a` أخضر (6243 اختبارًا، 91ث فوق سقف 48 — موروث)، والمخروط: `verify:firefox` و
  `firefox:*` الأربعة عشر و`verify:lighthouse` و`verify:visual` و`verify:network` · `pnpm verify:wave --base ss-C/base --size all
--firefox`: كروم 26/26 وFirefox 14/14
- المراجعة المستقلّة: لم تلزم — لا ملفّ من المنطقة الحسّاسة
- أعطال متقطّعة مسجَّلة: لا شيء — كل حارس أخضر من أوّل محاولة في الجولات الثلاث
- خارج النطاق — مسجَّل لا منفَّذ:
  - **عطلٌ كامن في `src/background/lifecycle.ts:200`** (حسّاس): «صفحتنا» تُعرف بـ`chrome-extension://` فتُوجَّه `capture/run` من صفحة
    إضافة في Firefox إلى تبويبها هي. لا مُرسِل له اليوم (الطبقة وحدها ترسلها)، فلم يحبس المرحلة — مهمّةٌ منفصلة مقترحة
  - شريط المتصفّحات في README (`Docs/Launch/readme/browsers-*.png`) ما زال بخمسة متصفّحات — يُولَّد من `browsers.json` بـ
    `pnpm design:shots && pnpm launch:images` الذي يعيد مواد الإطلاق كلّها: لـSS8
  - `install_source` لنسخة AMO سيكون `unknown` (لا `update_url` يحقنه AMO، و`InstallSource` بلا قيمةٍ له): لـSS8 مع مواد AMO
  - إصدار النظام في بلاغ Firefox `unknown` صادقًا (لا مصدر في Firefox) — إن أراد المالك نصًّا يشرحه في شاشة المراجعة فقرارٌ له
- ما يحتاجه منسّق الإغلاق:
  - **`ci.yml`:** وظيفة `firefox` جديدة وخطوة `guards:firefox-check` — إضافتان لا تقليص؛ والجولة اليدوية تقرأ وظيفة `firefox`، ثمّ
    `pnpm guards:firefox-sync` والتزامه
  - `package.json` (سكربتات `firefox:*` و`verify:firefox` و`guards:firefox-*`) و`Docs/Development.md` و`Docs/ADR/README.md` و
    README: ضمٌّ مع SS6 بترتيب الدمج
  - ADR **0059** مستعمل · لا صفّ §6 · لا حارس كروم معدَّل ولا جديد (فلا `guards:sync`) · لا اعتمادية جديدة (`web-ext` كان مثبَّتًا)
  - **`dist-firefox/` في النسخة الرئيسية قديم** (08:17، قبل SS2) — منه البلاغان #9 و#10؛ يُبنى `pnpm build:firefox` قبل أي تجربة
    يدوية، واختبار SS6 اليدوي يستحقّ إعادةً على حزمةٍ مبنيّة من فرعها
