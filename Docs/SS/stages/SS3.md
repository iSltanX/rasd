---
id: SS3
title: حزم القنوات وحزمة المصدر وسير الإصدار
status: done
delivery: merged
wave: B
order: 2
depends: [SS1]
model: Sonnet 5.5
size: S
branch: ss/3-channel-packages
gate: cone
commit: 10056cb
updated: 2026-10-02
resume: المرحلة مغلقة — دُمجت في الموجة B. خارج النطاق ومسجَّل في سجلّها: توحيد سقف تحذيرات web-ext بين ci.yml وzip:firefox، وتشغيل الحزمة في Firefox حقيقي (SS7).
---

# SS3 — حزم القنوات وحزمة المصدر وسير الإصدار

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §2 و§4.6 و§4.8.

## الهدف

وسمٌ واحد `vX.Y.Z` يعطي الحزم الثلاث ببصماتها مسوَّدةَ إصدار: `rasd-<v>.zip` (Chrome وEdge وOpera) و`rasd-<v>-firefox.zip`
(بعد `web-ext lint` بصفر خطأ) و`rasd-<v>-source.zip` (ما يطلبه AMO وOpera لأن الحزمة مصغَّرة) — وبناء حزمة المصدر في
بيئة نظيفة يعطي البصمتين نفسيهما.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `scripts/zip.mjs` و`scripts/lib/release-pack.mjs` ⇐ `--target` وحزمة المصدر (`git archive HEAD` + README البناء)
- `package.json` ⇐ `zip:firefox` و`zip:source` و`zip:all` و`build:all`
- `Docs/Store/source-README.md` (جديد): نظام التشغيل وNode من `.nvmrc` و`pnpm install --frozen-lockfile` وأوامر البناء والبصمتان
- `.github/workflows/release.yml` ⇐ يبني الهدفين ويرفق الحزم الثلاث
- `.github/workflows/ci.yml` ⇐ في «فحوص ساكنة»: `build:firefox` و`verify:dist --target firefox` و`web-ext lint`
- `tests/unit/build/release-pack.test.ts` ⇐ حزمة المصدر وفحص Firefox
- `Docs/Release/channels.md` (جديد): القناة · النسخة المنشورة · التاريخ · البصمة · رابط الإصدار
- `Docs/Development.md` ⇐ الأوامر

**خارج النطاق**

- أيّ تغيير في `src/`
- تشغيل الحزمة في Firefox حقيقي (SS7) ومواد المتاجر (SS8)

## المهامّ

1. `zip.mjs --target firefox`: يفحص `dist-firefox/` بـ`verify:dist --target firefox` ثمّ `web-ext lint` (صفر خطأ)، ثمّ يضغط حتميًّا إلى `dist-zip/rasd-<v>-firefox.zip` مع `.sha256`؛ ويرفض حزمة Firefox بلا `gecko.id`.
2. `zip:source`: `git archive` للالتزام الحالي مع `Docs/Store/source-README.md` في الجذر، ويرفض شجرةً غير نظيفة.
3. `release.yml`: `build:all` ثمّ `zip:all --tag`، ويرفق الثلاث ببصماتها في مسوَّدة الإصدار (لا نشر).
4. `ci.yml`: خطوات Firefox الساكنة في وظيفة «فحوص ساكنة» — دقيقة بلا متصفّح. (إن رفض مصنّف الأدوات التعديل يُترك للمالك ويُذكر.)
5. إثبات حزمة المصدر: `git worktree` نظيف من الحزمة المفكوكة ⇐ `pnpm install --frozen-lockfile && pnpm build:all && pnpm zip:all` ⇐ البصمتان نفساهما.

## معايير الإغلاق

- `pnpm build:all && pnpm zip:all` يعطي الحزم الثلاث و`.sha256` لكلٍّ، وبصمة `rasd-<v>.zip` كما كانت قبل SS1
- `pnpm vitest run tests/unit/build/release-pack.test.ts` أخضر بسالبٍ لكل رفض جديد
- وسمٌ تجريبي `v0.1.0-trial.N` على فرع المرحلة يُرفق الحزم الثلاث بالبصمات نفسها (كما في `STAGES/27`)
- بناء حزمة المصدر في بيئة نظيفة يعطي البصمتين نفسيهما — مكتوبٌ في السجلّ بأمره

## المخاطر

- تعديل `ci.yml` قد يرفضه مصنّف الأدوات («CI Bypass»): يُحضَّر الفرق ويُطبّقه المالك، ولا تتوقّف المرحلة عليه
- `web-ext lint` يحذّر من `innerHTML` (أيقونات SVG ثابتة): تحذيران مقبولان مكتوبان في README المصدر

## المراجع

- `Docs/Browsers/Architecture.md` §2 (متطلّبات المصدر) و§4.6 و§4.8 و§4.10
- ADR 0057 · `STAGES/27` (البناء الحتمي والوسم التجريبي)
- Extension Workshop — source code submission · Opera acceptance criteria

