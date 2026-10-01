#!/usr/bin/env node
/**
 * **إثبات وصول البلاغ** — معيار القبول الأوّل في `STAGES/13`: بلاغٌ تجريبي بصورة يُرسَل من الحزمة المبنيّة إلى
 * القناة الحقيقية، ثمّ `gh issue view` يعرض نصّه وتشخيصه وصورته، والرقم المعروض للمستخدم يطابقه — والمنطقة المحجوبة
 * في **الصورة المستلَمة** سوداء مصمتة.
 *
 * **ليس حارسًا ولا يدخل CI:** يفتح Issue حقيقيًّا في `iSltanX/app-reports` (بوسم `test`)، فلا يُشغَّل إلا بأمر:
 *
 *   VITE_RASD_REPORT_TEST=1 pnpm build && node scripts/report-proof.mjs
 *
 * يمرّ بالواجهة كما يمرّ المستخدم: يوقف «الوضع المحلّي فقط» من الخصوصية، ويفتح النافذة من رابط «أبلغ عن المشكلة»
 * بأداةٍ ورمز، ويملأ الخطوة الأولى، ويرفق ملفًّا من منتقي الملفّات، ويحجب منطقةً بالسحب، ويقرأ المراجعة، ثمّ «أرسل».
 *
 * **فرقٌ واحد عن المستخدم، مكتوب:** صلاحية المضيف ممنوحةٌ في بيان نسخة الفحص (`host_permissions`) لا بنقرة —
 * نافذة طلب الإذن من المتصفّح نفسه ولا تُنقر من بروتوكول التنقيح. والمسار بعدها هو المسار المشحون: المخرج يجد الإذن.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openTarget, startGuard } from './lib/cdp.mjs'

const PORT = 9396
const REPO = 'iSltanX/app-reports'
const ORIGIN = 'https://app-reports.isultantf.workers.dev'
/** الصورة التجريبية ومنطقتها السرّية بفضائها — تُحجب بالسحب، ويُفحص سوادها في الملفّ المستلَم. */
const IMAGE = { width: 640, height: 400 }
const SECRET = { x: 400, y: 60, w: 180, h: 80 }
const MARGIN = 6

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'report-proof',
  port: PORT,
  title: 'إثبات وصول البلاغ — من الحزمة المبنيّة إلى القناة',
  stage: { hostPermissions: [`${ORIGIN}/*`] },
  hardTimeoutMs: 240_000,
})
if (g.loadError || !g.extId) await g.abort(`لم تُحمَّل الإضافة: ${g.loadError}`)

const base = `chrome-extension://${g.extId}/src/pages/settings/index.html`
const { sessionId, targetId } = await openTarget(g.send, `${base}?section=privacy`, {
  enable: ['Page', 'DOM'],
})
await g.send('Target.activateTarget', { targetId })
const evaluate = g.evaluate(sessionId, { withExpression: true })

async function until(expression, what, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await evaluate(expression).catch(() => null)
    if (value) return value
    if (Date.now() > end) await g.abort(`انتهت المهلة: ${what}`)
    await sleep(150)
  }
}

