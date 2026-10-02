---
id: SS5
title: Brave — قراءة البكسل بلا تمويه
status: done
delivery: merged
wave: B
order: 4
depends: []
model: Sonnet 5.5
size: S
branch: ss/5-brave-pixels
gate: cone
commit: 3e96f86
updated: 2026-10-02
resume: المرحلة مغلقة — دُمجت في الموجة B. معيار «colour أخضر في Brave» حُكم عليه بسجلّها: فحوص البكسل كلّها خضراء في Brave، والتعليق عند 300ث سابقٌ على المرحلة ومن الحارس لا القطّارة (ترتيب أهداف CDP في Brave، تثبيت البصمة يمنع تعديله) — يُغلق بتعديلٍ وظيفي للحارس بقرار المالك.
---

# SS5 — Brave: قراءة البكسل بلا تمويه

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §1.3. اختيارية بقرار المالك
> (§6) — وهي في الموجة B لأنها مستقلّة وصغيرة ولا تمسّ ما تمسّه جاراتها.

## الهدف

القطّارة في Brave تقرأ القيمة الحقيقية (`#FF0000` لا `#FE0100`) أو تعلن ضجيج المتصفّح صراحةً — لا «اختلاف» زائف بين قيمة
CSS والبكسل ولا درجة Tailwind «قريبة» وهي مطابقة.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `src/content/sampler.ts` ⇐ مسار `ImageDecoder` + `VideoFrame.copyTo()` حين يتوفّر، والقماش بديلًا
- أو عند فشل القياس: `src/shared/platform/identity.ts` (كشف Brave) ولوحة الألوان (تسامح معلَن بدرجة)
- `tests/unit/content/sampler*.test.ts` ⇐ المساران يعطيان البايتات نفسها
- `Docs/Launch/browsers.json` و`Docs/Launch/browsers.md` ⇐ ملاحظة Brave

**خارج النطاق**

- تعديل حارس `colour` (مثبَّت البصمة)
- أيّ تغيير في ميزانية `content.js`

## المهامّ

1. القياس: صفحة عيّنة في Brave بملفّ تعريفٍ نظيف تقرأ البكسل نفسه بالقماش وبـ`ImageDecoder` — إن طابق الثاني قيمة CSS فالمسار (أ).
2. (أ) `sampler.ts`: فكّ اللقطة بـ`ImageDecoder` وقراءة الرقعة من `VideoFrame.copyTo` بصيغة RGBA؛ والقماش حين لا يتوفّر (Firefox).
3. (ب) إن لم يصحّ: كشف Brave في `identity.ts`، وتعليم الفرق بدرجة «ضمن ضجيج المتصفّح» في لوحة الألوان بنصّ صريح.
4. تحديث ملاحظة Brave في `browsers.json` بالدليل الجديد.

## معايير الإغلاق

- `CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" pnpm verify:wave --base ss-B/base --only colour` أخضر **بلا تعديل في الحارس**
- `pnpm verify:wave --base ss-B/base --only colour` أخضر في Chrome
- `pnpm verify:dist` أخضر وميزانية `content.js` كما هي
- `pnpm vitest run tests/unit/content` أخضر

## المخاطر

- [متوقَّع] أن WebCodecs خارج تمويه Brave — القياس أوّل خطوة، وبعده يُقرَّر المسار
- `ImageDecoder` غير متاحة في Firefox فيبقى القماش هناك — ولا فرق هناك أصلًا

## المراجع

- `Docs/Browsers/Architecture.md` §1.3
- `Docs/Engineering.md §6` الصفّ 470 (القياس الأصلي)
- Brave — Fingerprinting Protections · مسألة Brave ‏42427 · MDN `ImageDecoder`

## سجلّ التنفيذ

