#!/usr/bin/env node
/**
 * قاعدة ترقية الحرّاس — **شيفرةً لا تعليقَ YAML**.
 *
 * **العلّة.** القاعدة («عشر جولات خضراء متتالية يُقلَب معها `blocking` إلى
 * `true`») كانت نثرًا عربيًّا داخل تعليق في `ci.yml` — أي ادّعاءً لا يقرؤه
 * شيء ولا يستطيع شيءٌ أن ينقضه. وعمود `blocking` كان يُكتَب بيد، في مستودعٍ
 * قاعدتُه أن **القيمة المشتقّة لها مصدر واحد و`--check` يسقط عند الانحراف**
 * (‏`tokens-sync.mjs` · `stages-sync.mjs` · `fonts-sync.mjs`).
 *
 * فهذا السكربت على وزنها حرفيًّا: مصدرٌ مقيس ← مخرَجٌ مشتقّ ← فحصٌ حتمي.
 *
 *   pnpm guards:sync    # يقيس تاريخ الجولات (شبكة · gh) ويكتب السجلّ والعمود
 *   pnpm guards:check   # يفحص التطابق (بلا شبكة) ولا يكتب — في البوّابة A وفي CI
 *
 * ── ثلاثة قرارات صعبة، وتعليل كلٍّ ───────────────────────────────
 *
 * **1. تُقرأ نتيجة الوظيفة لا نتيجة الجولة.** هذا هو الفخّ القاتل هنا بعينه:
 * `continue-on-error: ${{ !matrix.blocking }}` يجعل الجولة `success` وكلُّ
 * حرّاسها حمراء. فمن يقرأ `conclusion` من `gh run list` يحصل على سجلٍّ أخضر
 * أبديّ يُرقّي السبعة عشر كلّهم — وهو عين صنف «حالةٌ افتراضية تُقرأ نتيجةً»
 * الذي بُني هذا كلّه لإنهائه (‏`§6` الصفّان 96 و97).
 *
 * **2. السلسلة تنكسر بتغيّر الحارس نفسه.** حارسٌ أُعيدت كتابته لا يرث سجلّ
 * سلفه: لا شيء منه قِيس. فيُحفَظ مع كل جولة **بصمة ملفّ الحارس وقتها**
 * (‏معرّف كائن git للملفّ)، ويتوقّف العدّ عند أوّل جولة بصمتُها غير بصمة
 * الملفّ اليوم. والبصمة تُحسَب في `--check` **بلا `git`** — خوارزميّتها
 * معروفة: `sha1("blob " + الطول + "\0" + المحتوى)` — فيبقى الفحص حتميًّا
 * حتى على نسخة سطحية أو شجرةٍ بلا تاريخ.
 *
 * **3. ثلاث حالات لا اثنتان.** `success` ⇐ أخضر · `failure`/`timed_out` ⇐ أحمر ·
 * و`cancelled` أو `skipped` أو **غياب الوظيفة من الجولة** ⇐ **ثغرة**.
 * والثغرة تكسر السلسلة ولا تجسرها: الترقية على أدلّة لم تُجمَع أسوأ من تركها.
 * **ولماذا الإلغاء ثغرةٌ لا حمرة**: وظيفةٌ أُلغيت لم تُصدر حكمًا — تسجيلها
 * حمراء ادّعاءٌ بأن الحارس سقط، وهو كذب. والإلغاء واقعٌ هنا لا افتراضي:
 * `cancel-in-progress: true` يُلغي جولةً كاملة عند أي دفعٍ يعلوها (وقع في
 * الجولة 34439026069)، وذاك حدثٌ في تدفّق العمل لا في الحارس.
 *
 * **4. جولة مسار التوثيق ليست جولة حرّاس.** `ci.yml` يتخطّى البناء والحرّاس
 * التسعة عشر حين لا يغيّر الدفع إلا توثيقًا. لو عُدّت تلك الجولة لصارت ثغرةً
 * لكل حارس، فيكسر كل التزام توثيقي السلاسل كلّها ويُنزل الحرّاس الحاجبة عند
 * الالتقاط التالي — عقوبةٌ على شيفرة لم تتغيّر. فتُستبعَد من السجلّ كلّيًّا:
 * لا خضراء ولا ثغرة، كأنها لم تكن. وتُعرف بوظيفة `DOCS_JOB` وقد جرت فعلًا، لا
 * بغياب الحرّاس: الغياب لسببٍ آخر (سقوط البناء) يبقى ثغرةً كما في القرار 3.
 * والنافذة تُعدّ جولات الحرّاس لا الجولات كلّها، كي لا تُضيّقها التزامات التوثيق.
 *
 * **5. جولةٌ لم تبدأ ليست جولة.** حين يرفض GitHub بدء الوظائف (قيدٌ في حساب
 * المالك: الفوترة أو الحصّة) تُسجَّل الجولة `completed` وكل وظائفها بلا خطوة
 * واحدة. لو عُدّت لصارت ثغرةً لكل حارس فانكسرت السلاسل كلّها عند الالتقاط
 * التالي — قِيس: أربع جولات مرفوضة (2026-09-30) تُنزل الحرّاس الخمسة عشر
 * الحاجبة كلّهم. وحالها حال جولة التوثيق: لا حكم فيها على أي شيفرة، فتُستبعَد.
 *
 * **6. جولةٌ لم تطلب الحرّاس بقرار `ci.yml` ليست جولة حرّاس.** ADR 0026 يقصر الحرّاس
 * على `workflow_dispatch` بشرطٍ على وظيفتها. والأحداث تُقرأ **من ذلك الشرط نفسه**
 * (‏`readGuardEvents`) لا من ثابتٍ هنا، فيبقى القرار صادقًا قبل تطبيق الشرط وبعده:
 * بلا شرط تجري الحرّاس على كل حدث فلا يُستبعَد شيء بهذا القرار. ومع الشرط، جولةٌ
 * حدثُها خارجه **ولم تُصدر فيها وظيفة حارس حكمًا** تُستبعَد؛ ودفعٌ قديم جرت فيه الحرّاس
 * يُعدّ كما كان. والجولة اليدوية التي سقط بناؤها فتخطّت حرّاسها تبقى ثغرةً كما في
 * القرار 3: طُلبت الأدلّة ولم تُجمَع.
 *
 * **7. بصمة الحارس ملفّه وما يستورده من `scripts/`.** منذ النواة المشتركة (`STAGES/17`، ADR 0042)
 * لا يحمل ملفّ الحارس إلا أحكامه، والإقلاع والاتصال والتحميل والارتباط في `scripts/lib/`. فبصمة
 * الملفّ وحده كانت ستجعل النواة بابًا يغيّر الحرّاس كلّهم بلا أن تنكسر سلسلة واحدة — عين ما بُني
 * القرار 2 لمنعه. فتُتبَع الواردات النسبية تعدّيًا ما دامت تحت `scripts/` (‏`guardDeps`)، والبصمة
 * بصمةُ الملفّ وحده إن لم يستورد شيئًا — فيبقى كل سجلٍّ قديم صادقًا — وإلّا `sha1` لأزواج «مسار
 * بصمة» مرتّبة (‏`fingerprintOf`). وشيفرة المنتَج التي يستوردها حارس (‏`src/`) خارجها: الحارس يحكم
 * عليها، وتغيّرها لا يغيّره.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/*
 * تجاوزان بيئيّان — على سابقة `RASD_GATE_BASE` في `gate-a.mjs`.
 *
 * إثبات السالب لا يكون بتشويه ملفّ متتبَّع ثمّ استعادته: تُنسى الاستعادة،
 * وقد وقع فعلًا (‏`§6` صفّ 94). فيُوجَّه الفحص إلى عِدلين ثابتين في
 * `tests/fixtures/ci-ledger/`، ويصير السالب أمرًا يُنسَخ ويُشغَّل لا وصفًا.
 */
