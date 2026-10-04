#!/usr/bin/env node
/**
 * بوّابة الموجة وفحص المرحلة في كروم حقيقي — **الحكم المحلّي على ما يصل `main`** (ADR 0026).
 *
 * لا يفحص شيئًا بنفسه: يقرّر **أيّ** سكربتات `verify:*` تلزم ويشغّلها واحدًا واحدًا، كلٌّ مرّة،
 * ويعيد الساقط مرّة واحدة (الإعادة محلّيًّا مجّانية)، ثمّ يطبع خلاصة. ولا يمسّ
 * `scripts/verify-*.mjs` — اسمه خارج ذلك النمط عمدًا، فلا يُحسَب حارسًا ولا يُثبَّت في سجلّ الترقية.
 *
 *   pnpm verify:wave --base origin/main     فحص التغيير: مخروط الأثر وحده
 *   pnpm verify:wave --base origin/main --size all          كل الحرّاس (قبل إصدار)
 *   pnpm verify:wave --base origin/main --list              يطبع الخطّة ولا يشغّل شيئًا
 *   pnpm verify:wave --base origin/main --only colour,measure   حرّاسٌ بأسمائها أثناء الدفعة، بالقفل نفسه
 *   pnpm verify:wave --base origin/main --firefox   ثمّ حرّاس Firefox كلّها (`verify:firefox`) بعد حرّاس كروم
 *
 * الأحجام: `cone` مخروط الأثر (`impact.mjs`)، وملفٌّ خارج جدوله يرفعه إلى `all` · `blocking` المخروط
 * ومعه الحاجبة في `ci.yml` · `all` كل `verify:*` في `package.json` عدا `dist` و`tokens` و`wave`.
 *
 * **قفلٌ على الجهاز كلّه — منفذٌ لا ملفّ.** الحرّاس تفتح كروم على منافذ ثابتة يتشاركها بعضها
 * (`colour` و`compare` على 9341، و`gate` و`palette` على 9347) وخادم العيّنات على 5399، فحارسان من
 * جلستين معًا يُسقطان أحدهما سقوطًا لا صلة له بالشيفرة. والقفل **منفذ TCP محلّي** (`LOCK_PORT`)
 * يمسكه هذا السكربت ما دام يشغّل حارسًا: النواة وحدها تمنح الربط لعملية واحدة، وتحرّره حين تموت
 * العملية بأي طريقة — فلا سباق على ملفّ نصف مكتوب، ولا قفل متروك يُسترَدّ، ولا معرّف عملية يُعاد
 * استعماله. قِيس أن قفل الملفّ السابق (`wx` ثمّ استرداد المتروك) أعطى 15 تداخلًا في 25 جولة لثمانية
 * متنافسين (المراجعة المستقلّة، الصفّ 151).
 *
 * **مهلة لكل حارس، وإيقافٌ يُحترَم.** كل حارس في مجموعة عمليات مستقلّة بمهلة ست دقائق (سقف خطوته في
 * `ci.yml`: قِيس تعليقُ `verify:load` عشرين دقيقة). والمهلة أو `Ctrl-C` تقتل المجموعة كلّها — pnpm وnode
 * وكروم — فلا يبقى حارسٌ معلّقًا يحبس القفل عن الجلسات الأخرى، ولا يُعاد حارسٌ أوقفه صاحبه.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { readMatrix } from './guards-sync.mjs'
import { changedFiles, coneOf } from './impact.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** منفذ القفل — خارج منافذ الحرّاس (9333–9388) وخادم العيّنات (5399). */
export const LOCK_PORT = Number(process.env.RASD_GUARDS_LOCK_PORT ?? 9329)

/** مهلة الحارس الواحد — مرآة `timeout-minutes: 6` على خطوة الحارس في `ci.yml`. */
const GUARD_TIMEOUT_MS = Number(process.env.RASD_GUARD_TIMEOUT_MS ?? 6 * 60 * 1000)

/**
 * سكربتات `verify:*` ليست حرّاس كروم: `dist` و`tokens` في البوّابة A، و`wave` هذا نفسه، و`firefox` منسّق طائفة
 * Firefox (`firefox-verify.mjs`، SS7) — حرّاسها خارج `allGuards` فلا يطول زمن بوّابة كروم ولا تتغيّر قائمتها.
 */
const NOT_GUARDS = new Set(['dist', 'tokens', 'wave', 'firefox'])

