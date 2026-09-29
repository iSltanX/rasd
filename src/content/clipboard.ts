/**
 * نسخ اللقطة إلى الحافظة — **من داخل الصفحة**، لا من المستند خارج الشاشة.
 *
 * **لماذا ليس المستند خارج الشاشة، رغم أن الخطة تقوله:** `navigator.clipboard.write`
 * يشترط مستندًا **مركَّزًا**، والمستند خارج الشاشة لا يُركَّز أبدًا بحكم
 * تعريفه — فيرمي `NotAllowedError: Document is not focused`. لا حيلة تلتفّ
 * على ذلك: البديل الشائع (`execCommand('copy')` على عنصر قابل للتحرير) يكتب
 * `text/html` لا صورة نقطية، فيلصق في محرّر بريد ويفشل في محرّر صور. المسار
 * الوحيد العامل اليوم هو صفحة مركَّزة — وصفحة المستخدم هي الوحيدة المركَّزة
 * لحظة الالتقاط. مُسجَّل في `Docs/Engineering.md §6`.
 *
 * **الحفظ يسبق النسخ دائمًا.** اللقطة في المكتبة قبل أي محاولة نسخ، فكل فشل
 * هنا يتدهور إلى «محفوظة في المكتبة» لا إلى ضياع.
 */

import { send } from '@/shared/messaging'
import { errText, ok, type Result } from '@/shared/result'

/**
 * حدّ الحمولة المنقولة عبر الرسائل.
 *
 * البايتات تعبر كنصّ base64 (الرسائل لا تحمل `Blob`)، والترميز يزيد الحجم
 * الثلث. ثمانية ميغابايت تغطّي لقطة نافذة 4K بكثافة 2× بهامش، وما فوقها
 * يعني نقلًا بطيئًا يفشل غالبًا — فيُرفَض صراحةً بدل أن يعلّق.
 */
const MAX_CLIPBOARD_BYTES = 8 * 1024 * 1024

/** base64 → `Blob`. النظير الدقيق لما يفعله `image-ops.ts` في الاتجاه الآخر. */
function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** هل تدعم هذه الصفحة كتابة صورة إلى الحافظة أصلًا؟ */
function clipboardUsable(): boolean {
  return (
    typeof ClipboardItem === 'function' &&
    typeof navigator.clipboard?.write === 'function' &&
    // سياق غير آمن (http) لا يملك `navigator.clipboard` أصلًا في Chrome.
    window.isSecureContext
  )
}

async function writeBlob(blob: Blob): Promise<Result<null>> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return ok(null)
  } catch (thrown) {
    const text = String((thrown as { message?: unknown })?.message ?? thrown).toLowerCase()
    if (text.includes('not focused')) {
      return errText('cancelled', 'الصفحة غير مركَّزة.', String(thrown))
    }
    return errText('permission-denied', 'رفض المتصفّح الكتابة إلى الحافظة.', String(thrown))
  }
}

/**
 * ينسخ لقطة محفوظة إلى الحافظة.
 *
 * يُرجع رسالة عربية جاهزة للعرض في الحالتين، ولا يرمي: النسخ إضافة على
 * الحفظ لا بديل عنه، ففشله لا يجوز أن يُقرأ كفشل الالتقاط.
 *
 * حين تكون الصفحة غير مركَّزة يُسجَّل مستمع لمرّة واحدة يُتمّ النسخ عند أوّل
 * تركيز أو نقرة — بدل أن يُطلب من المستخدم أن يعيد الالتقاط كلّه.
 */
export async function copyCaptureToClipboard(id: string): Promise<Result<null>> {
  if (!clipboardUsable()) {
    return errText(
      'permission-denied',
      'هذه الصفحة لا تسمح بالنسخ إلى الحافظة. اللقطة محفوظة في المكتبة.',
    )
  }

  const fetched = await send('capture/blob', { id })
  if (!fetched.ok) return fetched

  if (fetched.value.bytes > MAX_CLIPBOARD_BYTES) {
    return errText('invalid-data', 'اللقطة أكبر من أن تُنسخ مباشرةً. هي محفوظة في المكتبة.')
  }

  const blob = base64ToBlob(fetched.value.base64, fetched.value.mime)
  const wrote = await writeBlob(blob)
  if (wrote.ok) return wrote

  if (wrote.error.code !== 'cancelled') return wrote

  // الصفحة غير مركَّزة: نُتمّ العملية عند أوّل تركيز أو نقرة، مرّة واحدة.
  const finish = () => {
    window.removeEventListener('focus', finish)
    window.removeEventListener('pointerdown', finish, { capture: true })
    void writeBlob(blob)
  }
  window.addEventListener('focus', finish, { once: true })
  window.addEventListener('pointerdown', finish, { capture: true, once: true })

  return errText('cancelled', 'انقر في الصفحة لإتمام النسخ. اللقطة محفوظة في المكتبة.')
}
