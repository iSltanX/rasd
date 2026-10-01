/**
 * فحص الذاكرة — **خمسون دورة تفعيل وتعطيل لا تترك مستمعًا ولا عقدةً، وذروة الالتقاط الكامل ≤ 400MB**
 * (`STAGES/21`، ADR 0048).
 *
 * كروم حقيقي بالحزمة المبنيّة. حُكمان، كلٌّ منهما يُقاس لا يُفترض:
 *
 * 1. **صفر نموّ عبر خمسين دورة، في مرحلتين.** (أ) *الجلسة الحيّة*: ما يقع حين يفعّل المستخدم أداةً ويخرج منها — إعادة
 *    حقن `content.js` (يعيد تنفيذه كاملًا في كل تفعيل) تعيد الجلسة القائمة، ثمّ دخول أوضاعٍ وخروج إلى `idle`.
 *    (ب) *التفعيل والتفكيك*: حقن ← إقلاع ← أوضاع ← `teardown()`، وهو ما يقع حين يُفكَّك المضيف (تحديث الإضافة والصفحة
 *    مفتوحة، أو `unmountHost`). قبل كل مرحلة وبعدها — وبعد جمع القمامة ثلاثًا — يُقرأ: `jsEventListeners` و`nodes`
 *    و`documents` من `Memory.getDOMCounters` (و`nodes` تعدّ كل عقدة حيّة، منفصلةً كانت أو متّصلة)، والمستمعون على
 *    `window` و`document` و`documentElement` و`body` من `DOMDebugger`، وكومة JS، ومستمعو **واجهات الإضافة**
 *    (`chrome.runtime.onMessage` و`chrome.storage.onChanged`…) بعدّ `addListener − removeListener` في العالم
 *    المعزول — فهذه لا يراها عدّاد DOM أصلًا، وفيها التسريب الذي كشفه الحارس أوّل ما جرى (واحدٌ زائدٌ لكل دورة
 *    تفكيك: 2 ← 52). أيّ فرق موجب يُسقط الحارس باسمه.
 * 2. **ذروة الالتقاط.** التقاط صفحة عشرين شاشة (`perf-20screens/`) كاملًا، والذاكرة المقيمة (RSS) لكل عمليات كروم
 *    هذا الحارس تُؤخذ كل 100ms طوال المهمّة. الحكم على **أعلى زيادة فوق الخامل** ≤ 400MB (`runtime-budgets.mjs`)،
 *    ولا يُقبل رقمٌ من التقاط ناقص (انظر `verify-fullpage.mjs`).
 *
 * **ولا يُحكم على الغياب.** نموٌّ صفر على قياسٍ أعمى يمرّ أخضر كاذبًا: فقبل الدورات تُقاس طبقةٌ حيّة (تُفكَّك بعدها)
 * ويُشترط أن تزيد عدّاداتها عمّا قبل الإقلاع؛ وكل دورة تُثبت أن طبقتها رُكّبت وفُكّكت؛ وأيّ مقدارٍ لم يُقَس (`NaN`) يُسقط ولا يمرّ.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_MEMORY=listener pnpm verify:memory   # يجب أن يفشل
 *
 * يُرقَّع التفكيك في نسخة الفحص فيترك مستمع `resize` على `window` — تسريب مستمع DOM لكل دورة.
 *
 *     RASD_BREAK_MEMORY=node pnpm verify:memory       # يجب أن يفشل
 *
 * يترك التفكيك عقدةً منفصلة حيّة في مصفوفة كل دورة.
 *
 *     RASD_BREAK_MEMORY=api pnpm verify:memory        # يجب أن يفشل
 *
 * يترك التفكيك مستمعًا على `chrome.runtime.onMessage` — الصنف الذي كان فعلًا مسرَّبًا قبل الإصلاح.
 *
 *     RASD_BREAK_MEMORY=peak pnpm verify:memory       # يجب أن يفشل
 *
 * يحجز الحارس 450MB مقيمة في صفحة الإضافة التي تقود الالتقاط أثناء المهمّة فتتجاوز الزيادة 400MB.
 *
 * الترقيعات الثلاثة الأولى تُلحَق بنهاية `content.js` في نسخة الفحص وتعترض `teardown()`، وترمي بصوتٍ عالٍ إن لم تجد
 * ما تعترضه. الإقلاع والاتصال والتحميل والارتباط والتنظيف في النواة المشتركة (`scripts/lib/cdp.mjs`، `STAGES/17`).
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { attachTarget, startGuard } from './lib/cdp.mjs'
import { judge } from './runtime-budgets.mjs'

const PORT = 9353
const BREAK = process.env.RASD_BREAK_MEMORY ?? ''
const CYCLES = 50
const WARMUP = 3

/** ترقيع اختبار العكس على نسخة الفحص: يعترض `teardown()` ويترك أثره بعده. يرمي إن لم يجد ما يعترضه. */
function breakPatch(stage) {
  if (!BREAK || BREAK === 'peak') return
  if (!['listener', 'node', 'api'].includes(BREAK)) {
    throw new Error(`RASD_BREAK_MEMORY=${BREAK}: القيم listener أو node أو api أو peak.`)
  }
  const file = join(stage, 'content.js')
  if (!existsSync(file))
    throw new Error('RASD_BREAK_MEMORY: dist/content.js غير موجود في نسخة الفحص')
  const leak = {
    listener: `window.addEventListener('resize', () => {})`,
    node: `;(window.__rasdLeak ||= []).push(document.createElement('div'))`,
    api: `chrome.runtime.onMessage.addListener(() => false)`,
  }[BREAK]
  appendFileSync(
    file,
    `\n;(() => {
  const api = globalThis.__rasdContent
  if (!api || typeof api.startOverlay !== 'function') throw new Error('RASD_BREAK_MEMORY: لا __rasdContent.startOverlay')
  const start = api.startOverlay
  api.startOverlay = async (...args) => {
    const r = await start(...args)
    if (r.ok && !r.value.__broken) {
      const teardown = r.value.teardown
      r.value.__broken = true
      r.value.teardown = () => { teardown(); ${leak} }
    }
    return r
  }
})()\n`,
  )
}

