/**
 * فحص المشاركة المحلّية — **صفر طلب شبكة صادر في المسارات كلّها** (`STAGES/10`، ADR 0044).
 *
 * المسار كاملًا في كروم حقيقي بالحزمة المبنيّة: المحرّر يُفتح بـ`share=1` (ما تبنيه «مشاركة» في النافذة) فتظهر
 * النافذة، ثمّ صفحة ويب تُنشأ وتُنزَّل إلى القرص، ثمّ تُفتح من القرص **والشبكة مقطوعة** وصورتها مفكوكة، ثمّ الحافظة
 * تُكتب وتُقرأ صورتها، ثمّ ملفٌّ يُحفظ ويُفكّ. و`Network` مفعَّل طوال ذلك على كل جلسة تعمل: العامل، والمحرّر
 * وما يولّده من عمّال، والصفحة المصدَّرة. **وكل طلبٍ ليس عنوانًا محلّيًّا (`chrome-extension:` · `blob:` ·
 * `data:` · `file:` · `about:`) يُسقط الحارس باسمه** — لا عتبة ولا قائمة سماح بنطاقات.
 *
 * والحذف قبل المشاركة يُقرأ من الملفّ على القرص لا من الواجهة: رابط اللقطة المزروع يحمل رمزًا، والرمز لا يكون
 * في الصفحة بالافتراضي.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_SHARE=leak pnpm verify:share   # يجب أن يفشل
 *
 * يُرقَّع طور «جارٍ» في نسخة الفحص فيحمّل صورةً من `http://127.0.0.1:9/rasd-leak` حين يُرسَم — أي مشاركةٌ تتّصل
 * بشيء. فيحمرّ بند «صفر طلب» باسم العنوان.
 *
 *     RASD_BREAK_SHARE=fetch pnpm verify:share  # يجب أن يفشل
 *
 * مثله بـ`fetch`. **وهذا لا يصير طلبًا أصلًا — مقيس:** سياسة صفحات الإضافة في البيان `connect-src 'self'`
 * تحجبه قبل أن يُنشأ، فلا `requestWillBeSent` له. فالحارس يقرأ سجلّ المتصفّح (`Log`) أيضًا، ومحاولةٌ حجبتها
 * السياسة تُسقطه باسمها: الحجب دفاعٌ ثانٍ، والمشاركة لا تحاول الاتصال من الأصل.
 *
 *     RASD_BREAK_SHARE=page pnpm verify:share   # يجب أن يفشل
 *
 * يُرقَّع مولِّد صفحة اللقطة فيضع قبل صورتها `<img>` بعنوانٍ خارجي — أي صفحةٌ مصدَّرة تطلب شيئًا حين تُفتح.
 * فيحمرّ بند «لا مرجع إلا `data:`» في الملفّ على القرص. والترقيعان يرميان بصوتٍ عالٍ إن لم يجدا نمطهما.
 *
 * الإقلاع والاتصال والتحميل والارتباط والتنظيف في النواة المشتركة (`scripts/lib/cdp.mjs`، `STAGES/17`).
 */

import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { attachTarget, startGuard } from './lib/cdp.mjs'

const PORT = 9352
const BREAK = process.env.RASD_BREAK_SHARE ?? ''
const LEAK = 'http://127.0.0.1:9/rasd-leak'
const W = 480
const H = 320
const SECRET = 'SECRET-SHARE-PROBE'
const TITLE = 'لقطة المشاركة المحلّية'

/** ترقيع اختبار العكس على نسخة الفحص قبل تحميلها — ويرمي إن لم يجد نمطه: الترقيع الصامت أخضر كاذب. */
function breakPatch(stage) {
  if (!BREAK) return
  if (!['leak', 'fetch', 'page'].includes(BREAK)) {
    throw new Error(`RASD_BREAK_SHARE=${BREAK}: القيم leak أو fetch أو page.`)
  }
  const assets = join(stage, 'assets')
  const files = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : []
  const Q = String.raw`["'\u0060]`
  const pattern =
    BREAK === 'page'
      ? /<figure><img src="data:/g
      : new RegExp(String.raw`${Q}data-share-running${Q}\s*:\s*${Q}${Q}`, 'g')
  const replacement =
    BREAK === 'page'
      ? `<figure><img src="${LEAK}.png" alt=""><img src="data:`
      : BREAK === 'leak'
        ? `"data-share-running":((new Image).src="${LEAK}","")`
        : `"data-share-running":(fetch("${LEAK}").catch(()=>{}),"")`
  let patched = 0
  for (const f of files) {
    const p = join(assets, f)
    const src = readFileSync(p, 'utf8')
    if (!pattern.test(src)) continue
    pattern.lastIndex = 0
    writeFileSync(p, src.replace(pattern, replacement))
    patched++
  }
  if (patched === 0) {
    throw new Error(
      `RASD_BREAK_SHARE=${BREAK}: لم يُعثر على النمط في الحزمة المبنيّة — عدِّل النمط.`,
    )
  }
}

