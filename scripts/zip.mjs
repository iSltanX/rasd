#!/usr/bin/env node
/**
 * يحزم `dist/` في ملفّ مضغوط جاهز للرفع — بعد فحصها، لا بدلًا منه (`STAGES/27`).
 *
 * بالترتيب، وأوّل سقوط يرفض الضغط ويخرج بغير صفر:
 *   1. `dist/` موجودة وليست أقدم من مصدرها — حزمة قديمة تُرفع بنسخة جديدة أخطر من لا حزمة.
 *   2. `verify:dist` — الحارس نفسه الذي يجري بعد كل بناء.
 *   3. فحص الإصدار (`scripts/lib/release-pack.mjs`): بلا خرائط مصدر ولا صفحات معاينة، ونسخة البيان
 *      هي نسخة `package.json`، وملفّ التراخيص يذكر كل اعتمادية. والملفّات المخفية (`.DS_Store` ينسخه
 *      Vite من `public/` على macOS) تُستبعد وتُذكر.
 *   4. `--tag vX.Y.Z` (من سير الإصدار): الوسم يطابق النسخة ولا يُنقصها.
 *
 * ثمّ `dist-zip/rasd-<النسخة>.zip` ومعه `.sha256` بصيغة `shasum -a 256 -c`. والضغط حتمي: بناءان من
 * مصدر واحد يعطيان البصمة نفسها.
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

import { collect, pack } from './lib/release-pack.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const outDir = join(root, 'dist-zip')

const refuse = (lines) => {
  console.error(`\n✗ رُفض الضغط:\n${lines.map((l) => `  · ${l}`).join('\n')}\n`)
  process.exit(1)
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

const tagIndex = process.argv.indexOf('--tag')
const tag = tagIndex > -1 ? (process.argv[tagIndex + 1] ?? '') : null

const manifest = join(dist, 'manifest.json')
if (!existsSync(manifest)) refuse(['dist/manifest.json غير موجود — شغّل `pnpm build` أولًا'])
if (statSync(manifest).mtimeMs < newestInput()) {
  refuse(['الحزمة في dist/ أقدم من مصدرها — شغّل `pnpm build` أولًا'])
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { files, hidden } = collect(dist)
const tags = tag
  ? execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  : []

const result = pack({
  files,
  version: pkg.version,
  dependencies: Object.keys(pkg.dependencies ?? {}),
  tag,
  tags,
  verify: () =>
    spawnSync(process.execPath, [join(root, 'scripts', 'verify-dist.mjs')], {
      cwd: root,
      stdio: 'inherit',
    }).status === 0,
})
if (result.problems) refuse(result.problems)

mkdirSync(outDir, { recursive: true })
const out = join(outDir, result.name)
rmSync(out, { force: true })
writeFileSync(out, result.zip)
writeFileSync(`${out}.sha256`, `${result.sha}  ${result.name}\n`)

if (hidden.length > 0) console.log(`  مستبعَد (مخفي): ${hidden.join(' · ')}`)
console.log(`✓ ${out} — ${files.length} ملفًّا · ${(result.zip.length / 1024).toFixed(1)} KB`)
console.log(`  SHA-256 ${result.sha}${result.prerelease ? ' · تجريبي' : ''}`)
