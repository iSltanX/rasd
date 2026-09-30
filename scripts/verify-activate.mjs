#!/usr/bin/env node
/**
 * يثبت أن **مسار التفعيل الحقيقي** يعمل — تبويبٌ بارد، بلا أي تحضير يدوي.
 *
 * هذا السكربت هو الوحيد في المستودع الذي **لا يستدعي `startOverlay()`
 * بيده**. بقيّة سكربتات `verify-*.mjs` تستدعيه صراحةً كخطوة تحضير — وهو
 * صحيح لغرضها (فحص أداة بعينها لا فحص التفعيل)، لكنه بالضبط ما أخفى عطلًا
 * حقيقيًّا عشر مراحل: `activateTool` كان يحقن `content.js` ثم يرسل رسائل
 * إلى مستقبِلات لا يسجّلها إلا `startOverlay`، ولا أحد يستدعيه في الإنتاج.
 * فكانت كل نقطة دخول للمستخدم ميتة بينما كل بوّابة خضراء.
 *
 * لذلك: هنا **لا حقن يدويًّا ولا إقلاع يدويًّا**. التفعيل يمرّ من
 * `activateTool` وحدها كما يستدعيها الاختصار وقائمة السياق والنافذة —
 * ويُقاس أثره في الصفحة، لا في ردّ الرسالة وحده (الردّ كان يقول
 * `started: true` بينما لا شيء وقع).
 *
 * ثلاثة فحوص:
 *   1. أداة طبقة (`measure`) — الوضع يتبدّل فعلًا والطبقة تُرسم.
 *   2. `full-page` — المهمّة تكتمل وتُحفظ لقطة.
 *   3. تفعيل مزدوج — مضيف واحد ومستمع واحد، لا ازدواج.
 *
 *   pnpm build && pnpm verify:activate
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './lib/live-fixtures.mjs'
import { attachLiveServiceWorker } from './lib/live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9342
const FIXTURES = Number(process.env.RASD_FIXTURES_PORT ?? 5403)
const BASE = `http://127.0.0.1:${FIXTURES}`

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))

if (!existsSync(join(dist, 'content.js'))) {
  console.error('dist/content.js غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

// ── خادم العيّنات ────────────────────────────────────────────────
const fixtures = await ensureFixturesServer({ port: FIXTURES })

const stage = mkdtempSync(join(tmpdir(), 'rasd-activate-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
/*
 * `<all_urls>` لا أصل العيّنات وحده — كما في `verify-fullpage.mjs`:
 * `captureVisibleTab` لا يقنع بصلاحية مضيف ضيّقة (قِيس: أصلٌ مطابق تمامًا
 * لأصل العيّنات لا يكفيه، يردّ `permission-denied`)، يطلب `<all_urls>` أو
 * `activeTab` الممنوحة بإيماءة.
 *
 * **وهذا يُفعِّل ميزة الاستئناف التلقائي** (`background/resume.ts`) على كل
 * تبويب هنا — صلاحية حقيقية، فتصرّف حقيقي، لا مصادفة اختبار. لذلك «تبويب
 * بارد» في هذا الفحص يعني «بلا وضع مفروض»، لا «بلا طبقة مطلقًا» — انظر
 * التعليق عند أوّل تأكيد أدناه.
 */
manifest.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-activate-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,800',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let stderr = ''
proc.stderr.on('data', (d) => (stderr += d.toString()))

async function cleanup() {
  fixtures.stop()
  proc.kill('SIGKILL')
  rmSync(stage, { recursive: true, force: true })
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

async function connect() {
  let wsUrl = null
  // **ميزانية انتظار DevTools — ستّون ثانية لا عشر.** قِيس: كروم يُقلع على
  // عدّاء بنواتين تحت ضغط فلا يفتح منفذ التنقيح خلال 10s، فيخرج الحارس
  // «تعذّر الاتصال بـDevTools» — وهو إخفاق بيئة لا حكمٌ على المنتَج. والسقف
  // الحقيقي مهلةُ الخطوة (6 دقائق)، فانتظارٌ أطول يميّز «بطيء» من «ميّت».
  for (let i = 0; i < 240 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) wsUrl = (await res.json()).webSocketDebuggerUrl
    } catch {
      /* لم يجهز */
    }
    if (!wsUrl) await new Promise((r) => setTimeout(r, 250))
  }
  if (!wsUrl) return null
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id !== id) return
        ws.removeEventListener('message', onMsg)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      }
      ws.addEventListener('message', onMsg)
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  return { ws, send }
}

