#!/usr/bin/env node
/**
 * مسارات المنتج الأربعة من طرف إلى طرف في كروم حقيقي بالكثافتين 1 و2 (`STAGES/18`، ADR 0045).
 *
 *   pnpm test:e2e                    المشروعان `dpr-1` و`dpr-2` كلاهما
 *   pnpm test:e2e --runs 10          عشر تشغيلات كاملة تُعدّ وتُلخَّص — معيار «صفر تقطّع»
 *   pnpm test:e2e --project dpr-2    كثافةٌ واحدة؛ وكل ما بعد ذلك يمرّ إلى `playwright test` كما هو
 *   pnpm test:e2e -g «التقاط»        مسارٌ بعينه
 *
 * **لا يفحص شيئًا بنفسه**: يجهّز البيئة ويشغّل `playwright test` ويعيد رمز خروجه. وما يجهّزه ثلاثة:
 *
 * 1. **الحزمة مبنيّة.** تُفحص كما في الحرّاس — `dist/manifest.json` و`dist/content.js` — وغيابها خروجٌ
 *    بـ1 لا بناءٌ صامت: ما يُفحَص هو ما بُني، وبناءٌ داخل الفاحص كان سيُخفي حزمةً قديمة.
 * 2. **القفل نفسه الذي تأخذه `pnpm verify:wave`.** كروم هنا يشارك الحرّاس خادمَ العيّنات (5399) وسطحَ
 *    الجهاز، فجولتان معًا تُسقطان إحداهما سقوطًا لا صلة له بالشيفرة. والمنفذ نفسه (`LOCK_PORT`) فينتظر
 *    كلٌّ الآخر — لا قفلٌ ثانٍ يُنسى.
 * 3. **خادم العيّنات حيٌّ** (`ensureFixturesServer`): يُعاد استعماله إن وُجد، ويُطلَق ويُوقَف إن لم يوجد.
 *
 * وعلى الجهاز كلّه كروم واحد في كل مرّة: منفذ التنقيح يُختار حرًّا (`0`) لا ثابتًا، فلا يتصادم مع حارسٍ
 * جارٍ ولا مع كرومٍ يتيم من جولة سابقة.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { DIST, ensureFixturesServer, findChrome } from './lib/cdp.mjs'
import { summarise } from './test-repeat.mjs'
import { LOCK_PORT, tryLock } from './wave-verify.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const CONFIG = join(root, 'tests', 'e2e', 'playwright.config.mjs')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** يفصل `--runs N` الخاصّ بهذا السكربت عمّا يمرّ إلى Playwright. */
export function parseArgs(argv) {
  const rest = []
  let runs = 1
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') {
      const n = Number(argv[i + 1])
      if (!Number.isInteger(n) || n < 1) {
        console.error('--runs يأخذ عددًا صحيحًا موجبًا.')
        process.exit(2)
      }
      runs = n
      i++
    } else rest.push(argv[i])
  }
  return { runs, passthrough: rest }
}

/**
 * يقرأ تقرير Playwright بصيغة JSON: العدد، وأسماء الساقط. **المتخطّى لا يُعدّ نجاحًا**: مسارٌ تخطّاه
 * الاختبار بسببٍ يُقرأ في الخلاصة، ولا يُحسب ضمن «الأخضر» الذي يثبت شيئًا.
 */
export function readReport(report) {
  const failed = []
  let total = 0
  let skipped = 0
  const walk = (suite, titles) => {
    const here = suite.title ? [...titles, suite.title] : titles
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        total++
        const last = t.results?.at(-1)
        if (t.status === 'skipped') skipped++
        else if (t.status !== 'expected' || last?.status !== 'passed') {
          failed.push([...here, spec.title, t.projectName].filter(Boolean).join(' › '))
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, here)
  }
  for (const suite of report.suites ?? []) walk(suite, [])
  for (const e of report.errors ?? []) failed.push(`(خطأ تشغيل: ${String(e.message).split('\n')[0]})`)
  return { total, skipped, failed }
}

async function acquire() {
  let announced = false
  for (;;) {
    const server = await tryLock()
    if (server) return server
    if (!announced) {
      console.log('  ⏳ كروم يعمل في جلسة أخرى — انتظار القفل…')
      announced = true
    }
    await sleep(5000)
  }
}

function runPlaywright(args, env) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '-c', CONFIG, ...args],
      { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } },
    )
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)))
  })
}

async function main() {
  const { runs, passthrough } = parseArgs(process.argv.slice(2))

  for (const file of ['manifest.json', 'content.js']) {
    if (!existsSync(join(DIST, file))) {
      console.error(`dist/${file} غير موجود — شغّل \`pnpm build:bundle\` أولًا.`)
      process.exit(1)
    }
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
    process.exit(1)
  }

  const lock = await acquire()
  let fixtures = null
  const release = () => {
    fixtures?.stop()
    lock.close()
  }
  process.once('SIGINT', () => {
    release()
    process.exit(130)
  })

  try {
    fixtures = await ensureFixturesServer()
    const env = { RASD_E2E_CHROME: chrome, RASD_E2E_FIXTURES: fixtures.url.replace(/\/$/, '') }

    if (runs === 1) {
      process.exitCode = await runPlaywright(passthrough, env)
      return
    }

    // قياس التقطّع: كل تشغيل كامل بتقريره، **ولا يتوقّف عند أوّل سقوط** — التقطّع هو المطلوب.
    const dir = mkdtempSync(join(tmpdir(), 'rasd-e2e-repeat-'))
    const results = []
    console.log(`\nقياس التقطّع — pnpm test:e2e × ${String(runs)}:`)
    try {
      for (let i = 1; i <= runs; i++) {
        const out = join(dir, `run-${String(i)}.json`)
        const started = Date.now()
        const code = await runPlaywright(['--reporter=json', ...passthrough], {
          ...env,
          RASD_E2E_JSON: out,
          PLAYWRIGHT_JSON_OUTPUT_NAME: out,
        })
        let run
        try {
          run = readReport(JSON.parse(readFileSync(out, 'utf8')))
        } catch {
          run = { total: 0, skipped: 0, failed: [], error: `لم يُكتب التقرير (خروج ${String(code)})` }
        }
        results.push(run)
        const seconds = ((Date.now() - started) / 1000).toFixed(1)
        const verdict = run.error
          ? `✗ ${run.error}`
          : run.failed.length === 0 && code === 0
            ? `✓ ${String(run.total - run.skipped)} مسارًا${run.skipped ? ` · ${String(run.skipped)} متخطّى` : ''}`
            : `✗ ${String(run.failed.length)} ساقط من ${String(run.total)}`
        console.log(`  ${String(i).padStart(2)}/${String(runs)}  ${verdict}  (${seconds} ث)`)
        for (const name of run.failed) console.log(`         ↳ ${name}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const summary = summarise(results)
    console.log(
      `\n  الخلاصة: ${String(summary.green)}/${String(summary.runs)} أخضر · أطول سلسلة متتالية ${String(summary.longestStreak)}`,
    )
    for (const f of summary.flaky)
      console.log(`  متقطّع: ${f.name} — سقط ${String(f.times)} من ${String(summary.runs)}`)
    process.exitCode = summary.allGreen ? 0 : 1
  } finally {
    release()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
