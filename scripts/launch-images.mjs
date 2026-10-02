#!/usr/bin/env node
/**
 * مواد الإطلاق — من لقطات الإضافة الحيّة لا من رسمٍ لها (`Docs/Launch/README.md`).
 *
 *   pnpm design:shots --dpr=2 --only=overlay,editor,library,settings   # → artifacts/design/shots@2x/
 *   pnpm launch:images                # → Docs/Launch/{screens,promo,icons,readme}/
 *
 * **اللقطة من Chrome، والإطار وحده يُرسم هنا.** كل لقطة متجر (1280×800) شريطُ عنوانٍ بالهوية فوق لقطةٍ حيّة من
 * `design:shots --dpr=2` كما رسمها Chrome بالإضافة المبنيّة، مقصوصةً من أعلاها ومصغَّرةً بالنسبة نفسها في المحورين
 * (1440 → 1280) — لا تمديد ولا واجهة مصطنعة. **واللقطات بكثافة 2×** (`artifacts/design/shots@2x/`): التصغير إلى 1280 من
 * 2880 حادّ، ومن 1440 ضبابي، وصور README تُلتقط ×2 فتحتاج مصدرًا بالكثافة نفسها. فما تعرضه الصور هو ما يراه المستخدم، ويتغيّر بتغيّرها بإعادة الأمرين.
 *
 * **والنصوص من ملفّ لا من الشيفرة** (`Docs/Launch/content.json`): العناوين بالعربية والإنجليزية، وترتيب اللقطات
 * ترتيب الرفع. **والمتصفّحات من نتيجة الاختبار** (`Docs/Launch/browsers.json`): لا يظهر في شريط «يعمل حيث تعمل أنت»
 * إلا ما حالته `supported` هناك — ولا شعار متصفّح، اسمه بخطّ الهوية وحده.
 *
 * والأيقونة 128 بعملٍ فنّي 96 وحاشيةٍ شفّافة 16 كما تطلب صفحة صور المتجر، من المصدر المتّجه
 * (`Docs/Brand/svg/rasd-icon-idle.svg`)، ومنه شعار Edge (300). والترويجيتان (440×280 و1400×560) من الهوية: الإرشاد
 * أن تحمل العلامة لا أن تكرّر لقطة. **وصور README ألواحُ التصميم المعتمد في Figma** (الصفحة `35 — README`): عرضها المنطقي
 * 960 وتُلتقط ×2، ونصوصها في `content.json` تحت `readme`.
 *
 * **لقطات Opera (612×408) وأيقونة AMO (64)** (`opera-*` و`amo-icon-64`): من اللقطات الحيّة نفسها، بخلفية بيضاء كما تشترط
 * إرشادات نشر Opera. وتُولَّد وحدها بـ`pnpm launch:images --only=opera,amo` فلا تُمسّ بقيّة الصور (إطلاق كروم آخر قد يغيّر
 * بايتات ما لم يتغيّر). الفئات: `screens` `promo` `icons` `readme` `opera` `amo`.
 *
 * إطلاقٌ واحد لكروم لكل الصور (`Docs/Brand` — الإطلاق لكل صورة يعلّق). منفذه 9396، ليس من منافذ الحرّاس.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { connectCdp, evaluator, findChrome, launchChrome, openTarget, ROOT } from './lib/cdp.mjs'

const PORT = Number(process.env.RASD_LAUNCH_IMAGES_PORT ?? 9396)
/** اللقطات الحيّة بكثافة 2× — `pnpm design:shots --dpr=2`. */
const SHOT_DPR = 2
const SHOTS = join(ROOT, 'artifacts', 'design', `shots@${SHOT_DPR}x`)
const LAUNCH = join(ROOT, 'Docs', 'Launch')
const FONTS = join(ROOT, 'public', 'assets', 'fonts')
const BRAND = join(ROOT, 'Docs', 'Brand', 'svg')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const file = (p) => pathToFileURL(p).href
const content = JSON.parse(readFileSync(join(LAUNCH, 'content.json'), 'utf8'))
const browsers = JSON.parse(readFileSync(join(LAUNCH, 'browsers.json'), 'utf8'))

