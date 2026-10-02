---
id: SS2
title: هوية المتصفّح في البلاغ
status: active
delivery: branch
wave: B
order: 1
depends: [SS1]
model: Sonnet 5.5
size: S
branch: ss/2-browser-identity
gate: cone
commit: c5c60e4
updated: 2026-10-02
resume: المرحلة مسلَّمة على الفرع وتنتظر دمج منسّق الموجة B؛ المتبقّي على المالك أو المنسّق تشغيل `node scripts/chromium-probe.mjs --browser=opera` على جهازٍ فيه Opera.
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

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                                                          | الدليل                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                                                                    | —                                                                                              |
| 2026-10-02 | `platform/identity.ts` (`detectIdentity`): Firefox من `getBrowserInfo`، وChromium من علامات العميل، و`install_source` من `management.getSelf().installType` ثمّ مضيف `update_url`؛ والحقول الأربعة في `diagnosticsFor` مقصوصةً، وأسماؤها العربية في نافذة البلاغ، والوثائق الأربع | `c5c60e4`                                                                                      |
| 2026-10-02 | وصول بلاغ بالحقول الأربعة: `browser_id=chrome` · `engine=Chromium 154.0.8037.93` · `build_target=chromium` · `install_source=unpacked`                                                                                                                                            | `node scripts/report-proof.mjs` ⇒ البلاغ [#7](https://github.com/iSltanX/app-reports/issues/7) |
| 2026-10-02 | المسبار يقرأ صفّ `browser_id` من «ما سيُرسَل»: Brave ⇒ `brave` · Chrome ⇒ `chrome` · Edge ⇒ `edge` (كلها `install_source=unpacked` مقيسًا)                                                                                                                                        | `node scripts/chromium-probe.mjs --browser=brave\|chrome\|edge`                                |
| 2026-10-02 | البوّابة A خضراء (125 ثانية فوق سقف الـ48 المعروف في SS1)، وحرّاس كروم 26 من 26 في 11.2 دقيقة                                                                                                                                                                                     | `RASD_GATE_BASE=ss-B/base pnpm gate:a` · `pnpm verify:wave --base ss-B/base --size cone`       |

**المتبقّي:** `--browser=opera` لم يُشغَّل (Opera غير مثبّتة على هذا الجهاز)؛ ومن المالك تعديل خادم `app-reports` (العنوان والوسما `browser:*`/`target:*`).

### تقرير التسليم — SS2

- الفرع: `ss/2-browser-identity` · الأساس: `ss-B/base` (`f66a2f7`) · آخر التزام عمل: `c5c60e4`
- الفرق: 22 files changed, 776 insertions(+), 63 deletions(-)
- الملفّات الحسّاسة الملموسة: لا شيء
- معايير الإغلاق:
  - `pnpm vitest run tests/unit/shared/platform tests/unit/modules/report tests/unit/pages/settings/report-dialog.test.tsx` (مع `platform-isolation` و`store-materials`): 148 اختبارًا أخضر، ولكل مصدر هوية حالة غيابه في `identity.test.ts`.
  - `tests/unit/store-materials.test.ts`: 21 أخضر.
  - `VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs`: وصل البلاغ #7 بالحقول الأربعة.
  - `chromium-probe.mjs --browser=brave`: `browser_id=brave` ✓. `--browser=opera`: **لم يُشغَّل — Opera غير مثبّتة هنا**. (وChrome وEdge شُغِّلا إضافةً ✓.)
- مخروط الأثر: `verify:network` · `verify:accessibility` · `verify:visual` + ملفّان خارج الجدول ⇒ `all`؛ `pnpm verify:wave --base ss-B/base --size cone` ⇒ 26 من 26 أخضر
- المراجعة المستقلّة: لم تلزم (لا ملفّ حسّاس)
- أعطال متقطّعة مسجَّلة: لا شيء. وخطوة «تحذيرات التثبيت» الأخيرة في المسبار تسقط في المتصفّحات الثلاثة بتحذير «Optional permission … redundant» ناتجٍ عن إعادة كتابة المسبار لـ`host_permissions` — سابقٌ على المرحلة ولم يُمسّ.
- خارج النطاق — مسجَّل لا منفَّذ: `pages/editor/page-meta.ts` يسمّي المتصفّح بتعبير UA خاصّ به (تسمية عرض)، لم ينتقل إلى `identity.ts`؛ Vivaldi يُقرأ `chromium` (لا `vivaldi` في القاموس المغلق)؛ مضيفا `update_url` لمتجر Edge وOpera من الوثائق لا من تثبيتٍ فعلي.
- ما يحتاجه منسّق الإغلاق: لا اعتمادية ولا حارس معدَّل ولا صفوف §6 أو ADR مستعملة. `Docs/Privacy.md` عُدِّل في بند التشخيص وحده (يُضمّ مع SS4). ينتظر المالك: خادم `app-reports` (عقد 1.1)، وتشغيل مسبار Opera.
