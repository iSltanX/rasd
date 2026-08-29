#!/usr/bin/env node
/**
 * لقطة أيقونات Figma ← `src/ui/icons/icon-data.ts`.
 *
 * نفس بنية `tokens-sync.mjs` ([ADR 0007](../ADR/0007-token-pipeline.md)): لقطة
 * مودَعة في المستودع، وتوليد حتمي بلا شبكة. الأيقونات صُدِّرت من صفحة
 * `07 — Iconography` عبر `node.exportAsync({ format: 'SVG_STRING' })`.
 *
 * التحويل: اللون الثابت `#F4F7F9` (توكن `color/ink/50` — لون الوضع الداكن وقت
 * التصدير) يُستبدل بـ`currentColor` — إلزام `currentColor` في المكوّنات يعني أن
 * الأيقونة تتبع لون النص المحيط بها، لا لونًا مجمَّدًا من لحظة التصدير.
 *
 *   pnpm icons:sync
 *   pnpm icons:sync --check
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const snapshotPath = join(root, 'src', 'ui', 'icons', 'icon-snapshot.json')
const outPath = join(root, 'src', 'ui', 'icons', 'icon-data.ts')
const CHECK = process.argv.includes('--check')

if (!existsSync(snapshotPath)) {
  console.error(`لقطة الأيقونات غير موجودة: ${snapshotPath}`)
  process.exit(1)
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const names = Object.keys(snapshot.icons).sort()

/** يستخرج viewBox والمحتوى الداخلي، ويستبدل اللون الثابت بـ`currentColor`. */
function convert(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 20 20'
  const inner = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim()
    .replace(/#F4F7F9/gi, 'currentColor')
  return { viewBox, inner }
}

const entries = names.map((name) => {
  const { viewBox, inner } = convert(snapshot.icons[name])
  const short = name.replace(/^icon\//, '')
  return { name, short, viewBox, inner }
})

// كل أيقونة استُبدل لونها الثابت فعلًا — بوّابة صمت لا صوت.
const unconverted = entries.filter((e) => /#[0-9a-fA-F]{3,8}/.test(e.inner))
if (unconverted.length > 0) {
  console.error(
    `أيقونات تحمل ألوانًا ثابتة لم تُستبدل: ${unconverted.map((e) => e.name).join(', ')}`,
  )
  process.exit(1)
}

const banner = [
  '/**',
  ' * مولَّد من `icon-snapshot.json` عبر `pnpm icons:sync` — لا يُحرَّر يدويًا.',
  ' * كل أيقونة `currentColor` — تتبع لون النص المحيط بها.',
  ' */',
].join('\n')

const union = entries.map((e) => `\n  | '${e.short}'`).join('')

const table = entries
  .map(
    (e) =>
      `  '${e.short}': { viewBox: ${JSON.stringify(e.viewBox)}, markup: ${JSON.stringify(e.inner)} },`,
  )
  .join('\n')

const out = `${banner}

export type IconName =${union}

export interface IconEntry {
  readonly viewBox: string
  /** محتوى \`<svg>\` الداخلي — عناصر \`<path>\` موثوقة، مولَّدة من Figma لا من مُدخل مستخدم. */
  readonly markup: string
}

export const ICON_DATA: Record<IconName, IconEntry> = {
${table}
}

export const ICON_NAMES: readonly IconName[] = ${JSON.stringify(entries.map((e) => e.short))} as const
`

if (CHECK) {
  const previous = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null
  if (previous !== out) {
    console.error('✗ انحراف في icon-data.ts — شغّل `pnpm icons:sync`')
    process.exit(1)
  }
  console.log('✓ الأيقونات متطابقة مع اللقطة — لا انحراف.')
} else {
  writeFileSync(outPath, out)
  console.log('توليد الأيقونات:')
  console.log(`  ✓ ${entries.length} أيقونة`)
  console.log('  ✓ src/ui/icons/icon-data.ts')
}
