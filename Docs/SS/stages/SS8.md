---
id: SS8
title: مواد المتاجر الأربعة والقائمة اليدوية
status: active
delivery: local
wave: D
order: 1
depends: [SS6, SS7]
model: Sonnet 5.5
size: M
branch: main
gate: cone
commit: —
updated: 2026-10-02
resume: ابدأ بقراءة مصادر AMO وOpera من جديد يوم التنفيذ وتأريخها في `checklist.md`، ثمّ `Docs/Store/firefox/`.
---

# SS8 — مواد المتاجر الأربعة والقائمة اليدوية

> «ماذا ولماذا» في [`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §2 و§4.10. متجر Opera بقرار
> المالك (§6)؛ إن لم يُقرَّر تُكتب مواده وتبقى بلا تقديم.

## الهدف

ما يلزم للتقديم إلى Firefox Add-ons (وOpera Add-ons إن قُرّر) جاهزٌ ومراجَع على مصادره **يوم التنفيذ**، على نسق
`Docs/Store/` لـChrome وEdge: القائمة والملخّص وملاحظات المراجع والصور بمقاساتها وسياسة الخصوصية والرخصة، وقائمة Firefox
اليدوية لما لا يؤتمت موقَّعة بتاريخها، وسجلّ القنوات جاهزٌ للنشر.

## النطاق

**الملفّات المتوقَّع تأثّرها**

- `Docs/Store/firefox/listing.md` (جديد): الملخّص 250، والوصف، والفئتان، وملاحظات المراجع (`innerHTML` = أيقونات SVG ثابتة)، وحقول `data_collection`
- `Docs/Store/opera/listing.md` (جديد): الفئة Web Development، والنصّ، وEULA (من المالك)
- `Docs/Store/checklist.md` ⇐ قسمان AMO وOpera بمصادرهما وتاريخ قراءتها
- `scripts/launch-images.mjs` و`Docs/Launch/` ⇐ لقطات 612×408 لـOpera وأيقونة 64 لـAMO
- `tests/unit/store-materials.test.ts` ⇐ حدود القناتين بسالبٍ لكلٍّ
- `Docs/Firefox/checklist.md` (جديد): نقر الأيقونة (`activeTab`)، وضغط الاختصار، ونوافذ الإذن، والنافذة الخاصّة، وويندوز (`Ctrl+Shift+Q`)
- `Docs/Release/channels.md` ⇐ صفوف القنوات الأربع بلا نسخة بعد
- `README.md` وشريط المتصفّحات ⇐ Firefox مدعوم (من SS7)

**خارج النطاق**

- التقديم نفسه (SS10)
- نشر صفحات المالك الثلاث (المالك)

## المهامّ

1. قراءة مصادر AMO وOpera الرسمية يوم التنفيذ وتأريخها (الروابط في الدراسة القسم الأخير)، وبندًا ببند في `checklist.md` بحالته ودليله.
2. مواد AMO: الملخّص والوصف من `listing.md` القائم (لا نسخة تنحرف)، والأيقونات 32/64 أو SVG، واللقطات 1280×800 نفسها، وملاحظات المراجع.
3. مواد Opera: اللقطات 612×408 من `launch:images`، والفئة، وEULA من المالك أو الرخصة الافتراضية مكتوبةً بقرارها.
4. القائمة اليدوية في Firefox: تُنفَّذ وتُوقَّع بتاريخها على `dist-firefox/`.
5. `channels.md` و`README.md`.

## معايير الإغلاق

- `pnpm vitest run tests/unit/store-materials.test.ts` أخضر، ولكل حدّ جديد سالبه على مدخل مصنوع
- `file Docs/Launch/screens/opera-* Docs/Launch/icons/*` بالأبعاد المطلوبة
- `Docs/Store/checklist.md`: كل بند AMO وOpera بحالته ودليله ومصدره بتاريخ قراءته
- `Docs/Firefox/checklist.md` موقَّعة بتاريخها وكل بند بنتيجته
- بناء حزمة المصدر في بيئة نظيفة (من SS3) يُعاد على النسخة النهائية ويعطي البصمتين

## المخاطر

- متطلّبات المتاجر تتغيّر: تُقرأ يوم التنفيذ لا من الدراسة
- قرار متجر Opera وEULA وصفحات المالك الثلاث من المالك — تُسجَّل «⏳ المالك» كما في قائمة Chrome ولا تُحجب المرحلة

## المراجع

- `Docs/Browsers/Architecture.md` §2 و§4.10 و§6
- `Docs/Store/` (النسق القائم) · ADR 0058
- Extension Workshop (submitting · listing · source) · Opera (acceptance · publishing)

## سجلّ التنفيذ

| التاريخ    | ما أُنجز       | الدليل |
| ---------- | -------------- | ------ |
| 2026-10-02 | كُتبت المواصفة | —      |

**المتبقّي:** كل المهامّ.