const click = (label) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)})
    if (!b) throw new Error('لا زرّ ' + ${JSON.stringify(label)})
    b.click()
    return true
  })()`)
const phase = (name) =>
  until(
    `document.querySelector('[data-data-dialog="report"]')?.dataset.phase === ${JSON.stringify(name)}`,
    `الحالة ${name}`,
  )

// ── ١. «الوضع المحلّي فقط» يُطفأ من الخصوصية — كما يفعل المستخدم ──────────────────────
await until(
  `document.querySelector('input[aria-label="الوضع المحلّي فقط"]')`,
  'مفتاح الوضع المحلّي',
)
const wasOn = await evaluate(
  `document.querySelector('input[aria-label="الوضع المحلّي فقط"]').checked`,
)
if (wasOn)
  await evaluate(`document.querySelector('input[aria-label="الوضع المحلّي فقط"]').click(), true`)
await until(
  `chrome.storage.local.get('rasd:settings').then((s) => s['rasd:settings']?.privacy?.localOnly === false)`,
  'حفظ «الوضع المحلّي فقط» مطفأً',
)
g.ok(`«الوضع المحلّي فقط» كان ${wasOn ? 'مفعَّلًا (الافتراضي)' : 'مطفأً'} — وأُطفئ من الخصوصية`)

// ── ٢. الصورة التجريبية: ملفّ PNG على القرص، فيه «سرّ» أحمر بنصّ ──────────────────────
const png = await evaluate(`(async () => {
  const c = new OffscreenCanvas(${IMAGE.width}, ${IMAGE.height})
  const x = c.getContext('2d')
  const grad = x.createLinearGradient(0, 0, ${IMAGE.width}, ${IMAGE.height})
  grad.addColorStop(0, '#0e1416'); grad.addColorStop(1, '#00a896')
  x.fillStyle = grad; x.fillRect(0, 0, ${IMAGE.width}, ${IMAGE.height})
  x.fillStyle = '#f4f7f9'; x.font = 'bold 28px sans-serif'; x.fillText('RASD REPORT PROOF', 24, 200)
  x.fillStyle = '#ff0000'; x.fillRect(${SECRET.x}, ${SECRET.y}, ${SECRET.w}, ${SECRET.h})
  x.fillStyle = '#ffffff'; x.font = 'bold 22px monospace'; x.fillText('SECRET-1234', ${SECRET.x + 14}, ${SECRET.y + 48})
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
})()`)
const dir = mkdtempSync(join(tmpdir(), 'rasd-report-proof-'))
g.onCleanup(() => rmSync(dir, { recursive: true, force: true }))
const file = join(dir, 'proof.png')
writeFileSync(file, Buffer.from(png, 'base64'))
g.ok(`صورةٌ تجريبية ${IMAGE.width}×${IMAGE.height} بمنطقةٍ سرّية حمراء عند ${SECRET.x},${SECRET.y}`)

// ── ٣. «أبلغ عن المشكلة» كما يفتحه رابط رسالة الخطأ ─────────────────────────────────
await g.send(
  'Page.navigate',
  { url: `${base}?section=about&report=1&tool=full-page&code=PROOF_TEST` },
  sessionId,
)
await phase('describe')
const stamp = new Date().toISOString()
for (const [id, value] of [
  ['report-field-title', `بلاغ تجريبي من رصد — إثبات الوصول ${stamp}`],
  [
    'report-field-what',
    'بلاغٌ تجريبي يرسله سكربت إثبات الوصول من الحزمة المبنيّة. فيه صورة بمنطقةٍ محجوبة.',
  ],
  [
    'report-field-steps',
    '١. فُتحت النافذة من رابط «أبلغ عن المشكلة».\n٢. أُرفقت صورة وحُجب جزءٌ منها.',
  ],
]) {
  await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)})
    el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
}
await sleep(100)
await click('التالي: الصورة')
await phase('image')
g.ok('الخطوة الأولى مملوءة، والأداة والرمز من الرابط')

// ── ٤. الصورة من منتقي الملفّات، ثمّ الحجب بالسحب على المسرح ─────────────────────────
const { root } = await g.send('DOM.getDocument', { depth: -1, pierce: true }, sessionId)
const { nodeId } = await g.send(
  'DOM.querySelector',
  { nodeId: root.nodeId, selector: 'input[type="file"]' },
  sessionId,
)
await g.send('DOM.setFileInputFiles', { nodeId, files: [file] }, sessionId)
await until(`document.querySelector('[data-report-image="loaded"]')`, 'تحميل الصورة')
const box = await evaluate(`(() => {
  const r = document.querySelector('[data-report-image="loaded"] [data-mode]').getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
})()`)
const toClient = (ix, iy) => ({
  x: box.left + (ix / IMAGE.width) * box.width,
  y: box.top + (iy / IMAGE.height) * box.height,
})
const from = toClient(SECRET.x - MARGIN, SECRET.y - MARGIN)
const to = toClient(SECRET.x + SECRET.w + MARGIN, SECRET.y + SECRET.h + MARGIN)
const mouse = (type, p) =>
  g.send(
    'Input.dispatchMouseEvent',
    {
      type,
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
    },
    sessionId,
  )
await mouse('mouseMoved', from)
await mouse('mousePressed', from)
for (let i = 1; i <= 8; i++) {
  await mouse('mouseMoved', {
    x: from.x + ((to.x - from.x) * i) / 8,
    y: from.y + ((to.y - from.y) * i) / 8,
  })
}
await mouse('mouseReleased', to)
await until(`document.body.textContent.includes('محجوب ١.')`, 'تسجيل الحجب')
g.ok('أُرفقت الصورة بمنتقي الملفّات وحُجبت المنطقة السرّية بالسحب')

// ── ٥. المراجعة: ما سيُرسَل بالضبط ─────────────────────────────────────────────────
await click('التالي: المراجعة')
await phase('review')
const rows = await evaluate(
  `[...document.querySelectorAll('[data-report-key]')].map((r) => [r.dataset.reportKey, r.lastElementChild.textContent])`,
)
for (const [key, value] of rows)
  g.note(`${key} = ${String(value).replace(/\n/gu, ' ⏎ ').slice(0, 120)}`)
const shown = Object.fromEntries(rows)
if (shown['diagnostics.tool'] !== 'full-page' || shown['diagnostics.error_code'] !== 'PROOF_TEST') {
  g.fail('التشخيص المعروض بلا الأداة أو الرمز من الرابط')
}
if (shown.test !== 'true') g.fail('البناء ليس تجريبيًّا — ابنِ بـVITE_RASD_REPORT_TEST=1')

// ── ٦. «أرسل البلاغ» ─────────────────────────────────────────────────────────────────
await click('أرسل البلاغ')
const outcome = await until(
  `(() => { const p = document.querySelector('[data-data-dialog="report"]')?.dataset.phase; return p === 'sent' || p === 'failed' ? p : null })()`,
  'ردّ القناة',
  90_000,
)
const dialogText = await evaluate(
  `document.querySelector('[data-data-dialog="report"]').textContent`,
)
if (outcome !== 'sent') await g.abort(`لم يصل البلاغ: ${dialogText}`)
const id = Number(/#(\d+)/u.exec(dialogText)?.[1])
if (!Number.isInteger(id)) await g.abort(`لا رقم في «وصل بلاغك»: ${dialogText}`)
g.ok(`وصل البلاغ — الرقم المعروض للمستخدم #${id}`)
const draftLeft = await evaluate(`new Promise((resolve) => {
  const open = indexedDB.open('rasd'); open.onsuccess = () => {
    const tx = open.result.transaction('reportDrafts'); const req = tx.objectStore('reportDrafts').count()
    req.onsuccess = () => { resolve(req.result); open.result.close() }
  }
})`)
if (draftLeft === 0) g.ok('لا مسودة بعد نجاح الإرسال')
else g.fail(`بقيت ${draftLeft} مسودة بعد نجاح الإرسال`)

