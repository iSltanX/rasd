#!/usr/bin/env node
/**
 * حارس Firefox `fullpage` — الالتقاط الكامل يخيط صفحةً طويلة في Firefox بلا فقدٍ ولا تكرار.
 *
 * نظير `scripts/verify-fullpage.mjs` فوق `scripts/lib/bidi.mjs` (SS7)، على عيّنة `fullpage/` نفسها: أربعة وعشرون قسمًا
 * بلونٍ فريد محسوب، ورأسٌ لاصق، ولافتةٌ ثابتة. **الإثبات بالعلامات لا بالارتفاع** — ارتفاعٌ صحيح يمرّ على صورةٍ أُسقط
 * منها قسمان وكُرّر غيرهما (قِيس في كروم). والتمرير السلس و`visualViewport` في Firefox هما ما قد يختلف:
 *   1. `full-page` بالمسار الحقيقي يحفظ لقطة في المكتبة.
 *   2. ارتفاعها يساوي `scrollHeight × dpr` ضمن هامشٍ صغير، وعرضها عرض المحتوى.
 *   3. من الصورة المحفوظة يُقرأ بكسلٌ من كل قسم: الألوان الأربعة والعشرون كلّها، مرّة، وبالترتيب.
 *   4. الرأس اللاصق في أعلى الصورة.
 *   5. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:fullpage
 *   RASD_GUARD_SABOTAGE=content.js pnpm firefox:fullpage   # السالب: يجب أن يسقط
 */
import { startGuard } from '../lib/bidi.mjs'

const PORT = 9238
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'fullpage',
  port: PORT,
  title: '── حارس Firefox: الالتقاط الكامل ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 240_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

const site = await g.openSite('/fullpage/')
const inPage = g.inContext(site.context)
const page = JSON.parse(
  await inPage(`JSON.stringify({
    dpr: devicePixelRatio,
    width: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    header: getComputedStyle(document.getElementById('head')).backgroundColor,
    bands: [...document.querySelectorAll('.band')].map((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      colour: getComputedStyle(el).backgroundColor,
    })),
  })`),
)
note(`الصفحة: ${page.width}×${page.scrollHeight} · ${page.bands.length} قسمًا · كثافة ${page.dpr}`)

// ── 1) الالتقاط بالمسار الحقيقي ──────────────────────────────────
const previous = await g.message('capture/latest').catch(() => null)
const act = await g
  .message('tool/activate', { tool: 'full-page', tabId: site.tabId }, 60_000)
  .catch((e) => ({ ok: false, error: e.message }))
note(`ردّ التفعيل: ${JSON.stringify(act)}`)
let saved = null
for (let i = 0; i < 240 && !saved; i++) {
  await sleep(500)
  const latest = await g.message('capture/latest').catch(() => null)
  if (latest?.ok && latest.value && latest.value.id !== previous?.value?.id) saved = latest.value
}
if (!saved) await g.abort(`full-page لم تُحفظ لقطته: ${JSON.stringify(act)}`)
ok(`full-page حفظ لقطة في المكتبة — ${saved.width}×${saved.height}`)

// ── 2) المقاس ────────────────────────────────────────────────────
const wantH = Math.round(page.scrollHeight * page.dpr)
const wantW = Math.round(page.width * page.dpr)
Math.abs(saved.height - wantH) <= 2 * page.dpr && Math.abs(saved.width - wantW) <= 1
  ? ok(`المقاس ${saved.width}×${saved.height} يطابق المحتوى ${wantW}×${wantH}`)
  : fail(`المقاس ${saved.width}×${saved.height} والمحتوى ${wantW}×${wantH}`)

// ── 3) و4) العلامات من الصورة المحفوظة ───────────────────────────
// يمين القسم بعيدًا عن رقمه المتوسّط، وأعلى منتصفه بعيدًا عن لافتةٍ ثابتة قد تبقى في البلاطة الأولى.
const points = [{ x: 30, y: 8 }, ...page.bands.map((b) => ({ x: 30, y: Math.round(b.top + 100) }))]
const sampled = JSON.parse(
  await g.ext(`(async () => {
    const r = await chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/blob', payload: { id: ${JSON.stringify(saved.id)} }, id: 'ff-full' })
    if (!r?.ok) return JSON.stringify({ error: JSON.stringify(r) })
    const bin = atob(r.value.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([bytes], { type: r.value.mime }))
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')
    c.drawImage(bmp, 0, 0)
    const scale = ${page.dpr}
    return JSON.stringify(${JSON.stringify(points)}.map((p) => Array.from(c.getImageData(Math.round(p.x * scale), Math.round(p.y * scale), 1, 1).data)))
  })()`),
)
if (sampled.error) {
  fail(`تعذّرت قراءة الصورة المحفوظة: ${sampled.error}`)
} else {
  const parse = (css) => css.match(/\d+/gu).slice(0, 3).map(Number)
  const near = (px, rgb) => rgb.every((v, i) => Math.abs(px[i] - v) <= 2)
  const [header, ...bands] = sampled
  near(header, parse(page.header))
    ? ok(`الرأس اللاصق في أعلى الصورة — rgb(${header.slice(0, 3).join(', ')})`)
    : fail(`أعلى الصورة rgb(${header.slice(0, 3).join(', ')}) لا لون الرأس ${page.header}`)
  const wrong = bands
    .map((px, i) => ({ i, px, want: parse(page.bands[i].colour) }))
    .filter(({ px, want }) => !near(px, want))
  wrong.length === 0
    ? ok(`العلامات الأربع والعشرون كلّها في الصورة، مرّة، وبالترتيب — لا فقد ولا تكرار`)
    : fail(
        `${wrong.length} قسمًا لا يطابق لونه: ${wrong
          .slice(0, 5)
          .map(
            (w) => `#${w.i} rgb(${w.px.slice(0, 3).join(',')}) والمتوقَّع rgb(${w.want.join(',')})`,
          )
          .join(' · ')}`,
      )
}

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ الالتقاط الكامل يخيط الصفحة في Firefox بلا فقدٍ ولا تكرار.' })
