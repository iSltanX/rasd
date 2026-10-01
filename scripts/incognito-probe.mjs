#!/usr/bin/env node
/**
 * قياس عابر لا حارس: **قيمة `chrome.extension.inIncognitoContext` داخل عامل نسخة التصفّح الخاص** (`STAGES/25`، الصفّ
 * 121 في `Docs/Engineering.md §6`).
 *
 * البيان يعلن `incognito: "split"`، فللتصفّح الخاص عاملٌ ثانٍ منفصل، و`isIncognitoContext()` (`shared/env.ts`) تقرأ
 * هذه الواجهة فيه لتحجب الحفظ (`storage/db.ts`). وكان ما بقي غير مقيس قيمتَها هناك: إذن التصفّح الخاص لإضافةٍ غير
 * مثبَّتة لا يُمنح من سطر الأوامر. **والطريق المقيس:** `chrome.developerPrivate.updateExtensionConfiguration` من صفحة
 * `chrome://extensions` يمنحه — فيُعطِّل الإضافة المحمَّلة من بروتوكول DevTools (إعادة التحميل تُسقطها)، ثمّ
 * `chrome.management.setEnabled` يعيدها، فيولد عاملها الثاني في سياق المتصفّح الخاص.
 *
 * يطبع القيمة في كل عامل ويخرج بـ0 إن كانت `false` في العادي و`true` في الخاص — وإلا 1. لا يأخذ قفل الحرّاس:
 * منفذه (9398) خارج منافذها، ويُعاد يدويًّا عند أي تغيير في `shared/env.ts` أو في حقل `incognito` من البيان.
 *
 *     pnpm build:bundle && node scripts/incognito-probe.mjs
 */
import { rmSync } from 'node:fs'

import { connectCdp, DIST, evaluator, findChrome, launchChrome, loadExtension } from './lib/cdp.mjs'

const PORT = 9398
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = findChrome()
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}
const run = launchChrome({ chrome, port: PORT, prefix: 'incognito' })
const stop = (code) => {
  run.proc.kill('SIGKILL')
  rmSync(run.profile, { recursive: true, force: true })
  process.exit(code)
}
setTimeout(() => {
  console.error('✗ تجاوز القياس دقيقة.')
  stop(1)
}, 60_000).unref()
// كروم لا يبقى يتيمًا على منفذه إن رمى القياس.
process.on('uncaughtException', (e) => {
  console.error(`✗ ${e.message}`)
  stop(1)
})

const conn = await connectCdp(PORT)
if (!conn) stop(1)
const { send } = conn
const { id, error } = await loadExtension(send, DIST)
if (!id) {
  console.error(`✗ Chrome رفض الحزمة: ${error}`)
  stop(1)
}

const attach = async (targetId) => {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  return evaluator(send, sessionId)
}

const page = await attach(
  (await send('Target.createTarget', { url: `chrome://extensions/?id=${id}` })).targetId,
)
await sleep(1500)
const call = (expr) =>
  page(`new Promise((res) => ${expr}, () => res(chrome.runtime.lastError?.message ?? 'ok')))`)
console.log(
  `منح التصفّح الخاص: ${await call(`chrome.developerPrivate.updateExtensionConfiguration({ extensionId: '${id}', incognitoAccess: true }`)}`,
)
await sleep(1000)
console.log(`إعادة التفعيل: ${await call(`chrome.management.setEnabled('${id}', true`)}`)

// نسخة التصفّح الخاص لا تولد قبل أن يُطلب سياقها: نافذةٌ خاصّة من العامل العادي تُنشئه (في وضع بلا رأس تُعيد
// `null` نافذةً، والسياق يولد وعامله معه — مقيسًا).
// والعامل يُنتظر حيًّا: هدفُ العامل السابق للتعطيل قد يبقى في القائمة لحظةً بلا `chrome`.
for (let i = 0; i < 40; i++) {
  const regular = (await send('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`),
  )
  const opened = regular
    ? await (
        await attach(regular.targetId)
      )(
        `typeof chrome === 'undefined' ? 0 : chrome.windows.create({ incognito: true, url: 'about:blank' }).then(() => 1, () => 1)`,
      ).catch(() => 0)
    : 0
  if (opened) break
  await sleep(250)
}

let workers = []
for (let i = 0; i < 40 && workers.length < 2; i++) {
  await sleep(250)
  workers = (await send('Target.getTargets')).targetInfos.filter(
    (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`),
  )
}
const values = []
for (const w of workers) {
  const value = await (await attach(w.targetId))('chrome.extension?.inIncognitoContext ?? null')
  values.push(value)
  console.log(`  عامل في السياق ${w.browserContextId.slice(0, 8)}: inIncognitoContext = ${value}`)
}

const measured = values.length === 2 && values.includes(true) && values.includes(false)
console.log(
  measured
    ? '\n✓ عاملان منفصلان: العادي false والخاص true — `isIncognitoContext()` تصدق في الاثنين.'
    : `\n✗ لم يُقَس الزوج المتوقَّع: ${JSON.stringify(values)}`,
)
stop(measured ? 0 : 1)
