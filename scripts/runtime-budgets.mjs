/**
 * ميزانيات وقت التشغيل — جدولها ودوالّ الحكم الخالصة. يستوردها الحرّاس الأربعة
 * (`verify-inspect` · `verify-overlay` · `verify-fullpage` · `verify-library`) ويختبرها
 * `tests/unit/runtime-budgets.test.ts`. القرار ومعنى كل رقم في
 * [ADR 0038](../Docs/ADR/0038-runtime-budgets.md).
 *
 * **لماذا وحدة لا أرقام في الحرّاس:** الرقم المكتوب في حارس بصيغة `elapsed <= 25000` لا يراه إلا من
 * قرأ الحارس، وتعديله لإخضار نتيجة لا يظهر في أي فرق ذي معنى. هنا الجدول واحد، وكل صفٍّ فيه يسمّي
 * الأمر الذي يطبع قيمته ويقارنها، ويحرس الاتّساقَ اختبارٌ: صفٌّ بلا أمر، أو حارسٌ لا يستورد الحكم،
 * أو رقمٌ يخالف مصدره الأصلي يُسقط الاختبار.
 *
 * **الحكم لا يقبل ما لم يُقَس.** قيمة غير منتهية (`NaN` · `undefined` · `Infinity`) تسقط ولا تمرّ:
 * قياسٌ فشل صامتًا كان سيقرأ «ضمن الميزانية» لأن `NaN <= 150` خطأ لكن `!(NaN > 150)` صواب، وهذا
 * بالضبط ما يُبقي الميزانية وعدًا في وثيقة (الصفّ 152).
 */

/** رقم كل ميزانية كما اعتُمد في الجدول الأصلي للمرحلة 24 السابقة (`Rasd_Plan.md` عند `63a0966`). */
export const BUDGETS = Object.freeze({
  /** دخول وضع الفحص: من وصول الأمر إلى أول إطار مرسوم، ms. */
  inspectEntryMs: 150,
  /** CPU الخيط الرئيسي للصفحة والطبقة خاملة، نسبة مئوية من الزمن الجداري. */
  idleCpuPercent: 1,
  /** إطارات في الثانية والمؤشِّر يمرّ فوق صفحة 5000 عقدة. */
  minFps: 55,
  /** التقاط صفحة عشرين شاشة، ثوانٍ. */
  fullPageSeconds: 25,
  /** البحث في 5000 عنصر: من الإدخال إلى النتيجة على الشاشة، ms. */
  searchMs: 150,
})

/**
 * أقل عدد إطارات يُقبل حكمًا على الإطارات في الثانية. نافذة القياس 1.5s؛ وعند 55fps يقع فيها 82
 * إطارًا، فالثلاثون حدٌّ أدنى يعني أن الصفحة عرضت نصف الإيقاع على الأقل — ما دونه تجمّد لا بطء،
 * ووسيطٌ من بضعة إطارات لا يقول شيئًا عن الإيقاع.
 */
export const MIN_FRAMES = 30

/**
 * الجدول: تسعة صفوف كما في المرحلة الأصلية. `command` هو `pnpm run <command>` الذي يطبع القيمة
 * ويقارنها؛ و`null` لصفٍّ لا يملكه أمر بعد فله `pending` يسمّي المرحلة التي تبنيه.
 *
 * - `op`: `<=` سقف · `>=` أرضية.
 * - `source`: أين يعيش الرقم إن لم يكن هنا (يحرس الاختبار تطابقه).
 */
export const ROWS = Object.freeze([
  {
    id: 'bundle-content',
    label: 'حزمة content script (مضغوطة)',
    op: '<=',
    budget: 120_000,
    unit: 'B',
    command: 'verify:dist',
    guard: 'dist',
    source: 'scripts/bundle-budget.mjs',
  },
  {
    id: 'bundle-popup',
    label: 'حزمة النافذة (مضغوطة)',
    op: '<=',
    budget: 80_000,
    unit: 'B',
    command: 'verify:dist',
    guard: 'dist',
    source: 'scripts/bundle-budget.mjs',
  },
  {
    id: 'popup-open',
    label: 'زمن فتح النافذة',
    op: '<=',
    budget: 100,
    unit: 'ms',
    command: 'verify:popup',
    guard: 'popup',
    source: 'scripts/verify-popup.mjs',
  },
  {
    id: 'inspect-entry',
    label: 'زمن دخول وضع الفحص',
    op: '<=',
    budget: BUDGETS.inspectEntryMs,
    unit: 'ms',
    command: 'verify:inspect',
    guard: 'inspect',
    source: null,
  },
  {
    id: 'idle-cpu',
    label: 'CPU للـoverlay الخامل',
    op: '<=',
    budget: BUDGETS.idleCpuPercent,
    unit: '%',
    command: 'verify:overlay',
    guard: 'overlay',
    source: null,
  },
  {
    id: 'fps-5000',
    label: 'إطارات في الثانية أثناء المرور على 5000 عقدة',
    op: '>=',
    budget: BUDGETS.minFps,
    unit: 'fps',
    command: 'verify:overlay',
    guard: 'overlay',
    source: null,
  },
  {
    id: 'fullpage-20',
    label: 'التقاط صفحة 20 شاشة',
    op: '<=',
    budget: BUDGETS.fullPageSeconds,
    unit: 's',
    command: 'verify:fullpage',
    guard: 'fullpage',
    source: null,
  },
  {
    id: 'memory-peak',
    label: 'ذروة الذاكرة أثناء الالتقاط الكامل',
    op: '<=',
    budget: 400,
    unit: 'MB',
    command: null,
    pending: 'STAGES/21',
    source: null,
  },
  {
    id: 'search-5000',
    label: 'البحث في 5000 عنصر',
    op: '<=',
    budget: BUDGETS.searchMs,
    unit: 'ms',
    command: 'verify:library',
    guard: 'library',
    source: null,
  },
])

