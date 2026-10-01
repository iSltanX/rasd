#!/usr/bin/env node
/**
 * صور المتجر — من لقطات الإضافة الحيّة لا من رسمٍ لها (`STAGES/28`).
 *
 *   pnpm design:shots --only=overlay,library,editor   # اللقطات الحيّة → artifacts/design/shots/
 *   pnpm store:images                                 # → Docs/Store/images/
 *
 * **اللقطة من Chrome، والإطار وحده يُرسم هنا.** كل لقطة متجر (1280×800) شريطُ عنوانٍ بالهوية ثمّ لقطةٌ
 * حيّة من `design:shots` كما رسمها Chrome بالإضافة المبنيّة، مقصوصةً بارتفاعٍ يناسب الإطار ومصغَّرةً
 * بالنسبة نفسها في المحورين (1440 → 1280) — لا تمديد. فالمتجر يعرض ما يراه المستخدم بعد التثبيت، وما
 * يتغيّر في الواجهة يتغيّر في الصورة بإعادة الأمرين.
 *
 * **بلغتين، والواجهة عربية فيهما.** العنوان وحده يُترجم: لقطات `-en` تحمل عنوانًا إنجليزيًّا فوق الواجهة
 * العربية نفسها — والوصف الإنجليزي يقول ذلك صراحةً (`Docs/Store/listing.md`).
 *
 * والأيقونة 128 بعملٍ فنّي 96 وحاشيةٍ شفّافة 16 من كل جانب كما تطلب صفحة صور المتجر، مرسومةً من مصدرها
 * المتّجه (`Docs/Brand/svg/rasd-icon-idle.svg`) لا مصغَّرةً من نقطيّ، ومنها شعار Edge (300×300). والصورة الترويجية الصغيرة (440×280)
 * والعريضة (1400×560) من الهوية وحدها: الإرشاد أن تحمل العلامة لا أن تكرّر لقطة.
 *
 * إطلاقٌ واحد لكروم لكل الصور (`Docs/Brand` — الإطلاق لكل صورة يعلّق). منفذه 9396، ليس من منافذ الحرّاس.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { connectCdp, evaluator, findChrome, launchChrome, openTarget, ROOT } from './lib/cdp.mjs'

const PORT = Number(process.env.RASD_STORE_IMAGES_PORT ?? 9396)
const SHOTS = join(ROOT, 'artifacts', 'design', 'shots')
const OUT = join(ROOT, 'Docs', 'Store', 'images')
const FONTS = join(ROOT, 'public', 'assets', 'fonts')
const BRAND = join(ROOT, 'Docs', 'Brand', 'svg')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const file = (p) => pathToFileURL(p).href

/** الألوان من توكنز الهوية (`public/assets/tokens.css`) — الحبر والإشارة. */
const INK_1000 = '#070b0d'
const INK_950 = '#192024'
const INK_300 = '#b8c7cf'
const INK_50 = '#f4f7f9'
const SIGNAL_300 = '#00e3c9'

/**
 * اللقطات الخمس وعناوينها. `top` أوّل سطرٍ يُبقى من اللقطة الحيّة (1440×900): يُقصّ منها 774 سطرًا،
 * فتصير 1280×688 تحت شريط العنوان (112).
 */
const SCREENS = [
  {
    shot: 'measure_two-elements--dark',
    top: 0,
    ar: ['قِس المسافات بين العناصر', 'اختر عنصرين فترى الفجوة والأبعاد بالبكسل فوق الصفحة نفسها'],
    en: [
      'Measure the space between elements',
      'Pick two elements to see the gap and their sizes in pixels, right on the page',
    ],
  },
  {
    shot: 'inspect_element-selected--light',
    top: 0,
    ar: ['افحص أي عنصر', 'الصندوق والخط واللون والإتاحة — وتنزيلها CSS أو Tailwind أو JSON'],
    en: [
      'Inspect any element',
      'Box, type, colour and accessibility — export as CSS, Tailwind or JSON',
    ],
  },
  {
    shot: 'compare_split-reference--dark',
    top: 0,
    ar: ['قارن التنفيذ بالمرجع', 'تقسيم وتراكب وشفافية ووميض، وفرق البكسلات فوق الصفحة الحيّة'],
    en: [
      'Compare the build with its reference',
      'Split, overlay, opacity and blink modes, with the pixel difference on the live page',
    ],
  },
  {
    shot: 'editor_redact--dark',
    top: 0,
    ar: ['علّق واحجب قبل أن تشارك', 'الحجب يُخبز في بكسلات الصورة نفسها فلا يُستعاد من الملفّ'],
    en: [
      'Annotate and redact before you share',
      'Redactions are baked into the image pixels and cannot be recovered from the file',
    ],
  },
  {
    shot: 'library_grid--dark',
    top: 0,
    ar: ['مكتبتك على جهازك', 'لقطات ومشاريع ولوحات ألوان ومراجع — بلا حساب ولا خادم'],
    en: [
      'Your library stays on your device',
      'Captures, projects, palettes and references — no account, no server',
    ],
  },
]