/** مدخلات الحزمة — حزمةٌ أقدم من أحدثها تُفحَص كأنها الشيفرة وليست هي. */
const BUILD_INPUTS = [
  'src',
  'public',
  'manifest.config.ts',
  'vite.config.ts',
  'vite.content.config.ts',
  'package.json',
  'pnpm-lock.yaml',
]

/** كل حارس كروم معرَّف في `package.json` — مصدر `all`، فيشمل حارسًا أُضيف ولم يدخل `ci.yml` بعد. */
export function allGuards(pkg) {
  return Object.keys(pkg.scripts ?? {})
    .map((name) => /^verify:(.+)$/u.exec(name)?.[1])
    .filter((guard) => guard && !NOT_GUARDS.has(guard))
    .sort()
}

/**
 * الحرّاس اللازمة لحجمٍ ومخروط — دالّة خالصة يختبرها `tests/unit/wave-verify.test.ts`.
 * `cone.needed` بأسماء السكربتات (`verify:x`) كما يطبعها المخروط.
 */
export function planGuards({ size, cone, all, blocking, only = [] }) {
  if (only.length > 0) return [...new Set(only)].filter((guard) => all.includes(guard)).sort()
  const fromCone = cone.needed.map((script) => script.replace(/^verify:/u, ''))
  const wide = size === 'all' || cone.unmapped > 0
  const picked = new Set(wide ? all : fromCone)
  if (size === 'blocking') for (const guard of blocking) picked.add(guard)
  return [...picked].filter((guard) => all.includes(guard)).sort()
}

/**
 * حكم الحارس بعد محاولتيه. نجاحٌ عند الإعادة مقبولٌ **لحارسٍ معروف التقطّع وحده** (جدول `Docs/Flaky.md`)؛
 * ولغيره عَرَضٌ جديد يُحقَّق فيه قبل الدمج (`AGENTS.md` §4) — فيُسقط البوّابة ولا يمرّ سطرًا.
 */
export function verdict(first, second, knownFlaky) {
  if (first) return 'green'
  if (second === undefined) return 'red'
  if (!second) return 'red'
  return knownFlaky ? 'flaky' : 'unrecorded'
}

// ── القفل ────────────────────────────────────────────────────────

/**
 * يحاول ربط منفذ القفل مرّة: الخادم إن نجح، و`null` إن كان مأخوذًا. الخادم يجيب كل اتّصال بهويّة
 * ماسكه ثمّ يغلقه، ولا يُبقي العملية حيّةً وحده (`unref`).
 */
export function tryLock(port = LOCK_PORT, holder = { pid: process.pid, cwd: root }) {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      socket.end(`${JSON.stringify({ ...holder, at: new Date() })}\n`)
    })
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(null)
      else reject(error)
    })
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.unref()
      resolve(server)
    })
  })
}

/** هويّة ماسك القفل كما يعلنها — أو `null` إن لم يُجب في ثانية (حارسٌ يشغل حلقة الأحداث). */
function lockHolder(port = LOCK_PORT) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    let data = ''
    const done = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1000, () => done(null))
    socket.on('data', (chunk) => (data += chunk))
    socket.on('end', () => {
      try {
        done(JSON.parse(data))
      } catch {
        done(null)
      }
    })
    socket.on('error', () => done(null))
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function acquire() {
  let announced = false
  for (;;) {
    const server = await tryLock()
    if (server) return server
    if (!announced) {
      const holder = await lockHolder()
      console.log(
        `  ⏳ حرّاس كروم تجري في جلسة أخرى${holder ? ` (${holder.cwd})` : ''} — انتظار القفل…`,
      )
      announced = true
    }
    await sleep(5000)
  }
}

// ── التشغيل ──────────────────────────────────────────────────────

/** قيمة وسيط؛ ووسيطٌ بلا قيمة خطأٌ صريح لا يسقط صامتًا إلى الافتراض. */
function argument(name) {
  const at = process.argv.indexOf(`--${name}`)
  if (at === -1) return undefined
  const value = process.argv[at + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`✗ --${name} بلا قيمة.`)
    process.exit(1)
  }
  return value
}

