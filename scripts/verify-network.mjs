#!/usr/bin/env node
/**
 * فحص الشبكة — **«لا شيء يغادر هذا الجهاز» مقيسًا لا موعودًا** (`STAGES/25`، ADR 0056).
 *
 * المسارات المحلّية كلّها في كروم حقيقي بالحزمة المبنيّة، ومراقبٌ على كل هدفٍ يعمل طوالها: كل صفحة إضافة في
 * `dist/` (وكل قسمٍ في الإعدادات)، وكل أداةٍ على صفحة عيّنة، والالتقاط الظاهر والكامل، والمكتبة والمحرّر وتصدير
 * PNG وPDF، ثمّ نافذتا الخدمتين المسمّاتين والوضع المحلّي مفعَّل. **وكل طلبٍ ليس عنوانًا محلّيًّا يُسقط الحارس
 * باسمه ومساره** — لا عتبة ولا قائمة نطاقات.
 *
 * ## شاهدان لا شاهد
 *
 * 1. **DevTools على كل هدف.** `Target.setAutoAttach` على مستوى المتصفّح بـ`waitForDebuggerOnStart`: كل صفحة وعامل
 *    وإطار وعامل مخصَّص يُوقَف عند ولادته حتى يُفعَّل عليه `Network` و`Log`، ثمّ يُطلَق — فلا طلب يسبق المراقب.
 *    والسجلّ (`Log`) يحمل ما لا يصير طلبًا أصلًا: محاولةٌ حجبتها سياسة المحتوى قبل أن تُنشأ (`verify:share` قاسها).
 * 2. **سجلّ شبكة المتصفّح (NetLog) من لحظة الإقلاع** — يرى ما سبق الارتباط: التثبيت وأوّل إقلاع للعامل. وكروم
 *    نفسه يتّصل بخدماته (مقيس: `optimizationguide-pa.googleapis.com` و`chrome.cloudflare-dns.com` على ملفّ تعريف
 *    جديد ولو بأعلام التهدئة) — فالشاهد يُحاكِم **ما بادر به أصلٌ** (`initiator`) لا كل ما في السجلّ: طلبات كروم
 *    الداخلية «not an origin»، وطلبٌ من العامل أو صفحة إضافة أو سكربت محتوى يحمل أصله.
 *
 * و`--host-resolver-rules` يُسقط كل اسمٍ إلا الحلقة المحلّية: **لا شيء يغادر الجهاز أثناء الفحص** ولو حاول — حتى
 * طلبا الخدمتين المسمّاتين في طورهما الصريح يصلان إلى المراقب ويفشلان عند الاسم.
 *
 * ## الوجهتان المسمّاتان — بفعلٍ صريح وحده
 *
 * `api.github.com` ونقطة استقبال البلاغات تُقبلان **في طورهما وحده وبعد النقرة**: «أرسل البلاغ» بعد إطفاء «الوضع
 * المحلّي فقط»، و«اتّصل» برمزٍ مكتوب. والطور نفسه قبل النقرة (النافذة مفتوحة على المراجعة) صفر طلب. وفيهما
 * الشاهد الموجب: **المراقب يرى الطلب الذي تصنعه النقرة** — فصفرٌ في غيرهما صفرُ مراقبٍ يرى، لا صفرُ مراقبٍ أعمى.
 *
 * ## كل مسارٍ يُثبت أنه جرى
 *
 * صفر طلب من مسارٍ لم يجرِ لا يثبت شيئًا. فكل مسار يُحكم بأثره: الصفحة رُسمت، والأداة ردّت `started`، واللقطة
 * صارت في المكتبة، والتصدير خرج ملفًّا بصيغته المطلوبة، والنافذة بلغت طورها. ومسارٌ لم يبلغ أثره يُسقط الحارس باسمه.
 *
 * ## ما يراه وما لا يراه
 *
 * يرى: كل طلب HTTP(S) من صفحةٍ أو عاملٍ أو إطار (`requestWillBeSent`)، وكل مقبس WebSocket (`webSocketCreated`)،
 * وكل محاولةٍ حجبتها السياسة، وكل تبويبٍ يُفتح أو يُنقل إلى عنوانٍ خارجي (`Target`)، وما بادر به أصلٌ في سجلّ المتصفّح.
 * **ولا يرى** ما ليس طلبًا: تلميحات `preconnect` و`dns-prefetch` (ولا مُرسِل لها في `src/`)، وتنزيلًا من عنوانٍ بعيد
 * يبدؤه المتصفّح (`chrome.downloads` في `src/` لعناوين محلّية وحدها). والوجهتان المسمّاتان تُقبلان **بمسارهما
 * وطريقتهما وجلسة نقرتهما وعددٍ واحد** — لا الأصل كلّه طوال الطور.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_NETWORK=content pnpm verify:network   # يجب أن يفشل
 *
 * سكربت المحتوى يطلب صورةً من `https://rasd-leak.invalid` عند حقنه — تسرّبٌ من صفحة الموقع.
 *
 *     RASD_BREAK_NETWORK=worker pnpm verify:network    # يجب أن يفشل
 *
 * العامل يطلب `api.github.com` عند إقلاعه — وجهةٌ مسمّاة تسمح بها السياسة، **بلا فعلٍ من المستخدم**. فيسقط بند
 * «خارج طورها» في الشاهدين، وهو ما لا تمسكه سياسة المحتوى.
 *
 * و`page` صفحة المكتبة تحمّل صورةً من الأصل المسرِّب (`img-src` لا تقيّده السياسة)، و`csp` تحاول `fetch` إليه فتحجبه
 * السياسة قبل أن يصير طلبًا — فيسقط بند «محاولةٌ حجبتها السياسة» من السجلّ. و`tab` العامل يفتح تبويبًا إلى الأصل
 * المسرِّب عند إقلاعه — تنقّلٌ يبدؤه المتصفّح فلا يراه سجلّ الشبكة بأصلٍ مُبادر، ويمسكه بند «تبويبٌ إلى عنوانٍ خارجي».
 * و`extra` صفحة الإعدادات تُتبع طلب «اتّصل» بطلبٍ ثانٍ إلى `api.github.com` في النافذة نفسها — فيسقط لأن المقبول
 * مسارُ النقرة وعددُها لا الأصل. والترقيعات ترمي بصوتٍ عالٍ إن لم تجد موضعها.
 *
 * الإقلاع والاتصال والتحميل والارتباط والتنظيف في النواة المشتركة (`scripts/lib/cdp.mjs`، `STAGES/17`).
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DIST, startGuard } from './lib/cdp.mjs'

const PORT = 9355
const BREAK = process.env.RASD_BREAK_NETWORK ?? ''
const LEAK = 'https://rasd-leak.invalid'
const FIXTURE = '/rtl-ar/'

/** الخدمتان المسمّاتان — وكلٌّ بطوره الصريح. وتُطابَق على سياسة البيان المبنيّ أدناه، لا تُصدَّق. */
const SERVICES = {
  reports: 'https://app-reports.isultantf.workers.dev',
  github: 'https://api.github.com',
}
const EXPLICIT = { 'report-send:clicked': 'reports', 'github-connect:clicked': 'github' }
/**
 * ما تصنعه النقرة بعينه: الطريقة والمسار، ومن صفحة الإعدادات التي نُقرت فيها، ومرّةً واحدة. فطلبٌ آخر إلى الأصل نفسه
 * في الطور نفسه — مؤقّتٌ في العامل، أو مسارٌ ثانٍ، أو محاولةٌ مكرَّرة — يُسقط الحارس كما يُسقطه خارج طوره.
 */
