/**
 * توليد المصغَّرات المخزَّنة — الأبعاد والتنسيق، بلا لمس القماش (§10.2/16).
 *
 * «مصغَّرات مولَّدة ومخزَّنة لا مشتقّة عند العرض» (نصّ المرحلة 18): شبكة
 * المكتبة تحمل آلاف اللقطات، والصورة الكاملة قد تبلغ عشرات الميغابايتات
 * (تجميع صفحة كاملة، المرحلة 10) — فتحميلها في كل بطاقة يُحمِّل مئات
 * الميغابايتات في كل تمرير. المصغَّرة تُولَّد **مرّة واحدة كسولًا** (عند أوّل
 * عرض لعنصر يفتقدها)، تُخزَّن في `ThumbnailRecord`، وتُقرَأ من التخزين في كل
 * عرض تالٍ — لا تُشتقّ من جديد أبدًا.
 *
 * **التوليد يقع خارج مسار المرحلة 8 (الالتقاط) عمدًا لا سهوًا**: تلك مرحلة
 * مغلقة، وربط توليد المصغَّرة بلحظة الالتقاط يعني تعديل `capture-service.ts`
 * — توسيعُ نطاقٍ يخالف §8. فالكسل هنا اختيارٌ معماري لا نقص: أوّل من يفتح
 * المكتبة على لقطة قديمة يولِّد مصغَّرتها، ومن يفتحها بعده يقرأها مخزَّنة.
 *
 * `ThumbnailEncoder` **حقنٌ لا استيراد** لِمَ يلمس القماش — نفس نمط
 * `RedactRasterDeps.surface` بالمرحلة 15: الملفّ هذا يبقى قابلًا للاختبار
 * بمُرمِّز مزيَّف بلا `OffscreenCanvas`؛ المُرمِّز الحقيقي في
 * `pages/library/thumbnail-encoder.ts`.
 */

import { ok, type Result } from '@/shared/result'
import { blobs, thumbnails } from '@/shared/storage/repository'

import type { ThumbnailRecord } from '@/shared/storage/schema'

/**
 * أطول ضلع للمصغَّرة بالبكسل.
 *
 * مبدئي — تؤكِّده أبعاد بطاقة الشبكة الفعلية حين تُبنى الواجهة في الدفعة
 * التالية؛ رُقمٌ معلَّل بحدّ ذاته لا اعتباطي: يغطّي بطاقة شبكة نموذجية
 * (~15.5rem ≈ 248px CSS، انظر نمط لوحة المراحل السابقة (محذوفة)) عند كثافة
 * بكسل 2×، بلا تكبير غير ضروري في الشاشات القياسية.
 */
export const THUMBNAIL_MAX_DIM = 320

/** يحسب أبعاد المصغَّرة حافظًا النسبة، **بلا تكبير**: أصل أصغر من الحدّ يبقى كما هو. */
export function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDim: number,
): { width: number; height: number } {
  if (sourceWidth <= maxDim && sourceHeight <= maxDim) {
    return { width: sourceWidth, height: sourceHeight }
  }
  const scale = maxDim / Math.max(sourceWidth, sourceHeight)
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

export interface ThumbnailEncoder {
  /** يُرجع `null` إن تعذّر الترميز — لا استثناء. بيئة بلا `OffscreenCanvas`، أو مصدرٌ فاسد. */
  encode(source: Blob): Promise<{ blob: Blob; width: number; height: number } | null>
}

/**
 * يُرجع مصغَّرة موجودة، أو يولِّدها ويخزِّنها إن غابت.
 *
 * تعذُّر التوليد `ok(null)` **لا عطل**: البطاقة تعرض بديلًا (أيقونة النوع)،
 * والمحاولة تتكرّر عند العرض التالي — أمّا غياب اللقطة الأصلية نفسها
 * (`blobs`) فخطأ حقيقي يُرفَع، لأنه يصف تلفًا في البيانات لا قصورًا عابرًا
 * في بيئة الترميز.
 */
export async function ensureThumbnail(
  captureId: string,
  encoder: ThumbnailEncoder,
): Promise<Result<ThumbnailRecord | null>> {
  const existing = await thumbnails.get(captureId)
  if (existing.ok) return ok(existing.value)
  if (existing.error.code !== 'not-found') return existing

  const source = await blobs.get(captureId)
  if (!source.ok) return source

  const encoded = await encoder.encode(source.value.blob)
  if (!encoded) return ok(null)

  const record: ThumbnailRecord = {
    id: captureId,
    blob: encoded.blob,
    width: encoded.width,
    height: encoded.height,
  }
  const written = await thumbnails.put(record, encoded.blob.size)
  if (!written.ok) return written
  return ok(record)
}
