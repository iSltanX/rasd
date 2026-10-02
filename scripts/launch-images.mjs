#!/usr/bin/env node
/**
 * مواد الإطلاق — من لقطات الإضافة الحيّة لا من رسمٍ لها (`Docs/Launch/README.md`).
 *
 *   pnpm design:shots                 # لقطات الإضافة المبنيّة كما يرسمها Chrome → artifacts/design/shots/
 *   pnpm launch:images                # → Docs/Launch/{screens,promo,icons,readme}/
 *
 * **اللقطة من Chrome، والإطار وحده يُرسم هنا.** كل لقطة متجر (1280×800) شريطُ عنوانٍ بالهوية فوق لقطةٍ حيّة من
 * `design:shots` كما رسمها Chrome بالإضافة المبنيّة، مقصوصةً من أعلاها ومصغَّرةً بالنسبة نفسها في المحورين
 * (1440 → 1280) — لا تمديد ولا واجهة مصطنعة. فما تعرضه الصور هو ما يراه المستخدم، ويتغيّر بتغيّرها بإعادة الأمرين.
 *
 * **والنصوص من ملفّ لا من الشيفرة** (`Docs/Launch/content.json`): العناوين بالعربية والإنجليزية، وترتيب اللقطات
 * ترتيب الرفع. **والمتصفّحات من نتيجة الاختبار** (`Docs/Launch/browsers.json`): لا يظهر في شريط «يعمل حيث تعمل أنت»
 * إلا ما حالته `supported` هناك — ولا شعار متصفّح، اسمه بخطّ الهوية وحده.
 *
 * والأيقونة 128 بعملٍ فنّي 96 وحاشيةٍ شفّافة 16 كما تطلب صفحة صور المتجر، من المصدر المتّجه
 * (`Docs/Brand/svg/rasd-icon-idle.svg`)، ومنه شعار Edge (300). والترويجيتان (440×280 و1400×560) من الهوية: الإرشاد
 * أن تحمل العلامة لا أن تكرّر لقطة. وصور README بكثافة 2× لتبقى حادّة على الشاشات الكثيفة.
 *
 * إطلاقٌ واحد لكروم لكل الصور (`Docs/Brand` — الإطلاق لكل صورة يعلّق). منفذه 9396، ليس من منافذ الحرّاس.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { connectCdp, evaluator, findChrome, launchChrome, openTarget, ROOT } from './lib/cdp.mjs'

const PORT = Number(process.env.RASD_LAUNCH_IMAGES_PORT ?? 9396)
const SHOTS = join(ROOT, 'artifacts', 'design', 'shots')
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

// ── README: البطل، وصورة المشاركة، وشريط المتصفّحات ─────────────
/** نافذة متصفّحٍ مختزلة حول لقطةٍ حيّة: شريطٌ بثلاث نقاط وحافّة — إطارٌ للّقطة لا واجهةٌ بديلة. */
const windowFrame = (shot, w, extra = '') => {
  const h = Math.round((w * 900) / 1440)
  return `<div class="win" style="width:${w}px;${extra}"><div class="bar"><i></i><i></i><i></i></div><img src="${shotUrl(shot)}" style="width:${w}px;height:${h}px" alt=""></div>`
}
const windowCss = `
  .win { position: absolute; border-radius: 12px; overflow: hidden; background: ${INK_975}; border: 1px solid ${INK_900};
    box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.03) inset; }
  .win .bar { height: 26px; display: flex; gap: 7px; align-items: center; padding: 0 12px; direction: ltr; border-bottom: 1px solid ${INK_950}; }
  .win .bar i { width: 9px; height: 9px; border-radius: 50%; background: ${INK_900}; }
  .win img { display: block; }`

function heroHtml(lang, w, h, { compact = false } = {}) {
  const t = content.hero[lang]
  const rtl = lang === 'ar'
  const order = ['capture', 'inspect', 'measure', 'colours', 'compare', 'editor', 'library']
  const tags = order.map(
    (id) => `<span>${content.screens.find((s) => s.id === id).tag[lang]}</span>`,
  )
  // عمود النصّ والنافذتان لا يتقاطعان: النصّ في ثلث اللوحة البعيد، والنافذتان في الثلثين الآخرين.
  const side = rtl ? 'right' : 'left'
  const away = rtl ? 'left' : 'right'
  const front = compact ? 560 : 540
  const frontHeight = Math.round((front * 900) / 1440) + 26
  return page(
    lang,
    w,
    h,
    `body { position: relative; background: radial-gradient(70% 90% at ${rtl ? '20%' : '80%'} 55%, ${INK_950} 0%, ${INK_1000} 70%); }
     .text { position: absolute; top: 0; bottom: 0; ${side}: ${compact ? 56 : 64}px; width: ${compact ? 560 : 470}px;
       display: flex; flex-direction: column; justify-content: center; gap: ${compact ? 20 : 24}px; }
     h1 { font: 800 ${compact ? 42 : 46}px/1.2 Almarai, sans-serif; color: ${INK_50}; }
     p { font: 400 ${compact ? 18 : 19}px/1.65 Cairo, sans-serif; color: ${INK_300}; }
     .tags { display: ${compact ? 'none' : 'flex'}; flex-wrap: wrap; gap: 8px; }
     .tags span { font: 700 13px/1 Almarai, sans-serif; color: ${INK_300}; background: ${INK_975}; border: 1px solid ${INK_900};
       border-radius: 999px; padding: 8px 12px; }
     ${windowCss}`,
    `<div class="text">${lockup(compact ? 180 : 200)}<h1>${t.title.replace('\n', '<br>')}</h1><p>${t.body}</p><div class="tags">${tags.join('')}</div></div>
     ${
       compact
         ? windowFrame(
             'measure_two-elements--dark',
             front,
             `${away}:44px;top:${(h - frontHeight) / 2}px`,
           )
         : windowFrame('library_grid--dark', 420, `${away}:40px;top:60px;opacity:.9`) +
           windowFrame(
             'measure_two-elements--dark',
             front,
             `${away}:110px;top:${h - frontHeight - 30}px`,
           )
     }`,
  )
}