const EXPECTED = {
  reports: { method: 'POST', path: '/v1/reports' },
  github: { method: 'GET', path: '/user' },
}
const CLICK_SESSION = 'page /src/pages/settings/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── اختبار العكس ─────────────────────────────────────────────────

function breakPatch(stage) {
  if (!BREAK) return
  if (!['content', 'worker', 'page', 'csp', 'tab', 'extra'].includes(BREAK)) {
    throw new Error(
      `RASD_BREAK_NETWORK=${BREAK}: القيم content أو worker أو page أو csp أو tab أو extra.`,
    )
  }
  const prepend = (rel, line) => {
    const file = join(stage, rel)
    if (!existsSync(file)) throw new Error(`RASD_BREAK_NETWORK=${BREAK}: «${rel}» ليس في dist/`)
    writeFileSync(file, `${line}\n${readFileSync(file, 'utf8')}`)
  }
  if (BREAK === 'content') prepend('content.js', `;(new Image).src=${JSON.stringify(`${LEAK}/c`)};`)
  if (BREAK === 'worker') {
    prepend(
      'service-worker-loader.js',
      `fetch(${JSON.stringify(`${SERVICES.github}/rasd-leak`)}).catch(()=>{});`,
    )
  }
  if (BREAK === 'tab') {
    prepend(
      'service-worker-loader.js',
      `chrome.tabs.create({url:${JSON.stringify(`${LEAK}/t`)},active:false}).catch(()=>{});`,
    )
  }
  if (BREAK === 'extra') {
    // طلبٌ ثانٍ إلى الأصل المسمّى نفسه، من الصفحة نفسها، في نافذة النقرة نفسها — ما لا يميّزه إلا المسار والعدد.
    const html = join(stage, 'src/pages/settings/index.html')
    const src = readFileSync(html, 'utf8')
    if (!src.includes('<head>'))
      throw new Error('RASD_BREAK_NETWORK: لا `<head>` في صفحة الإعدادات')
    writeFileSync(
      join(stage, 'rasd-extra.js'),
      `const f = globalThis.fetch; globalThis.fetch = (...a) => { const r = f(...a); if (String(a[0]).startsWith(${JSON.stringify(`${SERVICES.github}/user`)})) f(${JSON.stringify(`${SERVICES.github}/rasd-leak`)}).catch(() => {}); return r }\n`,
    )
    writeFileSync(
      html,
      src.replace('<head>', '<head><script type="module" src="/rasd-extra.js"></script>'),
    )
  }
  if (BREAK === 'page' || BREAK === 'csp') {
    const html = join(stage, 'src/pages/library/index.html')
    const src = readFileSync(html, 'utf8')
    if (!src.includes('</body>'))
      throw new Error('RASD_BREAK_NETWORK: لا `</body>` في صفحة المكتبة')
    const probe =
      BREAK === 'page'
        ? `<img src="${LEAK}/p.png" alt="">`
        : '<script type="module" src="/rasd-leak.js"></script>'
    if (BREAK === 'csp') {
      writeFileSync(
        join(stage, 'rasd-leak.js'),
        `fetch(${JSON.stringify(`${LEAK}/f`)}).catch(()=>{})\n`,
      )
    }
    writeFileSync(html, src.replace('</body>', `${probe}</body>`))
  }
}

// ── الإقلاع ──────────────────────────────────────────────────────

const logDir = mkdtempSync(join(tmpdir(), 'rasd-network-log-'))
const NETLOG = join(logDir, 'net.json')
const downloads = mkdtempSync(join(tmpdir(), 'rasd-network-downloads-'))

