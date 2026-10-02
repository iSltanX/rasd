---
id: SS4
title: نقاط الفرق بالكشف عن القدرة
status: pending
delivery: none
wave: B
order: 3
depends: [SS1]
model: Sonnet 5.5
size: M
branch: ss/4-capabilities
gate: all
commit: —
updated: 2026-10-02
resume: ابدأ بـ`capabilities.ts` واختباراته بحضور كل واجهة وغيابها، ثمّ المرآة، ثمّ الاختصارات، ثمّ التصفّح الخاص.
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

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
