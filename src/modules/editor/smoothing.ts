/**
 * تنعيم المسار الحرّ — من عيّنات المؤشّر الخام إلى منحنى يُحفَظ.
 *
 * **العيّنة الخام ليست ما رسمه المستخدم.** المؤشّر يُعيَّن عند معدّل تحديث
 * الشاشة، فقوسٌ رُسم بحركة يد واحدة يصل مضلّعًا من مئات الأوتار. وعند تكبير
 * ٤× — وهو تكبير عاديّ في أداة **فحص بصري** — تظهر أضلاعه. وأداةٌ تدّعي دقّة
 * القياس ثمّ ترسم حوافّ مسنّنة تنقض دعواها بالصورة التي تُصدّرها.
 *
 * والمعالجة مرحلتان بترتيب لا يُعكَس:
 *
 * **١. تبسيط (RDP) ثمّ تنعيم (Chaikin) — لا العكس.** خرج شايكن كثيفٌ بالبناء،
 * وRDP بعده يُبقي **نقاط أقصى انحراف** — أي الزوايا نفسها التي أزالها شايكن،
 * فيعيد بناء المضلّع الذي دفعنا ثمن إزالته. والترتيب الصحيح يجعل كلفة شايكن
 * محدودة أيضًا: يعمل على عشرات النقاط لا على آلاف.
 *
 * **٢. والسقف يُحسَب قبل التنعيم لا بعده.** شايكن يضاعف العدد كل مرّة
 * (`2n−2` للمسار المفتوح)، فمسارٌ بُسِّط إلى ٤٠٠ نقطة يصل ١٦٠٠ بعد جولتين —
 * فوق `MAX_FREEHAND_POINTS` بثلاثة أضعاف، ثمّ يرتطم بـ`MAX_SCENE_BYTES`.
 * فالعتبة تتصاعد حتى يفي **الناتج النهائي** بالسقف، لا المدخل.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { MAX_FREEHAND_POINTS } from './scene'

/**
 * عتبة التبسيط الابتدائية ببكسل **الصورة**.
 *
 * تحت البكسل الواحد: انحرافٌ لا يُرى حتى عند ٤×، ويُدفع ثمنه نقطةً محفوظة.
 * وفوق ثلاثة: تُقصَّ زوايا قصدها المستخدم.
 */
export const RDP_EPSILON_PX = 1.2

/** أقصى تصعيد للعتبة قبل الاستسلام والاقتطاع — حارس حلقة لا سياسة. */
const MAX_EPSILON_PX = 64

/** جولات شايكن. اثنتان تكفيان: الثالثة تغيّر أقلّ من نصف بكسل وتضاعف الحجم. */
export const CHAIKIN_PASSES = 2

/**
 * أقلّ مسافة بين عيّنتين متتاليتين أثناء الرسم الحيّ.
 *
 * يدٌ ساكنة على الزرّ تُنتج عشرات النقاط في المكان نفسه، فتنتفخ المصفوفة بلا
 * معلومة. والترشيح هنا لا هناك: العيّنات المكرّرة تُفسد RDP أيضًا (وترٌ طوله
 * صفر لا يُعرَّف له عمود).
 */
export const MIN_SAMPLE_DIST_PX = 1

/** عدد نقاط مصفوفة مسطَّحة. */
export const pointCount = (flat: readonly number[]): number => flat.length >> 1

/**
 * يضمّ عيّنة إلى مسار حيّ، ويرفضها إن كانت أقرب من `MIN_SAMPLE_DIST_PX`.
 *
 * يُعيد المصفوفة نفسها عند الرفض — كي يميّز المستدعي «لا جديد» بلا مقارنة.
 */
export function appendSample(flat: readonly number[], x: number, y: number): readonly number[] {
  const n = flat.length
  if (n >= 2) {
    const dx = x - flat[n - 2]!
    const dy = y - flat[n - 1]!
    if (dx * dx + dy * dy < MIN_SAMPLE_DIST_PX * MIN_SAMPLE_DIST_PX) return flat
  }
  return [...flat, x, y]
}

/** مربّع المسافة العمودية من نقطة إلى المستقيم (أ→ب). */
function perpSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    // وترٌ منعدم: المسافة إلى النقطة نفسها، لا قسمة على صفر.
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  const cross = (px - ax) * dy - (py - ay) * dx
  return (cross * cross) / lenSq
}

/**
 * تبسيط رامر–دوغلاس–بويكر بمكدّس صريح.
 *
 * **صريح لا تعاودي:** أسوأ حالة RDP مسارٌ رتيب يقتطع نقطةً واحدة عند كل
 * قسمة، فعمق التعاود يساوي عدد النقاط. ومسارٌ من ستّة آلاف عيّنة — وهو ما
 * تُنتجه حركة يد بطيئة على شاشة ١٢٠هرتز — يُفجّر مكدّس النداءات.
 */