const g = await startGuard({
  prefix: 'network',
  port: PORT,
  title: '── فحص الشبكة (صفر طلب صادر في المسارات المحلّية، والوجهتان المسمّاتان بفعلٍ صريح) ──\n',
  requires: 'content.js',
  fixtures: true,
  // `captureVisibleTab` لا تقبل نمطًا ضيّقًا (`verify:capture`)، والإيماءة التي تمنح `activeTab` لا تُصطنع.
  stage: { hostPermissions: ['<all_urls>'], patch: breakPatch },
  serviceWorker: true,
  args: [
    '--window-size=1280,800',
    `--log-net-log=${NETLOG}`,
    '--net-log-capture-mode=Default',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost',
  ],
  hardTimeoutMs: 300_000,
})
const { send, conn, ok, fail, note } = g
g.onCleanup(() => rmSync(logDir, { recursive: true, force: true }))
g.onCleanup(() => rmSync(downloads, { recursive: true, force: true }))
if (BREAK) note(`اختبار العكس: RASD_BREAK_NETWORK=${BREAK}`)
if (!g.extId || !g.sw) await g.abort('الإضافة لم تُحمَّل أو عاملها لم يُرتبط به')
const ORIGIN = `chrome-extension://${g.extId}`

// ── المراقب: كل هدفٍ يُوقَف عند ولادته حتى يُراقَب ────────────────

/** الطور الجاري — كل طلبٍ يُوسَم به، والوجهتان المسمّاتان تُقبلان في طورهما الصريح وحده. */
let phase = 'install'
const requests = []
const refused = []
const navigations = []
const sessions = new Map()
const targetSession = new Map()
const attachedTypes = new Set()
const counted = new Set()
let workerBoots = 0
/** سياقات تنفيذٍ وُلدت في جلسة عاملٍ مراقَبة — إقلاعٌ رآه المراقب. */
let workerContexts = 0

const LOCAL_SCHEME = /^(chrome-extension|blob|data|about|chrome|devtools|file):/u
const LOCAL_HOST = new Set(['127.0.0.1', 'localhost', '[::1]'])
function isLocal(url) {
  if (LOCAL_SCHEME.test(url)) return true
  try {
    return LOCAL_HOST.has(new URL(url).hostname)
  } catch {
    return false
  }
}
const originOf = (url) => {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function label(info) {
  const url = String(info.url ?? '')
  const short = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url
  return `${info.type} ${short || '(فارغ)'}`.slice(0, 90)
}

/** جلسةٌ لم يُفعَّل عليها `Network` جلسةٌ بلا مراقب — إلا هدفًا أُغلق قبل التفعيل، فلا طلب له. */
const unwatched = []
const GONE = /closed|detached|not found|No target|No session/iu
async function watch(sessionId) {
  await send('Network.enable', {}, sessionId).catch((e) => {
    if (!GONE.test(e.message))
      unwatched.push(`${sessions.get(sessionId) ?? sessionId}: ${e.message}`)
  })
  await send('Log.enable', {}, sessionId).catch(() => undefined)
  // `Runtime` على جلسات العامل: سياقٌ جديد فيها دليل إقلاعٍ تحت المراقب (`workerContexts`).
  if (String(sessions.get(sessionId)).startsWith('service_worker')) {
    await send('Runtime.enable', {}, sessionId).catch(() => undefined)
  }
  // الإطارات وعمّال الصفحة يولدون من الجلسة لا من المتصفّح — فيُراقَبون بالقاعدة نفسها.
  await send(
    'Target.setAutoAttach',
    { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
    sessionId,
  ).catch(() => undefined)
  await send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined)
}

conn.onEvent((msg) => {
  const p = msg.params ?? {}
  if (msg.method === 'Target.attachedToTarget') {
    sessions.set(p.sessionId, label(p.targetInfo))
    targetSession.set(p.targetInfo.targetId, p.sessionId)
    attachedTypes.add(p.targetInfo.type)
    if (p.targetInfo.type === 'service_worker' && String(p.targetInfo.url).startsWith(ORIGIN)) {
      workerBoots++
    }
    void watch(p.sessionId)
  }
  if (
    msg.method === 'Runtime.executionContextCreated' &&
    String(sessions.get(msg.sessionId)).startsWith('service_worker')
  ) {
    workerContexts++
  }
  if (msg.method === 'Network.requestWillBeSent') {
    // الهدف الواحد قد يُراقَب من جلستين (العامل: جلسة النواة وجلسة المراقب) — فيُعدّ الطلب مرّة.
    const key = `${p.requestId}|${p.request?.url}`
    if (counted.has(key)) return
    counted.add(key)
    requests.push({
      url: String(p.request?.url ?? ''),
      method: String(p.request?.method ?? ''),
      phase,
      where: sessions.get(msg.sessionId) ?? 'المتصفّح',
    })
  }
  // المقبس لا يمرّ من `requestWillBeSent` — حدثه وحده.
  if (msg.method === 'Network.webSocketCreated') {
    requests.push({
      url: String(p.url ?? ''),
      method: 'WEBSOCKET',
      phase,
      where: sessions.get(msg.sessionId) ?? 'المتصفّح',
    })
  }
  if (msg.method === 'Log.entryAdded') {
    const text = String(p.entry?.text ?? '')
    if (/Content Security Policy/u.test(text)) {
      refused.push({ text: text.slice(0, 160), phase, where: sessions.get(msg.sessionId) ?? '?' })
    }
  }
  // تبويبٌ يُفتح أو يُنقل إلى عنوانٍ خارجي طلبٌ صادر وإن لم يُرَ في `Network` (التنقّل يبدأ من المتصفّح).
  if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
    const info = p.targetInfo ?? {}
    if (info.type === 'page' && info.url && !isLocal(String(info.url))) {
      navigations.push({ url: String(info.url), phase })
    }
  }
})

