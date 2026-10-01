/**
 * أثر الحقن على الصفحة المضيفة — دوالّ الحكم الخالصة (`STAGES/22`، ADR 0049). يستوردها
 * `scripts/verify-lighthouse.mjs` ويختبرها `tests/unit/lighthouse-impact.test.ts`.
 *
 * **لماذا وحدة لا أرقام في الحارس:** هو عين تعليل [`runtime-budgets.mjs`](./runtime-budgets.mjs) — رقمٌ
 * مكتوب في حارسٍ لا يراه إلا من قرأه، وتعديله لإخضار نتيجة لا يظهر في فرقٍ ذي معنى. وهنا عتبتان
 * وثلاث دوالّ، لكلٍّ اختبارٌ بحالةٍ موجبة وسالبة.
 *
 * **الحكم لا يقبل ما لم يُقَس.** قيمة غير منتهية، أو أقلّ من الحدّ الأدنى من العيّنات، تسقط ولا تمرّ: لايتهاوس
 * يعيد `undefined` لمقياسٍ فشل جمعه، و`NaN <= 0.05` خطأ لكن `!(NaN > 0.05)` صواب — وهذا بالضبط ما يجعل «لا
 * تدهور» ادّعاءً لا قياسًا.
 */

/** أعلى تدهور نسبي مقبول في `LCP` و`TBT` — المعيار في `STAGES/22`. */
export const MAX_DEGRADATION = 0.05

/**
 * أقلّ عدد قياسات في كل جهة يُقبل حكمًا. وسيطٌ من واحدٍ أو اثنين ضجيجُ تشغيلةٍ لا حالة؛ وقِيس أن `LCP`
 * المحاكى يتأرجح بين قيمتين يفصلهما نحو 12ms (ADR 0049) فلا يستقيم الحكم بأقلّ من ثلاثٍ.
 */
export const MIN_SAMPLES = 3

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const finite = (values) => values.length > 0 && values.every((v) => Number.isFinite(v))

// منزلتان للقيم الصغيرة: TBT 0.4ms لا «0ms».
const fmt = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 2 : 1)

const unmeasured = (label) => ({
  pass: false,
  text: `${label}: لم يُقَس — قياسٌ ناقص أو غير منتهٍ`,
})

const tooFew = (label, base, withRuns) => ({
  pass: false,
  text: `${label}: ${base.length} قياسًا بلا الطبقة و${withRuns.length} معها، والحدّ الأدنى ${MIN_SAMPLES} في كل جهة`,
})

/**
 * `CLS` المضاف = صفر. **صفرٌ لا نسبة:** القاعدة صفر عمليًّا، ونسبةٌ إلى صفر لا معنى لها. والمقارنة بأعلى
 * قياسٍ في كل جهة لا بوسيطها: انزياحٌ واحد في تشغيلةٍ واحدة معها انزياحٌ حدث، والوسيط كان سيخفيه.
 *
 * @returns {{ pass: boolean, text: string, added?: number }}
 */
export function judgeAddedCls(base, withRuns, label = 'CLS') {
  if (!finite(base) || !finite(withRuns)) return unmeasured(label)
  if (base.length < MIN_SAMPLES || withRuns.length < MIN_SAMPLES)
    return tooFew(label, base, withRuns)
  const added = Math.max(0, Math.max(...withRuns) - Math.max(...base))
  const text = `${label}: بلا ${fmt(Math.max(...base))} ← معها ${fmt(Math.max(...withRuns))} (أعلى قياس في ${withRuns.length} تشغيلات) · المضاف ${fmt(added)}`
  return { pass: added === 0, text, added }
}

/**
 * تدهورٌ نسبي بين وسيطَي القياسين ≤ `limit`. **قاعدةٌ صفرية:** حين يكون وسيط الأساس صفرًا (ويقع هذا
 * لـ`TBT` في كل عيّنة محلّية: لا مهمّة تتجاوز الخمسين ms) فالنسبة غير معرَّفة، والقراءة الحرفية للمعيار
 * أن أي زيادة تدهورٌ بلا حدّ — فيُشترط أن يبقى الوسيط صفرًا كذلك. وليست هذه عتبةً أخفّ بل الأشدّ.
 *
 * @param {number[]} base       قياسات بلا الطبقة
 * @param {number[]} withRuns   قياسات معها
 * @param {{ label: string, unit?: string, limit?: number }} o
 * @returns {{ pass: boolean, text: string, degradation?: number, baseMedian?: number, withMedian?: number }}
 */
export function judgeDegradation(base, withRuns, { label, unit = 'ms', limit = MAX_DEGRADATION }) {
  if (!finite(base) || !finite(withRuns)) return unmeasured(label)
  if (base.length < MIN_SAMPLES || withRuns.length < MIN_SAMPLES)
    return tooFew(label, base, withRuns)
  const baseMedian = median(base)
  const withMedian = median(withRuns)
  const head = `${label}: وسيط ${fmt(baseMedian)}${unit} ← ${fmt(withMedian)}${unit}`
  if (baseMedian === 0) {
    const pass = withMedian === 0
    return {
      pass,
      text: `${head} · الأساس صفر فلا نسبة، والشرط أن يبقى صفرًا${pass ? '' : ' — لم يبقَ'}`,
      baseMedian,
      withMedian,
    }
  }
  const degradation = (withMedian - baseMedian) / baseMedian
  const sign = degradation > 0 ? '+' : ''
  return {
    pass: degradation <= limit,
    text: `${head} · ${sign}${(degradation * 100).toFixed(1)}% (الحدّ ${(limit * 100).toFixed(0)}%)`,
    degradation,
    baseMedian,
    withMedian,
  }
}

/**
 * `LCP` بعد التفعيل مطابقٌ لما قبله: `LCP` مقياس تحميل، ولا تنقل طبقةٌ تُفعَّل بعد التحميل مرشَّحَه إلا إن صارت
 * هي أكبر عنصر مرسوم. فيُقارَن **آخر مرشَّح يعلنه المتصفّح** (`startTime` و`size`) قبل التفعيل وبعده — تدهورٌ
 * صفر إن تطابقا، وكل اختلافٍ تدهورٌ لا يُقاس بنسبة فيسقط.
 *
 * @param {{ startTime: number, size: number } | null} before
 * @param {{ startTime: number, size: number } | null} after
 */
export function judgeLcpUnchanged(before, after, label = 'LCP') {
  if (!before || !after) return unmeasured(label)
  const same = before.startTime === after.startTime && before.size === after.size
  const text = `${label}: آخر مرشَّح ${fmt(before.startTime)}ms/${before.size}px² قبل التفعيل ← ${fmt(after.startTime)}ms/${after.size}px² بعده`
  return { pass: same, text: same ? text : `${text} — تغيّر` }
}
