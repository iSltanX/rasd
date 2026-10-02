#!/usr/bin/env node
/**
 * نظام SS — خطّة ما بعد المرحلة 28: **مصدرٌ واحد وثلاثة مشتقّات**.
 *
 * المصدر: ترويسة كل ملفّ `Docs/SS/stages/SS<n>.md` (الحالة والموجة والاعتماد والنموذج والحجم والفرع) وأقسامه
 * المعنونة (الهدف والنطاق والمهامّ ومعايير الإغلاق والمخاطر والمراجع)، ومعه `Docs/SS/waves.json` لنثر كل موجة
 * (لماذا معًا، والجولة اليدوية، ونموذج الدمج). والقوالب والأدوار نصٌّ مكتوب في `Docs/SS/README.md` خارج كتلته
 * المشتقّة. المشتقّات: الكتلة بين `<!-- ss:begin -->` و`<!-- ss:end -->` في `README.md`، واللوحة `board.html`،
 * والبرومبت الكامل لكل مرحلة وموجة. لا يُحرَّر مشتقٌّ بيد.
 *
 *   pnpm ss:sync            يكتب الكتلة المشتقّة واللوحة
 *   pnpm ss:check           يفحص القواعد ومطابقة الكتلة المشتقّة — في البوّابة A وCI
 *   pnpm ss:prompt SS3      يطبع البرومبت الكامل للمرحلة (ما تنسخه اللوحة)
 *   pnpm ss:prompt wave B   يطبع برومبت إغلاق الموجة
 *
 * القواعد ثنائية بلا حكم، وكلٌّ منها في `tests/unit/ss.test.ts` بعيّنة تمرّ وعيّنة تسقط:
 *   · اسم الملفّ يطابق `id`، والأرقام متتابعة من SS1 بلا فجوة.
 *   · كل اعتمادية موجودة، ولا دور، وكل اعتماديةٍ لمرحلة في موجة إمّا `done` وإمّا في موجة أسبق.
 *   · حروف الموجات متتابعة من A، ولكل موجة سطرٌ في `waves.json`، و`order` فريد داخل الموجة.
 *   · موجةٌ بمرحلة واحدة فرعها `main`؛ وأكثر ⇐ `ss/<n>-slug` لكلٍّ.
 *   · `done` تشترط `delivery: merged` و`commit`؛ وما ليس `done` يحمل `resume`.
 *   · أكثر من `active` جائزٌ في موجة واحدة فقط.
 *   · النموذج من قائمة `MODELS` في `waves-plan.mjs`، وغير `Sonnet 5.5` يحتاج `why_model`.
 *
 * النظام القديم (01–34) أرشيفٌ لا يُمسّ: `STAGES/` و`Docs/Waves.md` ولوحتهما تبقى بأدواتها.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { firstFence, MODELS, root, sections, SIZES } from './waves-plan.mjs'

export const SS_DIR = process.env.RASD_SS_DIR
  ? join(root, process.env.RASD_SS_DIR)
  : join(root, 'Docs', 'SS')
export const STAGES_DIR = join(SS_DIR, 'stages')
export const WAVES_PATH = join(SS_DIR, 'waves.json')
export const README_PATH = join(SS_DIR, 'README.md')
export const BOARD_PATH = join(SS_DIR, 'board.html')
const BEGIN = '<!-- ss:begin -->'
const END = '<!-- ss:end -->'

export const STATUSES = {
  pending: 'لم تبدأ',
  active: 'نشطة',
  paused: 'متوقّفة قبل الاكتمال',
  done: 'مكتملة',
}
export const DELIVERIES = {
  none: '—',
  local: 'منفَّذة محليًّا',
  branch: 'منشورة على فرع',
  merged: 'مدمجة في main',
}
export const GATES = ['cone', 'all']
export const DEFAULT_MODEL = 'Sonnet 5.5'

const ID = /^SS(\d+)$/u
export const num = (id) => Number(ID.exec(id)?.[1] ?? NaN)

// ── القراءة ──────────────────────────────────────────────────────

/** ترويسة `key: value` بسيطة على وزن `stages-sync.mjs` — لا YAML كاملًا. */
export function parseStage(text, file = '') {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text)
  const header = {}
  const problems = []
  if (!match) problems.push(`${file}: بلا ترويسة بين سطرَي ---`)
  for (const line of (match?.[1] ?? '').split('\n')) {
    const pair = /^([a-z_]+):\s*(.*)$/u.exec(line)
    if (!pair) problems.push(`${file}: سطر ترويسة غير مفهوم: «${line}»`)
    else header[pair[1]] = pair[2].trim()
  }
  const dependsRaw = /^\[(.*)\]$/u.exec(header.depends ?? '')
  if (!dependsRaw) problems.push(`${file}: depends يجب أن تكون قائمة مثل [SS1, SS2] أو []`)
  const depends =
    dependsRaw && dependsRaw[1].trim() !== ''
      ? dependsRaw[1].split(',').map((part) => part.trim())
      : []
  const body = sections(text.slice(match?.[0].length ?? 0))
  const list = (name) =>
    (body[name] ?? '')
      .split('\n')
      .filter((line) => /^- /u.test(line))
      .map((line) => line.slice(2).trim())
  const scope = body['النطاق'] ?? ''
  const at = scope.indexOf('**الملفّات المتوقَّع تأثّرها**')
  const out = scope.indexOf('**خارج النطاق**')
  const pick = (block) =>
    block
      .split('\n')
      .filter((line) => /^- /u.test(line))
      .map((line) => line.slice(2).trim())
  return {
    file,
    problems,
    id: header.id ?? '',
    title: header.title ?? '',
    status: header.status ?? '',
    delivery: header.delivery ?? '',
    wave: header.wave ?? '',
    order: Number(header.order ?? NaN),
    depends,
    model: header.model ?? DEFAULT_MODEL,
    whyModel: header.why_model ?? '',
    size: header.size ?? '',
    branch: header.branch ?? '',
    gate: header.gate ?? 'cone',
    commit: header.commit ?? '',
    updated: header.updated ?? '',
    resume: header.resume ?? '',
    goal: body['الهدف'] ?? '',
    whyNow: body['لماذا الآن'] ?? '',
    files: at === -1 ? [] : pick(scope.slice(at, out === -1 ? undefined : out)),
    out: out === -1 ? [] : pick(scope.slice(out)),
    tasks: body['المهامّ'] ?? '',
    closes: list('معايير الإغلاق'),
    risks: list('المخاطر'),
    refs: list('المراجع'),
    log: body['سجلّ التنفيذ'] ?? '',
  }
}

