#!/usr/bin/env node
/**
 * حارس Firefox `editor` — المحرّر يفتح لقطةً من Firefox ويحجب منطقةً فيها، والحجب في بايتات الملفّ لا في العرض.
 *
 * نظير `scripts/verify-editor.mjs` (قسمه السابع والثامن) فوق `scripts/lib/bidi.mjs` (SS7). اللقطة حقيقية لا مزروعة:
 * منطقةٌ تعبر حدّ `#solid` في عيّنة `colour/` (نصفها أبيض ونصفها أحمر)، والسحب أصليّ (`nativeMouse`) لأن BiDi لا يحرّك
 * مؤشّرًا في صفحة إضافة (قِيس):
 *   1. المحرّر يفتح اللقطة ويرسم طبقاته بمقاسها.
 *   2. الحجب بالتغطية يُسطّح المنطقة على القماش: لونٌ واحد وتباين صفر — والمنطقة كانت تعبر لونين.
 *   3. الضبابي يُعاين بالبكسلات فعلًا، والحساب على الـworker داخل صفحة الإضافة (CSP في Firefox).
 *   4. «نسخ» بنقرٍ أصليّ يخبز الصورة، و«احفظ الصورة» بنقرٍ أصليّ ينزّلها: المنطقة مضمونة الحجب
 *      (`data-export-guaranteed`)، والملفّ على القرص PNG ينتهي عند `IEND` بلا مقاطع وصفية، والمنطقة في **بايتاته
 *      المفكوكة** لونٌ واحد.
 *   5. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:editor
 *   RASD_GUARD_SABOTAGE=src/pages/editor/index.html pnpm firefox:editor   # السالب: يجب أن يسقط
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { startGuard } from '../lib/bidi.mjs'

const PORT = 9239
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'editor',
  port: PORT,
  title: '── حارس Firefox: المحرّر والحجب ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

// ── اللقطة: منطقة تعبر حدّ لونين ─────────────────────────────────
const site = await g.openSite('/colour/')
const inPage = g.inContext(site.context)
const solid = JSON.parse(
  await inPage(
    `JSON.stringify((() => { const r = document.getElementById('solid').getBoundingClientRect(); return { x: r.x, y: r.y, dpr: devicePixelRatio } })())`,
  ),
)
const W = 240
const H = 100
const captured = await g
  .inContent(
    site.tabId,
    `() => chrome.runtime.sendMessage({
      __rasd: 1, id: 'ff-editor', type: 'capture/run',
      payload: { kind: 'area', dpr: ${solid.dpr}, rect: {
        space: 'device',
        x: ${Math.round((solid.x - W / 2) * solid.dpr)}, y: ${Math.round((solid.y + 10) * solid.dpr)},
        width: ${Math.round(W * solid.dpr)}, height: ${Math.round(H * solid.dpr)},
      } },
    }).then((r) => JSON.stringify(r))`,
    45_000,
  )
  .then((raw) => JSON.parse(raw))
  .catch((e) => ({ ok: false, error: e.message }))
if (!captured?.ok) await g.abort(`تعذّر الالتقاط: ${JSON.stringify(captured)}`)
note(`اللقطة ${captured.value.width}×${captured.value.height} تعبر حدّ #solid`)

// ── 1) المحرّر ───────────────────────────────────────────────────
const editor = await g
  .openExtensionPage(`src/pages/editor/index.html?capture=${captured.value.id}`)
  .catch((e) => ({ error: e.message }))
if (editor.error) await g.abort(`المحرّر لم يُفتح: ${editor.error}`)
const inEditor = g.inContext(editor.context)
let ready = false
for (let i = 0; i < 80 && !ready; i++) {
  await sleep(150)
  ready = await inEditor(
    `!!document.querySelector('[data-editor-stage]') && !!document.querySelector('[data-stage-layer="annotations"]') && !!document.querySelector('[data-tool="redact"]')`,
  ).catch(() => false)
}
if (!ready) await g.abort('المحرّر لم يرسم مسرحه وأدواته')
const stage = JSON.parse(
  await inEditor(`JSON.stringify((() => {
    const wrap = document.querySelector('[data-editor-stage]').getBoundingClientRect()
    const c = document.querySelector('[data-stage-layer="annotations"]')
    return { x: wrap.x, y: wrap.y, w: wrap.width, h: wrap.height, cw: c.width, ch: c.height }
  })())`),
)
stage.w > 0 && stage.cw > 0
  ? ok(
      `المحرّر فتح اللقطة ورسم مسرحه — ${Math.round(stage.w)}×${Math.round(stage.h)} (القماش ${stage.cw}×${stage.ch})`,
    )
  : fail(`المسرح بلا مقاس: ${JSON.stringify(stage)}`)

/** تباين منطقةٍ وعدد ألوانها على طبقة القماش — بفضاء مخزنها. */
const regionStats = async (box) =>
  JSON.parse(
    await inEditor(`JSON.stringify((() => {
      const c = document.querySelector('[data-stage-layer="annotations"]')
      const d = c.getContext('2d').getImageData(${box.x}, ${box.y}, ${box.w}, ${box.h}).data
      let sum = 0, n = 0
      const seen = new Set()
      for (let i = 0; i < d.length; i += 4) { sum += 77*d[i] + 150*d[i+1] + 29*d[i+2]; seen.add((d[i]<<24 | d[i+1]<<16 | d[i+2]<<8 | d[i+3]) >>> 0); n++ }
      const mean = sum / n
      let acc = 0
      for (let i = 0; i < d.length; i += 4) { const v = 77*d[i] + 150*d[i+1] + 29*d[i+2] - mean; acc += v * v }
      return { variance: acc / n / 65536, colours: seen.size, first: [d[0], d[1], d[2], d[3]] }
    })())`),
  )

