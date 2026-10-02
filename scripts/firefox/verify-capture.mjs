#!/usr/bin/env node
/**
 * حارس Firefox `capture` — محرّك الالتقاط و«احفظ نسخة في مجلّد التنزيلات» في Firefox حقيقي.
 *
 * نظير `scripts/verify-capture.mjs` فوق `scripts/lib/bidi.mjs` (SS7). ما يُثبَت:
 *   1. الحزمة المبنيّة بلا صلاحية مضيف — الالتقاط في المنتج على `activeTab` وحدها، ونسخة الفحص وحدها بـ`<all_urls>`
 *      (لا أتمتة تمنح إيماءة الأيقونة، وتنزيلٌ بإيماءة نافذةُ إذن لا تُنقر — فـ`downloads` دائمة في النسخة وحدها).
 *   2. التقاط منطقة (`capture/run` من سكربت المحتوى كما ترسله الطبقة): الأبعاد تطابق المطلوب بالضبط، وبكسلات ما حُفظ هي ما رسمه Firefox — منطقةٌ فوق
 *      `#solid` في عيّنة `colour/` حمراء بايتًا ببايت بعد الحفظ والقراءة من المكتبة.
 *   3. الالتقاط الظاهر بالمسار الحقيقي (`tool/activate viewport`): لقطةٌ جديدة في المكتبة بمقاس النافذة.
 *   4. **«احفظ نسخة في مجلّد التنزيلات»** (`capture.saveLocation`): الالتقاط يُنزِّل ملفًّا PNG مكتملًا على القرص بمقاس
 *      اللقطة — عبر `blob:` الذي يقبله Firefox لا `data:` الذي يرفضه (نقطة الفرق `downloadUrl`، SS4).
 *   5. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:capture
 *   RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:capture   # السالب: يجب أن يسقط
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DIST, startGuard } from '../lib/bidi.mjs'

const PORT = 9237
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'capture',
  port: PORT,
  title: '── حارس Firefox: الالتقاط والتنزيل ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'], permissions: ['downloads'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

// ── 1) الحزمة المبنيّة ───────────────────────────────────────────
const shipped = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
;(shipped.host_permissions ?? []).length === 0
  ? ok('الحزمة المبنيّة بلا صلاحية مضيف — الالتقاط في المنتج على activeTab وحدها')
  : fail(`الحزمة المبنيّة تطلب صلاحيات مضيف: ${shipped.host_permissions.join(', ')}`)

const site = await g.openSite('/colour/')
const inPage = g.inContext(site.context)
const dpr = Number(await inPage('devicePixelRatio'))
note(`كثافة البكسل: ${dpr}`)

/** يقرأ لقطةً من المكتبة ويفكّها في صفحة الفحص: المقاس وبكسل المركز. */
const decode = async (id) =>
  JSON.parse(
    await g.ext(`(async () => {
      const r = await chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/blob', payload: { id: ${JSON.stringify(id)} }, id: 'ff-blob' })
      if (!r?.ok) return JSON.stringify({ error: JSON.stringify(r) })
      const bin = atob(r.value.base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const bmp = await createImageBitmap(new Blob([bytes], { type: r.value.mime }))
      const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')
      c.drawImage(bmp, 0, 0)
      const at = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data)
      return JSON.stringify({ w: bmp.width, h: bmp.height, mime: r.value.mime, centre: at(bmp.width >> 1, bmp.height >> 1), corner: at(2, 2) })
    })()`),
  )

// ── 2) التقاط منطقة ──────────────────────────────────────────────
const solid = JSON.parse(
  await inPage(`JSON.stringify((() => {
    const r = document.getElementById('solid').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })())`),
)
const W = 120
const H = 60
/*
 * من سكربت المحتوى كما ترسلها الطبقة (`overlay-app.tsx`) — المُرسِل الوحيد لـ`capture/run` في المنتج. ومن صفحة
 * إضافة كانت ستُوجَّه إلى تبويب الصفحة نفسها في Firefox: `lifecycle.ts` يعرف «صفحتنا» بـ`chrome-extension://`
 * وأصلها هنا `moz-extension://` — عطلٌ كامن لا مُرسِل له اليوم، مسجَّل في SS7 خارج نطاقها.
 */
const area = await g
  .inContent(
    site.tabId,
    `() => chrome.runtime.sendMessage({
      __rasd: 1, id: 'ff-area', type: 'capture/run',
      payload: {
        kind: 'area',
        dpr: ${dpr},
        rect: {
          space: 'device',
          x: ${Math.round((solid.x + 20) * dpr)},
          y: ${Math.round((solid.y + 20) * dpr)},
          width: ${Math.round(W * dpr)},
          height: ${Math.round(H * dpr)},
        },
      },
    }).then((r) => JSON.stringify(r))`,
    45_000,
  )
  .then((raw) => JSON.parse(raw))
  .catch((e) => ({ ok: false, error: e.message }))
