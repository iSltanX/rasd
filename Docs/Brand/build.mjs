#!/usr/bin/env node
/**
 * أصول هوية رصد ← `Docs/Brand/{svg,png,tests,directions,guide}`.
 *
 * **مصدر واحد للهندسة.** كل رقم في الشعار مكتوب هنا مرّة واحدة، وكل ملفّ في
 * المجلّدات الخمسة مخرَج لا مصدر: لا يُحرَّر SVG ولا PNG بيد. مكوّنات Figma في
 * الصفحة `03 — Logo` مبنيّة من سلاسل SVG نفسها التي يكتبها هذا السكربت.
 *
 * **الشبكة:** قطر الحلقة `16u`. السماكة `3u`، والفتحة `4u` على القطر الصاعد إلى
 * أعلى اليمين، ونصف قطر النقطة المعيّنة `3u`. القصّ الصغير (16–20 بكسل) يوسّع
 * الفتحة إلى `4.5u` ويكبّر النقطة إلى `3.25u`: قِيس عند 16 بكسل أن فتحة `3u`
 * تذوب في تنعيم الحوافّ فتُقرأ الحلقة مغلقة (`tests/07-cuts.png`).
 *
 * **الكتابة:** «رصد» بخطّ Almarai ExtraBold محوَّلة إلى مسارات في Figma
 * (العقدة `244:270`)، فلا يعتمد أي ملفّ على وجود الخطّ. حجم الخطّ في القفل
 * الأفقي `1.2 × القطر` — عندها تساوي سماكة القائم في الحرف (`0.155em`) سماكة
 * الحلقة (`3u`) بفرق أقلّ من 1%.
 *
 * **لماذا Chrome لا مكتبة ترسيم:** المنطق نفسه في ADR 0016 — لا مُرسِّم SVG في
 * التبعيات، وChrome شرط قائم لسكربتات `verify:*`. وناتج البكسل قد يختلف بين
 * إصدارَي متصفّح بلا تغيّر في المصدر، فملفّات SVG هي المرجع عند أي خلاف.
 *
 *   node Docs/Brand/build.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = fileURLToPath(new URL('../..', import.meta.url))
const fontsDir = join(root, 'public', 'assets', 'fonts')

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

// ── الألوان: درجات من سلالم النظام، لا قيم مخترعة ─────────────────────────
const COLOR = {
  /** `color/ink/1000` — الحبر. */
  ink: '#070b0d',
  /** `color/ink/50` — الورق. */
  paper: '#f4f7f9',
  /** `color/signal/300` — لون العلامة على السطوح الداكنة. */
  signal: '#00e3c9',
  /** `color/signal/700` — لون العلامة على السطوح الفاتحة (`text/brand` الفاتح). */
  signalDeep: '#007063',
  /** `color/signal/600` — النسخة الأحادية لشريط المتصفّح: أعدل درجة بين الشريطين. */
  mono: '#008c7c',
}

// ── الهندسة ───────────────────────────────────────────────────────────────
/** قطر الحلقة بوحدات الشبكة. */
const D = 16

/** القصّان: `W` سماكة الحلقة، `G` عرض الفتحة، `N` نصف قطر النقطة المعيّنة. */
const CUT = {
  regular: { W: 3, G: 4, N: 3 },
  small: { W: 3, G: 4.5, N: 3.25 },
}

/** نصف قطر زاوية البلاطة نسبةً إلى ضلعها — نسبة بلاطات النظام القائمة (ADR 0016). */
const TILE_RADIUS = 0.2237

/**
 * البلاطة: العلامة تشغل 75% من الضلع، إلا عند 16 فتشغل 87.5% بخطّ أرفع قليلًا —
 * منطق القصّات نفسه مطبَّقًا على الحشوة. القيم بوحدات بلاطة ضلعها `side`.
 */
const TILE = {
  regular: { side: 32, d: 24, W: 4.5, G: 6, N: 4.5 },
  small: { side: 16, d: 14, W: 2.75, G: 4.5, N: 2.75 },
}

/**
 * كتابة «رصد» — Almarai ExtraBold عند 1000 بكسل، محوَّلة إلى مسارات في Figma.
 * صندوق الحبر `1747 × 711`، وخطّ القاعدة عند `y = 473`، وذيل الراء ينزل إلى 711.
 */
const WORD = {
  w: 1747,
  h: 711,
  /** حجم الخطّ الذي قِيست عنده المسارات. */
  em: 1000,
  paths: [
    'M101 7C118.333 2.99999 142.333 0.999987 173 0.999987C255 0.999987 321 26.6667 371 78C415.667 124 438 182.333 438 253V302C438 320.667 438.333 334.667 439 344H464V473H451L414 427H411C405 433.667 399.667 439.333 395 444C371.667 462.667 345.333 472.333 316 473H0V344H270C279.333 344 284 339.333 284 330V265C284 224.333 271.333 191 246 165C221.333 139 189 126 149 126C128.333 126 112.333 127.333 101 130V7Z',
    'M789.023 136C875.69 45.3333 976.357 0 1091.02 0C1173.69 0 1242.36 25 1297.02 75C1348.36 121 1374.02 179 1374.02 249V349C1374.02 380.333 1363.69 407.667 1343.02 431C1318.36 459 1287.36 473 1250.02 473H456.023V344H636.023V13H790.023L789.023 136ZM1220.02 266C1220.02 239.333 1212.36 214 1197.02 190C1167.02 151.333 1125.02 132 1071.02 132C1020.36 132 971.023 150 923.023 186C871.023 224 826.357 276.667 789.023 344H1205.02C1215.02 344 1220.02 339.333 1220.02 330V266Z',
    'M1746.88 13V435C1746.88 525.667 1717.54 595 1658.88 643C1624.87 671.667 1584.54 691.667 1537.88 703C1514.54 708.333 1488.54 711 1459.88 711L1433.88 709L1370.88 630V577C1372.87 577.667 1376.54 578.333 1381.88 579C1399.21 582.333 1414.54 584 1427.88 584C1483.21 582.667 1524.21 569 1550.88 543C1578.21 515.667 1591.88 473.667 1591.88 417V13H1746.88Z',
  ],
}

