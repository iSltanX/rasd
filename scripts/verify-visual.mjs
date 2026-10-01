/**
 * الانحدار البصري الآلي — أي انحراف عن خطوط الأساس يُكشف في كروم حقيقي لا بالعين (`STAGES/26`، ADR 0052).
 *
 * كانت خطوط الأساس في `tests/visual-baselines/` «تُكتب ولا يقرؤها أحد»: تُقرأ بالعين عند المطابقة (`STAGES/04`)
 * ثمّ تتقادم بصمت — وهذا ما حصل: أربعٌ منها كانت قد تقادمت فعلًا حين قُرئت بالمقارن (زرّ «مشاركة» كان
 * معطَّلًا في الصورة ومفعَّلًا في الإضافة). هنا يقرؤها هذا الحارس:
 *
 *  1. **يلتقط الأسطح الحيّة** بـ`scripts/design-shots.mjs` في كروم حقيقي بالوضعين، بناءَ تطوير في مجلّد مؤقّت
 *     (صفحتا المعاينة لا تُبنيان في الإنتاج). ما يُلتقط ومساره في `scripts/lib/visual-surfaces.mjs` — مصدرٌ
 *     واحد يقرؤه المولِّد والحارس واختبار الوحدة.
 *  2. **يقارن كلَّ لقطة بخطّ أساسها** (`scripts/lib/visual-compare.mjs`): نسبة البكسلات المختلفة، وأسوأ بلاطة
 *     من 32×32، والأبعاد. العتبتان `LIMITS` في `visual-compare.mjs` مقيستان لا مخمَّنتان — ADR 0052 يدوّن
 *     ضجيج الالتقاط المتكرّر على الجهاز نفسه وإشارة التخريب المقصود. وعند السقوط تُكتب صورة الفرق في
 *     `artifacts/visual-diff/` بالأحمر.
 *  3. **صفر قيمة حرفية:** `scripts/verify-tokens.mjs` — لا لون ولا `px` ولا خاصّية فيزيائية خارج التوكنز.
 *  4. **صفر مخالفة أرقام:** على النصّ المرسوم في الأسطح نفسها (`design-shots --numerals`): لا خلط بين
 *     الأرقام الهندية والغربية في عقدة، ولا بُعدان غربيّان بينهما محايدٌ وحده في فقرةٍ عربية بلا عزل.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_VISUAL=colour pnpm verify:visual    # يجب أن يفشل — زرّ الإجراء الرئيس رماديّ والنصّ الثانوي بلون الإشارة
 *     RASD_BREAK_VISUAL=layout pnpm verify:visual    # يجب أن يفشل — فجوةٌ أوسع بأربعة بكسلات
 *     RASD_BREAK_VISUAL=numerals pnpm verify:visual  # يجب أن يفشل — «1440 × 900» بلا عزل في فقرة عربية
 *
 * الأوّلان يرقّعان توكنز البناء المؤقّت قبل أي لقطة (النسختين: صفحات الإضافة والطبقة فوق الصفحة)، والثالث
 * يحقن فقرةً بعد اللقطة. والترقيع يرمي إن لم يجد نمطه.
 *
 * ## خطوط الأساس
 *
 *     pnpm design:shots --surfaces --baselines    # تُكتب بأمرٍ يُعاد، لا بلقطةٍ يدوية
 *
 * وتغيّرها عن قصد يمرّ بمراجعة العين: تُكتب من جديد، وتُقرأ الصور في الفرق (`git diff --stat` ثمّ فتحها)
 * قبل الالتزام. **ولا تُرفع عتبةٌ لتخضرّ** (`AGENTS.md` §4).
 *
 * الحارس لا يُقلع كروم بنفسه: يقوده `design-shots.mjs` الذي يحمّل الإضافة غير المضغوطة من بناء التطوير،
 * وما يأخذه من النواة المشتركة (`scripts/lib/cdp.mjs`) كروم نفسه وعدّة التقرير والمجلّد.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createReport, findChrome, ROOT } from './lib/cdp.mjs'
import { decodePng, encodePng, judge, LIMITS, measureDiff, TILE } from './lib/visual-compare.mjs'
import { allBaselines, BASELINE_PLATFORM } from './lib/visual-surfaces.mjs'

const BREAK = process.env.RASD_BREAK_VISUAL ?? ''
/** منفذ كروم لهذا الحارس — نفسه منفذ `design-shots.mjs` الافتراضي، لا يتشاركه حارسٌ آخر. */
const PORT = Number(process.env.RASD_DESIGN_PORT ?? 9391)
/** مهلة التقاط الأسطح — دون مهلة الخطوة في `verify:wave` (ست دقائق) كي يُطبع ما جُمع قبلها. */
const CAPTURE_TIMEOUT_MS = 300_000

