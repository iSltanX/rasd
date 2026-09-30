/**
 * تدقيق تباين الصفحة — الحساب الخالص: ما تحت النصّ حتى السطح، وحكم كل نتيجة، وترتيبها، والتقرير (ADR 0035).
 *
 * **ما تحت محتوى العنصر دالّةٌ خطّية على لونه المضروب بألفاه.** كل عنصر في الطريق يضيف خطوتين: خلفيته
 * تُرسم تحت محتواه (`source-over`)، ثمّ `opacity` تخفت **المجموعة كلّها** — النصّ وخلفيته معًا — قبل أن
 * تُركَّب فوق ما وراءها. والخطوتان معًا دالّة من الشكل:
 *
 * ```text
 * c ↦ s·c + p·α + q        α ↦ t·α + w
 * ```
 *
 * وتركيب دالّتين من هذا الشكل دالّةٌ من الشكل نفسه (`within`). فخلفية العنصر تُحسب مرّة من خلفية أبيه، ولا
 * يُعاد صعود الشجرة لكل نصّ: خمسة آلاف نصّ في صفحة عمقها أربعون تكلّف خمسة آلاف خطوة لا مئتي ألف.
 *
 * **ولماذا لا `flatten` من `composite.ts`:** تلك تركّب ألوانًا فوق ألوان ولا تعرف `opacity`، وعنصرٌ نصف
 * شفّاف يحمل خلفية معتمة يُظهر ما وراءه — فيقف الصعود عند «أوّل معتم» وهو ليس معتمًا. والجوابان يتطابقان
 * حين لا `opacity` في الطريق، وهذا مثبت باختبار.
 *
 * `modules/` منطق خالص: أرقام تدخل وأرقام تخرج.
 */

import { WCAG_THRESHOLDS } from './contrast'

import type { Layer } from './composite'
import type { Rgb255 } from './formats'

type Triple = readonly [number, number, number]

/** ما تحت محتوى عنصرٍ حتى سطح المتصفّح — الدالّة في رأس الملفّ. */
export interface Backdrop {
  readonly s: number
  readonly p: Triple
  readonly q: Triple
  readonly t: number
  readonly w: number
}

const clamp01 = (n: number): number => (n > 0 ? (n < 1 ? n : 1) : 0)

/**
 * سطح المتصفّح الأبيض تحت كل شيء: `c + 255·(1 − α)` بألفا ناتجٍ واحد.
 *
 * وهو ما يفعله المتصفّح ونصّ WCAG معًا («If no background color is specified, then white is assumed»).
 */
export const CANVAS: Backdrop = { s: 1, p: [-255, -255, -255], q: [255, 255, 255], t: 0, w: 1 }

/** خطوة عنصر واحد: خلفيته (`null` حين لا تُرسم) تحت محتواه، ثمّ شفافيته على المجموعة. */
export function layerStep(bg: Layer | null, opacity: number): Backdrop {
  const o = clamp01(opacity)
  const a = bg ? clamp01(bg.alpha) : 0
  const c: Triple = bg ? [bg.rgb.r * a, bg.rgb.g * a, bg.rgb.b * a] : [0, 0, 0]
  return {
    s: o,
    p: [-o * c[0], -o * c[1], -o * c[2]],
    q: [o * c[0], o * c[1], o * c[2]],
    t: o * (1 - a),
    w: o * a,
  }
}

/** `outer ∘ inner` — `inner` أقرب إلى النصّ، و`outer` ما وراءه. */
export function within(outer: Backdrop, inner: Backdrop): Backdrop {
  const at = (i: 0 | 1 | 2): [number, number] => [
    outer.s * inner.p[i] + outer.p[i] * inner.t,
    outer.s * inner.q[i] + outer.p[i] * inner.w + outer.q[i],
  ]
  const [p0, q0] = at(0)
  const [p1, q1] = at(1)
  const [p2, q2] = at(2)
  return {
    s: outer.s * inner.s,
    p: [p0, p1, p2],
    q: [q0, q1, q2],
    t: outer.t * inner.t,
    w: outer.t * inner.w + outer.w,
  }
}