/** القفلان بوحدات قطرها 160 (أي `u = 10`)، كي تبقى الكسور مقروءة. */
const LOCKUP = {
  d: 160,
  horizontal: { font: 1.2, gap: 5 },
  stacked: { font: 0.9, gap: 4 },
}

const n = (v) => Number(v.toFixed(4))

/**
 * الحلقة المفتوحة مسارًا واحدًا. الفتحة شريط متوازي الحافّتين على القطر الصاعد
 * (−45°)، فحافّتاها توازيان ضلعَي النقطة المعيّنة. تُحسب نقاط التقاطع في إطار
 * محوره الفتحة ثم تُدار، فلا `transform` ولا `mask` على الرمز في الملفّ الناتج.
 */
function ringPath(cx, cy, R, W, G) {
  const r = R - W
  const h = G / 2
  const k = Math.SQRT1_2
  const xo = Math.sqrt(R * R - h * h)
  const xi = Math.sqrt(r * r - h * h)
  const at = (x, y) => `${n(cx + k * (x + y))} ${n(cy + k * (y - x))}`
  return (
    `M${at(xo, -h)} A${n(R)} ${n(R)} 0 1 0 ${at(xo, h)} ` +
    `L${at(xi, h)} A${n(r)} ${n(r)} 0 1 1 ${at(xi, -h)} Z`
  )
}

const nuqtaPath = (cx, cy, N) =>
  `M${n(cx)} ${n(cy - N)} L${n(cx + N)} ${n(cy)} L${n(cx)} ${n(cy + N)} L${n(cx - N)} ${n(cy)} Z`

/** العلامة داخل مربّع ضلعه `d` يبدأ عند `(x, y)`؛ القيم بوحدات ذلك المربّع. */
function mark({ x = 0, y = 0, d, W, G, N, ring, nuqta }) {
  const c = d / 2
  return (
    `<path fill="${ring}" d="${ringPath(x + c, y + c, c, W, G)}"/>` +
    `<path fill="${nuqta}" d="${nuqtaPath(x + c, y + c, N)}"/>`
  )
}

const svgDoc = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" role="img" aria-label="${title}">` +
  `<title>${title}</title>${body}</svg>\n`

// ── النُّسخ اللونية ───────────────────────────────────────────────────────
const TONES = {
  /** لون واحد يرثه من السياق. */
  mono: { ring: 'currentColor', nuqta: 'currentColor', word: 'currentColor' },
  /** للخلفيات الفاتحة. */
  light: { ring: COLOR.signalDeep, nuqta: COLOR.ink, word: COLOR.ink },
  /** للخلفيات الداكنة. */
  dark: { ring: COLOR.signal, nuqta: COLOR.paper, word: COLOR.paper },
}

const symbolSvg = (cut, tone) =>
  svgDoc(D, D, mark({ d: D, ...CUT[cut], ring: tone.ring, nuqta: tone.nuqta }), 'رصد')

function wordBody(x, y, scale, fill) {
  const d = WORD.paths.join(' ')
  return `<path fill="${fill}" transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})" d="${d}"/>`
}

const wordmarkSvg = (tone) => svgDoc(WORD.w, WORD.h, wordBody(0, 0, 1, tone.word), 'رصد')

/** الرمز يمين الكلمة (يسبقها في اتجاه القراءة)، ومركزه على مركز حبرها رأسيًّا. */
function horizontalSvg(tone) {
  const { d } = LOCKUP
  const u = d / D
  const scale = (LOCKUP.horizontal.font * d) / WORD.em
  const w = WORD.w * scale
  const h = WORD.h * scale
  const gap = LOCKUP.horizontal.gap * u
  const body =
    wordBody(0, (d - h) / 2, scale, tone.word) +
    mark({ x: w + gap, y: 0, d, ...scaleCut(CUT.regular, u), ring: tone.ring, nuqta: tone.nuqta })
  return svgDoc(w + gap + d, d, body, 'رصد')
}

/** الرمز فوق الكلمة، والاثنان متمركزان أفقيًّا على حبرهما. */
function stackedSvg(tone) {
  const { d } = LOCKUP
  const u = d / D
  const scale = (LOCKUP.stacked.font * d) / WORD.em
  const w = WORD.w * scale
  const h = WORD.h * scale
  const gap = LOCKUP.stacked.gap * u
  const body =
    mark({
      x: (w - d) / 2,
      y: 0,
      d,
      ...scaleCut(CUT.regular, u),
      ring: tone.ring,
      nuqta: tone.nuqta,
    }) + wordBody(0, d + gap, scale, tone.word)
  return svgDoc(w, d + gap + h, body, 'رصد')
}

