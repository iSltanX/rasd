---
id: SS1
title: أساس الهدفين — chromium وfirefox من مصدر واحد
status: active
delivery: local
wave: A
order: 1
depends: []
model: Sonnet 5.5
size: S
branch: main
gate: all
commit: —
updated: 2026-10-02
resume: ابدأ بـ`src/shared/platform/target.ts` واختبار العزل، ثمّ `buildManifest(target)` وبصمة حزمة Chromium قبل أي تعديل.
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

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