const g = await startGuard({
  prefix: 'memory',
  port: PORT,
  title: '── فحص الذاكرة: خمسون دورة بلا تسريب، وذروة الالتقاط الكامل ──',
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'], patch: breakPatch },
  serviceWorker: true,
  args: ['--window-size=1280,800'],
})
const { send, ok, fail, note } = g
const BASE = g.base
const extId = g.extId
const sw = g.sw

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const inSW = (expression) => sw.evaluate(expression)

if (!extId || !sw) await g.abort('الإضافة أو الـservice worker لم يجهزا')

// ── أدوات مشتركة ────────────────────────────────────────────────
const granted = await inSW(
  `chrome.permissions.contains({ origins: ['${BASE}/*'] }).then(g => g).catch(() => false)`,
).catch(() => false)
if (!granted) {
  await g.abort('صلاحية المضيف للعيّنات غير ممنوحة — لا حقن حقيقي، والفحص لا يدّعي نجاحًا بلا حقن')
}
ok(`نسخة الفحص محمَّلة، والصلاحية للعيّنات المحلّية وحدها (${BASE}/*)`)

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

async function evalIn(sessionId, expression) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  return attachTarget(send, t.targetId)
}

/** كل عمليات كروم هذا الحارس (المتصفّح والعارضات والعمّال) ومجموع ذاكرتها المقيمة بالميغابايت. */
async function residentMegabytes() {
  const { processInfo } = await send('SystemInfo.getProcessInfo')
  const ids = processInfo.map((p) => p.id).filter(Number.isInteger)
  if (ids.length === 0) return Number.NaN
  const out = execFileSync('ps', ['-o', 'rss=', '-p', ids.join(',')], { encoding: 'utf8' })
  const kilobytes = out
    .split('\n')
    .map((l) => Number(l.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((a, b) => a + b, 0)
  return kilobytes / 1024
}

// ── 1) خمسون دورة ───────────────────────────────────────────────
const pageTab = await openTab('/short/')
const pageSession = await attachToPage('/short/')
if (!pageSession) await g.abort('تعذّر الارتباط بصفحة العيّنة')
await send('HeapProfiler.enable', {}, pageSession)
await send('DOMDebugger.enable', {}, pageSession).catch(() => {})

/** يجمع القمامة ثلاثًا — الأولى تُفرغ، والثانية تلتقط ما أفرجته الأولى، والثالثة تثبّت. */
async function collect() {
  for (let i = 0; i < 3; i++) {
    await send('HeapProfiler.collectGarbage', {}, pageSession)
    await sleep(60)
  }
}

/** مستمعو العُقد الأربع التي تعلّق الطبقة عليها — مجموعهم عبر العوالم كلّها. */
async function pageTargetListeners() {
  let total = 0
  for (const expr of ['window', 'document', 'document.documentElement', 'document.body']) {
    const { result } = await send('Runtime.evaluate', { expression: expr }, pageSession)
    if (!result?.objectId) continue
    const { listeners } = await send(
      'DOMDebugger.getEventListeners',
      { objectId: result.objectId },
      pageSession,
    )
    total += listeners.length
  }
  return total
}

async function readState() {
  await collect()
  const counters = await send('Memory.getDOMCounters', {}, pageSession)
  const heap = await send('Runtime.getHeapUsage', {}, pageSession)
  const apiListeners = await probe(
    `() => globalThis.__rasdMemProbe ? globalThis.__rasdMemProbe.live() : null`,
  )
  return {
    domListeners: counters.jsEventListeners,
    nodes: counters.nodes,
    documents: counters.documents,
    targetListeners: await pageTargetListeners(),
    heapMB: heap.usedSize / 1048576,
    api: apiListeners,
  }
}

/** ينفّذ دالّة في العالم المعزول للتبويب ويعيد قيمتها. */
async function probe(fnSource, args = []) {
  const expr = `chrome.scripting.executeScript({
    target: { tabId: ${pageTab} },
    world: 'ISOLATED',
    func: ${fnSource},
    args: ${JSON.stringify(args)},
  }).then(r => r[0].result).catch(e => ({ error: e.message }))`
  return inSW(expr)
}

// عدّاد مستمعي واجهات الإضافة — يُركَّب في العالم المعزول قبل أوّل حقن، ويبقى عبر الحقنات (العالم نفسه).
const installProbe = await probe(`() => {
  if (globalThis.__rasdMemProbe) return 'present'
  const events = {
    'runtime.onMessage': chrome.runtime.onMessage,
    'runtime.onConnect': chrome.runtime.onConnect,
    'storage.onChanged': chrome.storage?.onChanged,
    'permissions.onAdded': chrome.permissions?.onAdded,
  }
  const live = new Map()
  for (const [name, ev] of Object.entries(events)) {
    if (!ev) continue
    live.set(name, new Set())
    const add = ev.addListener.bind(ev)
    const rem = ev.removeListener.bind(ev)
    ev.addListener = (fn, ...rest) => { live.get(name).add(fn); return add(fn, ...rest) }
    ev.removeListener = (fn, ...rest) => { live.get(name).delete(fn); return rem(fn, ...rest) }
  }
  globalThis.__rasdMemProbe = {
    live: () => Object.fromEntries([...live].map(([k, v]) => [k, v.size])),
  }
  return 'installed'
}`)
note(`عدّاد مستمعي الواجهات: ${JSON.stringify(installProbe)}`)

/** يحقن `content.js` في تبويب العيّنة — الحقن يعيد تنفيذ الحزمة كاملةً كما في كل تفعيل حقيقي. */
const inject = () =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${pageTab} },
    files: ['content.js'],
  }).then(() => 'injected').catch(e => 'ERR: ' + e.message)`)

/** ينتظر إطارين مرسومين داخل العالم المعزول — أوضاع الأدوات تركّب مستمعاتها عند الدخول وتفكّها عند الخروج. */
const MODES_JS = `async (s, modes) => {
    const seen = []
    for (const m of modes) {
      const res = s.modes.set(m)
      seen.push(res.ok ? m : 'x:' + m)
      await new Promise((ok) => requestAnimationFrame(() => ok()))
    }
    return seen
  }`

/**
 * **دورة التفكيك:** حقن ← إقلاع ← أوضاع ← `teardown()`. وتعيد ما رُئي داخلها: أن الطبقة رُكّبت فعلًا ثم فُكّكت فعلًا.
 * `keep` يُبقيها حيّةً (بلا تفكيك) لقياس ما تُركّبه — دليل أن القياس ليس أعمى.
 */
async function teardownCycle({ keep = false } = {}) {
  const injected = await inject()
  if (injected !== 'injected') return { error: injected }
  return probe(
    `async (keep) => {
    const modesOf = ${MODES_JS}
    const r = await globalThis.__rasdContent.startOverlay()
    if (!r.ok) return { error: r.error.message }
    const s = r.value
    const seen = { mounted: s.host.layer.isConnected }
    seen.modes = await modesOf(s, ['inspect', 'measure', 'area', 'idle'])
    if (keep) return seen
    s.teardown()
    seen.removed = !s.host.layer.isConnected
    seen.sessionCleared = !window.__rasdSession
    return seen
  }`,
    [keep],
  )
}

/**
 * **دورة الجلسة الحيّة:** ما يقع فعلًا حين يُفعِّل المستخدم أداةً ويخرج منها — إعادة حقن تعيد الجلسة القائمة، ودخول
 * أوضاعٍ وخروج إلى `idle`، بلا تفكيك. تفحص أن الأدوات تفكّ ما ركّبته عند الخروج.
 */
async function liveCycle() {
  const injected = await inject()
  if (injected !== 'injected') return { error: injected }
  return probe(`async () => {
    const modesOf = ${MODES_JS}
    const r = await globalThis.__rasdContent.startOverlay()
    if (!r.ok) return { error: r.error.message }
    const s = r.value
    const first = (globalThis.__rasdMemFirst ??= s)
    const seen = { mounted: s.host.layer.isConnected, same: s === first }
    seen.modes = await modesOf(s, ['inspect', 'measure', 'area', 'element', 'idle'])
    return seen
  }`)
}

/** تفكيك الجلسة القائمة إن وُجدت — ويعيد هل كانت. */
const teardownLive = () =>
  probe(`async () => {
    const running = window.__rasdSession
    if (!running) return false
    const r = await running
    if (r.ok) r.value.teardown()
    delete globalThis.__rasdMemFirst
    return !window.__rasdSession
  }`)

const modesOk = (r) => r.modes?.length > 0 && r.modes.every((m) => !m.startsWith('x:'))
const teardownCycleOk = (r) =>
  r &&
  !r.error &&
  r.mounted === true &&
  r.removed === true &&
  r.sessionCleared === true &&
  modesOk(r)
const liveCycleOk = (r) => r && !r.error && r.mounted === true && r.same === true && modesOk(r)

/** يحكم على نموّ مقدارٍ بين قبل وبعد: أيّ زيادة تُسقط باسمه، ورقمٌ لم يُقَس (`NaN`) يُسقط ولا يمرّ. */
function noGrowth(label, from, to, allowed = 0) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    fail(`${label}: لم يُقَس (${from} ← ${to})`)
  } else if (to - from > allowed) {
    fail(`${label}: نما ${from} ← ${to} عبر ${CYCLES} دورة`)
  } else {
    ok(`${label}: ${from} ← ${to} عبر ${CYCLES} دورة`)
  }
}

/** يُجري `CYCLES` دورة ويحكم على كل مقدار. `before` تُقاس بعد الإحماء. */
async function growthRun(label, cycle, cycleOk) {
  for (let i = 0; i < WARMUP; i++) await cycle()
  const before = await readState()
  let broken = 0
  const why = []
  for (let i = 0; i < CYCLES; i++) {
    const r = await cycle()
    if (!cycleOk(r)) {
      broken++
      if (why.length < 3) why.push(JSON.stringify(r))
    }
  }
  const after = await readState()
  note(`${label} — قبل: ${JSON.stringify(before)}`)
  note(`${label} — بعد ${CYCLES} دورة: ${JSON.stringify(after)}`)
  if (broken > 0)
    fail(`${label}: ${broken} من ${CYCLES} دورة لم تعمل كما يُفترض: ${why.join(' | ')}`)
  else ok(`${label}: ${CYCLES} دورة عملت كلٌّ منها كما يُفترض`)

  const l = `${label} — `
  noGrowth(`${l}مستمعو DOM (كل العوالم)`, before.domListeners, after.domListeners)
  noGrowth(
    `${l}مستمعو window وdocument والجذر والجسم`,
    before.targetListeners,
    after.targetListeners,
  )
  noGrowth(`${l}عقد DOM (الحيّة كلّها، منفصلةً ومتّصلة)`, before.nodes, after.nodes)
  noGrowth(`${l}مستندات`, before.documents, after.documents)
  for (const name of Object.keys({ ...before.api, ...after.api })) {
    noGrowth(`${l}مستمعو chrome.${name}`, before.api?.[name] ?? 0, after.api?.[name] ?? 0)
  }
  // كومة JS: هامش ميغابايتين لضجيج المخصِّص بعد جمع القمامة؛ التسريب الحقيقي يعطي ميغابايتات لكل عشرات الدورات.
  noGrowth(
    `${l}كومة JS بعد جمع القمامة (MB)`,
    Number(before.heapMB.toFixed(2)),
    Number(after.heapMB.toFixed(2)),
    2,
  )
}

/*
 * **الأساس نظيف.** مع صلاحية مضيفٍ ممنوحة تستأنف الإضافةُ وضع المقارنة بعد كل تحميل (`activateResume`)، فتحقن الطبقة
 * في التبويب قبل أن يبدأ الحارس — قِيس: جلسةٌ حيّة بستةٍ وعشرين مستمعًا وأربع عقد عند أوّل قراءة. فتُفكَّك أوّلًا،
 * وتُفكَّك بعد كل مرحلة، كي تبدأ كل مرحلة من صفحةٍ بلا طبقة.
 */
const preexisting = await teardownLive()
if (preexisting) note('جلسة سابقة (استئناف تلقائي بعد التحميل) فُكّكت قبل القياس')
const baselineEmpty = await readState()

// قياسٌ ليس أعمى: طبقةٌ حيّة تزيد العدّادات عمّا قبل الإقلاع، ثم تُفكَّك فتعود.
const live = await teardownCycle({ keep: true })
const whileLive = await readState()
const tornDown = await teardownLive()
if (live?.error || !live?.mounted) {
  fail(`قياس الطبقة الحيّة: لم تُركَّب — ${JSON.stringify(live)}`)
} else if (
  whileLive.domListeners > baselineEmpty.domListeners &&
  whileLive.nodes > baselineEmpty.nodes &&
  (whileLive.api['runtime.onMessage'] ?? 0) > 0
) {
  ok(
    `القياس يرى الطبقة الحيّة: مستمعو DOM ${baselineEmpty.domListeners} ← ${whileLive.domListeners}، ` +
      `عقد ${baselineEmpty.nodes} ← ${whileLive.nodes}، ومستمعو onMessage ${whileLive.api['runtime.onMessage']}`,
  )
} else {
  fail(
    `القياس أعمى: طبقةٌ حيّة لم تزد عدّاداته — قبل ${JSON.stringify(baselineEmpty)} ومعها ${JSON.stringify(whileLive)}`,
  )
}
if (tornDown !== true) fail('تفكيك الطبقة الحيّة لم يُفرغ علامة الجلسة')

await growthRun('الجلسة الحيّة (تفعيل أوضاع والخروج منها)', liveCycle, liveCycleOk)
await teardownLive()
await growthRun('التفعيل والتفكيك', teardownCycle, teardownCycleOk)

// ── 2) ذروة الالتقاط ────────────────────────────────────────────
/*
 * **ما يُقاس: الذروة المنسوبة إلى الالتقاط، لا مجموع الذاكرة المقيمة المطلق.** RSS العملية يعدّ كل صفحة مشتركة
 * في ذاكرتها — المكتبات والإطارات — فمجموعه على كل عمليات كروم يعدّ المشترك مرّات (قِيس 2.2GB لمتصفّحٍ خاملٍ فيه
 * أربع صفحات)، رقمٌ يخبر عن عدد العمليات لا عن الالتقاط. فيؤخذ المجموع قبل المهمّة (الطبقة محقونة والصفحة والسائق
 * مفتوحان) ثم يُراقَب كل 100ms طوالها، والحكم على **أعلى زيادة فوق الخامل**: ما يكلّفه الالتقاط نفسه من بكسلات
 * البلاطات والقماش المجمَّع والترميز. وهو مقياسٌ يقبل المقارنة بين الأجهزة، وفوق مجموعٍ مطلقٍ كان يُنتج الرقم
 * نفسه لكل التقاطٍ مهما كبر.
 */
const tag = 'perf-20screens:'
let peakDeltaMB = Number.NaN
{
  const tabId = await openTab('/perf-20screens/')
  const injected = await inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    files: ['content.js'],
  }).then(() => 'injected').catch(e => 'ERR: ' + e.message)`)
  const started = await inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: () => globalThis.__rasdContent.startOverlay().then(r => ({ ok: r.ok })),
  }).then(r => r[0].result)`)
  if (injected !== 'injected' || !started?.ok) {
    fail(`${tag} تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    const dims = await inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} },
      world: 'MAIN',
      func: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio,
        screens: window.__screens ?? 0,
      }),
    }).then(r => r[0].result)`)
    const screens = dims.scrollHeight / dims.innerHeight
    if (dims.screens === 20 && screens >= 20 && screens < 21.5) {
      ok(
        `${tag} العيّنة ${screens.toFixed(1)} شاشة (${dims.scrollHeight}px على نافذة ${dims.innerHeight}px)`,
      )
    } else {
      fail(`${tag} العيّنة لا تمثّل عشرين شاشة: ${screens.toFixed(1)} شاشة، علامات ${dims.screens}`)
    }

    // صفحة الإضافة هي المُرسِل — انظر `verify-fullpage.mjs`.
    const driverTab = await inSW(
      `chrome.tabs.get(${tabId}).then(t =>
        chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), windowId: t.windowId, active: false })
      ).then(t => t.id)`,
    )
    await inSW(`new Promise(res => {
      const check = () => chrome.tabs.get(${driverTab}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
      check()
    })`)
    const driver = await attachToPage('src/pages/library/')
    if (!driver) {
      fail(`${tag} تعذّر فتح صفحة الإضافة لقيادة المهمّة`)
    } else {
      await evalIn(
        driver,
        `chrome.runtime.sendMessage({ __rasd: 1, id: 'ping', type: 'diagnostics/ping' })`,
      )
      await sleep(1200)

      await sleep(500)
      const idle = await residentMegabytes()
      if (BREAK === 'peak') {
        // بعد قراءة الخامل لا قبلها: ما يُحجز قبلها يصير جزءًا من الخامل فلا يزيد الفرق. تُلمس الصفحات كلّها فتُعدّ في RSS.
        await evalIn(
          driver,
          `(() => { const a = new Uint8Array(450 * 1048576); for (let i = 0; i < a.length; i += 4096) a[i] = 1; globalThis.__held = a })()`,
        )
        note('اختبار العكس: RASD_BREAK_MEMORY=peak — 450MB محجوزة في صفحة السائق أثناء المهمّة')
      }
      let peak = idle
      let sampling = true
      const sampler = (async () => {
        while (sampling) {
          const now = await residentMegabytes()
          if (Number.isFinite(now) && now > peak) peak = now
          await sleep(100)
        }
      })()

      const t0 = Date.now()
      const run = await evalIn(
        driver,
        `(async () => {
          const listen = new Promise((resolve) => {
            const port = chrome.runtime.connect({ name: 'rasd:job' })
            const timer = setTimeout(() => { port.disconnect(); resolve({ timeout: true }) }, 90000)
            let last = null
            port.onMessage.addListener((m) => {
              if (m.kind === 'progress') last = m
              if (m.kind === 'done') { clearTimeout(timer); port.disconnect(); resolve({ done: m.result, last }) }
              if (m.kind === 'failed') { clearTimeout(timer); port.disconnect(); resolve({ failed: m, last }) }
            })
          })
          const act = await chrome.runtime.sendMessage({
            __rasd: 1,
            id: 'verify-memory-fullpage',
            type: 'tool/activate',
            payload: { tool: 'full-page', tabId: ${tabId} },
          })
          const settled = await listen
          return { act, ...settled }
        })()`,
      )
      sampling = false
      await sampler
      const seconds = (Date.now() - t0) / 1000

      if (run?.failed) {
        fail(`${tag} فشل الالتقاط: ${run.failed.code} — ${run.failed.message}`)
      } else if (run?.timeout) {
        fail(`${tag} لم تُحسم المهمّة خلال 90 ثانية — آخر تقدّم ${JSON.stringify(run.last)}`)
      } else if (!run?.done) {
        fail(`${tag} ردّ غير متوقَّع: ${JSON.stringify(run)}`)
      } else {
        const d = run.done
        note(`${tag} ${d.width}×${d.height} من ${d.tiles} بلاطة في ${seconds.toFixed(1)}s`)
        const wanted = Math.round(dims.scrollHeight * dims.dpr)
        const slack = Math.round(dims.innerHeight * dims.dpr)
        if (d.truncated)
          fail(`${tag} بُتر الالتقاط: ${d.truncated} — لا يُحكم على ذروة التقاط ناقص`)
        else if (Math.abs(d.height - wanted) > slack)
          fail(`${tag} الارتفاع خارج الهامش: ${d.height} مقابل ${wanted} (هامش ${slack})`)
        else if (d.tiles < 20) fail(`${tag} ${d.tiles} بلاطة فقط لصفحة عشرين شاشة`)
        else {
          peakDeltaMB = peak - idle
          note(`${tag} المقيم قبل المهمّة ${idle.toFixed(0)}MB، وذروتها ${peak.toFixed(0)}MB`)
          const verdict = judge('memory-peak', peakDeltaMB)
          if (verdict.pass) ok(`${tag} ${verdict.text} (زيادة فوق الخامل)`)
          else fail(`${tag} ${verdict.text} (زيادة فوق الخامل)`)
        }
      }
    }
  }
}

await g.finish({
  success: `✓ ${CYCLES} دورة تفعيل وتعطيل بلا نموّ في المستمعين والعقد، وذروة الالتقاط ${peakDeltaMB.toFixed(0)}MB.`,
})
