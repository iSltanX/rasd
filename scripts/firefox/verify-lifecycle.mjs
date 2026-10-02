#!/usr/bin/env node
/**
 * حارس Firefox `lifecycle` — قناة `rasd:keepalive` المفتوحة تُبقي صفحة الأحداث حيّةً أطول من مهلة خمولها.
 *
 * نظير `scripts/verify-lifecycle.mjs` فوق `scripts/lib/bidi.mjs` (SS7). في Firefox الخلفية **صفحة أحداث** لا عامل خدمة،
 * وتُطفأ عند الخمول كالعامل: قِيس في Firefox 157 أنها تتوقّف عند ≈30 ثانية بلا قناة (`backgroundState: stopped`)، وأن
 * الرسالة التالية تقلع نسخةً جديدة (`uptimeMs` ≈ 4ms)؛ ومع القناة تبقى `running` والنسخة نفسها تعيش.
 *
 * **ولا نبض من الحارس نفسه:** `diagnostics/ping` حدثٌ في الخلفية يصفّر مؤقّت خمولها، فيُرسَل مرّتين وحدهما — أوّل
 * القياس وآخره. والقناة تنبض كما ينبض المنتج (`HEARTBEAT_MS` في `contract.ts`، كل عشرين ثانية من `port.ts`). وشاهدان
 * لا شاهد: عمر النسخة من الإضافة (`uptimeMs`)، وحالة الخلفية من Firefox نفسه (`ExtensionParent` في سياق المتصفّح).
 *   1. القناة تُفتح من صفحة إضافة، والخلفية تعدّها (`openPorts`).
 *   2. على مدى 50 ثانية بلا رسالة: الخلفية `running` في كل عيّنة عند Firefox.
 *   3. آخر ping: النسخة نفسها عاشت ≥ 45 ثانية (العمر لم يُصفَّر)، والقناة لم تنقطع وردّت على نبضاتها.
 *
 *   pnpm build:firefox && pnpm firefox:lifecycle
 *   RASD_BREAK_KEEPALIVE=1 pnpm firefox:lifecycle                     # السالب المسمّى: بلا قناة تُطفأ الخلفية — يجب أن يسقط
 *   RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:lifecycle   # السالب: يجب أن يسقط
 */
import { startGuard } from '../lib/bidi.mjs'

const PORT = 9242
const SURVIVE_MS = 45_000
const WATCH_MS = 50_000
const HEARTBEAT_MS = 20_000
const BREAK = process.env.RASD_BREAK_KEEPALIVE === '1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'lifecycle',
  port: PORT,
  title: '── حارس Firefox: بقاء صفحة الأحداث مع قناةٍ مفتوحة ──',
  hardTimeoutMs: 150_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (BREAK) note('سالبٌ مسمّى: لا قناة تُفتح — يجب أن تُطفأ الخلفية ويحمرّ الحارس')
if (!g.extId || !g.ext) await g.abort()

/** حالة الخلفية كما يراها Firefox — `running` · `stopped` · …، أو `?` إن لم تُقرأ (واجهةٌ داخلية قد تتغيّر). */
const backgroundState = () =>
  g
    .inChrome(
      `(() => {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs')
      return String(ExtensionParent.GlobalManager.getExtension(${JSON.stringify(g.extId)})?.backgroundState ?? '?')
    })()`,
    )
    .catch(() => '?')

// ── 1) القناة ────────────────────────────────────────────────────
if (!BREAK) {
  await g.ext(`(() => {
    window.__keep = { pongs: 0, drops: 0 }
    const port = chrome.runtime.connect({ name: 'rasd:keepalive' })
    port.onMessage.addListener((m) => { if (m && m.kind === 'pong') window.__keep.pongs++ })
    port.onDisconnect.addListener(() => window.__keep.drops++)
    setInterval(() => { try { port.postMessage({ kind: 'ping' }) } catch {} }, ${HEARTBEAT_MS})
    return true
  })()`)
}
const first = await g.message('diagnostics/ping').catch((e) => ({ ok: false, error: e.message }))
if (!first?.ok) await g.abort(`diagnostics/ping فشل في البداية: ${JSON.stringify(first)}`)
BREAK || first.value.openPorts >= 1
  ? ok(`الخلفية تستجيب — نسخة ${first.value.version}، قنوات مفتوحة ${first.value.openPorts}`)
  : fail(`القناة لم تُعدّ في الخلفية: ${JSON.stringify(first.value)}`)

// ── 2) العيّنات ──────────────────────────────────────────────────
const samples = []
const started = Date.now()
while (Date.now() - started < WATCH_MS) {
  await sleep(10_000)
  samples.push(await backgroundState())
}
const known = samples.filter((s) => s !== '?')
if (known.length === 0) {
  note(`حالة الخلفية لم تُقرأ من Firefox (${samples.join(' · ')}) — الحكم على العمر وحده`)
} else {
  known.every((s) => s === 'running')
    ? ok(`الخلفية running في كل عيّنة عند Firefox (${samples.join(' · ')})`)
    : fail(`الخلفية لم تبقَ حيّة عند Firefox: ${samples.join(' · ')}`)
}

// ── 3) العمر والقناة ─────────────────────────────────────────────
const last = await g.message('diagnostics/ping').catch((e) => ({ ok: false, error: e.message }))
if (!last?.ok) {
  fail(`diagnostics/ping فشل في النهاية: ${JSON.stringify(last)}`)
} else {
  last.value.uptimeMs >= SURVIVE_MS && last.value.uptimeMs > first.value.uptimeMs
    ? ok(
        `النسخة نفسها عاشت ${Math.round(last.value.uptimeMs / 1000)} ثانية (المطلوب ${SURVIVE_MS / 1000})`,
      )
    : fail(
        `عمر الخلفية ${Math.round(last.value.uptimeMs / 1000)}s < ${SURVIVE_MS / 1000}s — أُطفئت وأُعيد إقلاعها`,
      )
}
if (!BREAK) {
  const keep = JSON.parse(await g.ext('JSON.stringify(window.__keep)'))
  keep.drops === 0 && keep.pongs >= 2
    ? ok(`القناة لم تنقطع، والخلفية ردّت على ${keep.pongs} نبضة`)
    : fail(`القناة: انقطعت ${keep.drops} مرّة وردّت على ${keep.pongs} نبضة`)
}

const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({
  success: '✓ القناة المفتوحة تُبقي صفحة الأحداث حيّةً في Firefox أطول من مهلة خمولها.',
})
