#!/usr/bin/env node
/**
 * مزامنة المراحل — **الحالة تُكتب في موضع واحد وتُشتقّ منه**.
 *
 * المصدر الوحيد: ترويسة كل ملفّ `STAGES/NN.md` (بين سطرَي `---`)، ومعها
 * `STAGES/baseline.json` لخطّ الأساس المنجز قبل المرحلة 1.
 * المشتقّان: `STATUS.md` كاملًا، وجدول المراحل داخل `ROADMAP.md` بين العلامتين
 * `<!-- stages:begin -->` و`<!-- stages:end -->`. لا يُحرَّر أيٌّ منهما بيد.
 *
 *   pnpm stages:sync     يكتب المشتقَّين
 *   pnpm stages:check    يفشل إن اختلفا عن المصدر، أو إن خالف المصدر قواعده
 *
 * القواعد المفروضة (كلّها ثنائية بلا حكم):
 *   · اسم الملفّ يطابق `id`، والأرقام متتابعة من 1 بلا فجوة.
 *   · كل اعتمادية تشير إلى مرحلة موجودة، ولا دور في الاعتماديات.
 *   · أكثر من مرحلة `active` جائزٌ بشرط واحد: أن تحمل كلّها `wave` واحدة (ADR 0026) — وإلا
 *     فواحدة على الأكثر، كما كانت.
 *   · `active` و`done` تشترطان أن تكون كل الاعتماديات `done`.
 *   · `done` تشترط `delivery: merged` و`commit` مكتوبًا — لا «مكتملة» بلا التزام مدموج.
 *   · `resume` مكتوب لكل مرحلة ليست `done`.
 *   · `after` اختياري **للترتيب وحده** (ADR 0025): يضع المرحلة في ترتيب التنفيذ والعرض بعد المرحلة
 *     المسمّاة مباشرةً، ولا يُقرأ في شرط `active` ولا `done` — الاعتماد في `depends` وحده. لا يشير
 *     إلى غائب ولا إلى نفسه ولا يدور، والترتيب الناتج يحترم `depends`: لا اعتمادية بعد معتمِدها.
 *
 *   · `wave` اختياري **للتجميع التنفيذي وحده** (ADR 0026): رقم موجة التوازي في `Docs/Waves.md`.
 *     لا يمنع ولا يُجيز — الاعتماد في `depends` وحده. وقواعده: كل مرحلة ليست `done` تحمله؛
 *     وكل اعتمادية لمرحلةٍ في موجة إمّا `done` وإمّا في موجة أسبق — لا اعتمادية داخل الموجة؛
 *     وأرقام الموجات متتابعة من 1 بلا فجوة.
 *
 * الجدولان و«المرحلة التالية» بترتيب التنفيذ: ترتيب الرقم، إلا ما وضعه `after` بعد غيره. والتالية
 * أوّل مرحلة لم تبدأ في ذلك الترتيب اكتملت **اعتمادياتها** — الترتيب يختار، والاعتماد يُجيز.
 *
 * المسارات تُستبدَل بمتغيّرَي بيئة للاختبار: RASD_STAGES_DIR و RASD_STAGES_OUT.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const STAGES_DIR = process.env.RASD_STAGES_DIR ?? join(root, 'STAGES')
const OUT_DIR = process.env.RASD_STAGES_OUT ?? root
const STATUS = join(OUT_DIR, 'STATUS.md')
const ROADMAP = join(OUT_DIR, 'ROADMAP.md')
const BEGIN = '<!-- stages:begin -->'
const END = '<!-- stages:end -->'

const STATUSES = {
  pending: 'لم تبدأ',
  active: 'نشطة',
  paused: 'متوقّفة قبل الاكتمال',
  done: 'مكتملة',
}
const DELIVERIES = {
  none: '—',
  local: 'منفَّذة محليًّا',
  branch: 'منشورة على فرع',
  merged: 'مدمجة في main',
}

const errors = []
const fail = (message) => errors.push(message)

/** يقرأ ترويسة `key: value` بسيطة — لا YAML كاملًا، عمدًا: صيغة واحدة لا تحتمل قراءتين. */
function parseHeader(file, text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text)
  if (!match) {
    fail(`${file}: بلا ترويسة بين سطرَي ---`)
    return null
  }
  const header = {}
  for (const line of match[1].split('\n')) {
    const pair = /^([a-z]+):\s*(.*)$/u.exec(line)
    if (!pair) {
      fail(`${file}: سطر ترويسة غير مفهوم: «${line}»`)
      continue
    }
    header[pair[1]] = pair[2].trim()
  }
  return header
}