function scaleCut(cut, u) {
  return { W: cut.W * u, G: cut.G * u, N: cut.N * u }
}

const STATE_LABEL = { idle: 'خاملة', active: 'نشطة', mono: 'أحادية' }

/** حالتا أيقونة شريط الأدوات، والنسخة الأحادية بلا بلاطة. */
const STATES = {
  /** خاملة: بلاطة حبر، حلقة بلون العلامة، نقطة ورقية. */
  idle: { tile: COLOR.ink, ring: COLOR.signal, nuqta: COLOR.paper },
  /** نشطة: البلاطة تُضاء بلون العلامة، والعلامة حبر. */
  active: { tile: COLOR.signal, ring: COLOR.ink, nuqta: COLOR.ink },
}

function iconSvg(cut, state) {
  const t = TILE[cut]
  const s = STATES[state]
  const pad = (t.side - t.d) / 2
  const body =
    `<rect width="${t.side}" height="${t.side}" rx="${n(t.side * TILE_RADIUS)}" fill="${s.tile}"/>` +
    mark({ x: pad, y: pad, d: t.d, W: t.W, G: t.G, N: t.N, ring: s.ring, nuqta: s.nuqta })
  return svgDoc(t.side, t.side, body, state === 'idle' ? 'رصد — خاملة' : 'رصد — نشطة')
}

const iconMonoSvg = (cut) =>
  svgDoc(D, D, mark({ d: D, ...CUT[cut], ring: COLOR.mono, nuqta: COLOR.mono }), 'رصد')

/** القصّ الصغير حتى 20 بكسل، والعادي فوقها. */
const cutFor = (px) => (px <= 20 ? 'small' : 'regular')

// ── الاتجاهات الثلاثة (رسوم أوّلية للتوثيق، على شبكة 64) ───────────────────
const SKETCH = {
  /** القبّة: قبّة مرصد بشقّ مائل يتّجه إلى نجمة معيّنة. */
  dome: (c) =>
    `<defs><mask id="dome"><rect width="64" height="64" fill="#000"/>` +
    `<path fill="#fff" d="M4 58 V54 A28 28 0 0 1 60 54 V58 Z"/>` +
    `<rect x="28.5" y="10" width="7" height="60" fill="#000" transform="rotate(25 32 56)"/></mask></defs>` +
    `<rect width="64" height="64" fill="${c}" mask="url(#dome)"/>` +
    `<path fill="${c}" d="${nuqtaPath(52, 12, 9)}"/>`,
  /** الربعية: ربع قرص مركزه الزاوية العليا اليمنى، وفي مركزه بكسل. */
  quadrant: (c) =>
    `<path fill="${c}" d="M4 4 A56 56 0 0 0 60 60 L60 25 L39 25 L39 4 Z"/>` +
    `<rect x="46" y="4" width="14" height="14" fill="${c}"/>`,
}

/** الشعار الحالي (v2) — نسخة مجمَّدة من `mark-geometry.ts` للسجلّ، القصّان 16 و128. */
const V2 = {
  16: {
    box: [1052, 650],
    brackets: ['M256.25 50 L50 325 L256.25 600', 'M795.75 50 L1002 325 L795.75 600'],
    aperture: [372, 205, 308, 240, 86],
  },
  128: {
    box: [1338.75, 950],
    brackets: ['M368.75 50 L50 475 L368.75 900', 'M970 50 L1288.75 475 L970 900'],
    aperture: [404.375, 262.5, 530, 425, 160],
  },
}

function v2Mark(size, color) {
  const cut = V2[size]
  const [ax, ay, aw, ah, rx] = cut.aperture
  return (
    `<g fill="none" stroke="${color}" stroke-width="100" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${cut.brackets[0]}"/><path d="${cut.brackets[1]}"/>` +
    `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="${rx}"/></g>`
  )
}

/** v2 داخل مربّع ضلعه `px`: العلامة بعرض `inner` من الضلع، متمركزة. */
function v2Square(size, px, inner, color, tile) {
  const [vw, vh] = V2[size].box
  const w = px * inner
  const h = w * (vh / vw)
  const bg = tile
    ? `<rect width="${px}" height="${px}" rx="${n(px * TILE_RADIUS)}" fill="${tile}"/>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}">${bg}` +
    `<svg x="${n((px - w) / 2)}" y="${n((px - h) / 2)}" width="${n(w)}" height="${n(h)}" ` +
    `viewBox="0 0 ${vw} ${vh}">${v2Mark(size, color)}</svg></svg>`
  )
}