const g = await startGuard({
  prefix: 'share',
  port: PORT,
  title: '── فحص المشاركة المحلّية (صفر طلب شبكة، والصفحة تُفتح بلا إنترنت) ──\n',
  requires: 'content.js',
  stage: { patch: breakPatch },
  serviceWorker: true,
  args: ['--window-size=1440,900'],
})
const { send, conn, ok, fail, note } = g
const extId = g.extId
const sw = g.sw
if (BREAK) note(`اختبار العكس: RASD_BREAK_SHARE=${BREAK}`)
if (!extId || !sw) await g.abort('الإضافة لم تُحمَّل أو عاملها لم يُرتبط به')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── مراقبة الشبكة على كل جلسة تعمل ───────────────────────────────

/** كل طلبٍ رآه الحارس: عنوانه ونوعه والجلسة التي أطلقته. */
const requests = []
/** محاولات اتصالٍ حجبتها سياسة المحتوى قبل أن تصير طلبًا — من سجلّ المتصفّح. */
const blocked = []
const sessionName = new Map()
conn.onEvent((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    requests.push({
      url: String(msg.params.request.url),
      type: msg.params.type,
      where: sessionName.get(msg.sessionId) ?? msg.sessionId ?? 'المتصفّح',
    })
  }
  if (msg.method === 'Log.entryAdded') {
    const text = String(msg.params.entry.text ?? '')
    if (/Content Security Policy/u.test(text) && /connect|img|load|fetch/iu.test(text)) {
      blocked.push({ text, where: sessionName.get(msg.sessionId) ?? msg.sessionId ?? 'المتصفّح' })
    }
  }
  // عمّال المحرّر (عامل الطمس) يُربطون تلقائيًّا ويُراقَبون مثله.
  if (msg.method === 'Target.attachedToTarget') {
    const child = msg.params.sessionId
    sessionName.set(
      child,
      `${msg.params.targetInfo.type} من ${sessionName.get(msg.sessionId) ?? '?'}`,
    )
    void send('Network.enable', {}, child).catch(() => undefined)
    void send('Log.enable', {}, child).catch(() => undefined)
    void send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => undefined)
  }
})

async function watch(sessionId, name) {
  sessionName.set(sessionId, name)
  await send('Network.enable', {}, sessionId)
  await send('Log.enable', {}, sessionId).catch(() => undefined)
  await send(
    'Target.setAutoAttach',
    { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
    sessionId,
  ).catch(() => undefined)
}

const LOCAL = /^(chrome-extension|blob|data|file|about|chrome|devtools):/u
const outgoing = () => requests.filter((r) => !LOCAL.test(r.url))

await watch(sw.sessionId, 'العامل')

// ── التنزيل إلى مجلّد يُقرأ ────────────────────────────────────────

const downloads = mkdtempSync(join(tmpdir(), 'rasd-share-downloads-'))
g.onCleanup(() => rmSync(downloads, { recursive: true, force: true }))
const completed = new Map()
conn.onEvent((msg) => {
  if (msg.method === 'Browser.downloadWillBegin') {
    completed.set(msg.params.guid, { name: msg.params.suggestedFilename, done: false })
  }
  if (msg.method === 'Browser.downloadProgress' && msg.params.state === 'completed') {
    const d = completed.get(msg.params.guid)
    if (d) d.done = true
  }
})
await send('Browser.setDownloadBehavior', {
  behavior: 'allowAndName',
  downloadPath: downloads,
  eventsEnabled: true,
})

/** ينتظر تنزيلًا مكتملًا جديدًا ويعيد مساره على القرص واسمه المقترَح. */
async function nextDownload(before) {
  for (let i = 0; i < 100; i++) {
    for (const [guid, d] of completed) {
      if (!before.has(guid) && d.done) return { path: join(downloads, guid), name: d.name }
    }
    await sleep(100)
  }
  return null
}

// ── المحرّر بلقطةٍ مزروعة، مفتوحًا بـ`share=1` ──────────────────────

async function evalIn(sessionId, expression, gesture = false) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, userGesture: gesture },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

