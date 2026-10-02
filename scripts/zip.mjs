#!/usr/bin/env node
/**
 * يحزم الخرج في ملفّات مضغوطة جاهزة للرفع — بعد فحصها، لا بدلًا منه (`STAGES/27`، وSS3 للقنوات).
 *
 * `--target chromium|firefox|source|all` (الافتراضي `chromium` كما كان):
 *   • `chromium` — `dist-zip/rasd-<النسخة>.zip` من `dist/` (Chrome وEdge وOpera).
 *   • `firefox`  — `dist-zip/rasd-<النسخة>-firefox.zip` من `dist-firefox/`، بعد `web-ext lint` (مدقّق AMO نفسه).
 *   • `source`   — `dist-zip/rasd-<النسخة>-source.zip` من `git archive HEAD` مع README البناء: ما يطلبه AMO وOpera
 *                  لأن الحزمة مصغَّرة. يرفض شجرةً غير نظيفة.
 *   • `all`      — الثلاثة. وأوّل رفضٍ في أيٍّ منها يمنع كتابة أيٍّ منها.
 *
 * بالترتيب لكل حزمة بناء، وأوّل سقوط يرفض الضغط ويخرج بغير صفر:
 *   1. خرج البناء موجود وليس أقدم من مصدره — حزمة قديمة تُرفع بنسخة جديدة أخطر من لا حزمة.
 *   2. `verify:dist` للهدف — الحارس نفسه الذي يجري بعد كل بناء. ولـFirefox `web-ext lint` بصفر خطأ.
 *   3. فحص الإصدار (`scripts/lib/release-pack.mjs`): بلا خرائط مصدر ولا صفحات معاينة، ونسخة البيان
 *      هي نسخة `package.json`، وملفّ التراخيص يذكر كل اعتمادية، وحزمة Firefox فيها `gecko.id`. والملفّات المخفية
 *      (`.DS_Store` ينسخه Vite من `public/` على macOS) تُستبعد وتُذكر.
 *   4. `--tag vX.Y.Z` (من سير الإصدار): الوسم يطابق النسخة ولا يُنقصها، وحزمة المصدر من الالتزام الموسوم نفسه.
 *
 * كل حزمة معها `.sha256` بصيغة `shasum -a 256 -c`. والضغط حتمي: بناءان من مصدر واحد يعطيان البصمة نفسها —
 * ولهذا تُثبَّت في حزمة المصدر نفسها أوامر البناء، فيعيد المراجع بناء البصمتين. وما يخصّ الأهداف المطلوبة من
 * `dist-zip/` يُفرَّغ قبل أي فحص: الرفض لا يترك حزمةً سابقة باسم النسخة نفسها تُرفع ظنًّا أنها هذه.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { OUT_DIRS } from './build-target.ts'
import { collect, lintProblems, pack, packSource, sourceProblems } from './lib/release-pack.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'dist-zip')

const KINDS = ['chromium', 'firefox', 'source']

const refuse = (lines) => {
  console.error(`\n✗ رُفض الضغط:\n${lines.map((l) => `  · ${l}`).join('\n')}\n`)
  process.exit(1)
}

/** `--علَم قيمة` أو `--علَم=قيمة`؛ غيابه `null`، وعلَمٌ بلا قيمة سلسلة فارغة. */
function flag(name) {
  const argv = process.argv.slice(2)
  const at = argv.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (at === -1) return null
  if (argv[at].includes('=')) return argv[at].slice(argv[at].indexOf('=') + 1)
  const next = argv[at + 1]
  return next === undefined || next.startsWith('--') ? '' : next
}

const targetArg = flag('--target') ?? 'chromium'
if (targetArg !== 'all' && !KINDS.includes(targetArg)) {
  console.error(
    `✗ --target = «${targetArg}» ليس هدف حزمة — المسموح: ${[...KINDS, 'all'].join(' · ')}`,
  )
  process.exit(2)
}
const kinds = targetArg === 'all' ? KINDS : [targetArg]
const tag = flag('--tag')

/** نوع حزمةٍ من اسم ملفّها (أو بصمتها)، و`null` لما ليس من حزم رصد. */
function kindOf(name) {
  if (!/^rasd-.+\.zip(?:\.sha256)?$/u.test(name)) return null
  if (/-firefox\.zip(?:\.sha256)?$/u.test(name)) return 'firefox'
  if (/-source\.zip(?:\.sha256)?$/u.test(name)) return 'source'
  return 'chromium'
}