const session = await connect()
if (!session) {
  await cleanup()
  console.error('تعذّر الاتصال بـDevTools.\n' + stderr.split('\n').slice(-8).join('\n'))
  process.exit(1)
}
const { ws, send } = session

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const note = (m) => lines.push(`  · ${m}`)

// ── تحميل الإضافة ────────────────────────────────────────────────
let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

/*
 * الارتباط بسياقٍ **حيّ** لا بهدفٍ موجود — انظر ترويسة `live-sw.mjs`:
 * الهدف يظهر قبل اكتمال إقلاع العامل، فيقع التقييم بلا ربط `chrome`.
 */
const { sw, swSession } = await attachLiveServiceWorker(send, extId)

async function inSW(expression) {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    swSession,
  )
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
  return res.result.value
}

let granted = false
if (swSession) {
  try {
    granted = await inSW(
      `chrome.permissions.contains({ origins: ['${BASE}/*'] }).then(g => g).catch(() => false)`,
    )
  } catch {
    granted = false
  }
}

if (!extId || !sw) {
  fail('الإضافة أو الـservice worker لم يجهزا.')
} else if (!granted) {
  fail('صلاحية المضيف للعيّنات غير ممنوحة.')
} else {
  ok(`نسخة الفحص محمَّلة وصلاحيتها ممنوحة (${BASE}/*)`)
}

async function openTab(path) {
  const url = `${BASE}${path}`
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  return tabId
}

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  return sessionId
}

/** ينفّذ تعبيرًا داخل جلسة صفحة ويعيد قيمته — لا يرمي، يعيد `{error}`. */
async function evalIn(sessionId, expression) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

/**
 * **التفعيل كما يقع للمستخدم** — رسالة `tool/activate` إلى الخلفية، تنتهي
 * إلى `activateTool` التي تستدعيها أيضًا `chrome.commands` وقائمة السياق.
 *
 * **تُرسَل من صفحة إضافة لا من الـservice worker**: الـSW لا يصل مستقبِلاته
 * بنفسه، ورسالته إلى ذاته ترتدّ بـ«Receiving end does not exist» (نفس القيد
 * الموثَّق في `verify-fullpage.mjs`). وصفحةُ إضافةٍ مُرسِلةً هي **عين مسار
 * النافذة** (`Popup.runTool`)، فالفحص هنا أقرب إلى الواقع لا أبعد عنه.
 *
 * الغلاف كما يبنيه `send()` — انظر `shared/messaging/rpc.ts`.
 */
const activate = (driver, tabId, tool) =>
  evalIn(
    driver,
    `chrome.runtime.sendMessage({
      __rasd: 1,
      id: 'verify-activate-${tool}',
      type: 'tool/activate',
      payload: { tool: ${JSON.stringify(tool)}, tabId: ${tabId} },
    })`,
  )

/**
 * قراءة حالة الصفحة **بلا المرور بجلستنا**: `startOverlay` قد لا يكون
 * أُقلِع أصلًا (وهو ما نفحصه)، فقراءة `globalThis.__rasdCompare` أو أي
 * مرجع جلسة تفترض ما لم يثبت. تُقرأ حقيقة DOM وحدها.
 *
 * جذر الظلّ **مغلق**، فلا وصول إلى داخله من هنا — والدليل المتاح على
 * الإقلاع هو وجود العنصر المضيف نفسه وسماته الحرجة.
 */
const readPage = (tabId) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: () => {
      const all = [...document.documentElement.children]
      const hosts = all.filter((el) => el.hasAttribute('popover') && el.style.getPropertyValue('z-index') === '2147483647')
      return {
        hostCount: hosts.length,
        pointerEvents: hosts[0]?.style.getPropertyValue('pointer-events') ?? null,
        hasContentLib: typeof globalThis.__rasdContent !== 'undefined',
      }
    },
  }).then(r => r[0].result)`)

/**
 * ينفّذ في العالم المعزول لتبويب — حيث يعيش `window.__rasdSession` مهما
 * كان مصدر الجلسة (تفعيل صريح أو استئناف تلقائي)، خلافًا لـ`inPage`
 * (`world: 'MAIN'`) التي لا ترى شيئًا من سكربت المحتوى.
 */
async function inOverlay(tabId, fnSource) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: ${fnSource},
  }).then(r => r[0].result)`)
}