// ── 2) التغطية ───────────────────────────────────────────────────
await inEditor(`document.querySelector('[data-tool="redact"]').click(), true`)
await sleep(150)
const cx = Math.round(stage.x + stage.w / 2)
const cy = Math.round(stage.y + stage.h / 2)
const drag = { x0: cx - 60, y0: cy - 30, x1: cx + 60, y1: cy + 30 }
await g.nativeMouse([
  { type: 'move', x: drag.x0, y: drag.y0 },
  { type: 'down', x: drag.x0, y: drag.y0 },
  { type: 'move', x: cx, y: cy },
  { type: 'move', x: drag.x1, y: drag.y1 },
  { type: 'up', x: drag.x1, y: drag.y1, pause: 300 },
])
const sx = stage.cw / stage.w
// مستطيلٌ داخل المنطقة بفضاء مخزن القماش، بعيدًا عن حدّها المتقطّع — ويعبر حدّ اللونين في الوسط.
const inner = {
  x: Math.round((drag.x0 + 20 - stage.x) * sx),
  y: Math.round((drag.y0 + 12 - stage.y) * sx),
  w: Math.round(80 * sx),
  h: Math.round(36 * sx),
}
const covered = await regionStats(inner)
covered.variance === 0 && covered.colours === 1
  ? ok('التغطية تُسطّح المنطقة تمامًا — تباين صفر ولونٌ واحد على القماش، والمنطقة تعبر لونين')
  : fail(`التغطية تركت تباينًا ${covered.variance.toFixed(3)} و${covered.colours} لونًا`)

// ── 3) الضبابي ───────────────────────────────────────────────────
const switched = await inEditor(
  `(() => { const b = document.querySelector('[data-redact-mode="blur"]'); if (!b) return false; b.click(); return true })()`,
)
if (!switched) {
  fail('لوحة الحجب لم تُعرض — لا زرّ نمط')
} else {
  await sleep(600)
  await g.nativeMouse([{ type: 'move', x: cx, y: cy + 1, pause: 900 }])
  const blurred = await regionStats(inner)
  blurred.colours > 1 && blurred.variance > 0
    ? ok(
        `الضبابي يُعاين بالبكسلات — ${blurred.colours} لونًا وتباين ${blurred.variance.toFixed(1)}`,
      )
    : fail('التبديل إلى ضبابي أبقى المنطقة مسطّحة — المعاينة لم تُبنَ')
  const path = await inEditor(
    `document.querySelector('[data-editor-stage]')?.dataset.blurPath ?? 'none'`,
  )
  path === 'worker'
    ? ok('حساب الضباب على الـworker — يُحمَّل في صفحة الإضافة بلا انتهاك CSP في Firefox')
    : fail(`مسار حساب الضباب: ${path} والمتوقَّع worker`)
  await inEditor(`document.querySelector('[data-redact-mode="cover"]')?.click(), true`)
  await sleep(300)
}

