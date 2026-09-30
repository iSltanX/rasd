#!/usr/bin/env node
/**
 * يثبت في متصفح حقيقي أن قناة مفتوحة تُبقي الـservice worker حيًّا أطول من
 * مهلة الخمول البالغة 30 ثانية.
 *
 * **لماذا لا يكفي اختبار الوحدة:** المؤقّتات المزيّفة تثبت أن النبضة تُرسَل،
 * لا أن Chrome يمتنع عن إنهاء العامل. الضمانة الحقيقية سلوك متصفح لا منطق كود.
 *
 * **كيف يُقاس:** `diagnostics/ping` يُرجع `uptimeMs` محسوبًا من لحظة إقلاع نسخة
 * الـservice worker الحالية. لو أُنهي العامل وأُعيد تشغيله لعاد العدّاد إلى الصفر.
 * فبقاء `uptimeMs ≥ 45000` يعني أن **النسخة نفسها** عاشت خمسًا وأربعين ثانية.
 *
 * يستغرق ~55 ثانية، وهو مُدرج في CI منذ مصفوفة الحرّاس (‏`§6` صفّ 97).
 *   pnpm verify:lifecycle
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { PAGE_PATHS } from '../src/shared/page-paths.ts'

import { waitForExtensionContext } from './lib/live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9388

/** مدّة الصمود المطلوبة — أطول من مهلة الخمول بمقدار النصف. */
const SURVIVE_MS = 45_000
/** فاصل النبضة من الصفحة. يطابق `HEARTBEAT_MS` في المصدر. */
const PING_EVERY_MS = 20_000
/** حدّ أقصى مطلق حتى لا يعلّق الفحص أبدًا. */
const HARD_TIMEOUT_MS = 150_000

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))

if (!existsSync(dist)) {
  console.error('dist/ غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const profile = mkdtempSync(join(tmpdir(), 'rasd-life-'))
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
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
proc.stderr.on('data', () => undefined)

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}

function finish(code) {
  try {
    proc.kill('SIGKILL')
  } catch {
    /* أُغلق أصلًا */
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* Chrome ما يزال يكتب — لا نُفشل الفحص بسبب التنظيف */
  }
  console.log('\nفحص دورة حياة الـservice worker:')
  console.log(lines.join('\n'))
  if (code !== 0 || errors.length > 0) {
    console.error(`\n✗ فشل الفحص — ${errors.length || 1} مشكلة.\n`)
    process.exit(1)
  }
  console.log('\n✓ القناة المفتوحة تُبقي الـservice worker حيًّا أطول من مهلة الخمول.\n')
  process.exit(0)
}

const guard = setTimeout(() => {
  fail(`تجاوز الفحص الحدّ الأقصى ${HARD_TIMEOUT_MS / 1000} ثانية`)
  finish(1)
}, HARD_TIMEOUT_MS)
guard.unref?.()

// ── الاتصال ببروتوكول DevTools ────────────────────────────────────
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
    /* المتصفح لم يجهز بعد */
  }
  if (!wsUrl) await new Promise((r) => setTimeout(r, 250))
}
if (!wsUrl) {
  fail('تعذّر الاتصال ببروتوكول DevTools')
  finish(1)
}

const sock = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  sock.addEventListener('open', resolve, { once: true })
  sock.addEventListener('error', reject, { once: true })
})

let nextId = 1
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      sock.removeEventListener('message', onMsg)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
    sock.addEventListener('message', onMsg)
    sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

/** يبني مُقيِّمًا على جلسة هدف. */
const evaluatorFor = (sessionId) => async (expression) => {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (res.exceptionDetails) {
    const d = res.exceptionDetails
    const detail = d.exception?.description ?? d.exception?.value ?? d.text ?? JSON.stringify(d)
    throw new Error(String(detail).split('\n')[0])
  }
  return res.result.value
}

/**
 * يبحث عن الهدف **ويتّصل به في المحاولة نفسها**.
 *
 * الـservice worker كسول: قد يُنهى بين لحظة العثور عليه ولحظة الاتصال، فيصير
 * المعرّف قديمًا ويردّ CDP بـ«No target with given id found».
 */