/** يفرّغ حزم الأنواع المطلوبة وحدها: `zip` وحده لا يمحو حزمة Firefox التي بُنيت قبله، لكن لا تبقى حزمةٌ سابقة بالاسم نفسه. */
if (existsSync(outDir)) {
  for (const entry of readdirSync(outDir)) {
    if (kinds.includes(kindOf(entry))) rmSync(join(outDir, entry), { force: true })
  }
}

/** أحدث وقت تعديل في مدخلات البناء — الملفّات المخفية لا تُعدّ (Finder يلمسها). */
function newestInput() {
  const inputs = [
    'src',
    'public',
    'licenses',
    'package.json',
    'pnpm-lock.yaml',
    'manifest.config.ts',
    'vite.config.ts',
    'vite.content.config.ts',
    'scripts/build-target.ts',
    'scripts/target-manifest.ts',
    'scripts/module-preload.ts',
    'scripts/third-party-licenses.ts',
  ]
  let newest = 0
  const visit = (path) => {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) if (!entry.startsWith('.')) visit(join(path, entry))
    } else newest = Math.max(newest, stat.mtimeMs)
  }
  for (const input of inputs) if (existsSync(join(root, input))) visit(join(root, input))
  return newest
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const tags = tag ? git(['tag', '--list', 'v*']).split('\n').filter(Boolean) : []

/** `web-ext lint` لخرج Firefox — مدقّق AMO نفسه، وتقريره JSON يقرؤه `lintProblems`. */
function lintFirefox(dir) {
  const bin = join(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js')
  if (!existsSync(bin)) return ['web-ext غير مثبَّت — شغّل `pnpm install --frozen-lockfile`']
  const run = spawnSync(process.execPath, [bin, 'lint', '--source-dir', dir, '--output', 'json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    return [
      `web-ext lint لم يعطِ تقريرًا مقروءًا (خروج ${run.status}): ${run.stderr.slice(0, 200)}`,
    ]
  }
  return lintProblems(report)
}

/** حزمة Chromium أو Firefox من خرج بنائها. */
function bundle(kind) {
  const outName = OUT_DIRS[kind]
  const dir = join(root, outName)
  const build = kind === 'firefox' ? 'pnpm build:firefox' : 'pnpm build'
  const manifest = join(dir, 'manifest.json')
  if (!existsSync(manifest))
    return { problems: [`${outName}/manifest.json غير موجود — شغّل \`${build}\` أولًا`] }
  if (statSync(manifest).mtimeMs < newestInput()) {
    return { problems: [`الحزمة في ${outName}/ أقدم من مصدرها — شغّل \`${build}\` أولًا`] }
  }
  const { files, hidden } = collect(dir)
  const result = pack({
    files,
    version: pkg.version,
    dependencies: Object.keys(pkg.dependencies ?? {}),
    target: kind,
    tag,
    tags,
    verify: () =>
      spawnSync(process.execPath, [join(root, 'scripts', 'verify-dist.mjs'), '--target', kind], {
        cwd: root,
        stdio: 'inherit',
      }).status === 0,
    lint: kind === 'firefox' ? () => lintFirefox(dir) : null,
  })
  return { ...result, count: files.length, hidden }
}

/** حزمة المصدر: `git archive HEAD` وREADME البناء في الجذر. */
function source() {
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean)
  const head = git(['rev-parse', 'HEAD']).trim()
  let tagCommit = null
  if (tag) {
    try {
      tagCommit = git(['rev-parse', `${tag}^{commit}`]).trim()
    } catch {
      tagCommit = null
    }
  }
  const problems = sourceProblems({ dirty, tag, head, tagCommit })
  if (problems.length > 0) return { problems }
  const tar = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 1024,
  })
  const readme = readFileSync(join(root, 'Docs', 'Store', 'source-README.md'), 'utf8')
  return packSource({ tar, readme, version: pkg.version, tag, tags })
}

const results = kinds.map((kind) => ({ kind, ...(kind === 'source' ? source() : bundle(kind)) }))

const refused = results.flatMap((r) =>
  (r.problems ?? []).map((p) => (kinds.length > 1 ? `[${r.kind}] ${p}` : p)),
)
if (refused.length > 0) refuse(refused)

mkdirSync(outDir, { recursive: true })
for (const r of results) {
  const out = join(outDir, r.name)
  writeFileSync(out, r.zip)
  writeFileSync(`${out}.sha256`, `${r.sha}  ${r.name}\n`)
  if (r.hidden?.length > 0) console.log(`  مستبعَد (مخفي): ${r.hidden.join(' · ')}`)
  console.log(`✓ ${out} — ${r.count} ملفًّا · ${(r.zip.length / 1024).toFixed(1)} KB`)
  console.log(`  SHA-256 ${r.sha}${r.prerelease ? ' · تجريبي' : ''}`)
}