const CI_PATH = process.env.RASD_GUARDS_CI
  ? join(root, process.env.RASD_GUARDS_CI)
  : join(root, '.github', 'workflows', 'ci.yml')
const LEDGER_PATH = process.env.RASD_GUARDS_LEDGER
  ? join(root, process.env.RASD_GUARDS_LEDGER)
  : join(root, '.github', 'guards-ledger.json')

/** عتبة الترقية — مصدرها هنا وحده. والسجلّ يحفظ العتبة التي التُقط بها. */
const PROMOTION_STREAK = 10

/** نافذة الحفظ — ضعف العتبة، كي يظهر **لماذا** انكسرت السلسلة لا أنها انكسرت. */
const WINDOW = 20

const REPO = 'iSltanX/rasd'

/** اسم وظيفة مسار التوثيق في `ci.yml` — القرار 4 أعلاه، ويثبت تطابقَه اختبار. */
export const DOCS_JOB = 'توثيق فقط · فحوص ساكنة'

/** جرت وظيفة مسار التوثيق ⇐ لم تطلب الجولة حارسًا. التخطّي يعني أنها جولة كاملة. */
export function isDocsOnlyRun(jobs) {
  return jobs.some((job) => job.name === DOCS_JOB && job.conclusion && job.conclusion !== 'skipped')
}