/**
 * اللون المرسوم فعلًا: `paint` فوق المحتوى (لون النصّ)، أو `null` للخلفية وحدها.
 *
 * بايتات مقرَّبة كما يرسمها المتصفّح — والتباين يُحسب عليها لا على كسورٍ لا يراها أحد.
 */
export function paintOver(b: Backdrop, paint: Layer | null): Rgb255 {
  const a = paint ? clamp01(paint.alpha) : 0
  const alpha = b.t * a + b.w
  const ch = (i: 0 | 1 | 2, v: number): number => {
    const premul = b.s * v * a + b.p[i] * a + b.q[i]
    const straight = alpha > 0 ? premul / alpha : 0
    return Math.round(Math.min(255, Math.max(0, straight)))
  }
  return {
    r: ch(0, paint?.rgb.r ?? 0),
    g: ch(1, paint?.rgb.g ?? 0),
    b: ch(2, paint?.rgb.b ?? 0),
  }
}

// ─────────────────────────────────────────────────────────────────
// الحكم
// ─────────────────────────────────────────────────────────────────

/**
 * النصّ الكبير في WCAG: 18pt فأكثر، أو 14pt عريضًا (700 فأكثر). والنقطة ¾ البكسل.
 *
 * السماح 0.01pt لأن `14pt` تُحسب `18.6667px` فترجع `13.99999…pt` — نصٌّ كتبه مؤلّفه 14pt لا يُحرَم من حدّه.
 */
export function isLargeText(fontPx: number, weight: number): boolean {
  const pt = fontPx * 0.75 + 0.01
  return pt >= 18 || (pt >= 14 && weight >= 700)
}

/** الشرائح الثلاث في `STAGES/14`: دون 3:1 · دون 4.5:1 · سليم. */
export type AuditBand = 'below-3' | 'below-4.5' | 'pass'

/**
 * الحكم على النسبة **غير المقرَّبة** — `contrast.ts` يشرح لماذا.
 *
 * دون 3:1 يسقط كل نصّ كبيرًا كان أو عاديًّا. وبين 3 و4.5 يسقط العادي وحده: الكبير حدّه 3:1 فهو سليم.
 */
export function bandOf(ratio: number, large: boolean): AuditBand {
  if (ratio < WCAG_THRESHOLDS['large-text'].aa) return 'below-3'
  if (!large && ratio < WCAG_THRESHOLDS['normal-text'].aa) return 'below-4.5'
  return 'pass'
}

/** لماذا لا رقم — يُعرض سببًا ولا يُختلق رقم. */
export type UnknownReason = 'image' | 'gradient' | 'overlap' | 'unreadable'

/** شرائح القائمة بترتيب خطورتها — «تعذّر الحساب» آخرًا: لا يُعرف أنه يسقط. */
export type AuditSeverity = 'below-3' | 'below-4.5' | 'unknown'

export const SEVERITIES: readonly AuditSeverity[] = ['below-3', 'below-4.5', 'unknown']

export interface Rated {
  readonly severity: AuditSeverity
  /** `null` في «تعذّر الحساب». */
  readonly ratio: number | null
  /** ترتيب المستند — يفكّ التعادل فتبقى القائمة ثابتة بين جولتين. */
  readonly order: number
}

/** الأخطر أوّلًا، ثمّ الأضعف نسبةً، ثمّ ترتيب المستند. */
export function bySeverity(a: Rated, b: Rated): number {
  return (
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    (a.ratio ?? 0) - (b.ratio ?? 0) ||
    a.order - b.order
  )
}

/**
 * `2.94` لا `2.95`: النسبة تُقصّ ولا تُقرَّب في العرض، فنصٌّ عند `4.496` يُقرأ `4.49` دون حدّه، لا `4.50`
 * فوقه وهو يسقط.
 */
export function floorRatio(ratio: number): string {
  // `4.35 × 100` تعطي `434.99999…` في الحساب العشري — الهامش يعيدها 435 قبل القصّ.
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2)
}