function parseDepends(file, raw) {
  const inner = /^\[(.*)\]$/u.exec(raw ?? '')
  if (!inner) {
    fail(`${file}: depends يجب أن تكون قائمة مثل [1, 2] أو []`)
    return []
  }
  if (inner[1].trim() === '') return []
  return inner[1].split(',').map((part) => {
    const id = Number(part.trim())
    if (!Number.isInteger(id)) fail(`${file}: اعتمادية غير رقمية «${part.trim()}»`)
    return id
  })
}

/** `wave` اختياري — غيابه `null`، وحضوره رقم موجة موجب (ADR 0026). */
function parseWave(file, raw) {
  if (raw === undefined) return null
  const wave = Number(raw)
  if (!Number.isInteger(wave) || wave < 1) {
    fail(`${file}: wave يجب أن يكون رقم موجة موجبًا لا «${raw}»`)
    return null
  }
  return wave
}

/** `after` اختياري — غيابه `null`، وحضوره رقم مرحلة. */
function parseAfter(file, raw) {
  if (raw === undefined) return null
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    fail(`${file}: after يجب أن يكون رقم مرحلة لا «${raw}»`)
    return null
  }
  return id
}

function readStages() {
  if (!existsSync(STAGES_DIR)) {
    fail('مجلّد STAGES غير موجود.')
    return []
  }
  const files = readdirSync(STAGES_DIR)
    .filter((name) => /^\d{2}\.md$/u.test(name))
    .sort()
  const stages = []
  for (const name of files) {
    const header = parseHeader(name, readFileSync(join(STAGES_DIR, name), 'utf8'))
    if (!header) continue
    for (const key of [
      'id',
      'title',
      'status',
      'delivery',
      'depends',
      'commit',
      'updated',
      'resume',
    ]) {
      if (!(key in header)) fail(`${name}: الحقل ${key} غائب`)
    }
    const stage = {
      file: name,
      id: Number(header.id),
      title: header.title ?? '',
      status: header.status ?? '',
      delivery: header.delivery ?? '',
      depends: parseDepends(name, header.depends),
      commit: header.commit ?? '',
      updated: header.updated ?? '',
      resume: header.resume ?? '',
      after: parseAfter(name, header.after),
      wave: parseWave(name, header.wave),
    }
    if (String(stage.id).padStart(2, '0') !== name.slice(0, 2)) {
      fail(`${name}: id (${header.id}) لا يطابق اسم الملفّ`)
    }
    if (!(stage.status in STATUSES)) fail(`${name}: status غير معروفة «${stage.status}»`)
    if (!(stage.delivery in DELIVERIES)) fail(`${name}: delivery غير معروفة «${stage.delivery}»`)
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(stage.updated))
      fail(`${name}: updated ليست تاريخًا YYYY-MM-DD`)
    stages.push(stage)
  }
  return stages
}

/**
 * ترتيب التنفيذ (ADR 0025): ترتيب الرقم، إلا مرحلةً تحمل `after: N` فتوضع بعد N مباشرةً — وسلسلةٌ
 * منه جائزة. ما لا يُوضع (مرساة غائبة، أو دور) يُبلَّغ ولا يُسقَط من الجدول بصمت.
 */
