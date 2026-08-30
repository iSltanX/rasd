/**
 * الحارس الثاني: هل القماش حيّ بعد تخصيصه؟
 *
 * **حارسان لا واحد** — القاعدة مكتوبة في
 * [`canvas-limits.ts`](canvas-limits.ts) و[ADR 0011](../../Docs/ADR/0011-canvas-limits.md):
 * `withinCanvasLimits()` قبل التخصيص، وهذا بعده. والسبب أن التجاوز **لا
 * يرمي**: `getContext('2d')` يُرجع سياقًا صالحًا، و`canvas.width` يبلّغ
 * المقاس المطلوب لا صفرًا، والرسم يُقبَل — ثم يخرج كل شيء أصفارًا. صورة
 * فارغة تُحفَظ كأنها نجحت.
 *
 * **ولماذا هبطت إلى `shared/` في المرحلة 15:** كانت تعيش خاصّةً في
 * `background/stitch.ts` حين كان لها مستهلك واحد في الـservice worker.
 * والمحرر يخصّص أسطحًا أكبر منها بمراحل — قماش المسرح، وقماش الخبز، وقطع
 * التصدير — من **صفحة إضافة** لا من الخلفية، وطبقة الصفحات لا تستورد من
 * الخلفية. فنزلت إلى الطبقة القاعدية، وهي سابقة `geometry.ts`
 * ([ADR 0008](../../Docs/ADR/0008-geometry-in-shared.md)) و`data-url.ts` نفسها.
 *
 * **ومعمَّمة على السياقين** لأن المحرر يستعمل `CanvasRenderingContext2D`
 * لعنصر المسرح و`OffscreenCanvasRenderingContext2D` للخبز، والحارس نفسه
 * يلزم للاثنين.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى ولا تلمس `chrome.*`.
 */

/** ما يكفي من السياق للفحص — أضيق ما يمكن، فيقبل الصنفين معًا. */
export interface ProbeableContext {
  save(): void
  restore(): void
  fillRect(x: number, y: number, w: number, h: number): void
  getImageData(x: number, y: number, w: number, h: number): ImageData
  fillStyle: string | CanvasGradient | CanvasPattern
}

/**
 * يرسم بكسلًا ويقرؤه — والقراءة هي الجواب.
 *
 * `save`/`restore` يحفظان `fillStyle` المستدعي، والبكسل المرسوم يُغطّى
 * بأوّل رسم حقيقي. والكلفة بكسل واحد، مقابل قطع الشكّ في حدٍّ قد يتغيّر
 * بين إصدارات Chrome أو بين المنصّات — وهو ما لا يضمنه الحارس الأوّل.
 */
export function canvasAlive(ctx: ProbeableContext): boolean {
  try {
    ctx.save()
    ctx.fillStyle =
      '#ffffff' /* rasd-allow-literal: بكسل فحص لا لون واجهة — يُرسَم ويُقرأ ثم يُغطّى */
    ctx.fillRect(0, 0, 1, 1)
    const probe = ctx.getImageData(0, 0, 1, 1).data
    ctx.restore()
    return probe[3] !== 0
  } catch {
    // قماش ميّت قد يرمي على `getImageData` بدل أن يُرجع أصفارًا — الحالتان
    // جواب واحد.
    return false
  }
}