/** الألوان من توكنز الهوية (`public/assets/tokens.css`) — الحبر والإشارة. */
const INK_1000 = '#070b0d'
const INK_975 = '#0e1416'
const INK_950 = '#192024'
const INK_900 = '#283237'
const INK_500 = '#7f94a0'
const INK_300 = '#b8c7cf'
const INK_50 = '#f4f7f9'
const SIGNAL_300 = '#00e3c9'

const face = (family, weight, name, range) =>
  `@font-face { font-family: ${family}; font-weight: ${weight}; src: url(${file(join(FONTS, name))}) format('woff2'); unicode-range: ${range}; }`
const AR = 'U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF'
const LATIN = 'U+0000-00FF, U+2000-206F, U+2190-21FF'
const fontFaces = `
  ${face('Almarai', 800, 'almarai-800-arabic.woff2', AR)}
  ${face('Almarai', 800, 'almarai-800-latin.woff2', LATIN)}
  ${face('Almarai', 700, 'almarai-700-arabic.woff2', AR)}
  ${face('Almarai', 700, 'almarai-700-latin.woff2', LATIN)}
  ${face('Cairo', 400, 'cairo-400-arabic.woff2', AR)}
  ${face('Cairo', 400, 'cairo-400-latin.woff2', LATIN)}
  ${face("'Geist Mono'", 400, 'geistmono-400-latin.woff2', LATIN)}
  * { margin: 0; box-sizing: border-box; }
  html, body { overflow: hidden; background: ${INK_1000}; }
`

const symbol = (size) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true"><path fill="${SIGNAL_300}" d="M22.0945 5.6628 A12 12 0 1 0 26.3372 9.9055 L22.9819 13.2608 A7.5 7.5 0 1 1 18.7392 9.0181 Z"/><path fill="${INK_50}" d="M16 11.5 L20.5 16 L16 20.5 L11.5 16 Z"/></svg>`
const lockup = (width) =>
  `<img src="${file(join(BRAND, 'rasd-lockup-horizontal-dark.svg'))}" width="${width}" alt="">`
const shotUrl = (name) => file(join(SHOTS, `${name}.png`))
const page = (lang, w, h, css, body) =>
  `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>${fontFaces}
    body { width: ${w}px; height: ${h}px; }
    ${css}
  </style></head><body>${body}</body></html>`

// ── لقطات المتجر — 1280×800 ─────────────────────────────────────
function screenHtml(shot, [title, sub], lang, index) {
  const scale = 1280 / 1440
  return page(
    lang,
    1280,
    800,
    `header { height: 112px; display: flex; align-items: center; gap: 20px; padding: 0 48px; border-bottom: 1px solid ${INK_950}; }
     .n { font: 400 15px/1 'Geist Mono', monospace; color: ${INK_500}; margin-inline-start: auto; letter-spacing: 0.08em; }
     h1 { font: 800 30px/1.25 Almarai, sans-serif; color: ${INK_50}; }
     p { font: 400 17px/1.45 Cairo, sans-serif; color: ${INK_300}; margin-top: 6px; }
     .shot { position: relative; width: 1280px; height: 688px; overflow: hidden; }
     .shot img { position: absolute; left: 0; top: 0; width: ${1440 * scale}px; height: ${900 * scale}px; }`,
    `<header>${symbol(44)}<div><h1>${title}</h1><p>${sub}</p></div><span class="n">${String(index).padStart(2, '0')}</span></header>
     <div class="shot"><img src="${shotUrl(shot)}" alt=""></div>`,
  )
}

// ── لقطات Opera — 612×408 على أبيض ──────────────────────────────
/** إرشادات النشر: «الخلفية بيضاء» و612×408 المفضَّل (الأقصى 800×600). اللقطة الحيّة نفسها مصغَّرةً بنسبتها (1.6) في وسط اللوحة. */
function operaHtml(shot, [title], lang) {
  const width = 540
  const height = (width * 900) / 1440
  return page(
    lang,
    612,
    408,
    `body { background: #ffffff; display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 14px; }
     h1 { font: 800 19px/1.3 Almarai, sans-serif; color: ${INK_975}; }
     .shot { width: ${width}px; height: ${height}px; border-radius: 8px; overflow: hidden; border: 1px solid ${INK_300};
       box-shadow: 0 6px 18px rgba(7,11,13,.16); }
     .shot img { display: block; width: ${width}px; height: ${height}px; }`,
    `<h1>${title}</h1><div class="shot"><img src="${shotUrl(shot)}" alt=""></div>`,
  )
}

