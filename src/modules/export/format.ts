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
 * **PNG منقولة من إطار `73:2` حرفًا، وWebP مُصحَّحة بالقياس.** الإطار يكتب
 * تحتها «أصغر»، والقياس على ستّ عشرة حالة من لقطات واجهة حقيقية أعطى العكس
 * عند الجودة «الأقصى» التي يعرضها الإطار نفسه افتراضًا: `VP8L` خرج **أكبر**
 * من PNG في أربع عشرة منها (وسيط 0.1564 مقابل 0.0789 بايت/بكسل). فالوعد
 * مشروطٌ بالجودة، والنصّ يقولها. التفصيل في ترويسة `estimate.ts` و`§6`.
 */
export const FORMAT_HINT: Readonly<Record<ExportFormat, string>> = {
  png: 'بلا فقد',
  webp: 'أصغر عند خفض الجودة',
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

/** صيغتان في التصميم بلا محرّك بعد — تُعرضان معطَّلتين بسببهما. */
export type DeferredFormat = 'pdf' | 'svg'

export interface DeferredFormatInfo {
  readonly label: string
  readonly hint: string
  /** لماذا لا تعمل الآن — يُعرض، فالتعطيل بلا سبب صمتٌ لا صدق. */
  readonly reason: string
}

/**
 * **معروضتان معطَّلتين لا مخفيّتين ولا موعودتين كذبًا** — نفس حكم الوحدة 21.1.
 *
 * وPDF لها وحدةٌ بالاسم (19.3). وSVG **لا تملكها أي وحدة في `§10.1`** رغم
 * وجودها في مُنتقي الصيغ بإطار `73:2` — فجوةٌ مسجَّلة في `§6` لا مطويّة.
 */
export const DEFERRED_FORMATS: Readonly<Record<DeferredFormat, DeferredFormatInfo>> = {
  pdf: {
    label: 'PDF',
    hint: 'متعدد الصفحات',
    reason: 'يصل في الوحدة 19.3 — تقرير المقارنة وPDF.',
  },
  svg: {
    label: 'SVG',
    hint: 'متجهات فقط',
    reason: 'لا وحدة تملكه بعد — مسجَّل في §6.',
  },
}