const square64 = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`

// ── الترسيم ───────────────────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'rasd-brand-'))

/**
 * يرسّم قائمة SVG إلى PNG بمقاساتها الحقيقية في تشغيل واحد للمتصفّح: كل SVG
 * يُرسم على `<canvas>` بمقاس البكسل المطلوب ثم يُقرأ `data:` — تشغيل Chrome مرّة
 * لكل صورة كان يعلّق بعد بضع عشرات.
 */
function rasterise(jobs) {
  const page = join(work, 'raster.html')
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
    const x = c.getContext('2d');
    if (j.bg) { x.fillStyle = j.bg; x.fillRect(0, 0, j.w, j.h); }
    x.drawImage(img, 0, 0, j.w, j.h);
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
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180_000 },
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

/** يصوّر صفحة HTML كاملة بمقاسها. */
function screenshot(html, out, w, h) {
  const page = join(work, `sheet-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(page, html)
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      `--window-size=${w},${h}`,
      `--screenshot=${out}`,
      `file://${page}`,
    ],
    { stdio: 'pipe', timeout: 180_000 },
  )
}

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

/** الـSVG مع `width`/`height` صريحين ولون موروث محدَّد — لازم للرسم على canvas. */
function sized(svg, px, color) {
  const withSize = svg.replace('<svg ', `<svg width="${px}" height="${px}" `)
  return color ? withSize.replaceAll('currentColor', color) : withSize
}

// ── 1) ملفّات SVG ─────────────────────────────────────────────────────────
for (const dir of ['svg', 'png', 'tests', 'directions', 'guide']) {
  mkdirSync(join(here, dir), { recursive: true })
}

const svgFiles = {}
for (const [name, tone] of Object.entries(TONES)) {
  svgFiles[`rasd-symbol-${name}.svg`] = symbolSvg('regular', tone)
  svgFiles[`rasd-symbol-small-${name}.svg`] = symbolSvg('small', tone)
  svgFiles[`rasd-lockup-horizontal-${name}.svg`] = horizontalSvg(tone)
  svgFiles[`rasd-lockup-stacked-${name}.svg`] = stackedSvg(tone)
}
svgFiles['rasd-wordmark-mono.svg'] = wordmarkSvg(TONES.mono)
for (const state of Object.keys(STATES)) {
  svgFiles[`rasd-icon-${state}.svg`] = iconSvg('regular', state)
  svgFiles[`rasd-icon-${state}-16.svg`] = iconSvg('small', state)
}
svgFiles['rasd-icon-mono.svg'] = iconMonoSvg('regular')
svgFiles['rasd-icon-mono-16.svg'] = iconMonoSvg('small')

for (const [name, content] of Object.entries(svgFiles)) {
  writeFileSync(join(here, 'svg', name), content)
}

// ── 2) ملفّات PNG ─────────────────────────────────────────────────────────
const SIZES = [16, 32, 48, 128]
const pngJobs = []
const symbolTones = {
  ink: { ...TONES.mono, fill: COLOR.ink },
  white: { ...TONES.mono, fill: COLOR.paper },
  light: TONES.light,
  dark: TONES.dark,
}
for (const size of SIZES) {
  const cut = cutFor(size)
  for (const [name, tone] of Object.entries(symbolTones)) {
    pngJobs.push({
      id: `png/rasd-symbol-${name}-${size}.png`,
      svg: sized(symbolSvg(cut, tone), size, tone.fill),
      w: size,
      h: size,
    })
  }
  for (const state of Object.keys(STATES)) {
    pngJobs.push({
      id: `png/rasd-icon-${state}-${size}.png`,
      svg: sized(iconSvg(cut, state), size),
      w: size,
      h: size,
    })
  }
}
for (const size of [16, 32]) {
  pngJobs.push({
    id: `png/rasd-icon-mono-${size}.png`,
    svg: sized(iconMonoSvg(cutFor(size)), size),
    w: size,
    h: size,
  })
}

// صور وسيطة لأوراق الاختبار: تُرسَّم ببكسلها الحقيقي ثم تُكبَّر بلا تنعيم.
const tmpJobs = []
const tmp = (id, svg, px, color) => {
  tmpJobs.push({ id: `tmp/${id}.png`, svg: sized(svg, px, color), w: px, h: px })
  return `tmp/${id}.png`
}

const PURE = { black: '#000000', white: '#ffffff' }
for (const size of [...SIZES, 20, 24]) {
  tmp(`sym-black-${size}`, symbolSvg(cutFor(size), TONES.mono), size, PURE.black)
  tmp(`sym-white-${size}`, symbolSvg(cutFor(size), TONES.mono), size, PURE.white)
  for (const cut of Object.keys(CUT)) {
    tmp(`cut-${cut}-${size}`, symbolSvg(cut, TONES.mono), size, COLOR.ink)
  }
}
/** فتحة `3u` — القيمة التي رُفضت بالقياس، تبقى في ورقة القصّات شاهدًا. */
const narrow = svgDoc(D, D, mark({ d: D, W: 3, G: 3, N: 3, ring: '#000', nuqta: '#000' }), 'رصد')
for (const size of [16, 20, 24]) tmp(`cut-narrow-${size}`, narrow, size, COLOR.ink)