// ── ٧. ما وصل: `gh issue view` ─────────────────────────────────────────────────────
const issue = JSON.parse(
  execFileSync(
    'gh',
    ['issue', 'view', String(id), '--repo', REPO, '--json', 'number,title,body,labels,url'],
    {
      encoding: 'utf8',
    },
  ),
)
const labels = issue.labels.map((l) => l.name)
g.note(`gh issue view ${id} --repo ${REPO} — ${issue.url}`)
g.note(`العنوان: ${issue.title}`)
g.note(`الوسوم: ${labels.join(' · ')}`)
if (issue.number !== id) g.fail(`الرقم المعروض ${id} والـIssue ${issue.number}`)
for (const label of ['product:rasd', 'kind:bug', 'test']) {
  if (!labels.includes(label)) g.fail(`وسمٌ غائب: ${label}`)
}
for (const needle of [stamp, 'PROOF_TEST', 'full-page', 'browser_version']) {
  if (!issue.body.includes(needle)) g.fail(`نصّ البلاغ أو تشخيصه بلا «${needle}»`)
}
if (labels.includes('attachment-failed')) g.fail('القناة سجّلت فشل المرفق')
const path = /reports\/rasd\/\d+\/[\w.-]+\.(?:png|jpg)/u.exec(issue.body)?.[0]
if (!path) await g.abort('لا رابط صورة في نصّ البلاغ')
g.ok(`النصّ والتشخيص والوسوم في البلاغ، والصورة مرفقٌ خاصّ: ${path}`)

// ── ٨. الصورة المستلَمة: المنطقة المحجوبة سوداء مصمتة، وخارجها كما هو ─────────────────
const received = execFileSync(
  'gh',
  ['api', `repos/${REPO}/contents/${path}`, '-H', 'Accept: application/vnd.github.raw'],
  { maxBuffer: 8 * 1024 * 1024 },
)
const pixels = await evaluate(`(async () => {
  const bin = atob(${JSON.stringify(received.toString('base64'))})
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0)
  const d = x.getImageData(${SECRET.x}, ${SECRET.y}, ${SECRET.w}, ${SECRET.h}).data
  let black = 0; const total = d.length / 4
  for (let i = 0; i < d.length; i += 4) if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] === 255) black++
  const outside = Array.from(x.getImageData(24, 24, 1, 1).data)
  return { width: bmp.width, height: bmp.height, black, total, outside }
})()`)
g.note(`الصورة المستلَمة ${pixels.width}×${pixels.height} · ${received.length} بايت`)
if (pixels.black === pixels.total) {
  g.ok(`المنطقة المحجوبة في الصورة المستلَمة سوداء مصمتة: ${pixels.black} من ${pixels.total} بكسل`)
} else {
  g.fail(`المنطقة المحجوبة في الصورة المستلَمة: ${pixels.black} من ${pixels.total} بكسل أسود فقط`)
}
if (pixels.outside.slice(0, 3).every((v) => v === 0))
  g.fail('ما خارج الحجب أسود أيضًا — الصورة لم تصل كما هي')

await g.finish({ success: `✓ وصل البلاغ #${id} بنصّه وتشخيصه وصورته المحجوبة.` })
