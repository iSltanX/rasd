#!/usr/bin/env node
/**
 * مسبار Firefox — يقيس أين تقف حزمة رصد في Firefox، ولا ينفّذ دعمه (`Docs/Firefox/firefox_rasd.md`).
 *
 *   pnpm zip && node scripts/firefox-probe.mjs              # الحزمة كما تُرفع، ثمّ النسخة التجريبية
 *   node scripts/firefox-probe.mjs --only=package           # الحزمة وحدها
 *   node scripts/firefox-probe.mjs --only=variant --shots   # التجريبية، ولقطاتها في artifacts/firefox/
 *
 * **مرحلتان.** (١) الحزمة المضغوطة كما هي: هل يقبلها Firefox، وما أوّل مانع. (٢) **نسخةٌ تجريبية في مجلّدٍ مؤقّت**
 * بأقلّ تعديلات البيان التي تطلبها وثائق MDN — `background.scripts` بجانب `service_worker`، و`gecko.id`، وبلا
 * `incognito: "split"` — لتُقاس الطبقة التالية: صفحات الإضافة، والخلفية، والحقن، والطبقة، والالتقاط، والمكتبة. النسخة
 * لا تُحفظ ولا تُبنى في المستودع: هي سؤالٌ يُسأل لا منتَجٌ يُشحن.
 *
 * **عبر WebDriver BiDi مباشرةً** (`ws://127.0.0.1:<المنفذ>/session`) — بروتوكول Firefox المعتمد للأتمتة، بلا
 * geckodriver ولا اعتمادية: `webExtension.install` يثبّت الإضافة تثبيتًا مؤقّتًا (بلا توقيع)، والتقييم في صفحات
 * `moz-extension://` يعمل كأيّ سياق تصفّح. ومعرّف المضيف (UUID) يُثبَّت قبل التثبيت بتفضيل
 * `extensions.webextensions.uuids` فتُعرف عناوين الصفحات.
 *
 * ملفّ تعريف مؤقّت لكل جولة يُمحى بعدها، وFirefox بلا نافذة (`--headless`). منفذاه خاصّان: 9230 للبروتوكول و5412
 * لصفحة العيّنة — لا من منافذ حرّاس كروم.
 */
