/**
 * ميزانيات ذاكرة المحرر — سياسةٌ مشتقّة، ومعلَّمة بأنها لم تُقَس بعد.
 *
 * **في `modules/` لا في `shared/`، وهذا فصلٌ قائم لا اجتهاد.**
 * [ADR 0011](../../../Docs/ADR/0011-canvas-limits.md) يميّز صنفين:
 * `MAX_CANVAS_SIDE` و`MAX_CANVAS_AREA` **حدود منصّة مقيسة** ببحث ثنائي في
 * أربعة سياقات تنفيذ، فموطنها [`shared/canvas-limits.ts`](../../shared/canvas-limits.ts)؛
 * و`CANVAS_BUDGET_BYTES` **سياسة مرحلة** تعيش في
 * [`modules/capture/full-page/limits.ts`](../capture/full-page/limits.ts).
 * وميزانية المحرر من الصنف الثاني: تستقبل أبعاد مسرح واجهة، وتتغيّر بقرار
 * منتج لا بقياس عتاد.
 *
 * **ولا تُستعار `CANVAS_BUDGET_BYTES`.** نصّ ADR 0011 صريح: «مقاسة لقماش
 * **واحد** في الـservice worker، لا لطبقتين في صفحة… ويلزمه ميزانيته هو —
 * لم تُقَس بعد». والمحرر يحمل في أسوأ لحظة أربعة أسطح: بتماب المصدر،
 * وطبقتَي المسرح، وقماش الخبز.
 *
 * **الأرقام أدناه مشتقّة لا مقيسة**، والسقف الذي اشتُقّت منه (400MB في جدول
 * المرحلة 24) **لم يُقَس قطّ** (`Phase_10.md`). تُعاير في الدفعة الثالثة
 * بقياس حيّ على 4000×3000 وعلى الحالة القصوى، ويُثبَّت ما تعطيه.
 */

import { canvasBytes, MAX_CANVAS_SIDE, withinCanvasLimits } from '@/shared/canvas-limits'

/**
 * ميزانية الطبقة الواحدة على المسرح — 48MiB.
 *
 * **القرار الجوهري: القماشان بمقاس المسرح لا بمقاس الصورة.** الفرق ليس
 * تحسينًا بل شرط جدوى: مسرح 1060×839 على لقطة 4000×3000 عند كثافة 2 يعطي
 * 13.6MiB للطبقة، بينما قماشان بمقاس الصورة يعطيان 45.8MiB لكلٍّ. وعلى
 * الحالة القصوى (2560×28,672) يستحيل الثاني أصلًا: 280MiB للسطح الواحد.
 *
 * و48MiB تسمح بمسرح 4K كامل عند كثافة 2 (3840×2160×4 ÷ 4 = 33MiB) بهامش.
 */
export const EDITOR_STAGE_BUDGET_BYTES = 48 * 1024 * 1024

/**
 * سقف مخابئ النقط (نصّ · دبابيس · رقع الطمس) — 64MiB.
 *
 * المخبأ يشتري إعادة الرسم: نصٌّ عربي مُخطَّط ومرسوم مرّة يُعاد بـ`drawImage`
 * بدل قياس ولفّ ورسم في كل إطار. وبلا سقف يتحوّل إلى تسريب بطيء: كل مستوى
 * تكبير يولّد نقطًا جديدة لكل عقدة.
 */
export const EDITOR_CACHE_BUDGET_BYTES = 64 * 1024 * 1024

/**
 * شريحة المصدر الواحدة أثناء الخبز — 32MiB.
 *
 * الخبز على الحالة القصوى لا يحتمل بتمابًا كاملًا بجوار قماش الخبز
 * (280 + 280 = 560MiB). فتُقرأ الشرائح بـ`createImageBitmap(blob, sx, sy, …)`
 * وتُغلَق فور رسمها — والذروة تصير قماش الخبز + شريحة واحدة.
 *
 * والقياس الذي يسند الإغلاق الفوري من المرحلة 10: حجز 29 بلاطة أعطى
 * **+378MB**، وعادت الذاكرة خلال **2.2 ثانية** بعد `close()`.
 */
export const BAKE_SLICE_BUDGET_BYTES = 32 * 1024 * 1024

/**
 * سقف سطح الخبز الواحد — 280MiB.
 *
 * **حدود المنصّة وحدها لا تكفي حارسًا هنا.** مقيس: 8000×6000 عند 2× تعطي
 * 16,000×12,000 ⇒ مساحة 192 مليون بكسل، وهي **تحت** `MAX_CANVAS_AREA`
 * (268 مليون) فتمرّ من `withinCanvasLimits` — بينما سطحها **732 ميغابايت**،
 * أي ضِعف سقف المرحلة. فيُخصَّص ما لا تحتمله الصفحة، وقد يُقبَل الرسم
 * ويخرج أصفارًا: «نجح وبصمت أخطأ».
 *
 * والرقم 280MiB يسع الحالة القصوى عند 1× **بالضبط** (2560×28,672×4 =
 * 293,601,280 = 280MiB)، وهو الرقم نفسه الذي اشتقّه ADR 0011 لقماش واحد.
 * والذروة معه = السطح + شريحة (32MiB) + طبقتا المسرح (5.3MiB مقيسة في
 * الدفعة الثالثة) ≈ 317MiB، دون سقف 400MB.
 */
export const BAKE_SURFACE_BUDGET_BYTES = 280 * 1024 * 1024

/** أدنى كثافة نسمح بالهبوط إليها قبل أن نُعلن العجز بدل أن نصمت. */
export const MIN_BACKING_SCALE = 1