// ── الترويجيتان — العلامة لا لقطة مكرّرة ─────────────────────────
const promoSmall = page(
  'ar',
  440,
  280,
  `body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
     background: radial-gradient(120% 90% at 50% 0%, ${INK_950} 0%, ${INK_1000} 70%); }
   p { font: 400 18px/1.4 Cairo, sans-serif; color: ${INK_300}; }`,
  `${lockup(230)}<p>${content.promo.small}</p>`,
)
const promoMarquee = page(
  'ar',
  1400,
  560,
  `body { display: flex; align-items: center; justify-content: space-between; padding: 0 96px;
     background: radial-gradient(90% 120% at 85% 50%, ${INK_950} 0%, ${INK_1000} 65%); }
   .brand { display: flex; flex-direction: column; gap: 28px; }
   p { font: 400 26px/1.5 Cairo, sans-serif; color: ${INK_300}; max-width: 600px; }
   .frame { width: 640px; height: 400px; border-radius: 14px; overflow: hidden; border: 1px solid ${INK_950}; }
   .frame img { width: 640px; height: 400px; display: block; }`,
  `<div class="brand">${lockup(380)}<p>${content.promo.marquee}</p></div>
   <div class="frame"><img src="${shotUrl('measure_two-elements--dark')}" alt=""></div>`,
)

// ── الأيقونتان — من المتّجه بحجمهما ─────────────────────────────
const icon = (size, art) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } html, body { background: transparent; width: ${size}px; height: ${size}px; overflow: hidden; }
  img { position: absolute; left: ${(size - art) / 2}px; top: ${(size - art) / 2}px; width: ${art}px; height: ${art}px; }
