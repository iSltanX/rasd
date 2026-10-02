---
id: SS6
title: الأذونات والإرسال في Firefox
status: active
delivery: branch
wave: C
order: 2
depends: [SS2, SS4]
model: Sonnet 5.5
size: M
branch: ss/6-firefox-permissions
gate: all
commit: a339c54
updated: 2026-10-02
resume: المتبقّي بندٌ يدوي واحد: Firefox — نافذة الإذن الحقيقية ثمّ بلاغٌ بوسم `test` من `dist-firefox/` (البندان في `Docs/Firefox/checklist.md`). ثمّ تُغلَق المرحلة بدمج الموجة C.
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

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | الدليل                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                    |
| 2026-10-02 | **المسح:** `tests/unit/permissions-gesture.test.ts` يمسح `src/` بمحلّل TypeScript: كل نداء إلى `requestHostPermission` · `requestPermission` · `requestWithConsent` · `resolveRoute` · `chooseRoute` — لا `await` قبله في دالّته (دون `await` يلفّه ودون الفرع المقابل من `if`)، وليس داخل `.then` أو `useEffect` أو مؤقّت. **الستّة عشر موضعًا كلّها سليمة بلا إصلاح** (كانت كلّها متزامنة)، ومعدودة بأسمائها فموضعٌ جديد يُسقط الاختبار. السالب: ستّ حالات مصنوعة، وسالبٌ حقيقي — إدخال `await` قبل الطلب في `ConnectDialog.connect` أسقط الاختبار باسم الموضع ثمّ رُدّ | `pnpm vitest run tests/unit/permissions-gesture.test.ts` ⇐ 10 أخضر                   |
| 2026-10-02 | **الطلب المدمج:** `requestWithConsent({ origins, dataCollection })` في `shared/permissions.ts` ⇐ نداءٌ واحد بالمفتاحين حين تُدعم `data_collection`، وإلا بالأصل وحده؛ ورفض الشكل المدمج (يرمي) ⇐ متتاليان: الأصل ثمّ الموافقة، وكلاهما شرط `granted`. و`hasWithConsent` تسأل «أصلٌ وموافقته ممنوحان؟»                                                                                                                                                                                                                                                                     | `tests/unit/shared/permissions.test.ts` ⇐ 14 أخضر                                    |
| 2026-10-02 | **فخٌّ وجدته في المواصفة:** `dataConsentSupported()` (من SS4) غير متزامنة، فنداؤها داخل النقرة قبل الطلب هو بالضبط `await` الذي تمنعه المرحلة. فالدعم يُخبَّأ قبل النقرة: `primeDataConsent()` عند فتح النافذة (وتنادي `hasWithConsent` الشيء نفسه في مراجعة البلاغ)، ويقرأ الطلب القيمة المخبوءة متزامنًا. وإن لم تُقرأ بعد ⇐ الأصل وحده (الإخفاق إلى الأضيق). اختبار: النداء يقع قبل أوّل microtask                                                                                                                                                                     | `shared/permissions.test.ts`                                                         |
| 2026-10-02 | **البلاغ:** `ReportDialog` يطلب أصل القناة مع `technicalAndInteraction`، و`websiteContent` **حين تُرفق صورة وحدها** (انحراف مقصود عن «الموافقتان» في المواصفة: لا موافقة على ما لا يُرسَل). `deps.hostGranted/requestHost` يأخذان `withImage`. **GitHub:** `ConnectDialog` و`ConnectionsPanel.grantHost` يطلبان `GITHUB_ACCESS` (الأصل + `websiteContent`)                                                                                                                                                                                                                | `report-dialog.test.tsx` ⇐ 20 أخضر (حالتان جديدتان: بلا صورة `false`، وبصورة `true`) |
| 2026-10-02 | **الخصوصية:** فقرة «في Firefox موافقةٌ مضمَّنة على جمع البيانات» في `Docs/Privacy.md` §الصلاحيات. و`Docs/Firefox/checklist.md` أُنشئ ببندَي SS6 (حالتهما «لم يُجرَّب») — SS8 تكمله                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                    |
| 2026-10-02 | **الإثبات الحيّ في Chrome:** `VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs` بموافقة المالك ⇐ بلاغ **#8** وصل بنصّه وتشخيصه وصورته، والمنطقة المحجوبة سوداء 14400/14400                                                                                                                                                                                                                                                                                                                                                                             | [`iSltanX/app-reports#8`](https://github.com/iSltanX/app-reports/issues/8)           |
| 2026-10-02 | **البوّابة:** `RASD_GATE_BASE=ss-C/base pnpm gate:a` أخضر عدا `ss:check` (نسيتُ `ss:sync` — رُمّم وأخضر) والزمن 100ث فوق السقف 48 (موروث، سُجّل في الموجة B). `pnpm verify:wave --base ss-C/base --size all` ⇐ 26/26 أخضر في 11.2 دقيقة (`RASD_FIXTURES_PORT=5481`). وبناء `dist-firefox/` بعلم الاختبار و`verify:dist --target firefox` أخضر                                                                                                                                                                                                                             | —                                                                                    |

### تقرير التسليم — SS6

- الفرع: `ss/6-firefox-permissions` · الأساس: `ss-C/base` (3f042af) · آخر التزام عمل: a339c54
- الفرق: 15 files changed, 857 insertions(+), 37 deletions(-) — يشمل التزامَي `main` اللذين يلوان الوسم (`9f6565b` و`b6a78fd`) ومزامنة اللوحة
- الملفّات الحسّاسة الملموسة: لا شيء من قائمة §4 (`permissions.ts` ليست فيها؛ `permission-policy.ts` لم تُمسّ)
- معايير الإغلاق:
  - `pnpm vitest run tests/unit/permissions-gesture.test.ts tests/unit/shared/permissions.test.ts` ⇐ 24 أخضر، وسالب كلٍّ ثابت
  - `VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs` ⇐ #8 كما في Chrome
  - Firefox يدويًّا ⇐ **لم يُجرَّب**: نافذة الإذن من المتصفّح نفسه ولا تُنقر من سكربت. الحزمة جاهزة في `dist-firefox/`
  - `pnpm verify:wave --base ss-C/base --size all` ⇐ 26/26
- مخروط الأثر: verify:accessibility · visual · network · editor · library · export · share + «1 ملفًّا خارج الجدول ⇒ all» · `verify:wave --size all` أخضر 26/26
- المراجعة المستقلّة: لم تلزم (لا ملفّ حسّاس)
- أعطال متقطّعة مسجَّلة: لا شيء
- خارج النطاق — مسجَّل لا منفَّذ: `ReportDialog` في `pages/compare` ليس هذا البلاغ ولا يطلب موافقة (يطلب `downloads` وحدها)
- ما يحتاجه منسّق الإغلاق: لا اعتمادية ولا حارس ولا صفوف §6/ADR. `Docs/Firefox/checklist.md` ملفٌّ جديد تُكمله SS8 (إن أنشأته SS8 أيضًا فيُضمّ). **ينتظر المالك:** بندا Firefox اليدويّان

**المتبقّي:** البند اليدوي في Firefox (نافذة الإذن الحقيقية ثمّ بلاغ `test` برقمه).