export function readStages(dir = STAGES_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^SS\d+\.md$/u.test(name))
    .sort((a, b) => num(a.replace('.md', '')) - num(b.replace('.md', '')))
    .map((name) => parseStage(readFileSync(join(dir, name), 'utf8'), name))
}

export function readWaves(path = WAVES_PATH) {
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  // مفاتيح `$…` تعليقات لا موجات.
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith('$')))
}

/** القوالب والأدوار من `README.md` — خارج الكتلة المشتقّة. */
export function readTemplates(path = README_PATH) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const parts = sections(text)
  return {
    text,
    stage: firstFence(parts['قالب البرومبت — مرحلة'] ?? ''),
    merge: firstFence(parts['قالب البرومبت — إغلاق موجة'] ?? ''),
    report: firstFence(parts['تقرير التسليم'] ?? ''),
    roles: {
      parallel: parts['دور: مرحلة ضمن موجة'] ?? '',
      solo: parts['دور: مرحلة منفردة'] ?? '',
      merge: parts['دور: إغلاق الموجة'] ?? '',
    },
  }
}

// ── الفحص ────────────────────────────────────────────────────────

export const letters = (waves) => Object.keys(waves).sort()
const slug = (stage) => `ss/${num(stage.id)}-`

export function validate(stages, waves, templates = null) {
  const errors = []
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  stages.forEach((stage, index) => {
    errors.push(...stage.problems)
    const want = `SS${index + 1}`
    if (stage.id !== want)
      errors.push(`${stage.file}: id «${stage.id}» والمتوقَّع ${want} (متتابع بلا فجوة)`)
    if (stage.file && stage.file !== `${stage.id}.md`)
      errors.push(`${stage.file}: الاسم لا يطابق id`)
    if (!(stage.status in STATUSES)) errors.push(`${stage.id}: status غير معروفة «${stage.status}»`)
    if (!(stage.delivery in DELIVERIES))
      errors.push(`${stage.id}: delivery غير معروفة «${stage.delivery}»`)
    if (!/^[A-Z]$/u.test(stage.wave))
      errors.push(`${stage.id}: wave حرفٌ كبير واحد لا «${stage.wave}»`)
    if (!Number.isInteger(stage.order) || stage.order < 1)
      errors.push(`${stage.id}: order رقم ترتيب الدمج داخل الموجة`)
    if (!(stage.model in MODELS)) errors.push(`${stage.id}: نموذج غير معتمد «${stage.model}»`)
    if (stage.model !== DEFAULT_MODEL && !stage.whyModel)
      errors.push(`${stage.id}: نموذجٌ أقوى من الافتراضي بلا why_model`)
    if (!SIZES.includes(stage.size)) errors.push(`${stage.id}: حجم غير معروف «${stage.size}»`)
    if (!GATES.includes(stage.gate)) errors.push(`${stage.id}: gate إمّا cone وإمّا all`)
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(stage.updated))
      errors.push(`${stage.id}: updated ليست تاريخًا`)
    if (!stage.goal) errors.push(`${stage.id}: قسم «الهدف» غائب`)
    if (stage.closes.length === 0) errors.push(`${stage.id}: «معايير الإغلاق» بلا بند`)
    if (stage.files.length === 0) errors.push(`${stage.id}: «الملفّات المتوقَّع تأثّرها» فارغة`)
    const hasCommit = /^[0-9a-f]{7,40}$/u.test(stage.commit)
    if (stage.status === 'done') {
      if (stage.delivery !== 'merged') errors.push(`${stage.id}: done تشترط delivery: merged`)
      if (!hasCommit) errors.push(`${stage.id}: done تشترط commit`)
    } else if (!stage.resume || stage.resume === '—') errors.push(`${stage.id}: resume غائبة`)
    for (const dep of stage.depends) {
      if (!byId.has(dep)) errors.push(`${stage.id}: تعتمد على ${dep} وهي غير موجودة`)
      else if (dep === stage.id) errors.push(`${stage.id}: تعتمد على نفسها`)
      else if (num(dep) > num(stage.id))
        errors.push(`${stage.id}: تعتمد على ${dep} وهي بعدها في الترقيم`)
      if (
        (stage.status === 'active' || stage.status === 'done') &&
        byId.get(dep)?.status !== 'done'
      )
        errors.push(`${stage.id}: حالتها ${stage.status} واعتماديتها ${dep} ليست done`)
    }
  })
  // الموجات
  const used = [...new Set(stages.map((stage) => stage.wave))].sort()
  used.forEach((letter, index) => {
    const want = String.fromCharCode(65 + index)
    if (letter !== want) errors.push(`الموجات غير متتابعة: المتوقَّع ${want} ووُجد ${letter}`)
    if (!(letter in waves)) errors.push(`الموجة ${letter} بلا سطر في waves.json`)
  })
  for (const letter of Object.keys(waves)) {
    if (!used.includes(letter)) errors.push(`waves.json يسمّي الموجة ${letter} ولا مرحلة فيها`)
    const meta = waves[letter] ?? {}
    if (!meta.why) errors.push(`الموجة ${letter}: «why» غائب في waves.json`)
    if (!['none', 'due', 'required'].includes(meta.manual ?? 'none'))
      errors.push(`الموجة ${letter}: manual إمّا none وإمّا due وإمّا required`)
    if (meta.merge_model && !(meta.merge_model in MODELS))
      errors.push(`الموجة ${letter}: merge_model غير معتمد`)
  }
  for (const letter of used) {
    const members = stages.filter((stage) => stage.wave === letter)
    const orders = members.map((stage) => stage.order)
    if (new Set(orders).size !== orders.length) errors.push(`الموجة ${letter}: order مكرَّر`)
    const solo = members.length === 1
    for (const stage of members) {
      const shape = new RegExp(`^${slug(stage)}[a-z0-9]+(-[a-z0-9]+)*$`, 'u')
      if (solo ? stage.branch !== 'main' : !shape.test(stage.branch)) {
        errors.push(
          `${stage.id}: فرعها «${stage.branch}» والمتوقَّع ${solo ? 'main (موجة منفردة)' : `${slug(stage)}<slug>`}`,
        )
      }
      for (const dep of stage.depends) {
        const other = byId.get(dep)
        if (!other || other.status === 'done') continue
        if (other.wave >= stage.wave)
          errors.push(`${stage.id}: في الموجة ${letter} وتعتمد على ${dep} في الموجة ${other.wave}`)
      }
    }
  }
  const active = stages.filter((stage) => stage.status === 'active')
  if (new Set(active.map((stage) => stage.wave)).size > 1)
    errors.push(`مراحل active في أكثر من موجة: ${active.map((s) => s.id).join(' · ')}`)
  // الأدوار
  const state = new Map()
  const visit = (id, trail) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1)
      return void errors.push(`دور في الاعتماديات: ${[...trail, id].join(' ← ')}`)
    state.set(id, 1)
    for (const dep of byId.get(id)?.depends ?? []) visit(dep, [...trail, id])
    state.set(id, 2)
  }
  for (const stage of stages) visit(stage.id, [])
  if (templates) {
    if (!templates.stage || !templates.merge || !templates.report)
      errors.push('README.md: قالب المرحلة أو قالب الإغلاق أو صيغة التقرير غائب')
    if (!templates.roles.parallel || !templates.roles.solo || !templates.roles.merge)
      errors.push('README.md: قسم دورٍ غائب')
  }
  return errors
}

