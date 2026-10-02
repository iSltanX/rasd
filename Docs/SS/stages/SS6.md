---
id: SS6
title: الأذونات والإرسال في Firefox
status: active
delivery: none
wave: C
order: 2
depends: [SS2, SS4]
model: Sonnet 5.5
size: M
branch: ss/6-firefox-permissions
gate: all
commit: —
updated: 2026-10-02
resume: ابدأ باختبار المسح (لا `await` قبل `permissions.request`) على المواضع الخمسة عشر، ثمّ الطلب المدمج.
---

# SS6 — الأذونات والإرسال في Firefox

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §4.5 و§4.11 و§2.

## الهدف

البلاغ وGitHub يعملان في Firefox بعد موافقة المستخدم: كل طلب إذن يُنادى **متزامنًا داخل معالج النقرة** بلا `await` يسبقه
(Firefox يُسقط صفة الإيماءة بعده)، وموافقة جمع البيانات (`technicalAndInteraction` للتشخيص و`websiteContent` للصورة) تُطلب مع
إذن المضيف في نقرة «أرسل» الواحدة حين يدعمها المتصفّح.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `src/shared/permissions.ts` ⇐ طلبٌ واحد يجمع `origins` و`data_collection` حين تُدعم (`dataConsentSupported()` من SS4)
- مراجعة المواضع الخمسة عشر لطلب الإذن (`grep -rn "requestHostPermission\|requestPermission(" src`) — لا `await` قبلها
- `src/pages/settings/parts/report/ReportDialog.tsx` و`src/pages/integrations/ConnectDialog.tsx` و`ConnectionsPanel.tsx`
- `tests/unit/permissions-gesture.test.ts` (جديد): يمسح المعالجات، وسالبه بملفّ مصنوع
- `tests/unit/shared/permissions.test.ts` ⇐ الطلب المدمج بوجود `data_collection` وغيابه
- `Docs/Privacy.md` ⇐ الموافقة في Firefox

**خارج النطاق**

- أيّ تغيير في `permission-policy.ts` — `data_collection_permissions` في البيان من SS1
- حرّاس Firefox (SS7)

## المهامّ

1. اختبار المسح: كل `requestHostPermission` و`requestPermission` داخل معالج حدث نقر، ولا `await` قبله في المعالج نفسه؛ وإصلاح ما يخالف.
2. `permissions.ts`: `requestWithConsent({ origins, dataCollection })` ⇐ نداء `permissions.request` واحد بالمفتاحين حين تُدعم `data_collection`، وإلا بالأصول وحدها.
3. البلاغ: الموافقتان مع أصل القناة في نقرة «أرسل»؛ GitHub: `websiteContent` مع أصل GitHub في «اتّصل».
4. يدويًّا في Firefox (القائمة في `Docs/Firefox/checklist.md` تُكتب هنا بندَيها): نافذة الإذن تظهر وتُقبل ثمّ يصل بلاغٌ تجريبي بوسم `test`.

## معايير الإغلاق

- `pnpm vitest run tests/unit/permissions-gesture.test.ts tests/unit/shared/permissions.test.ts` أخضر، وسالب كلٍّ ثابت
- `VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs` كما هو في Chrome
- في Firefox يدويًّا: بلاغٌ تجريبي بوسم `test` وصل من `dist-firefox/` برقمه في السجلّ، بعد نافذة إذن حقيقية
- `pnpm verify:wave --base ss-C/base` أخضر في Chrome

## المخاطر

- `permissions.request({ origins, data_collection })` في نداء واحد [متوقَّع]: إن رفضه Firefox يُطلبان متتاليين في النقرة نفسها
- `@types/chrome` لا تعرف `data_collection`: واجهة محلّية ضيّقة كما في `diagnostics.ts`

## المراجع

- `Docs/Browsers/Architecture.md` §2 و§4.5 و§4.11
- Extension Workshop — built-in data collection consent · MDN User actions · `permissions.request`
- `Docs/Firefox/firefox_rasd.md` §3 (صفّ `permissions`)

## سجلّ التنفيذ

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
