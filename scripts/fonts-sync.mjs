#!/usr/bin/env node
/**
 * يجلب الخطوط الثلاثة من Google Fonts (رخصة OFL) ويولّد `assets/fonts.css`.
 *
 * **لماذا محليًا:** سياسة أمن المحتوى في MV3 تمنع الجلب من CDN، والطبقة داخل
 * الصفحة تحتاج الخطوط من أصل `chrome-extension://` لا من الشبكة.
 *
 * المجموعات الفرعية عربي/لاتيني فقط — لا كيريلي ولا فيتنامي، فهي وزن بلا فائدة.
 * Cairo خطّ متغيّر يخدم الملف نفسه لكل الأوزان، فتُزال النسخ المكرّرة بالبصمة.
 *
 *   pnpm fonts:sync
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'public', 'assets')
const fontsDir = join(assets, 'fonts')

const FAMILIES = ['Almarai:wght@400;700;800', 'Cairo:wght@400;600;700', 'Geist+Mono:wght@400;600']
const KEEP_SUBSETS = new Set(['arabic', 'latin', 'latin-ext'])
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

mkdirSync(fontsDir, { recursive: true })

let css = ''
for (const family of FAMILIES) {
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) {
    console.error(`تعذّر جلب ${family}: ${res.status}`)
    process.exit(1)
  }
  css += (await res.text()) + '\n'
}

const faces = [...css.matchAll(/\/\* (\S+) \*\/\s*@font-face \{([\s\S]*?)\}/g)]
  .map(([, subset, block]) => ({
    subset,
    family: /font-family:\s*'([^']+)'/.exec(block)?.[1],
    weight: /font-weight:\s*(\d+)/.exec(block)?.[1],
    url: /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1],
    range: /unicode-range:\s*([^;]+);/.exec(block)?.[1],
  }))
  .filter((f) => KEEP_SUBSETS.has(f.subset) && f.url)

const seen = new Map()
const kept = []
for (const face of faces) {
  const name = `${face.family.replace(/\s+/g, '').toLowerCase()}-${face.weight}-${face.subset}.woff2`
  const buffer = Buffer.from(await (await fetch(face.url)).arrayBuffer())
  const hash = createHash('md5').update(buffer).digest('hex')
  if (seen.has(hash)) {
    kept.push({ ...face, file: seen.get(hash) })
    continue
  }
  writeFileSync(join(fontsDir, name), buffer)
  seen.set(hash, name)
  kept.push({ ...face, file: name })
}

// أزل أي ملف لم يعد مشارًا إليه.
const referenced = new Set(kept.map((f) => f.file))
for (const file of readdirSync(fontsDir)) {
  if (!referenced.has(file)) unlinkSync(join(fontsDir, file))
}

const L = [
  '/* مولَّد عبر `pnpm fonts:sync` من Google Fonts (رخصة OFL) — لا يُحرَّر يدويًا. */',
  '/* الخطوط مضمَّنة محليًا: سياسة أمن المحتوى في MV3 تمنع الجلب من CDN. */',
  '',
]
for (const f of kept) {
  L.push(
    '@font-face {',
    `  font-family: '${f.family}';`,
    '  font-style: normal;',
    `  font-weight: ${f.weight};`,
    '  font-display: swap;',
    `  src: url('./fonts/${f.file}') format('woff2');`,
    `  unicode-range: ${f.range};`,
    '}',
  )
}
writeFileSync(join(assets, 'fonts.css'), L.join('\n') + '\n')

const bytes = readdirSync(fontsDir).reduce(
  (n, f) => n + readFileSync(join(fontsDir, f)).byteLength,
  0,
)
console.log('مزامنة الخطوط:')
console.log(`  ✓ ${kept.length} إعلان @font-face على ${seen.size} ملفًا فريدًا`)
console.log(`  ✓ ${(bytes / 1024).toFixed(0)} KB إجمالًا`)
console.log('  ✓ public/assets/fonts.css')