export function simplify(flat: readonly number[], epsilonPx: number): readonly number[] {
  const n = pointCount(flat)
  if (n < 3) return flat

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const epsSq = epsilonPx * epsilonPx
  const stack: number[] = [0, n - 1]

  while (stack.length > 0) {
    const last = stack.pop()!
    const first = stack.pop()!
    if (last - first < 2) continue

    const ax = flat[first * 2]!
    const ay = flat[first * 2 + 1]!
    const bx = flat[last * 2]!
    const by = flat[last * 2 + 1]!

    let farIndex = -1
    let farDist = epsSq

    for (let i = first + 1; i < last; i++) {
      const d = perpSq(flat[i * 2]!, flat[i * 2 + 1]!, ax, ay, bx, by)
      if (d > farDist) {
        farDist = d
        farIndex = i
      }
    }

    if (farIndex !== -1) {
      keep[farIndex] = 1
      stack.push(first, farIndex, farIndex, last)
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i] === 1) out.push(flat[i * 2]!, flat[i * 2 + 1]!)
  }
  return out
}

/**
 * جولة قصّ زوايا واحدة بخوارزمية شايكن.
 *
 * كل وتر يُستبدل بنقطتيه عند الربع والثلاثة أرباع. **والطرفان يُثبَّتان في
 * المسار المفتوح**: تحريك أوّل نقطة يزحزح بداية السهم عمّا أشار إليه المستخدم.
 *
 * وتثبيتهما يُسقط النقطة المجاورة لكلٍّ منهما — لا يُضيفها فوقها. الصيغة
 * الساذجة (طرفٌ مثبّت **زائد** ربع الوتر الأوّل) تُنتج وترًا طوله ربع الأصل
 * ملتصقًا بالطرف، فتظهر عُقدة عند رأس كل سهم تشتدّ مع كل جولة. فالعدد
 * `2n−2` لا `2n`.
 */
export function chaikinPass(flat: readonly number[], closed: boolean): readonly number[] {
  const n = pointCount(flat)
  if (n < 3) return flat

  const out: number[] = []
  if (!closed) out.push(flat[0]!, flat[1]!)

  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n
    const ax = flat[i * 2]!
    const ay = flat[i * 2 + 1]!
    const bx = flat[j * 2]!
    const by = flat[j * 2 + 1]!
    // الطرف المثبّت يقوم مقام نقطة الربع في الوتر الأوّل، ومقام نقطة
    // الثلاثة أرباع في الأخير.
    if (closed || i > 0) out.push(ax + (bx - ax) * 0.25, ay + (by - ay) * 0.25)
    if (closed || i < segments - 1) out.push(ax + (bx - ax) * 0.75, ay + (by - ay) * 0.75)
  }

  if (!closed) out.push(flat[(n - 1) * 2]!, flat[(n - 1) * 2 + 1]!)
  return out
}

/** يطبّق جولات شايكن المتتابعة. */
export function smooth(flat: readonly number[], closed: boolean, passes = CHAIKIN_PASSES): readonly number[] {
  let out = flat
  for (let i = 0; i < passes; i++) out = chaikinPass(out, closed)
  return out
}

export interface SmoothResult {
  readonly points: readonly number[]
  /** العتبة التي استُقرّ عليها — تُحفَظ في العقدة كي يُعاد الحساب بها. */
  readonly epsilon: number
  /** هل اقتُطع المسار بعد استنفاد التصعيد؟ يُبلَّغ ولا يُخفى. */
  readonly truncated: boolean
}

/**
 * يحوّل مسارًا خامًا إلى ما يُحفَظ في العقدة.
 *
 * **التصعيد يقيس الناتج النهائي لا المدخل** — للسبب المشروح في ترويسة الملفّ.
 * والمضاعفة كل دورة تجعل عدد الدورات لوغاريتميًّا: من ١٫٢ إلى ٦٤ ستّ دورات
 * على الأكثر، ولا حلقة مفتوحة على مسار مرضيّ.
 */
export function finalizeStroke(
  raw: readonly number[],
  closed: boolean,
  startEpsilon = RDP_EPSILON_PX,
): SmoothResult {
  if (pointCount(raw) < 3) {
    return { points: raw, epsilon: startEpsilon, truncated: false }
  }

  let epsilon = startEpsilon
  let best = smooth(simplify(raw, epsilon), closed)

  while (pointCount(best) > MAX_FREEHAND_POINTS && epsilon < MAX_EPSILON_PX) {
    epsilon = Math.min(epsilon * 2, MAX_EPSILON_PX)
    best = smooth(simplify(raw, epsilon), closed)
  }

  if (pointCount(best) > MAX_FREEHAND_POINTS) {
    // لم يُفلح التصعيد: مسارٌ مرضيّ (ضجيج جهاز مثلًا). يُقتطع ويُعلَن.
    return { points: best.slice(0, MAX_FREEHAND_POINTS * 2), epsilon, truncated: true }
  }

  return { points: best, epsilon, truncated: false }
}