async function findAndAttach(predicate, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const { targetInfos } = await send('Target.getTargets')
    const found = targetInfos.find(predicate)
    if (found) {
      try {
        const { sessionId } = await send('Target.attachToTarget', {
          targetId: found.targetId,
          flatten: true,
        })
        await send('Runtime.enable', {}, sessionId)
        return evaluatorFor(sessionId)
      } catch {
        /* الهدف اختفى بين الاكتشاف والاتصال — نعيد الكرّة */
      }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
let extensionId = null
try {
  extensionId = (await send('Extensions.loadUnpacked', { path: dist })).id
  ok(`الحزمة محمَّلة — ${extensionId}`)
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
  finish(1)
}
const ownOrigin = `chrome-extension://${extensionId}/`

// ── 1) الـservice worker ──────────────────────────────────────────
const inWorker = await findAndAttach(
  (t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin),
)
if (!inWorker) {
  fail('لم يستيقظ الـservice worker')
  finish(1)
}
ok('الـservice worker يعمل')

// الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
await waitForExtensionContext((e) => inWorker.evaluate(e))

// ── 2) صفحة الإضافة، تُفتح من داخل الإضافة ────────────────────────
// التنقّل العلوي إلى صفحة إضافة من سياق خارجي يمنعه Chrome (ينتهي بـabout:blank)،
// و`chrome.tabs.create` من داخل العامل هو الطريق المعتمد.
await inWorker(
  `chrome.tabs.create({ url: chrome.runtime.getURL(${JSON.stringify(PAGE_PATHS.library)}) })`,
)

const inPage = await findAndAttach((t) => t.type === 'page' && String(t.url).startsWith(ownOrigin))
if (!inPage) {
  fail('لم تُفتح صفحة الإضافة')
  finish(1)
}
ok('صفحة الإضافة مفتوحة')

const where = JSON.parse(
  await inPage(
    'JSON.stringify({ href: location.href, hasRuntime: typeof chrome !== "undefined" && !!chrome.runtime })',
  ),
)
if (!where.hasRuntime) {
  fail(`الصفحة لا ترى chrome.runtime — ${where.href}`)
  finish(1)
}
ok('الصفحة تصل إلى chrome.runtime')

// ── 3) فتح قناة keepalive والنبض عليها ────────────────────────────
await inPage(`(() => {
  window.__rasd = { pongs: 0, drops: 0 }
  const port = chrome.runtime.connect({ name: 'rasd:keepalive' })
  port.onMessage.addListener((m) => { if (m && m.kind === 'pong') window.__rasd.pongs++ })
  port.onDisconnect.addListener(() => { window.__rasd.drops++ })
  window.__rasd.port = port
  window.__rasd.timer = setInterval(() => {
    try { window.__rasd.port.postMessage({ kind: 'ping' }) } catch (e) { /* الانقطاع يُرصد */ }
  }, ${PING_EVERY_MS})
  return true
})()`)
ok('قناة keepalive مفتوحة من صفحة الإضافة')

// ── 4) القياس على مدى 45 ثانية ────────────────────────────────────
const ping = async () =>
  JSON.parse(
    await inPage(`chrome.runtime.sendMessage({
      __rasd: 1, type: 'diagnostics/ping', payload: null, id: 'probe'
    }).then((r) => JSON.stringify(r))`),
  )

const first = await ping()
if (!first?.ok) {
  fail(`diagnostics/ping فشل في البداية: ${JSON.stringify(first)}`)
  finish(1)
}
ok(`الـservice worker يستجيب — نسخة ${first.value.version}، قنوات مفتوحة ${first.value.openPorts}`)

const startedAt = Date.now()
let lastUptime = first.value.uptimeMs
const uptimes = []

while (Date.now() - startedAt < SURVIVE_MS) {
  await new Promise((r) => setTimeout(r, 5000))
  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  try {
    const reply = await ping()
    if (!reply?.ok) {
      fail(`الـservice worker توقّف عن الاستجابة عند ${elapsed} ثانية`)
      break
    }
    lastUptime = reply.value.uptimeMs
    uptimes.push(Math.round(lastUptime / 1000))
    process.stdout.write(`\r  … ${elapsed}s — عمر العامل ${Math.round(lastUptime / 1000)}s   `)
  } catch (e) {
    fail(`انقطع الاتصال عند ${elapsed} ثانية: ${e.message}`)
    break
  }
}
process.stdout.write('\r' + ' '.repeat(64) + '\r')

const state = JSON.parse(
  await inPage('JSON.stringify({ pongs: window.__rasd.pongs, drops: window.__rasd.drops })'),
)

// الدليل الحاسم: النسخة نفسها عاشت 45 ثانية — عدّاد العمر لم يُصفَّر.
lastUptime >= SURVIVE_MS
  ? ok(
      `نسخة الـservice worker نفسها عاشت ${Math.round(lastUptime / 1000)} ثانية (المطلوب ${SURVIVE_MS / 1000})`,
    )
  : fail(`عمر العامل ${Math.round(lastUptime / 1000)}s < ${SURVIVE_MS / 1000}s — أُعيد تشغيله`)

state.drops === 0 ? ok('القناة لم تنقطع ولا مرّة') : fail(`القناة انقطعت ${state.drops} مرّة`)

state.pongs >= 2
  ? ok(`الطرف المضيف ردّ على النبضات — ${state.pongs} pong`)
  : fail(`عدد الـpong ${state.pongs} — أقلّ من المتوقّع`)

const monotonic = uptimes.every((u, i) => i === 0 || u >= uptimes[i - 1])
monotonic
  ? ok(`عمر العامل يتزايد دائمًا — لا إعادة تشغيل صامتة (${uptimes.join('s · ')}s)`)
  : fail(`عمر العامل تراجع — أُعيد تشغيله أثناء القياس (${uptimes.join(' · ')})`)

sock.close()
finish(0)
