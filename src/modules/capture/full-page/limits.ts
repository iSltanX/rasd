/**
 * حارس ما قبل الحلقة — هل تسع هذه الصفحة صورةً واحدة أصلًا؟
 *
 * **الحارس حارس ذاكرة أوّلًا لا حارس أبعاد.** الخطّة تؤطّره على أنه حدّ
 * أبعاد Canvas، والقياس يقول إن الأبعاد لا تُبلَغ عمليًّا: عند عرض 2560
 * بكسل جهاز يسمح فرع الضلع بـ65,535 صفًّا، وفرع المساحة بـ104,857، بينما
 * ميزانية الذاكرة تسمح بـ28,672 — أصغر بـ2.3× من أقرب منافس.
 *
 * ولماذا يُفحص **قبل** الحلقة: المهمّة تستغرق عشرين ثانية. إخبار المستخدم
 * بعدها أن الصفحة لا تسع أسوأ من إخباره قبلها بثانية.
 *
 * `modules/` منطق خالص — ولذلك تعيش ثوابت القماش في `shared/canvas-limits.ts`
 * لا في `background/image-ops.ts`: قاعدة لنت مفروضة تمنع هذا المجلّد من
 * الاستيراد من طبقة تشغيل.
 */

import { CANVAS_BYTES_PER_PIXEL, MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '@/shared/canvas-limits'

/**
 * ميزانية بايتات القماش الافتراضية.
 *
 * معيار المرحلة «≤400MB ذروة»، والقماش ليس وحده في الذاكرة: البلاطة الطائرة
 * وصورتها المفكوكة وأساس الـservice worker الحيّ كلّها فوقه. فالميزانية
 * أقلّ من السقف بفارق يسع الباقي.
 */
export const CANVAS_BUDGET_BYTES = 280 * 1024 * 1024

export interface StitchPlan {
  /** أقصى ارتفاع بالبكسل الجهازي تسعه صورة واحدة. */
  readonly maxHeight: number
  /** أيّ فرع هو المُلزِم — يُعرَض للمستخدم كي يفهم السبب لا الرقم وحده. */
  readonly bound: 'memory' | 'area' | 'side'
}

/**
 * أقصى ارتفاع تسعه صورة واحدة بهذا العرض.
 *
 * ثلاثة فروع، وأصغرها يحكم. وتسمية الفرع المُلزِم ليست ترفًا: «الصفحة أطول
 * من حدّ الصورة» جوابٌ لا يفيد المستخدم، و«أطول مما تسعه الذاكرة» يفيده لأنه
 * قد يغلق تبويبات ويعيد المحاولة.
 */
export function planStitch(width: number, budgetBytes: number = CANVAS_BUDGET_BYTES): StitchPlan {
  if (width <= 0) return { maxHeight: 0, bound: 'side' }

  const bySide = MAX_CANVAS_SIDE
  const byArea = Math.floor(MAX_CANVAS_AREA / width)
  const byMemory = Math.floor(budgetBytes / (width * CANVAS_BYTES_PER_PIXEL))

  let maxHeight = bySide
  let bound: StitchPlan['bound'] = 'side'
  if (byArea < maxHeight) {
    maxHeight = byArea
    bound = 'area'
  }
  if (byMemory < maxHeight) {
    maxHeight = byMemory
    bound = 'memory'
  }
  return { maxHeight: Math.min(maxHeight, MAX_CANVAS_SIDE), bound }
}

/**
 * هل يُبتَر الالتقاط عند هذا الارتفاع؟
 *
 * `null` يعني يسع كاملًا. وغير ذلك: الارتفاع المسموح، ونسبته من المطلوب.
 */
export interface Truncation {
  readonly allowedHeight: number
  readonly requestedHeight: number
  readonly bound: StitchPlan['bound']
}

export function truncationOf(
  width: number,
  requestedHeight: number,
  budgetBytes?: number,
): Truncation | null {
  const plan = planStitch(width, budgetBytes)
  if (requestedHeight <= plan.maxHeight) return null
  return { allowedHeight: plan.maxHeight, requestedHeight, bound: plan.bound }
}

/**
 * أقصى عدد بلاطات قبل بلوغ الحدّ.
 *
 * يُحسب من ارتفاع البلاطة الفعلي (بالبكسل الجهازي) لا من رقم ثابت: صفحة
 * بكثافة 2 تبلغ الحدّ في نصف عدد بلاطات صفحة بكثافة 1.
 */
export function maxTiles(width: number, tileHeight: number, budgetBytes?: number): number {
  if (tileHeight <= 0) return 0
  return Math.max(1, Math.floor(planStitch(width, budgetBytes).maxHeight / tileHeight))
}