await send('Target.setDiscoverTargets', { discover: true })
await send('Target.setAutoAttach', {
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true,
})
// العامل ارتبطت به النواة قبل المراقب — يُراقَب في جلستها أيضًا، فلا يعتمد الحكم على أن الارتباط الآلي يشمله.
sessions.set(g.sw.sessionId, `service_worker (جلسة النواة)`)
await watch(g.sw.sessionId)

// التنزيلات إلى مجلّدٍ مؤقّت لا إلى مجلّد المستخدم — والحكم على التصدير من شاشة نتيجته لا من القرص.
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads })

// ── أدوات ────────────────────────────────────────────────────────

async function evalIn(sessionId, expression, gesture = false) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, userGesture: gesture },
    sessionId,
  )
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    return { error: String(d.exception?.description ?? d.text ?? 'استثناء').split('\n')[0] }
  }
  return r.result?.value
}

async function waitFor(sessionId, expression, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await evalIn(sessionId, expression).catch(() => null)
    if (v && !v.error) return v
    await sleep(150)
  }
  return null
}

/** يفتح عنوانًا في تبويبٍ جديد ويعيد جلسته — جلسة المراقب نفسها، فما يُقيَّم فيها يُراقَب. */
async function open(url) {
  const { targetId } = await send('Target.createTarget', { url })
  for (let i = 0; i < 100 && !targetSession.has(targetId); i++) await sleep(50)
  const sessionId = targetSession.get(targetId)
  if (!sessionId) return null
  await send('Runtime.enable', {}, sessionId).catch(() => undefined)
  // الهدف يولد على `about:blank` موقوفًا حتى يُراقَب، ووثيقته الفارغة «complete» — فالمنتظَر العنوان المطلوب نفسه.
  const path = url.split(/[?#]/u)[0]
  await waitFor(
    sessionId,
    `location.href.startsWith(${JSON.stringify(path)}) && document.readyState === 'complete'`,
    15_000,
  )
  return { targetId, sessionId }
}

const close = (t) =>
  t ? send('Target.closeTarget', { targetId: t.targetId }).catch(() => undefined) : null

/** صفحةٌ رُسمت: جذر التطبيق فيه عناصر — لا وثيقةٌ فارغة حمّلت ثمّ سقط سكربتها. */
const RENDERED = `(() => { const r = document.querySelector('#app, #root, body > div'); return !!r && r.childElementCount > 0 })()`

/** يرسل رسالة العقد من صفحة إضافة كما يبنيها `send()` — الطبقة والخلفية تتجاهلان ما ليس عليه وسمها. */
const rpc = (sessionId, type, payload) =>
  evalIn(
    sessionId,
    `chrome.runtime.sendMessage({ __rasd: 1, id: 'verify-network-' + Math.random(), type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload ?? null)} })`,
  )

const clickText = (sessionId, text) =>
  evalIn(
    sessionId,
    `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && !x.disabled); if (!b) return false; b.click(); return true })()`,
    true,
  )

/** يكتب في حقل Preact كما يكتب المستخدم: القيمة ثمّ حدث `input`. */
const type = (sessionId, selector, value) =>
  evalIn(
    sessionId,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
    true,
  )

/** ما رآه المراقب صادرًا حتى الآن في أطوارٍ مسمّاة. */
const outgoingIn = (...phases) =>
  requests.filter((r) => phases.includes(r.phase) && !isLocal(r.url))

// ── الطور 1: صفحات الإضافة كلّها ─────────────────────────────────

// ── الطور 0: إقلاع العامل تحت المراقب ────────────────────────────

/*
 * التثبيت وأوّل إقلاع للعامل سبقا المراقب (النواة تحمّل الإضافة قبل أن تعيدها) — يراهما سجلّ المتصفّح وحده. فيُوقَف
 * العامل هنا وتوقظه صفحة: عاملٌ جديد يولد موقوفًا حتى يُراقَب، فيرى الشاهد الأوّل إقلاعه كلّه. (`chrome.runtime.reload()`
 * جُرِّب أوّلًا فأزال الإضافة كلّها: المحمَّلة من النواة لا تعود بعده — مقيسًا.)
 */
await sleep(1500) // ما بقي من أثر التثبيت: تبويب التعريف وعمله الأوّل.
phase = 'boot'
const bootsBefore = workerBoots
const contextsBefore = workerContexts
// الإغلاق لا يوقف العامل في كل مرّة (مقيس: جولةٌ من خمس بقي فيها حيًّا فخدم الصفحة بلا إقلاع) — فيُعاد حتى يغيب
// هدفه من القائمة، والإيقاظ بعد غيابه وحده.
const workerAlive = async () =>
  (await send('Target.getTargets')).targetInfos.some(
    (t) => t.type === 'service_worker' && String(t.url).startsWith(ORIGIN),
  )
let stopped = 'لم يُوقَف'
for (let i = 0; i < 20 && stopped !== true; i++) {
  await send('Target.closeTarget', { targetId: g.sw.target.targetId }).catch(() => undefined)
  for (let j = 0; j < 10 && (await workerAlive()); j++) await sleep(100)
  if (!(await workerAlive())) stopped = true
}
const waker = await open(`${ORIGIN}/src/pages/popup/index.html`)
// النافذة تراسل الخلفية عند فتحها، ونبضٌ صريح بعدها يوقظ العامل إن تأخّر — والانتظار على الارتباط لا على الردّ.
if (waker) void rpc(waker.sessionId, 'diagnostics/ping').catch(() => undefined)
const booted = () => workerBoots > bootsBefore || workerContexts > contextsBefore
for (let i = 0; i < 200 && !booted(); i++) await sleep(100)
// معرّف هدف العامل يبقى نفسه عبر إيقافه وإقلاعه (مقيس) — فالدليل ارتباطٌ جديد به، وسالب `worker` يثبت أنه يُرى.
/*
 * الدليل أحد اثنين: ارتباطٌ جديد بالعامل (يولد موقوفًا حتى يُراقَب)، أو سياق تنفيذٍ جديد في جلسةٍ مراقَبة بقيت عليه —
 * كروم يُبقي هدف العامل ومعرّفه وجلساته عبر الإيقاف والإقلاع (مقيس)، فلا يتكرّر الارتباط في كل جولة. وسالب `worker`
 * يثبت أن طلب الإقلاع يُرى في الحالين.
 */
if (stopped === true && booted()) ok('أُوقف العامل وأيقظته صفحة: إقلاعه الثاني كلّه تحت المراقب')
else fail(`أُوقف العامل (${stopped}) ولم يُرَ إقلاعه الجديد — إقلاعٌ بلا مراقب`)
await sleep(1000)
await close(waker)

phase = 'pages'
const pagesDir = join(DIST, 'src', 'pages')
const pages = readdirSync(pagesDir)
  .filter(
    (d) => statSync(join(pagesDir, d)).isDirectory() && existsSync(join(pagesDir, d, 'index.html')),
  )
  .sort()
const SETTINGS_PLACES = [
  'capture',
  'annotation',
  'colors',
  'appearance',
  'shortcuts',
  'privacy',
  'privacy&view=excluded-sites',
  'privacy&view=permissions',
  'data',
  'integrations',
  'about',
]
const urls = pages.flatMap((p) =>
  p === 'settings'
    ? SETTINGS_PLACES.map((s) => `${ORIGIN}/src/pages/settings/index.html?section=${s}`)
    : [`${ORIGIN}/src/pages/${p}/index.html`],
)
let rendered = 0
for (const url of urls) {
  const t = await open(url)
  const drawn = t ? await waitFor(t.sessionId, RENDERED, 8000) : null
  if (drawn) rendered++
  else fail(`لم تُرسم: ${url.slice(ORIGIN.length)} — مسارٌ لم يجرِ لا يُثبت صفر طلب`)
  await sleep(600)
  await close(t)
}
ok(
  `صفحات الإضافة: ${rendered} من ${urls.length} رُسمت (${pages.join(' · ')}، والإعدادات بأقسامها الأحد عشر)`,
)

// ── الطور 2: الأدوات على صفحة الموقع ─────────────────────────────

phase = 'tools'
const driver = await open(`${ORIGIN}/src/pages/library/index.html`)
const site = await open(`${g.base}${FIXTURE}`)
if (!driver || !site) await g.abort('تعذّر فتح صفحة القيادة أو صفحة العيّنة')
const tabId = await evalIn(
  driver.sessionId,
  `chrome.tabs.query({}).then((ts) => ts.find((t) => (t.url || '').startsWith(${JSON.stringify(`${g.base}${FIXTURE}`)}))?.id ?? null)`,
)
if (typeof tabId !== 'number') {
  const seen = await evalIn(
    driver.sessionId,
    `chrome.tabs.query({}).then((ts) => ts.map((t) => [t.id, t.url ?? null, t.pendingUrl ?? null]))`,
  )
  await g.abort(`لم يُعثر على تبويب العيّنة: ${JSON.stringify(seen).slice(0, 300)}`)
}
const focusSite = async () => {
  await send('Target.activateTarget', { targetId: site.targetId })
  await evalIn(driver.sessionId, `chrome.tabs.update(${tabId}, { active: true }).then(() => true)`)
  await sleep(300)
}
await focusSite()

const TOOLS = ['inspect', 'measure', 'colour', 'area', 'element', 'issues', 'compare']
const started = []
for (const tool of TOOLS) {
  const r = await rpc(driver.sessionId, 'tool/activate', { tool, tabId })
  if (r?.ok && r.value?.started) started.push(tool)
  else fail(`لم تبدأ الأداة ${tool}: ${JSON.stringify(r).slice(0, 140)}`)
  await sleep(700)
  await rpc(driver.sessionId, 'mode/set', { mode: 'idle' }).catch(() => undefined)
}
if (started.length === TOOLS.length)
  ok(`الأدوات السبع بدأت على صفحة الموقع: ${started.join(' · ')}`)

// ── الطور 3: الالتقاط — الظاهر والكامل ───────────────────────────

phase = 'capture'
const latest = async () => {
  const r = await rpc(driver.sessionId, 'capture/latest')
  return r?.ok ? (r.value?.id ?? null) : null
}
const before = await latest()
await focusSite()
const viewport = await rpc(driver.sessionId, 'tool/activate', { tool: 'viewport', tabId })
let shot = null
for (let i = 0; i < 60 && (!shot || shot === before); i++) {
  await sleep(250)
  shot = await latest()
}
if (viewport?.ok && shot && shot !== before) ok('الالتقاط الظاهر: لقطةٌ جديدة في المكتبة')
else fail(`الالتقاط الظاهر لم يُنتج لقطة: ${JSON.stringify(viewport).slice(0, 140)}`)

await focusSite()
const full = await evalIn(
  driver.sessionId,
  `(async () => {
    const settled = new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'rasd:job' })
      const timer = setTimeout(() => { port.disconnect(); resolve({ timeout: true }) }, 60000)
      port.onMessage.addListener((m) => {
        if (m.kind === 'done') { clearTimeout(timer); port.disconnect(); resolve({ done: true }) }
        if (m.kind === 'failed') { clearTimeout(timer); port.disconnect(); resolve({ failed: m.code }) }
      })
    })
    const act = await chrome.runtime.sendMessage({ __rasd: 1, id: 'verify-network-full', type: 'tool/activate', payload: { tool: 'full-page', tabId: ${tabId} } })
    return { act, ...(await settled) }
  })()`,
)
if (full?.done) ok('الالتقاط الكامل اكتمل وحُفظ')
else fail(`الالتقاط الكامل لم يكتمل: ${JSON.stringify(full).slice(0, 160)}`)
// المحرّر والتصدير على اللقطة الظاهرة لا الكاملة: المحكوم طريقهما لا حجم ما يمرّ فيه، وPDF لقطةٍ طويلة تحت حِمل
// الجهاز تجاوز مهلته مرّة (مقيس) — بطءٌ لا صلة له بالشبكة.
const captureId = shot && shot !== before ? shot : await latest()

// ── الطور 4: المكتبة والمحرّر والتصدير ───────────────────────────

phase = 'library-editor'
await close(site)
const library = await open(`${ORIGIN}/src/pages/library/index.html`)
const cards = library
  ? await waitFor(library.sessionId, `document.querySelectorAll('img').length || null`, 8000)
  : null
if (cards) ok(`المكتبة عرضت لقطاتها (${cards} صورة)`)
else fail('المكتبة لم تعرض لقطة واحدة بعد الالتقاط')
await close(library)

const editor = captureId
  ? await open(`${ORIGIN}/src/pages/editor/index.html?capture=${encodeURIComponent(captureId)}`)
  : null
if (!editor) fail('المحرّر لم يُفتح على اللقطة')
else {
  await waitFor(editor.sessionId, `document.querySelector('[data-export-open]')`, 15_000)
  // صلاحية التنزيل الاختيارية تُطلب بمربّعٍ لا يُجاب في وضع بلا رأس — فيُسجَّل رفضها للجلسة كما يفعل `verify:export`،
  // ويتدهور التسليم إلى `<a download>`. والمحكوم هنا الشبكة لا طريق التسليم.
  await evalIn(
    editor.sessionId,
    `chrome.storage.session.set({ 'export.downloadsRefused': true }).then(() => 1)`,
  )
  for (const format of ['png', 'pdf']) {
    const S = editor.sessionId
    await evalIn(S, `document.querySelector('[data-export-close]')?.click(), 1`, true)
    await evalIn(S, `document.querySelector('[data-export-open]')?.click(), 1`, true)
    await waitFor(S, `document.querySelector('[data-export-modal]')`, 5000)
    await evalIn(S, `document.querySelector('[data-export-format="${format}"]')?.click(), 1`, true)
    // الزرّ معطَّلٌ حتى يُقدَّر الحجم — يُنقر حين يُنقَر. ونقرةٌ تقع في إعادة رسمٍ بعد اختيار الصيغة تضيع (مقيس: مرّةً في
    // نحو خمس عشرة جولة بقيت النافذة مفتوحةً ساكنة) — فتُعاد ما دامت النافذة مفتوحةً بلا عمل ولا نتيجة.
    const RESULT = `(() => { const r = document.querySelector('[data-export-result]'); return r?.dataset.exportKind === '${format}' ? Number(r.dataset.exportBytes ?? 0) || null : null })()`
    const IDLE = `!!document.querySelector('[data-export-modal]') && !document.querySelector('[data-export-result], [aria-busy="true"]')`
    let bytes = null
    for (let attempt = 0; attempt < 3 && !bytes; attempt++) {
      for (let i = 0; i < 40 && !(await clickText(S, 'تنزيل')); i++) await sleep(150)
      // شاشة النتيجة وحجم ما خرج — أثر المسار كما تعرضه الواجهة نفسها (`verify:export`).
      for (let i = 0; i < 150 && !bytes; i++) {
        bytes = await evalIn(S, RESULT).catch(() => null)
        if (!bytes && i >= 30 && (await evalIn(S, IDLE).catch(() => false)) === true) break
        if (!bytes) await sleep(150)
      }
    }
    if (bytes) ok(`التصدير ${format.toUpperCase()}: خرج ملفٌّ من ${bytes} بايت`)
    else {
      const state = await evalIn(
        S,
        `JSON.stringify({ modal: !!document.querySelector('[data-export-modal]'), error: document.querySelector('[data-export-error]')?.textContent ?? null, busy: document.querySelector('[aria-busy="true"]') ? true : false })`,
      )
      fail(`التصدير ${format.toUpperCase()} لم يبلغ شاشة النتيجة — مسارٌ لم يجرِ: ${state}`)
    }
  }
  await close(editor)
}

// ── الطور 5: الخدمتان والوضع المحلّي مفعَّل (الافتراضي) ──────────

phase = 'local-only'
const reportDialogToReview = async (sessionId) => {
  await waitFor(sessionId, `document.getElementById('report-field-title')`, 10_000)
  await type(sessionId, '#report-field-title', 'فحص الشبكة')
  await type(sessionId, '#report-field-what', 'بلاغٌ يكتبه حارس الشبكة ليقيس متى يخرج الطلب.')
  await clickText(sessionId, 'التالي: الصورة')
  await waitFor(
    sessionId,
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'التالي: المراجعة')`,
  )
  await clickText(sessionId, 'التالي: المراجعة')
  return waitFor(sessionId, `document.querySelector('[data-rasd-confirm]')`, 10_000)
}

{
  const s = await open(`${ORIGIN}/src/pages/settings/index.html?section=about&report=1`)
  const reviewed = s ? await reportDialogToReview(s.sessionId) : null
  if (!reviewed) fail('نافذة البلاغ لم تبلغ المراجعة والوضع المحلّي مفعَّل')
  else {
    await evalIn(s.sessionId, `document.querySelector('[data-rasd-confirm]').click(), 1`, true)
    const fallback = await waitFor(
      s.sessionId,
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('انسخ البلاغ'))`,
      8000,
    )
    if (fallback) ok('«أرسل البلاغ» والوضع المحلّي مفعَّل: عُرض «انسخ البلاغ» بدل الإرسال')
    else fail('«أرسل البلاغ» والوضع المحلّي مفعَّل لم يعرض بديل النسخ')
  }
  await close(s)
}
{
  const s = await open(`${ORIGIN}/src/pages/settings/index.html?section=integrations`)
  const panel = s
    ? await waitFor(
        s.sessionId,
        `document.querySelector('[data-integrations]')?.dataset.integrations`,
        8000,
      )
    : null
  if (panel) ok(`لوحة التكاملات والوضع المحلّي مفعَّل: «${panel}»`)
  else fail('لوحة التكاملات لم تُرسم')
  await close(s)
}
{
  const leaked = outgoingIn('local-only')
  if (leaked.length === 0) ok('الوضع المحلّي مفعَّل: صفر طلب من نافذة البلاغ ولوحة التكاملات')
}