/**
 * الأحداث التي تجري فيها وظيفة الحرّاس، مقروءةً من شرط `if` على وظيفة `live` في `ci.yml`
 * (القرار 6). `null` ⇐ لا شرط: الحرّاس تجري على كل حدث. وشرطٌ بشكل غير هذا يُرمى خطأً
 * صريحًا لا يُتخطّى — على سنّة ترقيع العمود.
 */
export function readGuardEvents(path = CI_PATH) {
  const yml = readFileSync(path, 'utf8')
  const block = /\n {2}live:\n((?: {4}.*\n|\s*\n)+)/u.exec(yml)?.[1]
  if (!block) throw new Error('لم تُقرأ وظيفة live من ci.yml — تغيّر الشكل؟')
  const cond = /^ {4}if: (.+)$/mu.exec(block)?.[1]
  if (cond === undefined) return null
  const events = [...cond.matchAll(/github\.event_name == '([a-z_]+)'/gu)].map((m) => m[1])
  if (events.length === 0) throw new Error(`شرط وظيفة live غير مفهوم: «${cond}»`)
  return events
}

/** لم تبدأ أي وظيفة: كلّها بلا خطوة واحدة — قيدُ حساب لا حكمٌ على شيفرة (القرار 5). */
export function isUnstartedRun(jobs) {
  return jobs.every((job) => !Array.isArray(job.steps) || job.steps.length === 0)
}

const GUARD_JOB = /verify:([a-z-]+)\s*$/u

/**
 * مصير الجولة في السجلّ: `guards` تُعدّ، وما سواها يُستبعَد كأنه لم يكن.
 * الترتيب مقصود: التوثيق أوّلًا (قراره الأقدم)، ثمّ ما لم يبدأ، ثمّ ما لم يطلب الحرّاس.
 * `guardEvents` من `readGuardEvents`؛ و`null` يُطفئ القرار 6.
 */
export function runDisposition(event, jobs, guardEvents = null) {
  if (isDocsOnlyRun(jobs)) return 'docs'
  if (isUnstartedRun(jobs)) return 'unstarted'
  if (guardEvents && !guardEvents.includes(event)) {
    const judged = jobs.some(
      (job) => GUARD_JOB.test(job.name) && job.conclusion && job.conclusion !== 'skipped',
    )
    if (!judged) return 'no-guards'
  }
  return 'guards'
}

/** صفّ المصفوفة في `ci.yml` — مرسًى على اسم الحارس، فلا يُعاد توليد الملفّ. */
const ROW = (guard) => new RegExp(`(- \\{ guard: ${guard}, blocking: )(true|false)( \\})`, 'u')
const ALL_ROWS = /- \{ guard: ([a-z-]+), blocking: (true|false) \}/gu

// ── قراءة المصدرين ───────────────────────────────────────────────

/** الحرّاس وعمودهم كما في `ci.yml` — المصدر الوحيد لِما هو حاجب اليوم. */
export function readMatrix(path = CI_PATH) {
  const yml = readFileSync(path, 'utf8')
  const rows = [...yml.matchAll(ALL_ROWS)].map(([, guard, blocking]) => ({
    guard,
    blocking: blocking === 'true',
  }))
  if (rows.length === 0) throw new Error('لم يُقرأ أي صفّ مصفوفة من ci.yml — تغيّر الشكل؟')
  return rows
}

