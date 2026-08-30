/**
 * فحص التباين — `WCAG 2.2` و`APCA` معًا، وكلٌّ بحدوده المعلَنة.
 *
 * **الفرق بينهما ليس دقّة بل طبيعة**: WCAG معيار W3C مستقرّ يُرجع نسبةً
 * موجبة في `[1, 21]` ولا يفرّق بين «داكن على فاتح» و«فاتح على داكن».
 * وAPCA نموذج إدراكي يُبقي القطبية فيُرجع قيمةً **موقَّعة**، لأن العين لا
 * تدرك الاتجاهين بالتساوي على شاشة ذاتية الإضاءة.
 *
 * **وAPCA ليست معيارًا — وهذا يُعلَن لا يُخفى.** أحدث إصدار `0.1.9 beta`
 * (تمّوز 2022)، والخوارزمية الأساس `0.0.98G-4g`. ذُكرت في أوّل مسوّدة
 * لـWCAG 3 (2021) ثم **حُذفت** من مسوّداتها اللاحقة كلّها — بما فيها
 * مسوّدة 2026-03-03. ورخصتها تشترط مطابقة الثوابت حرفيًّا لاستعمال الاسم،
 * ولذلك تُكتب هنا بدقّتها الكاملة ولا تُقرَّب.
 *
 * فالحكم المعياري (`AA`/`AAA`) يخرج من WCAG **وحده**؛ وLc يُعرض رقمًا
 * إرشاديًّا موسومًا. الخلط بينهما يعطي المستخدم ثقةً زائفة في رقم لا يسنده
 * معيار.
 *
 * `modules/` منطق خالص: أرقام تدخل وأرقام تخرج.
 */

import type { Rgb255 } from './formats'

// ─────────────────────────────────────────────────────────────────
// WCAG 2.2
// ─────────────────────────────────────────────────────────────────

/**
 * عتبة الفرع الخطّي في تخطيّة sRGB.
 *
 * **`0.04045` لا `0.03928`.** الثانية من نسخة قديمة من المواصفة، وWCAG 2.1
 * و2.2 تستعملان الأولى وتذكران التغيير في حاشية صريحة. الفرق على مدخلات
 * 8-بت **صفرٌ بالضبط** (نقطتا القطع 10.02 و10.31 تقعان بين البايتين 10
 * و11)، لكنه غير صفري على المدخلات الكسرية التي قد تأتي من قصّ مدى — فلا
 * عذر لاستعمال المهجورة.
 */
const SRGB_LINEAR_THRESHOLD = 0.04045

/** معاملات الإضاءة النسبية — تجمع إلى `1.0` بالضبط، فالأبيض يعطي `1.0`. */
const WCAG_R = 0.2126
const WCAG_G = 0.7152
const WCAG_B = 0.0722

