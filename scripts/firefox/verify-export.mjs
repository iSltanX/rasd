#!/usr/bin/env node
/**
 * حارس Firefox `export` — نافذة التصدير تُنزّل PNG وPDF إلى القرص عبر `blob:` في Firefox حقيقي.
 *
 * نظير `scripts/verify-export.mjs` فوق `scripts/lib/bidi.mjs` (SS7). الفرق المقيس في Firefox: `downloads.download`
 * يرفض `data:` ويقبل `blob:` (`Docs/Firefox/firefox_rasd.md` §1)، والتصدير يمرّر `blob:` — فالحكم على **الملفّ على
 * القرص** لا على ردّ الواجهة. واللقطة حقيقية من عيّنة `colour/`، و`downloads` دائمة في نسخة الفحص وحدها (طلبها بإيماءة
 * نافذةُ إذن لا تُنقر آليًّا):
 *   1. المحرّر يفتح اللقطة ونافذة التصدير تُفتح.
 *   2. PNG: النتيجة تعرض «افتح المجلّد» (طريق `downloads` لا المرساة)، والتنزيل مكتمل من `blob:`، والملفّ على القرص PNG
 *      بمقاس اللقطة وبكسله الأوّل أحمر كما رُسم.
 *   3. PDF: الملفّ على القرص يبدأ بـ`%PDF-` وينتهي بـ`%%EOF`، وعدد صفحاته ما تعرضه النتيجة.
 *   4. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:export
 *   RASD_GUARD_SABOTAGE=src/pages/editor/index.html pnpm firefox:export   # السالب: يجب أن يسقط
 */
import { existsSync, readFileSync } from 'node:fs'

import { startGuard } from '../lib/bidi.mjs'

const PORT = 9240
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'export',
  port: PORT,
  title: '── حارس Firefox: التصدير إلى القرص ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'], permissions: ['downloads'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()
await g.acceptSavePrompts()
note(
  'نافذة «احفظ باسم» يقبلها منتقٍ بديل بالاسم المقترح في مجلّد التنزيلات (saveAs: true مقصود في المنتج)',
)

// ── اللقطة ───────────────────────────────────────────────────────
const site = await g.openSite('/colour/')
const solid = JSON.parse(
  await g.inContext(site.context)(
    `JSON.stringify((() => { const r = document.getElementById('solid').getBoundingClientRect(); return { x: r.x, y: r.y, dpr: devicePixelRatio } })())`,
  ),
)
const W = 160
const H = 80
const captured = await g
  .inContent(
    site.tabId,
    `() => chrome.runtime.sendMessage({
      __rasd: 1, id: 'ff-export', type: 'capture/run',
      payload: { kind: 'area', dpr: ${solid.dpr}, rect: {
        space: 'device',
        x: ${Math.round((solid.x + 10) * solid.dpr)}, y: ${Math.round((solid.y + 10) * solid.dpr)},
        width: ${Math.round(W * solid.dpr)}, height: ${Math.round(H * solid.dpr)},
      } },
    }).then((r) => JSON.stringify(r))`,
    45_000,
  )
  .then((raw) => JSON.parse(raw))
  .catch((e) => ({ ok: false, error: e.message }))
if (!captured?.ok) await g.abort(`تعذّر الالتقاط: ${JSON.stringify(captured)}`)

// ── 1) المحرّر ونافذة التصدير ────────────────────────────────────
const editor = await g
  .openExtensionPage(`src/pages/editor/index.html?capture=${captured.value.id}`)
  .catch((e) => ({ error: e.message }))
if (editor.error) await g.abort(`المحرّر لم يُفتح: ${editor.error}`)
const inEditor = g.inContext(editor.context, { userActivation: true })
const waitFor = async (selector, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    if (
      (await inEditor(`!!document.querySelector(${JSON.stringify(selector)})`).catch(
        () => false,
      )) === true
    )
      return true
    await sleep(150)
  }
  return false
}
if (!(await waitFor('[data-export-open]'))) await g.abort('المحرّر لم يجهز — زرّ «تصدير» لم يظهر')
ok(`المحرّر جاهز على لقطة ${captured.value.width}×${captured.value.height}`)

