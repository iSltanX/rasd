/**
 * القياس داخل المحرر — أرقامٌ يقرؤها إنسان، لا بكسلات صورة.
 *
 * **العقدة الوحيدة في هذا الملفّ هي كثافة البكسل، وهي معيار قبول الدفعة.**
 * المشهد كلّه بفضاء الصورة: لقطةٌ كثافتها 2 تجعل فجوةً صمّمها أحدٌ على
 * **16 بكسل CSS** تُقاس **32** بكسل صورة. وعرضُ «32» صحيحٌ حسابيًّا وخطأٌ
 * تمامًا: المستخدم يقارن ما يراه بما هو مكتوب في ورقة التصميم، وتلك تقول 16.
 *
 * **والتحويل يقع عند العرض لا في المشهد.** إبقاء المشهد في فضاء واحد هو ما
 * يجعل الخبز والإصابة والحدود تعمل بلا فروع؛ وتحويلُه عند التخزين يُدخل
 * فضاءً خامسًا يجب أن يتذكّره كل قارئ.
 *
 * **والالتقاط عتبتان لا واحدة، ويُؤخَذ أوسعهما.**
 *
 * عتبة `SNAP_THRESHOLD_PX` أربعة بكسلات CSS، والسؤال: أيّ CSS؟ الجواب
 * **الاثنان معًا**، لأن لكلٍّ سببًا مختلفًا:
 *
 *   - **CSS الصفحة الملتقَطة** — لأن الالتقاط يعني «هذه الحافّة تحاذي تلك»،
 *     وهي دعوى عن تصميم الصفحة لا عن شاشتنا. على لقطة كثافتها 2 تساوي
 *     ثمانية بكسلات صورة، فتُقرأ 4 بوحدات الصفحة. ونصّ المرحلة صريح:
 *     «الالتقاط يقع عند 4 بكسل CSS لا 2».
 *   - **CSS شاشتنا** — لأن اليد لا تصير أدقّ حين يُصغّر المستخدم. عند
 *     تكبير 0.25 تساوي ستّة عشر بكسل صورة.
 *
 * والقسمة على التكبير وحدها تعطي 4 بكسلات صورة عند 1×، أي **2 فقط** بوحدات
 * صفحةٍ كثافتها 2 — نصف الوعد بالضبط. والضربُ بالكثافة وحده يجعل الالتقاط
 * مستحيلًا عند التصغير.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { fourWayGap, type FourWayGap } from '@/modules/measure/distance'
import { SNAP_THRESHOLD_PX } from '@/modules/measure/snap'
import { formatUnit } from '@/shared/bidi'

import { cssToImage, imageToCss } from './scene'

import type { MeasureNode } from './scene'
import type { DeviceRect } from '@/shared/geometry'

/** عتبة الالتقاط بفضاء الصورة — أوسع العتبتين. */
export function snapThresholdFor(zoom: number, dpr: number): number {
  const byPage = cssToImage(SNAP_THRESHOLD_PX, dpr)
  const byScreen = SNAP_THRESHOLD_PX / Math.max(0.0001, zoom)
  return Math.max(byPage, byScreen)
}

export interface MeasureReading {
  /** ما يُعرض — بوحدات CSS للّقطة، لا ببكسلات صورتها. */
  readonly label: string
  /** القيمة الخام بفضاء الصورة — لرسم الخطوط. */
  readonly pixels: number
  /** الاتجاه الذي قيس فيه، أو `null` لقياس المقاس. */
  readonly direction: FourWayGap['nearest']
  /** حدٌّ يُعلَن: لا فجوة موجبة بين المستطيلين. */
  readonly overlapping: boolean
}

/**
 * يقرّب إلى منزلة عشرية واحدة، ويحذف الصفر التافه.
 *
 * قسمة على كثافة غير صحيحة (1.5 مثلًا) تُنتج `10.666666666666666`، وعرضه
 * يوحي بدقّةٍ لا تملكها القياسات أصلًا.
 */
const tidy = (n: number): number => Math.round(n * 10) / 10

/** قياس مقاس مستطيل واحد. */
export function readSize(rect: DeviceRect, dpr: number): { width: string; height: string } {
  return {
    width: formatUnit(tidy(imageToCss(Math.abs(rect.width), dpr))),
    height: formatUnit(tidy(imageToCss(Math.abs(rect.height), dpr))),
  }
}

/**
 * قياس الفجوة بين مستطيلين.
 *
 * التداخل يُعلَن ولا يُعرض رقمًا سالبًا: «متداخلان» جوابٌ صحيح، و«‎−12px‎»
 * جوابٌ يبدو قياسًا وليس به.
 */
export function readGap(a: DeviceRect, b: DeviceRect, dpr: number): MeasureReading {
  const gap = fourWayGap(a, b)
  if (gap.nearest === null || gap.nearestValue === null) {
    return { label: 'متداخلان', pixels: 0, direction: null, overlapping: true }
  }
  return {
    label: formatUnit(tidy(imageToCss(gap.nearestValue, dpr))),
    pixels: gap.nearestValue,
    direction: gap.nearest,
    overlapping: false,
  }
}

/** قراءة عقدة قياس كاملة — مقاسًا أو فجوة بحسب ما تحمل. */
export function readMeasure(node: MeasureNode, dpr: number): MeasureReading {
  if (node.b === null || node.show === 'size') {
    const size = readSize(node.a, dpr)
    return {
      // العرض ثمّ الارتفاع، بعلامة ضرب رياضية لا حرف x.
      label: `${size.width} × ${size.height}`,
      pixels: Math.abs(node.a.width),
      direction: null,
      overlapping: false,
    }
  }
  return readGap(node.a, node.b, dpr)
}

/**
 * القطعة التي تُرسم بين المستطيلين لاتجاه معلوم.
 *
 * تُرسم على **محور المنتصف المشترك** لا على حافّة أحدهما: خطٌّ ملتصق بحافّة
 * يُقرأ حدًّا للمستطيل لا قياسًا للفجوة.
 */
export function gapSegment(
  a: DeviceRect,
  b: DeviceRect,
  direction: NonNullable<FourWayGap['nearest']>,
): { x1: number; y1: number; x2: number; y2: number } {
  const overlapMid = (a0: number, a1: number, b0: number, b1: number): number => {
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    return lo <= hi ? (lo + hi) / 2 : (a0 + a1 + b0 + b1) / 4
  }

  if (direction === 'top' || direction === 'bottom') {
    const x = overlapMid(a.x, a.x + a.width, b.x, b.x + b.width)
    return direction === 'top'
      ? { x1: x, y1: b.y + b.height, x2: x, y2: a.y }
      : { x1: x, y1: a.y + a.height, x2: x, y2: b.y }
  }

  const y = overlapMid(a.y, a.y + a.height, b.y, b.y + b.height)
  return direction === 'left'
    ? { x1: b.x + b.width, y1: y, x2: a.x, y2: y }
    : { x1: a.x + a.width, y1: y, x2: b.x, y2: y }
}
