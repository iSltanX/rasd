# قائمة Opera Add-ons

> مواد متجر Opera جاهزةٌ **بلا تقديم الآن**. **قرار المالك 2026-10-02: Opera Add-ons ضمن نطاق إصدار 1.0 ولا يُؤجَّل**
> ([`Docs/Browsers/Architecture.md`](../../Browsers/Architecture.md) §6 البند 6)؛ فيُقدَّم مع بقية القنوات في SS10 بأمر المالك وحده.
> المتطلّبات مقروءة من مصادرها الرسمية يوم 2026-10-02 في
> [`../checklist.md`](../checklist.md) (قسم Opera)، وحدودها يحرسها `tests/unit/store-materials.test.ts`.
>
> **لا نسخة ثانية من الوصف:** الوصف الطويل بلغتيه في [`../listing.md`](../listing.md) يُلصق كما هو.

## الهوية

| الحقل           | القيمة                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| الحزمة          | `rasd-<النسخة>.zip` (Chromium نفسها) + `rasd-<النسخة>-source.zip` — لأنها مصغَّرة                                 |
| الفئة           | `Web Development`                                                                                                 |
| النسخة          | `0.1.0` تُقبل (1–4 أعداد بلا صفر بادئ)                                                                            |
| بريد الدعم      | `isultanby@gmail.com` — البريد الرسمي لرصد (قرار المالك 2026-10-02)                                               |
| الدعم والخصوصية | كقائمة Chrome ([`../listing.md`](../listing.md)): `/rasd/support` و`/rasd/privacy` — تعيدان 200 (قِيس 2026-10-02) |
| حساب المطوّر    | **⏳ المالك**، والرفع في SS10                                                                                     |

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

حزمة Opera هي حزمة Chromium نفسها بيان MV3، **إلا أنّ `short_name` فيها `Rasd` حرفيًّا** (انظر «حزمة Opera» أدناه). صفحة Opera الرسمية للبيان ما زالت **تصف MV2** (`manifest_version: 2`)
ولا تذكر MV3 (قُرئت 2026-10-02)، وقبول MV3 معلَنٌ في منتدى مطوّري Opera لا في صفحاتها — **يُتحقَّق منه يوم التقديم**
(بند في [`../checklist.md`](../checklist.md)). رصد لا تحمل `content_scripts` ولا شيفرة بعيدة، فمعيار «لا JavaScript خارجي»
مستوفى.

## حزمة Opera

حزمة مستقلّة `rasd-<النسخة>-opera.zip` (حالة `1.0.0`: **قُبل الرفع، والنشر لم يُؤكَّد** — إفادة المالك 2026-10-04)، تختلف عن
`rasd-<النسخة>.zip` بسطرٍ واحد في `manifest.json`:

```diff
-  "short_name": "__MSG_extShortName__",
+  "short_name": "Rasd",
```

| الحزمة                 | SHA-256                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `rasd-1.0.0-opera.zip` | `a81fe1f8dd68d924acb63b37fd5e582d30116aca63976a32475115e247122501`                               |
| `rasd-1.0.1-opera.zip` | `ecc2f2e4ca3331e7279fe53248302c47c1ef97a23854fa28147156a25ee10646` — مُعدّة 2026-10-08، لم تُرفع |

**الإنتاج** من `dist/` الذي يبنيه `pnpm build` (لا يُمسّ `dist/` ولا حزمة Chrome ولا `scripts/zip.mjs`):

```bash
pnpm build
node --input-type=module -e "
import { writeFileSync } from 'node:fs'
import { collect, zip, sha256 } from './scripts/lib/release-pack.mjs'
const { files } = collect('dist')
const m = files.find((f) => f.path === 'manifest.json')
const from = '\"short_name\": \"__MSG_extShortName__\"'
const text = m.data.toString('utf8')
if (!text.includes(from)) throw new Error('short_name غير موجود في البيان')
m.data = Buffer.from(text.replace(from, '\"short_name\": \"Rasd\"'), 'utf8')
const out = zip(files)
writeFileSync('dist-zip/rasd-<النسخة>-opera.zip', out)
console.log(sha256(out))
"
```

**التحقّق:** كل ملفّ في الحزمتين (85) متطابق بـCRC32 عدا `manifest.json`، وسطر `short_name` هو الفرق الوحيد بين البيانين
(`diff` على `python3 -m json.tool`). وإعادة الإنتاج أعلاه تعطي **المحتوى نفسه لا البايتات نفسها**: الحزمة المرفوعة كُتبت بأداة
ضغط غير `zip()` في `release-pack.mjs` فحجمها 839838 لا 840748 — فالبصمة المعتمدة بصمة الملفّ المحفوظ (أرشيف التنظيف المحلّي
وبجوار `dist-zip/`). ولا تُنشر Opera قبل أن يُرى النشر في المتجر ويُدوَّن في [`channels.md`](../../Release/channels.md).

**مراجِع يعيد البناء من حزمة المصدر** يحصل على بيان Chrome (`__MSG_extShortName__`)؛ والفرق وحده هذا السطر.

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

**قرار المالك 2026-10-02: تُكتب EULA خاصّة برصد بدل الرخصة الافتراضية للمتجر (CC BY-NC-ND 4.0).** النصّ في
[`../eula.md`](../eula.md): النسخة الإنجليزية (`eula-en`) تُلصق في حقل EULA في لوحة Opera، والعربية مرجعيّةٌ للمالك. وهو مبنيّ
على ترخيص المشروع القائم لا يخالفه: `UNLICENSED` وكل الحقوق محفوظة (`package.json` · README)، فهو ترخيص استعمال
محدود وقيودٌ على إعادة التوزيع والتعديل، ويحيل إلى سياسة الخصوصية، ولا يضيف صلاحيةً ولا جمع بيانات.

| الحالة                    | ما يحدث                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| تُلصق EULA في اللوحة      | تسري على مستخدمي Opera بدل الافتراضية (شرط Opera: «إن لم تُدرج EULA فالمحتوى CC BY-NC-ND»)       |
| لم تُلصق (خطأ في التقديم) | تسري الافتراضية، وهي أوسع من ترخيص رصد (تسمح بإعادة التوزيع غير التجاري) — فلا يُقدَّم قبل لصقها |

**لا يُرسَل شيء إلى Opera الآن.** مراجعة النصّ قانونيًّا بيد المالك قبل SS10 (⏳ المالك — انظر رأس `eula.md`).

## الصور

| المادة   | الملفّ                                                 | المقاس  | ملاحظة                                                                                                                           |
| -------- | ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| اللقطات  | [`Docs/Launch/screens/opera-*`](../../Launch/screens/) | 612×408 | المفضَّل عند Opera (الأقصى 800×600)، **بخلفية بيضاء** كما تشترط الإرشادات، والواجهة المعروضة هي لقطة الإضافة الحيّة. خمس لكل لغة |
| الأيقونة | `public/icons/icon-128.png` (أيقونة الحزمة نفسها)      | 128×128 | PNG مضاد التسنين بخلفية شفّافة، والشعار ليس نصًّا فوق لون — يوافق «Creating effective Opera Extension icons»                     |

إرشادات Opera تقترح لقطتين (كيف تعمل وكيف تبدو في المتصفّح)؛ تُرفع الأوليان من الخمس: `01-inspect` و`02-measure`.
