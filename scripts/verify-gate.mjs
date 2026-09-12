#!/usr/bin/env node
/**
 * حارس البوّابة الواحدة للحقن — **امتناعٌ مقيس، لا قرارٌ في اختبار**.
 *
 * **العلّة التي بُني لها.** الاختبار الوحدوي يُثبت أن `canOperateOnTab` تردّ
 * `excluded-site`. وهذا ليس إثباتًا أن الإضافة **لا تحقن**: بين القرار
 * والحقن `activateTool` و`chrome.scripting` وكروم. والوعد المكتوب في شاشة
 * الإعدادات («لا تعمل الإضافة هنا») وعدٌ عن الحقن لا عن قيمةٍ مُعادة —
 * فيُقاس ما يراه المستخدم وحده: هل ظهر المضيف في صفحته أم لا.
 *
 * **وأخطر ما يُقاس هنا: المسار بلا إيماءة.** النسخة مُرقَّعة بـ`<all_urls>`،
 * فالاستئناف التلقائي (`background/resume.ts`) يحقن في كل تبويب جديد —
 * صلاحية حقيقية فتصرّف حقيقي. ولهذا **يُكتَب الاستثناء قبل فتح التبويب**:
 * لو كُتب بعده لَما قاس الفحص إلّا مسار الإيماءة، ولَبدا التبويب محقونًا
 * أصلًا فلا يُقرأ منه شيء. وهذا هو بالضبط سيناريو المستخدم الحقيقي: منح
 * صلاحيةً لموقع، ثمّ استثناه بعدها — فلا يجوز أن يعلو الإذن القديم على
 * قراره الجديد (ADR 0020، الحقيقة 3).
 *
 * **والسالب يُثبَت على التبويب نفسه**: يُرفَع الاستثناء فيعمل التفعيل. بلا
 * هذا البند يمرّ الحارس أخضر لو كان التفعيل معطّلًا لسببٍ آخر تمامًا —
 * ويُقرأ العطل حمايةً.
 *
 * **ليس فيه**: دلالة الأنماط (‏٦٤ متجهًا في `tests/unit/site-match.test.ts`)
 * ولا الإغلاق عند تعذّر قراءة الإعدادات (‏`tests/unit/injection-gate.test.ts`).
 * تلك قرارات خالصة تُقاس أرخص وأشمل بلا كروم. هنا الجسر وحده: من القرار
 * إلى الامتناع الفعلي.
 *
 *   pnpm build && pnpm verify:gate
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './live-fixtures.mjs'
import { attachLiveServiceWorker } from './live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9347
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

const fixtures = await ensureFixturesServer({ port: FIXTURES })

const stage = mkdtempSync(join(tmpdir(), 'rasd-gate-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
/*
 * `<all_urls>` مقصودة هنا لا تسهيلًا: هي ما يُفعِّل الاستئناف التلقائي على
 * كل تبويب، وهو المسار الذي يُقاس. نسخة الفحص وحدها مُرقَّعة — المنتج
 * المشحون بلا صلاحية مضيف (‏`verify:capture` يحرس ذلك).
 */
manifest.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-gate-'))
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
  // ستّون ثانية لا عشر — نفس تعليل `verify-activate.mjs`: عدّاءٌ محمَّل لا
  // يفتح منفذ التنقيح خلال 10s، وذاك إخفاق بيئة لا حكمٌ على المنتَج.
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

