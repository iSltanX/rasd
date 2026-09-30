#!/usr/bin/env node
/**
 * قياس التقطّع — `pnpm test` عشر مرّات، يعدّ ويطبع (`STAGES/16`، معيار القبول الأوّل).
 *
 *   pnpm test:repeat            عشر تشغيلات
 *   pnpm test:repeat --runs 3   عدد آخر
 *
 * كل تشغيلٍ هو `pnpm run test` نفسه بمراسل JSON إلى ملفّ مؤقّت، فيُقرأ منه العدد والساقط بأسمائه لا
 * من نصّ الطرفية. **لا يتوقّف عند أوّل سقوط**: الغاية قياس التقطّع، واختبارٌ يسقط في التشغيل الثالث
 * وينجح في البقية هو بالضبط ما يُبحث عنه. ويخرج بغير صفر إن لم تكن التشغيلات كلّها خضراء.
 *
 * لا يلمس Chrome ولا الحرّاس: اختبارات vitest وحدها، فلا قفل يُؤخذ ولا منفذ يُحجز.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * خلاصة التشغيلات — دالّة خالصة، مختبَرة في `tests/unit/test-repeat.test.ts`.
 *
 * `runs`: لكل تشغيل عدد الاختبارات، وأسماء الساقطة، وخطأ تشغيلٍ إن لم يكتمل (ملفّ JSON غائب).
 * «المتتالية» أطول سلسلة خضراء متّصلة — عشرٌ من عشر هي وحدها «أخضر عشر مرّات متتالية».
 */
export function summarise(runs) {
  const failures = new Map()
  let streak = 0
  let longest = 0
  for (const run of runs) {
    const green = !run.error && run.failed.length === 0 && run.total > 0
    streak = green ? streak + 1 : 0
    longest = Math.max(longest, streak)
    for (const name of run.failed) failures.set(name, (failures.get(name) ?? 0) + 1)
  }
  const greenRuns = runs.filter((r) => !r.error && r.failed.length === 0 && r.total > 0).length
  return {
    runs: runs.length,
    green: greenRuns,
    longestStreak: longest,
    allGreen: runs.length > 0 && greenRuns === runs.length,
    flaky: [...failures]
      .map(([name, times]) => ({ name, times }))
      .sort((a, b) => b.times - a.times),
  }
}

/** يقرأ تقرير vitest بصيغة JSON: العدد، وأسماء الساقطة بمساراتها. */
export function readReport(report) {
  const failed = []
  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      if (test.status === 'failed') {
        failed.push(`${file.name.replace(`${root}`, '')} › ${test.fullName}`)
      }
    }
    // ملفٌّ سقط قبل أن تبدأ اختباراته (خطأ استيراد) لا يحمل `assertionResults` ساقطة.
    if (
      file.status === 'failed' &&
      (file.assertionResults ?? []).every((t) => t.status !== 'failed')
    ) {
      failed.push(
        `${file.name.replace(`${root}`, '')} › (فشل الملفّ: ${file.message ?? 'بلا رسالة'})`,
      )
    }
  }
  return { total: report.numTotalTests ?? 0, failed }
}

function parseRuns(argv) {
  const at = argv.indexOf('--runs')
  if (at === -1) return 10
  const n = Number(argv[at + 1])
  if (!Number.isInteger(n) || n < 1) {
    console.error('--runs يأخذ عددًا صحيحًا موجبًا.')
    process.exit(2)
  }
  return n
}

function main() {
  const count = parseRuns(process.argv.slice(2))
  const dir = mkdtempSync(join(tmpdir(), 'rasd-test-repeat-'))
  const runs = []
  console.log(`\nقياس التقطّع — pnpm test × ${String(count)}:`)
  try {
    for (let i = 1; i <= count; i++) {
      const out = join(dir, `run-${String(i)}.json`)
      const started = Date.now()
      const child = spawnSync('pnpm', ['run', 'test', '--reporter=json', `--outputFile=${out}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      let run
      try {
        run = readReport(JSON.parse(readFileSync(out, 'utf8')))
      } catch {
        run = {
          total: 0,
          failed: [],
          error: `لم يُكتب التقرير (خروج ${String(child.status)}): ${(child.stderr ?? '').trim().split('\n').at(-1) ?? ''}`,
        }
      }
      runs.push(run)
      const verdict = run.error
        ? `✗ ${run.error}`
        : run.failed.length === 0
          ? `✓ ${String(run.total)} اختبارًا`
          : `✗ ${String(run.failed.length)} ساقط من ${String(run.total)}`
      console.log(`  ${String(i).padStart(2)}/${String(count)}  ${verdict}  (${seconds} ث)`)
      for (const name of run.failed) console.log(`         ↳ ${name}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const summary = summarise(runs)
  console.log(
    `\n  الخلاصة: ${String(summary.green)}/${String(summary.runs)} أخضر · أطول سلسلة متتالية ${String(summary.longestStreak)}`,
  )
  for (const f of summary.flaky)
    console.log(`  متقطّع: ${f.name} — سقط ${String(f.times)} من ${String(summary.runs)}`)
  process.exit(summary.allGreen ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
