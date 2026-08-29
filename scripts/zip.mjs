#!/usr/bin/env node
/** يحزم `dist/` في ملف مضغوط جاهز للرفع، بعد تمرير فحص الحزمة. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const outDir = join(root, 'dist-zip')

if (!existsSync(dist)) {
  console.error('dist/ غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `rasd-${version}.zip`)
rmSync(out, { force: true })

execFileSync('zip', ['-r', '-q', '-X', out, '.'], { cwd: dist, stdio: 'inherit' })
console.log(`✓ ${out}`)
