#!/usr/bin/env node
/**
 * يسدّ الدَّيْن المعلَن باسمه على المرحلة 17 في `Docs/EntryPoints.md` §3:
 * صفّ «إلغاء ‹جارٍ الالتقاط›» (`cancelJob` ← `fullpage/cancel` ←
 * `cancelFullPage()`) كان بلا أمر تحقّق، لأن حالة `capturing` صارت قابلة
 * للوصول للتوّ حين بدأ `startFullPage` يكتب `session.job`.
 *
 * **لماذا لم يكن قابلًا للسداد في `verify-popup.mjs`:** `selectPopupState`
 * تفحص `restriction` أوّلًا، و`Popup.tsx` يمرّر إليها `tab.url` من
 * `chrome.tabs.query`. وChrome **يُخفي حقل `url`** عن أي طلب بلا صلاحية
 * مضيف — و`checkInjectable(undefined)` تُرجع `deny('invalid-url')`. فالنافذة
 * في ذلك الفحص محكومٌ عليها بـ`restricted` مهما فُعل، ولا تبلغ `capturing`
 * أبدًا. هذا قيدٌ في **بيئة الفحص** لا في المنتج: نقرة المستخدم على الأيقونة
 * تمنح `activeTab` فيُكشَف العنوان.
 *
 * **المخرج المستعمل هنا** هو نفسه المستعمل والموثَّق في `verify-activate.mjs`
 * وحاشية §6 من `Docs/EntryPoints.md`: صلاحية مضيف تُمنَح عبر
 * `manifest.host_permissions` في **حزمة مرحلية مؤقّتة**. الحارس المُختبَر هنا
 * هو منطق النافذة وسلك الإلغاء، لا آلية منح الصلاحية (تلك تحرسها
 * `verify-load.mjs` و`verify-dist.mjs`، والحزمة المشحونة تبقى بلا صلاحية
 * مضيف دائمة).
 *
 * وثلاثة شروط أخرى تسبق `capturing` في سلّم `selectPopupState` وتُضبَط هنا
 * صراحةً لا صدفةً: `online` (تُقاس ولا تُفترض)، و`firstRun` (يُطفأ بإكمال
 * التأهيل عبر `settings/patch` — نفس ما يفعله زرّ «تخطّي» في النافذة)، و
 * `permissionNeeded` (يسقط من تلقائه لأن الصلاحية ممنوحة فعلًا).
 *
 * **ما يثبته الفحص — أثرًا لا إيماءة:**
 *   1. `[data-popup-state]` تساوي `capturing` بالضبط، ومهمّةٌ **حقيقية**
 *      كتبتها (`tool/activate` ← `startFullPage`)، لا كتابة يدوية للجلسة.
 *   2. زرّ الإلغاء موجود في تلك الحالة بنصّه كما يبنيه `views/Capturing.tsx`.
 *   3. النقر يُجهض المهمّة فعلًا: `session.job` يصير `null`، وتصل رسالة
 *      `failed/cancelled` على قناة المهام، **ولا تُحفَظ لقطة** — والثالثة هي
 *      ما يميّز «أُجهضت» عن «اكتملت»، فكلتاهما تمسحان `session.job`.
 *   4. الصفحة تُستعاد: الأنماط السطرية التي زرعها `prepareFullPage` على
 *      العناصر الثابتة تعود إلى ما كانت عليه حرفًا بحرف، والتمرير يعود.
 *
 * **اختبار العكس مُدمَج**: `RASD_BREAK_CANCEL=1` يُعطّل مستقبِل
 * `fullpage/cancel` في نسخة الحزمة المرحلية وحدها (`dist/` لا يُمسّ)، فيجب
 * أن يصرخ الفحص. حارسٌ لم يُرَ فاشلًا ليس حارسًا.
 *
 *   pnpm build && pnpm verify:capturing
 *   RASD_BREAK_CANCEL=1 pnpm verify:capturing   # يجب أن يفشل
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { PAGE_PATHS } from '../src/shared/page-paths.ts'

import { ensureFixturesServer } from './lib/live-fixtures.mjs'
import { waitForExtensionContext } from './lib/live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9344
const FIXTURES = Number(process.env.RASD_FIXTURES_PORT ?? 5405)
const BASE = `http://127.0.0.1:${FIXTURES}`

/**
 * وضع اختبار العكس: يكسر مستقبِل الإلغاء في **النسخة المرحلية** وحدها.
 * ليس مسارًا إنتاجيًّا ولا يُفعَّل في أي تشغيل عادي.
 */