/** معرّف كائن git لمحتوى ملفّ — يُحسَب هنا بلا `git`، فيعمل بلا تاريخ. */
export function blobId(path) {
  if (!existsSync(path)) return null
  const body = readFileSync(path)
  return createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex')
}

/**
 * الواردات النسبية في ملفّ — `import … from './x'` و`export … from './x'` و`import './x'` — ومعها
 * سكربتٌ يُشغَّل بمساره النسبي (`new URL('../fixtures-serve.mjs', import.meta.url)`): خادم العيّنات
 * لا يُستورَد بل يُطلَق، وهو من البيئة التي يقيس فيها الحارس.
 */
const RELATIVE_IMPORT =
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]|new URL\(\s*['"](\.{1,2}\/[^'"]+\.m?js)['"]\s*,\s*import\.meta\.url/gmu

/**
 * ملفّ الحارس وكل ما يبلغه باستيرادٍ نسبي **تحت `scripts/`** — مسارات من جذر المستودع، مرتّبة.
 * `read(path)` يعيد نصّ الملفّ أو `null` — من القرص في الفحص، ومن التزامٍ بعينه في الالتقاط.
 */
export function guardDeps(entry, read) {
  const seen = new Set()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue
    const text = read(file)
    if (text === null) continue
    seen.add(file)
    for (const m of text.matchAll(RELATIVE_IMPORT)) {
      const dep = posix.normalize(posix.join(posix.dirname(file), m[1] ?? m[2] ?? m[3]))
      if (dep.startsWith('scripts/')) queue.push(dep)
    }
  }
  return [...seen].sort()
}

/**
 * بصمة الحارس من بصمات ملفّاته. ملفٌّ واحد ⇐ بصمته هو، فالسجلّات السابقة للقرار 7 تبقى مقروءة.
 * `blobs` أزواج `[مسار, بصمة]`؛ وبصمةٌ غائبة تجعل البصمة كلّها غائبة — لا يُحكَم بنصف دليل.
 */
export function fingerprintOf(blobs) {
  if (blobs.length === 0 || blobs.some(([, blob]) => !blob)) return null
  if (blobs.length === 1) return blobs[0][1]
  const lines = blobs.map(([path, blob]) => `${path} ${blob}\n`).join('')
  return createHash('sha1').update(lines).digest('hex')
}

const guardEntry = (guard) => `scripts/verify-${guard}.mjs`

/** بصمة الحارس اليوم، من القرص بلا `git`. */
function guardFingerprint(guard) {
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  return fingerprintOf(
    guardDeps(guardEntry(guard), read).map((rel) => [rel, blobId(join(root, rel))]),
  )
}

// ── الحساب ───────────────────────────────────────────────────────

/**
 * السلسلة الخضراء المتتالية من الأحدث — تتوقّف عند أوّل غير أخضر، أو عند
 * أوّل جولة شُغِّل فيها حارسٌ **غير الحارس الحالي**.
 */
export function streakOf(entry, currentBlob) {
  let n = 0
  for (let i = 0; i < entry.results.length; i++) {
    if (entry.results[i] !== 'green') break
    if (entry.scripts[i] && currentBlob && entry.scripts[i] !== currentBlob) break
    n++
  }
  return n
}

// ── الالتقاط (بشبكة) ─────────────────────────────────────────────

const gh = (args) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** ذاكرة لكل `git` — عشرون حارسًا يتشاركون النواة، فتُقرأ مرّة لكل التزام لا عشرين. */
const gitCache = new Map()
const git = (args) => {
  const key = args.join('\0')
  if (!gitCache.has(key)) {
    try {
      gitCache.set(
        key,
        execFileSync('git', args, {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 16 * 1024 * 1024,
        }),
      )
    } catch {
      gitCache.set(key, null)
    }
  }
  const out = gitCache.get(key)
  if (out === null) throw new Error(`git ${args.join(' ')}`)
  return out
}