/** يفتح النافذة ويختار الصيغة وينزّل، ويعيد ما تعرضه النتيجة — أو سبب السقوط. */
async function exportAs(format) {
  await inEditor(`document.querySelector('[data-export-close]')?.click(), true`)
  await inEditor(`document.querySelector('[data-export-open]').click(), true`)
  if (!(await waitFor('[data-export-modal]'))) return { error: 'لم تُفتح نافذة التصدير' }
  await inEditor(`document.querySelector('[data-export-format="${format}"]').click(), true`)
  // الدقّة 1× صراحةً (الافتراض 2×) — كي يُقارَن مقاس الملفّ بمقاس اللقطة. PDF بلا محدِّد دقّة.
  await inEditor(
    `(() => { const s = document.querySelector('[data-export-scale-select]'); if (!s) return false; s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`,
  )
  await sleep(200)
  // نقرٌ أصليّ لا `click()`: الزرّ يُبنى ويُفعَّل بعد الاختيار، والإيماءة إيماءة مستخدم.
  const at = JSON.parse(
    await inEditor(
      `JSON.stringify((() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'تنزيل'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' } })())`,
    ),
  )
  if (at.disabled) return { error: 'زرّ «تنزيل» معطَّل' }
  await g.nativeMouse([
    { type: 'move', x: at.x, y: at.y },
    { type: 'down', x: at.x, y: at.y },
    { type: 'up', x: at.x, y: at.y },
  ])
  if (
    !(await waitFor(
      `[data-export-result][data-export-kind="${format}"], [data-export-result]`,
      200,
    ))
  ) {
    return {
      error: `لم تظهر النتيجة — ${await inEditor(`(document.querySelector('[data-export-error]')?.textContent ?? '') + ' | ' + (document.querySelector('[data-export-modal]')?.innerText ?? 'لا نافذة').replace(/\\s+/g, ' ').slice(0, 300) + ' | buttons: ' + [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).join('/')`)}`,
    }
  }
  return JSON.parse(
    await inEditor(`JSON.stringify({
      kind: document.querySelector('[data-export-result]').dataset.exportKind ?? null,
      bytes: Number(document.querySelector('[data-export-result]').dataset.exportBytes ?? -1),
      pages: Number(document.querySelector('[data-export-result]').dataset.exportPages ?? -1),
      reveal: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'افتح المجلّد'),
    })`),
  )
}

/** آخر تنزيلٍ مكتمل بلاحقته — من `downloads.search` ثمّ من القرص. */
async function download(extension) {
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const list = JSON.parse(
      await g.ext(
        `chrome.downloads.search({ orderBy: ['-startTime'] }).then((d) => JSON.stringify(d.map((x) => ({ state: x.state, filename: x.filename, url: x.url.slice(0, 5), bytes: x.fileSize }))))`,
      ),
    )
    const hit = list.find((d) => d.state === 'complete' && d.filename.endsWith(extension))
    if (hit) return hit
    if (list.some((d) => d.state === 'interrupted')) return { error: JSON.stringify(list) }
  }
  return { error: 'لا تنزيل مكتمل' }
}

// ── 2) PNG ───────────────────────────────────────────────────────
const png = await exportAs('png')
if (png.error) {
  fail(`PNG: ${png.error}`)
} else {
  png.reveal
    ? ok('PNG: النتيجة تعرض «افتح المجلّد» — التنزيل عبر downloads لا المرساة')
    : fail(`PNG: لا «افتح المجلّد» — ${JSON.stringify(png)}`)
  const file = await download('.png')
  if (file.error || !existsSync(file.filename)) {
    fail(`PNG: الملفّ غائب — ${file.error ?? file.filename}`)
  } else {
    const bytes = readFileSync(file.filename)
    const sig = bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const w = sig ? bytes.readUInt32BE(16) : 0
    const h = sig ? bytes.readUInt32BE(20) : 0
    const pixel = JSON.parse(
      await g.ext(`(async () => {
        const bin = atob(${JSON.stringify(bytes.toString('base64'))})
        const b = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
        const bm = await createImageBitmap(new Blob([b], { type: 'image/png' }))
        const c = new OffscreenCanvas(bm.width, bm.height).getContext('2d')
        c.drawImage(bm, 0, 0)
        return JSON.stringify(Array.from(c.getImageData(2, 2, 1, 1).data))
      })()`),
    )
    sig &&
    w === captured.value.width &&
    h === captured.value.height &&
    file.url === 'blob:' &&
    pixel[0] === 255 &&
    pixel[1] === 0 &&
    pixel[2] === 0
      ? ok(
          `PNG على القرص ${w}×${h} (${bytes.length} بايت) من blob:، يُفكّ وبكسله الأوّل أحمر كما رُسم`,
        )
      : fail(
          `PNG على القرص: توقيع ${sig} ${w}×${h} عنوان ${file.url}… بكسل ${pixel} — واللقطة ${captured.value.width}×${captured.value.height}`,
        )
  }
}

// ── 3) PDF ───────────────────────────────────────────────────────
const pdf = await exportAs('pdf')
if (pdf.error) {
  fail(`PDF: ${pdf.error}`)
} else {
  const file = await download('.pdf')
  if (file.error || !existsSync(file.filename)) {
    fail(`PDF: الملفّ غائب — ${file.error ?? file.filename}`)
  } else {
    const text = readFileSync(file.filename).toString('latin1')
    const pages = (text.match(/\/Type\s*\/Page(?!s)/gu) ?? []).length
    text.startsWith('%PDF-') &&
    /%%EOF\s*$/u.test(text) &&
    file.url === 'blob:' &&
    pages >= 1 &&
    pages === pdf.pages
      ? ok(
          `PDF على القرص (${text.length} بايت) من blob:: ترويسة %PDF- وذيل %%EOF و${pages} صفحة كما تعرض النتيجة`,
        )
      : fail(
          `PDF على القرص: ترويسة «${text.slice(0, 5)}» ذيل ${/%%EOF\s*$/u.test(text)} صفحات ${pages}/${pdf.pages} عنوان ${file.url}…`,
        )
  }
}

// ── 4) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ التصدير ينزّل PNG وPDF إلى القرص في Firefox.' })
