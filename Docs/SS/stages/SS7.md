---
id: SS7
title: نواة BiDi وحرّاس Firefox
status: pending
delivery: none
wave: C
order: 1
depends: [SS3, SS4]
model: Opus 5.5
why_model: أكبر بند في الخطّة — نواة اختبار جديدة فوق بروتوكول آخر، واثنا عشر حارسًا بموجب وسالب، وسجلّ ترقية لا يمسّ سلاسل حرّاس كروم
size: L
branch: ss/7-firefox-guards
gate: all
commit: —
updated: 2026-10-02
resume: ابدأ بنقل `firefox-probe.mjs` إلى `scripts/lib/bidi.mjs` بواجهة `cdp.mjs` قدر الإمكان، ثمّ `load` و`popup` أوّلًا.
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

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