export const rowOf = (id) => {
  const row = ROWS.find((r) => r.id === id)
  if (!row) throw new Error(`صفّ ميزانية غير معروف: ${id}`)
  return row
}

// منزلتان للقيم الصغيرة: CPU خامل 0.04% لا «0.0%».
const fmt = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 2 : 1)

/**
 * يحكم على قيمة مقيسة بصفٍّ من الجدول. `{ pass, text }`: النص سطر التقرير كما يطبعه الحارس،
 * بالقيمة والحدّ والوحدة، فيقرأ من يفتح مخرجات الحارس المقارنة كاملة لا «أخضر» وحدها.
 */
export function judge(id, value) {
  const row = rowOf(id)
  const sign = row.op === '<=' ? '≤' : '≥'
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      pass: false,
      text: `${row.label}: لم يُقَس (${String(value)}) — الحدّ ${sign} ${row.budget}${row.unit}`,
    }
  }
  const pass = row.op === '<=' ? value <= row.budget : value >= row.budget
  return { pass, text: `${row.label}: ${fmt(value)}${row.unit} ${sign} ${row.budget}${row.unit}` }
}

/** الوسيط. فارغ ⇒ `NaN` فيسقط الحكم. */
export function median(values) {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** المئين `p` ∈ [0,1] بأقرب رتبة. فارغ ⇒ `NaN`. */
export function percentile(values, p) {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/** دورة الشاشة المرجعية: 60Hz. لا إطار يُعرض أسرع منها، فلا يُحسب أسرع منها. */
export const REFRESH_MS = 1000 / 60

/**
 * الإطارات في الثانية من فواصل `requestAnimationFrame` بالملّي ثانية: عدد الإطارات على الزمن
 * الذي استغرقته **بعد رفع كل فاصل إلى دورة الشاشة** — `1000 × n / Σ max(فاصل, 16.67)`.
 *
 * **لماذا لا الوسيط ولا العدّ الخام — قِيسا فخدعا.** صفحة معالج مؤشِّرها يحجز الخيط 30ms أعطت 55
 * إطارًا في 1.5s بوسيط فواصل 7.9ms، أي «126fps»؛ وأخرى 87 إطارًا في 1.49s أي «58fps» وفيها
 * إطاران طويلان: بعد كل توقّف يتلاحق إطاران أو أكثر بلا انتظار الشاشة (المتصفّح بلا شاشة يستدرك ما
 * فاته)، فتكثر الفواصل القصيرة وتشتري وقتًا لا تشتريه شاشة حقيقية. والشاشة لا تعرض أكثر من 60
 * إطارًا في الثانية، فالفاصل الأقصر من دورتها يُحسب دورةً كاملة، ولا يُعوَّض الإطار الطويل بإطارٍ
 * سبقه أوانه. والوسيط و`p95Ms` يُطبعان تشخيصًا لا حكمًا. وأقلّ من `MIN_FRAMES` إطارًا ⇒ `fps` هو
 * `NaN` فيسقط الحكم بدل أن يمرّ على عيّنة لا تكفي.
 */
export function framesToFps(intervals) {
  const frames = intervals.length
  const totalMs = intervals.reduce((sum, v) => sum + v, 0)
  const displayMs = intervals.reduce((sum, v) => sum + Math.max(v, REFRESH_MS), 0)
  const fps = frames >= MIN_FRAMES && displayMs > 0 ? (1000 * frames) / displayMs : Number.NaN
  return { frames, totalMs, medianMs: median(intervals), p95Ms: percentile(intervals, 0.95), fps }
}

/** `Performance.getMetrics` (مصفوفة `{ name, value }`) إلى خريطة. */
export const metricsMap = (metrics) => Object.fromEntries(metrics.map((m) => [m.name, m.value]))

/**
 * CPU الخيط الرئيسي كنسبة من الزمن الجداري بين قراءتين لـ`Performance.getMetrics`:
 * `TaskDuration` ثوانٍ من العمل، و`Timestamp` ساعة رتيبة بالثواني. قراءتان بلا مرور زمن ⇒ `NaN`.
 */
export function cpuPercent(before, after) {
  const a = metricsMap(before)
  const b = metricsMap(after)
  const wall = b.Timestamp - a.Timestamp
  const busy = b.TaskDuration - a.TaskDuration
  if (!(wall > 0) || !Number.isFinite(busy) || busy < 0) return Number.NaN
  return (busy / wall) * 100
}