/** الوضع المبلَّغ عنه في `chrome.storage.session` — يكتبه `mode/report` من الصفحة. */
const reportedMode = (tabId) =>
  inSW(
    `chrome.storage.session.get('rasd:session').then(s => (s['rasd:session']?.modes ?? {})[${tabId}] ?? null)`,
  )

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))

/** ملفّ صورة PNG صالح ١×١ — بلا حاجة لعيّنة خارجية (نفس ثابت `verify-compare.mjs`). */
const TEST_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  // ── 1) أداة طبقة: التفعيل وحده يجب أن يُبدّل الوضع ويرسم الطبقة ──
  const tabId = await openTab('/picker/')

  // صفحة الإضافة القائدة — انظر تعليق `activate` أعلاه.
  const driverTab = await inSW(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), active: false }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${driverTab}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  const driver = await attachToPage('src/pages/library/')
  if (!driver) fail('تعذّر فتح صفحة الإضافة القائدة.')

  /*
   * **«بارد» يعني «بلا وضع مفروض» لا «بلا طبقة مطلقًا».**
   *
   * الصلاحية الممنوحة هنا (أصل العيّنات) تُشغِّل ميزة الاستئناف التلقائي
   * (`background/resume.ts`) على هذا التبويب بالذات بمجرّد اكتمال تحميله —
   * وهذا صحيحٌ ومقصود، لا تسرّبًا: `chrome.tabs.onUpdated` لا يميّز تبويب
   * فحصٍ عن تبويب مستخدم حقيقي، والصلاحية الممنوحة صلاحية حقيقية. فقد
   * تكون الطبقة **مُقلَعة فعلًا** الآن دون أن يمرّ التفعيل الحقيقي بعد —
   * والدليل الصحيح على «بلا تحضير يدوي» هو غياب **الوضع**، لا غياب المضيف.
   */
  await settle(500)
  const before = await readPage(tabId)
  const modeBefore = await reportedMode(tabId)
  if (modeBefore === null) {
    ok(
      `لا وضع مفروض قبل التفعيل الصريح (hostCount=${before.hostCount} — الاستئناف التلقائي لا يقحم وضعًا بلا مرجع محفوظ)`,
    )
  } else {
    fail(`وضعٌ مفروض قبل أي تفعيل صريح: ${modeBefore}`)
  }

  const act = await activate(driver, tabId, 'measure')
  await settle(600)

  const after = await readPage(tabId)
  const mode = await reportedMode(tabId)

  note(`ردّ التفعيل: ${JSON.stringify(act)}`)
  if (after.hostCount === 1) {
    ok('التفعيل وحده ركّب الطبقة في الصفحة (بلا أي إقلاع يدوي)')
  } else {
    fail(`الطبقة لم تُركَّب بالتفعيل وحده: hostCount=${after.hostCount}`)
  }

  if (mode === 'measure') {
    ok('الوضع المبلَّغ عنه في الجلسة صار `measure` — الرسالة وصلت مستقبِلًا حيًّا')
  } else {
    fail(`الوضع لم يتبدّل: المبلَّغ ${JSON.stringify(mode)} والمتوقَّع "measure"`)
  }

  // الدرع مرفوع في وضع القياس — دليل إضافي أن الوضع وصل الطبقة لا الجلسة وحدها.
  if (after.pointerEvents === 'auto') {
    ok('الدرع مرفوع (`pointer-events: auto`) — الوضع بلغ الطبقة فعلًا لا التقرير وحده')
  } else {
    fail(`الدرع غير مرفوع رغم وضع القياس: pointer-events=${JSON.stringify(after.pointerEvents)}`)
  }

  // ── 2) تفعيل مزدوج: مضيف واحد ومستمع واحد ────────────────────
  await activate(driver, tabId, 'colour')
  await settle(600)
  const twice = await readPage(tabId)
  const modeTwice = await reportedMode(tabId)

  if (twice.hostCount === 1) {
    ok('تفعيل ثانٍ على نفس التبويب: مضيف واحد لا اثنان')
  } else {
    fail(`التفعيل الثاني: المتوقَّع مضيف واحد والموجود ${twice.hostCount}`)
  }
  if (modeTwice === 'colour') {
    ok('التفعيل الثاني بدّل الوضع فعلًا — الجلسة الأولى حيّة لا مشلولة')
  } else {
    fail(`التفعيل الثاني لم يبدّل الوضع: ${JSON.stringify(modeTwice)}`)
  }

  /*
   * ازدواج المستمعات لا يُقاس بعدّ المضيفين: جلستان على مضيف واحد تعطيان
   * `hostCount === 1` وتردّان على الرسالة مرّتين. و`chrome.runtime.onMessage`
   * يعطي أوّل ردّ ويهمل الباقي، فالردّ لا يكشفها أيضًا.
   *
   * الكاشف الصادق: التفكيك. جلسة واحدة ⇒ تفكيكٌ واحد يزيل المضيف نهائيًّا.
   * جلستان ⇒ الثانية تُبقي مراقب البقاء حيًّا فيعيد إلحاق المضيف بعد إزالته.
   */
  const removed = await inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: () => {
      const all = [...document.documentElement.children]
      const host = all.find((el) => el.hasAttribute('popover') && el.style.getPropertyValue('z-index') === '2147483647')
      if (!host) return { removed: false }
      host.remove()
      return { removed: true }
    },
  }).then(r => r[0].result)`)
  await settle(500)
  const afterRemoval = await readPage(tabId)
  if (removed.removed && afterRemoval.hostCount === 1) {
    ok('مراقب البقاء أعاد الإلحاق مرّة واحدة — لا جلستان متسابقتان')
  } else if (afterRemoval.hostCount > 1) {
    fail(`إعادة الإلحاق ضاعفت المضيف (جلستان متسابقتان): hostCount=${afterRemoval.hostCount}`)
  } else {
    note(`إعادة الإلحاق لم تقع (hostCount=${afterRemoval.hostCount}) — لا تُعدّ فشلًا هنا`)
  }

  // ── 3) `full-page`: المهمّة تكتمل وتُحفظ لقطة ─────────────────
  const fpTab = await openTab('/fullpage/')
  // `captureVisibleTab` يلتقط التبويب **الظاهر** في نافذته — شرطٌ حقيقي
  // تنصّ عليه رسالة الفشل نفسها، لا حيلة اختبار. فتحُ تبويبات الفحص السابقة
  // يترك الظهور حيث انتهى، فيُعاد ضبطه صراحةً قبل القياس.
  await inSW(`chrome.tabs.update(${fpTab}, { active: true }).then(() => 1)`)
  await settle(300)
  const beforeCount = await inSW(`(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('rasd')
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    return await new Promise((res) => {
      const tx = db.transaction('captures', 'readonly')
      const req = tx.objectStore('captures').count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => res(-1)
    })
  })()`)

  const t0 = Date.now()
  const fpResult = await evalIn(
    driver,
    `(async () => {
    const listen = new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'rasd:job' })
      const timer = setTimeout(() => { port.disconnect(); resolve({ timeout: true }) }, 60000)
      let last = null
      port.onMessage.addListener((m) => {
        if (m.kind === 'progress') last = m
        if (m.kind === 'done') { clearTimeout(timer); port.disconnect(); resolve({ done: m.result, last }) }
        if (m.kind === 'failed') { clearTimeout(timer); port.disconnect(); resolve({ failed: m, last }) }
      })
    })
    const act = await chrome.runtime.sendMessage({
      __rasd: 1,
      id: 'verify-activate-fullpage',
      type: 'tool/activate',
      payload: { tool: 'full-page', tabId: ${fpTab} },
    })
    const settled = await listen
    return { act, ...settled }
  })()`,
  )
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  if (fpResult?.done) {
    ok(
      `الالتقاط الكامل اكتمل بالتفعيل وحده: ${fpResult.done.width}×${fpResult.done.height} في ${elapsed}s`,
    )
    await settle(800)
    const afterCount = await inSW(`(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('rasd')
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      return await new Promise((res) => {
        const tx = db.transaction('captures', 'readonly')
        const req = tx.objectStore('captures').count()
        req.onsuccess = () => res(req.result)
        req.onerror = () => res(-1)
      })
    })()`)
    if (afterCount > beforeCount) {
      ok(`اللقطة حُفظت فعلًا في المخزن (${beforeCount} ← ${afterCount})`)
    } else {
      fail(`المهمّة اكتملت ولم تُحفظ لقطة: العدد ${beforeCount} ← ${afterCount}`)
    }
  } else if (fpResult?.failed) {
    fail(`الالتقاط الكامل فشل: ${fpResult.failed.code} — ${fpResult.failed.message}`)
  } else if (fpResult?.timeout) {
    fail(`الالتقاط الكامل لم يُحسم خلال 60 ثانية — ردّ التفعيل ${JSON.stringify(fpResult.act)}`)
  } else {
    fail(`ردّ غير متوقَّع من الالتقاط الكامل: ${JSON.stringify(fpResult)}`)
  }

  /*
   * ── 4) الاستئناف التلقائي: مرجعٌ يعيش عبر إعادة تحميل حقيقية ─────
   *
   * الوعد المركزي لهذه الميزة («البقاء عبر التنقّل»، Rasd_Plan.md §8)
   * غير مُثبَت حيًّا بعد — الفحص الأوّل أعلاه أثبت **الجانب السلبي فقط**
   * (لا وضع يُفرَض بلا مرجع). هذا يُثبت الجانب الإيجابي: مرجعٌ محفوظ فعلًا
   * يعود بعد `chrome.tabs.reload` حقيقية — لا محاكاة، لا حقن يدوي.
   *
   * `window.__rasdSession` (`SESSION_FLAG` في `content/index.ts`) هو
   * المدخل الوحيد لجلسة بُنيت بمسار حقيقي (تفعيل أو استئناف) لا بـ
   * `startOverlay()` يدوية — هذا السكربت لا يستدعيها بيده، فهو ما يميّزه.
   */
  const resumeTab = await openTab('/picker/')
  await settle(500) // فرصة للاستئناف كي يُقلع الطبقة أوّلًا إن أراد.

  await activate(driver, resumeTab, 'compare')
  await settle(500)

  const dropped = await inOverlay(
    resumeTab,
    `() => (async () => {
      const session = await window.__rasdSession
      if (!session?.ok) return 'no-session'
      const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
      const file = new File([blob], 'ref.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const zone = session.value.host.layer.querySelector('.rasd-ov-cmp-dropzone')
      if (!zone) return 'no-dropzone'
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return 'dispatched'
    })()`,
  )
  await settle(600)

  const referenceSet = await inOverlay(
    resumeTab,
    `() => window.__rasdSession.then(s => s.ok ? !!s.value.compare.state.reference.peek() : false)`,
  )
  if (dropped === 'dispatched' && referenceSet) {
    ok('مرجع عُيِّن قبل إعادة التحميل — تمهيدٌ للفحص الحقيقي')
  } else {
    fail(`تعذّر تمهيد المرجع قبل الاستئناف: dropped=${dropped} referenceSet=${referenceSet}`)
  }

  // مغادرة الوضع أوّلًا — نفس ما يفعله المستخدم قبل تنقّل حقيقي، ويثبت أن
  // الاستئناف لا يعتمد على بقاء الوضع نشِطًا بل على المرجع المحفوظ وحده.
  await inOverlay(
    resumeTab,
    `() => window.__rasdSession.then(s => { if (s.ok) s.value.modes.set('idle') })`,
  )
  await settle(300)

  await inSW(`chrome.tabs.reload(${resumeTab}).then(() => 1)`)
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${resumeTab}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  await settle(1200) // onUpdated ← permissions.contains ← activateResume ← reference/load — كلّها غير متزامنة.

  const modeAfterReload = await reportedMode(resumeTab)
  const referenceAfterReload = await inOverlay(
    resumeTab,
    `() => window.__rasdSession ? window.__rasdSession.then(s => s.ok ? !!s.value.compare.state.reference.peek() : false) : false`,
  )
  if (modeAfterReload === 'compare' && referenceAfterReload) {
    ok('الاستئناف التلقائي أعاد وضع المقارنة ومرجعها بعد إعادة تحميل حقيقية — بلا أي إيماءة')
  } else {
    fail(
      `الاستئناف لم يستعد الحالة: الوضع بعد التحميل=${JSON.stringify(modeAfterReload)} مرجع=${referenceAfterReload}`,
    )
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص مسار التفعيل الحقيقي (تبويب بارد، بلا إقلاع يدوي) ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ التفعيل من نقطة دخول حقيقية يشغّل الطبقة والأدوات فعلًا.\n')