for (const size of [128, 48, 32, 16]) {
  for (const [name, color] of [
    ['ink', COLOR.ink],
    ['paper', COLOR.paper],
  ]) {
    tmp(`dome-${name}-${size}`, square64(SKETCH.dome(color)), size)
    tmp(`quadrant-${name}-${size}`, square64(SKETCH.quadrant(color)), size)
    tmp(`ring-${name}-${size}`, symbolSvg(cutFor(size), TONES.mono), size, color)
  }
}
for (const [name, color] of [
  ['ink', COLOR.ink],
  ['paper', COLOR.paper],
]) {
  tmp(`v2-glyph-${name}-128`, v2Square(128, 128, 1, color, null), 128)
  tmp(`v2-glyph-${name}-16`, v2Square(16, 16, 1, color, null), 16)
}
tmp('v2-tile-128', v2Square(128, 128, 0.82, COLOR.ink, COLOR.signal), 128)
tmp('v2-tile-48', v2Square(128, 48, 0.82, COLOR.ink, COLOR.signal), 48)
tmp('v2-tile-32', v2Square(16, 32, 0.82, COLOR.ink, COLOR.signal), 32)
tmp('v2-tile-16', v2Square(16, 16, 0.88, COLOR.ink, COLOR.signal), 16)

const rendered = rasterise([...pngJobs, ...tmpJobs])
mkdirSync(join(work, 'tmp'), { recursive: true })
mkdirSync(join(work, 'png'), { recursive: true })
for (const job of [...pngJobs, ...tmpJobs]) {
  const buf = rendered.get(job.id)
  const dim = pngSize(buf)
  if (dim.w !== job.w || dim.h !== job.h) {
    console.error(`✗ ${job.id} خرج بمقاس ${dim.w}×${dim.h} لا ${job.w}×${job.h}`)
    process.exit(1)
  }
  writeFileSync(join(work, job.id), buf)
  if (job.id.startsWith('png/')) writeFileSync(join(here, job.id), buf)
}

// ── 3) أوراق الاختبار والتوثيق ────────────────────────────────────────────
const face = (family, weight, file) =>
  `@font-face{font-family:${family};font-weight:${weight};src:url("file://${join(fontsDir, file)}")}`

const BASE_CSS = `
${face('Cairo', 400, 'cairo-400-arabic.woff2')}
${face('Almarai', 800, 'almarai-800-arabic.woff2')}
${face('Almarai', 800, 'almarai-800-latin.woff2')}
${face('Mono', 400, 'geistmono-400-latin.woff2')}
*{box-sizing:border-box}
html,body{margin:0}
body{font:400 14px/1.5 Cairo,sans-serif;direction:rtl}
h1{font:800 22px/1.2 Almarai,sans-serif;margin:0 0 4px}
p{margin:0 0 20px;opacity:.72}
.num{font:400 12px/1 Mono,monospace;direction:ltr;unicode-bidi:isolate;opacity:.72}
.lbl{font:400 13px/1.2 Cairo,sans-serif;opacity:.78}
.row{display:flex;align-items:flex-end;gap:40px;flex-wrap:wrap}
.cell{display:flex;flex-direction:column;align-items:center;gap:12px}
.px{image-rendering:pixelated;display:block}
img,svg{display:block}
.band{padding:36px 40px}
.on-white{background:#ffffff;color:#000000}
.on-black{background:#000000;color:#ffffff}
.on-light{background:#f4f7f9;color:#192024}
.on-light-raised{background:#ffffff;color:#192024}
.on-dark{background:#070b0d;color:#f4f7f9}
.on-dark-raised{background:#0e1416;color:#f4f7f9}
`

const page = (body, css = '') =>
  `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>${BASE_CSS}${css}</style>${body}</html>`

const img = (src, px, zoom = 1) =>
  `<img class="${zoom > 1 ? 'px' : ''}" src="file://${join(work, src)}" width="${px * zoom}" height="${px * zoom}">`

/** عرض وارتفاع `viewBox` لملفّ SVG كتبه هذا السكربت. */
function viewBoxOf(svg) {
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/u.exec(svg)
  return { w: Number(match[1]), h: Number(match[2]) }
}

const inline = (svg, w, h, color) => {
  const withSize = svg.replace('<svg ', `<svg width="${n(w)}" height="${n(h)}" `)
  return color ? withSize.replaceAll('currentColor', color) : withSize
}

/** التسمية العربية بخطّ النصّ، والتقنية بالخطّ الثابت العرض — لا حروف عربية في Geist Mono. */
const cell = (content, label) =>
  `<div class="cell">${content}<span class="${/[\u0600-\u06FF]/u.test(label) ? 'lbl' : 'num'}">${label}</span></div>`

/** صفّ الأحجام الأربعة بحجمها الحقيقي، ثم 32 و16 مكبَّرَين ببكسلهما. */
function sizesRow(prefix) {
  return (
    `<div class="row">` +
    SIZES.toReversed()
      .map((s) => cell(img(`tmp/${prefix}-${s}.png`, s), `${s} px`))
      .join('') +
    cell(img(`tmp/${prefix}-32.png`, 32, 5), '32 px × 5') +
    cell(img(`tmp/${prefix}-16.png`, 16, 10), '16 px × 10') +
    `</div>`
  )
}

const sheets = []

sheets.push({
  out: 'tests/01-sizes-black-on-white.png',
  w: 1100,
  h: 330,
  html: page(
    `<div class="band on-white" style="min-height:330px"><h1>أسود على أبيض</h1>` +
      `<p>الرمز بلون واحد عند الأحجام الأربعة بمقاسها الحقيقي، ثم 32 و16 مكبَّرَين بلا تنعيم.</p>` +
      `${sizesRow('sym-black')}</div>`,
  ),
})
sheets.push({
  out: 'tests/02-sizes-white-on-black.png',
  w: 1100,
  h: 330,
  html: page(
    `<div class="band on-black" style="min-height:330px"><h1>أبيض على أسود</h1>` +
      `<p>الرمز بلون واحد عند الأحجام الأربعة بمقاسها الحقيقي، ثم 32 و16 مكبَّرَين بلا تنعيم.</p>` +
      `${sizesRow('sym-white')}</div>`,
  ),
})