</style></head><body><img src="${file(join(BRAND, 'rasd-icon-idle.svg'))}" alt=""></body></html>`

// ── README — ألواح التصميم المعتمد في Figma (`35 — README`) ─────────
/**
 * **كل صورة README لوحٌ داكن مكتفٍ بخلفيته** بحافّة 1 وزوايا 16 شفّافة الأطراف، فيعمل على وضعَي GitHub بلا
 * `<picture>`. العرض المنطقي 960 (عمود README بين 830 و880) ويُلتقط ×2، فالقيمة الكبيرة ≥ 48 والنصّ ≥ 13 داخل
 * الصورة يبقيان مقروءين، وعلى الهاتف تبقى القيمة الكبيرة وحدها مقروءة — والقصّة صورةٌ لا نصّ.
 *
 * **والقصّة من اللقطة الحيّة بكثافتها** (`shots@2x`): مربّع القصّ بالبكسل المنطقي لإطار 1440 × 900 كما كُتب على
 * طبقته في Figma، والتكبير بالبكسل (`image-rendering: pixelated`) بلا تنعيم. **ولا شعار متصفّح** حتى يأذن أصحابها
 * (`Docs/Launch/README.md`): الاسم بخطّ الهوية وحده.
 */
const INK_800 = '#3c4a52'
const INK_400 = '#9baeb9'
const readme = content.readme
const supportedBrowsers = browsers.browsers.filter((b) => b.status === 'supported')

/** المقاس المنطقي للّقطة — من ترويسة PNG مقسومةً على كثافة الالتقاط. */
const logical = (name) => {
  const b = readFileSync(join(SHOTS, `${name}.png`))
  return [b.readUInt32BE(16) / SHOT_DPR, b.readUInt32BE(20) / SHOT_DPR]
}
/**
 * قصّة من لقطة حيّة: `box` بالبكسل المنطقي `[x, y, w]` (والارتفاع من `dh` بالنسبة نفسها)، تُعرض بعرض `dw`. `<img>` لا خلفية — فشرط
 * «اكتملت الصور» قبل الالتقاط يشملها. `px` للتكبير بالبكسل.
 */
const crop = (name, [x, y, w], dw, dh, { px = false, cls = 'crop', style = '' } = {}) => {
  const s = dw / w
  const [W, H] = logical(name)
  return `<div class="${cls}" style="width:${dw}px;height:${dh}px;${style}"><img src="${shotUrl(name)}" alt="" style="width:${W * s}px;height:${H * s}px;left:${-x * s}px;top:${-y * s}px;${px ? 'image-rendering:pixelated;' : ''}"></div>`
}
const panelCss = (w, h) => `
  html, body { background: transparent; }
  .panel { position: relative; width: ${w}px; height: ${h}px; border-radius: 16px; overflow: hidden;
    background: ${INK_1000}; border: 1px solid ${INK_900}; }
  .crop { position: absolute; overflow: hidden; border-radius: 12px; border: 1px solid ${INK_900}; }
  .crop img { position: absolute; max-width: none; }
  .tick { display: inline-block; width: 20px; height: 2px; background: ${SIGNAL_300}; }
  .tag { display: flex; align-items: center; gap: 10px; font: 700 14px/1.6 Almarai, sans-serif; color: ${INK_400}; }
  .value { font: 400 48px/1.1 'Geist Mono', monospace; color: ${SIGNAL_300}; direction: ltr; unicode-bidi: isolate; }
  .lead { font: 400 20px/1.8 Cairo, sans-serif; color: ${INK_300}; }
  .pin { position: absolute; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
    background: ${INK_1000}; border: 1.5px solid ${SIGNAL_300}; color: ${SIGNAL_300}; font: 700 14px/1 Almarai, sans-serif; }
  .label { display: inline-block; padding: 3px 8px; border-radius: 4px; font: 400 14px/1.5 'Geist Mono', monospace;
    background: ${INK_950}; border: 1px solid ${INK_800}; color: ${INK_300}; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
  .label.brand { background: ${SIGNAL_300}; border-color: ${SIGNAL_300}; color: ${INK_1000}; }`
const panel = (lang, w, h, css, body) =>
  page(lang, w, h, `${panelCss(w, h)}${css}`, `<div class="panel">${body}</div>`)

/** البطل — العنوان تحت حدود تحديد رصد ووسمٍ بمقاسه الحقيقي يُقاس في الصفحة نفسها، واللقطة وتكبير فجوتها. */
function readmeHero(lang) {
  const ar = lang === 'ar'
  const start = ar ? 'right' : 'left'
  const end = ar ? 'left' : 'right'
  const t = content.hero[lang]
  const at = ar
    ? { zoom: 'left:28px', big: 'left:230px' }
    : { zoom: 'right:288px', big: 'left:712px' }
  return panel(
    lang,
    960,
    480,
    `.lockup { position: absolute; top: 47px; ${start}: 48px; height: 28px; }
     .col { position: absolute; top: 118px; ${start}: 48px; width: 420px; }
     .h1 { position: relative; }
     h1 { font: 800 ${ar ? '48px/1.35' : '40px/1.15'} Almarai, sans-serif; color: ${INK_50}; ${ar ? '' : 'letter-spacing: -0.015em;'} }
     .bounds { position: absolute; inset: -6px -10px; border: 1px solid ${SIGNAL_300}; }
     .bounds i { position: absolute; width: 8px; height: 8px; background: ${SIGNAL_300}; }
     .bounds i:nth-child(1) { top: -4px; left: -4px; } .bounds i:nth-child(2) { top: -4px; right: -4px; }
     .bounds i:nth-child(3) { bottom: -4px; left: -4px; } .bounds i:nth-child(4) { bottom: -4px; right: -4px; }
     .bounds b { position: absolute; top: calc(100% + 8px); ${start}: 0; padding: 2px 6px; border-radius: 4px; background: ${SIGNAL_300};
       color: ${INK_1000}; font: 400 11px/1.4 'Geist Mono', monospace; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
     .lead { margin-top: 44px; ${ar ? '' : 'line-height: 1.55;'} }
     .zoom { position: absolute; overflow: hidden; border-radius: 12px; border: 2px solid ${INK_50}; }
     .zoom img { position: absolute; max-width: none; }
     .big { position: absolute; top: 404px; font: 400 32px/1.2 'Geist Mono', monospace; color: ${SIGNAL_300}; }`,
    `<img class="lockup" src="${file(join(BRAND, 'rasd-lockup-horizontal-dark.svg'))}" alt="">
     <div class="col"><div class="h1"><h1 id="h1">${t.title.replace('\n', '<br>')}</h1><span class="bounds"><i></i><i></i><i></i><i></i><b id="size"></b></span></div>
       <p class="lead">${readme.hero[lang]}</p></div>
     ${crop('measure_two-elements--dark', [700, 330, 400, 300], 400, 300, { style: `top:90px;${end}:48px` })}
     ${crop('measure_two-elements--dark', [930, 500, 80, 60], 180, 135, { px: true, cls: 'zoom', style: `top:300px;${at.zoom}` })}
     <span class="big" style="${at.big}">32px</span>
     <script>
       // الوسم قياسٌ حقيقي لصندوق العنوان المرسوم، لا رقمٌ مكتوب (ملاحظة القرار في Figma).
       document.fonts.ready.then(() => {
         const r = document.getElementById('h1').getBoundingClientRect()
         document.getElementById('size').textContent = 'h1 · ' + Math.round(r.width) + ' × ' + Math.round(r.height)
       })
     </script>`,
  )
}

/** شريط المتصفّحات — الأسماء بخطّ الهوية بين علامات مسطرة، ممّا حالته `supported` وحده. */
function readmeBrowsers(lang) {
  const ar = lang === 'ar'
  const t = content.browsers[lang]
  const names = supportedBrowsers.map((b) => `<li>${b.name}</li>`).join('<li class="sep"></li>')
  return panel(
    lang,
    960,
    128,
    `.row { position: absolute; inset: 0 48px; display: flex; align-items: center; justify-content: space-between; }
     h2 { font: 700 28px/1.3 Almarai, sans-serif; color: ${INK_50}; }
     small { display: block; font: 400 13px/1.6 Cairo, sans-serif; color: ${INK_400}; }
     ul { list-style: none; padding: 0; display: flex; align-items: center; gap: 18px; }
     li { font: 700 18px/1 Almarai, sans-serif; color: ${INK_300}; }
     li.sep { width: 1px; height: 16px; background: ${INK_800}; }`,
    `<div class="row"><div><h2>${t.title}</h2><small>${ar ? 'مجرَّب' : 'Tested'} <bdi dir="ltr">${browsers.tested}</bdi></small></div><ul>${names}</ul></div>`,
  )
}

/** لوح ميزة — قصّة واحدة وقيمة واحدة كبيرة، والنصّ في جهة البداية. */
function readmeFeature(id, visual, extra = '') {
  const p = readme.panels[id]
  const valueHtml =
    id === 'editor'
      ? `<div style="font:800 48px/1.35 Almarai,sans-serif;color:${INK_50}">${p.value}</div>`
      : `<div class="value">${p.value}</div>`
  return panel(
    'ar',
    960,
    480,
    `.text { position: absolute; right: 48px; top: 0; bottom: 0; width: 380px; display: flex; flex-direction: column;
       justify-content: center; gap: 14px; }`,
    `<div class="text"><div class="tag"><span class="tick"></span>${p.tag}</div>${valueHtml}<p class="lead">${p.label}</p></div>${visual}${extra}`,
  )
}
const readmeInspect = () =>
  readmeFeature(
    'inspect',
    crop('inspect_element-selected--light', [41, 186, 420, 330], 420, 330, {
      style: 'left:56px;top:75px',
    }),
  )
const readmeColours = () =>
  readmeFeature(
    'colours',
    crop('colors_sampling--light', [683, 539, 40, 40], 300, 300, {
      px: true,
      style: `left:116px;top:90px;border-radius:50%;border:2px solid ${INK_50}`,
    }),
  )
const readmeCompare = () =>
  readmeFeature(
    'compare',
    crop('compare_split-reference--dark', [560, 80, 420, 330], 420, 330, {
      style: 'left:56px;top:75px',
    }),
  )
const readmeEditor = () =>
  readmeFeature(
    'editor',
    crop('editor_redact--dark', [376, 187, 420, 330], 420, 330, { style: 'left:56px;top:75px' }),
    `<span class="pin" style="left:304px;top:90px">١</span><span class="pin" style="left:258px;top:271px">٢</span>`,
  )

/** الصفّ الهادئ — صورتان صغيرتان بعنوانٍ وسطر. */
function readmeCalm(id, shot, box) {
  const p = readme.panels[id]
  return panel(
    'ar',
    472,
    360,
    `.cap { position: absolute; right: 24px; left: 24px; top: 280px; text-align: right; }
     .cap b { display: block; font: 700 28px/1.4 Almarai, sans-serif; color: ${INK_50}; }
     .cap span { font: 400 13px/1.6 Cairo, sans-serif; color: ${INK_400}; }`,
    `${crop(shot, box, 424, 240, { style: 'left:24px;top:24px;border-radius:10px' })}<div class="cap"><b>${p.title}</b><span>${p.desc}</span></div>`,
  )
}

/** مسار العمل خطّ قياسٍ واحد: ستّ خطوات، ولكلٍّ قيمتها من اللقطات — الأولى من اليمين. */
function readmeWorkflow() {
  const seg = 144
  const steps = readme.workflow
    .map(([verb, value], i) => {
      const cx = 48 + 864 - i * seg - seg / 2
      return `<b class="verb" style="left:${cx}px">${verb}</b><span class="label${i === 1 ? ' brand' : ''}" style="position:absolute;left:${cx}px;top:128px;transform:translateX(-50%)">${value}</span>`
    })
    .join('')
  const ticks = Array.from({ length: 7 }, (_, i) => {
    const edge = i === 0 || i === 6
    return `<i style="left:${48 + 864 - i * seg}px;top:${110 - (edge ? 11 : 7)}px;height:${edge ? 22 : 14}px;background:${i === 0 ? SIGNAL_300 : INK_500}"></i>`
  }).join('')
  return panel(
    'ar',
    960,
    220,
    `.line { position: absolute; left: 48px; width: 864px; top: 110px; height: 1px; background: ${INK_500}; }
     i { position: absolute; width: 1px; }
     .verb { position: absolute; top: 46px; transform: translateX(-50%); font: 700 28px/1.5 Almarai, sans-serif; color: ${INK_50}; white-space: nowrap; }`,
    `<div class="line"></div>${ticks}${steps}`,
  )
}

/** الخصوصية سطرُ قراءات: قيمة مقيسة، ووحدتها، وما تعنيه — كل سطرٍ يقابله سطرٌ في `Docs/Privacy.md`. */
function readmePrivacy(lang) {
  const ar = lang === 'ar'
  const t = readme.privacy[lang]
  const cells = t.points
    .map(
      ([v, u, c], i) =>
        `<div class="pt"><div class="value" style="color:${i === 0 ? SIGNAL_300 : INK_50};text-align:${ar ? 'right' : 'left'}">${v}</div><small>${u}</small><p>${c}</p></div>`,
    )
    .join('')
  return panel(
    lang,
    960,
    400,
    `h2 { position: absolute; top: 40px; left: 48px; right: 48px; font: 700 28px/1.5 Almarai, sans-serif; color: ${INK_50}; }
     .grid { position: absolute; top: 110px; left: 48px; right: 48px; display: grid; grid-template-columns: repeat(4, 1fr); }
     .pt { border-top: 1px solid ${INK_900}; padding: 24px 20px; display: flex; flex-direction: column; gap: 8px; }
     .pt small { font: 700 14px/1.6 Almarai, sans-serif; color: ${INK_400}; }
     .pt p { font: 400 18px/${ar ? '1.85' : '1.6'} Cairo, sans-serif; color: ${INK_300}; }`,
    `<h2>${t.title}</h2><div class="grid">${cells}</div>`,
  )
}

/** صورة المشاركة — مقاس GitHub 1280 × 640، لوحٌ كامل بلا زوايا. */
const socialPreview = page(
  'ar',
  1280,
  640,
  `body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; background: ${INK_1000}; }
   h1 { font: 800 48px/1.35 Almarai, sans-serif; color: ${INK_50}; }
   p { font: 400 20px/1.5 Cairo, sans-serif; color: ${INK_400}; }
   ul { list-style: none; padding: 0; margin-top: 36px; display: flex; align-items: center; gap: 18px; direction: ltr; }
   li { font: 700 18px/1 Almarai, sans-serif; color: ${INK_300}; }
   li.sep { width: 1px; height: 16px; background: ${INK_800}; }`,
  `${lockup(218)}<h1>${content.hero.ar.title.replace('\n', ' ')}</h1><p>${content.hero.en.title.replace('\n', ' ')}</p>
   <ul>${supportedBrowsers.map((b) => `<li>${b.name}</li>`).join('<li class="sep"></li>')}</ul>`,
)

// ── المهامّ ─────────────────────────────────────────────────────
const missing = content.screens
  .map((s) => s.shot)
  .concat(['measure_two-elements--dark', 'library_grid--dark'])
  .filter((name) => !existsSync(join(SHOTS, `${name}.png`)))
if (missing.length > 0) {
  console.error(
    `✗ لقطات حيّة ناقصة بكثافة 2× — شغّل \`pnpm design:shots --dpr=2 --only=overlay,editor,library,settings\` أولًا:\n  ${missing.join('\n  ')}`,
  )
  process.exit(1)
}
const chrome = findChrome()
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