const fontFaces = `
  @font-face { font-family: Almarai; font-weight: 800; src: url(${file(join(FONTS, 'almarai-800-arabic.woff2'))}) format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF; }
  @font-face { font-family: Almarai; font-weight: 800; src: url(${file(join(FONTS, 'almarai-800-latin.woff2'))}) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: Cairo; font-weight: 400; src: url(${file(join(FONTS, 'cairo-400-arabic.woff2'))}) format('woff2'); unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF; }
  @font-face { font-family: Cairo; font-weight: 400; src: url(${file(join(FONTS, 'cairo-400-latin.woff2'))}) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  * { margin: 0; box-sizing: border-box; }
  html, body { overflow: hidden; background: ${INK_1000}; }
`

const SYMBOL = `<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true"><path fill="${SIGNAL_300}" d="M22.0945 5.6628 A12 12 0 1 0 26.3372 9.9055 L22.9819 13.2608 A7.5 7.5 0 1 1 18.7392 9.0181 Z"/><path fill="${INK_50}" d="M16 11.5 L20.5 16 L16 20.5 L11.5 16 Z"/></svg>`

function screenHtml({ shot, top }, [title, sub], lang) {
  const scale = 1280 / 1440
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>${fontFaces}
    body { width: 1280px; height: 800px; }
    header { height: 112px; display: flex; align-items: center; gap: 20px; padding: 0 48px; border-bottom: 1px solid ${INK_950}; }
    h1 { font: 800 30px/1.25 Almarai, sans-serif; color: ${INK_50}; }
    p { font: 400 17px/1.45 Cairo, sans-serif; color: ${INK_300}; margin-top: 6px; }
    .shot { position: relative; width: 1280px; height: 688px; overflow: hidden; }
    .shot img { position: absolute; left: 0; top: ${-top * scale}px; width: ${1440 * scale}px; height: ${900 * scale}px; }
  </style></head><body>
    <header>${SYMBOL}<div><h1>${title}</h1><p>${sub}</p></div></header>
    <div class="shot"><img src="${file(join(SHOTS, `${shot}.png`))}" alt=""></div>
  </body></html>`
}

const lockup = (width) =>
  `<img src="${file(join(BRAND, 'rasd-lockup-horizontal-dark.svg'))}" width="${width}" alt="">`

const promoSmall = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontFaces}
  body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
    background: radial-gradient(120% 90% at 50% 0%, ${INK_950} 0%, ${INK_1000} 70%); }
  p { font: 400 18px/1.4 Cairo, sans-serif; color: ${INK_300}; }
</style></head><body>${lockup(230)}<p>الفحص البصري في متصفّحك</p></body></html>`

const promoMarquee = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontFaces}
  body { width: 1400px; height: 560px; display: flex; align-items: center; justify-content: space-between; padding: 0 96px;
    background: radial-gradient(90% 120% at 85% 50%, ${INK_950} 0%, ${INK_1000} 65%); }
  .brand { display: flex; flex-direction: column; gap: 28px; }
  p { font: 400 26px/1.5 Cairo, sans-serif; color: ${INK_300}; max-width: 600px; }
  .frame { width: 640px; height: 400px; border-radius: 14px; overflow: hidden; border: 1px solid ${INK_950}; }
  .frame img { width: 640px; height: 400px; display: block; }
