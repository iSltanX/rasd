#!/usr/bin/env node
/**
 * أيقونات الإضافة ← `public/icons/icon-{16,32,48,128}.png` و`icon-active-{16,32}.png`.
 *
 * القرار وعلّته في [ADR 0016](../Docs/ADR/0016-mark-geometry-single-source.md) و
 * [ADR 0024](../Docs/ADR/0024-mark-v3-in-code.md)، وهو تمديد لخطّ الأنابيب في
 * [ADR 0007](../Docs/ADR/0007-token-pipeline.md): مصدر مودَع وتوليد بلا شبكة. المصدر
 * `src/ui/mark-geometry.ts` — الهندسة نفسها التي يرسمها `RasdMark.tsx` في الواجهة
 * ويقرؤها `Docs/Brand/build.mjs` — فلا ينحرف الشعار في شريط الأدوات عن الشعار
 * داخل النافذة ولا عن أصول الهوية.
 *
 * **حالتان لا حالة واحدة.** الخاملة (بلاطة حبر، حلقة بلون العلامة، نقطة ورقية) هي
 * أيقونة البيان في المقاسات الأربعة. والنشطة (البلاطة تُضاء بلون العلامة والعلامة حبر)
 * تبدّلها الخلفية بـ`chrome.action.setIcon` ما دامت أداة من رصد تعمل على الصفحة، فيكفيها
 * مقاسا الشريط 16 و32. الفرق فرق إضاءة لا فرق لون وحده، فيُرى لمن لا يميّز الألوان.
 *
 * **الألوان من التوكنز لا حرفية**، في الوضع الداكن: الخاملة `surface/canvas`
 * و`text/brand` و`text/primary`، والنشطة `surface/brand` و`text/on-brand`.
 *
 * **ترسيم واحد لكل التشغيل:** كل SVG يُرسم على `<canvas>` بمقاسه الحقيقي داخل تشغيل
 * واحد للمتصفّح — تشغيل Chrome مرّة لكل صورة كان يعلّق. والطريقة نفسها في
 * `Docs/Brand/build.mjs`، فتخرج `icon-16.png` مطابقة بايتًا لـ`rasd-icon-idle-16.png`
 * على إصدار Chrome نفسه — ويثبت ذلك `tests/unit/ui/brand-icons.test.ts`.
 *
 * **لماذا خارج CI:** ناتج البكسل قد يختلف بين إصدارَي متصفّح بلا تغيّر في المصدر،
 * فمقارنة البايت في CI تُنتج فشلًا كاذبًا. يُشغَّل محليًّا عند تغيّر الشعار.
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
import {
  MARK_TILE,
  MARK_TILE_RADIUS,
  markCutFor,
  markPaths,
  round4,
} from '../src/ui/mark-geometry.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'public', 'icons')
const CHECK = process.argv.includes('--check')

/** الحالتان: البلاطة، والحلقة، والنقطة — ألوان الوضع الداكن. */
const STATES = {
  idle: {
    label: 'رصد — خاملة',
    tile: resolveColor('surface/canvas', 'dark'),
    ring: resolveColor('text/brand', 'dark'),
    nuqta: resolveColor('text/primary', 'dark'),
  },
  active: {
    label: 'رصد — نشطة',
    tile: resolveColor('surface/brand', 'dark'),
    ring: resolveColor('text/on-brand', 'dark'),
    nuqta: resolveColor('text/on-brand', 'dark'),
  },
}

/**
 * الملفّات ومقاساتها. المقاسات الأربعة يطلبها البيان (`manifest.config.ts`)، والنشطة
 * مقاسا الشريط وحدهما لأن `setIcon` لا يُستعمل خارجه.
 */
const JOBS = [
  ...[16, 32, 48, 128].map((size) => ({ file: `icon-${size}.png`, size, state: 'idle' })),
  ...[16, 32].map((size) => ({ file: `icon-active-${size}.png`, size, state: 'active' })),
]

