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
 * Worker. مُسجَّل في `Docs/Engineering.md §6` و[ADR 0009](../../Docs/ADR/0009-capture-in-service-worker.md).
 */

import { isFullSource, planCrop } from '@/modules/capture/crop'
import { withinCanvasLimits } from '@/shared/canvas-limits'
import { dataUrlMime, dataUrlToBytes } from '@/shared/data-url'
import { errText, ok, type Result } from '@/shared/result'

import type { DeviceRect } from '@/shared/geometry'

/**
 * حدود القماش — تُعاد من `shared/` لا تُعرَّف هنا.
 *
 * نزلت إلى `shared/canvas-limits.ts` في المرحلة 10: حارس الصفحة الكاملة
 * يعيش في `modules/` وهو ممنوع بقاعدة لنت من الاستيراد من `background/`.
 * وتُعاد هنا كي لا ينكسر مستهلكوها المبنيّون في المرحلة 8.
 */
export { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '@/shared/canvas-limits'

/**
 * فكّ ترميز عناوين البيانات — نزل إلى `shared/` في المرحلة 13.
 *
 * المرحلة 13 تحتاجه في **الصفحة** أيضًا (فكّ لقطة العيّنة)، وطبقة المحتوى
 * لا تستورد من الخلفية. يُعاد تصديره هنا كي لا ينكسر مستهلكو المرحلة 8 —
 * السابقة نفسها المتّبعة مع `canvas-limits` أعلاه.
 */
export { dataUrlToBytes } from '@/shared/data-url'

const mimeOf = dataUrlMime

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

    if (!withinCanvasLimits(plan.dw, plan.dh)) {
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