/** عدد لقطات Opera لكل لغة — الإرشادات تقترح لقطتين، وهذه الخمس بترتيب الرفع. */
const OPERA_SHOTS = 5

const allJobs = [
  ...content.screens.flatMap((s, i) =>
    ['ar', 'en'].map((lang) => ({
      group: 'screens',
      out: `screens/${lang}-${String(i + 1).padStart(2, '0')}-${s.id}.png`,
      w: 1280,
      h: 800,
      html: screenHtml(s.shot, s[lang], lang, i + 1),
    })),
  ),
  ...content.screens.slice(0, OPERA_SHOTS).flatMap((s, i) =>
    ['ar', 'en'].map((lang) => ({
      group: 'opera',
      out: `screens/opera-${lang}-${String(i + 1).padStart(2, '0')}-${s.id}.png`,
      w: 612,
      h: 408,
      html: operaHtml(s.shot, s[lang], lang),
    })),
  ),
  { group: 'promo', out: 'promo/promo-small-440x280.png', w: 440, h: 280, html: promoSmall },
  { group: 'promo', out: 'promo/promo-marquee-1400x560.png', w: 1400, h: 560, html: promoMarquee },
  {
    group: 'icons',
    out: 'icons/store-icon-128.png',
    w: 128,
    h: 128,
    html: icon(128, 96),
    transparent: true,
  },
  {
    group: 'icons',
    out: 'icons/edge-logo-300.png',
    w: 300,
    h: 300,
    html: icon(300, 300),
    transparent: true,
  },
  // AMO: أيقونة 64 تملأ مربّعها كأيقونة الشريط (لا حاشية الـ128 لمتجر Chrome)
  {
    group: 'amo',
    out: 'icons/amo-icon-64.png',
    w: 64,
    h: 64,
    html: icon(64, 64),
    transparent: true,
  },
  ...['ar', 'en'].flatMap((lang) => [
    {
      group: 'readme',
      out: `readme/hero-${lang}.png`,
      w: 960,
      h: 480,
      dpr: 2,
      transparent: true,
      html: readmeHero(lang),
    },
    {
      group: 'readme',
      out: `readme/browsers-${lang}.png`,
      w: 960,
      h: 128,
      dpr: 2,
      transparent: true,
      html: readmeBrowsers(lang),
    },
    {
      group: 'readme',
      out: `readme/privacy-${lang}.png`,
      w: 960,
      h: 400,
      dpr: 2,
      transparent: true,
      html: readmePrivacy(lang),
    },
  ]),
  {
    group: 'readme',
    out: 'readme/inspect-ar.png',
    w: 960,
    h: 480,
    dpr: 2,
    transparent: true,
    html: readmeInspect(),
  },
  {
    group: 'readme',
    out: 'readme/colours-ar.png',
    w: 960,
    h: 480,
    dpr: 2,
    transparent: true,
    html: readmeColours(),
  },
  {
    group: 'readme',
    out: 'readme/compare-ar.png',
    w: 960,
    h: 480,
    dpr: 2,
    transparent: true,
    html: readmeCompare(),
  },
  {
    group: 'readme',
    out: 'readme/editor-ar.png',
    w: 960,
    h: 480,
    dpr: 2,
    transparent: true,
    html: readmeEditor(),
  },
  {
    group: 'readme',
    out: 'readme/capture-ar.png',
    w: 472,
    h: 360,
    dpr: 2,
    transparent: true,
    html: readmeCalm('capture', 'capture_area-select--dark', [330, 180, 440, 250]),
  },
  {
    group: 'readme',
    out: 'readme/library-ar.png',
    w: 472,
    h: 360,
    dpr: 2,
    transparent: true,
    html: readmeCalm('library', 'library_grid--dark', [1000, 560, 440, 250]),
  },
  {
    group: 'readme',
    out: 'readme/workflow-ar.png',
    w: 960,
    h: 220,
    dpr: 2,
    transparent: true,
    html: readmeWorkflow(),
  },
  { group: 'readme', out: 'readme/social-preview.png', w: 1280, h: 640, html: socialPreview },
]

