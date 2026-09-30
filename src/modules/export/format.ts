/**
 * صيغ الخروج — ما يُنتَج، وأين يُقبَل.
 *
 * **الصيغة معاملٌ يعبر البوّابة، لا بوّابةٌ ثانية.** واجهة الترميز في
 * `modules/editor/bake.ts` تقبل نوعًا نصّيًّا منذ كُتبت، والمثبَّت هو **موضع
 * النداء الواحد** لا النوع. فإضافة WebP لا تمسّ `ENCODE_ALLOWED` ولا محدِّدات
 * اللنت ولا [ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md) —
 * التفصيل في [ADR 0021](../../../Docs/ADR/0021-second-format-one-gate.md).
 *
 * **وثلاث حقائق مقيسة تحكم هذا الملفّ، لا مفترضة** (Chrome 152.0.7977.83):
 *
 * ١. **نوعٌ غير مدعوم لا يرمي — يتدهور صامتًا إلى PNG ويكذب في `blob.type`.**
 *    قِيس أن `image/heic` و`image/avif` والسلسلة الفارغة أعطت ثلاثتها PNG
 *    وأعلنت `image/png`. فالنوع المُنتَج **يُقارَن بالمطلوب** بعد الترميز
 *    (`assertProduced` أدناه)، ولا يُفترَض من الطلب.
 *
 * ٢. **الحافظة لا تقبل WebP إطلاقًا.** `ClipboardItem.supports('image/webp')`
 *    تعطي `false`، والكتابة ترمي `NotAllowedError: Type image/webp not
 *    supported on write`. ولا تُهرَّب تحت مفتاح آخر: الكتابة تُقارن المفتاح
 *    ببلوبها وترمي عند الاختلاف. فوجهة الحافظة PNG **دائمًا**، ويُقال ذلك
 *    للمستخدم بدل أن يُعطى غير ما اختار صامتًا.
 *
 * ٣. **WebP بلا وسيط جودة = `VP8L` بلا فقد**، ومع جودة دون الواحد = `VP8`
 *    بفقد. فالافتراضي هنا بقوّة PNG نفسها، و«أصغر» في نصّ التصميم صادقة
 *    عليه: قِيس 5672 بايتًا مقابل 28134 لنفس القماش.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

/** الصيغتان اللتان تُنتجهما قناة الخروج اليوم. */
export type ExportFormat = 'png' | 'webp'

/** بترتيب العرض في `export / modal` — من الأيمن: PNG ثمّ WebP. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'webp']

const MIME: Readonly<Record<ExportFormat, string>> = {
  png: 'image/png',
  webp: 'image/webp',
}

const EXTENSION: Readonly<Record<ExportFormat, string>> = {
  png: 'png',
  webp: 'webp',
}

/**
 * وصفٌ قصير تحت اسم الصيغة.
 *
 * **النصّان من إطار `73:2` حرفًا، وWebP صُحِّحت فيه بالقياس.** كان الإطار يكتب تحتها
 * «أصغر»، والقياس على ستّ عشرة حالة من لقطات واجهة حقيقية أعطى العكس عند الجودة
 * «الأقصى» التي يعرضها افتراضًا: `VP8L` خرج **أكبر** من PNG في أربع عشرة منها (وسيط
 * 0.1564 مقابل 0.0789 بايت/بكسل). فالوعد مشروطٌ بالجودة، و`STAGES/02` كتبها في الإطار
 * «حجمه يتبع الجودة». التفصيل في ترويسة `estimate.ts` و`§6`.
 */
export const FORMAT_HINT: Readonly<Record<ExportFormat, string>> = {
  png: 'بلا فقد',
  webp: 'حجمه يتبع الجودة',
}

export function mimeFor(format: ExportFormat): string {
  return MIME[format]
}

export function extensionFor(format: ExportFormat): string {
  return EXTENSION[format]
}

/**
 * الصيغة المقابلة لنوعٍ مُعلَن، أو `null` إن لم تكن من صيغنا.
 *
 * يُقرأ من `blob.type` الفعلي لا من الطلب — وهو ما يمسك التدهور الصامت.
 * والنوع قد يحمل وسائط (`image/png;charset=…`) فيُقصّ عند الفاصلة المنقوطة.
 */
export function formatFromMime(mime: string): ExportFormat | null {
  const bare = mime.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  for (const format of EXPORT_FORMATS) {
    if (MIME[format] === bare) return format
  }
  return null
}

/**
 * **وجهة الحافظة صيغةٌ واحدة، والمتصفّح هو من حسمها.**
 *
 * لا تُشتقّ من اختيار المستخدم: الحافظة ترفض WebP بالقياس (انظر الترويسة)،
 * فربطها بالاختيار كان يُنتج زرًّا يفشل كلّما اختير WebP — أو، أسوأ، نسخةً
 * صامتة بصيغة غير التي طُلبت.
 */
export const CLIPBOARD_FORMAT: ExportFormat = 'png'

/** هل تقبل الحافظة هذه الصيغة؟ مقيسًا لا مفترَضًا. */
export function clipboardAccepts(format: ExportFormat): boolean {
  return format === CLIPBOARD_FORMAT
}

/**
 * نصٌّ يُعرض حين يختار المستخدم صيغةً لا تقبلها الحافظة.
 *
 * **يُعرض ولا يُخفى الزرّ**: النسخ يبقى ممكنًا وينتج PNG، والمستخدم يعرف
 * مسبقًا ما سيحصل عليه. وزرٌّ يختفي بلا سبب أسوأ من زرٍّ يشرح.
 */
export const CLIPBOARD_NOTE = 'الحافظة تقبل PNG وحدها — النسخ يُنتج PNG مهما كانت صيغة التنزيل.'

/**
 * **PDF صيغة وثيقة لا صيغة ترميز.** لا يُطلب من المُرمِّج `application/pdf`؛ تُخبز الصورة PNG من البوّابة
 * نفسها ثمّ تُلفّ في حاوية (`pdf.ts`). ولذلك لا تدخل `EXPORT_FORMATS`: تلك صيغ `bake()`، والاختبار التفاضلي
 * يدور عليها وحدها — وPDF تحمل بايتاته كما هي ([ADR 0040](../../../Docs/ADR/0040-pdf-container-over-the-gate.md)).
 */
export type DocumentFormat = 'pdf'

/** ما يختاره المستخدم في النافذة: صيغ الترميز ثمّ الوثيقة. */
export type OutputFormat = ExportFormat | DocumentFormat

/** بترتيب العرض في `export / modal` و`export / pdf` — من الأيمن: PNG ثمّ WebP ثمّ PDF. */
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['png', 'webp', 'pdf']

export function isDocumentFormat(format: OutputFormat): format is DocumentFormat {
  return format === 'pdf'
}

/** وصف كل صيغة تحت اسمها — نصّ PDF من إطار `290:480` حرفًا. */
export const OUTPUT_HINT: Readonly<Record<OutputFormat, string>> = {
  ...FORMAT_HINT,
  pdf: 'صفحة أو أكثر',
}