const BREAK_CANCEL = process.env.RASD_BREAK_CANCEL === '1'

/**
 * النصّ المتوقَّع للزرّ — **مقروء من `views/Capturing.tsx` لا مخترَع**:
 * `<KeyCap>Esc</KeyCap>` ثم `<span>إلغاء الالتقاط</span>`.
 */
const CANCEL_LABEL = 'إلغاء الالتقاط'
const CANCEL_KEYCAP = 'Esc'

/** مهلة بلوغ حالة `capturing` بعد فتح النافذة. */
const STATE_BUDGET_MS = 6_000
/**
 * مهلة ظهور **أثر** الإلغاء.
 *
 * سخيّة بما يكفي لدورة `abort` ← `finally` ← `askFinish` ← `patchSession`،
 * وأقصر بكثير من زمن اكتمال المهمّة على هذه العيّنة (عشرات البلاطات بفاصل
 * 500ms على الأقل بينها — حدّ `captureVisibleTab`). فبلوغُها لا يمكن أن
 * يكون «اكتملت صدفةً».
 */
const CANCEL_BUDGET_MS = 8_000
/**
 * مهلة ظهور أثر `prepareFullPage` على الصفحة قبل النقر.
 *
 * الاستعادة لا تُقاس على صفحة لم تُمَسّ: النقر قبل أن يُطبَّق التحييد يجعل
 * مقارنة «قبل == بعد» صحيحةً وفارغةً معًا. فيُنتظَر الأثر أوّلًا — والتهيئة
 * تشمل تمهيدًا يمرّر الصفحة كلّها، فهي أبطأ من بدء المهمّة بكثير.
 */
const PREPARE_BUDGET_MS = 25_000

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

/*
 * المنفذ يجب أن يكون خاليًا — نفس الدرس المكتوب في `verify-fullpage.mjs`:
 * نسخة Chrome سابقة تستمع عليه تعني أن الاتصال يرتبط بها بدل إطلاق واحدة
 * نظيفة، فتُحمَّل الإضافة مرّتين وتضيع ساعة في مطاردة العَرَض.
 */
if (
  await fetch(`http://127.0.0.1:${PORT}/json/version`).then(
    () => true,
    () => false,
  )
) {
  console.error(
    `المنفذ ${PORT} مشغول بنسخة Chrome سابقة. أغلقها أوّلًا:\n` +
      `  pkill -f "remote-debugging-port=${PORT}"`,
  )
  process.exit(1)
}

// ── خادم العيّنات ────────────────────────────────────────────────
const fixtures = await ensureFixturesServer({ port: FIXTURES })

