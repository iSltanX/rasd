#!/usr/bin/env node
/**
 * لوحة التشغيل المحلّية — `Docs/Waves/board.html` (ADR 0026).
 *
 * **مشتقّة لا مصدر:** تُبنى من خطّة `Docs/Waves.md` وترويسات `STAGES/` ووسوم `wave-XX/base` وترويسات
 * فروع `origin/stage/*` ساعة التوليد. ملفّ HTML واحد عربي RTL بلا شبكة ولا CDN، يفتحه المالك من القرص
 * (`open Docs/Waves/board.html`)، وينسخ منه أمر كل جلسة. زرّ «تمّت المرحلة» يغيّر الشكل في
 * `localStorage` وحده ولا يكتب حالةً في أي مكان.
 *
 *   pnpm waves:board    يعيد توليد اللوحة — يشغّله المنسّق عند إغلاق كل موجة
 *
 * ويرفض التوليد إن خالفت الخطّة الترويسات (`checkPlan`): لوحةٌ من خطّة مكسورة ترشد إلى خطأ.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  checkPlan,
  MODELS,
  outOfScope,
  pad,
  parseStage,
  readPlan,
  readStages,
  root,
  scopeFiles,
} from './waves-plan.mjs'

const OUT = process.env.RASD_BOARD_OUT
  ? join(root, process.env.RASD_BOARD_OUT)
  : join(root, 'Docs', 'Waves', 'board.html')

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

// ── الحالة من git ────────────────────────────────────────────────

/** وسوم الأساس: رقم الموجة ⇐ البصمة المختصرة. */
function baseTags() {
  const out = new Map()
  for (const line of git([
    'tag',
    '-l',
    'wave-*/base',
    '--format=%(refname:short) %(objectname:short)',
  ])
    .split('\n')
    .filter(Boolean)) {
    const m = /^wave-(\d+)\/base (\S+)$/u.exec(line)
    if (m) out.set(Number(m[1]), m[2])
  }
  return out
}

/** ترويسات فروع المراحل المدفوعة: رقم المرحلة ⇐ الحالة والتسليم على الفرع. */
function branchHeaders() {
  const out = new Map()
  for (const ref of git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/stage/'])
    .split('\n')
    .filter(Boolean)) {
    const m = /origin\/stage\/(\d+)-/u.exec(ref)
    if (!m) continue
    const text = git(['show', `${ref}:STAGES/${m[1]}.md`])
    if (text) out.set(Number(m[1]), { ref, ...parseStage(text) })
  }
  return out
}

// ── النصوص ───────────────────────────────────────────────────────

const HINDI = '٠١٢٣٤٥٦٧٨٩'
/** العدّ البشري بالأرقام الهندية؛ أرقام المراحل والموجات والبصمات تبقى غربية. */
const count = (n) => String(n).replace(/\d/gu, (d) => HINDI[Number(d)])

const escape = (text) =>
  String(text)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')