if (BREAK && !['colour', 'layout', 'numerals'].includes(BREAK)) {
  console.error(`RASD_BREAK_VISUAL=${BREAK}: القيم colour أو layout أو numerals.`)
  process.exit(1)
}

const report = createReport()
const baselinesDir = join(ROOT, 'tests', 'visual-baselines')
const diffDir = join(ROOT, 'artifacts', 'visual-diff')
const designDir = join(ROOT, 'artifacts', 'design')

if (!findChrome()) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}
const busy = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(
  () => true,
  () => false,
)
if (busy) {
  console.error(
    `المنفذ ${PORT} مشغول بنسخة Chrome سابقة. أغلقها أوّلًا:\n  pkill -f "remote-debugging-port=${PORT}"`,
  )
  process.exit(1)
}
if (BREAK) report.note(`تخريب مقصود لإثبات السالب: ${BREAK}`)
// نسخة كروم تُطبع دليلًا: تحديثه الشهري هو أرجح سبب لانحرافٍ بلا تغيير في الشيفرة (يُكتب خطّ الأساس من جديد).
const chromeVersion = spawnSync(findChrome(), ['--version'], { encoding: 'utf8' }).stdout?.trim()
report.note(`${chromeVersion || 'Chrome'} · المنصّة ${process.platform}`)
/**
 * المقارنة البكسلية على منصّة خطوط الأساس وحدها (`BASELINE_PLATFORM`). `RASD_VISUAL_FORCE=1` يفرضها على غيرها —
 * لقياس ما يختلف، لا لحكم.
 */
const pixelCompare = process.platform === BASELINE_PLATFORM || process.env.RASD_VISUAL_FORCE === '1'

// ── 1) الالتقاط ─────────────────────────────────────────────────────
const live = mkdtempSync(join(tmpdir(), 'rasd-visual-'))
rmSync(join(designDir, 'numerals.json'), { force: true })
const capture = spawnSync(
  process.execPath,
  [
    join(ROOT, 'scripts', 'design-shots.mjs'),
    `--baselines-dir=${live}`,
    '--surfaces',
    '--numerals',
  ],
  {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: CAPTURE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      RASD_DESIGN_PORT: String(PORT),
      ...(BREAK ? { RASD_DESIGN_BREAK: BREAK } : {}),
    },
  },
)
const output = `${capture.stdout ?? ''}${capture.stderr ?? ''}`
if (capture.error || capture.status !== 0) {
  report.fail(
    `تعذّر التقاط الأسطح: ${capture.error?.message ?? `خرج برمز ${capture.status}`}\n${output.split('\n').slice(-8).join('\n')}`,
  )
}
// مشهدٌ سقط أثناء الالتقاط يُسمّى باسمه: ملفّه الغائب وحده لا يشرح لماذا.
for (const line of output.split('\n').filter((l) => /^\s*✗ /u.test(l))) {
  report.fail(`مشهدٌ سقط في الالتقاط:${line.trim().slice(1)}`)
}