function executionOrder(stages) {
  const anchored = new Map()
  for (const stage of stages) {
    if (stage.after === null) continue
    anchored.set(stage.after, [...(anchored.get(stage.after) ?? []), stage])
  }
  const ordered = []
  const place = (stage) => {
    ordered.push(stage)
    for (const next of anchored.get(stage.id) ?? []) place(next)
  }
  for (const stage of stages) if (stage.after === null) place(stage)
  for (const stage of stages) {
    if (!ordered.includes(stage)) {
      fail(`${stage.file}: after (${stage.after}) لا يضعها في ترتيب التنفيذ — مرحلة غائبة أو دور`)
      ordered.push(stage)
    }
  }
  return ordered
}

function validate(stages, ordered) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const position = new Map(ordered.map((stage, index) => [stage.id, index]))
  stages.forEach((stage, index) => {
    if (stage.id !== index + 1) fail(`${stage.file}: الترقيم غير متتابع — المتوقَّع ${index + 1}`)
  })
  const active = stages.filter((stage) => stage.status === 'active')
  const activeWaves = new Set(active.map((stage) => stage.wave))
  if (active.length > 1 && (activeWaves.size > 1 || activeWaves.has(null))) {
    fail(
      `أكثر من مرحلة حالتها active (${active.map((stage) => pad(stage.id)).join(' · ')}) وليست كلّها في موجة واحدة — المسموح واحدة، أو مراحل موجة واحدة.`,
    )
  }
  const waves = [...new Set(stages.map((stage) => stage.wave).filter((wave) => wave !== null))]
  waves.sort((a, b) => a - b)
  waves.forEach((wave, index) => {
    if (wave !== index + 1) fail(`أرقام الموجات غير متتابعة — الموجة ${index + 1} غائبة`)
  })
  for (const stage of stages) {
    for (const dep of stage.depends) {
      if (!byId.has(dep)) fail(`${stage.file}: تعتمد على مرحلة غير موجودة (${dep})`)
      if (dep === stage.id) fail(`${stage.file}: تعتمد على نفسها`)
      if (byId.has(dep) && position.get(dep) > position.get(stage.id)) {
        fail(`${stage.file}: تعتمد على ${pad(dep)} وهي بعدها في ترتيب التنفيذ`)
      }
    }
    if (stage.status !== 'done' && stage.wave === null) {
      fail(`${stage.file}: ليست done وبلا wave — كل مرحلة متبقّية في موجة (Docs/Waves.md)`)
    }
    if (stage.wave !== null) {
      for (const dep of stage.depends) {
        const other = byId.get(dep)
        if (!other || other.status === 'done') continue
        if (other.wave === null || other.wave >= stage.wave) {
          fail(
            `${stage.file}: في الموجة ${stage.wave} وتعتمد على ${pad(dep)} ${other.wave === null ? 'بلا موجة' : `في الموجة ${other.wave}`} — الاعتمادية تسبق في موجة أقدم أو تكون done`,
          )
        }
      }
    }
    if (stage.after !== null) {
      if (stage.after === stage.id) fail(`${stage.file}: after يشير إلى نفسها`)
      else if (!byId.has(stage.after))
        fail(`${stage.file}: after يشير إلى مرحلة غائبة (${stage.after})`)
    }
    const hasCommit = /^[0-9a-f]{7,40}$/u.test(stage.commit)
    if (stage.status === 'done') {
      if (stage.delivery !== 'merged') fail(`${stage.file}: done تشترط delivery: merged`)
      if (!hasCommit) fail(`${stage.file}: done تشترط commit مكتوبًا`)
    } else if (stage.resume === '' || stage.resume === '—') {
      fail(`${stage.file}: resume (نقطة الاستئناف) غائبة`)
    }
    if (stage.status === 'active' || stage.status === 'done') {
      for (const dep of stage.depends) {
        if (byId.get(dep)?.status !== 'done') {
          fail(`${stage.file}: حالتها ${stage.status} واعتماديتها ${dep} ليست done`)
        }
      }
    }
  }
  // الأدوار: بحث بالعمق مع ثلاث حالات.
  const state = new Map()
  const visit = (id, trail) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      fail(`دور في الاعتماديات: ${[...trail, id].join(' ← ')}`)
      return
    }
    state.set(id, 1)
    for (const dep of byId.get(id)?.depends ?? []) visit(dep, [...trail, id])
    state.set(id, 2)
  }
  for (const stage of stages) visit(stage.id, [])
}