/** بصمة الحارس عند التزامٍ بعينه (القرار 7) — تحتاج `git` وتاريخًا، والالتقاط يملكهما. */
function fingerprintAt(sha, guard) {
  const read = (rel) => {
    try {
      return git(['show', `${sha}:${rel}`])
    } catch {
      return null // التزامٌ غير موجود محليًّا، أو ملفّ لم يكن قد وُلد بعد
    }
  }
  const blobAt = (rel) => {
    try {
      return git(['rev-parse', `${sha}:${rel}`]).trim()
    } catch {
      return null
    }
  }
  return fingerprintOf(guardDeps(guardEntry(guard), read).map((rel) => [rel, blobAt(rel)]))
}

async function capture() {
  const matrix = readMatrix()
  const notices = []

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
      // أوسع من النافذة بكثير: جولات التوثيق والمرفوضة والرخيصة تُستبعَد (القرارات 4–6)،
      // والنافذة تُملأ بجولات حرّاس. ومنذ صارت الحرّاس يدوية تفصل بينها دفعاتٌ كثيرة، ونافذةُ
      // ثمانين جولة كانت ستخلو منها يومًا فتُنزل الحاجبة كلّها بلا حكم. وكل جولة تُستبعَد
      // تكلّف نداءً واحدًا، والحلقة تقف عند امتلاء النافذة.
      String(WINDOW * 20),
      '--json',
      'databaseId,headSha,conclusion,status,event,createdAt',
    ]),
  ).filter((r) => r.status === 'completed')

  const guards = Object.fromEntries(matrix.map((m) => [m.guard, { results: [], scripts: [] }]))
  const recorded = []
  const excluded = { docs: 0, unstarted: 0, 'no-guards': 0 }
  const guardEvents = readGuardEvents()

  for (const run of runs) {
    if (recorded.length === WINDOW) break
    // `--jq '.jobs[]'` لا `JSON.parse` على الردّ كلّه: مع `--paginate` تُلصق gh صفحاتٍ متتالية
    // كائناتٍ متجاورة لا تُقرأ JSON واحدًا — وجولةٌ تتجاوز ثلاثين وظيفة تبلغ صفحتين.
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
    const disposition = runDisposition(run.event, jobs, guardEvents)
    if (disposition !== 'guards') {
      excluded[disposition] += 1
      continue
    }
    const byGuard = new Map()
    for (const job of jobs) {
      const m = /verify:([a-z-]+)\s*$/u.exec(job.name)
      if (!m) continue
      if (!guards[m[1]]) {
        notices.push(`وظيفة بلا صفّ في المصفوفة: ${job.name} (جولة ${run.databaseId})`)
        continue
      }
      byGuard.set(m[1], job.conclusion)
    }
    recorded.push({
      id: run.databaseId,
      sha: run.headSha,
      event: run.event,
      createdAt: run.createdAt,
    })
    for (const { guard } of matrix) {
      const c = byGuard.get(guard)
      guards[guard].results.push(classify(c))
      guards[guard].scripts.push(fingerprintAt(run.headSha, guard))
    }
  }

  for (const { guard } of matrix) {
    const entry = guards[guard]
    entry.streak = streakOf(entry, guardFingerprint(guard))
    entry.eligible = entry.streak >= PROMOTION_STREAK
  }

  const ledger = {
    schema: 1,
    repo: REPO,
    promotionStreak: PROMOTION_STREAK,
    window: WINDOW,
    capturedAt: new Date().toISOString(),
    runs: recorded,
    guards,
  }
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n')

  // العمود يُرقَّع موضعيًّا ولا يُعاد توليد الملفّ: نثر `ci.yml` العربي مكتوبٌ
  // بيد ولا مصدر آليّ له، وأداةٌ تولّده كانت ستمحوه أو تخترعه.
  let yml = readFileSync(CI_PATH, 'utf8')
  const flipped = []
  for (const { guard, blocking } of matrix) {
    const want = guards[guard].eligible
    if (want === blocking) continue
    const before = yml
    yml = yml.replace(ROW(guard), `$1${want}$3`)
    if (yml === before) throw new Error(`تعذّر ترقيع صفّ «${guard}» في ci.yml — تغيّر شكله؟`)
    flipped.push(`${guard}: ${blocking} ← ${want}`)
  }
  if (flipped.length > 0) writeFileSync(CI_PATH, yml)

  console.log('\n── سجلّ ترقية الحرّاس ──')
  console.log(
    `  ${recorded.length} جولة حرّاس · مستبعَدة: ${excluded.docs} توثيق · ${excluded.unstarted} لم تبدأ · ${excluded['no-guards']} بلا حرّاس بقرار · العتبة ${PROMOTION_STREAK}`,
  )
  for (const { guard } of matrix) {
    const e = guards[guard]
    console.log(
      `  ${e.eligible ? '✓' : '·'} ${guard.padEnd(14)} سلسلة ${String(e.streak).padStart(2)} · ${e.results.slice(0, WINDOW).join(',')}`,
    )
  }
  if (flipped.length > 0) console.log(`\n  قُلِب العمود: ${flipped.join(' · ')}`)
  for (const n of notices) console.log(`  ⚠ ${n}`)
  console.log('')
}