function themeSheet(theme) {
  const tone = theme === 'light' ? 'light' : 'dark'
  const lock = (svg, h) => {
    const box = viewBoxOf(svg)
    return inline(svg, (h * box.w) / box.h, h)
  }
  const band = (cls, label) =>
    `<div class="band ${cls}"><h1>${label}</h1><p>الرمز والقفلان وأيقونة الشريط بحالتَيها.</p>` +
    `<div class="row">` +
    SIZES.toReversed()
      .map((s) => cell(img(`png/rasd-symbol-${tone}-${s}.png`, s), `${s} px`))
      .join('') +
    cell(lock(horizontalSvg(TONES[tone]), 64), 'أفقي 64') +
    cell(lock(horizontalSvg(TONES[tone]), 24), 'أفقي 24') +
    cell(lock(stackedSvg(TONES[tone]), 120), 'رأسي 120') +
    `</div><div class="row" style="margin-top:32px">` +
    ['idle', 'active']
      .flatMap((state) =>
        [48, 32, 16].map((s) =>
          cell(img(`png/rasd-icon-${state}-${s}.png`, s), `${STATE_LABEL[state]} ${s}`),
        ),
      )
      .join('') +
    cell(img('png/rasd-icon-mono-32.png', 32), `${STATE_LABEL.mono} 32`) +
    cell(img('png/rasd-icon-mono-16.png', 16), `${STATE_LABEL.mono} 16`) +
    `</div></div>`
  return theme === 'light'
    ? band('on-light', 'الوضع الفاتح — surface/canvas') +
        band('on-light-raised', 'الوضع الفاتح — surface/default')
    : band('on-dark', 'الوضع الداكن — surface/canvas') +
        band('on-dark-raised', 'الوضع الداكن — surface/default')
}
sheets.push({ out: 'tests/03-theme-light.png', w: 1200, h: 806, html: page(themeSheet('light')) })
sheets.push({ out: 'tests/04-theme-dark.png', w: 1200, h: 806, html: page(themeSheet('dark')) })

/** ألوان شريط أدوات Chrome المفترَضة — تُقاس في Chrome حقيقي في المرحلة 04. */
const TOOLBARS = [
  ['#ffffff', 'فاتح'],
  ['#f1f3f4', 'فاتح — شريط'],
  ['#35363a', 'داكن — شريط'],
  ['#202124', 'داكن'],
]
function toolbarSheet() {
  const strip = ([bg, label]) => {
    const fg = bg === '#ffffff' || bg === '#f1f3f4' ? '#192024' : '#f4f7f9'
    const set = (s, zoom) =>
      ['idle', 'active', 'mono']
        .map((state) => cell(img(`png/rasd-icon-${state}-${s}.png`, s, zoom), STATE_LABEL[state]))
        .join('')
    return (
      `<div class="band" style="background:${bg};color:${fg};padding:24px 40px">` +
      `<div class="row" style="align-items:center"><span style="width:130px">${label}<br>` +
      `<span class="num">${bg}</span></span>${set(16, 1)}${set(32, 1)}${set(16, 8)}</div></div>`
    )
  }
  return (
    `<div class="band on-light-raised" style="padding-bottom:8px"><h1>أيقونة شريط الأدوات</h1>` +
    `<p>خاملة ونشطة وأحادية، عند 16 و32 بمقاسها الحقيقي، ثم 16 مكبَّرة ثماني مرّات.</p></div>` +
    TOOLBARS.map(strip).join('')
  )
}
sheets.push({ out: 'tests/05-toolbar.png', w: 1200, h: 900, html: page(toolbarSheet()) })

function lockupSheet() {
  const lock = (svg, h, color) => {
    const box = viewBoxOf(svg)
    return inline(svg, (h * box.w) / box.h, h, color)
  }
  const band = (cls, tone, monoColor) =>
    `<div class="band ${cls}"><div class="row">` +
    [96, 48, 32, 24, 20].map((h) => cell(lock(horizontalSvg(TONES[tone]), h), `${h} px`)).join('') +
    cell(lock(horizontalSvg(TONES.mono), 48, monoColor), 'لون واحد 48') +
    `</div><div class="row" style="margin-top:36px">` +
    [180, 96, 64].map((h) => cell(lock(stackedSvg(TONES[tone]), h), `${h} px`)).join('') +
    cell(lock(stackedSvg(TONES.mono), 96, monoColor), 'لون واحد 96') +
    `</div></div>`
  return (
    `<div class="band on-light-raised" style="padding-bottom:0"><h1>القفلان</h1>` +
    `<p>الأفقي مقيسًا بارتفاع الرمز، والرأسي بارتفاعه الكامل.</p></div>` +
    band('on-light-raised', 'light', COLOR.ink) +
    band('on-dark', 'dark', COLOR.paper)
  )
}
sheets.push({ out: 'tests/06-lockups.png', w: 1200, h: 980, html: page(lockupSheet()) })