## سجلّ التنفيذ

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                                                                                                                                                                                                                               | الدليل                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                |
| 2026-10-02 | **الأساس قبل أي تعديل:** بصمة Chromium على `ss-B/base`                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm build:bundle && pnpm zip` ⇒ `rasd-0.1.0.zip` = `65cd1726…049f011` (= المسجَّلة في SS1 قبل أي تعديل)                                                                        |
| 2026-10-02 | `scripts/zip.mjs --target chromium\|firefox\|source\|all` (الافتراضي chromium كما كان): لكل هدف فحص الحداثة ثمّ `verify:dist --target <هدف>` ثمّ فحص الإصدار؛ ولـFirefox `web-ext lint` بتقرير JSON (صفر خطأ وصفر ملاحظة، و`UNSAFE_VAR_ASSIGNMENT` تحذيران لا أكثر — القياس الفعلي تحذيران: `content.js` وقطعة `RasdMark`) ورفض بيانٍ بلا `gecko.id`. وفي `all` أوّل رفضٍ يمنع كتابة أيٍّ منها، ويُفرَّغ من `dist-zip/` ما يخصّ الأهداف المطلوبة وحدها | `pnpm build:all && pnpm zip:all` ⇒ ثلاث حزم و`.sha256` لكلٍّ؛ `shasum -a 256 -c` ⇒ OK ×3؛ `rasd-0.1.0.zip` = `65cd1726…049f011` **كما كانت**                                     |
| 2026-10-02 | `zip:source`: `git archive --format=tar HEAD` ثمّ قارئ tar داخلي (ustar وpax؛ يرفض الرابط الرمزي) فالضغط الحتمي نفسه؛ `Docs/Store/source-README.md` يدخل جذر الحزمة باسم `SOURCE-README.md`. يرفض شجرةً غير نظيفة ووسمًا لا يشير إلى `HEAD`                                                                                                                                                                                                            | شجرة متسخة ⇒ «رُفض الضغط: الشجرة غير نظيفة (2 مدخلًا)»؛ `--tag v0.1.0-trial.9` بلا وسم ⇒ «لا يشير إلى HEAD»؛ محتوى الحزمة المفكوكة = `git ls-files` + `SOURCE-README.md` بلا فرق |
| 2026-10-02 | `package.json`: `build:all` (الهدفان + `verify:dist --target firefox`) و`zip:firefox` و`zip:source` و`zip:all`. `release.yml` يبني `build:all` ثمّ `zip:all --tag` ويرفق الثلاث ببصماتها مسوَّدةً بلا نشر ويفشل إن لم تكن ثلاثًا. `ci.yml` («فحوص ساكنة»): `build:firefox` ثمّ `verify:dist --target firefox` ثمّ `web-ext lint`. `Docs/Release/channels.md` و`Docs/Development.md`                                                                    | `pnpm guards:check` ⇒ يطابق `ci.yml`؛ `pnpm format:check` أخضر؛ تعديل `ci.yml` لم يرفضه مصنّف الأدوات                                                                            |
| 2026-10-02 | اختبارات `release-pack.test.ts` (+28 حالة: من 32 إلى 60): `gecko.id` (4 حالات سالبة) · اسم كل حزمة · `pack` لـFirefox (مدقّق يرفض، `verify` يسبقه، لاحقة التجريبي) · `lintProblems` (خطأ · تحذير ثالث · نوعٌ آخر · ملاحظة · تقرير فاسد) · `sourceProblems` · `tarFiles` على مستودع مؤقّت فيه اسم عربي ومسار فوق مئة حرف (pax) ورابط رمزي · حتمية بصمة المصدر وتغيّرها بتغيّر الالتزام                                                                  | `pnpm vitest run tests/unit/build/release-pack.test.ts` ⇒ 60 ناجحًا                                                                                                              |
| 2026-10-02 | **بناء حزمة المصدر في بيئة نظيفة:** فُكّت `rasd-0.1.0-source.zip` في مجلّد آخر عميق المسار **بلا `.git`** ثمّ `pnpm install --frozen-lockfile && pnpm build:all && pnpm zip && pnpm zip:firefox` ⇒ البصمتان نفساهما بالبايت (لا يقرأ البناء تاريخ Git ولا المسار)؛ ولذا يطلب README المصدر `zip` و`zip:firefox` لا `zip:all` (الأخير يحتاج `git`)                                                                                                      | `rasd-0.1.0.zip` = `65cd1726…049f011` · `rasd-0.1.0-firefox.zip` = `1a0c2570…29bc` في المجلّدين                                                                                  |
| 2026-10-02 | **الوسم التجريبي `v0.1.0-trial.1` على `ss/3-channel-packages` (6c19915):** شغّل `release.yml` على لينكس (الجولة 36970212084، خضراء، 1م18ث) فأرفق بمسوَّدة إصدارٍ مسبق الحزم الثلاث و`.sha256` لكلٍّ، **بالبصمات نفسها التي حُسبت على macOS** (Chromium `65cd1726…` · Firefox `1a0c2570…` · المصدر `3dc9a90b…`)؛ `gh release download` ثمّ `shasum -a 256 -c` ⇒ OK ×3. ثمّ حُذف الإصدار والوسم محلّيًّا وبعيدًا                                         | `git ls-remote --tags origin 'refs/tags/v*'` فارغ · `gh release list` فارغ                                                                                                       |
| 2026-10-02 | بوّابة الإغلاق: `RASD_GATE_BASE=ss-B/base pnpm gate:a` ⇒ خضراء (6142 اختبارًا) في 86 ث (السقف 48 — حمل الجهاز 40–64 من جلسات الموجة المتوازية؛ ويطابق ما سُجِّل في SS1)؛ `pnpm verify:wave --base ss-B/base --size cone` ⇒ المخروط «لا شيء، وملفٌّ خارج جدوله ⇒ all» فشُغّلت الستة والعشرون: **26/26 خضراء** في 11.7 دقيقة                                                                                                                             | انظر تقرير التسليم                                                                                                                                                               |

**أعطال متقطّعة:** المحاولة الأولى لـ`gate:a` سقطت بمهلة خمس ثوانٍ في `tests/unit/store-materials.test.ts` («لقطةٌ لكل بندٍ…» 6272ms) والحمل 56؛ والاختبار وحده يمرّ في 0.9 ث (21/21) وأعادت البوّابة فمرّت. سقوط بمهلة تحت حمل لا بمنطق، ولا صلة للملفّ بالتغيير.

**المتبقّي:** لا شيء في النطاق.

### تقرير التسليم — SS3

- الفرع: `ss/3-channel-packages` · الأساس: `ss-B/base` (`f66a2f7`) · آخر التزام عمل: `6c19915`
- الفرق: 13 files changed, 835 insertions(+), 129 deletions(-)
- الملفّات الحسّاسة الملموسة: لا شيء (من قائمة `AGENTS.md` §4). ملموس: `scripts/zip.mjs` و`scripts/lib/release-pack.mjs` و`package.json` و`.github/workflows/release.yml` و`ci.yml` — لا `src/`
- معايير الإغلاق:
  - `pnpm build:all && pnpm zip:all` ⇒ ثلاث حزم و`.sha256` لكلٍّ (`shasum -a 256 -c` ⇒ OK ×3)؛ `rasd-0.1.0.zip` = `65cd172689555703c70e0acd98e93f0ecd3288f7d826df4f11562a960049f011` = بصمتها قبل SS1 (المسجَّلة في SS1)
  - `pnpm vitest run tests/unit/build/release-pack.test.ts` ⇒ 60 ناجحًا، وسالبٌ لكل رفضٍ جديد (`gecko.id` · مدقّق AMO · تقرير فاسد · شجرة متسخة · وسم لا يشير إلى HEAD · رابط رمزي · تحذير ثالث)
  - وسم `v0.1.0-trial.1` على الفرع ⇒ الجولة 36970212084 على لينكس أرفقت الحزم الثلاث بالبصمات نفسها (`gh release download` + `shasum -c` ⇒ OK ×3)، ثمّ حُذف الإصدار والوسم
  - حزمة المصدر في بيئة نظيفة بلا `.git`: `pnpm install --frozen-lockfile && pnpm build:all && pnpm zip && pnpm zip:firefox` ⇒ `65cd1726…049f011` و`1a0c2570…29bc` نفساهما
- مخروط الأثر: «لا شيء · 1 ملفًّا خارج جدوله ⇒ all» · `pnpm verify:wave --base ss-B/base --size cone` ⇒ 26/26 خضراء
- المراجعة المستقلّة: لم تلزم — لا ملفّ من قائمة §4 الحسّاسة
- أعطال متقطّعة مسجَّلة: `store-materials` («لقطةٌ لكل بندٍ…») مهلة 5 ث تحت حمل 56، وحده يمرّ 21/21؛ وجولة `gate:a` الثانية خضراء. لا حارس كروم سقط
- خارج النطاق — مسجَّل لا منفَّذ: سقف التحذيرات في `ci.yml` (الخطوة تستعمل `web-ext lint` الخام فتُسقطها الأخطاء وحدها، والسقف يفرضه `zip:firefox` عند الإصدار؛ توحيد الاثنين بسكربتٍ واحد = قرار لاحق) · تشغيل حزمة Firefox في Firefox حقيقي (SS7) · مواد المتاجر (SS8) · `Docs/Release/channels.md` فارغ عمدًا (لا تقديم بعد)
- ما يحتاجه منسّق الإغلاق: لا اعتمادية جديدة (`web-ext` موجود منذ SS1) · لا إضافة إلى العقد · لا حارس معدَّل (`guards:sync` لم يلزم؛ `guards:check` يطابق) · لا صفوف §6 ولا ADR · الملفّات المشتركة: `package.json` (سكربتات `build:all` و`zip:*`) و`Docs/Development.md` (قسمان: «الحزم والإصدار» وسطرا الجدول) تُضمّ بترتيب الدمج · ما ينتظر المالك: لا شيء (تعديل `ci.yml` مرّ)