function browsersHtml(lang) {
  const t = content.browsers[lang]
  const supported = browsers.browsers.filter((b) => b.status === 'supported')
  const chips = supported
    .map(
      (b) =>
        `<li><b>${b.name}</b><small><bdi dir="ltr">${b.version}</bdi>${b.engine ? `<br><bdi dir="ltr">${b.engine}</bdi>` : ''}</small><em>${lang === 'ar' ? 'مجرَّب' : 'Tested'} <bdi dir="ltr">${browsers.tested}</bdi></em>${b.note ? `<i>${b.note[lang]}</i>` : ''}</li>`,
    )
    .join('')
  return page(
    lang,
    1200,
    300,
    `body { padding: 36px 56px; display: flex; flex-direction: column; gap: 22px; background: ${INK_1000}; }
     header { display: flex; align-items: baseline; gap: 16px; }
     h2 { font: 800 30px/1.2 Almarai, sans-serif; color: ${INK_50}; }
     header p { font: 400 17px/1.4 Cairo, sans-serif; color: ${INK_500}; }
     ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(${supported.length}, 1fr); gap: 14px; }
     li { background: ${INK_975}; border: 1px solid ${INK_900}; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
     li b { font: 800 24px/1.1 Almarai, sans-serif; color: ${INK_50}; }
     li small { font: 400 13px/1.45 'Geist Mono', monospace; color: ${INK_500}; }
     li em { font: 700 13px/1 Almarai, sans-serif; font-style: normal; color: ${SIGNAL_300}; }
     li i { font: 400 12px/1.45 Cairo, sans-serif; font-style: normal; color: ${INK_300}; border-top: 1px solid ${INK_900}; padding-top: 7px; margin-top: 1px; }`,
    `<header><h2>${t.title}</h2><p>${t.note}</p></header><ul>${chips}</ul>`,
  )
}

// ── المهامّ ─────────────────────────────────────────────────────
const missing = content.screens
  .map((s) => s.shot)
  .concat(['measure_two-elements--dark', 'library_grid--dark'])
  .filter((name) => !existsSync(join(SHOTS, `${name}.png`)))
if (missing.length > 0) {
  console.error(`✗ لقطات حيّة ناقصة — شغّل \`pnpm design:shots\` أولًا:\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
const chrome = findChrome()
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const jobs = [
  ...content.screens.flatMap((s, i) =>
    ['ar', 'en'].map((lang) => ({
      out: `screens/${lang}-${String(i + 1).padStart(2, '0')}-${s.id}.png`,
      w: 1280,
      h: 800,
      html: screenHtml(s.shot, s[lang], lang, i + 1),
    })),
  ),
  { out: 'promo/promo-small-440x280.png', w: 440, h: 280, html: promoSmall },
  { out: 'promo/promo-marquee-1400x560.png', w: 1400, h: 560, html: promoMarquee },
  { out: 'icons/store-icon-128.png', w: 128, h: 128, html: icon(128, 96), transparent: true },
  { out: 'icons/edge-logo-300.png', w: 300, h: 300, html: icon(300, 300), transparent: true },
  { out: 'readme/hero-ar.png', w: 1200, h: 600, dpr: 2, html: heroHtml('ar', 1200, 600) },
  { out: 'readme/hero-en.png', w: 1200, h: 600, dpr: 2, html: heroHtml('en', 1200, 600) },
  {
    out: 'readme/social-preview.png',
    w: 1280,
    h: 640,
    html: heroHtml('ar', 1280, 640, { compact: true }),
  },
  { out: 'readme/browsers-ar.png', w: 1200, h: 300, dpr: 2, html: browsersHtml('ar') },
  { out: 'readme/browsers-en.png', w: 1200, h: 300, dpr: 2, html: browsersHtml('en') },
]

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