if (!area?.ok) {
  fail(`التقاط المنطقة فشل: ${JSON.stringify(area?.error ?? area)}`)
} else {
  const want = { w: Math.round(W * dpr), h: Math.round(H * dpr) }
  area.value.width === want.w && area.value.height === want.h
    ? ok(`التقاط المنطقة: الأبعاد تطابق المطلوب بالضبط — ${area.value.width}×${area.value.height}`)
    : fail(`التقاط المنطقة: ${area.value.width}×${area.value.height} والمطلوب ${want.w}×${want.h}`)
  const got = await decode(area.value.id)
  const red = (px) => px && px[0] === 255 && px[1] === 0 && px[2] === 0 && px[3] === 255
  !got.error && got.w === want.w && got.h === want.h && red(got.centre) && red(got.corner)
    ? ok(
        `ما حُفظ في المكتبة يُفكّ ${got.w}×${got.h} (${got.mime}) وبكسلاته حمراء بايتًا ببايت كما رسمها Firefox`,
      )
    : fail(`ما حُفظ في المكتبة: ${JSON.stringify(got)}`)
}

// ── 3) و4) الالتقاط الظاهر ومعه نسخة التنزيلات ───────────────────
const patched = await g
  .message('settings/patch', { patch: { capture: { saveLocation: 'library-and-downloads' } } })
  .catch((e) => ({ ok: false, error: e.message }))
patched?.ok
  ? note('«احفظ نسخة في مجلّد التنزيلات» مفعَّلة عبر settings/patch')
  : fail(`تعذّر تفعيل نسخة التنزيلات: ${JSON.stringify(patched)}`)

await g.activate(site.tabId)
const previous = await g.message('capture/latest').catch(() => null)
const act = await g
  .message('tool/activate', { tool: 'viewport', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
note(`ردّ التفعيل: ${JSON.stringify(act)}`)
let shot = null
for (let i = 0; i < 60 && !shot; i++) {
  await sleep(250)
  const latest = await g.message('capture/latest').catch(() => null)
  if (latest?.ok && latest.value && latest.value.id !== previous?.value?.id) shot = latest.value
}
// `captureVisibleTab` في Firefox يشمل شريط التمرير: المقاس `innerWidth` لا `clientWidth` (قِيس: 1280 لا 1265).
const viewport = JSON.parse(await inPage('JSON.stringify([innerWidth, innerHeight])'))
const wantVp = { w: Math.round(viewport[0] * dpr), h: Math.round(viewport[1] * dpr) }
shot && Math.abs(shot.width - wantVp.w) <= 1 && Math.abs(shot.height - wantVp.h) <= 1
  ? ok(`الالتقاط الظاهر بالمسار الحقيقي: لقطة جديدة ${shot.width}×${shot.height} بمقاس النافذة`)
  : fail(`الالتقاط الظاهر: ${JSON.stringify(shot)} والمتوقَّع ${wantVp.w}×${wantVp.h}`)

let download = null
for (let i = 0; i < 40 && !download; i++) {
  await sleep(250)
  const list = JSON.parse(
    await g.ext(
      `chrome.downloads.search({}).then((d) => JSON.stringify(d.map((x) => ({ state: x.state, error: x.error ?? null, filename: x.filename, url: x.url.slice(0, 5) }))))`,
    ),
  )
  download = list.find((d) => d.state === 'complete' && /\.png$/u.test(d.filename)) ?? null
  if (!download && list.some((d) => d.state === 'interrupted')) {
    fail(`التنزيل انقطع: ${JSON.stringify(list)}`)
    break
  }
}
if (!download) {
  fail('«احفظ نسخة في التنزيلات»: لا تنزيل مكتمل بعد الالتقاط')
} else if (!existsSync(download.filename)) {
  fail(`التنزيل مكتمل والملفّ غائب على القرص: ${download.filename}`)
} else {
  const bytes = readFileSync(download.filename)
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const w = png ? bytes.readUInt32BE(16) : 0
  const h = png ? bytes.readUInt32BE(20) : 0
  png && shot && w === shot.width && h === shot.height && download.url === 'blob:'
    ? ok(
        `«احفظ نسخة في التنزيلات»: ملفّ PNG ${w}×${h} على القرص (${bytes.length} بايت) عبر عنوان blob:`,
      )
    : fail(
        `ملفّ التنزيل: PNG=${png} ${w}×${h} عنوان ${download.url}… واللقطة ${JSON.stringify(shot)}`,
      )
}

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ الالتقاط ونسخة التنزيلات يعملان في Firefox.' })