const pad = (id) => String(id).padStart(2, '0')
const link = (stage, base) => `[${pad(stage.id)}](${base}STAGES/${stage.file})`

function nextStage(stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const open = (stage) => stage.depends.every((dep) => byId.get(dep)?.status === 'done')
  return (
    stages.find((stage) => stage.status === 'active') ??
    stages.find((stage) => stage.status === 'paused') ??
    stages.find((stage) => stage.status === 'pending' && open(stage)) ??
    null
  )
}

function table(stages, base) {
  const rows = stages.map((stage) => {
    const deps = stage.depends.length > 0 ? stage.depends.map(pad).join(' · ') : '—'
    const commit = /^[0-9a-f]{7,40}$/u.test(stage.commit) ? `\`${stage.commit.slice(0, 7)}\`` : '—'
    const wave = stage.wave === null ? '—' : String(stage.wave)
    return `| ${link(stage, base)} | ${stage.title} | ${deps} | ${wave} | ${STATUSES[stage.status]} | ${DELIVERIES[stage.delivery]} | ${commit} |`
  })
  return [
    '| # | المرحلة | تعتمد على | الموجة | الحالة | التسليم | الالتزام |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

/** الموجة الحالية: أدنى موجة فيها مرحلة ليست done — ووسم أساسها بالاسم، لا بالبصمة (ADR 0026). */
function currentWave(stages) {
  const open = stages.filter((stage) => stage.wave !== null && stage.status !== 'done')
  if (open.length === 0) return null
  const wave = Math.min(...open.map((stage) => stage.wave))
  return { wave, stages: stages.filter((stage) => stage.wave === wave) }
}

function renderStatus(stages, baseline) {
  const done = stages.filter((stage) => stage.status === 'done')
  const last = [...done].sort((a, b) => a.updated.localeCompare(b.updated) || a.id - b.id).at(-1)
  const next = nextStage(stages)
  const lastLine = last
    ? `المرحلة ${pad(last.id)} — ${last.title} · الالتزام \`${last.commit.slice(0, 7)}\` · ${last.updated}`
    : `خطّ الأساس — ${baseline.summary} · الالتزام \`${baseline.commit}\` · ${baseline.date}`
  const active = stages.filter((stage) => stage.status === 'active' || stage.status === 'paused')
  const current = currentWave(stages)
  const waveLine = current
    ? `${current.wave} — ${current.stages.map((stage) => `${link(stage, '')} ${STATUSES[stage.status]}`).join(' · ')} · أساسها \`wave-${pad(current.wave)}/base\` · الخطّة في [\`Docs/Waves.md\`](Docs/Waves.md)`
    : 'لا موجة مفتوحة — كل مرحلة في موجة مكتملة'
  const lines = [
    '# حالة رصد',
    '',
    '> **مشتقٌّ آليًّا — لا يُحرَّر بيد.** يكتبه `pnpm stages:sync` من ترويسات `STAGES/NN.md`،',
    '> ويحرسه `pnpm stages:check` في البوّابة المحلّية وCI. عند أي تعارض **المصدر هو الصحيح**.',
    '',
    `- **آخر إنجاز مثبت:** ${lastLine}`,
    `- **المرحلة النشطة:** ${active.length > 0 ? active.map((stage) => `${link(stage, '')} — ${stage.title} (${STATUSES[stage.status]})`).join(' · ') : 'لا مرحلة نشطة — بانتظار أمر «ابدأ مرحلة X» أو `/stage NN`'}`,
    `- **الموجة الحالية:** ${waveLine}`,
    `- **الفرع المعتمد:** \`main\` على \`origin\` (${baseline.repo}) — وفروع \`stage/NN-slug\` لمراحل الموجة المفتوحة حتى دمجها`,
    `- **المكتمل:** ${done.length} من ${stages.length} مرحلة`,
    `- **المرحلة التالية:** ${next ? `${link(next, '')} — ${next.title}` : 'لا مرحلة مفتوحة الاعتماديات'}`,
    `- **الخطوة التالية:** ${next ? next.resume : '—'}`,
    '',
    '## المراحل',
    '',
    table(stages, ''),
    '',
    '## الاستئناف من نسخة جديدة',
    '',
    '1. اقرأ [`AGENTS.md`](AGENTS.md) ثم هذا الملفّ ثم [`ROADMAP.md`](ROADMAP.md) ثم ملفّ المرحلة المطلوبة.',
    '2. `nvm use && corepack enable && pnpm install --frozen-lockfile`',
    '3. `pnpm gate:a` — يجب أن يخرج أخضر قبل أي تعديل. ومرحلة ضمن موجة لا تشغّلها في مستهلّها: دليل أساسها وسم الموجة.',
    '4. نفّذ من حقل «نقطة الاستئناف» في ملفّ المرحلة، لا من ذاكرة محادثة.',
    '',
  ]
  return lines.join('\n')
}

function renderRoadmap(stages, current) {
  const start = current.indexOf(BEGIN)
  const end = current.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    fail('ROADMAP.md: علامتا stages:begin و stages:end غائبتان أو مقلوبتان.')
    return current
  }
  return `${current.slice(0, start + BEGIN.length)}\n\n${table(stages, '')}\n\n${current.slice(end)}`
}

const check = process.argv.includes('--check')
const stages = readStages()
const ordered = executionOrder(stages)
validate(stages, ordered)

const baselinePath = join(STAGES_DIR, 'baseline.json')
let baseline = { summary: '', commit: '', date: '', repo: '' }
if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
else fail('STAGES/baseline.json غير موجود.')

const roadmapNow = existsSync(ROADMAP) ? readFileSync(ROADMAP, 'utf8') : ''
if (roadmapNow === '') fail('ROADMAP.md غير موجود.')
const statusNow = existsSync(STATUS) ? readFileSync(STATUS, 'utf8') : ''

const status = renderStatus(ordered, baseline)
const roadmap = roadmapNow === '' ? '' : renderRoadmap(ordered, roadmapNow)

console.log('\nمزامنة المراحل (STAGES ← STATUS.md · ROADMAP.md):')
console.log(
  `  قُرئ ${stages.length} مرحلة · مكتملة: ${stages.filter((s) => s.status === 'done').length}`,
)

if (errors.length === 0 && check) {
  if (status !== statusNow) fail('STATUS.md لا يطابق المصدر — شغّل pnpm stages:sync')
  if (roadmap !== roadmapNow) fail('جدول ROADMAP.md لا يطابق المصدر — شغّل pnpm stages:sync')
}

if (errors.length > 0) {
  for (const message of errors) console.error(`  ✗ ${message}`)
  console.error(`\n✗ ${errors.length} مخالفة في مصدر المراحل أو مشتقّاته.\n`)
  process.exit(1)
}

if (!check) {
  writeFileSync(STATUS, status)
  writeFileSync(ROADMAP, roadmap)
  console.log('  ✓ كُتب STATUS.md وجدول ROADMAP.md')
} else {
  console.log('  ✓ المشتقّان يطابقان المصدر، والمصدر يستوفي قواعده')
}
console.log('')