// ── الطور 6: الفعل الصريح — وفيه الشاهد الموجب ───────────────────

const patched = await rpc(driver.sessionId, 'settings/patch', {
  patch: { privacy: { localOnly: false } },
})
if (!patched?.ok) fail(`تعذّر إطفاء «الوضع المحلّي فقط»: ${JSON.stringify(patched).slice(0, 140)}`)

phase = 'report-send'
{
  const s = await open(`${ORIGIN}/src/pages/settings/index.html?section=about&report=1`)
  const reviewed = s ? await reportDialogToReview(s.sessionId) : null
  await sleep(800)
  if (!reviewed) fail('نافذة البلاغ لم تبلغ المراجعة والوضع المحلّي مطفأ')
  else {
    const early = outgoingIn('report-send')
    if (early.length === 0) ok('الوضع المحلّي مطفأ والبلاغ في المراجعة: صفر طلب قبل النقرة')
    phase = 'report-send:clicked'
    await evalIn(s.sessionId, `document.querySelector('[data-rasd-confirm]').click(), 1`, true)
    // الاسم لا يُحلّ (`--host-resolver-rules`) فيفشل الإرسال — والمطلوب أن يُرى الطلب، لا أن يصل.
    await waitFor(
      s.sessionId,
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'أعد المحاولة') || !!document.querySelector('[data-tone="success"]')`,
      20_000,
    )
    const seen = outgoingIn('report-send:clicked').filter(
      (r) => originOf(r.url) === SERVICES.reports,
    )
    if (seen.length > 0)
      ok(`«أرسل البلاغ»: المراقب رأى الطلب إلى نقطة الاستقبال (${new URL(seen[0].url).pathname})`)
    else
      fail(
        '«أرسل البلاغ» بعد إطفاء الوضع المحلّي ولم يرَ المراقب طلبًا — مراقبٌ أعمى أو مسارٌ لم يجرِ',
      )
  }
  await close(s)
}

phase = 'github-connect'
{
  const s = await open(`${ORIGIN}/src/pages/settings/index.html?section=integrations`)
  const opened = s
    ? await waitFor(
        s.sessionId,
        `(() => { const b = document.querySelector('[data-connect-open]'); if (!b) return null; b.click(); return true })()`,
        8000,
      )
    : null
  const field = opened
    ? await waitFor(s.sessionId, `document.getElementById('connect-token')`, 5000)
    : null
  if (!field) fail('نافذة «اتّصل بـGitHub» لم تُفتح')
  else {
    await type(s.sessionId, '#connect-token', 'ghp_verifyNetworkProbeNotARealToken0000')
    await sleep(400)
    const early = outgoingIn('github-connect')
    if (early.length === 0) ok('الرمز مكتوب ولم يُضغط «اتّصل»: صفر طلب')
    phase = 'github-connect:clicked'
    await evalIn(s.sessionId, `document.querySelector('[data-connect-submit]').click(), 1`, true)
    await waitFor(s.sessionId, `document.querySelector('[data-connect-error]')`, 20_000)
    const seen = outgoingIn('github-connect:clicked').filter(
      (r) => originOf(r.url) === SERVICES.github,
    )
    if (seen.length > 0)
      ok(`«اتّصل»: المراقب رأى الطلب إلى api.github.com (${new URL(seen[0].url).pathname})`)
    else fail('«اتّصل» برمزٍ مكتوب ولم يرَ المراقب طلبًا إلى api.github.com')
  }
  await close(s)
}
phase = 'restore'
await rpc(driver.sessionId, 'settings/patch', { patch: { privacy: { localOnly: true } } })
await sleep(800)

// ── الأحكام: الشاهد الأوّل ───────────────────────────────────────

note(`أنواع الأهداف المراقَبة: ${[...attachedTypes].sort().join(' · ')}`)
if (!attachedTypes.has('service_worker') || !attachedTypes.has('page')) {
  fail(`المراقب لم يرتبط بالعامل والصفحات كليهما: ${[...attachedTypes].join(' · ')}`)
}

const local = requests.filter((r) => isLocal(r.url)).length
/** طلبُ النقرة بعينه: خدمة طوره، وطريقتها ومسارها، ومن صفحة الإعدادات — وأوّلُه وحده (العدّ أدناه). */
const accepted = new Map()
const isClick = (r) => {
  const service = EXPLICIT[r.phase]
  if (!service || originOf(r.url) !== SERVICES[service]) return false
  const { method, path } = EXPECTED[service]
  if (
    r.method !== method ||
    new URL(r.url).pathname !== path ||
    !r.where.startsWith(CLICK_SESSION)
  ) {
    return false
  }
  if (accepted.has(service)) return false
  accepted.set(service, r)
  return true
}
const outside = requests.filter((r) => !isLocal(r.url) && !isClick(r))
for (const u of unwatched) fail(`جلسةٌ لم تُراقَب: ${u}`)
if (outside.length === 0) {
  ok(
    `DevTools: ${requests.length} طلبًا على ${sessions.size} جلسة — ${local} محلّيًّا، والباقي في طوره الصريح وإلى خدمته وحدها`,
  )
} else {
  const seen = new Set()
  for (const r of outside) {
    const key = `${r.url}|${r.phase}`
    if (seen.has(key)) continue
    seen.add(key)
    fail(`طلبٌ صادر في طور «${r.phase}» من ${r.where}: ${r.url.slice(0, 120)}`)
  }
}
if (refused.length === 0) ok('صفر محاولة اتّصال حجبتها سياسة المحتوى')
for (const r of refused) fail(`محاولةٌ حجبتها السياسة في طور «${r.phase}» من ${r.where}: ${r.text}`)
for (const n of navigations)
  fail(`تبويبٌ إلى عنوانٍ خارجي في طور «${n.phase}»: ${n.url.slice(0, 120)}`)

// ── الأحكام: الشاهد الثاني — سجلّ المتصفّح من الإقلاع ─────────────

await send('Browser.close').catch(() => undefined)
let netlog = ''
for (let i = 0; i < 50; i++) {
  netlog = existsSync(NETLOG) ? readFileSync(NETLOG, 'utf8') : ''
  if (/"polledData"|\]\s*\}\s*$/u.test(netlog.slice(-4096))) break
  await sleep(200)
}
if (!/"polledData"|\]\s*\}\s*$/u.test(netlog.slice(-4096))) {
  fail(`سجلّ الشبكة لم يُغلق خلال عشر ثوانٍ (${netlog.length} بايت) — آخر ما فيه قد يكون مبتورًا`)
}
const lines = netlog.split('\n')
let constants = null
try {
  constants = JSON.parse(`${lines[0].replace(/,\s*$/u, '')}}`).constants
} catch {
  /* السطر الأوّل ليس الثوابت وحدها في هذا الإصدار — يُبحث عنه أدناه */
}
const startJob = constants?.logEventTypes?.URL_REQUEST_START_JOB
if (startJob === undefined) {
  fail(`سجلّ الشبكة لم يُقرأ (${netlog.length} بايت) — الشاهد الثاني غائب`)
} else {
  const initiated = []
  for (const line of lines) {
    if (!line.includes(`"type":${startJob}`)) continue
    let ev
    try {
      ev = JSON.parse(line.replace(/,\s*$/u, ''))
    } catch {
      continue
    }
    const { url, initiator } = ev.params ?? {}
    if (!url || !initiator || initiator === 'not an origin') continue
    initiated.push({ url: String(url), initiator: String(initiator) })
  }
  const ours = initiated.filter((r) => r.initiator === ORIGIN || isLocal(r.initiator))
  const leaving = ours.filter((r) => !isLocal(r.url))
  const named = new Set(Object.values(SERVICES))
  const unnamed = leaving.filter((r) => !named.has(originOf(r.url)))
  const toService = (s) => leaving.filter((r) => originOf(r.url) === SERVICES[s]).length
  for (const r of unnamed) fail(`سجلّ المتصفّح: ${r.initiator} طلب ${r.url.slice(0, 120)}`)
  /*
   * سجلّ المتصفّح بلا أطوار، فلا يُسأل «متى» بل «كم»: ما رآه من طلبات كل خدمة يساوي ما رآه الشاهد الأوّل بعد نقرتها
   * عددًا. وزيادةٌ عنده طلبٌ إلى خدمةٍ مسمّاة لم يرَه الأوّل — قبل الارتباط (التثبيت) أو خارج طوره.
   */
  for (const s of Object.keys(SERVICES)) {
    const n = toService(s)
    // طلب النقرة المقبول وحده — وما سواه إلى الخدمة أسقطه الشاهد الأوّل، وهنا يُسقطه العدّ إن فات الأوّل.
    const clicked = accepted.has(s) ? 1 : 0
    if (n === 0) fail(`سجلّ المتصفّح لم يرَ طلب الطور الصريح إلى ${SERVICES[s]} — شاهدٌ أعمى`)
    else if (n !== clicked) {
      fail(`سجلّ المتصفّح: ${n} طلبًا إلى ${SERVICES[s]} والنقرة صنعت ${clicked} — طلبٌ خارج طوره`)
    }
  }
  if (unnamed.length === 0) {
    ok(
      `سجلّ المتصفّح من الإقلاع: ${ours.length} طلبًا بادرت بها الإضافة أو صفحة الموقع — لا وجهة خارجية إلا ` +
        `الخدمتين في طوريهما (${toService('reports')} · ${toService('github')})`,
    )
  }
}

// ── السياسة في البيان المبنيّ تسمّي الخدمتين وحدهما ───────────────

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
const connect = /connect-src ([^;]+)/u.exec(manifest.content_security_policy?.extension_pages ?? '')
const sources = connect ? connect[1].trim().split(/\s+/u).sort() : []
const expected = ["'self'", ...Object.values(SERVICES)].sort()
if (JSON.stringify(sources) === JSON.stringify(expected)) {
  ok(`connect-src في البيان: 'self' والخدمتان المسمّاتان وحدهما`)
} else fail(`connect-src في البيان لا يطابق الخدمتين المسمّاتين: ${sources.join(' ')}`)

await g.finish({
  success: '✓ لا شيء يغادر الجهاز في المسارات المحلّية، والوجهتان المسمّاتان بفعلٍ صريح وحده.',
})
