# قائمة Opera Add-ons

> مواد متجر Opera جاهزةٌ **بلا تقديم**: قرار فتح المتجر للمالك ([`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md)
> §6 البند 6)، والتوصية الاكتفاء في 1.x الأولى بأن Opera يثبّت الحزمة من Chrome Web Store ثمّ فتح المتجر حين تستقرّ Firefox.
> فإن قرّر المالك المتجر فهذا كله جاهز، وإلا بقي هنا. المتطلّبات مقروءة من مصادرها الرسمية يوم 2026-10-02 في
> [`../checklist.md`](../checklist.md) (قسم Opera)، وحدودها يحرسها `tests/unit/store-materials.test.ts`.
>
> **لا نسخة ثانية من الوصف:** الوصف الطويل بلغتيه في [`../listing.md`](../listing.md) يُلصق كما هو.

## الهوية

| الحقل           | القيمة                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| الحزمة          | `rasd-<النسخة>.zip` (Chromium نفسها) + `rasd-<النسخة>-source.zip` — لأنها مصغَّرة                  |
| الفئة           | `Web Development`                                                                                  |
| النسخة          | `0.1.0` تُقبل (1–4 أعداد بلا صفر بادئ)                                                             |
| الدعم والخصوصية | كقائمة Chrome ([`../listing.md`](../listing.md)): `/rasd/support` و`/rasd/privacy` — **⏳ المالك** |
| حساب المطوّر    | **⏳ المالك**، والرفع في SS10 إن قُرّر المتجر                                                      |

## الملخّص — جملة واحدة

```text summary-en
Rasd measures, inspects, compares and captures web pages in the active tab, and keeps the results in a library on your device.
```

```text summary-ar
رصد يقيس صفحة الويب ويفحصها ويقارنها بمرجع ويلتقطها في التبويب النشط، ويحفظ النتائج في مكتبة على جهازك.
```

## الوصف

**الوصف الطويل من [`../listing.md`](../listing.md)** بقسميه كما هو. Opera لا تذكر حدًّا لطوله، وتطلب أن يشرح الغرض
والميزات والجمهور — وهو يفعل.

## البيان وقبول MV3

حزمة Opera هي حزمة Chromium نفسها بيان MV3. صفحة Opera الرسمية للبيان ما زالت **تصف MV2** (`manifest_version: 2`)
ولا تذكر MV3 (قُرئت 2026-10-02)، وقبول MV3 معلَنٌ في منتدى مطوّري Opera لا في صفحاتها — **يُتحقَّق منه يوم التقديم**
(بند في [`../checklist.md`](../checklist.md)). رصد لا تحمل `content_scripts` ولا شيفرة بعيدة، فمعيار «لا JavaScript خارجي»
مستوفى.

## الشيفرة المصغَّرة

معيار القبول: «لا تصغير ولا تمويه»، وخطّ بديل: **مصغَّرٌ بمصدر مرفق وتعليمات إعادة بناء** (بأولوية مراجعة أدنى).
رصد مصغَّرة بـVite لا مموَّهة، فيُرفع `rasd-<النسخة>-source.zip` وتُكتب في حقل الملاحظات:

```text reviewer-notes
The package is minified (Vite/Rolldown), not obfuscated. The complete source of the tagged commit is attached as rasd-<version>-source.zip with pnpm-lock.yaml; its root SOURCE-README.md gives the environment (Node from .nvmrc, pnpm via corepack) and the commands:
  corepack enable && pnpm install --frozen-lockfile && pnpm build:all && pnpm zip
The build is deterministic: it reproduces rasd-<version>.zip byte for byte (same SHA-256). No external JavaScript, no eval, no content scripts; every network use is optional, off by default ("Local only" mode) and confirmed by the user after reviewing what will be sent.
```

## الاختصارات في Opera

Opera يحجز ثلاثًا من الاختصارات الأربعة (`⇧⌘T` و`⇧⌘E` و`⇧⌘S` على macOS) فلا يُسند لرصد إلا `⇧⌘V`
([`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §1.4). تُذكر في الوصف أو صفحة الدعم عبارةٌ
تقول للمستخدم أين يسندها؛ والنافذة نفسها تعرض الإسناد الفعلي وتفتح صفحة الاختصارات.

## الرخصة / EULA

| الحالة         | ما يحدث                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| لا EULA        | «تُرخَّص المادة للمستخدمين النهائيين بـ**CC BY-NC-ND 4.0**» — شرط Opera حرفيًّا في إرشادات النشر |
| EULA من المالك | تُلصق نصًّا في اللوحة                                                                            |

**القرار المسجَّل: لا يُقدَّم شيء ولا يُصاغ نصٌّ قانوني بلا المالك.** المستودع `UNLICENSED` (كل الحقوق محفوظة)، والرخصة
الافتراضية عند Opera أوسع منه قليلًا (تسمح بإعادة التوزيع غير التجاري بلا تعديل)؛ فالاختيار بين قبولها وكتابة EULA
**⏳ المالك** قبل أي تقديم إلى Opera.

## الصور

| المادة   | الملفّ                                                 | المقاس  | ملاحظة                                                                                                                           |
| -------- | ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| اللقطات  | [`Docs/Launch/screens/opera-*`](../../Launch/screens/) | 612×408 | المفضَّل عند Opera (الأقصى 800×600)، **بخلفية بيضاء** كما تشترط الإرشادات، والواجهة المعروضة هي لقطة الإضافة الحيّة. خمس لكل لغة |
| الأيقونة | `public/icons/icon-128.png` (أيقونة الحزمة نفسها)      | 128×128 | PNG مضاد التسنين بخلفية شفّافة، والشعار ليس نصًّا فوق لون — يوافق «Creating effective Opera Extension icons»                     |

إرشادات Opera تقترح لقطتين (كيف تعمل وكيف تبدو في المتصفّح)؛ تُرفع الأوليان من الخمس: `01-inspect` و`02-measure`.
