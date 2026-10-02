---
id: SS3
title: حزم القنوات وحزمة المصدر وسير الإصدار
status: pending
delivery: none
wave: B
order: 2
depends: [SS1]
model: Sonnet 5.5
size: S
branch: ss/3-channel-packages
gate: cone
commit: —
updated: 2026-10-02
resume: ابدأ بـ`scripts/zip.mjs --target firefox` ثمّ حزمة المصدر، ثمّ `release.yml`.
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

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
