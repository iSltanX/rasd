# مواد المتجر — Chrome Web Store وMicrosoft Edge Add-ons

> ما يلزم لتقديم رصد إلى المتجرين، جاهزًا ومراجَعًا على المتطلّبات الرسمية كما قُرئت يوم 2026-10-02
> ([`STAGES/28`](../../STAGES/28.md)). **التقديم نفسه بأمر المالك وحده** في [`STAGES/30`](../../STAGES/30.md).

| الملفّ                                   | ما فيه                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`checklist.md`](checklist.md)           | كل بندٍ رسمي بحالته ودليله، ومصادره بتاريخ قراءتها                                                           |
| [`listing.md`](listing.md)               | الوصفان بالعربية والإنجليزية، والغرض الواحد، وممارسات البيانات، والروابط، ومصطلحات بحث Edge وملاحظات اعتماده |
| [`permissions.md`](permissions.md)       | مبرّر كل صلاحية في البيان، لحقول اللوحة                                                                      |
| [`features.md`](features.md)             | كل بندٍ في الوصف وحارسه أو اختباره، وكل صورة ولقطتها الحيّة                                                  |
| [`privacy-policy.md`](privacy-policy.md) | نصّ سياسة الخصوصية العامّة بالعربية والإنجليزية                                                              |
| [`owner-pages.md`](owner-pages.md)       | الصفحات الثلاث في موقع المالك (الخصوصية والدعم وما بعد الإزالة) وخطوات تفعيلها                               |
| [`images/`](images/)                     | خمس لقطات لكل لغة 1280×800، والصورتان الترويجيتان، والأيقونة 128، وشعار Edge 300                             |
| [`evidence/`](evidence/)                 | صفحة الإضافات في Chrome وEdge بعد تحميل الحزمة المفكوكة                                                      |

## الأوامر

```text
pnpm build:bundle && pnpm zip                     # الحزمة: dist-zip/rasd-<النسخة>.zip وبصمتها
pnpm store:package --shots                        # تُفكّ وتُحمَّل في Chrome وEdge نظيفين: صفر تحذير؟ ولقطة evidence/
pnpm design:shots --only=overlay,library,editor   # اللقطات الحيّة من الإضافة المبنيّة
pnpm store:images                                 # صور المتجر منها → images/
pnpm vitest run tests/unit/store-materials.test.ts  # الحدود والمطابقة: صلاحيات، أطوال، صور، أدلّة
```

وسالبا `store:package`: `RASD_STORE_BREAK=warning` (مفتاحٌ مجهول في البيان المفكوك) و`RASD_STORE_BREAK=runtime`
(استثناءٌ في العامل) — كلاهما يجب أن يخرج بغير صفر.

## ما ينتظر المالك قبل التقديم

1. نشر الصفحات الثلاث في `https://www.bysltan.com/rasd/` ثمّ قلب `OWNER_PAGES_LIVE` — [`owner-pages.md`](owner-pages.md).
2. المستودع خاصّ (`https://github.com/iSltanX/rasd` يعيد 404 لزائرٍ غير مسجَّل)، فرابطه في التذييل مخفيّ. إظهاره
   قرار المالك: إن جُعل عامًّا وأعاد 200 يُبنى بـ`VITE_RASD_SHOW_REPO=1`.
3. حسابا المطوّر في المتجرين، والتقديم — `STAGES/30`.