function linearize(channel255: number): number {
  const c = channel255 / 255
  return c <= SRGB_LINEAR_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** الإضاءة النسبية `Y` في `[0, 1]` — `0` للأسود و`1` للأبيض بالضبط. */
export function relativeLuminance(rgb: Rgb255): number {
  return WCAG_R * linearize(rgb.r) + WCAG_G * linearize(rgb.g) + WCAG_B * linearize(rgb.b)
}

/**
 * نسبة التباين في `[1, 21]`.
 *
 * **بلا تقريب.** التقريب قبل المقارنة يُنتج نجاحًا كاذبًا: `#000000` على
 * `#595959` يعطي `2.99797…` فيُعرض `3.0` بينما هو **يفشل** عتبة `3:1`.
 * التقريب للعرض وحده — انظر `formatRatio`.
 */
export function contrastRatio(a: Rgb255, b: Rgb255): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * صنف المحتوى المقيس — يحدّد العتبة، ومصدره معيار مختلف لكلٍّ.
 *
 * `non-text` من `1.4.11` وهو **مستوى AA فقط**: لا عتبة AAA لعناصر الواجهة
 * في WCAG 2.2، فلا تُخترَع.
 */
export type ContrastTarget = 'normal-text' | 'large-text' | 'non-text'

export type WcagLevel = 'AAA' | 'AA' | 'fail'

/** عتبات كل صنف — `null` يعني «لا عتبة لهذا المستوى في المعيار». */
export const WCAG_THRESHOLDS: Record<ContrastTarget, { aa: number; aaa: number | null }> = {
  /** `1.4.3` AA · `1.4.6` AAA */
  'normal-text': { aa: 4.5, aaa: 7 },
  /** استثناء النصّ الكبير في المعيارين نفسيهما. */
  'large-text': { aa: 3, aaa: 4.5 },
  /** `1.4.11` — AA وحده. */
  'non-text': { aa: 3, aaa: null },
}

export interface WcagVerdict {
  readonly ratio: number
  readonly level: WcagLevel
  readonly target: ContrastTarget
  /** العتبة التي قيست عليها النتيجة — تُعرض مع الحكم لا تُخفى. */
  readonly threshold: number
}

/** الحكم المعياري. المقارنة على القيمة **غير المقرَّبة**. */
export function wcagVerdict(
  text: Rgb255,
  background: Rgb255,
  target: ContrastTarget = 'normal-text',
): WcagVerdict {
  const ratio = contrastRatio(text, background)
  const { aa, aaa } = WCAG_THRESHOLDS[target]
  const level: WcagLevel = aaa !== null && ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'fail'
  return { ratio, level, target, threshold: level === 'AAA' && aaa !== null ? aaa : aa }
}

/** `4.54 : 1` — أرقام غربية، للعرض وحده لا للمقارنة. */
export function formatRatio(ratio: number): string {
  return `${(Math.round(ratio * 100) / 100).toFixed(2)} : 1`
}

// ─────────────────────────────────────────────────────────────────
// APCA — الخوارزمية الأساس 0.0.98G-4g (apca-w3 0.1.9 beta)
// ─────────────────────────────────────────────────────────────────

/*
 * الثوابت حرفيًّا من `SA98G` في التنفيذ المرجعي.
 *
 * تُكتب هنا ولا تُستورَد من حزمة: رخصة APCA تشترط مطابقة الثوابت لاستعمال
 * الاسم، والحزمة نفسها غير مُصانة منذ 2022 — فالتثبيت في شيفرتنا أصدق من
 * اعتماد على إصدار قد ينزاح.
 */
const APCA = {
  /** أسّ الشاشة — **ليس** تخطيّة sRGB القطعية: لا فرع خطّي ولا 0.055. */
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  /** أسّا القطبية العادية (نصّ داكن على فاتح). */
  normBG: 0.56,
  normTXT: 0.57,
  /** أسّا القطبية المعكوسة (نصّ فاتح على داكن). */
  revTXT: 0.62,
  revBG: 0.65,
  /** عتبة القصّ اللَيِّن للأسود وأسّه. */
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const

/**
 * `Y` بمعنى APCA — يخالف `relativeLuminance` أعلاه ولا يُخلَط به.
 *
 * **الأبيض يعطي `1.0000001` لا `1.0`**: المعاملات الثلاثة تجمع إلى
 * `1.0000001` في التنفيذ المرجعي. القصّ عند `1.0` «تصحيحًا» يكسر
 * الخوارزمية — ولهذا فحص المدى أدناه يقبل حتى `1.1`.
 */
export function apcaLuminance(rgb: Rgb255): number {
  return (
    APCA.sRco * (rgb.r / 255) ** APCA.mainTRC +
    APCA.sGco * (rgb.g / 255) ** APCA.mainTRC +
    APCA.sBco * (rgb.b / 255) ** APCA.mainTRC
  )
}

/** القصّ اللَيِّن للألوان الداكنة — يُطبَّق على كل لون على حدة. */
function softClamp(y: number): number {
  return y > APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp
}

/**
 * تباين APCA بالوحدة `Lc` — **موقَّع، والترتيب مهمّ**.
 *
 * موجب = نصّ داكن على خلفية فاتحة · سالب = العكس. تبديل الوسيطين ليس
 * تماثلًا: الأسّان يختلفان بين النصّ والخلفية وبين القطبيّتين، فالمقدار
 * نفسه يتغيّر لا إشارته وحدها.
 *
 * يُرجع `0` في ثلاث حالات مقصودة: خارج المدى، وفرق إضاءة دون
 * `deltaYmin`، وتباين دون `loClip` (وهذا الأخير **انقطاع لا تدرّج**:
 * بايت واحد يقفز بالنتيجة من `0` إلى `7.7`).
 */
export function apcaLc(text: Rgb255, background: Rgb255): number {
  let txtY = apcaLuminance(text)
  let bgY = apcaLuminance(background)

  // المدى يقبل حتى 1.1 لأن الأبيض نفسه يتجاوز 1.0 — انظر `apcaLuminance`.
  if (txtY < 0 || txtY > 1.1 || bgY < 0 || bgY > 1.1) return 0

  txtY = softClamp(txtY)
  bgY = softClamp(bgY)

  if (Math.abs(bgY - txtY) < APCA.deltaYmin) return 0

  let sapc: number
  let out: number

  if (bgY > txtY) {
    sapc = (bgY ** APCA.normBG - txtY ** APCA.normTXT) * APCA.scaleBoW
    out = sapc < APCA.loClip ? 0 : sapc - APCA.loBoWoffset
  } else {
    sapc = (bgY ** APCA.revBG - txtY ** APCA.revTXT) * APCA.scaleWoB
    out = sapc > -APCA.loClip ? 0 : sapc + APCA.loWoBoffset
  }

  return out * 100
}

/** `Lc 63.1` — أرقام غربية، وبخانة واحدة: أكثر منها دقّةٌ لا يسندها نموذج بيتا. */
export function formatLc(lc: number): string {
  return `Lc ${(Math.round(lc * 10) / 10).toFixed(1)}`
}

// ─────────────────────────────────────────────────────────────────
// الفحص المركَّب — الأزواج الثلاثة في `Rasd_Ar.md §6.13`
// ─────────────────────────────────────────────────────────────────

/** الأزواج الثلاثة التي تفرضها المواصفة، بأسمائها. */
export type ContrastPair = 'text-on-background' | 'icon-on-background' | 'border-on-surround'

/** الصنف المعياري لكل زوج — الحدود عناصر واجهة لا نصّ. */
export const PAIR_TARGET: Record<ContrastPair, ContrastTarget> = {
  'text-on-background': 'normal-text',
  'icon-on-background': 'non-text',
  'border-on-surround': 'non-text',
}

export interface ContrastCheck {
  readonly pair: ContrastPair
  readonly wcag: WcagVerdict
  /** إرشادي لا معياري — انظر رأس الملفّ. */
  readonly lc: number
  /** هل النتيجة «غير مقروءة» بحكم المواصفة؟ (`§6.13` يفرض تنبيهًا خاصًّا). */
  readonly unreadable: boolean
}

/**
 * أضعف من عتبة `1.4.11` — دون هذا لا يكاد يُرى الشكل أصلًا.
 *
 * ليست عتبة معيارية بل حدّ تنبيه: `§6.13` يفرض «التنبيه إلى الحالات غير
 * المقروءة» بوصفه شيئًا زائدًا على عرض الحكم، فيلزم حدّ أدنى دون الفشل
 * العادي يميّز «ضعيف» من «معدوم».
 */
export const UNREADABLE_RATIO = 1.5

export function checkPair(
  pair: ContrastPair,
  foreground: Rgb255,
  background: Rgb255,
): ContrastCheck {
  const wcag = wcagVerdict(foreground, background, PAIR_TARGET[pair])
  return {
    pair,
    wcag,
    lc: apcaLc(foreground, background),
    unreadable: wcag.ratio < UNREADABLE_RATIO,
  }
}