// ── الحزمة المرحلية: `dist/` كما هي + صلاحية مضيف ────────────────
const stage = mkdtempSync(join(tmpdir(), 'rasd-capturing-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
/*
 * `<all_urls>` لا نمطًا ضيّقًا — لسببين مقيسين سلفًا في هذا المستودع:
 * `captureVisibleTab` يرفض الصلاحية الضيّقة صراحةً («Either the
 * '<all_urls>' or 'activeTab' permission is required»)، والالتقاط الكامل
 * هنا يمرّ منه؛ وكشفُ `tab.url` للنافذة يحتاج صلاحية مضيف تغطّي الأصل.
 */
manifest.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

/**
 * كسرٌ مقصود لمستقبِل `fullpage/cancel` في النسخة المرحلية — اختبار العكس.
 *
 * يُطبَّق على ملفّ الـservice worker المبنيّ الذي يشير إليه
 * `service-worker-loader.js` (اسمه مُلبَّس بالبصمة، فلا يُكتب حرفيًّا).
 * والاستبدال يُبقي المستقبِل مسجَّلًا ويردّ `{ cancelled: false }` بلا نداء
 * `cancelFullPage()` — أي بالضبط العطل الذي يجب أن يكشفه الفحص: الرسالة
 * تصل، والأثر لا يقع.
 */
function breakCancelReceiver() {
  const loader = readFileSync(join(stage, 'service-worker-loader.js'), 'utf8')
  const rel = /['"](.+?)['"]/.exec(loader)?.[1]
  if (!rel) throw new Error('تعذّرت قراءة مسار الـservice worker من اللودر.')
  const swFile = join(stage, rel.replace(/^\.\//, ''))
  const source = readFileSync(swFile, 'utf8')
  const re =
    /([A-Za-z_$][\w$]*)\((["'`])fullpage\/cancel\2\s*,\s*\(\)\s*=>\s*\(\{\s*cancelled\s*:[^}]*\}\)\)/
  const found = re.exec(source)
  if (!found) throw new Error(`لم يُعثر على مستقبِل fullpage/cancel في ${rel} — عدِّل النمط.`)
  writeFileSync(swFile, source.replace(re, `$1($2fullpage/cancel$2,()=>({cancelled:!1}))`))
  return found[0]
}

let brokenSnippet = null
if (BREAK_CANCEL) {
  brokenSnippet = breakCancelReceiver()
}

const profile = mkdtempSync(join(tmpdir(), 'rasd-capturing-'))
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

const cdp = await connect()
if (!cdp) {
  await cleanup()
  console.error('تعذّر الاتصال بـDevTools.\n' + stderr.split('\n').slice(-8).join('\n'))
  process.exit(1)
}
const { ws, send } = cdp

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const note = (m) => lines.push(`  · ${m}`)

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

// ── تحميل الإضافة ────────────────────────────────────────────────
let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

const ownOrigin = `chrome-extension://${extId}/`
let sw = null
for (let i = 0; i < 25 && extId; i++) {
  const { targetInfos } = await send('Target.getTargets')
  sw = targetInfos.find((t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin))
  if (sw) break
  await settle(300)
}

let swSession = null
if (sw) {
  swSession = (await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }))
    .sessionId
  await send('Runtime.enable', {}, swSession)
  // الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
  await waitForExtensionContext((expression) =>
    send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      swSession,
    ).then((r) => r?.result?.value),
  )
}

/** ينفّذ تعبيرًا داخل الـservice worker ويعيد قيمته. */
async function inSW(expression) {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    swSession,
  )
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
  return res.result.value
}

async function attachToPage(urlPart) {
  for (let i = 0; i < 40; i++) {
    const { targetInfos } = await send('Target.getTargets')
    const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
    if (t) {
      try {
        const { sessionId } = await send('Target.attachToTarget', {
          targetId: t.targetId,
          flatten: true,
        })
        await send('Runtime.enable', {}, sessionId)
        return sessionId
      } catch {
        /* الهدف اختفى بين الاكتشاف والاتصال */
      }
    }
    await settle(120)
  }
  return null
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
  fail('صلاحية المضيف غير ممنوحة — بلا كشف `tab.url` لا تبلغ النافذة `capturing` أصلًا.')
} else {
  ok(`نسخة الفحص محمَّلة وصلاحيتها ممنوحة (${BASE}/*)`)
  if (BREAK_CANCEL) note(`⚠︎ اختبار العكس مُفعَّل — مستقبِل الإلغاء مكسور عمدًا: ${brokenSnippet}`)
}

// ── أدوات الجولة ────────────────────────────────────────────────
async function openTab(url, active) {
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: ${active} }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  return tabId
}

/** المهمّة كما تراها الجلسة المخزَّنة — مصدر `capturing` الوحيد. */
const readJob = () =>
  inSW(
    `chrome.storage.session.get('rasd:session').then(s => { const j = s['rasd:session']?.job ?? null; return j ? JSON.stringify(j) : null })`,
  )

/** عدد اللقطات المحفوظة — يفرّق «أُجهضت» عن «اكتملت». */
const captureCount = () =>
  inSW(`(async () => {
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

/**
 * الأنماط السطرية على العناصر الثابتة في العيّنة، والتمرير.
 *
 * `prepareFullPage` يكتب `style` سمةً نصّية على المرشّحين، و`finishFullPage`
 * يعيد النصّ المحفوظ حرفًا بحرف. فمقارنة السمة قبل/بعد هي القياس المباشر
 * لوعد «الصفحة تُستعاد» في صفّ الجرد.
 */
const readPageMarks = (tabId) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: () => ({
      chat: document.querySelector('#chat')?.getAttribute('style') ?? null,
      cookie: document.querySelector('#cookie')?.getAttribute('style') ?? null,
      scrollY: Math.round(window.scrollY),
    }),
  }).then(r => r[0].result)`)

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const targetTab = await openTab(`${BASE}/fullpage/`, true)
  const windowId = await inSW(`chrome.tabs.get(${targetTab}).then(t => t.windowId)`)

  /*
   * صفحة إضافة قائدة — لنفس سبب `verify-activate.mjs`: الـservice worker لا
   * يصل مستقبِلاته بنفسه (رسالته إلى ذاته ترتدّ بـ«Receiving end does not
   * exist»)، وصفحةُ إضافةٍ مُرسِلةً هي عين مسار النافذة. وتُفتح **غير نشِطة**
   * كي يبقى تبويب الهدف هو النشِط — `captureVisibleTab` يلتقط الظاهر وحده.
   */
  const driverTab = await openTab(`${ownOrigin}${PAGE_PATHS.library}`, false)
  const driver = await attachToPage(PAGE_PATHS.library)
  if (!driver) fail('تعذّر فتح صفحة الإضافة القائدة.')

  const rpc = (type, payload) =>
    evalIn(
      driver,
      `chrome.runtime.sendMessage({
        __rasd: 1,
        id: 'verify-capturing-${type.replace(/\W/g, '-')}',
        type: ${JSON.stringify(type)},
        payload: ${payload === undefined ? 'undefined' : JSON.stringify(payload)},
      })`,
    )

  /*
   * `firstRun` يسبق `capturing` في سلّم `selectPopupState`، وهو صادق ما دام
   * التأهيل غير مكتمل. يُطفأ بنفس الرسالة التي يرسلها زرّ «تخطّي» في
   * `FirstRun` — لا بحيلة تخصّ الفحص.
   */
  const settled = await rpc('settings/patch', {
    patch: { onboarding: { completed: true, completedAt: Date.now() } },
  })
  if (settled?.ok) ok('التأهيل مُعلَّم مكتملًا — `firstRun` لن يحجب `capturing`')
  else fail(`تعذّر إكمال التأهيل: ${JSON.stringify(settled)}`)

  const marksBefore = await readPageMarks(targetTab)
  const capturesBefore = await captureCount()

  /*
   * مراقب قناة المهام — يُفتح **قبل** بدء المهمّة كي لا تفوته رسالة الحسم.
   * الرسالة `failed/cancelled` تأتي من الحلقة نفسها بعد أن تُستعاد الصفحة،
   * لا من مستقبِل الإلغاء — فهي شهادة الأثر لا شهادة وصول الرسالة.
   */
  await evalIn(
    driver,
    `(() => {
      globalThis.__rasdJobLog = []
      const port = chrome.runtime.connect({ name: 'rasd:job' })
      port.onMessage.addListener((m) => globalThis.__rasdJobLog.push(m))
      globalThis.__rasdJobPort = port
      return 1
    })()`,
  )
  const jobLog = () => evalIn(driver, `JSON.stringify(globalThis.__rasdJobLog ?? [])`)

  // ── 1) مهمّة حقيقية تكتب `session.job` ─────────────────────────
  const act = await rpc('tool/activate', { tool: 'full-page', tabId: targetTab })
  note(`ردّ التفعيل: ${JSON.stringify(act)}`)

  let job = null
  for (let i = 0; i < 60 && !job; i++) {
    job = await readJob()
    if (!job) await settle(100)
  }
  if (job) {
    const parsed = JSON.parse(job)
    parsed.tabId === targetTab
      ? ok(`مهمّة حقيقية جارية ومكتوبة في الجلسة: ${parsed.kind} على التبويب ${parsed.tabId}`)
      : fail(`المهمّة كُتبت لتبويب آخر: ${parsed.tabId} بدل ${targetTab}`)
  } else {
    fail('لم تُكتب `session.job` — لا سبيل إلى `capturing` أصلًا.')
  }

  // ── 2) النافذة تبلغ `capturing` بالضبط ─────────────────────────
  /*
   * النافذة تُفتح تبويبًا **غير نشِط** في نافذة الهدف نفسها: `Popup.tsx`
   * يقرأ `chrome.tabs.query({ active: true, currentWindow: true })`، فلو
   * كان تبويب النافذة هو النشِط لعادت النافذة على نفسها ولم تطابق
   * `job.tabId`. هذا ترتيبٌ يطابق الواقع لا يلتفّ عليه: في الاستعمال
   * الحقيقي النافذةُ فوق تبويب نشِط هو الهدف.
   */
  const popupTab = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(ownOrigin + PAGE_PATHS.popup)}, windowId: ${windowId}, active: false }).then(t => t.id)`,
  )
  const popup = await attachToPage(PAGE_PATHS.popup)
  if (!popup) fail('لم تُفتح صفحة النافذة.')

  const readState = () =>
    evalIn(
      popup,
      `JSON.stringify((() => {
        const root = document.querySelector('[data-popup-state]')
        if (!root) return { state: null }
        const buttons = [...root.querySelectorAll('button')]
        const cancel = buttons.find((b) => (b.textContent ?? '').includes(${JSON.stringify(CANCEL_LABEL)}))
        return {
          state: root.getAttribute('data-popup-state'),
          // سطر الحالة هو آخر \`span\` في الترويسة — انظر \`parts/Header.tsx\`.
          status: [...root.querySelectorAll('header span')].at(-1)?.textContent ?? null,
          buttons: buttons.map((b) => b.textContent),
          cancelText: cancel?.textContent ?? null,
          cancelSpan: cancel?.querySelector('span')?.textContent ?? null,
          cancelKey: cancel?.querySelector('kbd')?.textContent ?? null,
          /*
           * إصابة المؤشِّر في موضع الزرّ نفسه.
           *
           * \`element.click()\` أدناه يشغّل المستمع مباشرةً، فلا يقول شيئًا عن
           * كون الزرّ **مكشوفًا** فعلًا: زرٌّ بمقاس صفر أو مغطّى بطبقة أعلاه
           * سيستجيب له وهو غير قابل للنقر على الشاشة. \`elementFromPoint\` عند
           * مركزه يفرّق بين الحالتين، ويسدّ ما لا يسدّه النقر البرمجي.
           */
          hit: (() => {
            if (!cancel) return null
            const r = cancel.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return 'zero-size'
            const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            if (!at) return 'none'
            return cancel === at || cancel.contains(at) ? 'button' : (at.tagName + '.' + at.className)
          })(),
          online: navigator.onLine,
        }
      })())`,
    )

  let reading = null
  if (popup) {
    const deadline = Date.now() + STATE_BUDGET_MS
    while (Date.now() < deadline) {
      const raw = await readState()
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw)
        if (parsed.state) {
          reading = parsed
          if (parsed.state === 'capturing') break
        }
      }
      await settle(100)
    }
  }

  if (reading?.state === 'capturing') {
    ok(`\`[data-popup-state]\` = "capturing" بالضبط — بمهمّة حقيقية لا بكتابة يدوية`)
    note(`سطر الحالة: ${JSON.stringify(reading.status)}`)
  } else if (reading) {
    fail(
      `الحالة المعروضة "${reading.state}" لا "capturing" — ` +
        `online=${reading.online} · المهمّة في الجلسة=${job ? 'موجودة' : 'غائبة'}`,
    )
  } else {
    fail('لم يظهر `[data-popup-state]` في النافذة خلال الميزانية.')
  }

  // ── 3) زرّ الإلغاء موجود بنصّه ──────────────────────────────────
  if (reading?.state === 'capturing') {
    if (reading.cancelSpan === CANCEL_LABEL && reading.cancelKey === CANCEL_KEYCAP) {
      ok(`زرّ الإلغاء موجود بنصّه كما يبنيه \`Capturing.tsx\`: ⟨${CANCEL_KEYCAP}⟩ ${CANCEL_LABEL}`)
      reading.hit === 'button'
        ? ok('الزرّ مكشوف للمؤشِّر في موضعه — `elementFromPoint` عند مركزه يعيده هو')
        : fail(`الزرّ غير قابل للإصابة في موضعه: elementFromPoint = ${JSON.stringify(reading.hit)}`)
    } else {
      fail(
        `نصّ الزرّ لا يطابق \`Capturing.tsx\`: span=${JSON.stringify(reading.cancelSpan)} ` +
          `kbd=${JSON.stringify(reading.cancelKey)} — أزرار الحالة: ${JSON.stringify(reading.buttons)}`,
      )
    }
  }

  // ── 4) الأثر: النقر يُجهض المهمّة فعلًا ─────────────────────────
  if (reading?.state === 'capturing' && reading.cancelSpan === CANCEL_LABEL) {
    /*
     * يُنتظَر أثر التهيئة **قبل** النقر — وإلا كانت مقارنة الاستعادة أدناه
     * صحيحةً وفارغةً معًا (صفحة لم تُمَسّ تعود «كما كانت» بلا فضل لأحد).
     */
    const preparedAt = Date.now()
    let marksDuring = await readPageMarks(targetTab)
    const isPrepared = (m) => String(m?.chat ?? '').includes('display:none')
    while (Date.now() - preparedAt < PREPARE_BUDGET_MS && !isPrepared(marksDuring)) {
      await settle(200)
      if ((await readJob()) === null) break
      marksDuring = await readPageMarks(targetTab)
    }
    const prepared = isPrepared(marksDuring)
    prepared
      ? note(
          `التهيئة طبّقت تحييدها بعد ${((Date.now() - preparedAt) / 1000).toFixed(1)}s ` +
            `(#chat style=${JSON.stringify(marksDuring.chat)}) — الاستعادة صارت قابلة للقياس`,
        )
      : note(
          `لم يُلحَظ أثر تهيئة على #chat خلال ${PREPARE_BUDGET_MS / 1000}s — ` +
            'قياس الاستعادة أدناه يسقط، ولا يُدَّعى',
        )

    // الحالة تُقرأ ثانيةً لحظة النقر: الانتظار أعلاه طويل، والنقر يجب أن يقع
    // **داخل** حالة `capturing` لا بعد أن تركتها النافذة.
    const atClick = JSON.parse((await readState()) ?? '{}')
    atClick.state === 'capturing'
      ? note('الحالة ما تزال `capturing` لحظة النقر')
      : fail(`الحالة تبدّلت قبل النقر إلى "${atClick.state}" — النقر لم يعد داخل «جارٍ الالتقاط»`)

    const clicked = await evalIn(
      popup,
      `(() => {
        const root = document.querySelector('[data-popup-state]')
        const btn = [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(${JSON.stringify(CANCEL_LABEL)}))
        if (!btn) return 'no-button'
        btn.click()
        return 'clicked'
      })()`,
    )
    clicked === 'clicked'
      ? note('نُقر زرّ الإلغاء — من مستمع `onClick` الذي ربطه `Popup.tsx` نفسه')
      : fail(`تعذّر النقر على الزرّ: ${JSON.stringify(clicked)}`)

    const t0 = Date.now()
    let cleared = null
    while (Date.now() - t0 < CANCEL_BUDGET_MS) {
      if ((await readJob()) === null) {
        cleared = Date.now() - t0
        break
      }
      await settle(150)
    }

    if (cleared !== null) {
      ok(`\`session.job\` صار \`null\` بعد ${(cleared / 1000).toFixed(1)}s من النقر`)
    } else {
      const still = await readJob()
      fail(
        `\`session.job\` باقٍ بعد ${CANCEL_BUDGET_MS / 1000}s من النقر — الرسالة أُرسلت والأثر لم يقع: ${still}`,
      )
    }

    /*
     * `session.job === null` وحده **لا يكفي**: اكتمال المهمّة يمسحه أيضًا.
     * الفارق الحاسم رسالةُ `failed/cancelled` من الحلقة، وغيابُ لقطة جديدة.
     */
    await settle(400)
    const log = JSON.parse((await jobLog()) ?? '[]')
    const cancelledMsg = log.find((m) => m.kind === 'failed' && m.code === 'cancelled')
    const doneMsg = log.find((m) => m.kind === 'done')
    if (cancelledMsg && !doneMsg) {
      ok(`الحلقة أعلنت الإجهاض على قناة المهام: ${JSON.stringify(cancelledMsg.message)}`)
    } else if (doneMsg) {
      fail('المهمّة اكتملت بدل أن تُجهَض — الإلغاء لم يصل الحلقة.')
    } else {
      fail(
        `لا رسالة \`failed/cancelled\` على القناة — ` +
          `ما وصل: ${JSON.stringify(log.map((m) => m.kind + (m.code ? '/' + m.code : '')))}`,
      )
    }

    /*
     * عدّاد اللقطات **ليس دليلًا إلا بعد أن تُحسَم المهمّة**: مهمّة ما تزال
     * تدور لم تحفظ شيئًا بعد، فمساواة العدّاد حينها لا تقول شيئًا. لذلك
     * يُدَّعى كدليل فقط حين ثبت أن `session.job` صار `null`.
     */
    const capturesAfter = await captureCount()
    if (cleared === null) {
      note(`عدّاد اللقطات ${capturesBefore} ← ${capturesAfter} — لا دلالة له والمهمّة لم تُحسَم`)
    } else if (capturesAfter === capturesBefore) {
      ok(`لم تُحفَظ لقطة (${capturesBefore} ← ${capturesAfter}) — إجهاضٌ لا اكتمال`)
    } else {
      fail(`حُفظت لقطة رغم الإلغاء: ${capturesBefore} ← ${capturesAfter}`)
    }

    // ── 5) الصفحة تُستعاد ─────────────────────────────────────────
    const marksAfter = await readPageMarks(targetTab)
    const same =
      marksAfter?.chat === marksBefore?.chat &&
      marksAfter?.cookie === marksBefore?.cookie &&
      marksAfter?.scrollY === marksBefore?.scrollY
    if (!prepared) {
      note('الاستعادة غير مُثبَتة في هذه الجولة — لم يُلحَظ تحييدٌ يُستعاد منه.')
    } else if (same) {
      ok('الصفحة استُعيدت: أنماط العناصر الثابتة والتمرير عادت كما كانت قبل المهمّة')
    } else {
      fail(
        `الصفحة لم تُستعَد: قبل=${JSON.stringify(marksBefore)} بعد=${JSON.stringify(marksAfter)}`,
      )
    }
  }

  // النافذة تُغلق نفسها بعد الإرسال (`window.close()` في `cancelJob`)؛
  // الإغلاق هنا احتياطٌ لا يُفشل شيئًا إن سبقنا إليه المتصفّح.
  await inSW(
    `chrome.tabs.remove([${popupTab}, ${driverTab}, ${targetTab}]).then(() => 1).catch(() => 0)`,
  )
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص «جارٍ الالتقاط» وإلغاؤها من النافذة (أثرًا لا إيماءة) ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ النافذة تبلغ `capturing` بمهمّة حقيقية، وزرّها يُجهض المهمّة ويستعيد الصفحة.\n')
