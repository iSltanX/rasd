#!/usr/bin/env node
/**
 * مسبار Chromium — رحلة رصد في متصفّحٍ تُعجز توقيتاتُه نواةَ الحرّاس (`Docs/Launch/browsers.md`).
 *
 *   pnpm zip && node scripts/chromium-probe.mjs --browser=vivaldi --shots
 *   CHROME_PATH=<مسار> node scripts/chromium-probe.mjs         # أي Chromium آخر
 *
 * **لماذا لا الحرّاس.** نواتها (`scripts/lib/cdp.mjs`) ترتبط بالتبويب فور إنشائه، وVivaldi — وواجهته نفسها إضافةٌ
 * داخلية — لا يعيد ذلك النداء (قِيس: «فتح صفحة الإضافات» بلا ردٍّ خمس عشرة ثانية، ويعود بعد مهلة ثلاث ثوانٍ). فهنا
 * الرحلة نفسها التي يقيسها `scripts/firefox-probe.mjs` في Firefox، بمهلٍ صريحة: الحزمة المضغوطة مفكوكةً، والصفحات،
 * والخلفية، والحقن، والقياس بمؤشّرٍ حقيقي، والفحص، والالتقاط الظاهر والكامل، والمحرّر. **وليس حارسًا:** لا يدخل سجلّ
 * الترقية ولا يُشغَّل في البوّابة؛ منفذه 9399، وصفحة العيّنة على 5413.
 *
 * وبديلٌ واحد للقياس كما في حرّاس كروم: `host_permissions: ["<all_urls>"]` في النسخة المفكوكة مكان إيماءة `activeTab`
 * — لا أتمتة تنقر أيقونة الشريط.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
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

import { connectCdp, launchChrome, loadExtension } from './lib/cdp.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const KNOWN = {
  vivaldi: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
  opera: '/Applications/Opera.app/Contents/MacOS/Opera',
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}
const args = process.argv.slice(2)
const name = args.find((a) => a.startsWith('--browser='))?.slice(10)
const shots = args.includes('--shots')
const BIN = process.env.CHROME_PATH ?? KNOWN[name]
const PORT = 9399
const PAGE_PORT = 5413
const SHOTS = join(ROOT, 'artifacts', 'browsers', name ?? 'chromium')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!BIN || !existsSync(BIN)) {
  console.error(`✗ لا متصفّح: --browser=${Object.keys(KNOWN).join('|')} أو CHROME_PATH.`)
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const zip = join(ROOT, 'dist-zip', `rasd-${pkg.version}.zip`)
if (!existsSync(zip)) {
  console.error('✗ لا حزمة في dist-zip/ — شغّل `pnpm zip` أولًا.')
  process.exit(1)
}

const SITES = join(ROOT, 'tests', 'fixtures', 'sites')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
const server = createServer((req, res) => {
  const path = normalize(join(SITES, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  const file = path.endsWith('/') ? join(path, 'index.html') : path
  if (!file.startsWith(SITES) || !existsSync(file)) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(PAGE_PORT, '127.0.0.1')
const PAGE = `http://127.0.0.1:${PAGE_PORT}/rtl-ar/index.html`

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-chromium-probe-')))
execFileSync('unzip', ['-q', zip, '-d', dir])
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
manifest.host_permissions = ['<all_urls>']
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

const report = []
const line = (mark, text) => report.push(`  ${mark} ${text}`)
const run = launchChrome({
  chrome: BIN,
  port: PORT,
  prefix: 'chromium-probe',
  args: ['--window-size=1366,768', '--lang=ar'],
})

const timed = (label, promise, ms = 20_000) =>
  Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`مهلة ${ms / 1000} ثانية في «${label}»`)
    }),
  ])

try {
  const conn = await connectCdp(PORT)
  if (!conn) throw new Error(`تعذّر الاتصال ببروتوكول DevTools.\n${run.stderrTail()}`)
  const { send } = conn
  const version = await send('Browser.getVersion')
  report.push(
    `\nمسبار Chromium — ${version.product} · ${version.userAgent.match(/(?:Headless)?Chrome\/[\d.]+/)?.[0] ?? ''}`,
  )

  /** تبويبٌ بمهلةٍ قبل الارتباط — ما لا تفعله النواة، وما يحتاجه Vivaldi. */
  const open = async (url) => {
    const { targetId } = await timed('إنشاء التبويب', send('Target.createTarget', { url }))
    await sleep(3000)
    const { sessionId } = await timed(
      'الارتباط',
      send('Target.attachToTarget', { targetId, flatten: true }),
    )
    return { targetId, sessionId }
  }
  const evaluate = async (sessionId, expression, ms) => {
    const r = await timed(
      'التقييم',
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId),
      ms,
    )
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text,
      )
    return r.result.value
  }
  const shot = async (sessionId, file) => {
    if (!shots) return
    const { data } = await timed(
      'اللقطة',
      send('Page.captureScreenshot', { format: 'png' }, sessionId),
    )
    mkdirSync(SHOTS, { recursive: true })
    writeFileSync(join(SHOTS, `${file}.png`), Buffer.from(data, 'base64'))
    line('·', `لقطة: ${join('artifacts', 'browsers', name ?? 'chromium', `${file}.png`)}`)
  }
  const step = async (label, fn) => {
    try {
      const v = await fn()
      line(
        '✓',
        `${label}${v === undefined ? '' : ` — ${(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 320)}`}`,
      )
      return v
    } catch (e) {
      line('✗', `${label} — ${e.message.split('\n')[0]}`)
      return null
    }
  }

  const loaded = await step('التحميل', async () => {
    const r = await timed('التحميل', loadExtension(send, dir))
    if (r.error) throw new Error(r.error)
    return r.id
  })
  if (loaded) {
    await sleep(2000)
    const base = `chrome-extension://${loaded}/`
    const ext = await step(
      'صفحة الإضافات تُفتح',
      async () => (await open('chrome://extensions/')).sessionId,
    )
    if (ext) {
      // وضع المطوّر أوّلًا: بدونه لا يجمع المتصفّح أخطاء التشغيل، فتُقرأ في آخر الرحلة لا «صفرًا» أعمى.
      await step('وضع المطوّر لجمع أخطاء التشغيل', () =>
        evaluate(
          ext,
          `chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }).then(() => chrome.developerPrivate.getProfileConfiguration()).then((c) => String(c.inDeveloperMode))`,
        ),
      )
    }
    const popup = await step(
      'النافذة تُفتح في تبويب',
      async () => (await open(`${base}src/pages/popup/index.html`)).sessionId,
    )
    if (popup) {
      await step('النافذة ترسم واجهتها', () =>
        evaluate(
          popup,
          `JSON.stringify({ title: document.title, text: document.body.innerText.trim().length, dir: document.documentElement.dir, buttons: document.querySelectorAll('button').length })`,
        ),
      )
      await step('الخلفية تردّ على رسائل رصد (capture/latest)', () =>
        evaluate(
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#1' }).then((r) => JSON.stringify(r))`,
        ),
      )
      await step('الاختصارات المسجَّلة', () =>
        evaluate(
          popup,
          `chrome.commands.getAll().then((c) => c.map((x) => x.name + '=' + (x.shortcut || '∅')).join(' · '))`,
        ),
      )
      await shot(popup, 'popup')
    }
    for (const [label, path] of [
      ['المكتبة', 'src/pages/library/index.html'],
      ['الإعدادات', 'src/pages/settings/index.html'],
    ]) {
      const s = await step(`${label} تُفتح`, async () => (await open(`${base}${path}`)).sessionId)
      if (!s) continue
      await sleep(1500)
      await step(`${label} ترسم واجهتها`, () =>
        evaluate(
          s,
          `JSON.stringify({ title: document.title, text: document.body.innerText.trim().length })`,
        ),
      )
      await shot(s, path.split('/')[2])
    }

    // هوية المتصفّح في البلاغ (SS2): تُقرأ من صفّ «ما سيُرسَل» في نافذة البلاغ نفسها لا من استنتاجٍ خارجها — ما يراه
    // المستخدم هو ما يُرسَل. لا إرسال هنا: الخطوة الثالثة مراجعةٌ فقط.
    const reportTab = await step(
      'نافذة البلاغ تُفتح من رابط الإعدادات',
      async () =>
        (await open(`${base}src/pages/settings/index.html?section=about&report=1`)).sessionId,
    )
    if (reportTab) {
      await sleep(1500)
      await step('هوية المتصفّح في «ما سيُرسَل»', () =>
        evaluate(
          reportTab,
          `(async () => {
            const wait = async (ok, label) => { for (let i = 0; i < 100; i++) { if (ok()) return; await new Promise((r) => setTimeout(r, 100)) } throw new Error('لا ' + label) }
            const fill = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
            const click = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))?.click()
            await wait(() => document.getElementById('report-field-title'), 'نموذج البلاغ')
            fill('report-field-title', 'مسبار هوية المتصفّح'); fill('report-field-what', 'قراءةٌ فقط — لا إرسال')
            await new Promise((r) => setTimeout(r, 100))
            click('التالي: الصورة')
            await wait(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('التالي: المراجعة')), 'خطوة الصورة')
            click('التالي: المراجعة')
            await wait(() => document.querySelector('[data-report-key="diagnostics.browser_id"]'), 'صفّ browser_id')
            const row = (k) => document.querySelector('[data-report-key="diagnostics.' + k + '"]')?.lastElementChild.textContent.replace(/[\u2066-\u2069]/g, '')
            const out = { browser: row('browser'), browser_id: row('browser_id'), engine: row('engine'), build_target: row('build_target'), install_source: row('install_source') }
            const expected = ${JSON.stringify(name === 'vivaldi' ? 'chromium' : (name ?? null))}
            if (!out.browser_id || out.browser_id === 'unknown' || (expected && out.browser_id !== expected)) throw new Error('browser_id ' + out.browser_id + ' والمتوقَّع ' + (expected ?? 'معروف') + ': ' + JSON.stringify(out))
            return JSON.stringify(out)
          })()`,
          30_000,
        ),
      )
    }

    // SS4: كل أمرٍ بلا اختصار فعلي يعرض رابط «أسنده من صفحة الاختصارات»، والرابط يفتح صفحة الاختصارات في هذا المتصفّح
    // (Opera وEdge وVivaldi تحوّل `chrome://` — يُقاس هنا لا يُفترض).
    const sheet = await step(
      'ورقة الاختصارات: الأوامر غير المسنَدة تعرض الرابط',
      async () => (await open(`${base}src/pages/library/index.html`)).sessionId,
    )
    if (sheet) {
      await sleep(1500)
      await step('عدد الروابط = عدد الأوامر بلا اختصار', () =>
        evaluate(
          sheet,
          `chrome.commands.getAll().then(async (all) => {
            const names = ['capture-area', 'capture-element', 'capture-viewport', 'capture-full-page']
            const unassigned = names.filter((n) => !all.find((c) => c.name === n)?.shortcut).length
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
            await new Promise((r) => setTimeout(r, 500))
            const links = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'أسنده من صفحة الاختصارات').length
            if (links !== unassigned) throw new Error('روابط ' + links + ' وأوامر بلا اختصار ' + unassigned)
            return JSON.stringify({ unassigned, links })
          })`,
        ),
      )
      await shot(sheet, 'shortcuts-sheet')
      await step('الرابط يفتح صفحة الاختصارات', async () => {
        const clicked = await evaluate(
          sheet,
          `(() => { const all = [...document.querySelectorAll('button')]; const link = all.find((x) => x.textContent === 'أسنده من صفحة الاختصارات'); const b = link ?? all.find((x) => x.textContent.includes('غيّر اختصارات الالتقاط')); if (!b) throw new Error('لا رابط ولا زرّ التغيير'); b.click(); return link ? 'نُقر الرابط' : 'نُقر زرّ التغيير (كلّها مسنَدة)' })()`,
        )
        await sleep(2500)
        const { targetInfos } = await send('Target.getTargets')
        const hit = targetInfos.find((t) =>
          /^(chrome|opera|edge|vivaldi|brave):\/\/extensions\/shortcuts/u.test(t.url),
        )
        if (!hit)
          throw new Error(
            `لا تبويب لصفحة الاختصارات — ${targetInfos
              .map((t) => t.url)
              .filter((u) => !u.startsWith('http'))
              .join(' · ')}`,
          )
        return `${clicked} ⇐ ${hit.url}`
      })
    }

    const page = await step('صفحة موقعٍ عاديّ (http)', async () => open(PAGE))
    if (page && popup) {
      const tabId = await step('معرّف التبويب', () =>
        evaluate(popup, `chrome.tabs.query({ url: '${PAGE}' }).then((t) => t[0]?.id ?? null)`),
      )
      const activate = (tool, id) =>
        evaluate(
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: '${tool}', tabId: ${tabId} }, id: 'probe#${id}' }).then((r) => JSON.stringify(r))`,
          30_000,
        )
      await send('Target.activateTarget', { targetId: page.targetId })
      await step('تفعيل القياس كما تفعل النافذة (tool/activate)', () => activate('measure', 2))
      await sleep(1500)
      await step('الطبقة في الصفحة', () =>
        evaluate(
          page.sessionId,
          `JSON.stringify([...document.documentElement.children].filter((e) => e.hasAttribute('popover')).map((e) => ({ open: e.matches(':popover-open'), w: Math.round(e.getBoundingClientRect().width) })))`,
        ),
      )
      const cards = await step('بطاقتان في العيّنة', () =>
        evaluate(
          page.sessionId,
          `JSON.stringify([...document.querySelectorAll('.card')].slice(0, 2).map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] }))`,
        ).then(JSON.parse),
      )
      const mouse = async (type, [x, y]) =>
        send(
          'Input.dispatchMouseEvent',
          {
            type,
            x,
            y,
            button: type === 'mouseMoved' ? 'none' : 'left',
            clickCount: type === 'mouseMoved' ? 0 : 1,
          },
          page.sessionId,
        )
      if (cards) {
        await step('القياس: نقرٌ على عنصر ثمّ مرورٌ فوق آخر', async () => {
          await mouse('mouseMoved', cards[0])
          await mouse('mousePressed', cards[0])
          await mouse('mouseReleased', cards[0])
          await sleep(200)
          await mouse('mouseMoved', [cards[1][0] - 20, cards[1][1]])
          await mouse('mouseMoved', cards[1])
          await sleep(500)
        })
        await shot(page.sessionId, 'overlay-measure')
        await step('تبديل الأداة إلى الفحص', () => activate('inspect', 3))
        await sleep(800)
        await step('الفحص: مرورٌ ثمّ نقر', async () => {
          await mouse('mouseMoved', [cards[1][0] - 30, cards[1][1] - 20])
          await mouse('mouseMoved', cards[1])
          await sleep(400)
          await mouse('mousePressed', cards[1])
          await mouse('mouseReleased', cards[1])
          await sleep(800)
        })
        await shot(page.sessionId, 'overlay-inspect')
      }
      await step('التقاط الجزء الظاهر كما تفعل النافذة', () => activate('viewport', 4))
      await sleep(4000)
      await step('آخر لقطة في المكتبة', () =>
        evaluate(
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#5' }).then((r) => JSON.stringify(r))`,
        ),
      )
      await step('التقاط الصفحة كاملة', () => activate('full-page', 6))
      await sleep(8000)
      const full = await step('آخر لقطة بعد الالتقاط الكامل', () =>
        evaluate(
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#7' }).then((r) => JSON.stringify(r))`,
        ),
      )
      const id = JSON.parse(full ?? 'null')?.value?.id
      if (id) {
        const editor = await step(
          'المحرّر يفتح اللقطة',
          async () => (await open(`${base}src/pages/editor/index.html?capture=${id}`)).sessionId,
        )
        if (editor) {
          await sleep(2000)
          await step('المحرّر يرسم اللقطة', () =>
            evaluate(
              editor,
              `JSON.stringify({ title: document.title, canvases: [...document.querySelectorAll('canvas')].map((c) => c.width + '×' + c.height) })`,
            ),
          )
          await shot(editor, 'editor')
        }
      }
    }
    if (ext) {
      await step('بعد الرحلة: تحذيرات التثبيت وأخطاء البيان والتشغيل', () =>
        evaluate(
          ext,
          `chrome.developerPrivate.getExtensionInfo(${JSON.stringify(loaded)}).then((x) => { const errors = x.runtimeErrors.filter((e) => e.severity === 'ERROR'); if (x.installWarnings.length + x.manifestErrors.length + errors.length > 0) throw new Error(JSON.stringify({ installWarnings: x.installWarnings, manifestErrors: x.manifestErrors.map((e) => e.message), runtimeErrors: errors.map((e) => e.message) })); return JSON.stringify({ state: x.state, installWarnings: 0, manifestErrors: 0, runtimeErrors: 0, consoleWarnings: x.runtimeErrors.length - errors.length, distinct: [...new Set(x.runtimeErrors.filter((e) => e.severity !== 'ERROR').map((e) => e.message.replace(/'[^']*'/g, "'…'")))] }) })`,
        ),
      )
    }
  }
  conn.close()
} catch (e) {
  line('✗', e.message.split('\n')[0])
} finally {
  run.proc.kill('SIGKILL')
  await sleep(500)
  rmSync(run.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  rmSync(dir, { recursive: true, force: true })
  server.close()
}
console.log(report.join('\n'))
process.exit(report.some((l) => l.startsWith('  ✗')) ? 1 : 0)
