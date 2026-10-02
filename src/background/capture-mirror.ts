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
 * **وأي عنوان.** `downloadUrl()` في `shared/platform/capabilities.ts` يختار بالقدرة لا بالمتصفّح: `blob:` حيث
 * تتوفّر `URL.createObjectURL` (صفحة أحداث Firefox، ويُرفض `data:` هناك)، و`data:<mime>;base64,…` حيث تغيب
 * (عامل Chromium). و`blob:` يُحرَّر حين ينتهي التنزيل (`downloads.onChanged`) أو يفشل بدؤه — فلا يتسرّب.
 *
 * **وحجمه مقيس لا مخمَّن** (Chrome 154.0.8037.92، `chrome.downloads.download` من service worker): عنوان
 * بيانات لبايتات 1 و3 و8 و20 ميغابايت (حتى 28 مليون محرف) اكتمل تنزيله بالبايتات نفسها. فحدّ الـ2MB المعروف
 * لعناوين التنقّل لا يمسّ هذا المسار، ولقطة الصفحة الكاملة تمرّ.
 */

import { mirrorFilename, planMirror } from '@/modules/export/download'
import { formatFromMime, mimeFor } from '@/modules/export/format'
import { hasPermission } from '@/shared/permissions'
import { downloadUrl, type DownloadUrl } from '@/shared/platform/capabilities'
import { getSettingsResult } from '@/shared/settings'

import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * مآل النسخة — للاختبار والتسجيل، لا لأن أحدًا يتفرّع عليه في الإنتاج.
 *
 * `off` لا نسخة مطلوبة (أو تعذّرت قراءة الإعدادات) · `downloaded` سُلِّمت إلى المتصفّح ·
 * `no-permission` مطلوبة والصلاحية مفقودة · `failed` عطل في البناء أو في النداء.
 */
export type MirrorOutcome = 'off' | 'downloaded' | 'no-permission' | 'failed'

/** أطول مدّة نبقي فيها عنوان `blob:` ننتظر انتهاء تنزيله — بعدها يُحرَّر ولو لم يصل الحدث. */
const RELEASE_AFTER_MS = 15 * 60 * 1000

/**
 * يحرّر العنوان حين يبلغ التنزيل `id` نهايته (اكتمل أو انقطع). **لا يرمي:** غياب `onChanged` أو انقطاع المستمع
 * يعنيان مهلةً تحرّره لا تسرّبًا. و`data:` لا يحتاج شيئًا فيُترك.
 */
function releaseWhenSettled(id: number, handle: DownloadUrl): void {
  if (handle.kind === 'data') return
  const onChanged = chrome.downloads.onChanged as typeof chrome.downloads.onChanged | undefined
  if (!onChanged) {
    // لا حدث نسمعه: التحرير الفوري يقطع التنزيل، فالمهلة وحدها.
    setTimeout(handle.release, RELEASE_AFTER_MS)
    return
  }
  const done = () => {
    clearTimeout(timer)
    onChanged.removeListener(listener)
    handle.release()
  }
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    const state = delta.state?.current
    if (delta.id === id && (state === 'complete' || state === 'interrupted')) done()
  }
  const timer = setTimeout(done, RELEASE_AFTER_MS)
  onChanged.addListener(listener)
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
    // نوع الـblob هو نوع العنوان: تُعاد كتابته بالصيغة الفعلية لا بما جاء فارغًا.
    const typed = blob.type === mimeFor(format) ? blob : blob.slice(0, blob.size, mimeFor(format))
    const handle = await downloadUrl(typed)

    let id: number
    try {
      id = await chrome.downloads.download({
        url: handle.url,
        filename: mirrorFilename(record.title, record.createdAt, format),
        // بلا حوار حفظ: الغرض نسخة تلقائية لكل لقطة، وحوارٌ لكل لقطة يقتل الميزة.
        saveAs: false,
        // خطّ الدفاع الثاني بعد الختم الزمني في الاسم — لا دهس لملفّ موجود.
        conflictAction: 'uniquify',
      })
    } catch (error) {
      handle.release()
      throw error
    }
    releaseWhenSettled(id, handle)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
