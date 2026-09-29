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
 *   · مرحلة واحدة على الأكثر حالتها `active`.
 *   · `active` و`done` تشترطان أن تكون كل الاعتماديات `done`.
 *   · `done` تشترط `delivery: merged` و`commit` مكتوبًا — لا «مكتملة» بلا التزام مدموج.
 *   · `resume` مكتوب لكل مرحلة ليست `done`.
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

function validate(stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  stages.forEach((stage, index) => {
    if (stage.id !== index + 1) fail(`${stage.file}: الترقيم غير متتابع — المتوقَّع ${index + 1}`)
  })
  if (stages.filter((stage) => stage.status === 'active').length > 1) {
    fail('أكثر من مرحلة حالتها active — المسموح واحدة.')
  }
  for (const stage of stages) {
    for (const dep of stage.depends) {
      if (!byId.has(dep)) fail(`${stage.file}: تعتمد على مرحلة غير موجودة (${dep})`)
      if (dep === stage.id) fail(`${stage.file}: تعتمد على نفسها`)
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
    return `| ${link(stage, base)} | ${stage.title} | ${deps} | ${STATUSES[stage.status]} | ${DELIVERIES[stage.delivery]} | ${commit} |`
  })
  return [
    '| # | المرحلة | تعتمد على | الحالة | التسليم | الالتزام |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function renderStatus(stages, baseline) {
  const done = stages.filter((stage) => stage.status === 'done')
  const last = [...done].sort((a, b) => a.updated.localeCompare(b.updated) || a.id - b.id).at(-1)
  const next = nextStage(stages)
  const lastLine = last
    ? `المرحلة ${pad(last.id)} — ${last.title} · الالتزام \`${last.commit.slice(0, 7)}\` · ${last.updated}`
    : `خطّ الأساس — ${baseline.summary} · الالتزام \`${baseline.commit}\` · ${baseline.date}`
  const active = stages.find((stage) => stage.status === 'active' || stage.status === 'paused')
  const lines = [
    '# حالة رصد',
    '',
    '> **مشتقٌّ آليًّا — لا يُحرَّر بيد.** يكتبه `pnpm stages:sync` من ترويسات `STAGES/NN.md`،',
    '> ويحرسه `pnpm stages:check` في البوّابة المحلّية وCI. عند أي تعارض **المصدر هو الصحيح**.',
    '',
    `- **آخر إنجاز مثبت:** ${lastLine}`,
    `- **المرحلة النشطة:** ${active ? `${link(active, '')} — ${active.title} (${STATUSES[active.status]})` : 'لا مرحلة نشطة — بانتظار أمر «ابدأ مرحلة X»'}`,
    `- **الفرع المعتمد:** \`main\` على \`origin\` (${baseline.repo}) — لا فروع طويلة العمر`,
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
    '3. `pnpm gate:a` — يجب أن يخرج أخضر قبل أي تعديل.',
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
validate(stages)

const baselinePath = join(STAGES_DIR, 'baseline.json')
let baseline = { summary: '', commit: '', date: '', repo: '' }
if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
else fail('STAGES/baseline.json غير موجود.')

const roadmapNow = existsSync(ROADMAP) ? readFileSync(ROADMAP, 'utf8') : ''
if (roadmapNow === '') fail('ROADMAP.md غير موجود.')
const statusNow = existsSync(STATUS) ? readFileSync(STATUS, 'utf8') : ''

const status = renderStatus(stages, baseline)
const roadmap = roadmapNow === '' ? '' : renderRoadmap(stages, roadmapNow)

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