async function waitFor(sessionId, selector, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const found = await evalIn(sessionId, `!!document.querySelector(${JSON.stringify(selector)})`)
    if (found === true) return true
    await sleep(150)
  }
  return false
}

const editorBase = `chrome-extension://${extId}/src/pages/editor/index.html?capture=probe`
await sw.evaluate(
  `chrome.tabs.create({ url: ${JSON.stringify(editorBase)}, active: true }).then(t => t.id)`,
)
let target = null
for (let i = 0; i < 60 && !target; i++) {
  const { targetInfos } = await send('Target.getTargets')
  target = targetInfos.find((t) => t.type === 'page' && String(t.url).includes('/editor/')) ?? null
  if (!target) await sleep(200)
}
if (!target) await g.abort('لم يُفتح المحرّر')
const S = await attachTarget(send, target.targetId, { enable: ['Page'] })
await watch(S, 'المحرّر')

const seeded = await evalIn(
  S,
  `(async () => {
    const cv = new OffscreenCanvas(${W}, ${H})
    const c = cv.getContext('2d')
    c.fillStyle = '#204060'; c.fillRect(0, 0, ${W}, ${H})
    c.fillStyle = '#ff3355'; c.fillRect(0, 0, ${W >> 1}, ${H >> 1})
    const blob = await cv.convertToBlob({ type: 'image/png' })
    const need = ['captures', 'blobs', 'annotations']
    const db = await (async () => {
      for (let i = 0; i < 80; i++) {
        const list = await indexedDB.databases()
        if (list.some(d => d.name === 'rasd')) {
          const opened = await new Promise((res, rej) => {
            const r = indexedDB.open('rasd')
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
          })
          if (need.every(n => opened.objectStoreNames.contains(n))) return opened
          opened.close()
        }
        await new Promise(r => setTimeout(r, 150))
      }
      throw new Error('قاعدة rasd لم تجهز بمخازنها')
    })()
    const tx = db.transaction(need, 'readwrite')
    tx.objectStore('annotations').delete('probe')
    tx.objectStore('captures').put({
      id: 'probe', createdAt: Date.now(), origin: 'http://127.0.0.1:5399',
      url: 'http://127.0.0.1:5399/checkout?session=${SECRET}',
      title: ${JSON.stringify(TITLE)}, kind: 'viewport', status: 'ready', projectId: null, tags: [],
      width: ${W}, height: ${H}, devicePixelRatio: 1, favorite: false, trashedAt: null, archived: false,
    })
    tx.objectStore('blobs').put({ id: 'probe', blob, mime: 'image/png', bytes: blob.size })
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    return 'ok'
  })().catch(e => String(e))`,
)
if (seeded !== 'ok') await g.abort(`زرع اللقطة فشل: ${JSON.stringify(seeded)}`)

/*
 * الرفض يُزرع قبل إعادة التحميل (نمط `verify:export`): طلب صلاحيةٍ في وضعٍ بلا رأس لا يُجاب، فيسلك التنزيل
 * طريق المرساة — وهو ما يحتاجه الحارس: تنزيلٌ يقع في المجلّد المؤقّت بلا سؤال.
 */
await evalIn(S, `chrome.storage.session.set({ 'export.downloadsRefused': true })`)
await send('Browser.grantPermissions', {
  origin: `chrome-extension://${extId}`,
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
}).catch((e) => note(`منح الحافظة: ${e.message}`))
await send('Emulation.setFocusEmulationEnabled', { enabled: true }, S).catch(() => undefined)
await send('Page.navigate', { url: `${editorBase}&share=1` }, S)
await sleep(800)

if (await waitFor(S, '[data-share][data-phase="choose"]')) {
  ok('`share=1` يفتح المحرّر ونافذة المشاركة فوقه — ما تبنيه «مشاركة» في النافذة')
} else {
  await g.abort('نافذة المشاركة لم تظهر مع `share=1`')
}
// قراءة الرفض بعد التركيب تحتاج نبضة — النقر قبلها يطلب الصلاحية (درس `STAGES/06`).
await sleep(700)

const shape = JSON.parse(
  await evalIn(
    S,
    `JSON.stringify({
      paths: [...document.querySelectorAll('input[data-share-path]')].map(i => [i.value, i.disabled]),
      cloud: (() => { const c = document.querySelector('input[data-share-cloud]'); return c ? [c.disabled, c.closest('label')?.textContent ?? ''] : null })(),
      reason: document.querySelector('[data-share-cloud-reason]')?.textContent ?? '',
      strip: [...document.querySelectorAll('[data-share-strip-field]')].map(f => [f.dataset.shareStripField, f.querySelector('[role="switch"]')?.checked ?? null]),
    })`,
  ),
)
const pathsOk =
  JSON.stringify(shape.paths) ===
  JSON.stringify([
    ['page', false],
    ['clipboard', false],
    ['file', false],
  ])