// ── الحالة من git ────────────────────────────────────────────────

const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function baseTags() {
  const out = new Map()
  for (const line of git([
    'tag',
    '-l',
    'ss-*/base',
    '--format=%(refname:short) %(objectname:short)',
  ])
    .split('\n')
    .filter(Boolean)) {
    const m = /^ss-([A-Z])\/base (\S+)$/u.exec(line)
    if (m) out.set(m[1], m[2])
  }
  return out
}

function branchHeaders() {
  const out = new Map()
  for (const ref of git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/ss/'])
    .split('\n')
    .filter(Boolean)) {
    const m = /origin\/ss\/(\d+)-/u.exec(ref)
    if (!m) continue
    const text = git(['show', `${ref}:Docs/SS/stages/SS${m[1]}.md`])
    if (text) out.set(`SS${m[1]}`, { ref, ...parseStage(text) })
  }
  return out
}

// ── النموذج ──────────────────────────────────────────────────────

export function fill(template, values) {
  return (template ?? '').replace(/‹([A-Z_]+)›/gu, (whole, key) =>
    key in values ? values[key] : whole,
  )
}

const bullets = (items, empty = '- —') =>
  items.length > 0 ? items.map((x) => `- ${x}`).join('\n') : empty

export function buildModel({
  stages,
  waves,
  templates,
  tags = new Map(),
  branches = new Map(),
  head = '',
}) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const done = (id) => byId.get(id)?.status === 'done'
  const dependents = (id) => stages.filter((stage) => stage.depends.includes(id)).map((s) => s.id)
  const list = letters(waves).filter((letter) => stages.some((s) => s.wave === letter))
  const model = list.map((letter, index) => {
    const meta = waves[letter]
    const members = stages.filter((s) => s.wave === letter).sort((a, b) => a.order - b.order)
    const solo = members.length === 1
    const gate = members.some((s) => s.gate === 'all') ? 'all' : 'cone'
    const next = list[index + 1] ?? null
    const closed = members.every((s) => done(s.id))
    const open = !closed && tags.has(letter)
    const mergeModel = meta.merge_model ?? DEFAULT_MODEL
    const items = members.map((stage) => {
      const parallel = members.filter((s) => s !== stage).map((s) => s.id)
      const branch = branches.get(stage.id)
      let state = 'waiting'
      if (done(stage.id)) state = 'merged'
      else if (branch?.status === 'active' && branch.delivery === 'branch') state = 'ready-to-merge'
      else if (branch?.status === 'active' || stage.status === 'active') state = 'in-progress'
      else if (stage.status === 'paused') state = 'paused'
      else if (open || closed) state = stage.depends.every(done) ? 'ready' : 'blocked'
      const values = {
        ID: stage.id,
        TITLE: stage.title,
        WAVE: letter,
        NEXT: next ?? '—',
        BRANCH: stage.branch,
        MODEL: stage.model,
        WHY_MODEL: stage.whyModel ? ` — السبب: ${stage.whyModel}` : '',
        SIZE: stage.size,
        GATE: gate,
        DEPENDS: stage.depends.length > 0 ? stage.depends.join(' · ') : '—',
        PARALLEL: parallel.length > 0 ? parallel.join(' · ') : 'لا شيء — موجة منفردة',
        AFTER:
          dependents(stage.id).length > 0
            ? dependents(stage.id).join(' · ')
            : next
              ? `الموجة ${next}`
              : 'لا شيء — آخر المراحل',
        GOAL: stage.goal,
        WHY_NOW: stage.whyNow || '—',
        FILES: bullets(stage.files),
        OUT: bullets(stage.out, '- لا شيء مكتوب — النطاق ما في الملفّات أعلاه وحده'),
        TASKS: stage.tasks || '—',
        CLOSE: bullets(stage.closes),
        RISKS: bullets(stage.risks, '- لا خطر مكتوب'),
        REFS: bullets(stage.refs),
        RESUME: stage.resume,
      }
      values.ROLE = fill(solo ? templates.roles.solo : templates.roles.parallel, values)
      values.REPORT = fill(templates.report, values)
      const claudeModel = MODELS[stage.model]
      const terminal = solo
        ? `git switch main && git pull --ff-only && git fetch origin --tags && claude --model ${claudeModel} "/ss ${stage.id}"`
        : `git fetch origin --tags && git worktree add ../rasd-${stage.id.toLowerCase()} -b ${stage.branch} origin/main && cd ../rasd-${stage.id.toLowerCase()} && nvm use && corepack enable && pnpm install --frozen-lockfile && claude --model ${claudeModel} "/ss ${stage.id}"`
      return {
        ...stage,
        parallel,
        state,
        after: values.AFTER,
        copy: { short: `/ss ${stage.id}`, full: fill(templates.stage, values), terminal },
      }
    })
    const mergeValues = {
      WAVE: letter,
      NEXT: next ?? '—',
      STAGES: members.map((s) => `${s.id} — ${s.title}`).join(' · '),
      GATE: gate,
      MANUAL: { none: '—', due: 'مستحقّة', required: 'وجوبًا' }[meta.manual ?? 'none'],
      MERGE_MODEL: mergeModel,
    }
    mergeValues.ROLE = fill(templates.roles.merge, mergeValues)
    return {
      letter,
      next,
      solo,
      gate,
      why: meta.why,
      manual: meta.manual ?? 'none',
      manualText: mergeValues.MANUAL,
      mergeModel,
      closed,
      open,
      base: tags.get(letter) ?? null,
      items,
      copy: {
        short: `/ss-merge ${letter}`,
        full: fill(templates.merge, mergeValues),
        terminal: `git switch main && git pull --ff-only && git fetch origin --tags && claude --model ${MODELS[mergeModel]} "/ss-merge ${letter}"`,
      },
    }
  })
  const current = model.find((w) => !w.closed) ?? null
  return {
    waves: model,
    current,
    remaining: stages.filter((s) => s.status !== 'done').length,
    total: stages.length,
    widest: Math.max(0, ...model.map((w) => w.items.length)),
    head,
  }
}

