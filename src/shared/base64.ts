/**
 * ترميز البايتات وفكّها عبر حدّ الرسائل.
 *
 * الرسائل **لا تحمل `Blob`**: قِيس أن `Blob` و`ImageBitmap` يمرّان عبر
 * `chrome.runtime` ككائن فارغ `{}` بلا خطأ — فقدٌ صامت يمرّ من كل اختبار
 * (انظر ترويسة `background/full-page-job.ts` و[ADR 0009](../../Docs/ADR/0009-capture-in-service-worker.md)).
 * فالبايتات تعبر نصًّا مُرمَّزًا، وهذا الملفّ طريقها الوحيد.
 *
 * **في `shared/` لا في إحدى الطبقتين**: الخلفية والصفحة كلتاهما تحتاج
 * الاتجاهين الآن — الخلفية تُرمِّز ما تقرؤه من المخزن وتفكّ ما يصلها من
 * صورة مرفوعة، والصفحة تعكسهما — وهما طبقتان لا تستورد إحداهما من الأخرى.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها، ولا تلمس `chrome.*`.
 */

/**
 * حجم الدفعة.
 *
 * `String.fromCharCode(...bytes)` على صورة بحجم ميغابايت يتجاوز حدّ وسائط
 * النداء ويرمي `RangeError` — فالترميز على دفعات لا دفعةً واحدة.
 */
const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * `Uint8Array<ArrayBuffer>` لا `Uint8Array` المجرّدة: الأخيرة تُستنتَج
 * `ArrayBufferLike` فتقبل `SharedArrayBuffer`، وهو ما لا يقبله `BlobPart`.
 * فيُنشَأ المخزن صراحةً كي يبقى النوع ضيّقًا حتى `base64ToBlob`.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

export function base64ToBlob(base64: string, mime: string): Blob {
  return new Blob([base64ToBytes(base64)], { type: mime })
}