if (pathsOk) ok('ثلاثة مسارات تعمل: صفحة ويب · الحافظة · ملفّ')
else fail(`المسارات: ${JSON.stringify(shape.paths)}`)
if (
  shape.cloud?.[0] === true &&
  shape.cloud[1].includes('قريبًا') &&
  shape.reason.includes('خادم')
) {
  ok('الرابط السحابي معروض معطَّلًا «قريبًا»، وسببه نصٌّ مرئيّ')
} else {
  fail(`الرابط السحابي: ${JSON.stringify(shape.cloud)} · ${shape.reason}`)
}
if (
  JSON.stringify(shape.strip) ===
  JSON.stringify([
    ['url', true],
    ['title', false],
    ['time', true],
  ])
) {
  ok('الحذف الافتراضي: الرابط والوقت محذوفان والعنوان باقٍ')
} else {
  fail(`مفاتيح الحذف: ${JSON.stringify(shape.strip)}`)
}

const click = (selector) =>
  evalIn(
    S,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; el.click(); return 'ok' })()`,
    true,
  )

/** يغلق النافذة ويفتحها من زرّ المحرّر — المدخل الثاني. */
async function reopen() {
  await click('[data-share-finish]')
  await sleep(200)
  if ((await click('[data-share-open]')) !== 'ok') return false
  return waitFor(S, '[data-share][data-phase="choose"]')
}

// ── صفحة ويب ─────────────────────────────────────────────────────

let before = new Set(completed.keys())
await click('[data-share-run="page"]')
if (!(await waitFor(S, '[data-share-done="page"]'))) {
  const shown = await evalIn(S, `document.querySelector('[data-share]')?.textContent ?? ''`)
  await g.abort(`الصفحة لم تكتمل: ${String(shown).slice(0, 200)}`)
}
const pageFile = await nextDownload(before)
if (!pageFile) {
  fail('الصفحة لم تصل إلى القرص')
} else {
  const html = readFileSync(pageFile.path, 'utf8')
  ok(`الصفحة على القرص: ${pageFile.name} — ${(html.length / 1024).toFixed(1)}KB`)
  const refs = [...html.matchAll(/\b(?:src|href|srcset|poster|action)\s*=\s*"([^"]*)"/giu)].map(
    (m) => m[1],
  )
  const external = refs.filter((r) => !r.startsWith('data:'))
  if (refs.length > 0 && external.length === 0)
    ok(`لا مرجع في الملفّ إلا \`data:\` (${refs.length})`)
  else fail(`مراجع خارجية في الصفحة المصدَّرة: ${external.join(' · ') || 'لا صورة'}`)
  if (html.includes(`content="default-src 'none'`)) ok("سياسة `default-src 'none'` في رأس الصفحة")
  else fail('الصفحة بلا سياسة المحتوى')
  if (/<script\b/iu.test(html)) fail('سكربت في الصفحة المصدَّرة')
  if (!html.includes(SECRET) && !html.includes('127.0.0.1:5399')) {
    ok('رابط اللقطة برمزه ليس في الملفّ — محذوفٌ بالافتراضي')
  } else {
    fail('رابط اللقطة برمزه في الصفحة المصدَّرة رغم حذفه')
  }
  if (html.includes(TITLE)) ok('العنوان الباقي في الصفحة')
  else fail('العنوان غائب عن الصفحة وهو غير محذوف')

  // تُفتح من القرص والشبكة مقطوعة، وصورتها تُفكّ بأبعادها. والتنزيل يُحفظ باسمٍ بلا امتداد (`allowAndName`)
  // فيُعرض نصًّا — فيُنسخ باسمه المقترَح كما يجده المستلم.
  const named = join(downloads, pageFile.name)
  copyFileSync(pageFile.path, named)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const P = await attachTarget(send, targetId, { enable: ['Page'] })
  await watch(P, 'الصفحة المصدَّرة')
  await send(
    'Network.emulateNetworkConditions',
    {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    },
    P,
  )
  await send('Page.navigate', { url: pathToFileURL(named).href }, P)
  let opened = null
  for (let i = 0; i < 40; i++) {
    await sleep(150)
    opened = await evalIn(
      P,
      `(() => { const i = document.images; return i.length ? JSON.stringify([...i].map(x => [x.complete, x.naturalWidth, x.naturalHeight])) : '' })()`,
    )
    if (opened && JSON.parse(opened).every((x) => x[0])) break
  }
  const images = opened ? JSON.parse(opened) : []
  if (images.length === 1 && images[0][1] === W && images[0][2] === H) {
    ok(`مفتوحةً من القرص والشبكة مقطوعة: الصورة مفكوكة ${W}×${H}`)
  } else {
    fail(`الصفحة من القرص: الصور ${JSON.stringify(images)}`)
  }
  await send('Target.closeTarget', { targetId }).catch(() => undefined)
}

