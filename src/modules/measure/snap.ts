/**
 * الالتقاط اللحظي إلى حافّة عنصر قريب.
 *
 * **قيمة واحدة بُعدًا لا نقطة**: المحورين يُلتقطان كلٌّ على حدة (`x` إلى
 * أقرب حافّة رأسية، `y` إلى أقرب حافّة أفقية) لأن مصدرَي أقرب حافّة أفقيًّا
 * وأقرب حافّة رأسيًّا مختلفان غالبًا — عنصران متجاوران لا يشتركان بالضرورة
 * في حافّة واحدة على المحورين معًا.
 */

/**
 * أقصى مسافة يلتقط عندها — نصّ المرحلة: «ضمن 4px».
 */
export const SNAP_THRESHOLD_PX = 4

/**
 * أقرب مرشَّح ضمن {@link SNAP_THRESHOLD_PX}، أو `null` إن لم يقترب شيء.
 *
 * عند تعادل مرشَّحين على المسافة نفسها يُفضَّل **الأقرب رقميًّا للقيمة
 * الأصلية بترتيب الظهور** — أي أوّل مرشَّح يبلغ أدنى مسافة، فالنتيجة
 * حتمية لا تعتمد على ترتيب غير مضمون في القائمة المصدر.
 */
export function nearestSnap(value: number, candidates: readonly number[]): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value)
    if (distance <= SNAP_THRESHOLD_PX && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/** نقطة ملتقَطة على المحورين معًا — كلّ محور مستقلّ. */
export interface SnappedPoint {
  readonly x: number
  readonly y: number
  /** هل التُقط المحور الأفقي فعلًا؟ */
  readonly snappedX: boolean
  readonly snappedY: boolean
}

/**
 * يلتقط نقطة إلى أقرب مرشَّحَي `x`/`y` إن وُجدا، وإلا يُبقيها كما هي.
 *
 * **`disabled` يُفحَص هنا لا عند كل نداء من الطبقة الأعلى** — القرار
 * ينتمي إلى المنطق الذي يقرّر الالتقاط، والاستدعاء الواحد أبسط من تكرار
 * الشرط في كل موضع سحب. `⌥` هو ما يمرّر `true`.
 */
export function snapPoint(
  x: number,
  y: number,
  candidatesX: readonly number[],
  candidatesY: readonly number[],
  disabled = false,
): SnappedPoint {
  if (disabled) return { x, y, snappedX: false, snappedY: false }
  const sx = nearestSnap(x, candidatesX)
  const sy = nearestSnap(y, candidatesY)
  return {
    x: sx ?? x,
    y: sy ?? y,
    snappedX: sx !== null,
    snappedY: sy !== null,
  }
}