import { execFileSync, spawn } from 'node:child_process'
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

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIREFOX = process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox'
const BIDI_PORT = Number(process.env.RASD_FIREFOX_PORT ?? 9230)
const PAGE_PORT = 5412
const GECKO_ID = 'rasd-probe@bysltan.com'
const UUID = '7a5d0c1e-2b3f-4c8d-9e0f-5a6b7c8d9e0f'
const SHOTS = join(ROOT, 'artifacts', 'firefox')
const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith('--only='))?.slice(7)
const shots = args.includes('--shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!existsSync(FIREFOX)) {
  console.error(`✗ Firefox غير موجود في ${FIREFOX} — مرّر المسار عبر FIREFOX_PATH.`)
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const zip = join(ROOT, 'dist-zip', `rasd-${pkg.version}.zip`)
if (!existsSync(zip)) {
  console.error('✗ لا حزمة في dist-zip/ — شغّل `pnpm zip` أولًا.')
  process.exit(1)
}
const version = execFileSync(FIREFOX, ['--version'], { encoding: 'utf8' }).trim()

// ── صفحة العيّنة: موقعٌ عاديّ على http يحقن فيه رصد ─────────────────
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

// ── BiDi ─────────────────────────────────────────────────────────
async function launch(prefs) {
  const profile = mkdtempSync(join(tmpdir(), 'rasd-firefox-'))
  writeFileSync(
    join(profile, 'user.js'),
    Object.entries(prefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n'),
  )
  const proc = spawn(
    FIREFOX,
    [
      '--headless',
      '--no-remote',
      '--profile',
      profile,
      '--remote-debugging-port',
      String(BIDI_PORT),
      // التقييم في صفحات `moz-extension://` يطلبه (قِيس: «System access is required»).
      '-remote-allow-system-access',
      '--window-size=1280,800',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  proc.stderr.on('data', (d) => (stderr += d))
  proc.stdout.on('data', () => undefined)
  let ws = null
  for (let i = 0; i < 120 && !ws; i++) {
    await sleep(250)
    if (!stderr.includes('WebDriver BiDi listening')) continue
    ws = new WebSocket(`ws://127.0.0.1:${BIDI_PORT}/session`)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
  }
  if (!ws) throw new Error(`لم يفتح Firefox منفذ BiDi.\n${stderr.slice(-600)}`)
  let next = 1
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result)
    } else if (msg.type === 'event') events.push(msg)
  })
  const send = (method, params = {}, ms = 20_000) =>
    Promise.race([
      new Promise((resolve, reject) => {
        const id = next++
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      }),
      sleep(ms).then(() => {
        throw new Error(`مهلة ${ms / 1000} ثانية في ${method}`)
      }),
    ])
  await send('session.new', { capabilities: {} })
  await send('session.subscribe', { events: ['log.entryAdded'] })
  const close = async () => {
    try {
      await send('session.end', {}, 3000)
    } catch {
      /* أُغلق */
    }
    ws.close()
    proc.kill('SIGKILL')
    await sleep(500)
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
  return { send, events, close, stderr: () => stderr }
}

/** يقيّم تعبيرًا يعيد نصًّا (JSON) في سياق تصفّح. */
async function evaluate(send, context, expression, ms = 20_000) {
  const r = await send(
    'script.evaluate',
    { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' },
    ms,
  )
  if (r.type === 'exception') throw new Error(r.exceptionDetails?.text ?? 'استثناء')
  return r.result?.value
}

async function openTab(send, url) {
  const { context } = await send('browsingContext.create', { type: 'tab' })
  await send('browsingContext.navigate', { context, url, wait: 'complete' }, 30_000)
  return context
}

/**
 * صفحة إضافة في تبويب. BiDi يرفض التنقّل إلى `moz-extension://` («not allowed in this context» — قِيس)، فتفتحها
 * الإضافة نفسها من صفحةٍ لها (`tabs.create` كما تفعل رصد مع المستخدم)، ثمّ يُعثر على سياقها في الشجرة.
 */
async function openExtensionPage(send, opener, url) {
  await evaluate(
    send,
    opener,
    `chrome.tabs.create({ url: ${JSON.stringify(url)} }).then((t) => String(t.id))`,
  )
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const { contexts } = await send('browsingContext.getTree', {})
    const hit = contexts.find((c) => c.url === url)
    if (hit) return hit.context
  }
  throw new Error(`لم يظهر سياق ${url}`)
}

/** أوّل صفحة إضافة مفتوحة — جولة التعريف التي تفتحها رصد عند التثبيت. */
async function findExtensionContext(send, base) {
  for (let i = 0; i < 40; i++) {
    const { contexts } = await send('browsingContext.getTree', {})
    const hit = contexts.find((c) => c.url.startsWith(base))
    if (hit) return hit
    await sleep(250)
  }
  return null
}

const report = []
const line = (mark, text) => report.push(`  ${mark} ${text}`)
const unpack = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-firefox-pkg-')))
  execFileSync('unzip', ['-q', zip, '-d', dir])
  return dir
}

