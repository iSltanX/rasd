#!/usr/bin/env node
/**
 * سجلّ ترقية حرّاس Firefox — **ملفٌّ مستقلّ لا صفوفٌ في سجلّ كروم** (SS7، ADR 0059).
 *
 *   pnpm guards:firefox-sync    # يقيس جولات CI (شبكة · gh) ويكتب `.github/firefox-guards-ledger.json`
 *   pnpm guards:firefox-check   # يفحص السجلّ بلا شبكة — في البوّابة A وفي CI
 *
 * **القواعد قواعد `guards-sync.mjs` نفسها، مستوردةً لا منسوخة:** بصمة الحارس ملفّه وما يستورده من `scripts/` (فتعديل
 * `scripts/lib/bidi.mjs` يبدأ سلاسل الطائفة كلّها من الصفر)، والسلسلة تنكسر بأوّل جولة غير خضراء أو ببصمةٍ غير بصمة
 * اليوم، والإلغاء والتخطّي ثغرة، وجولة التوثيق والجولة التي لم تبدأ تُستبعدان، والعتبة عشر.
 *
 * **وما يختلف، ولماذا ملفٌّ مستقلّ:** حرّاس Firefox وظيفةٌ واحدة (`firefox` في `ci.yml`) بخطوةٍ لكل حارس باسمه
 * (`firefox:<name>`) — متصفّحٌ واحد يُثبَّت مرّة لا أربع عشرة — فتُقرأ **خاتمة الخطوة** لا خاتمة وظيفة. ولو دخلت صفوف
 * مصفوفة `live` لصارت حرّاس كروم في `allGuards` و`readMatrix`، ولطال زمن بوّابة Chromium وتغيّرت قائمتها — عين ما
 * تمنعه SS7. وجولةٌ لم يكن في `ci.yml` عند التزامها وظيفة `firefox` (قبل SS7) تُستبعد لا تُعدّ ثغرة: لم يُطلب فيها شيء.
 *
 * **ولا عمود `blocking` بعد:** الوظيفة كلّها `continue-on-error: true` (ADR 0026: CI استشاري)، والسجلّ يقول مَن صار
 * مؤهَّلًا؛ وترقية حارسٍ إلى حاجب قرار المالك بتعديل خطوته — يُكتب في ADR 0059.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { firefoxGuards } from './firefox-verify.mjs'
import {
  blobId,
  classify,
  fingerprintOf,
  guardDeps,
  isDocsOnlyRun,
  isUnstartedRun,
  streakOf,
} from './guards-sync.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const LEDGER_PATH = process.env.RASD_FIREFOX_LEDGER
  ? join(root, process.env.RASD_FIREFOX_LEDGER)
  : join(root, '.github', 'firefox-guards-ledger.json')
const CI_PATH = process.env.RASD_GUARDS_CI
  ? join(root, process.env.RASD_GUARDS_CI)
  : join(root, '.github', 'workflows', 'ci.yml')

const PROMOTION_STREAK = 10
const WINDOW = 20
const REPO = 'iSltanX/rasd'

/** اسم وظيفة حرّاس Firefox في `ci.yml` — يثبت تطابقه اختبار. */
export const FIREFOX_JOB = 'Firefox حقيقي · حرّاس BiDi'

const entry = (guard) => `scripts/firefox/verify-${guard}.mjs`

/** خطوات الحرّاس في وظيفة `firefox` من نصّ `ci.yml` — `- name: firefox:<name>` داخل كتلتها وحدها. */
export function readSteps(yml) {
  const block = /\n {2}firefox:\n((?: {4}.*\n|\s*\n)+)/u.exec(yml)?.[1]
  if (!block) return null
  return [...block.matchAll(/^ {6}- name: firefox:([a-z-]+)\s*$/gmu)].map((m) => m[1])
}

/** بصمة الحارس اليوم من القرص بلا `git` — قاعدة القرار 7 في `guards-sync.mjs`. */
function fingerprintNow(guard) {
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  return fingerprintOf(guardDeps(entry(guard), read).map((rel) => [rel, blobId(join(root, rel))]))
}

// ── الفحص (بلا شبكة) ─────────────────────────────────────────────

/** مشكلات السجلّ مقابل الحرّاس المعرَّفة وخطوات CI والبصمات — دالّة خالصة على مدخلاتها. */
export function ledgerProblems({ ledger, guards, steps, fingerprint }) {
  const problems = []
  if (!ledger) return ['لا سجلّ ترقية لحرّاس Firefox — شغّل `pnpm guards:firefox-sync`']
  if (ledger.promotionStreak !== PROMOTION_STREAK) {
    problems.push(`السجلّ التُقط بعتبة ${ledger.promotionStreak} والعتبة اليوم ${PROMOTION_STREAK}`)
  }
  if (!steps) problems.push('لا وظيفة firefox في ci.yml')
  const inLedger = Object.keys(ledger.guards ?? {}).sort()
  const defined = [...guards].sort()
  for (const g of defined) if (!inLedger.includes(g)) problems.push(`حارس بلا سجلّ: ${g}`)
  for (const g of inLedger) if (!defined.includes(g)) problems.push(`سجلّ بلا حارس: ${g}`)
  for (const g of defined)
    if (steps && !steps.includes(g)) problems.push(`حارس بلا خطوة في ci.yml: firefox:${g}`)
  for (const g of steps ?? [])
    if (!defined.includes(g)) problems.push(`خطوة في ci.yml بلا حارس: firefox:${g}`)
  for (const g of defined) {
    const e = ledger.guards?.[g]
    if (!e) continue
    const streak = streakOf(e, fingerprint(g))
    if (streak !== e.streak) problems.push(`سلسلة «${g}» في السجلّ ${e.streak} والمحسوبة ${streak}`)
  }
  return problems
}