/**
 * بلاطة الأيقونة بصيغة `Docs/Brand/build.mjs` حرفًا بحرف (العنوان والترتيب والتقريب)،
 * كي يطابق الناتجُ أصلَ الهوية بايتًا على المتصفّح نفسه.
 */
function tileSvg(size, state) {
  const t = MARK_TILE[markCutFor(size)]
  const s = STATES[state]
  const pad = (t.side - t.d) / 2
  const paths = markPaths(pad, pad, t.d, t)
  const body =
    `<rect width="${t.side}" height="${t.side}" rx="${round4(t.side * MARK_TILE_RADIUS)}" fill="${s.tile}"/>` +
    `<path fill="${s.ring}" d="${paths.ring}"/>` +
    `<path fill="${s.nuqta}" d="${paths.nuqta}"/>`
  return (
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.side} ${t.side}" ` +
    `role="img" aria-label="${s.label}"><title>${s.label}</title>${body}</svg>\n`
  )
}

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
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

/** يرسّم كل البلاطات في تشغيل واحد، والخلفية شفّافة كي تبقى الزوايا مستديرة فعلًا. */
function rasterise(workDir) {
  const jobs = JOBS.map((j) => ({
    id: j.file,
    svg: tileSvg(j.size, j.state),
    w: j.size,
    h: j.size,
  }))
  const page = join(workDir, 'raster.html')
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><pre id="out">pending</pre><script>
const jobs = ${JSON.stringify(jobs)};
(async () => {
  const out = {};
  for (const j of jobs) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(j.svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = j.w; c.height = j.h;
    c.getContext('2d').drawImage(img, 0, 0, j.w, j.h);
    out[j.id] = c.toDataURL('image/png');
  }
  document.getElementById('out').textContent = JSON.stringify(out);
})();
</script>`,
  )
  const dom = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=30000',
      '--dump-dom',
      `file://${page}`,
    ],
    { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 },
  ).toString()
  const match = /<pre id="out">([\s\S]*?)<\/pre>/u.exec(dom)
  if (!match || match[1] === 'pending') {
    console.error('✗ لم يُكمل المتصفّح الترسيم.')
    process.exit(1)
  }
  const data = JSON.parse(match[1].replaceAll('&amp;', '&'))
  return new Map(
    Object.entries(data).map(([id, url]) => [id, Buffer.from(url.split(',')[1], 'base64')]),
  )
}

const workDir = mkdtempSync(join(tmpdir(), 'rasd-brand-icons-'))
let drift = 0

try {
  const rendered = rasterise(workDir)
  const results = JOBS.map((job) => {
    const next = rendered.get(job.file)
    const dim = pngSize(next)
    if (dim.w !== job.size || dim.h !== job.size) {
      console.error(`✗ ${job.file} خرج بمقاس ${dim.w}×${dim.h} لا ${job.size}×${job.size}`)
      process.exit(1)
    }
    const dest = join(outDir, job.file)
    const prev = existsSync(dest) ? readFileSync(dest) : null
    const same = prev !== null && prev.equals(next)
    if (CHECK) {
      if (!same) drift++
    } else if (!same) {
      writeFileSync(dest, next)
    }
    return { ...job, bytes: next.length, same }
  })

  if (CHECK) {
    if (drift > 0) {
      console.error(`✗ انحراف في ${drift} أيقونة — شغّل \`pnpm icons:brand\`.`)
      console.error(
        '  إن لم تتغيّر الهندسة فقد تغيّر إصدار Chrome؛ الفرق عندها في البكسل لا في المصدر.',
      )
      process.exit(1)
    }
    console.log(`✓ أيقونات العلامة الستّ مطابقة للهندسة — لا انحراف.`)
  } else {
    console.log('توليد أيقونات العلامة:')
    for (const r of results) {
      console.log(
        `  ✓ ${r.file.padEnd(20)} ${String(r.bytes).padStart(5)} بايت · ${r.state}${r.same ? '  (بلا تغيير)' : ''}`,
      )
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
