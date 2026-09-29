/* global agent, parallel, log, phase, args */
// المراجعة المستقلّة لرصد عبر Workflow — الشكل الوحيد المسموح (AGENTS.md §4 و§6).
// يُشغَّل بالاسم: Workflow({ name: 'gate-b', args: { unit, scope, lenses } })
// ولا يُشغَّل إلا مع تفعيل مفتاح Dynamic workflows في التطبيق.
// الحدود مكتوبة في الكود لا في النثر:
//   · عدسة واحدة = الشكل الافتراضي في §6: المراجع يثبت ملاحظاته بنفسه، ولا دحّاض مستقلّ.
//   · عدستان أو ثلاث = الشكل الموسَّع، بسبب مكتوب في ملفّ المرحلة قبل التشغيل: إزالة تكرار
//     بالملفّ والسطر، ثم دحّاض واحد لكل ملاحظة حرجة أو مرتفعة، تحت سقف 12 وكيلًا يُطبَع
//     ما يُسقطه بالاسم.
//   · model وeffort في كل استدعاء.
export const meta = {
  name: 'gate-b',
  description:
    'البوّابة B لرصد: عدسة واحدة افتراضًا؛ وعند التوسيع (≤ 3) إزالة تكرار ثم دحّاض واحد للحرجة والمرتفعة تحت سقف 12',
  phases: [
    {
      title: 'Review',
      detail: 'حتى ثلاث عدسات لم تكتب الكود، Sonnet 5.5، جهد medium',
      model: 'sonnet',
    },
    {
      title: 'Verify',
      detail: 'الشكل الموسَّع فقط: دحّاض واحد لكل ملاحظة حرجة أو مرتفعة',
      model: 'sonnet',
    },
  ],
}

const CAP = 12
const MAX_LENSES = 3
const MODEL = 'sonnet'
const EFFORT = 'medium'
const REPO = '/Volumes/iSltanXx/Projects/Brave/Rasd'
const SEVERITY = ['critical', 'high', 'medium', 'low']

const input = args && typeof args === 'object' ? args : {}
const unit = input.unit || 'الوحدة الجارية'
const scope =
  input.scope || 'العمل غير الملتزَم كلّه: `git --no-pager diff`، والملفّات الجديدة غير المتعقَّبة'

const requested = Array.isArray(input.lenses) ? input.lenses : []
const lenses = requested.length
  ? requested.slice(0, MAX_LENSES)
  : [
      {
        key: 'review',
        prompt:
          'راجع الفرق كاملًا بعينٍ لم تكتبه: أخطاء منطقية، حالات طرفية، أمن، سباقات، تكرار، خروج عن النطاق.',
      },
    ]
if (requested.length > MAX_LENSES) {
  log(
    `أُسقطت ${requested.length - MAX_LENSES} عدسة فوق الحدّ (${MAX_LENSES}): ${requested
      .slice(MAX_LENSES)
      .map((l) => l.key)
      .join(' · ')}`,
  )
}
// الشكل الافتراضي (عدسة واحدة) لا يُطلق دحّاضين — AGENTS.md §4؛ الموسَّع يحتاج سببًا مكتوبًا.
const expanded = lenses.length > 1

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: SEVERITY },
          file: { type: 'string' },
          line: { type: 'number', description: 'رقم السطر — إلزامي: لا ملاحظة بلا سطر مقروء' },
          failure: { type: 'string', description: 'مدخلات/حالة ملموسة ⟵ سلوك خاطئ ملموس' },
          evidence: { type: 'string' },
        },
        required: ['title', 'severity', 'file', 'line', 'failure', 'evidence'],
      },
    },
    verifiedGood: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'verifiedGood'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'true إن عجزت الملاحظة عن الصمود' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

const BASE = `أنت مراجع **خصمي** لم يكتب هذا الكود، في مستودع رصد على ${REPO}.
الوحدة: ${unit}. الفرق قيد المراجعة: ${scope}.
اقرأ الفرق كاملًا أوّلًا، وافتح الملفّات الجديدة. ممنوع تعديل أي ملفّ — مراجعة فقط؛ ويمكنك تشغيل
أوامر قراءة واختبارات (\`pnpm vitest run …\`).
**معيار الملاحظة**: عطلٌ حقيقي بسيناريو فشل ملموس (مدخلات/حالة ⟵ سلوك خاطئ)، لا ذوقٌ ولا أسلوب.
لا تُبلّغ عن شيء دون أن تفتح الملفّ وتقرأ السطر، واذكر رقم السطر. مصفوفة فارغة جوابٌ صحيح ومقبول.
${expanded ? '' : 'أنت المراجع الوحيد: أثبت كل ملاحظة بنفسك بسيناريو ملموس أو باختبار تشغّله قبل أن تُبلّغها.\n'}وأرجِع أيضًا قائمة «فُحص ووُجد سليمًا» — غياب الملاحظة معلومة لا فراغ.`

// ── Review ─────────────────────────────────────────────────────────────
phase('Review')
log(
  `${lenses.length} عدسة على ${unit} — ${expanded ? 'الشكل الموسَّع' : 'الشكل الافتراضي'}، Sonnet 5.5، جهد medium`,
)

const reviews = await parallel(
  lenses.map(
    (l) => () =>
      agent(`${BASE}\n\n**عدستك:** ${l.prompt}`, {
        label: `review:${l.key}`,
        phase: 'Review',
        model: MODEL,
        effort: EFFORT,
        schema: FINDINGS,
      }).then((r) => ({
        lens: l.key,
        findings: (r && r.findings) || [],
        verifiedGood: (r && r.verifiedGood) || [],
      })),
  ),
)

