#!/usr/bin/env node
/**
 * منسّق حرّاس Firefox — نظير `wave-verify.mjs` لطائفة `scripts/firefox/` (SS7، `Docs/Browsers/Architecture.md` §4.9).
 *
 *   pnpm verify:firefox                       كل الحرّاس بترتيب القيمة
 *   pnpm verify:firefox --only load,popup     حرّاسٌ بأسمائها، بالقفل نفسه
 *   pnpm verify:firefox --list                يطبع الخطّة ولا يشغّل شيئًا
 *   pnpm verify:wave --base ss-C/base --firefox   حرّاس كروم ثمّ هذا
 *
 * **ليس حارسًا ولا يدخل `allGuards`.** اسمه `verify:firefox` و`wave-verify.mjs` يستثنيه بالاسم، والحرّاس نفسها
 * تحت `firefox:<name>` لا `verify:<name>` — فلا يطول زمن بوّابة Chromium بحارسٍ واحد ولا تتغيّر قائمتها، ولا يدخل
 * حارس Firefox سجلّ ترقية كروم (`.github/guards-ledger.json`). سجلّه في `.github/firefox-guards-ledger.json`
 * (`scripts/firefox-ledger.mjs`، ADR 0059).
 *
 * **قفلٌ خاصّ ومنافذ خاصّة.** القفل منفذ TCP كقفل كروم (`tryLock` منه) لكن على 9228 لا 9329: حرّاس Firefox على
 * منافذ BiDi 9231–9244 وعيّناتها على 5420، فلا تصطدم بحرّاس كروم وتجري الطائفتان معًا من جلستين. ومهلة لكل
 * حارس ست دقائق في مجموعة عمليات مستقلّة، وإعادةٌ واحدة للساقط — والنجاح عند الإعادة **عَرَضٌ جديد يُحقَّق فيه**
 * (`verdict` من `wave-verify.mjs`): لا جدول تقطّعٍ معروف لحرّاس Firefox بعد.
 *
 * **يبني `dist-firefox/` إن كان أقدم من مصدره** — البناء حتمي وثوانٍ معدودة، ولا شيء آخر يبنيه في البوّابة A.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { tryLock, verdict } from './wave-verify.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** منفذ القفل — غير قفل كروم (9329) وخارج منافذ BiDi (9231–9244). */
export const FIREFOX_LOCK_PORT = Number(process.env.RASD_FIREFOX_LOCK_PORT ?? 9228)

/** مهلة الحارس الواحد — مرآة `timeout-minutes: 6` على خطوته في وظيفة `firefox` في `ci.yml`. */
const GUARD_TIMEOUT_MS = Number(process.env.RASD_GUARD_TIMEOUT_MS ?? 6 * 60 * 1000)

/**
 * ترتيب القيمة (`Architecture.md` §4.9): ما يسقط أوّلًا يُسقط ما بعده — حزمةٌ لا تُثبَّت لا تُفحص نافذتها.
 * والقائمة مصدر الترتيب لا مصدر الوجود: الحارس موجود إن كان له `firefox:<name>` في `package.json`.
 */
export const ORDER = [
  'load',
  'popup',
  'activate',
  'measure',
  'inspect',
  'colour',
  'capture',
  'fullpage',
  'editor',
  'export',
  'library',
  'report',
  'lifecycle',
  'network',
]

/** حرّاس Firefox المعرَّفة في `package.json` (`firefox:<name>`) بترتيب القيمة، وما ليس في الترتيب آخرًا. */
export function firefoxGuards(pkg) {
  const defined = Object.keys(pkg.scripts ?? {})
    .map((name) => /^firefox:([a-z-]+)$/u.exec(name)?.[1])
    .filter(Boolean)
  const rank = (guard) => (ORDER.includes(guard) ? ORDER.indexOf(guard) : ORDER.length)
  return defined.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** مدخلات `dist-firefox/` — كقائمة `wave-verify.mjs`. */
const BUILD_INPUTS = [
  'src',
  'public',
  'manifest.config.ts',
  'vite.config.ts',
  'vite.content.config.ts',
  'package.json',
  'pnpm-lock.yaml',
]

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function acquire() {
  let announced = false
  for (;;) {
    const server = await tryLock(FIREFOX_LOCK_PORT)
    if (server) return server
    if (!announced) {
      console.log('  ⏳ حرّاس Firefox تجري في جلسة أخرى — انتظار القفل…')
      announced = true
    }
    await sleep(5000)
  }
}

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
    const child = spawn('pnpm', ['run', `firefox:${guard}`], {
      cwd: root,
      detached: true,
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
      const lines = output.trim().split('\n').slice(-24)
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

const indent = (text) =>
  text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n')

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const all = firefoxGuards(pkg)
  const only = (argument('only') ?? '')
    .split(',')
    .map((guard) => guard.trim().replace(/^firefox:/u, ''))
    .filter(Boolean)
  const unknown = only.filter((guard) => !all.includes(guard))
  if (unknown.length > 0) {
    console.error(`✗ لا حارس Firefox بهذا الاسم في package.json: ${unknown.join(' · ')}`)
    process.exit(1)
  }
  const guards = only.length > 0 ? all.filter((guard) => only.includes(guard)) : all

  console.log('\n── حرّاس Firefox ──')
  console.log(`  الحرّاس (${guards.length}): ${guards.join(' · ') || '—'}`)
  if (process.argv.includes('--list') || guards.length === 0) return

  const manifest = join(root, 'dist-firefox', 'manifest.json')
  if (!existsSync(manifest) || statSync(manifest).mtimeMs < newestInput()) {
    console.log(
      `  ${existsSync(manifest) ? 'dist-firefox/ أقدم من مصدره' : 'لا dist-firefox/'} — pnpm build:firefox`,
    )
    try {
      execFileSync('pnpm', ['run', 'build:firefox'], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'inherit'],
      })
    } catch {
      console.error('\n✗ بناء dist-firefox/ سقط — لا حزمة يفحصها حارس.\n')
      process.exit(1)
    }
  }

  await acquire()
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.on(signal, () => {
      if (current) killGroup(current)
      console.error(`\n✗ أُوقفت حرّاس Firefox (${signal}) — لا حكم.\n`)
      process.exit(code)
    })
  }

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
    const outcome = verdict(first.ok, second, false)
    results.push({ guard, outcome, ...run, firstTail: first.tail })
    console.log(`  ${outcome === 'green' ? '✓' : '✗'} ${guard.padEnd(12)} ${run.seconds}s`)
  }

  const minutes = ((Date.now() - started) / 60000).toFixed(1)
  const failed = results.filter((r) => r.outcome !== 'green')
  console.log(
    `\n  ${results.length} حارسًا في ${minutes} دقيقة · أخضر ${results.length - failed.length}`,
  )
  for (const r of failed) {
    if (r.outcome === 'unrecorded') {
      console.error(
        `\n  ✗ ${r.guard} سقط ثمّ نجح عند الإعادة — عَرَضٌ جديد يُحقَّق فيه:\n${indent(r.firstTail)}`,
      )
    } else {
      console.error(`\n  ✗ ${r.guard} سقط مرّتين:\n${indent(r.tail)}`)
    }
  }
  if (failed.length > 0) {
    console.error(
      `\n✗ حرّاس Firefox: ${failed.length} أحمر — ${failed.map((r) => r.guard).join(' · ')}\n`,
    )
    process.exit(1)
  }
  console.log('\n✓ حرّاس Firefox خضراء.\n')
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) await main()