// ── الكتلة المشتقّة في README ────────────────────────────────────

export function renderBlock(model) {
  const state = (w) =>
    w.closed ? 'مغلقة' : w.open ? `مفتوحة على \`ss-${w.letter}/base\`` : 'قادمة'
  const wavesTable = [
    '| الموجة | المراحل بترتيب الدمج | التوازي | الفحص | الجولة اليدوية | الحالة | لماذا معًا |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...model.waves.map(
      (w) =>
        `| ${w.letter} | ${w.items.map((s) => s.id).join(' · ')} | ${w.solo ? 'منفردة' : `${w.items.length} معًا`} | \`${w.gate}\` | ${w.manualText} | ${state(w)} | ${w.why} |`,
    ),
  ].join('\n')
  const stagesTable = [
    '| # | المرحلة | الموجة | تعتمد على | الحجم | النموذج | الفرع | الحالة | التسليم | الالتزام |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...model.waves.flatMap((w) =>
      w.items.map(
        (s) =>
          `| [${s.id}](stages/${s.id}.md) | ${s.title} | ${w.letter} | ${s.depends.length > 0 ? s.depends.join(' · ') : '—'} | ${s.size} | ${s.model} | \`${s.branch}\` | ${STATUSES[s.status]} | ${DELIVERIES[s.delivery]} | ${/^[0-9a-f]{7,40}$/u.test(s.commit) ? `\`${s.commit.slice(0, 7)}\`` : '—'} |`,
      ),
    ),
  ].join('\n')
  const live = model.waves.flatMap((w) => w.items)
  const next =
    live.find((s) => s.state === 'in-progress' || s.state === 'paused' || s.state === 'ready') ??
    (model.current ? (model.current.items.find((s) => s.status !== 'done') ?? null) : null)
  const nextNote = next && next.state === 'waiting' ? ' — بعد وسم موجتها' : ''
  const lines = [
    `- **المتبقّي:** ${model.remaining} من ${model.total} مرحلة · **الموجات:** ${model.waves.length} · **أقصى توازٍ:** ${model.widest}`,
    `- **الموجة الحالية:** ${model.current ? `${model.current.letter} — ${model.current.open ? `مفتوحة على \`ss-${model.current.letter}/base\`` : 'تنتظر وسمها'}` : 'اكتملت الموجات'}`,
    `- **المرحلة التالية:** ${next ? `[${next.id}](stages/${next.id}.md) — ${next.title} · \`/ss ${next.id}\`${nextNote}` : 'لا مرحلة جاهزة'}`,
    '',
    '### الموجات',
    '',
    wavesTable,
    '',
    '### المراحل',
    '',
    stagesTable,
  ]
  return lines.join('\n')
}

export function renderReadme(current, block) {
  const start = current.indexOf(BEGIN)
  const end = current.indexOf(END)
  if (start === -1 || end === -1 || end < start) return null
  return `${current.slice(0, start + BEGIN.length)}\n\n${block}\n\n${current.slice(end)}`
}

// ── اللوحة ───────────────────────────────────────────────────────

const HINDI = '٠١٢٣٤٥٦٧٨٩'
const count = (n) => String(n).replace(/\d/gu, (d) => HINDI[Number(d)])
const escape = (text) =>
  String(text)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
const inline = (text) => escape(text).replace(/`([^`]+)`/gu, '<code dir="ltr">$1</code>')
const para = (text) =>
  String(text)
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((p) => `<p>${inline(p.replace(/\n/gu, ' '))}</p>`)
    .join('')

const STATE = {
  merged: 'مدمجة',
  'ready-to-merge': 'جاهزة للدمج',
  'in-progress': 'قيد العمل',
  paused: 'متوقّفة',
  ready: 'جاهزة',
  blocked: 'محجوبة باعتمادية',
  waiting: 'موجتها لم تُفتح',
}

const button = (key, label, primary = false) =>
  `<button type="button" class="btn${primary ? ' primary' : ''}" data-copy="${escape(key)}">${label}</button>`

function stageCard(wave, item) {
  const idTag = (id) => `<span class="num">${escape(id)}</span>`
  const facts = [
    ['الموجة', `<span class="num">${wave.letter}</span>`],
    ['تعتمد على', item.depends.length > 0 ? item.depends.map(idTag).join(' · ') : '—'],
    [
      'تعمل بالتوازي مع',
      item.parallel.length > 0 ? item.parallel.map(idTag).join(' · ') : 'لا شيء — موجة منفردة',
    ],
    ['ما بعدها', inline(item.after)],
    ['الفرع', `<code dir="ltr">${escape(item.branch)}</code>`],
    ['الحجم', `<span dir="ltr">${escape(item.size)}</span>`],
    ['النموذج', `${escape(item.model)}${item.whyModel ? ` — ${inline(item.whyModel)}` : ''}`],
    ['الفحص عند الإغلاق', `<code dir="ltr">${escape(item.gate)}</code>`],
  ]
  const recipe = wave.solo
    ? `جلسة جديدة ← المجلّد rasd ← <strong>بلا</strong> worktree ← ${escape(item.model)} ← الصق الأمر`
    : `جلسة جديدة ← المجلّد rasd ← فعّل <strong>worktree</strong> ← ${escape(item.model)} ← الصق الأمر`
  const ul = (items) => `<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`
  return `
      <details class="stage state-${item.state}" data-stage="${escape(item.id)}">
        <summary>
          <span class="num">${escape(item.id)}</span>
          <span class="title">${escape(item.title)}</span>
          <span class="pill">${STATE[item.state]}</span>
          <span class="pill local" hidden>تمّت (محلّيًّا)</span>
        </summary>
        <div class="body">
          <div class="goal">${para(item.goal)}</div>
          <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          <div class="cols">
            <div><h4>أهمّ الملفّات والمخرجات</h4>${ul(item.files)}</div>
            <div><h4>معايير الإغلاق</h4>${ul(item.closes)}</div>
            <div><h4>المخاطر</h4>${item.risks.length > 0 ? ul(item.risks) : '<p class="muted">لا خطر مكتوب</p>'}</div>
          </div>
          <p class="recipe">${recipe}</p>
          <div class="actions">
            ${button(`s-${item.id}-short`, 'نسخ الأمر المختصر', true)}
            ${button(`s-${item.id}-full`, 'نسخ البرومبت الكامل')}
            ${button(`s-${item.id}-terminal`, 'نسخ أمر الطرفية')}
            <a class="btn link" href="stages/${escape(item.id)}.md">فتح تفاصيل المرحلة</a>
            <button type="button" class="btn ghost" data-done="${escape(item.id)}">تمّت المرحلة</button>
          </div>
          <p class="command"><code dir="ltr">${escape(item.copy.short)}</code></p>
        </div>
      </details>`
}

function waveCard(wave, isCurrent) {
  const status = wave.closed ? 'مغلقة' : wave.open ? 'مفتوحة' : 'قادمة'
  const base = wave.base
    ? `<code dir="ltr">ss-${wave.letter}/base</code> · <code dir="ltr">${escape(wave.base)}</code>`
    : `<code dir="ltr">ss-${wave.letter}/base</code> — يوضع عند فتحها`
  const size = wave.solo
    ? 'مرحلة واحدة — موجة منفردة'
    : `${count(wave.items.length)} مراحل بالتوازي`
  const checklist = wave.items
    .map(
      (item) =>
        `<li data-check="${escape(item.id)}" class="${item.state === 'merged' ? 'ok' : ''}"><span class="num">${escape(item.id)}</span> ${escape(item.title)}</li>`,
    )
    .join('')
  const close = wave.solo
    ? `<p class="recipe">المرحلة المنفردة تُغلق موجتها بنفسها: «دور: مرحلة منفردة» في <code dir="ltr">Docs/SS/README.md</code>.</p>`
    : `<p class="recipe">جلسة جديدة ← المجلّد rasd ← <strong>بلا</strong> worktree ← ${escape(wave.mergeModel)} ← الصق</p>
          <div class="actions">
            ${button(`w-${wave.letter}-short`, 'نسخ أمر الموجة', true)}
            ${button(`w-${wave.letter}-full`, 'نسخ برومبت إغلاق الموجة')}
            ${button(`w-${wave.letter}-terminal`, 'نسخ أمر الطرفية')}
          </div>
          <p class="command"><code dir="ltr">${escape(wave.copy.short)}</code></p>`
  return `
    <section class="wave ${wave.closed ? 'closed' : wave.open ? 'open' : 'upcoming'}${isCurrent ? ' current' : ''}" id="wave-${wave.letter}">
      <header>
        <h2>${wave.closed ? '✓ ' : ''}الموجة <span class="num">${wave.letter}</span> — ${size}</h2>
        <span class="pill wave-pill">${status}</span>
      </header>
      <p class="meta">الأساس: ${base} · الفحص عند الإغلاق: <code dir="ltr">${wave.gate}</code> · الجولة اليدوية: ${wave.manualText} · ما بعدها: ${wave.next ? `الموجة <span class="num">${wave.next}</span>` : 'النشر'}</p>
      <p class="why">${inline(wave.why)}</p>
      <div class="stages">${wave.items.map((item) => stageCard(wave, item)).join('')}</div>
    </section>
    <div class="arrow" aria-hidden="true">↓</div>
    <section class="merge ${wave.closed ? 'closed' : ''}">
      <h3>${wave.closed ? '✓ ' : ''}${wave.solo ? 'إغلاق' : 'دمج'} الموجة <span class="num">${wave.letter}</span> — بعد اكتمال مراحلها</h3>
      <ul class="checklist">${checklist}</ul>
      ${close}
    </section>`
}

export function renderBoard(
  model,
  generated = new Date().toISOString().slice(0, 16).replace('T', ' '),
) {
  const copy = {}
  for (const wave of model.waves) {
    for (const [kind, text] of Object.entries(wave.copy)) copy[`w-${wave.letter}-${kind}`] = text
    for (const item of wave.items)
      for (const [kind, text] of Object.entries(item.copy)) copy[`s-${item.id}-${kind}`] = text
  }
  const data = JSON.stringify(copy).replace(/</gu, '\\u003c')
  const current = model.current
    ? `الموجة <span class="num">${model.current.letter}</span> — ${model.current.open ? 'مفتوحة' : 'تنتظر وسمها'}`
    : 'اكتملت الموجات'
  const flow = model.waves
    .map((wave) => waveCard(wave, wave === model.current))
    .join('\n    <div class="arrow" aria-hidden="true">↓</div>')
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>لوحة SS — رصد</title>
<style>
:root {
  --bg: #f6f5f2; --panel: #ffffff; --ink: #1d1f23; --muted: #5d636d; --line: #e2e0da;
  --accent: #2f6fdb; --accent-ink: #ffffff;
  --merged: #2e7d4f; --ready: #2f6fdb; --progress: #b7791f; --review: #7c4dcc; --blocked: #8a8f98; --waiting: #b3b7bd; --paused: #c2410c;
  --code: #efeeea;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171b; --panel: #1d2026; --ink: #e8e9ec; --muted: #a0a6b0; --line: #2d3139;
    --accent: #6f9ef5; --accent-ink: #0d1117;
    --merged: #5cc38a; --ready: #6f9ef5; --progress: #e3a849; --review: #b28cf2; --blocked: #8d939c; --waiting: #5b6069; --paused: #f0875a;
    --code: #262a31;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.7 -apple-system, "SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 32px 16px 80px; }
h1 { font-size: 26px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 16px; }
.hero { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; }
.hero .lead { font-size: 17px; font-weight: 600; margin: 0; }
.hero .archive a { color: var(--muted); }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.summary div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.summary b { display: block; font-size: 22px; }
.summary span { color: var(--muted); font-size: 13px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--muted); font-size: 13px; margin-bottom: 24px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
.wave, .merge { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 18px 18px 14px; }
.wave.current { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.wave.closed, .merge.closed { opacity: .72; }
.wave header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wave h2 { font-size: 19px; margin: 0; }
.merge h3 { font-size: 16px; margin: 0 0 8px; }
.meta, .why { color: var(--muted); margin: 6px 0; font-size: 14px; }
.arrow { text-align: center; color: var(--muted); font-size: 20px; margin: 6px 0; }
.stages { display: grid; gap: 8px; margin-top: 12px; }
details.stage { border: 1px solid var(--line); border-radius: 12px; border-inline-start: 4px solid var(--s); }
details.stage summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
details.stage summary::-webkit-details-marker { display: none; }
details.stage .title { flex: 1; font-weight: 600; }
.body { padding: 0 14px 14px; }
.num { font-family: ui-monospace, "SF Mono", Menlo, monospace; direction: ltr; unicode-bidi: isolate; font-weight: 700; }
.pill { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--s, var(--accent)) 16%, transparent); color: var(--s, var(--accent)); white-space: nowrap; }
.state-merged { --s: var(--merged); } .state-ready { --s: var(--ready); } .state-in-progress { --s: var(--progress); } .state-paused { --s: var(--paused); }
.state-ready-to-merge { --s: var(--review); } .state-blocked { --s: var(--blocked); } .state-waiting { --s: var(--waiting); }
.wave.open .wave-pill { --s: var(--ready); } .wave.closed .wave-pill { --s: var(--merged); } .wave.upcoming .wave-pill { --s: var(--waiting); }
details.stage.local-done { --s: var(--merged); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 18px; margin: 8px 0; }
.facts div { display: flex; gap: 8px; }
.facts dt { color: var(--muted); min-width: 120px; }
.facts dd { margin: 0; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px 18px; }
.cols h4 { margin: 8px 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
.cols ul, .checklist { margin: 0; padding-inline-start: 20px; }
.cols li { margin: 2px 0; }
.checklist li.ok::marker { content: "✓  "; color: var(--merged); }
.muted { color: var(--muted); margin: 0; }
code { background: var(--code); padding: 1px 6px; border-radius: 6px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; unicode-bidi: isolate; }
.goal p { margin: 4px 0 6px; }
.recipe { color: var(--muted); font-size: 14px; margin: 10px 0 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { font: inherit; font-size: 14px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 10px; padding: 6px 12px; cursor: pointer; text-decoration: none; line-height: 1.5; }
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn.ghost, .btn.link { color: var(--muted); }
.command { margin: 8px 0 0; }
#toast { position: fixed; inset-inline: 0; bottom: 20px; margin: auto; width: max-content; background: var(--ink); color: var(--bg); padding: 8px 16px; border-radius: 10px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: 1; }
footer { color: var(--muted); font-size: 13px; margin-top: 32px; }
@media (prefers-reduced-motion: reduce) { #toast { transition: none; } }
</style>
</head>
<body>
<main>
  <h1>لوحة SS — خطّة رصد إلى الإصدار 1.0 متعدّد المتصفّحات</h1>
  <p class="sub">مشتقّة من <code dir="ltr">Docs/SS/stages/*.md</code> و<code dir="ltr">Docs/SS/waves.json</code> ووسوم <code dir="ltr">ss-X/base</code> — ليست مصدر حالة. وُلّدت على <code dir="ltr">${escape(model.head || '—')}</code> في <span dir="ltr">${escape(generated)}</span> UTC.</p>
  <div class="hero">
    <p class="lead">المشروع الحالي يبدأ من <span class="num">SS1</span>. المراحل 01–28 تاريخٌ مكتمل.</p>
    <p class="archive"><a href="../Waves/board.html">الأرشيف: لوحة الموجات 1–12</a> · <a href="../../ROADMAP.md">خارطة الطريق القديمة</a> · <a href="README.md">قواعد SS</a></p>
  </div>
  <div class="summary">
    <div><b>${count(model.remaining)}</b><span>مرحلة متبقّية من ${count(model.total)}</span></div>
    <div><b>${count(model.waves.length)}</b><span>موجات</span></div>
    <div><b>${count(model.widest)}</b><span>أقصى توازٍ</span></div>
    <div><b>${current}</b><span>الموجة الحالية</span></div>
  </div>
  <div class="legend">
    <span><i style="background:var(--ready)"></i>جاهزة</span>
    <span><i style="background:var(--blocked)"></i>محجوبة باعتمادية</span>
    <span><i style="background:var(--waiting)"></i>موجتها لم تُفتح</span>
    <span><i style="background:var(--progress)"></i>قيد العمل</span>
    <span><i style="background:var(--paused)"></i>متوقّفة</span>
    <span><i style="background:var(--review)"></i>جاهزة للدمج</span>
    <span><i style="background:var(--merged)"></i>مدمجة</span>
  </div>
    ${flow}
  <footer>أعد التوليد بـ<code dir="ltr">pnpm ss:sync</code> · افتحها بـ<code dir="ltr">open Docs/SS/board.html</code> · «تمّت المرحلة» شكلٌ محلّي في المتصفّح لا حالة.</footer>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script id="copy-data" type="application/json">${data}</script>
<script>
(function () {
  var texts = JSON.parse(document.getElementById('copy-data').textContent);
  var toast = document.getElementById('toast');
  var timer;
  function say(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, 1600);
  }
  function fallback(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    say(ok ? 'تمّ النسخ' : 'تعذّر النسخ — انسخ يدويًّا');
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say('تمّ النسخ'); }, function () { fallback(text); });
    } else {
      fallback(text);
    }
  }
  window.__rasdSSCopy = texts;
  var KEY = 'rasd-ss-done';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* الشكل وحده */ } }
  var done = load();
  function paint() {
    document.querySelectorAll('details.stage').forEach(function (el) {
      var on = !!done[el.getAttribute('data-stage')];
      el.classList.toggle('local-done', on);
      el.querySelector('.pill.local').hidden = !on;
      var button = el.querySelector('[data-done]');
      if (button) button.textContent = on ? 'إلغاء «تمّت»' : 'تمّت المرحلة';
    });
    document.querySelectorAll('[data-check]').forEach(function (li) {
      if (done[li.getAttribute('data-check')]) li.classList.add('ok');
    });
  }
  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-copy], [data-done]');
    if (!target) return;
    if (target.hasAttribute('data-copy')) copy(texts[target.getAttribute('data-copy')] || '');
    else {
      var id = target.getAttribute('data-done');
      if (done[id]) delete done[id]; else done[id] = true;
      save(done);
      paint();
    }
  });
  paint();
  var current = document.querySelector('.wave.current');
  if (current && location.hash === '') current.scrollIntoView({ block: 'start' });
})();
</script>
</body>
</html>
`
}

// ── التشغيل ──────────────────────────────────────────────────────

function load() {
  const stages = readStages()
  const waves = readWaves()
  const templates = readTemplates()
  const errors = validate(stages, waves, templates)
  if (stages.length === 0) errors.push('لا مرحلة في Docs/SS/stages/')
  return { stages, waves, templates, errors }
}

function liveModel({ stages, waves, templates }) {
  return buildModel({
    stages,
    waves,
    templates,
    tags: baseTags(),
    branches: branchHeaders(),
    head: git(['rev-parse', '--short', 'HEAD']),
  })
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) {
  const [command = 'check', ...rest] = process.argv.slice(2)
  const loaded = load()
  const bail = () => {
    for (const message of loaded.errors) console.error(`  ✗ ${message}`)
    console.error(`\n✗ ${loaded.errors.length} مخالفة في مصدر SS.\n`)
    process.exit(1)
  }
  if (loaded.errors.length > 0) bail()
  const model = liveModel(loaded)
  const readmeNow = loaded.templates.text
  const readme = renderReadme(readmeNow, renderBlock(model))
  if (readme === null) {
    console.error('✗ README.md: علامتا ss:begin و ss:end غائبتان.')
    process.exit(1)
  }
  if (command === 'check') {
    if (readme !== readmeNow) {
      console.error('  ✗ الكتلة المشتقّة في Docs/SS/README.md لا تطابق المصدر — شغّل pnpm ss:sync')
      process.exit(1)
    }
    if (!existsSync(BOARD_PATH)) {
      console.error('  ✗ Docs/SS/board.html غائبة — شغّل pnpm ss:sync')
      process.exit(1)
    }
    console.log(
      `✓ SS: ${loaded.stages.length} مرحلة في ${model.waves.length} موجات، والمشتقّ يطابق المصدر.`,
    )
  } else if (command === 'sync') {
    writeFileSync(README_PATH, readme)
    mkdirSync(dirname(BOARD_PATH), { recursive: true })
    writeFileSync(BOARD_PATH, renderBoard(model))
    console.log(
      `✓ SS: كُتبت الكتلة المشتقّة واللوحة — ${model.waves.length} موجات · ${model.remaining} مرحلة متبقّية · الحالية ${model.current ? model.current.letter : '—'}`,
    )
  } else if (command === 'prompt') {
    const [first, second] = rest
    if (first === 'wave') {
      const wave = model.waves.find((w) => w.letter === second)
      if (!wave) {
        console.error(`✗ لا موجة «${second}».`)
        process.exit(1)
      }
      process.stdout.write(wave.copy.full + '\n')
    } else {
      const item = model.waves.flatMap((w) => w.items).find((s) => s.id === first)
      if (!item) {
        console.error(`✗ لا مرحلة «${first}».`)
        process.exit(1)
      }
      process.stdout.write(item.copy.full + '\n')
    }
  } else {
    console.error(`✗ أمر غير معروف «${command}» — check · sync · prompt`)
    process.exit(1)
  }
}
