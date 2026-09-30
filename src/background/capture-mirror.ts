/**
 * نسخة التنزيلات — «احفظ نسخة في مجلّد التنزيلات» (`capture.saveLocation`).
 *
 * **ما يعِد به هذا الملفّ وما لا يعِد.** المكتبة هي الحفظ الأصلي، وهذه نسخةٌ **زائدة**
 * تُطلَق بعد نجاح حفظها ولا يُنتظَر لها. فالعقد أن `mirrorToDownloads` **لا ترمي ولا ترفض
 * وعدَها أبدًا**: كل عطل — صلاحية مفقودة، تنزيل مرفوض، بايتات لا تُقرأ — يصير قيمةً
 * تُرجَع. وخدمة الالتقاط تستدعيها بـ`void`، فوعدٌ مرفوض هنا يكون رفضًا يتيمًا لا يلتقطه أحد.
 *
 * **والصلاحية `downloads` اختيارية** (`permission-policy.ts`). تُطلَب من إيماءة المستخدم
 * حين يقلب المفتاح في الإعدادات، لا من هنا: الخلفية لا تملك إيماءة عند الاختصار. وهنا
 * تُقرأ فقط (`contains`)، فإن سُحبت لاحقًا من `chrome://extensions` تُتخطّى النسخة
 * ويبقى الالتقاط سليمًا — **ولا يُكتب شيء في الإعدادات** لتصحيح التعارض: قرار المستخدم
 * يبقى كما هو، وواجهة الإعدادات هي التي تُظهر أن الصلاحية غير ممنوحة.
 *
 * **ولماذا عنوان بيانات لا `blob:`.** الـservice worker بلا `URL.createObjectURL`، والمستند
 * خارج الشاشة بلا مستهلك اليوم. فتُبنى `data:<mime>;base64,…` من بايتات اللقطة.
 *
 * **وحجمه مقيس لا مخمَّن** (Chrome 154.0.8037.92، `chrome.downloads.download` من service worker): عنوان
 * بيانات لبايتات 1 و3 و8 و20 ميغابايت (حتى 28 مليون محرف) اكتمل تنزيله بالبايتات نفسها. فحدّ الـ2MB المعروف
 * لعناوين التنقّل لا يمسّ هذا المسار، ولقطة الصفحة الكاملة تمرّ.
 */

import { mirrorFilename, planMirror } from '@/modules/export/download'
import { formatFromMime, mimeFor } from '@/modules/export/format'
import { hasPermission } from '@/shared/permissions'
import { getSettingsResult } from '@/shared/settings'

import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * مآل النسخة — للاختبار والتسجيل، لا لأن أحدًا يتفرّع عليه في الإنتاج.
 *
 * `off` لا نسخة مطلوبة (أو تعذّرت قراءة الإعدادات) · `downloaded` سُلِّمت إلى المتصفّح ·
 * `no-permission` مطلوبة والصلاحية مفقودة · `failed` عطل في البناء أو في النداء.
 */
export type MirrorOutcome = 'off' | 'downloaded' | 'no-permission' | 'failed'

/**
 * حجم قطعة `String.fromCharCode(...chunk)`.
 *
 * نشر مصفوفة كاملة في وسائط الدالّة يُسقط المكدّس فوق بضعة عشرات الآلاف من العناصر،
 * ولقطة صفحة كاملة ميغابايتات. `0x8000` حدّ معروف آمن.
 */
const CHUNK = 0x8000

/** بايتات الـblob ⟵ `data:<mime>;base64,<...>`. */
async function toDataUrl(blob: Blob, mime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/**
 * ينسخ لقطةً محفوظةً في المكتبة إلى مجلّد التنزيلات إن كانت الوجهة تطلب ذلك.
 *
 * **الترتيب:** الإعداد ثمّ الصلاحية ثمّ البناء ثمّ التنزيل — والصلاحية لا تُسأل إن كانت
 * الوجهة «المكتبة وحدها». وفشل قراءة الإعدادات `off` لا `download`: جهلٌ بالقرار لا يُفسَّر
 * نسخًا لم يطلبها أحد. وهي **لا تكتب** الإعدادات أبدًا.
 */
export async function mirrorToDownloads(record: CaptureRecord, blob: Blob): Promise<MirrorOutcome> {
  try {
    const settings = await getSettingsResult()
    if (!settings.ok) return 'off'

    const location = settings.value.capture.saveLocation
    const granted = location === 'library' ? false : await hasPermission(['downloads'])
    const plan = planMirror(location, granted)
    if (plan === 'off') return 'off'
    if (plan === 'no-permission') return 'no-permission'

    // الصيغة من النوع الفعلي للبايتات لا من تفضيل المستخدم: الالتقاط PNG دائمًا، وما يُسمّى
    // `.webp` وبايتاته PNG ملفّ يكذب على صاحبه.
    const format = formatFromMime(blob.type) ?? 'png'
    const url = await toDataUrl(blob, mimeFor(format))

    await chrome.downloads.download({
      url,
      filename: mirrorFilename(record.title, record.createdAt, format),
      // بلا حوار حفظ: الغرض نسخة تلقائية لكل لقطة، وحوارٌ لكل لقطة يقتل الميزة.
      saveAs: false,
      // خطّ الدفاع الثاني بعد الختم الزمني في الاسم — لا دهس لملفّ موجود.
      conflictAction: 'uniquify',
    })
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