</style></head><body>
  <div class="brand">${lockup(380)}<p>قِس وافحص وقارن، ومكتبتك على جهازك وحده</p></div>
  <div class="frame"><img src="${file(join(SHOTS, 'measure_two-elements--dark.png'))}" alt=""></div>
</body></html>`

/** الأيقونة: عملٌ فنّي 96×96 في وسط 128×128 شفّاف — مرسومٌ من المتّجه بحجمه. */
const storeIcon = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } html, body { background: transparent; width: 128px; height: 128px; overflow: hidden; }
  img { position: absolute; left: 16px; top: 16px; width: 96px; height: 96px; }
</style></head><body><img src="${file(join(BRAND, 'rasd-icon-idle.svg'))}" alt=""></body></html>`

/** شعار Edge لكل لغة: مربّعٌ بنسبة 1:1، والمقترح 300×300 — الأيقونة نفسها بحجم اللوحة كلّها. */
const edgeLogo = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } html, body { background: transparent; width: 300px; height: 300px; overflow: hidden; }
  img { width: 300px; height: 300px; display: block; }
</style></head><body><img src="${file(join(BRAND, 'rasd-icon-idle.svg'))}" alt=""></body></html>`

// ── التحقّق من المدخلات ─────────────────────────────────────────
const missing = [...SCREENS.map((s) => join(SHOTS, `${s.shot}.png`))].filter((p) => !existsSync(p))
if (missing.length > 0) {
  console.error(
    `✗ لقطات حيّة ناقصة — شغّل \`pnpm design:shots --only=overlay,library,editor\` أولًا:\n  ${missing.join('\n  ')}`,
  )
  process.exit(1)
}
const chrome = findChrome()
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const jobs = [
  ...SCREENS.flatMap((s, i) => [
    { name: `screenshot-ar-${i + 1}.png`, w: 1280, h: 800, html: screenHtml(s, s.ar, 'ar') },
    { name: `screenshot-en-${i + 1}.png`, w: 1280, h: 800, html: screenHtml(s, s.en, 'en') },
  ]),
  { name: 'promo-small-440x280.png', w: 440, h: 280, html: promoSmall },
  { name: 'promo-marquee-1400x560.png', w: 1400, h: 560, html: promoMarquee },
  { name: 'icon-128.png', w: 128, h: 128, html: storeIcon, transparent: true },
  { name: 'logo-300.png', w: 300, h: 300, html: edgeLogo, transparent: true },
]

const work = mkdtempSync(join(tmpdir(), 'rasd-store-images-'))
const run = launchChrome({
  chrome,
  port: PORT,
  prefix: 'store-images',
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb'],
})
let failed = false
try {
  const conn = await connectCdp(PORT)
  if (!conn) throw new Error(`تعذّر الاتصال ببروتوكول DevTools.\n${run.stderrTail()}`)
  const { send } = conn
  mkdirSync(OUT, { recursive: true })
  for (const job of jobs) {
    const page = join(work, job.name.replace('.png', '.html'))
    writeFileSync(page, job.html)
    const t = await openTarget(send, 'about:blank')
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false },
      t.sessionId,
    )
    if (job.transparent) {
      await send(
        'Emulation.setDefaultBackgroundColorOverride',
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        t.sessionId,
      )
    }
    await send('Page.navigate', { url: file(page) }, t.sessionId)
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
        return { ok: imgs.every((im) => im.complete), broken, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length }
      })()`).catch(() => null)
    }
    if (!ready?.ok || ready.broken.length > 0) {
      throw new Error(`${job.name}: لم تكتمل الصفحة — ${JSON.stringify(ready)}`)
    }
    await sleep(150)
    const { data } = await send(
      'Page.captureScreenshot',
      { format: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h, scale: 1 } },
      t.sessionId,
    )
    writeFileSync(join(OUT, job.name), Buffer.from(data, 'base64'))
    await send('Target.closeTarget', { targetId: t.targetId })
    console.log(`  ✓ ${job.name} — ${job.w}×${job.h}`)
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
console.log(`\n✓ ${jobs.length} صورة في Docs/Store/images/`)