let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

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
  fail('صلاحية المضيف للعيّنات غير ممنوحة — بلا صلاحية لا يُقاس مسار الاستئناف أصلًا.')
} else {
  ok(`نسخة الفحص محمَّلة وصلاحيتها ممنوحة (${BASE}/*) — الاستئناف التلقائي مُفعَّل`)
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
 * وجود المضيف في الصفحة — **الدليل الوحيد المقبول على الحقن**.
 *
 * لا يُقرأ `globalThis.__rasdCompare` ولا أي مرجع جلسة: تلك تفترض إقلاعًا
 * هو نفسه موضع الفحص. وجذر الظلّ مغلق، فالمتاح هو العنصر المضيف وسماته.
 */
const readPage = (tabId) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: () => {
      const all = [...document.documentElement.children]
      const hosts = all.filter((el) => el.hasAttribute('popover') && el.style.getPropertyValue('z-index') === '2147483647')
      return { hostCount: hosts.length, hasContentLib: typeof globalThis.__rasdContent !== 'undefined' }
    },
  }).then(r => r[0].result)`)

/**
 * التفعيل كما يقع للمستخدم — رسالة `tool/activate` تنتهي إلى `activateTool`.
 * تُرسَل من صفحة إضافة لا من الـservice worker: رسالة العامل إلى ذاته ترتدّ
 * (‏نفس القيد الموثَّق في `verify-activate.mjs` و`verify-fullpage.mjs`).
 */
const activate = (driver, tabId, tool) =>
  evalIn(
    driver,
    `chrome.runtime.sendMessage({
      __rasd: 1,
      id: 'verify-gate-${tool}',
      type: 'tool/activate',
      payload: { tool: ${JSON.stringify(tool)}, tabId: ${tabId} },
    })`,
  )

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const driverTab = await inSW(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), active: false }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${driverTab}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  const driver = await attachToPage('src/pages/library/')
  if (!driver) fail('تعذّر فتح صفحة الإضافة القائدة.')

  /** تُكتب القائمة كما تكتبها شاشة الإعدادات: رسالة `settings/patch`. */
  const setExcluded = (sites) =>
    evalIn(
      driver,
      `chrome.runtime.sendMessage({
        __rasd: 1,
        id: 'verify-gate-exclude-${sites.length}',
        type: 'settings/patch',
        payload: { patch: { privacy: { excludedSites: ${JSON.stringify(sites)} } } },
      })`,
    )

  if (driver) {
    // ── 1) الاستثناء يُكتَب **قبل** فتح التبويب — انظر الترويسة ──
    const written = await setExcluded(['127.0.0.1'])
    const list = written?.value?.privacy?.excludedSites
    if (Array.isArray(list) && list[0] === '127.0.0.1') {
      ok('الاستثناء مكتوب في الإعدادات عبر `settings/patch` — كما تكتبه الشاشة')
    } else {
      fail(`لم تُكتب قائمة الاستثناء: ${JSON.stringify(written)}`)
    }

    const excludedTab = await openTab('/index.html')
    await settle(1500) // onUpdated ← permissions.contains ← activateResume — كلّها غير متزامنة.

    const passive = await readPage(excludedTab)
    if (passive.hostCount === 0 && !passive.hasContentLib) {
      ok('**الاستئناف التلقائي لم يحقن في موقع مستثنى** — بلا إيماءة، والصلاحية ممنوحة له')
    } else {
      fail(
        `حُقن بلا إيماءة في موقع مستثنى: hostCount=${passive.hostCount} lib=${passive.hasContentLib}`,
      )
    }

    // ── 2) والتفعيل الصريح يُرفض بسببه هو ──
    const denied = await activate(driver, excludedTab, 'measure')
    note(`ردّ التفعيل على موقع مستثنى: ${JSON.stringify(denied?.value ?? denied)}`)
    if (denied?.value?.started === false && denied.value.reason === 'excluded-site') {
      ok('والتفعيل الصريح رُفض بـ`excluded-site` — سببه هو، لا خطأ عام ولا نجاح كاذب')
    } else {
      fail(`ردٌّ غير متوقّع على موقع مستثنى: ${JSON.stringify(denied)}`)
    }

    const afterDenied = await readPage(excludedTab)
    if (afterDenied.hostCount === 0 && !afterDenied.hasContentLib) {
      ok('ولم تُحقَن شيفرة بعد الرفض — امتناعٌ فعلي لا رسالةٌ فقط')
    } else {
      fail(`حُقنت شيفرة بعد رفضٍ معلَن: hostCount=${afterDenied.hostCount}`)
    }

    // ── 3) السالب على التبويب نفسه — بلا هذا البند يُقرأ العطل حمايةً ──
    await setExcluded([])
    const allowed = await activate(driver, excludedTab, 'measure')
    const after = await readPage(excludedTab)
    if (allowed?.value?.started === true && after.hostCount === 1) {
      ok('وبعد رفع الاستثناء نجح التفعيل وظهر المضيف — المنع كان بالقائمة لا بعطل')
    } else {
      fail(
        `رفع الاستثناء لم يُعِد التفعيل: ${JSON.stringify(allowed)} hostCount=${after.hostCount}`,
      )
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص البوّابة الواحدة للحقن (امتناعٌ مقيس لا قرارٌ مُعاد) ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ المواقع المستثناة تمنع الحقن فعلًا — في مسار الإيماءة وفي مسار الاستئناف.\n')
