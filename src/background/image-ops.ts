/**
 * فكّ ترميز الصورة وقصّها — داخل الـservice worker.
 *
 * **لماذا فكّ ترميز يدوي بدل `fetch(dataUrl)`:** سياسة أمن المحتوى في بيان
 * رصد تقول `connect-src 'self'`، و`data:` ليست `'self'` — فـ`fetch` على
 * عنوان بيانات يُرفَض بـ`TypeError: Failed to fetch`. الطريقة تبدو ناجحة في
 * أي تجربة خارج الإضافة، وتفشل داخلها وحدها. الفكّ اليدوي يتجاوز الطبقة
 * الشبكية كلّها — ولا يمرّ بسياسة أصلًا.
 *
 * **ولماذا هنا لا في Worker:** إنشاء `Worker` من داخل service worker غير
 * مدعوم؛ والبناء يقبل السطر ثم ينفجر وقت التشغيل. والـSW خيط مستقلّ عن خيط
 * عرض الصفحة أصلًا، فالغرض الذي أرادته الخطة («لا يجمّد الصفحة») محقَّق بلا
 * Worker. مُسجَّل في `Rasd_Plan.md §6` و[ADR 0009](../../Docs/ADR/0009-capture-in-service-worker.md).
 */

import { isFullSource, planCrop } from '@/modules/capture/crop'
import { errText, ok, type Result } from '@/shared/result'

import type { DeviceRect } from '@/shared/geometry'

/**
 * حدود `OffscreenCanvas` في Chrome.
 *
 * تجاوزها **لا يرمي**: يُرجع سياقًا يبلّغ المقاس الصحيح، ويقبل الرسم،
 * ويُهمله بصمت. النتيجة صورة فارغة تُحفَظ كأنها نجحت. الحراسة قبل التخصيص
 * أرخص من اكتشاف الأمر من شكوى مستخدم.
 */
export const MAX_CANVAS_AREA = 268_435_456
export const MAX_CANVAS_SIDE = 65_535

/**
 * `data:image/png;base64,…` → بايتات. بلا شبكة وبلا سياسة.
 *
 * النوع `Uint8Array<ArrayBuffer>` صراحةً لا `Uint8Array` المجرَّد: الأخير
 * يشمل `SharedArrayBuffer` الذي لا يقبله `Blob`، فيسقط الإسناد وقت الترجمة.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('عنوان بيانات بلا فاصلة')
  const binary = atob(dataUrl.slice(comma + 1))
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** نوع MIME المعلن داخل عنوان البيانات، أو PNG افتراضًا. */
function mimeOf(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png'
}

export interface CroppedImage {
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

/**
 * يقصّ لقطة إلى مستطيل بفضاء الجهاز.
 *
 * `rect === null` أو تحديد يغطّي اللقطة كاملة يعني: احفظ بايتات المتصفّح كما
 * هي. إعادة ترميز PNG إلى PNG تستهلك وقتًا ولا تُضيف شيئًا.
 */
export async function cropCapture(
  dataUrl: string,
  rect: DeviceRect | null,
): Promise<Result<CroppedImage>> {
  const mime = mimeOf(dataUrl)

  let sourceBlob: Blob
  try {
    sourceBlob = new Blob([dataUrlToBytes(dataUrl)], { type: mime })
  } catch (thrown) {
    return errText('invalid-data', 'تعذّر قراءة بايتات اللقطة.', String(thrown))
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(sourceBlob)
  } catch (thrown) {
    return errText(
      'invalid-data',
      'تعذّر فكّ ترميز اللقطة — قد تكون الصفحة غيّرت محتواها أثناء الالتقاط.',
      String(thrown),
    )
  }

  try {
    const source = { width: bitmap.width, height: bitmap.height }

    if (!rect || isFullSource(rect, source)) {
      return ok({ blob: sourceBlob, width: source.width, height: source.height })
    }

    const plan = planCrop(rect, source)
    if (!plan) return errText('invalid-data', 'التحديد يقع خارج حدود اللقطة بالكامل.')

    if (
      plan.dw > MAX_CANVAS_SIDE ||
      plan.dh > MAX_CANVAS_SIDE ||
      plan.dw * plan.dh > MAX_CANVAS_AREA
    ) {
      return errText('invalid-data', 'التحديد أكبر مما يستطيع المتصفّح رسمه. اختر منطقة أصغر.')
    }

    const canvas = new OffscreenCanvas(plan.dw, plan.dh)
    const ctx = canvas.getContext('2d')
    if (!ctx) return errText('handler-failed', 'تعذّر تهيئة سطح الرسم للقصّ.')

    ctx.drawImage(bitmap, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh)

    /*
     * PNG دائمًا — لا WebP ولا JPEG.
     *
     * `crop.ts` يمنع إعادة التحجيم لأن «فقد تفاصيل النصّ عكس الغرض من أداة
     * فحص بصري». الترميز المُفقِد الاعتراض نفسه بخطوة إضافية. و`convertToBlob`
     * لا يُنتج WebP بلا فقد، وصلاحية `unlimitedStorage` دائمة في رصد لهذا
     * السبب بالضبط. صيغة يختارها المستخدم شأن التصدير (المرحلة 19) لا التخزين.
     */
    const blob = await canvas.convertToBlob({ type: 'image/png' })

    // تحرير صريح: قماش 4K يبقى محجوزًا حتى يجمعه الجامع، وذروة الاستهلاك
    // هي ما يُنهي الـservice worker على جهاز متواضع.
    canvas.width = 0
    canvas.height = 0

    return ok({ blob, width: plan.dw, height: plan.dh })
  } finally {
    bitmap.close()
  }
}