function check() {
  const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) : null
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const guards = firefoxGuards(pkg)
  const problems = ledgerProblems({
    ledger,
    guards,
    steps: readSteps(readFileSync(CI_PATH, 'utf8')),
    fingerprint: fingerprintNow,
  })
  if (problems.length > 0) {
    console.error('\n✗ سجلّ ترقية حرّاس Firefox:')
    for (const p of problems) console.error(`  · ${p}`)
    console.error('\n  الإصلاح: `pnpm guards:firefox-sync` بعد تعديل حارسٍ أو إضافته.\n')
    process.exit(1)
  }
  const eligible = guards.filter((g) => ledger.guards[g].streak >= PROMOTION_STREAK)
  console.log(
    `✓ سجلّ حرّاس Firefox يطابق الحرّاس وخطوات ci.yml — ${guards.length} حارسًا، مؤهَّل للترقية ${eligible.length}` +
      (eligible.length > 0 ? `: ${eligible.join(' · ')}` : ''),
  )
}

// ── الالتقاط (بشبكة) ─────────────────────────────────────────────

const gh = (args) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

function fingerprintAt(sha, guard) {
  const read = (rel) => git(['show', `${sha}:${rel}`])
  const blobAt = (rel) => git(['rev-parse', `${sha}:${rel}`])?.trim() ?? null
  return fingerprintOf(guardDeps(entry(guard), read).map((rel) => [rel, blobAt(rel)]))
}

async function capture() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const guards = firefoxGuards(pkg)
  const runs = JSON.parse(
    gh([
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      'ci.yml',
      '--branch',
      'main',
      '--limit',
      String(WINDOW * 20),
      '--json',
      'databaseId,headSha,status,event,createdAt',
    ]),
  ).filter((r) => r.status === 'completed')

  const entries = Object.fromEntries(guards.map((g) => [g, { results: [], scripts: [] }]))
  const recorded = []
  const excluded = { 'no-job': 0, docs: 0, unstarted: 0 }
  for (const run of runs) {
    if (recorded.length === WINDOW) break
    // قبل SS7 لا وظيفة: لم يُطلب في الجولة حارس Firefox، فتُستبعد بلا نداء شبكة.
    const yml = git(['show', `${run.headSha}:.github/workflows/ci.yml`])
    if (!yml || !readSteps(yml)) {
      excluded['no-job'] += 1
      continue
    }
    const jobs = gh([
      'api',
      `repos/${REPO}/actions/runs/${run.databaseId}/jobs`,
      '--paginate',
      '--jq',
      '.jobs[]',
    ])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    if (isDocsOnlyRun(jobs)) {
      excluded.docs += 1
      continue
    }
    if (isUnstartedRun(jobs)) {
      excluded.unstarted += 1
      continue
    }
    const job = jobs.find((j) => j.name === FIREFOX_JOB)
    recorded.push({
      id: run.databaseId,
      sha: run.headSha,
      event: run.event,
      createdAt: run.createdAt,
    })
    for (const g of guards) {
      const step = job?.steps?.find((s) => s.name === `firefox:${g}`)
      entries[g].results.push(classify(step?.conclusion))
      entries[g].scripts.push(fingerprintAt(run.headSha, g))
    }
  }
  for (const g of guards) {
    entries[g].streak = streakOf(entries[g], fingerprintNow(g))
    entries[g].eligible = entries[g].streak >= PROMOTION_STREAK
  }
  const ledger = {
    schema: 1,
    repo: REPO,
    job: FIREFOX_JOB,
    promotionStreak: PROMOTION_STREAK,
    window: WINDOW,
    capturedAt: new Date().toISOString(),
    runs: recorded,
    guards: entries,
  }
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n')
  console.log('\n── سجلّ ترقية حرّاس Firefox ──')
  console.log(
    `  ${recorded.length} جولة · مستبعَدة: ${excluded['no-job']} بلا وظيفة · ${excluded.docs} توثيق · ${excluded.unstarted} لم تبدأ · العتبة ${PROMOTION_STREAK}`,
  )
  for (const g of guards) {
    const e = entries[g]
    console.log(
      `  ${e.eligible ? '✓' : '·'} ${g.padEnd(12)} سلسلة ${String(e.streak).padStart(2)} · ${e.results.join(',')}`,
    )
  }
  console.log('')
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) {
  process.argv.includes('--check') ? check() : await capture()
}