// ── 4) الخبز بنقرٍ أصليّ ──────────────────────────────────────────
await inEditor(`document.querySelector('[data-tool="select"]')?.click(), true`)
await sleep(150)
const button = JSON.parse(
  await inEditor(
    `JSON.stringify((() => { const r = document.querySelector('[data-export-scale="1"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })())`,
  ),
)
await g.nativeMouse([
  { type: 'move', x: button.x, y: button.y },
  { type: 'down', x: button.x, y: button.y },
  { type: 'up', x: button.x, y: button.y },
])
let url = ''
for (let i = 0; i < 50 && !url; i++) {
  await sleep(200)
  url = await inEditor(`document.querySelector('[data-export-url]')?.dataset.exportUrl ?? ''`)
}
if (!url) {
  fail(
    `الخبز لم يكتمل: ${await inEditor(`document.querySelector('[data-export-error]')?.textContent ?? 'لا رسالة'`)}`,
  )
} else {
  /*
   * البايتات كما يأخذها المستخدم: نقرٌ أصليّ على «احفظ الصورة» فيُنزَّل الملفّ إلى مجلّد التنزيلات ويُقرأ من القرص.
   * لا `fetch` لعنوان `blob:` في الصفحة: CSP صفحات الإضافة (`connect-src 'self' …`) يمنعه في Firefox — وكروم يتجاوزه —
   * ولا شيفرة في المنتج تجلب `blob:` (قِيس: `fetch` في `src/` ثلاثة مواضع، كلّها موارد الإضافة أو الخدمتان).
   */
  const link = JSON.parse(
    await inEditor(
      `JSON.stringify((() => { const a = document.querySelector('[data-export-url]'); a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { x: Math.round(r.x + Math.min(30, r.width / 2)), y: Math.round(r.y + r.height / 2) } })())`,
    ),
  )
  await g.nativeMouse([
    { type: 'move', x: link.x, y: link.y },
    { type: 'down', x: link.x, y: link.y },
    { type: 'up', x: link.x, y: link.y },
  ])
  let file = null
  for (let i = 0; i < 40 && !file; i++) {
    await sleep(250)
    const done = readdirSync(g.downloads).filter((f) => /\.png$/u.test(f) && !f.endsWith('.part'))
    if (done.length > 0) file = join(g.downloads, done[0])
  }
  const baked = file
    ? await (async () => {
        const buf = readFileSync(file)
        const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        if (!buf.subarray(0, 8).equals(sig)) return { error: 'bad-signature' }
        const types = []
        let at = 8
        let end = -1
        while (at + 8 <= buf.length) {
          const len = buf.readUInt32BE(at)
          const type = buf.toString('latin1', at + 4, at + 8)
          types.push(type)
          at += 12 + len
          if (type === 'IEND') {
            end = at
            break
          }
        }
        /*
         * المنطقة في البايتات المفكوكة — بلا تحويل إحداثيات المسرح (الصورة داخله بهوامش): بكسلات لون التغطية في الملفّ
         * كلّه يجب أن تملأ مستطيلًا واحدًا بلا ثقب، بنسبة السحب، وفوقه مباشرةً لونا الحدّ كلاهما — أي أن ما تحت التغطية
         * لم ينجُ منه بكسل، وأن المستطيل هو منطقتنا لا مصادفة.
         */
        const region = JSON.parse(
          await g.ext(`(async () => {
            const bin = atob(${JSON.stringify(buf.toString('base64'))})
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const bm = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
            const c = new OffscreenCanvas(bm.width, bm.height).getContext('2d')
            c.drawImage(bm, 0, 0)
            const d = c.getImageData(0, 0, bm.width, bm.height).data
            const cover = ${JSON.stringify(covered.first)}
            let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
            for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) {
              const i = (y * bm.width + x) * 4
              if (d[i] === cover[0] && d[i+1] === cover[1] && d[i+2] === cover[2]) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
            }
            const above = new Set()
            if (n > 0 && y0 >= 2) for (let x = x0; x <= x1; x++) { const i = ((y0 - 2) * bm.width + x) * 4; above.add(d[i] + ',' + d[i+1] + ',' + d[i+2]) }
            return JSON.stringify({ w: bm.width, h: bm.height, n, box: n > 0 ? { w: x1 - x0 + 1, h: y1 - y0 + 1 } : null, above: [...above] })
          })()`),
        )
        const guaranteed = Number(
          await inEditor(
            `document.querySelector('[data-export-guaranteed]')?.dataset.exportGuaranteed ?? -1`,
          ),
        )
        return {
          types,
          trailing: buf.length - end,
          ...region,
          guaranteed,
          name: file.split('/').pop(),
        }
      })()
    : { error: 'لم يُنزَّل ملفّ بعد النقر على «احفظ الصورة»' }
  if (!baked.error) note(`الملفّ المنزَّل: ${baked.name}`)
  if (baked.error) {
    fail(`الملفّ المخبوز ليس PNG: ${baked.error}`)
  } else {
    const meta = baked.types.filter((t) => ['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(t))
    baked.trailing === 0 && meta.length === 0
      ? ok(`الملفّ المخبوز ${baked.w}×${baked.h} ينتهي عند IEND بلا ذيل ولا مقاطع وصفية`)
      : fail(
          `الملفّ المخبوز: ${baked.trailing} بايتًا خلف IEND · مقاطع وصفية ${meta.join('،') || 'لا'}`,
        )
    const solidBox = baked.box && baked.n === baked.box.w * baked.box.h
    const ratio = baked.box ? baked.box.w / baked.box.h : 0
    const spans = baked.above.includes('255,0,0') && baked.above.includes('255,255,255')
    baked.guaranteed >= 1 && solidBox && Math.abs(ratio - 2) < 0.35 && spans
      ? ok(
          `الحجب في البايتات المفكوكة: لون التغطية مستطيلٌ واحد ${baked.box.w}×${baked.box.h} بلا ثقب، يعبر حدّ الأحمر والأبيض، و${baked.guaranteed} منطقة مضمونة`,
        )
      : fail(
          `الحجب في الملفّ: ${baked.n} بكسلًا بلون التغطية في ${JSON.stringify(baked.box)} · فوقه ${baked.above.join(' | ')} · المضمونة ${baked.guaranteed}`,
        )
  }
}

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ المحرّر يحجب في Firefox، والحجب في بايتات الملفّ.' })
