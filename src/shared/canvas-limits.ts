/**
 * حدود `OffscreenCanvas` في Chrome — وكلفة البكسل الواحد.
 *
 * **تعيش في `shared/` لا في `background/`** لأن ثلاثة أطراف تحتاجها: عمليات
 * الصورة في الخلفية، وحارس الصفحة الكاملة في `modules/` (وهو ممنوع من
 * الاستيراد من طبقة تشغيل بقاعدة لنت مفروضة)، والواجهة حين تعرض سبب البتر.
 * وهي النقلة نفسها التي فرضتها المرحلة 8 على مفردات الإحداثيات
 * ([ADR 0008](../../Docs/ADR/0008-geometry-in-shared.md)): منطق خالص لا يجوز
 * أن يعتمد على طبقة تشغيل، فما يحتاجه الطرفان يهبط إلى القاعدة.
 *
 * **الأرقام مقيسة لا منقولة.** قيست بالبحث الثنائي وبنقاط حدّية في أربعة
 * سياقات تنفيذ — الصفحة، والـservice worker، ومستند خارج الشاشة، وWorker —
 * وفي وضعَي headed وheadless، فتطابقت كلّها. والشائع أن الحدّ 16384 خطأ:
 * ذاك `MAX_TEXTURE_SIZE` لوحدة الرسوميات، لا حدّ تخصيص Canvas.
 */

/**
 * أقصى ضلع، بالبكسل.
 *
 * مقيس: 65,535 يعمل و65,536 يعطي قماشًا ميّتًا — أفقيًّا ورأسيًّا سواءً.
 */
export const MAX_CANVAS_SIDE = 65_535

/**
 * أقصى مساحة، بالبكسل.
 *
 * مقيس: 16384×16384 يعمل و16384×16385 يموت؛ و8192×32768 يعمل و8192×32769
 * يموت — أي أن الحدّ مساحة لا ضلع، والضلعان يتقايضان حولها.
 */
export const MAX_CANVAS_AREA = 268_435_456

/** بايتات البكسل الواحد في قماش RGBA — أساس حساب ميزانية الذاكرة. */
export const CANVAS_BYTES_PER_PIXEL = 4

/**
 * لماذا لا تكفي هذه الحدود وحدها حارسًا.
 *
 * تجاوزها **لا يرمي**: `getContext('2d')` يُرجع سياقًا صالحًا،
 * و`canvas.width` يبلّغ المقاس المطلوب لا صفرًا، والرسم يُقبَل — ثم
 * `getImageData` يُرجع أصفارًا. أي صورة فارغة تُحفَظ كأنها نجحت، وهو صنف
 * العطل الأخطر في هذا المشروع: «نجح وبصمت أخطأ».
 *
 * ولذلك حارسان لا واحد: هذا قبل التخصيص، و`canvasAlive()` بعده.
 */
export function withinCanvasLimits(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  if (width <= 0 || height <= 0) return false
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) return false
  return width * height <= MAX_CANVAS_AREA
}

/** بايتات القماش الحيّة لهذه الأبعاد — ما يشغله فعلًا لا ما يُرمَّز إليه. */
export function canvasBytes(width: number, height: number): number {
  return width * height * CANVAS_BYTES_PER_PIXEL
}
