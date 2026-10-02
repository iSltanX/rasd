---
id: SS2
title: هوية المتصفّح في البلاغ
status: active
delivery: none
wave: B
order: 1
depends: [SS1]
model: Sonnet 5.5
size: S
branch: ss/2-browser-identity
gate: cone
commit: —
updated: 2026-10-02
resume: ابدأ بـ`src/shared/platform/identity.ts` واختباره بمصادره الثلاثة، ثمّ الحقول الأربعة في `payload.ts`.
---

# SS2 — هوية المتصفّح في البلاغ

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §4.11.

## الهدف

كل بلاغ يصل إلى قناة المالك يقول من أيّ متصفّح ومحرّك وهدف بناء ومصدر تثبيت جاء — في `diagnostics` نفسها بلا تغيير في
عقد القناة — ويعرف Firefox نفسه (اليوم «unknown») وVivaldi نفسه («Chromium»). والمستخدم يرى الحقول الجديدة في «ما سيُرسَل»
قبل النقرة، ونصّ الإفصاح في المتجر والخصوصية يذكرها.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `src/shared/platform/identity.ts` (جديد): `browser` و`browser_id` و`engine` و`build_target` و`install_source` بالكشف لا بالهدف
- `src/modules/report/diagnostics.ts` و`src/modules/report/payload.ts` ⇐ الحقول الأربعة في `diagnosticsFor`
- `src/pages/settings/parts/report/ReportDialog.tsx` ⇐ الأسماء العربية للصفوف الجديدة في المراجعة
- `tests/unit/modules/report/` و`tests/unit/shared/platform/identity.test.ts`
- `Docs/Privacy.md` و`Docs/Store/listing.md` و`Docs/Store/privacy-policy.md` ⇐ نصّ الإفصاح
- `Docs/Support.md` ⇐ ما يُطلب من خادم القناة: العنوان `Rasd / <المتصفّح>: …` ووسما `browser:*` و`target:*` من `browser_id` و`build_target`

**خارج النطاق**

- تعديل خادم `iSltanX/app-reports` — بيد المالك، ولا تنتظره المرحلة
- طلب موافقة جمع البيانات في Firefox (SS6)

## المهامّ

1. `identity.ts`: `runtime.getBrowserInfo` إن وُجدت (Firefox) ⇐ الاسم والإصدار و`engine: Gecko <v>`؛ وإلا علامات العميل كما في
   `pickBrowser` اليوم مع استخراج علامة `Chromium` محرّكًا؛ و`browser_id` تطبيعٌ مغلق (`firefox` · `chrome` · `edge` · `brave` · `opera` · `chromium` · `unknown`)؛
   و`build_target` من `TARGET`؛ و`install_source` من `runtime.getManifest().update_url` (`chrome-web-store` · `edge-add-ons` · `opera-add-ons` · `unpacked` · `unknown`) — **يُقاس** لا يُخمَّن.
2. `payload.ts`: الحقول الأربعة في `diagnosticsFor` مقصوصةً كبقيّتها؛ و`reviewRows` تُظهرها تلقائيًّا.
3. الأسماء العربية في نافذة البلاغ، وتحديث الوثائق الثلاث: «المتصفّح ومحرّكه ونسخة رصد وهدف بنائها ومصدر تثبيتها» — ولا يزال بلا رابط ولا محتوى ولا مكتبة.
4. `Docs/Support.md`: فقرة «عقد 1.1» للمالك — العنوان والوسوم من الحقول، متوافقٌ رجعيًّا.

## معايير الإغلاق

- `pnpm vitest run tests/unit/shared/platform tests/unit/modules/report tests/unit/pages/settings/report-dialog.test.tsx` أخضر، ولكل مصدر هوية حالة غيابه
- `pnpm vitest run tests/unit/store-materials.test.ts` أخضر على النصوص المعدَّلة
- `VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs` يصل ببلاغٍ يحمل الحقول الأربعة (رقمه في السجلّ)
- `node scripts/chromium-probe.mjs --browser=brave` و`--browser=opera` يطبعان `browser_id` صحيحًا من صفحة الإعدادات (يُضاف للمسبار سطرٌ يقرؤه)

## المخاطر

- `install_source`: إن لم يحقن متجرٌ `update_url` يُكتب `unknown` لا تخمين
- `Docs/Privacy.md` تمسّها SS4 أيضًا في موجتها — قسمان مختلفان، ويُضمّ بترتيب الدمج

## المراجع

- `Docs/Browsers/Architecture.md` §4.11 (جدول الحقول والقرار)
- ADR 0050 (القناة والعقد)
- MDN `runtime.getBrowserInfo` · Vivaldi «Client hints or client lies?»

## سجلّ التنفيذ

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
