/**
 * فكّ ترميز عناوين البيانات — بلا شبكة وبلا سياسة.
 *
 * **لماذا فكّ يدوي بدل `fetch(dataUrl)`:** بيان رصد يقول
 * `connect-src 'self'`، و`data:` ليست `'self'` — فـ`fetch` على عنوان بيانات
 * يُرفَض بـ`TypeError: Failed to fetch`. والفخّ أن الطريقة تنجح في أي تجربة
 * **خارج** الإضافة وتفشل داخلها وحدها. الفكّ اليدوي لا يمرّ بالطبقة الشبكية
 * أصلًا، فلا سياسة تحكمه. مُسجَّل في
 * [ADR 0009](../../Docs/ADR/0009-capture-in-service-worker.md).
 *
 * **ولماذا في `shared/` منذ المرحلة 13:** بُنيت في `background/` في المرحلة
 * 8 حين كان لها مستهلك واحد. والمرحلة 13 تحتاجها في **الصفحة** كذلك (فكّ
 * لقطة العيّنة قبل قراءة بكسلاتها)، وطبقة المحتوى لا تستورد من الخلفية —
 * فنزلت إلى الطبقة القاعدية، وهي السابقة نفسها التي نزلت بها
 * [`geometry.ts`](../../Docs/ADR/0008-geometry-in-shared.md) و
 * `canvas-limits.ts`.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى ولا تلمس `chrome.*`.
 */

/**
 * `data:image/png;base64,…` → بايتات.
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
export function dataUrlMime(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png'
}

/** عنوان بيانات → `Blob` جاهز لـ`createImageBitmap`. */
export function dataUrlToBlob(dataUrl: string): Blob {
  return new Blob([dataUrlToBytes(dataUrl)], { type: dataUrlMime(dataUrl) })
}