export interface SurfacePlan {
  /** عرض مخزن الرسم بالبكسل. */
  readonly width: number
  readonly height: number
  /**
   * معامل التحويل من بكسل CSS إلى بكسل مخزن الرسم.
   *
   * يُطبَّق بـ`setTransform` وحده، فلا يظهر في أي إحداثي — وهذا ما يُبقي
   * تسامح الإصابة 6px صحيحًا بلا قسمة على كثافة البكسل.
   */
  readonly backingScale: number
  readonly bytes: number
  /** هبطت الكثافة دون كثافة الجهاز — يُعلَن ولا يُخفى. */
  readonly degraded: boolean
}

/**
 * كثافة مخزن الرسم للمسرح — `min(dpr, ما تسمح به الميزانية)`.
 *
 * الهبوط تدريجي لا ثنائي: `dpr` ثم `√(الميزانية ÷ مساحة CSS)` مقصوصًا عند
 * الواحد. والمهمّ أنه **يُعلَن** في `degraded`: انحدار الجودة الصامت هو ما
 * يجعل أداة فحص بصري تكذب على مستخدمها.
 */
export function backingScaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  const area = cssWidth * cssHeight
  if (area <= 0) return MIN_BACKING_SCALE
  const allowed = Math.sqrt(EDITOR_STAGE_BUDGET_BYTES / (area * 4))
  return Math.max(MIN_BACKING_SCALE, Math.min(dpr, allowed))
}

/**
 * خطّة سطح المسرح، مع حارس الحدود قبل التخصيص.
 *
 * `withinCanvasLimits` هنا ليست احتياطًا نظريًّا: مسرح عريض على شاشة كبيرة
 * بكثافة 3 يبلغ حدّ المساحة قبل حدّ الضلع بكثير، والتجاوز **لا يرمي**.
 */
export function planStageSurface(cssWidth: number, cssHeight: number, dpr: number): SurfacePlan {
  const scale = backingScaleFor(cssWidth, cssHeight, dpr)
  const width = Math.max(1, Math.floor(cssWidth * scale))
  const height = Math.max(1, Math.floor(cssHeight * scale))
  return {
    width,
    height,
    backingScale: scale,
    bytes: canvasBytes(width, height),
    degraded: scale < dpr,
  }
}

/**
 * ارتفاع شريحة الخبز لعرض معلوم.
 *
 * سطر واحد على الأقلّ مهما بلغ العرض: صورة عرضها 65,535 تستهلك 262KB للسطر،
 * وهي دون الميزانية بمراحل — لكن الحارس يمنع صفرًا لو تغيّرت الميزانية يومًا.
 */
export function sliceHeightFor(width: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.floor(BAKE_SLICE_BUDGET_BYTES / (width * 4)))
}

/** عدد الشرائح اللازمة لصورة — يُعرض في تقدّم التصدير. */
export function sliceCountFor(width: number, height: number): number {
  return Math.max(1, Math.ceil(height / sliceHeightFor(width)))
}

/**
 * لماذا رُفض التصدير — **ثلاثة أسباب لا واحد**.
 *
 * دمجها في «كبيرٌ جدًّا» يترك المستخدم بلا فعل: من رُفض بالضلع لا ينفعه
 * تصغير المقياس (الضلع لا يتغيّر بالاقتصاص الأفقي)، ومن رُفض بالميزانية
 * ينفعه 1× فورًا. والسبب الذي لا يُملي فعلًا ليس سببًا.
 */
export type ExportBound = 'none' | 'side' | 'area' | 'budget'

export interface ExportPlan {
  readonly width: number
  readonly height: number
  readonly slices: number
  readonly bytes: number
  readonly bound: ExportBound
  /** `null` يعني: يمكن التصدير. وإلّا فسببٌ **يُعرض للمستخدم** لا يُبتلع. */
  readonly refusal: 'oversized' | null
}

/**
 * خطّة التصدير بعد تطبيق معامل الدقّة.
 *
 * **الحارس يُستدعى على الأبعاد بعد الضرب لا قبله** — نصّ ADR 0011: خيار
 * `2×` يضاعف كل ضلع فيضرب المساحة في أربعة. والحالة القصوى تكشف الفخّ:
 * `2560×28,672` عند `2×` تصير `5120×57,344`؛ الضلع 57,344 ≤ 65,535 فيمرّ من
 * فرع الضلع، **والمساحة 293.6M > 268.4M هي التي تمسك**. ولو لم تُمسك لخرج
 * قماشٌ يقبل الرسم ويُنتج أصفارًا.
 */
export function planExportSurface(
  imageWidth: number,
  imageHeight: number,
  scale: number,
): ExportPlan {
  const width = Math.round(imageWidth * scale)
  const height = Math.round(imageHeight * scale)
  const bytes = canvasBytes(width, height)

  /*
   * الترتيب مقصود: الضلع أوّلًا لأنه الحدّ الأصلب (لا يُخفَّف إلّا باقتصاص
   * في ذلك المحور)، ثمّ المساحة، ثمّ الميزانية — وهي الوحيدة التي يكفي
   * لتجاوزها خفضُ المقياس.
   */
  const bound: ExportBound =
    width <= 0 || height <= 0
      ? 'area'
      : width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE
        ? 'side'
        : !withinCanvasLimits(width, height)
          ? 'area'
          : bytes > BAKE_SURFACE_BUDGET_BYTES
            ? 'budget'
            : 'none'

  return {
    width,
    height,
    slices: sliceCountFor(width, height),
    bytes,
    bound,
    refusal: bound === 'none' ? null : 'oversized',
  }
}
