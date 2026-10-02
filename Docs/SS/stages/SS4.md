---
id: SS4
title: نقاط الفرق بالكشف عن القدرة
status: active
delivery: branch
wave: B
order: 3
depends: [SS1]
model: Sonnet 5.5
size: M
branch: ss/4-capabilities
gate: all
commit: 81affe0
updated: 2026-10-02
resume: سُلِّمت — تنتظر دمج منسّق الموجة B. ما لم يُقَس: الاختصارات في Opera وVivaldi وخطوة التنزيل في Firefox (غير مثبّتَين على هذا الجهاز).
---

# SS4 — نقاط الفرق بالكشف عن القدرة

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §4.5.

## الهدف

«احفظ نسخة في التنزيلات» يعمل في Firefox (`blob:` حين تتوفّر `URL.createObjectURL`)، وصفحة اختصارات المتصفّح تُفتح في كل
متصفّح، والاختصار غير المسنَد (Opera يحجز ثلاثة) يقول للمستخدم أين يسنده، وواجهة «التصفّح الخاص» صادقة في Firefox
(`not_allowed`) — كلّه بالكشف عن القدرة في `capabilities.ts`، والهدف وحده حيث لا قدرة تكشفه.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `src/shared/platform/capabilities.ts` (جديد): `downloadUrl(blob)` · `openShortcutSettings()` · `privateBrowsingModel()` · `dataConsentSupported()`
- `src/background/capture-mirror.ts` ⇐ `blob:` حين تتوفّر، ويُحرَّر بعد `downloads.onChanged`
- `src/pages/shell/ShortcutsSheet.tsx` و`src/pages/settings/parts/ShortcutsTab.tsx` و`src/pages/popup/` ⇐ فتح الصفحة بالقدرة، ورابط «أسنده» للاختصار غير المسنَد
- `src/pages/settings/parts/PrivacyTab.tsx` ⇐ صفّ التصفّح الخاص يُستبدل بجملة في هدف Firefox
- `tests/unit/shared/platform/capabilities.test.ts` و`tests/integration/` (المرآة)
- `Docs/Privacy.md` (قسم التصفّح الخاص) و`Docs/Design.md` (الاختلاف المقصود عن الإطار)
- `scripts/impact.mjs` ⇐ `src/shared/platform/` إلى `verify:popup` و`verify:export`

**خارج النطاق**

- طلب الأذونات وموافقة جمع البيانات (SS6) — هنا الكشف فقط
- حرّاس Firefox (SS7)

## المهامّ

1. `capabilities.ts` بجدول §4.5: كل قدرة تسأل عن واجهتها لا عن المتصفّح؛ و`privateBrowsingModel()` وحدها تقرأ `TARGET`.
2. `capture-mirror.ts`: `downloadUrl(blob)` ⇐ `blob:` أو `data:`؛ ويبقى العقد «لا ترمي ولا ترفض».
3. الاختصارات: `openShortcutSettings()` ⇐ `chrome.commands.openShortcutSettings` إن وُجدت وإلا `tabs.create('chrome://extensions/shortcuts')`؛
   والنافذة تعرض الإسناد الفعلي كما اليوم، وتزيد لغير المسنَد رابطًا — ويُقاس أن الرابط يفتح في Opera وEdge وVivaldi بالمسبار.
4. `PrivacyTab.tsx`: في هدف Firefox جملة «لا يعمل رصد في النوافذ الخاصّة في Firefox» بدل الخيارات الثلاثة؛ و`Docs/Privacy.md` يذكره.

## معايير الإغلاق

- `pnpm vitest run tests/unit/shared/platform tests/integration` أخضر، ولكل قدرة حالتا الحضور والغياب
- `pnpm verify:wave --base ss-B/base --only popup,export,capture` أخضر في Chrome (تتغيّر بصمة حزمة Chromium هنا عمدًا — تُسجَّل)
- `node scripts/chromium-probe.mjs --browser=opera`: الاختصارات الثلاثة غير المسنَدة تعرض الرابط، والرابط يفتح صفحة الاختصارات
- `node scripts/firefox-probe.mjs --only=variant`: «احفظ نسخة في التنزيلات» يُنزِّل ملفًّا (يُضاف للمسبار)

