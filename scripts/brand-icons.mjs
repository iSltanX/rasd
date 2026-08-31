#!/usr/bin/env node
/**
 * أيقونات الإضافة ← `public/icons/icon-{16,32,48,128}.png`.
 *
 * القرار وعلّته في [ADR 0016](../Docs/ADR/0016-mark-geometry-single-source.md)،
 * وهو تمديد لخطّ الأنابيب في [ADR 0007](../Docs/ADR/0007-token-pipeline.md):
 * مصدر مودَع في المستودع وتوليد بلا شبكة. المصدر هنا ليس لقطة JSON بل
 * `src/ui/mark-geometry.ts` — الهندسة نفسها التي يرسمها `RasdMark.tsx` في
 * الواجهة، فلا ينحرف الشعار في شريط الأدوات عن الشعار داخل النافذة.
 * والألوان من `src/tokens/tokens.ts` لا حرفية: المربّع `surface/brand`
 * والعلامة `text/inverse` في الوضع الداكن.
 *
 * **لماذا الأيقونة مربّع لا العلامة وحدها:** نسبة الشعار ~1.5:1 ولا تُجبَر
 * على المربّع. جُرِّب النمطان فعليًا عند 16px على شريط أدوات فاتح وداكن:
 * العلامة وحدها تفقد حضورها، والمربّع التركوازي يصمد على الشريطين معًا.
 *
 * **لماذا `INNER` ليس ثابتًا:** العلامة تشغل 82% من عرض المربّع، إلا عند 16
 * فتشغل 88%. عند 82% تنغلق الفتحة الداخلية وتصير لطخة — قيست النسب
 * 0.82/0.88/0.94/1.0 مكبَّرة قبل الاختيار، و1.0 يجعل طرفَي القوسين
 * يصطدمان بزاوية المربّع المستديرة. هو منطق القصّات البصرية نفسه مطبَّقًا
 * على الحشوة: كلما صغر الحجم قلّت الحشوة النسبية.
 *
 * **لماذا خارج CI:** الترسيم يحتاج Chrome حقيقيًا، وناتج البكسل قد يختلف
 * بين إصدارَي متصفّح بلا تغيّر في المصدر — فمقارنة البايت في CI تُنتج فشلًا
 * كاذبًا. نفس علّة `verify:popup` (غير مُدرج في CI أيضًا). يُشغَّل محليًا عند
 * تغيّر الشعار.
 *
 *   pnpm icons:brand           يولّد
 *   pnpm icons:brand --check   يقارن دون كتابة
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { resolveColor } from '../src/tokens/tokens.ts'
import { MARK_CUTS, MARK_STROKE } from '../src/ui/mark-geometry.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'public', 'icons')
const CHECK = process.argv.includes('--check')

/** المقاسات التي يطلبها البيان — `manifest.config.ts`. */
const SIZES = [16, 32, 48, 128]

/** نصف قطر المربّع نسبةً إلى ضلعه — نفس نسبة أيقونات النظام. */
const RADIUS = 0.2237

/** عرض العلامة نسبةً إلى ضلع المربّع. انظر ترويسة الملف لعلّة استثناء 16. */
const INNER = { 16: 0.88, 32: 0.82, 48: 0.82, 128: 0.82 }

const TILE = resolveColor('surface/brand', 'dark')
const MARK = resolveColor('text/inverse', 'dark')

/** مسارات Chrome المعتادة على macOS، ويُتجاوَز بـ`RASD_CHROME`. */
const CHROME_CANDIDATES = [
  process.env.RASD_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('✗ لم يُعثر على Chrome. عيّن RASD_CHROME بمسار المتصفّح.')
  process.exit(1)
}

/** عرض وارتفاع PNG من ترويسة IHDR — تحقّق من أن الترسيم خرج بالمقاس المطلوب. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/** مربّع الأيقونة: خلفية العلامة التجارية، وفوقها العلامة بقصّها المطابق للحجم. */
function tileSvg(size) {
  const cut = MARK_CUTS[size]
  const [vw, vh] = cut.viewBox.split(' ').slice(2).map(Number)
  const markW = size * INNER[size]
  const markH = markW * (vh / vw)
  const x = (size - markW) / 2
  const y = (size - markH) / 2
  const { x: ax, y: ay, w: aw, h: ah, rx } = cut.aperture
  const n = (v) => Number(v.toFixed(4))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${n(size * RADIUS)}" fill="${TILE}"/>
  <svg x="${n(x)}" y="${n(y)}" width="${n(markW)}" height="${n(markH)}" viewBox="${cut.viewBox}"
       fill="none" stroke="${MARK}" stroke-width="${MARK_STROKE}"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="${cut.brackets[0]}"/>
    <path d="${cut.brackets[1]}"/>
    <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="${rx}"/>
  </svg>
</svg>`
}

/** يرسم المربّع بمقاسه الحقيقي. الخلفية شفّافة كي تبقى زوايا المربّع مستديرة فعلًا. */
function render(size, workDir) {
  const page = join(workDir, `tile-${size}.html`)
  const png = join(workDir, `icon-${size}.png`)
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>` +
      tileSvg(size),
  )
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${png}`,
      `file://${page}`,
    ],
    { stdio: 'pipe' },
  )
  const buf = readFileSync(png)
  const dim = pngSize(buf)
  if (dim.w !== size || dim.h !== size) {
    console.error(`✗ icon-${size}.png خرج بمقاس ${dim.w}×${dim.h} لا ${size}×${size}`)
    process.exit(1)
  }
  return buf
}

const workDir = mkdtempSync(join(tmpdir(), 'rasd-brand-icons-'))
let drift = 0

try {
  const results = SIZES.map((size) => {
    const next = render(size, workDir)
    const dest = join(outDir, `icon-${size}.png`)
    const prev = existsSync(dest) ? readFileSync(dest) : null
    const same = prev !== null && prev.equals(next)

    if (CHECK) {
      if (!same) drift++
    } else if (!same) {
      writeFileSync(dest, next)
    }
    return { size, bytes: next.length, same }
  })

  if (CHECK) {
    if (drift > 0) {
      console.error(`✗ انحراف في ${drift} أيقونة — شغّل \`pnpm icons:brand\`.`)
      console.error(
        '  إن لم تتغيّر الهندسة فقد تغيّر إصدار Chrome؛ الفرق عندها في البكسل لا في المصدر.',
      )
      process.exit(1)
    }
    console.log('✓ أيقونات العلامة مطابقة للهندسة — لا انحراف.')
  } else {
    console.log('توليد أيقونات العلامة:')
    for (const r of results) {
      console.log(
        `  ✓ icon-${r.size}.png  ${String(r.bytes).padStart(5)} بايت${r.same ? '  (بلا تغيير)' : ''}`,
      )
    }
    console.log(`  المربّع ${TILE} · العلامة ${MARK} · نصف القطر ${RADIUS * 100}%`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