/** مقاطع `code` في خلايا الخطّة تصير `<code>` معزولة الاتّجاه. */
const inline = (text) => escape(text).replace(/`([^`]+)`/gu, '<code dir="ltr">$1</code>')

function fill(template, values) {
  return template.replace(/‹([A-Z_]+)›/gu, (whole, key) => (key in values ? values[key] : whole))
}

const STATUS = {
  merged: 'مدمجة',
  'ready-to-merge': 'جاهزة للدمج',
  'in-progress': 'قيد العمل',
  ready: 'جاهزة',
  blocked: 'محجوبة باعتمادية',
  waiting: 'موجتها لم تُفتح',
}

// ── النموذج ──────────────────────────────────────────────────────

function build() {
  const plan = readPlan()
  const stages = readStages()
  const errors = checkPlan(plan, stages)
  if (errors.length > 0) {
    for (const message of errors) console.error(`  ✗ ${message}`)
    console.error('\n✗ الخطّة تخالف الترويسات — لا لوحة من خطّة مكسورة.\n')
    process.exit(1)
  }
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const rowById = new Map(plan.stages.map((row) => [row.id, row]))
  const tags = baseTags()
  const branches = branchHeaders()
  const done = (id) => byId.get(id)?.status === 'done'

  const stageState = (id, waveOpen) => {
    if (done(id)) return 'merged'
    const branch = branches.get(id)
    if (branch?.status === 'active' && branch.delivery === 'branch') return 'ready-to-merge'
    if (branch?.status === 'active') return 'in-progress'
    if (!waveOpen) return 'waiting'
    return byId.get(id).depends.every(done) ? 'ready' : 'blocked'
  }

  const waves = plan.waves.map((wave, index) => {
    const ww = pad(wave.wave)
    const next = plan.waves[index + 1] ? pad(plan.waves[index + 1].wave) : null
    const closed = wave.stages.every(done)
    const open = !closed && tags.has(wave.wave)
    const solo = wave.stages.length === 1
    const items = wave.stages.map((id) => {
      const stage = byId.get(id)
      const row = rowById.get(id)
      const nn = pad(id)
      const parallel = wave.stages.filter((other) => other !== id)
      const values = {
        NN: nn,
        WW: ww,
        NEXT: next ?? '—',
        TITLE: stage.title,
        BRANCH: row.branch,
        MODEL: row.model,
        DEPENDS: stage.depends.length > 0 ? stage.depends.map(pad).join(' · ') : '—',
        PARALLEL: parallel.length > 0 ? parallel.map(pad).join(' · ') : 'لا شيء — موجة منفردة',
        ROWS: row.rowsText,
        ADR: row.adrText,
        MIGRATION:
          wave.migration === id
            ? 'هي صاحبة ترحيل موجتها: رقمه DB_VERSION على وسم الأساس + 1، واختبار الترقية يسبقه'
            : 'لا — لا ترحيل مرقَّمًا في هذه المرحلة',
        OWNS: row.owns,
        RISKS: row.risks,
        GOAL: stage.sections['الهدف والنتيجة التي يراها المستخدم'] ?? '',
        FILES: scopeFiles(stage)
          .map((file) => `- ${file}`)
          .join('\n'),
        OUT: outOfScope(stage)
          .map((file) => `- ${file}`)
          .join('\n'),
        ACCEPT: stage.sections['معايير القبول وأوامر التحقّق'] ?? '',
      }
      values.ROLE = fill(solo ? plan.roles.solo : plan.roles.parallel, values)
      values.REPORT = fill(plan.templates.report, values)
      const model = MODELS[row.model]
      const terminal = solo
        ? `git switch main && git pull --ff-only && git fetch origin --tags && claude --model ${model} "/stage ${nn}"`
        : `git fetch origin --tags && git worktree add ../rasd-stage-${nn} -b ${row.branch} origin/main && cd ../rasd-stage-${nn} && nvm use && corepack enable && pnpm install --frozen-lockfile && claude --model ${model} "/stage ${nn}"`
      return {
        id,
        nn,
        title: stage.title,
        goal: values.GOAL,
        state: stageState(id, open || closed),
        row,
        stage,
        parallel,
        files: scopeFiles(stage),
        copy: {
          short: `/stage ${nn}`,
          full: fill(plan.templates.stage, values),
          terminal,
        },
      }
    })
    const mergeValues = {
      WW: ww,
      NEXT: next ?? '—',
      STAGES: wave.stages.map((id) => `${pad(id)} — ${byId.get(id).title}`).join(' · '),
      CHECK: wave.check,
      MIGRATION: wave.migration === null ? '—' : pad(wave.migration),
      MANUAL: wave.manualText,
    }
    mergeValues.ROLE = fill(plan.roles.merge, mergeValues)
    return {
      ...wave,
      ww,
      next,
      closed,
      open,
      solo,
      base: tags.get(wave.wave) ?? null,
      items,
      copy: {
        short: `/wave-merge ${ww}`,
        full: fill(plan.templates.merge, mergeValues),
        terminal: `git switch main && git pull --ff-only && git fetch origin --tags && claude --model ${MODELS['Opus 5.5']} "/wave-merge ${ww}"`,
      },
    }
  })

  const remaining = waves.flatMap((w) => w.items).filter((item) => item.state !== 'merged').length
  const current = waves.find((w) => !w.closed) ?? null
  return {
    waves,
    remaining,
    total: waves.length,
    widest: Math.max(...waves.map((w) => w.stages.length)),
    current,
    head: git(['rev-parse', '--short', 'HEAD']),
    generated: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }
}

// ── العرض ────────────────────────────────────────────────────────

function button(key, label, primary = false) {
  return `<button type="button" class="btn${primary ? ' primary' : ''}" data-copy="${escape(key)}">${label}</button>`
}

function stageCard(wave, item) {
  const { row } = item
  const recipe = wave.solo
    ? `جلسة جديدة ← المجلّد rasd ← <strong>بلا</strong> worktree ← ${escape(row.model)} ← الصق الأمر`
    : `جلسة جديدة ← المجلّد rasd ← فعّل <strong>worktree</strong> ← ${escape(row.model)} ← الصق الأمر`
  const facts = [
    ['الموجة', `<span dir="ltr">${wave.wave}</span>`],
    [
      'تعتمد على',
      item.stage.depends.length > 0
        ? item.stage.depends.map((d) => `<span class="num">${pad(d)}</span>`).join(' · ')
        : '—',
    ],
    [
      'تعمل بالتوازي مع',
      item.parallel.length > 0
        ? item.parallel.map((d) => `<span class="num">${pad(d)}</span>`).join(' · ')
        : 'لا شيء — موجة منفردة',
    ],
    ['الفرع', `<code dir="ltr">${escape(row.branch)}</code>`],
    ['الحجم النسبي', `<span dir="ltr">${escape(row.size)}</span>`],
    ['النموذج المقترح', escape(row.model)],
    ['تملك في موجتها', inline(row.owns)],
    ['مخاطر التعارض', inline(row.risks)],
    [
      'محجوز لها',
      `صفوف §6 <span dir="ltr">${escape(row.rowsText)}</span> · ADR <span dir="ltr">${escape(row.adrText)}</span>`,
    ],
  ]
  return `
      <details class="stage state-${item.state}" data-stage="${item.nn}">
        <summary>
          <span class="num">${item.nn}</span>
          <span class="title">${escape(item.title)}</span>
          <span class="pill">${STATUS[item.state]}</span>
          <span class="pill local" hidden>تمّت (محلّيًّا)</span>
        </summary>
        <div class="body">
          <p class="goal">${inline(item.goal)}</p>
          <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          <div class="files"><h4>أهمّ الملفّات المتوقَّعة</h4><ul>${item.files
            .map((file) => `<li>${inline(file)}</li>`)
            .join('')}</ul></div>
          <p class="recipe">${recipe}</p>
          <div class="actions">
            ${button(`s-${item.nn}-short`, 'نسخ الأمر المختصر', true)}
            ${button(`s-${item.nn}-full`, 'نسخ البرومبت الكامل')}
            ${button(`s-${item.nn}-terminal`, 'نسخ أمر الطرفية')}
            <button type="button" class="btn ghost" data-done="${item.nn}">تمّت المرحلة</button>
          </div>
          <p class="command"><code dir="ltr">${escape(item.copy.short)}</code></p>
        </div>
      </details>`
}

function waveCard(wave, isCurrent) {
  const status = wave.closed ? 'مغلقة' : wave.open ? 'مفتوحة' : 'قادمة'
  const base = wave.base
    ? `<code dir="ltr">wave-${wave.ww}/base</code> · <code dir="ltr">${escape(wave.base)}</code>`
    : 'يُحسم عند فتح الموجة'
  const size = wave.solo
    ? 'مرحلة واحدة — موجة منفردة'
    : `${count(wave.stages.length)} مراحل بالتوازي`
  const manual = { required: 'وجوبًا', due: 'مستحقّة', none: '—' }[wave.manual]
  const checklist = wave.items
    .map(
      (item) =>
        `<li data-check="${item.nn}" class="${item.state === 'merged' ? 'ok' : ''}"><span class="num">${item.nn}</span> ${escape(item.title)}</li>`,
    )
    .join('')
  const close = wave.solo
    ? `<p class="recipe">المرحلة المنفردة تُغلق موجتها بنفسها: «إغلاق الموجة» في <code dir="ltr">Docs/Waves.md</code> من خطوته الخامسة.</p>`
    : `<p class="recipe">جلسة جديدة ← المجلّد rasd ← <strong>بلا</strong> worktree ← Opus 5.5 ← الصق</p>
          <div class="actions">
            ${button(`w-${wave.ww}-short`, 'نسخ الأمر المختصر', true)}
            ${button(`w-${wave.ww}-full`, 'نسخ برومبت دمج الموجة')}
            ${button(`w-${wave.ww}-terminal`, 'نسخ أمر الطرفية')}
          </div>
          <p class="command"><code dir="ltr">${escape(wave.copy.short)}</code></p>`
  return `
    <section class="wave ${wave.closed ? 'closed' : wave.open ? 'open' : 'upcoming'}${isCurrent ? ' current' : ''}" id="wave-${wave.ww}">
      <header>
        <h2>${wave.closed ? '✓ ' : ''}الموجة <span dir="ltr">${wave.wave}</span> — ${size}</h2>
        <span class="pill wave-pill">${status}</span>
      </header>
      <p class="meta">الأساس: ${base} · الفحص: <code dir="ltr">${escape(wave.check)}</code> · ترحيل التخزين: ${
        wave.migration === null ? '—' : `<span class="num">${pad(wave.migration)}</span>`
      } · الجولة اليدوية: ${manual}</p>
      <p class="why">${inline(wave.why)}</p>
      <div class="stages">${wave.items.map((item) => stageCard(wave, item)).join('')}</div>
    </section>
    <div class="arrow" aria-hidden="true">↓</div>
    <section class="merge ${wave.closed ? 'closed' : ''}">
      <h3>${wave.closed ? '✓ ' : ''}${wave.solo ? 'إغلاق' : 'الدمج'} <span dir="ltr">${wave.wave}</span> — بعد اكتمال جميع المراحل</h3>
      <ul class="checklist">${checklist}</ul>
      ${close}
    </section>`
}

function render(model) {
  const copy = {}
  for (const wave of model.waves) {
    for (const [kind, text] of Object.entries(wave.copy)) copy[`w-${wave.ww}-${kind}`] = text
    for (const item of wave.items) {
      for (const [kind, text] of Object.entries(item.copy)) copy[`s-${item.nn}-${kind}`] = text
    }
  }
  const data = JSON.stringify(copy).replace(/</gu, '\\u003c')
  const current = model.current
    ? `الموجة <span dir="ltr">${model.current.wave}</span> — ${model.current.open ? 'مفتوحة' : 'تنتظر وسمها'}`
    : 'اكتملت الموجات'
  const flow = model.waves
    .map((wave) => waveCard(wave, wave === model.current))
    .join('\n    <div class="arrow" aria-hidden="true">↓</div>')
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>لوحة موجات رصد</title>
<style>
:root {
  --bg: #f6f5f2; --panel: #ffffff; --ink: #1d1f23; --muted: #5d636d; --line: #e2e0da;
  --accent: #2f6fdb; --accent-ink: #ffffff;
  --merged: #2e7d4f; --ready: #2f6fdb; --progress: #b7791f; --review: #7c4dcc; --blocked: #8a8f98; --waiting: #b3b7bd;
  --code: #efeeea;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171b; --panel: #1d2026; --ink: #e8e9ec; --muted: #a0a6b0; --line: #2d3139;
    --accent: #6f9ef5; --accent-ink: #0d1117;
    --merged: #5cc38a; --ready: #6f9ef5; --progress: #e3a849; --review: #b28cf2; --blocked: #8d939c; --waiting: #5b6069;
    --code: #262a31;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.7 -apple-system, "SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 80px; }
h1 { font-size: 26px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 24px; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.summary div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.summary b { display: block; font-size: 22px; }
.summary span { color: var(--muted); font-size: 13px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--muted); font-size: 13px; margin-bottom: 28px; }
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
.state-merged { --s: var(--merged); } .state-ready { --s: var(--ready); } .state-in-progress { --s: var(--progress); }
.state-ready-to-merge { --s: var(--review); } .state-blocked { --s: var(--blocked); } .state-waiting { --s: var(--waiting); }
.wave.open .wave-pill { --s: var(--ready); } .wave.closed .wave-pill { --s: var(--merged); } .wave.upcoming .wave-pill { --s: var(--waiting); }
details.stage.local-done { --s: var(--merged); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 6px 18px; margin: 10px 0; }
.facts div { display: flex; gap: 8px; }
.facts dt { color: var(--muted); min-width: 110px; }
.facts dd { margin: 0; }
.facts dd code, .command code { white-space: nowrap; }
.files h4 { margin: 8px 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
.files ul, .checklist { margin: 0; padding-inline-start: 20px; }
.checklist li.ok::marker { content: "✓  "; color: var(--merged); }
code { background: var(--code); padding: 1px 6px; border-radius: 6px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; unicode-bidi: isolate; }
.goal { margin: 4px 0 8px; }
.recipe { color: var(--muted); font-size: 14px; margin: 10px 0 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { font: inherit; font-size: 14px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 10px; padding: 6px 12px; cursor: pointer; }
.btn:hover { border-color: var(--accent); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn.ghost { color: var(--muted); }
.command { margin: 8px 0 0; }
#toast { position: fixed; inset-inline: 0; bottom: 20px; margin: auto; width: max-content; background: var(--ink); color: var(--bg); padding: 8px 16px; border-radius: 10px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: 1; }
footer { color: var(--muted); font-size: 13px; margin-top: 32px; }
@media (prefers-reduced-motion: reduce) { #toast { transition: none; } }
</style>
</head>
<body>
<main>
  <h1>أرشيف خطّة رصد بالتوازي — الموجات 1–12</h1>
  <p class="sub"><strong>أرشيف منذ 2026-10-02:</strong> الخطّة النشطة في <a href="../SS/board.html">لوحة SS</a> (<code dir="ltr">Docs/SS/board.html</code>). والمرحلتان 29 و30 نُقلتا إلى SS9 وSS10.</p>
  <p class="sub">مشتقّة من <code dir="ltr">Docs/Waves.md</code> وترويسات <code dir="ltr">STAGES/</code> ووسوم الأساس — ليست مصدر حالة. وُلّدت على <code dir="ltr">${escape(model.head)}</code> في <span dir="ltr">${escape(model.generated)}</span> UTC.</p>
  <div class="summary">
    <div><b>${count(model.remaining)}</b><span>مرحلة متبقّية</span></div>
    <div><b>${count(model.total)}</b><span>موجة</span></div>
    <div><b>${count(model.widest)}</b><span>أقصى توازٍ</span></div>
    <div><b>${current}</b><span>الموجة الحالية</span></div>
  </div>
  <div class="legend">
    <span><i style="background:var(--ready)"></i>جاهزة</span>
    <span><i style="background:var(--blocked)"></i>محجوبة باعتمادية</span>
    <span><i style="background:var(--waiting)"></i>موجتها لم تُفتح</span>
    <span><i style="background:var(--progress)"></i>قيد العمل</span>
    <span><i style="background:var(--review)"></i>جاهزة للدمج</span>
    <span><i style="background:var(--merged)"></i>مدمجة</span>
  </div>
    ${flow}
  <footer>أعد التوليد بـ<code dir="ltr">pnpm waves:board</code> · افتحها بـ<code dir="ltr">open Docs/Waves/board.html</code></footer>
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
  var KEY = 'rasd-waves-done';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* لا تخزين: الشكل وحده */ }
  }
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

const model = build()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, render(model))
console.log(
  `✓ اللوحة: ${OUT.replace(root, '')} — ${model.total} موجة · ${model.remaining} مرحلة متبقّية · الحالية ${model.current ? model.current.wave : '—'}`,
)