## المخاطر

- `chrome://extensions/shortcuts` في Opera وEdge وVivaldi [متوقَّع]: إن لم يُفتح يُعرض نصٌّ بديل «من صفحة الإضافات» بلا رابط
- `Docs/Privacy.md` تمسّها SS2 في الموجة نفسها — قسمان مختلفان، ويُضمّ بترتيب الدمج

## المراجع

- `Docs/Browsers/Architecture.md` §4.5 و§1.4
- `Docs/Firefox/firefox_rasd.md` §3 و§4 (المقيس: `data:` مرفوض و`blob:` مقبول)
- MDN `commands.openShortcutSettings` · `incognito`

## سجلّ التنفيذ

| التاريخ    | ما أُنجز                                                                                                                                                           | الدليل                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                     | —                                                                                                                                                                                                                                                                                          |
| 2026-10-02 | `capabilities.ts`: `downloadUrl` · `openShortcutSettings` · `privateBrowsingModel` · `dataConsentSupported`، لكلٍّ حالتا الحضور والغياب                            | `pnpm vitest run tests/unit/shared/platform` 17 اختبارًا؛ وتخريبٌ مقصود (`createObjectURL` دائمة الحضور و`privateBrowsingModel` ثابتة) أسقط 7 اختبارات ثمّ أُعيد الملفّ                                                                                                                    |
| 2026-10-02 | المرآة: `blob:` حين تتوفّر القدرة ويُحرَّر بعد `downloads.onChanged` (اكتمل أو انقطع) أو بفشل البدء أو بمهلة 15 دقيقة؛ و`data:` كما كان                            | `capture-mirror.test.ts` +6 حالات؛ والعقد «لا ترمي ولا ترفض» سليم؛ و`capture-service.test.ts` يُنزع فيه `createObjectURL` ليحاكي عامل Chromium                                                                                                                                             |
| 2026-10-02 | الاختصارات: `open-shortcuts.tsx` (خُطّاف ورابط «أسنده من صفحة الاختصارات» ونصّ بديل بلا رابط) في ورقة الاختصارات وقسم الإعدادات                                    | `shortcuts-sheet.test.tsx` +4 حالات. `chromium-probe.mjs` (خطوة جديدة): Edge ⇐ `edge://extensions/shortcuts` وChrome وBrave ⇐ `chrome://extensions/shortcuts` — الأوامر الأربعة مسنَدة في الرأسيّ فيُنقر زرّ التغيير (المسار نفسه)                                                         |
| 2026-10-02 | `PrivacyTab`: في `not_allowed` جملة «لا يعمل رصد في النوافذ الخاصّة في Firefox.» بدل القائمة؛ والجملة في `capabilities.ts` لأن اسم المتصفّح محظور خارج `platform/` | `privacy-incognito-model.test.tsx` (الحالتان)؛ `Docs/Privacy.md` و`Docs/Design.md` §11                                                                                                                                                                                                     |
| 2026-10-02 | `scripts/impact.mjs`: `src/shared/platform/` ⇐ `verify:popup` و`verify:export`؛ و`firefox-probe.mjs` خطوة «نسخة التنزيلات تُنزِّل ملفًّا»                          | الخطوة لم تُشغَّل: Firefox غير مثبّت هنا                                                                                                                                                                                                                                                   |
| 2026-10-02 | الإغلاق                                                                                                                                                            | `pnpm vitest run tests/unit tests/integration` 348 ملفًّا · 6141 اختبارًا أخضر؛ `typecheck` وeslint وprettier خضر؛ `RASD_GATE_BASE=ss-B/base pnpm gate:a` أخضر (104ث من سقف 48ث — المعروف في SS1)؛ `pnpm verify:wave --base ss-B/base --size all` 26/26 أخضر في 11.2 دقيقة (انتظر قفل SS3) |