| التاريخ    | ما أُنجز                                                                                                                                                                                                                                                         | الدليل                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | كُتبت المواصفة                                                                                                                                                                                                                                                   | —                                                                                                                |
| 2026-10-02 | **القياس:** مسبار في Brave 1.96.59 وChrome بصفحةٍ فيها PNG من 32 بكسلًا معروفة. القماش في Brave يخطئ في 55 بايتًا، و`ImageDecoder` + `copyTo` RGBA يطابق المصدر في كل بكسلٍ معتم (الفرق الوحيد 200←199 في بكسلٍ نصف شفّاف، وهو نفسه في قماش Chrome) ⇐ المسار (أ) | مسبار صغير بنواة `scripts/lib/cdp.mjs` في مجلّد الجلسة المؤقّت — لم يُلتزم                                       |
| 2026-10-02 | `sampler.ts`: `decodeRaw` بـ`ImageDecoder` ثمّ `copyTo` بصيغة RGBA إلى مخزن واحد يُفهرَس، والقماش بديلٌ حين لا تتوفّر الواجهة أو يرمي الفكّ أو لا يطابق الطولُ العرضَ×الارتفاعَ×4                                                                                | `pnpm vitest run tests/unit/content/sampler.test.ts` — 9 تنجح و5 تسقط على `sampler.ts` السابق                    |
| 2026-10-02 | حارس `colour` في Brave: سبعة فحوص بكسل ساقطة على الشيفرة السابقة (254,1,0 وغيرها) ⇐ صفر ساقط على الجديدة: العيّنة `rgb(255, 0, 0)` والمزج `(0,255,0)` ولا اختلاف زائف                                                                                            | `CHROME_PATH=<Brave> node scripts/verify-colour.mjs` على البنائين                                                |
| 2026-10-02 | **ما لم يُغلَق:** الحارس نفسه يعلّق في Brave عند 300ث (عيّنة الخمسة آلاف في تدقيق التباين) **قبل الإصلاح وبعده بالسلوك نفسه**، حتى بمنفذ عيّنات خاصّ — فهو سابق ومستقلّ عن القطّارة وخارج النطاق                                                                 | `--only colour` في Brave: أحمر مرّتين؛ والخطّ الأساسي بـ`sampler.ts` القديم: التعليق نفسه                        |
| 2026-10-02 | `colour` في Chrome أخضر في 5ث. وجولةٌ سابقة منه علّقت بالمكان نفسه سببها خادم عيّنات قديم (عمره 31 ساعة، من worktree المرحلة 17) على المنفذ المشترك 5399 يخدم نسخته من `contrast-5000/` — يُتجاوز بـ`RASD_FIXTURES_PORT`                                         | `RASD_FIXTURES_PORT=5481 pnpm verify:wave --base ss-B/base --only colour` ✓                                      |
| 2026-10-02 | ملاحظة Brave في `browsers.json` و`browsers.md` (الحاشية 8) بالدليل الجديد                                                                                                                                                                                        | `pnpm vitest run tests/unit/store-materials.test.ts` · `pnpm docs:lint`                                          |
| 2026-10-02 | `gate:a` أخضر (87ث بحمل الجهاز المشترك فوق سقف 48) و`verify:wave --size cone` أخضر (lighthouse وvisual)                                                                                                                                                          | `RASD_GATE_BASE=ss-B/base pnpm gate:a` · `RASD_FIXTURES_PORT=5481 pnpm verify:wave --base ss-B/base --size cone` |

**المتبقّي:** لا شيء في نطاق SS5. بقي معيار «`colour` أخضر في Brave» غير محقَّق بسبب تعليقٍ سابق ومستقلّ (التقرير أدناه).

### تقرير التسليم — SS5

- الفرع: `ss/5-brave-pixels` · الأساس: `ss-B/base` (`f66a2f7`) · آخر التزام عمل: `3b1dc52`
- الفرق: 8 files changed, 339 insertions(+), 55 deletions(-)
- الملفّات الحسّاسة الملموسة: لا شيء (`sampler.ts` سكربت محتوى خارج قائمة §4)
- معايير الإغلاق:
  - `CHROME_PATH=<Brave> pnpm verify:wave --base ss-B/base --only colour` — **أحمر:** تعليق 300ث في عيّنة الخمسة آلاف بعد أن صارت كل فحوص البكسل خضراء؛ التعليق نفسه على الشيفرة السابقة، فهو سابق ومستقلّ. الحارس لم يُعدَّل
  - `pnpm verify:wave --base ss-B/base --only colour` في Chrome — أخضر 5ث (بـ`RASD_FIXTURES_PORT=5481`؛ على 5399 المشترك يعلّق بسبب خادم قديم)
  - `pnpm verify:dist` — أخضر؛ `content.js` بعد gzip 110,373 مقابل 110,110 قبل (+263 بايتًا) والميزانية كما هي
  - `pnpm vitest run tests/unit/content` — أخضر، 293 اختبارًا في 19 ملفًّا قبل إضافة ملفّ المرحلة (9 اختبارات)
- مخروط الأثر: `verify:lighthouse` · `verify:visual` — `pnpm verify:wave --base ss-B/base --size cone` أخضر (2/2) · `gate:a` أخضر
- المراجعة المستقلّة: لم تلزم — لا منطقة حسّاسة
- أعطال متقطّعة مسجَّلة: لا شيء متقطّع؛ ثابتان: تعليق `colour` في Brave (سابق)، وخادم العيّنات القديم على 5399
- خارج النطاق — مسجَّل لا منفَّذ: (١) تعليق عيّنة الخمسة آلاف في Brave — يلزم تشخيص التدقيق في Brave لا القطّارة؛ (٢) قيم «المرسوم» المموَّهة في مخرج الحارس (254,254,255) هي قياس الحارس نفسه لا شيفرة المنتج؛ (٣) خادم عيّنات عالق من worktree المرحلة 17 على 5399 (pid 16343) ينبغي إنهاؤه من المالك
- ما يحتاجه منسّق الإغلاق: لا اعتمادية ولا عقد ولا حارس معدَّل ولا صفوف §6 · `Docs/Launch/browsers.json` و`browsers.md` (الحاشية 8) تلمسهما هذه المرحلة وحدها · `colour` في Brave سيعلّق في بوّابة الموجة B كما سبق — يُحكَم عليه بهذا السجلّ لا بخضرته