function cutsSheet() {
  const row = (label, id) =>
    `<div class="row" style="margin-bottom:28px;align-items:center"><span style="width:170px">${label}</span>` +
    [16, 20, 24].map((s) => cell(img(`tmp/cut-${id}-${s}.png`, s, 8), `${s} px × 8`)).join('') +
    `</div>`
  return (
    `<div class="band on-white"><h1>القصّات عند الأحجام الصغيرة</h1>` +
    `<p>الفتحة ‎3u‎ تذوب عند 16 بكسل؛ القصّ العادي ‎4u‎ يُقرأ من 24 فصاعدًا؛ والصغير ‎4.5u‎ لما دونها.</p>` +
    row('مرفوضة — فتحة 3u', 'narrow') +
    row('العادي — فتحة 4u', 'regular') +
    row('الصغير — فتحة 4.5u', 'small') +
    `</div>`
  )
}
sheets.push({ out: 'tests/07-cuts.png', w: 900, h: 860, html: page(cutsSheet()) })

// الاتجاهات
function directionSheet(title, note, id) {
  const band = (cls, tone) =>
    `<div class="band ${cls}"><div class="row">` +
    [128, 48, 32, 16].map((s) => cell(img(`tmp/${id}-${tone}-${s}.png`, s), `${s} px`)).join('') +
    cell(img(`tmp/${id}-${tone}-32.png`, 32, 5), '32 px × 5') +
    cell(img(`tmp/${id}-${tone}-16.png`, 16, 10), '16 px × 10') +
    `</div></div>`
  return (
    `<div class="band on-light-raised" style="padding-bottom:0"><h1>${title}</h1><p>${note}</p></div>` +
    band('on-light-raised', 'ink') +
    band('on-dark', 'paper')
  )
}
sheets.push({
  out: 'directions/01-dome.png',
  w: 1100,
  h: 640,
  html: page(
    directionSheet(
      'الاتجاه الأوّل — القبّة',
      'قبّة مرصد بشقّ مائل يتّجه إلى نقطة معيّنة. ثلاثة أشكال.',
      'dome',
    ),
  ),
})
sheets.push({
  out: 'directions/02-quadrant.png',
  w: 1100,
  h: 640,
  html: page(
    directionSheet(
      'الاتجاه الثاني — الربعية',
      'ربع قرص مركزه زاوية البداية في الصفحة العربية، وفي مركزه بكسل. شكلان.',
      'quadrant',
    ),
  ),
})
sheets.push({
  out: 'directions/03-ring.png',
  w: 1100,
  h: 640,
  html: page(
    directionSheet(
      'الاتجاه الثالث — الحلقة والنقطة',
      'حلقة مفتوحة على القطر الصاعد، وفي مركزها نقطة معيّنة. شكلان.',
      'ring',
    ),
  ),
})

function currentSheet() {
  const band = (cls, tone) =>
    `<div class="band ${cls}"><div class="row">` +
    cell(img(`tmp/v2-glyph-${tone}-128.png`, 128), 'الرمز 128') +
    cell(img(`tmp/v2-glyph-${tone}-16.png`, 16), 'الرمز 16') +
    cell(img(`tmp/v2-glyph-${tone}-16.png`, 16, 10), 'الرمز 16 × 10') +
    cell(img('tmp/v2-tile-48.png', 48), 'البلاطة 48') +
    cell(img('tmp/v2-tile-32.png', 32), 'البلاطة 32') +
    cell(img('tmp/v2-tile-16.png', 16), 'البلاطة 16') +
    cell(img('tmp/v2-tile-16.png', 16, 10), 'البلاطة 16 × 10') +
    `</div></div>`
  return (
    `<div class="band on-light-raised" style="padding-bottom:0"><h1>الشعار الحالي — v2</h1>` +
    `<p>قوسان وفتحة بنسبة 1.4 : 1. داخل مربّع 16 بكسل يبقى له تسعة بكسلات ارتفاعًا لثلاثة أشكال.</p></div>` +
    band('on-light-raised', 'ink') +
    band('on-dark', 'paper')
  )
}
sheets.push({ out: 'directions/00-current-v2.png', w: 1100, h: 640, html: page(currentSheet()) })

function comparisonSheet() {
  const band = (cls, tone) =>
    `<div class="band ${cls}"><div class="row">` +
    cell(img(`tmp/v2-glyph-${tone}-16.png`, 16, 10), 'الحالي v2') +
    cell(img(`tmp/dome-${tone}-16.png`, 16, 10), '١ القبّة') +
    cell(img(`tmp/quadrant-${tone}-16.png`, 16, 10), '٢ الربعية') +
    cell(img(`tmp/ring-${tone}-16.png`, 16, 10), '٣ الحلقة والنقطة') +
    `</div></div>`
  return (
    `<div class="band on-light-raised" style="padding-bottom:0"><h1>المقارنة عند 16 بكسل</h1>` +
    `<p>كلٌّ مرسَّم ببكسله الحقيقي ثم مكبَّر عشر مرّات بلا تنعيم.</p></div>` +
    band('on-light-raised', 'ink') +
    band('on-dark', 'paper')
  )
}
sheets.push({
  out: 'directions/04-comparison-16.png',
  w: 1000,
  h: 640,
  html: page(comparisonSheet()),
})