**المتبقّي:** لا شيء داخل النطاق. ما لم يُقَس لغياب المتصفّح: `chromium-probe --browser=opera|vivaldi`، و`firefox-probe --only=variant`.

**قرارات وملاحظات:**

- **نافذة الإضافة (`src/pages/popup/`) لم تُمسّ:** تعرض حروف الاختصار الأربعة مكتوبة من البيان لا من `commands.getAll()`، وليس فيها رابط لصفحة الاختصارات — فلا نقطة فرق فيها. وعرض الإسناد الحيّ فيها يحرّك الأساس البصري (`verify:visual`) فهو قرار تصميم خارج النطاق.
- **بصمة حزمة Chromium تغيّرت عمدًا** (ملفّ منصّة جديد وعنوان `blob:` وخطوة تحرير)؛ `verify:dist` وميزانية content.js (110,741 من 120,000) سليمتان.
- الخطوة الأخيرة في `chromium-probe` («أخطاء البيان») تفشل في Edge وChrome بتحذير «Optional permission … redundant» — سببه تعديل المسبار نفسه `host_permissions: <all_urls>` على النسخة المفكوكة، سابقٌ لهذه المرحلة ولا يمسّ الحزمة المرفوعة.
- `dataConsentSupported()` كشفٌ فقط ولا مستهلك له بعد: يستهلكه SS6.

### تقرير التسليم — SS4

- الفرع: `ss/4-capabilities` · الأساس: `ss-B/base` (f66a2f7) · آخر التزام عمل: 81affe0
- الفرق: 24 files changed, 838 insertions(+), 79 deletions(-)
- الملفّات الحسّاسة الملموسة: لا شيء (`capture-mirror.ts` تحت `src/background/` لكنه خارج قائمة AGENTS.md §4)
- معايير الإغلاق:
  - `pnpm vitest run tests/unit/shared/platform tests/integration` ⇒ أخضر (ضمن 348 ملفًّا · 6141 اختبارًا)، ولكل قدرة حالتا الحضور والغياب
  - `pnpm verify:wave --base ss-B/base --only popup,export,capture` ⇒ أخضر، مشمولة في تشغيل `--size all` (26/26)
  - `chromium-probe --browser=opera` ⇒ **لم يُقَس: Opera غير مثبّت**؛ قِيس بدله Edge وChrome وBrave: التحويل `chrome://` ⇐ `edge://extensions/shortcuts` في Edge، والروابط تساوي عدد الأوامر غير المسنَدة (صفر في الرأسيّ)
  - `firefox-probe --only=variant` ⇒ **لم يُقَس: Firefox غير مثبّت**؛ الخطوة أُضيفت للمسبار ولم تُشغَّل
- مخروط الأثر: 5 ملفّات خارج الجدول ⇒ الطقم كاملًا؛ `verify:accessibility · visual · popup · export` · `pnpm verify:wave --base ss-B/base --size all` 26/26 أخضر
- المراجعة المستقلّة: لم تلزم (لا منطقة حسّاسة)
- أعطال متقطّعة مسجَّلة: لا شيء
- خارج النطاق — مسجَّل لا منفَّذ: إسناد حيّ في نافذة الإضافة؛ طلب الأذونات وموافقة جمع البيانات (SS6)؛ حرّاس Firefox (SS7)؛ قياس Opera وVivaldi وFirefox
- ما يحتاجه منسّق الإغلاق: لا اعتمادية ولا عقد ولا حارس معدَّل (لا `guards:sync`)؛ يضمّ `Docs/Privacy.md` مع SS2 (قسمان مختلفان) و`src/shared/platform/README.md` (جدول الملفّات) مع SS2 عند ظهور `identity.ts`؛ ويُنفَّذ قياس Opera/Vivaldi/Firefox يدويًّا أو على جهاز بها