/** الحرّاس المعروف تقطّعها — عمودها الأوّل في جدول «مرجع الأعطال المتقطّعة المعروفة» في `Docs/Flaky.md`. */
function knownFlaky() {
  const text = readFileSync(join(root, 'Docs', 'Flaky.md'), 'utf8')
  const at = text.indexOf('مرجع الأعطال المتقطّعة المعروفة')
  if (at === -1) return new Map()
  const rows = text
    .slice(at)
    .split('\n')
    .filter((line) => /^\| `[a-z-]+` /u.test(line))
  return new Map(
    rows.map((line) => {
      const cells = line.split('|').map((cell) => cell.trim())
      return [cells[1].replace(/`/gu, ''), cells[3]]
    }),
  )
}

/** أحدث تعديل بين مدخلات الحزمة، بالملّي ثانية. */
function newestInput() {
  let newest = 0
  const visit = (path) => {
    if (!existsSync(path)) return
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name))
    } else if (stat.mtimeMs > newest) newest = stat.mtimeMs
  }
  for (const input of BUILD_INPUTS) visit(join(root, input))
  return newest
}

/** الحارس الجاري — كي يقتله الإيقاف مع مجموعته. */
let current = null

const killGroup = (child) => {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // انتهت المجموعة قبلنا
  }
}

function runGuard(guard) {
  const started = Date.now()
  return new Promise((resolve) => {
    let output = ''
    let timedOut = false
    let failure = ''
    const child = spawn('pnpm', ['run', `verify:${guard}`], {
      cwd: root,
      detached: true, // مجموعة عمليات مستقلّة: المهلة والإيقاف يقتلان pnpm وnode وكروم معًا
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    current = child
    const keep = (chunk) => {
      output = (output + chunk).slice(-64 * 1024)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child)
    }, GUARD_TIMEOUT_MS)
    child.on('error', (error) => {
      failure = `تعذّر تشغيل pnpm: ${error.message}`
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      current = null
      const lines = output.trim().split('\n').slice(-20)
      if (timedOut)
        lines.push(`تجاوز المهلة (${Math.round(GUARD_TIMEOUT_MS / 1000)} ثانية) — قُتلت مجموعته`)
      if (failure) lines.push(failure)
      resolve({
        ok: code === 0 && !timedOut && !failure,
        seconds: Math.round((Date.now() - started) / 1000),
        tail: lines.join('\n'),
      })
    })
  })
}

async function main() {
  // `--wave NN` (الأساس والحجم من خطّة الموجات) خرج مع الخطّة نفسها إلى أرشيف التخطيط (2026-10-04)؛ الأساس صريحٌ دائمًا.
  const base = argument('base')
  if (!base) {
    console.error('✗ مرّر --base <مرجع> (مثلًا origin/main).')
    process.exit(1)
  }
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    })
  } catch {
    console.error(`✗ المرجع «${base}» غير موجود — git fetch origin --tags؟`)
    process.exit(1)
  }
  const size = argument('size') ?? 'cone'
  if (!['all', 'blocking', 'cone'].includes(size)) {
    console.error(`✗ حجم غير معروف «${size}» — all · blocking · cone.`)
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const all = allGuards(pkg)
  const blocking = readMatrix()
    .filter((row) => row.blocking)
    .map((row) => row.guard)
  const files = changedFiles(base)
  const cone = coneOf(files)
  const only = (argument('only') ?? '')
    .split(',')
    .map((guard) => guard.trim().replace(/^verify:/u, ''))
    .filter(Boolean)
  const unknown = only.filter((guard) => !all.includes(guard))
  if (unknown.length > 0) {
    console.error(`✗ لا حارس بهذا الاسم في package.json: ${unknown.join(' · ')}`)
    process.exit(1)
  }
  const guards = planGuards({ size, cone, all, blocking, only })

  console.log('\n── بوّابة الموجة: حرّاس كروم ──')
  console.log(
    `  الأساس: ${base} · الحجم: ${only.length > 0 ? `بالاسم (${only.join(' · ')})` : size} · ملفّات متغيّرة: ${files.length}`,
  )
  console.log(
    `  المخروط: ${cone.needed.length > 0 ? cone.needed.join(' · ') : 'لا شيء'}${cone.unmapped > 0 ? ` · ${cone.unmapped} ملفًّا خارج جدوله ⇐ all` : ''}`,
  )
  console.log(`  الحرّاس (${guards.length}): ${guards.length > 0 ? guards.join(' · ') : '—'}`)
  const firefox = process.argv.includes('--firefox')
  if (firefox) console.log('  ثمّ حرّاس Firefox: pnpm verify:firefox')
  if (process.argv.includes('--list')) return
  if (guards.length === 0) {
    console.log('\n✓ لا حارس كروم يلزم لهذا التغيير.\n')
    if (firefox) process.exit(await runFirefox())
    return
  }
  const manifest = join(root, 'dist', 'manifest.json')
  if (!existsSync(manifest) || statSync(manifest).mtimeMs < newestInput()) {
    console.error(
      `\n✗ ${existsSync(manifest) ? 'الحزمة في dist/ أقدم من مصدرها' : 'لا حزمة مبنيّة في dist/'} — شغّل RASD_GATE_BASE=${base} pnpm gate:a أوّلًا.\n`,
    )
    process.exit(1)
  }

  await acquire()
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.on(signal, () => {
      if (current) killGroup(current)
      console.error(`\n✗ أُوقفت بوّابة الموجة (${signal}) — لا حكم.\n`)
      process.exit(code)
    })
  }

  const flaky = knownFlaky()
  const results = []
  const started = Date.now()
  for (const guard of guards) {
    const first = await runGuard(guard)
    let run = first
    let second
    if (!first.ok) {
      console.log(`  ↻ ${guard} سقط (${first.seconds}s) — إعادة واحدة:\n${indent(first.tail)}`)
      run = await runGuard(guard)
      second = run.ok
    }
    const outcome = verdict(first.ok, second, flaky.has(guard))
    results.push({ guard, outcome, ...run, firstTail: first.tail })
    const mark = { green: '✓', flaky: '≈', unrecorded: '✗', red: '✗' }[outcome]
    console.log(`  ${mark} ${guard.padEnd(14)} ${run.seconds}s`)
  }

  const minutes = ((Date.now() - started) / 60000).toFixed(1)
  const failed = results.filter((r) => r.outcome === 'red' || r.outcome === 'unrecorded')
  console.log(
    `\n  ${results.length} حارسًا في ${minutes} دقيقة · أخضر ${results.length - failed.length}`,
  )
  for (const r of results.filter((r) => r.outcome === 'flaky')) {
    console.log(
      `  ≈ ${r.guard}: سقط ثمّ نجح عند الإعادة، ومعروف التقطّع في Docs/Flaky.md — قارن العَرَض أعلاه بالمسجَّل (${flaky.get(r.guard)})، وسطرٌ في سجلّ التغيير`,
    )
  }
  for (const r of failed) {
    if (r.outcome === 'unrecorded') {
      console.error(
        `\n  ✗ ${r.guard} سقط ثمّ نجح عند الإعادة، وليس في جدول المتقطّعة في Docs/Flaky.md — عَرَضٌ جديد يُحقَّق فيه قبل الدمج:\n${indent(r.firstTail)}`,
      )
      continue
    }
    console.error(`\n  ✗ ${r.guard} سقط مرّتين:\n${indent(r.tail)}`)
    if (flaky.has(r.guard)) {
      console.error(
        `    معروف التقطّع — العَرَض المسجَّل: ${flaky.get(r.guard)}\n    طابق العَرَض والمدى ⇐ يُسجَّل ويُترك لـ04 · عَرَضٌ جديد ⇐ يُحقَّق فيه قبل الدمج.`,
      )
    }
  }
  // حرّاس Firefox بعد كروم ولو سقط كروم: الخلاصتان معًا خيرٌ من جولةٍ ثانية لتُعرف الأخرى.
  const firefoxCode = firefox ? await runFirefox() : 0
  if (failed.length > 0) {
    console.error(
      `\n✗ بوّابة الموجة: ${failed.length} حارسًا أحمر — ${failed.map((r) => r.guard).join(' · ')}\n`,
    )
    process.exit(1)
  }
  if (firefoxCode !== 0) {
    console.error('\n✗ بوّابة الموجة: حرّاس كروم خضراء وحرّاس Firefox حمراء — الخلاصة أعلاه.\n')
    process.exit(firefoxCode)
  }
  console.log(`\n✓ حرّاس بوّابة الموجة خضراء${firefox ? ' — كروم وFirefox' : ''}.\n`)
}

/**
 * `--firefox`: منسّق طائفة Firefox بقفله ومنافذه (`firefox-verify.mjs`) — خَرْجه يُطبع كما هو، ورمز خروجه الحكم.
 * لا يمسك قفل كروم شيئًا يحتاجه: المنافذ والعيّنات منفصلة.
 */
function runFirefox() {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['run', 'verify:firefox'], { cwd: root, stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

const indent = (text) =>
  text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n')

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) await main()