// ── الحافظة ──────────────────────────────────────────────────────

if (!(await reopen())) fail('زرّ «مشاركة» في المحرّر لا يعيد فتح النافذة')
else ok('زرّ «مشاركة» في المحرّر يفتح النافذة')
await click('input[data-share-path="clipboard"]')
await sleep(150)
await click('[data-share-run="clipboard"]')
if (await waitFor(S, '[data-share-copied]', 60)) {
  const clip = await evalIn(
    S,
    `(async () => {
      const items = await navigator.clipboard.read()
      const item = items.find(i => i.types.includes('image/png'))
      if (!item) return JSON.stringify({ types: items.flatMap(i => i.types) })
      const bmp = await createImageBitmap(await item.getType('image/png'))
      const out = { w: bmp.width, h: bmp.height }
      bmp.close()
      return JSON.stringify(out)
    })().catch(e => JSON.stringify({ error: String(e) }))`,
  )
  const read = JSON.parse(clip)
  if (read.w === W && read.h === H) ok(`الحافظة: صورة PNG مفكوكة ${W}×${H}`)
  else if (read.error) note(`قراءة الحافظة لم تُتَح في هذه البيئة: ${read.error} — الكتابة نجحت`)
  else fail(`الحافظة: ${clip}`)
} else {
  const shown = await evalIn(S, `document.querySelector('[data-share-error]')?.textContent ?? ''`)
  fail(`النسخ إلى الحافظة لم ينجح: ${shown}`)
}

// ── ملفّ ────────────────────────────────────────────────────────

if (!(await reopen())) await g.abort('النافذة لم تُفتح للملفّ')
await click('input[data-share-path="file"]')
await sleep(150)
await evalIn(
  S,
  `(() => { const s = document.querySelector('select[data-share-scale]'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`,
)
await sleep(150)
before = new Set(completed.keys())
await click('[data-share-run="file"]')
if (!(await waitFor(S, '[data-share-done="file"]'))) {
  fail('الملفّ لم يكتمل')
} else {
  const degraded = await evalIn(S, `!!document.querySelector('[data-share-degraded]')`)
  if (degraded === true) ok('الرفض المزروع: الملفّ حُفظ بالمرساة ولافتة الرفض معروضة')
  else fail('لافتة الرفض غائبة وقد رُفضت الصلاحية')
  const file = await nextDownload(before)
  if (!file) {
    fail('الملفّ لم يصل إلى القرص')
  } else {
    const bytes = readFileSync(file.path)
    const png = bytes.subarray(1, 4).toString('latin1') === 'PNG'
    const w = bytes.readUInt32BE(16)
    const h = bytes.readUInt32BE(20)
    if (png && w === W && h === H) ok(`الملفّ على القرص: ${file.name} — PNG ${w}×${h}`)
    else fail(`الملفّ على القرص: ${file.name} png=${png} ${w}×${h}`)
  }
}

// ── الحكم ───────────────────────────────────────────────────────

await sleep(300)
const out = outgoing()
note(`طلباتٌ محلّية رُصدت: ${requests.length - out.length}`)
if (out.length === 0) {
  ok('صفر طلب شبكة صادر في المسارات الثلاثة وفتح الصفحة — من العامل والمحرّر وعمّاله والصفحة')
} else {
  for (const r of out.slice(0, 10)) fail(`طلب صادر: ${r.url} (${r.type ?? '?'}) من ${r.where}`)
}
if (blocked.length === 0) {
  ok('ولا محاولة اتصال حجبتها سياسة المحتوى — المشاركة لا تحاول الاتصال من الأصل')
} else {
  for (const b of blocked.slice(0, 5))
    fail(`محاولة اتصال حجبتها السياسة من ${b.where}: ${b.text.slice(0, 160)}`)
}

await g.finish({ success: '✓ المشاركة محلّية: لا طلب يغادر الجهاز، والصفحة تُفتح بلا إنترنت.' })