// دليل الاستخدام
function constructionSheet() {
  const S = 640
  const u = S / 24
  const o = 4 * u
  const grid = Array.from({ length: 25 }, (_, i) => {
    const p = n(i * u)
    const major = i >= 4 && i <= 20
    const op = major ? 0.22 : 0.08
    return (
      `<line x1="${p}" y1="0" x2="${p}" y2="${S}" stroke="#192024" stroke-opacity="${op}"/>` +
      `<line x1="0" y1="${p}" x2="${S}" y2="${p}" stroke="#192024" stroke-opacity="${op}"/>`
    )
  }).join('')
  const c = S / 2
  const cut = scaleCut(CUT.regular, u)
  const label = (x, y, text, anchor = 'middle') =>
    `<text x="${n(x)}" y="${n(y)}" font-family="Mono" font-size="15" fill="#192024" text-anchor="${anchor}">${text}</text>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${grid}` +
    `<rect x="${o}" y="${o}" width="${16 * u}" height="${16 * u}" fill="none" stroke="${COLOR.signalDeep}" stroke-dasharray="6 6"/>` +
    mark({ x: o, y: o, d: 16 * u, ...cut, ring: COLOR.signalDeep, nuqta: COLOR.ink }) +
    `<line x1="${o}" y1="${c}" x2="${o + cut.W}" y2="${c}" stroke="#e5484d" stroke-width="3"/>` +
    label(o + cut.W / 2, c - 10, '3u') +
    `<line x1="${c - cut.N}" y1="${c + cut.N + 14}" x2="${c + cut.N}" y2="${c + cut.N + 14}" stroke="#e5484d" stroke-width="3"/>` +
    label(c, c + cut.N + 36, '6u') +
    label(c + 6.4 * u, c - 7.2 * u, '4u', 'start') +
    label(c, o - 14, '16u') +
    label(u * 2, c - 10, '4u') +
    `<line x1="0" y1="${c}" x2="${o}" y2="${c}" stroke="#e5484d" stroke-width="3" stroke-dasharray="3 5"/>` +
    `</svg>`
  return (
    `<div class="band on-light-raised"><h1>شبكة البناء والمساحة الآمنة</h1>` +
    `<p>القطر ‎16u‎ · السماكة ‎3u‎ · الفتحة ‎4u‎ · قطر النقطة ‎6u‎ · المساحة الآمنة ‎4u‎ من كل جهة.</p>${svg}</div>`
  )
}
sheets.push({ out: 'guide/construction.png', w: 720, h: 800, html: page(constructionSheet()) })

function misuseSheet() {
  const base = (extra = '', tone = TONES.light) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 16 16" ${extra}>` +
    `${mark({ d: D, ...CUT.regular, ring: tone.ring, nuqta: tone.nuqta })}</svg>`
  const closed =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 16 16">` +
    `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${COLOR.signalDeep}" stroke-width="3"/>` +
    `<path fill="${COLOR.ink}" d="${nuqtaPath(8, 8, 3)}"/></svg>`
  const round =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 16 16">` +
    `<path fill="${COLOR.signalDeep}" d="${ringPath(8, 8, 8, 3, 4)}"/>` +
    `<circle cx="8" cy="8" r="2.4" fill="${COLOR.ink}"/></svg>`
  const items = [
    [base('style="transform:rotate(90deg)"'), 'تدوير الفتحة عن أعلى اليمين'],
    [base('style="transform:scaleX(-1)"'), 'قلب الرمز أفقيًّا'],
    [closed, 'إغلاق الحلقة'],
    [round, 'تدوير النقطة'],
    [base('style="transform:scaleX(1.35)"'), 'المطّ'],
    [base('', { ring: '#e5484d', nuqta: '#f5a524' }), 'ألوان خارج النظام'],
    [base('style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.45))"'), 'ظلّ أو توهّج'],
    [
      `<div style="background:#ffffff;padding:0">${base('', { ring: COLOR.signal, nuqta: COLOR.signal })}</div>`,
      'لون العلامة الفاتح على أبيض',
    ],
  ]
  return (
    `<div class="band on-light-raised"><h1>الممنوعات</h1><p>ثمانية أشياء تُفسد الشعار.</p>` +
    `<div class="row" style="gap:48px 56px;align-items:flex-start">` +
    items
      .map(
        ([svg, text]) =>
          `<div class="cell" style="width:150px;text-align:center"><div style="width:130px;height:110px;display:flex;align-items:center;justify-content:center">${svg}</div><span>${text}</span></div>`,
      )
      .join('') +
    `</div></div>`
  )
}
sheets.push({ out: 'guide/misuse.png', w: 900, h: 560, html: page(misuseSheet()) })

for (const sheet of sheets) {
  screenshot(sheet.html, join(here, sheet.out), sheet.w, sheet.h)
}

rmSync(work, { recursive: true, force: true })

console.log('أصول هوية رصد:')
console.log(`  ✓ svg/         ${Object.keys(svgFiles).length} ملفًّا`)
console.log(`  ✓ png/         ${pngJobs.length} ملفًّا`)
console.log(`  ✓ أوراق        ${sheets.length} (tests · directions · guide)`)