// `--only=opera,amo` يولّد فئاتٍ بعينها؛ وبلا الخيار كل الصور كما كان.
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
const groups = new Set(allJobs.map((j) => j.group))
const unknownGroups = (only ?? []).filter((g) => !groups.has(g))
if (unknownGroups.length > 0) {
  console.error(`✗ فئة مجهولة: ${unknownGroups.join('، ')} — المتاحة: ${[...groups].join(' ')}`)
  process.exit(1)
}
const jobs = only ? allJobs.filter((j) => only.includes(j.group)) : allJobs

const work = mkdtempSync(join(tmpdir(), 'rasd-launch-images-'))
const run = launchChrome({
  chrome,
  port: PORT,
  prefix: 'launch-images',
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb'],
})
let failed = false
try {
  const conn = await connectCdp(PORT)
  if (!conn) throw new Error(`تعذّر الاتصال ببروتوكول DevTools.\n${run.stderrTail()}`)
  const { send } = conn
  for (const job of jobs) {
    const html = join(work, job.out.replaceAll('/', '_').replace('.png', '.html'))
    writeFileSync(html, job.html)
    const t = await openTarget(send, 'about:blank')
    const dpr = job.dpr ?? 1
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width: job.w, height: job.h, deviceScaleFactor: dpr, mobile: false },
      t.sessionId,
    )
    if (job.transparent) {
      await send(
        'Emulation.setDefaultBackgroundColorOverride',
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        t.sessionId,
      )
    }
    await send('Page.navigate', { url: file(html) }, t.sessionId)
    const evaluate = evaluator(send, t.sessionId)
    // الخطوط والصور محمّلة قبل الالتقاط — وإلا التُقط خطّ الاحتياط أو إطارٌ فارغ.
    let ready = null
    for (let i = 0; i < 80 && !ready?.ok; i++) {
      await sleep(100)
      ready = await evaluate(`(async () => {
        if (document.readyState !== 'complete') return { ok: false }
        await document.fonts.ready
        const imgs = [...document.images]
        const broken = imgs.filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.src)
        return { ok: imgs.every((im) => im.complete), broken }
      })()`).catch(() => null)
    }
    if (!ready?.ok || ready.broken.length > 0) {
      throw new Error(`${job.out}: لم تكتمل الصفحة — ${JSON.stringify(ready)}`)
    }
    await sleep(150)
    const { data } = await send(
      'Page.captureScreenshot',
      { format: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h, scale: 1 } },
      t.sessionId,
    )
    const out = join(LAUNCH, job.out)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(data, 'base64'))
    await send('Target.closeTarget', { targetId: t.targetId })
    console.log(`  ✓ ${job.out} — ${job.w * dpr}×${job.h * dpr}`)
  }
  conn.close()
} catch (e) {
  failed = true
  console.error(`✗ ${e.message}`)
} finally {
  run.proc.kill('SIGKILL')
  await sleep(300)
  rmSync(run.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  rmSync(work, { recursive: true, force: true })
}
if (failed) process.exit(1)
console.log(`\n✓ ${jobs.length} صورة في Docs/Launch/`)
