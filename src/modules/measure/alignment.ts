/**
 * محاور المحاذاة المشتركة بين مستطيلين.
 *
 * ستّة محاور لا أربعة: الحوافّ الأربعة **والمركزان**. مركّبتا التصميم
 * كثيرًا ما تُحاذَيان بمركزيهما لا حوافّهما (زرّان بعرضين مختلفين وسط
 * البطاقة نفسها)، وإغفال المركز يفوّت أكثر حالة محاذاة شيوعًا في الواقع.
 *
 * **المطابقة والانحراف القريب معًا لا المطابقة وحدها.** نصّ المرحلة يطلب
 * «تنبيه عند انحراف 1–2px» — أي أن محورًا أخطأ المحاذاة بمقدار ضئيل يستحقّ
 * أن يُرى لا أن يُسقَط بصمت لأنه ليس صفرًا تمامًا.
 */

import type { Rect, Space } from '@/shared/geometry'

export type AlignAxis = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

export interface AlignMatch {
  readonly axis: AlignAxis
  /** القيمة على (أ). */
  readonly a: number
  /** القيمة على (ب). */
  readonly b: number
  /** `b - a` — صفر يعني محاذاة تامّة، وإلا فهو مقدار الانحراف وجهته. */
  readonly delta: number
}

/**
 * أقصى انحراف يُبلَّغ عنه.
 *
 * أعلى حدّ نصّ المرحلة («1–2px»)؛ فوقه لا يُعدّ المحوران متقاربين بل
 * مختلفَين عمدًا، ولا تُنتزَع منهما ضوضاء بصرية لا فائدة منها.
 */
export const ALIGN_TOLERANCE_PX = 2

const HORIZONTAL: readonly (readonly ['left' | 'right' | 'centerX', (r: Rect) => number])[] = [
  ['left', (r) => r.x],
  ['right', (r) => r.x + r.width],
  ['centerX', (r) => r.x + r.width / 2],
]

const VERTICAL: readonly (readonly ['top' | 'bottom' | 'centerY', (r: Rect) => number])[] = [
  ['top', (r) => r.y],
  ['bottom', (r) => r.y + r.height],
  ['centerY', (r) => r.y + r.height / 2],
]

/**
 * كل زوج محاور (من نفس البُعد فقط — أفقي مع أفقي، رأسي مع رأسي) بفارق
 * ضمن {@link ALIGN_TOLERANCE_PX}.
 *
 * **لا مقارنة بين بُعدين مختلفين**: `left` مع `top` مقارنة بلا معنى
 * هندسي، فحتى تطابق رقميّ صدفةً بينهما ليس محاذاة.
 */
export function detectAlignment<S extends Space>(a: Rect<S>, b: Rect<S>): readonly AlignMatch[] {
  const out: AlignMatch[] = []
  for (const group of [HORIZONTAL, VERTICAL]) {
    for (const [axis, read] of group) {
      const av = read(a)
      const bv = read(b)
      const delta = bv - av
      if (Math.abs(delta) <= ALIGN_TOLERANCE_PX) out.push({ axis, a: av, b: bv, delta })
    }
  }
  return out
}