const raw = reviews.filter(Boolean).flatMap((r) => r.findings.map((f) => ({ ...f, lens: r.lens })))
const verifiedGood = reviews
  .filter(Boolean)
  .flatMap((r) => r.verifiedGood.map((g) => `[${r.lens}] ${g}`))

// ── إزالة التكرار بالملفّ والسطر — والمدمَج يحتفظ بعناوينه لا يُفقَد ────
const normFile = (f) =>
  String(f || '')
    .replace(REPO + '/', '')
    .trim()
const rank = (s) => {
  const i = SEVERITY.indexOf(s)
  return i < 0 ? SEVERITY.length : i
}
const byKey = new Map()
for (const f of raw) {
  const key = `${normFile(f.file)}:${f.line}`
  const prev = byKey.get(key)
  if (!prev) byKey.set(key, { ...f, reportedBy: [f.lens], mergedTitles: [] })
  else {
    prev.reportedBy.push(f.lens)
    if (f.title !== prev.title) prev.mergedTitles.push(`[${f.lens}] ${f.title}`)
    if (rank(f.severity) < rank(prev.severity)) prev.severity = f.severity
  }
}
const deduped = [...byKey.values()].sort((a, b) => rank(a.severity) - rank(b.severity))
log(`${raw.length} ملاحظة خام ← ${deduped.length} بعد إزالة التكرار بالملفّ والسطر`)

// ── Verify: الشكل الموسَّع فقط — دحّاض واحد للحرجة والمرتفعة، تحت السقف ──
let judged = []
let overflow = []
let toVerify = []
if (expanded) {
  phase('Verify')
  const budget = Math.max(0, CAP - lenses.length)
  const serious = deduped.filter((f) => rank(f.severity) <= 1)
  toVerify = serious.slice(0, budget)
  overflow = serious.slice(budget)
  if (overflow.length) {
    log(
      `سقف ${CAP}: أُسقط ${overflow.length} من الدحض وتُعاد إلى المراجع الرئيسي بالاسم: ${overflow
        .map((f) => f.title)
        .join(' · ')}`,
    )
  }
  judged = await parallel(
    toVerify.map(
      (f) => () =>
        agent(
          `${BASE}

**دورك: دحض.** أمامك ملاحظة من مراجعة سابقة. **افترض أنها خاطئة** وحاول إثبات ذلك بفتح الملفّ
وقراءة السطر وتشغيل ما يلزم. لا تقبلها لمجرّد أنها معقولة، ولا تدحضها بلا دليل مضادّ ملموس.

- العنوان: ${f.title}
- الخطورة المزعومة: ${f.severity}
- الموضع: ${f.file}:${f.line}
- سيناريو الفشل المزعوم: ${f.failure}
- الدليل المزعوم: ${f.evidence}
- أبلغتها العدسات: ${f.reportedBy.join(' · ')}${
            f.mergedTitles.length
              ? `\n- عناوين مدمَجة على السطر نفسه: ${f.mergedTitles.join(' | ')}`
              : ''
          }

أرجِع refuted: true إن كانت خاطئة أو غير قابلة للوقوع أو خارج نطاق الوحدة.`,
          {
            label: `verify:${f.title.slice(0, 28)}`,
            phase: 'Verify',
            model: MODEL,
            effort: EFFORT,
            schema: VERDICT,
          },
        ).then((v) => ({ ...f, verdict: v })),
    ),
  )
} else {
  log('الشكل الافتراضي: لا دحّاض مستقلّ — المراجع أثبت ملاحظاته بنفسه (AGENTS.md §4)')
}

const confirmed = judged.filter(Boolean).filter((f) => f.verdict && !f.verdict.refuted)
const refuted = judged.filter(Boolean).filter((f) => f.verdict && f.verdict.refuted)
const minor = expanded ? deduped.filter((f) => rank(f.severity) > 1) : []
const agentsUsed = lenses.length + toVerify.length
log(
  `${expanded ? `صمدت ${confirmed.length} · دُحضت ${refuted.length} · بلا دحض مستقلّ ${minor.length + overflow.length} · ` : `${deduped.length} ملاحظة مُثبَتة بالمراجع · `}الوكلاء ${agentsUsed}/${CAP}`,
)

const strip = (f) => ({
  title: f.title,
  severity: f.severity,
  file: f.file,
  line: f.line,
  failure: f.failure,
  evidence: f.evidence,
  reportedBy: f.reportedBy,
  mergedTitles: f.mergedTitles,
})

return {
  unit,
  mode: expanded ? 'expanded' : 'default',
  agentsUsed,
  cap: CAP,
  // الشكل الافتراضي: ملاحظات المراجع الواحد كما أثبتها بنفسه. الموسَّع: ما صمد أمام الدحض.
  confirmed: expanded ? confirmed.map(strip) : deduped.map(strip),
  refuted: refuted.map((f) => ({ title: f.title, reason: f.verdict.reason })),
  // الموسَّع فقط — متوسّطة ومنخفضة وما فاض عن السقف: يُثبتها المراجع الرئيسي بسيناريو ملموس (AGENTS.md §4)
  forLeadVerification: [...overflow, ...minor].map(strip),
  verifiedGood,
}