// ── (١) الحزمة كما تُرفع ─────────────────────────────────────────
async function probePackage() {
  report.push('\n(١) الحزمة كما تُرفع، بلا تعديل:')
  const dir = unpack()
  const ff = await launch({})
  try {
    const r = await ff.send('webExtension.install', { extensionData: { type: 'path', path: dir } })
    line('✓', `قُبلت — المعرّف ${r.extension}`)
  } catch (e) {
    line('✗', `رُفضت: ${e.message}`)
  } finally {
    await ff.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── (٢) النسخة التجريبية ─────────────────────────────────────────
async function probeVariant() {
  report.push(
    `\n(٢) نسخةٌ تجريبية مؤقّتة — background.scripts وgecko.id وبلا incognito:"split" وdownloads دائمة${process.env.RASD_FIREFOX_NO_HOSTS ? '' : ' و<all_urls> بديلًا لإيماءة activeTab'}:`,
  )
  const dir = unpack()
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  m.background = { ...m.background, scripts: [m.background.service_worker], type: 'module' }
  m.browser_specific_settings = { gecko: { id: GECKO_ID } }
  delete m.incognito
  /*
   * بديل `activeTab`: لا أتمتة تمنح إيماءة نقر أيقونة الشريط، فتُعلَن صلاحية المضيف كما تفعل حرّاس كروم في نسخ فحصها
   * (`stageExtension({ hostPermissions })`). ويُقرأ بعدها: أيمنحها Firefox عند التثبيت المؤقّت أم لا.
   */
  if (!process.env.RASD_FIREFOX_NO_HOSTS) m.host_permissions = ['<all_urls>']
  // `downloads` اختيارية في رصد وتُطلب بإيماءة؛ هنا دائمة كي يُقاس `downloads.download` بلا إيماءة.
  m.permissions = [...m.permissions, 'downloads']
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 2))
  const base = `moz-extension://${UUID}/`
  // التنزيلات إلى مجلّدٍ مؤقّت لا إلى مجلّد المستخدم، بلا نافذة سؤال.
  const downloads = mkdtempSync(join(tmpdir(), 'rasd-firefox-dl-'))
  const ff = await launch({
    'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: UUID }),
    'browser.download.folderList': 2,
    'browser.download.dir': downloads,
    'browser.download.useDownloadDir': true,
  })
  const shot = async (context, name) => {
    if (!shots) return
    try {
      const { data } = await ff.send('browsingContext.captureScreenshot', { context })
      mkdirSync(SHOTS, { recursive: true })
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'))
      line('·', `لقطة: artifacts/firefox/${name}.png`)
    } catch (e) {
      line('·', `تعذّرت لقطة ${name}: ${e.message.split('\n')[0]}`)
    }
  }
  const step = async (label, fn) => {
    try {
      const v = await fn()
      line(
        '✓',
        `${label}${v === undefined ? '' : ` — ${typeof v === 'string' ? v : JSON.stringify(v).slice(0, 160)}`}`,
      )
      return v
    } catch (e) {
      line('✗', `${label} — ${e.message.split('\n')[0]}`)
      return null
    }
  }
  try {
    const installed = await step(
      'التثبيت',
      async () =>
        (await ff.send('webExtension.install', { extensionData: { type: 'path', path: dir } }))
          .extension,
    )
    if (!installed) return
    await sleep(1500)

    const tour = await step('جولة التعريف تُفتح عند التثبيت (onInstalled)', async () => {
      const c = await findExtensionContext(ff.send, base)
      if (!c) throw new Error('لم تُفتح صفحة إضافة')
      return c
    })
    if (!tour) return
    await step('جولة التعريف ترسم واجهتها', () =>
      evaluate(
        ff.send,
        tour.context,
        `JSON.stringify({ title: document.title, text: document.body.innerText.trim().length })`,
      ),
    )
    await shot(tour.context, 'onboarding')
    const popup = await step('النافذة تُفتح في تبويب', () =>
      openExtensionPage(ff.send, tour.context, `${base}src/pages/popup/index.html`),
    )
    if (popup) {
      await sleep(1500)
      await step('النافذة ترسم واجهتها', () =>
        evaluate(
          ff.send,
          popup,
          `JSON.stringify({ title: document.title, text: document.body.innerText.trim().length, dir: document.documentElement.dir, buttons: document.querySelectorAll('button').length })`,
        ),
      )
      await step('مساحة الأسماء', () =>
        evaluate(
          ff.send,
          popup,
          `JSON.stringify({ chrome: typeof chrome, browser: typeof browser, sameObject: typeof chrome !== 'undefined' && typeof browser !== 'undefined' && chrome === browser, promise: chrome.storage.local.get(null) instanceof Promise })`,
        ),
      )
      await step('الخلفية تردّ على رسائل رصد (capture/latest)', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#1' }).then((r) => JSON.stringify(r))`,
        ),
      )
      await step('الصلاحيات الممنوحة بعد التثبيت', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.permissions.getAll().then((p) => JSON.stringify({ permissions: p.permissions.sort(), origins: p.origins }))`,
        ),
      )
      await step('الاختصارات المسجَّلة', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.commands.getAll().then((c) => c.map((x) => x.name + '=' + (x.shortcut || '∅')).join(' · '))`,
        ),
      )
      await shot(popup, 'popup')
      for (const [label, url] of [
        [
          'downloads.download بعنوان data: (طريق رصد اليوم)',
          `'data:text/plain;base64,' + btoa('rasd')`,
        ],
        [
          'downloads.download بعنوان blob:',
          `URL.createObjectURL(new Blob(['rasd'], { type: 'text/plain' }))`,
        ],
      ]) {
        await step(label, () =>
          evaluate(
            ff.send,
            popup,
            `chrome.downloads.download({ url: ${url}, filename: 'rasd-probe.txt', saveAs: false, conflictAction: 'uniquify' }).then((id) => 'نُزّل — المعرّف ' + id)`,
          ),
        )
      }
    }

    for (const [name, path] of [
      ['المكتبة', 'src/pages/library/index.html'],
      ['الإعدادات', 'src/pages/settings/index.html'],
    ]) {
      const ctx = await step(`${name} تُفتح`, () =>
        openExtensionPage(ff.send, tour.context, `${base}${path}`),
      )
      if (!ctx) continue
      await sleep(2000)
      await step(`${name} ترسم واجهتها`, () =>
        evaluate(
          ff.send,
          ctx,
          `JSON.stringify({ title: document.title, text: document.body.innerText.trim().length })`,
        ),
      )
      await shot(ctx, path.split('/')[2])
    }

    const page = await step('صفحة موقعٍ عاديّ (http)', () => openTab(ff.send, PAGE))
    if (page && popup) {
      // بلا صلاحية `tabs` لا يُطابَق التبويب بعنوانه (في كروم كذلك)؛ فيُنشَّط ويُقرأ التبويب النشط.
      await ff.send('browsingContext.activate', { context: page })
      const tabId = await step('معرّف التبويب', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((t) => String(t[0]?.id))`,
        ),
      )
      await step('الحقن المباشر (scripting.executeScript)', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, func: () => location.href }).then((r) => JSON.stringify(r.map((x) => x.result)))`,
        ),
      )
      await step('تفعيل أداة القياس كما تفعل النافذة (tool/activate)', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'measure', tabId: ${tabId} }, id: 'probe#2' }).then((r) => JSON.stringify(r))`,
          30_000,
        ),
      )
      await sleep(1500)
      await step('الطبقة في الصفحة', () =>
        evaluate(
          ff.send,
          page,
          `JSON.stringify([...document.documentElement.children].filter((e) => e.hasAttribute('popover')).map((e) => ({ tag: e.tagName.toLowerCase().slice(0, 12), open: e.matches(':popover-open'), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })))`,
        ),
      )
      // تفاعلٌ حقيقي بالمؤشّر: نقرٌ على البطاقة الأولى ثمّ مرورٌ فوق الثانية — كما يقيس المستخدم.
      const centre = (sel, i) =>
        evaluate(
          ff.send,
          page,
          `(() => { const r = document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect(); return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]) })()`,
        ).then(JSON.parse)
      const pointer = (actions) =>
        ff.send('input.performActions', {
          context: page,
          actions: [{ type: 'pointer', id: 'mouse', actions }],
        })
      const cards = await step('بطاقتان في العيّنة', async () => [
        await centre('.card', 0),
        await centre('.card', 1),
      ])
      if (cards) {
        await step('القياس: نقرٌ على عنصر ثمّ مرورٌ فوق آخر', async () => {
          await pointer([
            { type: 'pointerMove', x: cards[0][0], y: cards[0][1] },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
            { type: 'pause', duration: 200 },
            { type: 'pointerMove', x: cards[1][0], y: cards[1][1], duration: 200 },
            { type: 'pause', duration: 400 },
          ])
        })
        await shot(page, 'overlay-measure')
        await step('تبديل الأداة إلى الفحص (tool/activate inspect)', () =>
          evaluate(
            ff.send,
            popup,
            `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'inspect', tabId: ${tabId} }, id: 'probe#5' }).then((r) => JSON.stringify(r))`,
            30_000,
          ),
        )
        await sleep(800)
        await step('الفحص: مرورٌ متدرّج ثمّ نقرٌ على عنصر', () =>
          pointer([
            { type: 'pointerMove', x: cards[1][0] - 40, y: cards[1][1] - 30 },
            { type: 'pause', duration: 150 },
            { type: 'pointerMove', x: cards[1][0] - 10, y: cards[1][1] - 5, duration: 150 },
            { type: 'pause', duration: 150 },
            { type: 'pointerMove', x: cards[1][0], y: cards[1][1], duration: 150 },
            { type: 'pause', duration: 600 },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
            { type: 'pause', duration: 800 },
          ]),
        )
        await step('حالة لوحة الفحص بعد النقر', () =>
          evaluate(
            ff.send,
            page,
            `(() => { const h = [...document.documentElement.children].find((e) => e.hasAttribute('popover')); return h ? 'المضيف موجود — جذر ظلّه مغلق فلا يُقرأ من الصفحة' : 'لا مضيف' })()`,
          ),
        )
        await shot(page, 'overlay-inspect')
        await step('تبديل الأداة إلى الألوان (tool/activate colour)', () =>
          evaluate(
            ff.send,
            popup,
            `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'colour', tabId: ${tabId} }, id: 'probe#8' }).then((r) => JSON.stringify(r))`,
            30_000,
          ),
        )
        await sleep(1500)
        await step('الألوان: مرورٌ فوق عنوان الصفحة', () =>
          pointer([
            { type: 'pointerMove', x: 1240, y: 40 },
            { type: 'pause', duration: 150 },
            { type: 'pointerMove', x: 1250, y: 52, duration: 150 },
            { type: 'pause', duration: 800 },
          ]),
        )
        await shot(page, 'overlay-colour')
        await step('تبديل الأداة إلى المقارنة (tool/activate compare)', () =>
          evaluate(
            ff.send,
            popup,
            `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'compare', tabId: ${tabId} }, id: 'probe#9' }).then((r) => JSON.stringify(r))`,
            30_000,
          ),
        )
        await sleep(1200)
        await shot(page, 'overlay-compare')
      }
      await step('captureVisibleTab مباشرةً', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.tabs.get(${tabId}).then((t) => chrome.tabs.captureVisibleTab(t.windowId, { format: 'png' })).then((u) => u.slice(0, 22) + '… ' + u.length + ' حرفًا')`,
        ),
      )
      await step('التقاط الجزء الظاهر كما تفعل النافذة (tool/activate viewport)', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'viewport', tabId: ${tabId} }, id: 'probe#3' }).then((r) => JSON.stringify(r))`,
          30_000,
        ),
      )
      await sleep(4000)
      const latest = await step('آخر لقطة في المكتبة بعد الالتقاط', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#4' }).then((r) => JSON.stringify(r))`,
        ),
      )
      await step('التقاط الصفحة كاملة (tool/activate full-page)', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: 'full-page', tabId: ${tabId} }, id: 'probe#6' }).then((r) => JSON.stringify(r))`,
          60_000,
        ),
      )
      await sleep(8000)
      const full = await step('آخر لقطة بعد الالتقاط الكامل', () =>
        evaluate(
          ff.send,
          popup,
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'capture/latest', payload: undefined, id: 'probe#7' }).then((r) => JSON.stringify(r))`,
        ),
      )
      const id = JSON.parse(full ?? latest ?? 'null')?.value?.id
      if (id) {
        const editor = await step('المحرّر يفتح اللقطة', () =>
          openExtensionPage(
            ff.send,
            tour.context,
            `${base}src/pages/editor/index.html?capture=${id}`,
          ),
        )
        if (editor) {
          await sleep(2500)
          await step('المحرّر يرسم اللقطة', () =>
            evaluate(
              ff.send,
              editor,
              `JSON.stringify({ title: document.title, canvases: [...document.querySelectorAll('canvas')].map((c) => c.width + '×' + c.height), images: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length })`,
            ),
          )
        }
      }
    }

    const errors = ff.events
      .filter((e) => e.method === 'log.entryAdded' && ['error', 'warn'].includes(e.params.level))
      .map((e) => `${e.params.level}: ${String(e.params.text).slice(0, 220)}`)
    report.push(`  رسائل الطرفية (خطأ وتحذير): ${errors.length}`)
    for (const e of [...new Set(errors)].slice(0, 25)) report.push(`      ${e}`)
  } finally {
    await ff.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(downloads, { recursive: true, force: true })
  }
}

try {
  console.log(`\nمسبار Firefox — ${version} · الحزمة ${zip.split('/').pop()}`)
  if (!only || only === 'package') await probePackage()
  if (!only || only === 'variant') await probeVariant()
  console.log(report.join('\n'))
} finally {
  server.close()
}
process.exit(0)
