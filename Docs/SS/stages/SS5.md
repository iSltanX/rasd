---
id: SS5
title: Brave — قراءة البكسل بلا تمويه
status: active
delivery: none
wave: B
order: 4
depends: []
model: Sonnet 5.5
size: S
branch: ss/5-brave-pixels
gate: cone
commit: —
updated: 2026-10-02
resume: القياس أوّلًا — `ImageDecoder` في Brave بمسبار صغير — ثمّ يُقرَّر المسار (أ) أو (ب).
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

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
