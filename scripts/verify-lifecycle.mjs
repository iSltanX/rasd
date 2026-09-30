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
 *
 * الإقلاع والاتصال والتحميل والارتباط والمهلة الصلبة والتنظيف في النواة المشتركة
 * (`scripts/lib/cdp.mjs`، `STAGES/17`)؛ وأحكام هذا الملفّ هنا كما كانت.
 *
 *   pnpm verify:lifecycle
 */

import { PAGE_PATHS } from '../src/shared/page-paths.ts'

import { findAndAttach, startGuard, waitForExtensionContext } from './lib/cdp.mjs'

const PORT = 9388

/** مدّة الصمود المطلوبة — أطول من مهلة الخمول بمقدار النصف. */
const SURVIVE_MS = 45_000
/** فاصل النبضة من الصفحة. يطابق `HEARTBEAT_MS` في المصدر. */
const PING_EVERY_MS = 20_000
/** حدّ أقصى مطلق حتى لا يعلّق الفحص أبدًا. */
const HARD_TIMEOUT_MS = 150_000

// الحزمة نفسها لا نسخة فحص: لا صلاحية مضيف تُضاف.
const g = await startGuard({
  prefix: 'life',
  port: PORT,
  title: 'فحص دورة حياة الـservice worker:',
  stage: false,
  serviceWorker: true,
  hardTimeoutMs: HARD_TIMEOUT_MS,
})
const { ok, fail } = g

/** يبحث عن الهدف **ويتّصل به في المحاولة نفسها** ويعيد مُقيِّمه — انظر `findAndAttach` في النواة. */
const attach = async (predicate) => {
  const found = await findAndAttach(g.send, predicate, { tries: 40, intervalMs: 250 })
  return found ? g.evaluate(found.sessionId) : null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
// رفض Chrome للحزمة سجّلته النواة: «Chrome رفض الحزمة: …».
if (!g.extId) await g.abort()
ok(`الحزمة محمَّلة — ${g.extId}`)
const ownOrigin = `chrome-extension://${g.extId}/`

// ── 1) الـservice worker ──────────────────────────────────────────
if (!g.sw) await g.abort('لم يستيقظ الـservice worker')
const inWorker = g.sw.evaluate
ok('الـservice worker يعمل')

// الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
await waitForExtensionContext(inWorker)

// ── 2) صفحة الإضافة، تُفتح من داخل الإضافة ────────────────────────
// التنقّل العلوي إلى صفحة إضافة من سياق خارجي يمنعه Chrome (ينتهي بـabout:blank)،
// و`chrome.tabs.create` من داخل العامل هو الطريق المعتمد.
await inWorker(
  `chrome.tabs.create({ url: chrome.runtime.getURL(${JSON.stringify(PAGE_PATHS.library)}) })`,
)

const inPage = await attach((t) => t.type === 'page' && String(t.url).startsWith(ownOrigin))
if (!inPage) await g.abort('لم تُفتح صفحة الإضافة')
ok('صفحة الإضافة مفتوحة')

const where = JSON.parse(
  await inPage(
    'JSON.stringify({ href: location.href, hasRuntime: typeof chrome !== "undefined" && !!chrome.runtime })',
  ),
)
if (!where.hasRuntime) await g.abort(`الصفحة لا ترى chrome.runtime — ${where.href}`)
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
if (!first?.ok) await g.abort(`diagnostics/ping فشل في البداية: ${JSON.stringify(first)}`)
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

await g.finish({ success: '✓ القناة المفتوحة تُبقي الـservice worker حيًّا أطول من مهلة الخمول.' })
