#!/usr/bin/env node
/**
 * مسبار مسح التباين — هل «دقّق تباين الصفحة» على الخمسة آلاف نصّ يكتمل في المتصفّح؟ وكيف يتصرّف إن غاب التبويب؟
 *
 *   node scripts/audit-scan-probe.mjs --browser=brave            # تبويبٌ ظاهر: يجب أن يكتمل (phase=done) فيخرج 0
 *   node scripts/audit-scan-probe.mjs --browser=brave --hidden   # تبويبٌ يُخفيه تبويبٌ أحدث: يُسجَّل ما يحدث ولا يُحكم به
 *   CHROME_PATH=<مسار> node scripts/audit-scan-probe.mjs
 *
 * **لماذا هذا المسبار.** حارس `colour` يعلّق عند قسمه الخامس عشر (مسح الخمسة آلاف) في Brave وOpera حتى حدّه 300ث
 * (`Docs/Launch/browsers.md` ⁸ ⁹)، فبقي السؤال: عطلٌ في المنتَج أم في الأداة؟ هنا المسح نفسه (`audit.state` في الطبقة) بنقرتيه
 * («دقّق» ثمّ «ابدأ»)، لكن التبويب **يُفعَّل صراحةً** ولا يُنتظر فيه إطارٌ (`requestAnimationFrame`) — وهو ما يفعله حارسٌ
 * يرتبط بتبويبٍ مخفيّ فيعلّق في انتظار إطارٍ لا يأتي. `--hidden` يُنشئ تبويبًا أحدث فوقه فيُخفيه، ليُرى ما يفعله المنتَج حينئذٍ.
 *
 * **ليس حارسًا:** لا يدخل سجلّ الترقية ولا يُشغَّل في البوّابة. منفذه 9396 وصفحة العيّنة على 5415، وبديلٌ واحد للقياس كما في
 * `chromium-probe.mjs`: `host_permissions: ["<all_urls>"]` مكان إيماءة `activeTab`.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { BASE_CHROME_FLAGS, connectCdp, loadExtension } from './lib/cdp.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const KNOWN = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  opera: '/Applications/Opera.app/Contents/MacOS/Opera',
  vivaldi: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
}
const args = process.argv.slice(2)
const name = args.find((a) => a.startsWith('--browser='))?.slice(10)
const hidden = args.includes('--hidden')
const BIN = process.env.CHROME_PATH ?? KNOWN[name]
const PORT = 9396
const PAGE_PORT = 5415
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!BIN || !existsSync(BIN)) {
  console.error(`✗ لا متصفّح: --browser=${Object.keys(KNOWN).join('|')} أو CHROME_PATH.`)
  process.exit(2)
}
const DIST = join(ROOT, 'dist')
if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('✗ لا بناء — شغّل `pnpm build:bundle` أولًا.')
  process.exit(2)
}

const SITES = join(ROOT, 'tests', 'fixtures', 'sites')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const path = normalize(join(SITES, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  const file = path.endsWith('/') ? join(path, 'index.html') : path
  if (!file.startsWith(SITES) || !existsSync(file)) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(PAGE_PORT, '127.0.0.1')

const ext = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-audit-probe-ext-')))
cpSync(DIST, ext, { recursive: true })
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'))
manifest.host_permissions = ['<all_urls>']
delete manifest.optional_host_permissions
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest))
const profile = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-audit-probe-')))
const proc = spawn(
  BIN,
  [
    ...BASE_CHROME_FLAGS,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1366,768',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let exitCode = 1
try {
  const conn = await connectCdp(PORT)
  if (!conn) throw new Error('تعذّر الاتصال بـDevTools')
  const { send } = conn
  const product = (await send('Browser.getVersion')).product
  console.log(`${name ?? 'chromium'} — ${product} — ${hidden ? 'التبويب مخفيّ' : 'التبويب ظاهر'}`)
  const loaded = await loadExtension(send, ext)
  if (loaded.error) throw new Error(`رفض التحميل: ${loaded.error}`)
  await sleep(2000)

  const open = async (url) => {
    const { targetId } = await send('Target.createTarget', { url })
    await sleep(2500)
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    return sessionId
  }
  /** تقييمٌ بمهلة — التبويب المخفيّ قد لا يردّ. */
  const evaluate = async (sessionId, expression, ms = 30_000) => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId),
      sleep(ms).then(() => null),
    ])
    if (!r) return null
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'استثناء')
    return r.result.value
  }

  const popup = await open(`chrome-extension://${loaded.id}/src/pages/popup/index.html`)
  const url = `http://127.0.0.1:${PAGE_PORT}/contrast-5000/`
  const tabId = await evaluate(
    popup,
    `chrome.tabs.create({ url: '${url}', active: true }).then((t) => new Promise((res) => { const check = () => chrome.tabs.get(t.id).then((x) => (x.status === 'complete' ? res(t.id) : setTimeout(check, 100)), () => res(null)); check() }))`,
  )
  await sleep(1500)
  const inOverlay = (fn) =>
    evaluate(
      popup,
      `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, world: 'ISOLATED', func: ${fn} }).then((r) => r[0].result)`,
    )
  await evaluate(
    popup,
    `chrome.scripting.executeScript({ target: { tabId: ${tabId}, allFrames: true }, files: ['content.js'] }).then(() => true)`,
  )
  const started = await inOverlay(
    `() => globalThis.__rasdContent.startOverlay().then((r) => { if (r.ok) globalThis.__rasdColour = r.value; return r.ok })`,
  )
  if (!started) throw new Error('لم تبدأ الطبقة')
  await inOverlay(`() => { globalThis.__rasdColour.modes.set('inspect'); return true }`)
  await sleep(800)
  const tap = (id) =>
    inOverlay(
      `() => { const el = globalThis.__rasdColour.host.layer.querySelector('[data-rasd-ov="${id}"]'); if (!el) return false; el.click(); return true }`,
    )
  if (!(await tap('audit-open'))) throw new Error('لا مدخل «دقّق تباين الصفحة»')
  await sleep(500)
  if (hidden) {
    // تبويبٌ أحدث يُخفي تبويب الصفحة — فيُخنَق فيه `requestAnimationFrame`.
    await send('Target.createTarget', { url: 'about:blank' })
    await sleep(500)
  }
  if (!(await tap('audit-start'))) throw new Error('لا زرّ «ابدأ»')

  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < 30_000) {
    last = await inOverlay(
      `() => { const a = globalThis.__rasdColour.audit.state; return { phase: a.phase.value, done: a.done.value, total: a.total.value, elapsed: a.elapsed.value } }`,
    )
    if (!last || last.phase !== 'scanning') break
    await sleep(500)
  }
  console.log(`+${Math.round((Date.now() - t0) / 1000)}ث ${JSON.stringify(last)}`)
  if (hidden) {
    console.log('· تبويبٌ مخفيّ: يُسجَّل ما حدث ولا يُحكم به.')
    exitCode = 0
  } else if (last?.phase === 'done' && last.total === 5000) {
    console.log(`✓ المسح اكتمل: 5000 نصّ في ${Math.round(last.elapsed)}ms`)
    exitCode = 0
  } else {
    console.log('✗ المسح لم يكتمل في تبويبٍ ظاهر')
  }
} catch (e) {
  console.error(`✗ ${e.message.split('\n')[0]}`)
} finally {
  proc.kill('SIGKILL')
  server.close()
  rmSync(profile, { recursive: true, force: true })
  rmSync(ext, { recursive: true, force: true })
  process.exit(exitCode)
}