// ── 2) المقارنة ─────────────────────────────────────────────────────
if (!pixelCompare) {
  report.note(
    `لا مقارنة بكسلية: خطوط الأساس مأخوذة على ${BASELINE_PLATFORM} وهذه ${process.platform} — تنعيم الحرف يختلف بين المنصّتين فيسقط كل نصّ بلا عطل (ADR 0052). الحكم المحلّي على ${BASELINE_PLATFORM}؛ وفحصا القيم الحرفية والأرقام أدناه يجريان.`,
  )
}
const limits = LIMITS
let worst = { fraction: 0, tile: 0 }
let compared = 0
for (const { file } of pixelCompare ? allBaselines() : []) {
  const baselinePath = join(baselinesDir, file)
  const livePath = join(live, file)
  if (!existsSync(baselinePath)) {
    report.fail(`${file} — لا خطّ أساس. اكتبه بـ\`pnpm design:shots --baselines\` وراجعه بالعين`)
    continue
  }
  if (!existsSync(livePath)) {
    report.fail(`${file} — لم تُلتقط اللقطة الحيّة`)
    continue
  }
  let verdict
  try {
    const a = decodePng(readFileSync(baselinePath))
    const b = decodePng(readFileSync(livePath))
    const m = measureDiff(a, b, { wantMask: true })
    const reason = judge(m, limits)
    verdict = { m, reason }
    if (m.sameSize) {
      worst = { fraction: Math.max(worst.fraction, m.fraction), tile: Math.max(worst.tile, m.tile) }
    }
    if (reason && m.mask) {
      const out = join(diffDir, file.replace(/\//gu, '__'))
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, encodePng({ width: m.width, height: m.height, data: m.mask }))
    }
  } catch (e) {
    report.fail(`${file} — ${e.message}`)
    continue
  }
  compared++
  const { m, reason } = verdict
  const figures = m.sameSize
    ? `${(m.fraction * 100).toFixed(4)}% · بلاطة ${(m.tile * 100).toFixed(1)}%`
    : 'أبعاد مختلفة'
  if (reason) report.fail(`${file} — ${reason} (فرق مكتوب في artifacts/visual-diff/)`)
  else report.ok(`${file} — ${figures}`)
}
if (pixelCompare) {
  report.note(
    `قورنت ${compared} لقطة؛ العتبتان: ${(LIMITS.fraction * 100).toFixed(2)}% من البكسلات وبلاطة ${TILE}×${TILE} عند ${LIMITS.tile * 100}%؛ أسوأ ما قيس ${(worst.fraction * 100).toFixed(4)}% وبلاطة ${(worst.tile * 100).toFixed(1)}%`,
  )
}

// خطّ أساسٍ بلا سطح — صورةٌ في المجلّد لا يقرؤها أحد هي بالضبط ما كان قبل هذه المرحلة.
const expected = new Set(allBaselines().map((b) => b.file))
const stray = []
for (const dir of readdirSync(baselinesDir, { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
)) {
  for (const f of readdirSync(join(baselinesDir, dir.name)).filter((n) => n.endsWith('.png'))) {
    if (!expected.has(`${dir.name}/${f}`)) stray.push(`${dir.name}/${f}`)
  }
}
if (stray.length > 0) {
  report.fail(
    `صورٌ في tests/visual-baselines/ لا يقارنها أحد (أضفها إلى visual-surfaces.mjs أو احذفها): ${stray.join(' · ')}`,
  )
} else {
  report.ok('كل صورة في tests/visual-baselines/ يقارنها الحارس')
}

// ── 3) صفر قيمة حرفية ───────────────────────────────────────────────
const tokens = spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify-tokens.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
})
if (tokens.status === 0) report.ok('صفر قيمة حرفية — verify:tokens')
else
  report.fail(
    `قيمٌ حرفية خارج التوكنز:\n${(tokens.stdout ?? '').split('\n').slice(0, 12).join('\n')}`,
  )

// ── 4) صفر مخالفة أرقام ─────────────────────────────────────────────
const numeralsFile = join(designDir, 'numerals.json')
if (!existsSync(numeralsFile)) {
  report.fail('لم يُكتب artifacts/design/numerals.json — فحص الأرقام لم يجرِ')
} else {
  const findings = JSON.parse(readFileSync(numeralsFile, 'utf8'))
  if (findings.length === 0) {
    report.ok('صفر مخالفة أرقام على النصّ المرسوم في الأسطح')
  } else {
    const grouped = new Map()
    for (const f of findings) {
      const key = `${f.kind} «${f.text}»`
      grouped.set(key, [...(grouped.get(key) ?? []), `${f.frame} · ${f.mode}`])
    }
    for (const [key, where] of grouped) {
      const frames = [...new Set(where)]
      report.fail(
        `أرقام: ${key} في ${frames.slice(0, 3).join(' · ')}${frames.length > 3 ? ` و${frames.length - 3} غيرها` : ''}`,
      )
    }
  }
}

rmSync(live, { recursive: true, force: true })
console.log(`\nالانحدار البصري — خطوط الأساس مقابل الأسطح الحيّة`)
console.log(report.lines.join('\n'))
const dir = process.env.RASD_GUARD_TRANSCRIPT
if (dir) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'visual.txt'),
    `الانحدار البصري — خطوط الأساس مقابل الأسطح الحيّة\n${report.lines.join('\n')}\n`,
  )
}
if (report.errors.length > 0) {
  console.error(`\n✗ ${report.errors.length} إخفاق`)
  process.exit(1)
}
console.log('\n✓ لا انحراف بصري عن خطوط الأساس')