// ── الفحص (بلا شبكة) ─────────────────────────────────────────────

function check() {
  const problems = []
  const matrix = readMatrix()

  if (!existsSync(LEDGER_PATH)) {
    console.error('✗ لا سجلّ ترقية — شغّل `pnpm guards:sync` أوّلًا.')
    process.exit(1)
  }
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))

  if (ledger.promotionStreak !== PROMOTION_STREAK) {
    problems.push(
      `السجلّ التُقط بعتبة ${ledger.promotionStreak} والعتبة اليوم ${PROMOTION_STREAK} — أعد الالتقاط`,
    )
  }

  const inMatrix = new Set(matrix.map((m) => m.guard))
  const inLedger = new Set(Object.keys(ledger.guards ?? {}))
  for (const g of inMatrix) if (!inLedger.has(g)) problems.push(`حارس في المصفوفة بلا سجلّ: ${g}`)
  for (const g of inLedger) if (!inMatrix.has(g)) problems.push(`سجلّ بلا حارس في المصفوفة: ${g}`)

  for (const { guard, blocking } of matrix) {
    const entry = ledger.guards?.[guard]
    if (!entry) continue
    // السلسلة تُعاد حسابها ولا يُوثَق بالحقل المودَع: قيمةٌ محسوبة مودَعة بلا
    // إعادة حساب هي ختمُ أمانٍ زائف.
    const streak = streakOf(entry, guardFingerprint(guard))
    if (streak !== entry.streak) {
      problems.push(`سلسلة «${guard}» في السجلّ ${entry.streak} والمحسوبة ${streak} — أعد الالتقاط`)
    }
    const eligible = streak >= PROMOTION_STREAK
    if (blocking && !eligible) {
      problems.push(`مُرقّى وغير مؤهَّل: «${guard}» سلسلته ${streak} والعتبة ${PROMOTION_STREAK}`)
    }
    if (!blocking && eligible) {
      problems.push(`مؤهَّل وغير مُرقّى: «${guard}» سلسلته ${streak} — يُقلَب العمود إلى true`)
    }
  }

  if (problems.length > 0) {
    console.error('\n✗ سجلّ الترقية يخالف عمود `blocking`:')
    for (const p of problems) console.error(`  · ${p}`)
    console.error('\n  الإصلاح: `pnpm guards:sync` — يقيس ويكتب الاثنين معًا.\n')
    process.exit(1)
  }

  const blocking = matrix.filter((m) => m.blocking).map((m) => m.guard)
  console.log(
    `✓ سجلّ الترقية يطابق ci.yml — ${blocking.length} حارسًا حاجبًا` +
      (blocking.length > 0 ? `: ${blocking.join(' · ')}` : ' (لا حارس حاجب بعد)'),
  )
}

/**
 * تصنيف نتيجة وظيفة إلى حالات السجلّ الثلاث.
 *
 * `undefined` ⇐ الوظيفة لم تكن في الجولة أصلًا (ثغرة)، و`success` وحدها
 * خضراء — و`cancelled` حمراءُ لا ثغرة: الإلغاء وقع فعلًا وأخفى نتيجةً.
 */
export function classify(conclusion) {
  if (conclusion === undefined || conclusion === 'skipped' || conclusion === 'cancelled') {
    return 'hole'
  }
  return conclusion === 'success' ? 'green' : 'red'
}

/** لا يُشغَّل شيء عند الاستيراد — كي تُختبَر الدوالّ الخالصة وحدها. */
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) {
  process.argv.includes('--check') ? check() : await capture()
}
