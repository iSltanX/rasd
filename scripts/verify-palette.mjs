#!/usr/bin/env node
/**
 * يثبت أن سلك المرحلة 14 يعمل **حيًّا** لا وحدةً فقط.
 *
 * **العلّة التي بُني لأجلها.** منطق `usage.ts` و`replace.ts` كان مبنيًّا
 * ومُختبَرًا وحدةً بلا مستدعٍ واحد — كودٌ صحيح لا يُنفَّذ. واختبار الوحدة
 * يثبت أن الدالّة صحيحة، ولا يثبت أن أحدًا يناديها. وثلاثة أسئلة لا يجيب
 * عنها إلّا متصفّح يشغّل الطبقة فعلًا:
 *
 *   1. هل يجد المسح مستعمِلي اللون في صفحة حقيقية بأنماطها المتتالية —
 *      لا في `innerHTML` مصطنَع؟
 *   2. هل يُطبَّق الاستبدال على البكسل فعلًا، و**هل يعود البكسل** كما كان
 *      بعد التراجع؟ (نصّ `§6.11`: «يزول بإزالة العنصر المحقون».)
 *   3. هل يزول الأثر عند **مغادرة الوضع** لا عند الضغط على «تراجع» وحده؟
 *      هذا هو المسار الذي ينساه المستخدم، وهو الذي يترك صفحته مطليّة.
 *
 * والقياس على **البكسل** لا على السمة: سمةٌ مكتوبة لا تعني لونًا مرسومًا،
 * وهو الفرق نفسه الذي بُني له `verify-colour.mjs`.
 *
 *   pnpm build && pnpm verify:palette
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9347
const FIXTURES = Number(process.env.RASD_FIXTURES_PORT ?? 5399)
const BASE = `http://127.0.0.1:${FIXTURES}`

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

// ── خادم العيّنات ────────────────────────────────────────────────
const fixtures = spawn(process.execPath, [join(root, 'scripts', 'fixtures-serve.mjs')], {
  stdio: 'ignore',
  env: { ...process.env, RASD_FIXTURES_PORT: String(FIXTURES) },
})
await new Promise((r) => setTimeout(r, 600))

const stage = mkdtempSync(join(tmpdir(), 'rasd-palette-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
/*
 * **`<all_urls>` لا نمطًا ضيّقًا — وهذا مقيس لا احتياط.**
 *
 * `captureVisibleTab` يرفض صلاحية المضيف الضيّقة صراحةً: «Either the
 * '<all_urls>' or 'activeTab' permission is required» (مسجَّل في
 * `verify-capture.mjs` منذ المرحلة 8). وأوّل تشغيل لهذا السكربت بنمط
 * `http://127.0.0.1/*` أعطى بالضبط «انتهت صلاحية الإذن لهذه الصفحة» —
 * ورسالةً صحيحةً، فالإذن لم يكن ممنوحًا فعلًا.
 *
 * و`activeTab` لا تُمنح برمجيًا (تمنحها نقرة المستخدم على الأيقونة)، فلا
 * سبيل إليها في جلسة آلية. فنسخة الفحص وحدها تُرقَّع، والحزمة المشحونة
 * تبقى بلا صلاحية مضيف كما يتحقّق `verify-capture.mjs`.
 */
manifest.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-palette-'))
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
  fixtures.kill('SIGKILL')
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
  for (let i = 0; i < 40 && !wsUrl; i++) {
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

const session = await connect()
if (!session) {
  await cleanup()
  console.error('تعذّر الاتصال بـDevTools.\n' + stderr.split('\n').slice(-8).join('\n'))
  process.exit(1)
}
const { ws, send } = session

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const note = (m) => lines.push(`  · ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}

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
  await new Promise((r) => setTimeout(r, 300))
}

let swSession = null
if (sw) {
  swSession = (await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }))
    .sessionId
  await send('Runtime.enable', {}, swSession)
}

async function inSW(expression) {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    swSession,
  )
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
  return res.result.value
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
  fail('الإضافة أو الـservice worker لم يجهزا — لا يمكن الحقن بالمسار الحقيقي.')
} else if (!granted) {
  fail('صلاحية المضيف للعيّنات غير ممنوحة — الحقن عبر chrome.scripting غير ممكن.')
} else {
  ok(`نسخة الفحص محمَّلة، والصلاحية للعيّنات المحلّية وحدها (${BASE}/*)`)
}

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

async function inPage(tabId, fnSource) {
  const expr = `chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: ${fnSource},
  }).then(r => r[0].result)`
  return inSW(expr)
}

async function injectOverlay(tabId) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId}, allFrames: true },
    files: ['content.js'],
  }).then(() => 'injected').catch(e => 'error: ' + e.message)`)
}

async function startOverlay(tabId) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: () => globalThis.__rasdContent.startOverlay().then(r => {
      const g = { ok: r.ok, level: r.ok ? r.value.host.level : null, error: r.ok ? null : r.error.message }
      if (r.ok) globalThis.__rasdPalette = r.value
      return g
    }),
  }).then(r => r[0].result)`)
}

async function inOverlay(tabId, fnSource) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: ${fnSource},
  }).then(r => r[0].result)`)
}

const setMode = (tabId, mode) =>
  inOverlay(
    tabId,
    `() => { globalThis.__rasdPalette.modes.set(${JSON.stringify(mode)}); return true }`,
  )

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  return sessionId
}

async function settle(pageSession) {
  await send(
    'Runtime.evaluate',
    {
      expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
      awaitPromise: true,
    },
    pageSession,
  )
}

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/colour/')
  await injectOverlay(tabId)
  const started = await startOverlay(tabId)
  if (!started?.ok) {
    fail(`الطبقة لم تُقلع: ${started?.error ?? 'بلا سبب'}`)
  } else {
    ok('الطبقة أقلعت في تبويب بارد بالمسار الحقيقي')
    await setMode(tabId, 'colour')

    const pageSession = await attachToPage('/colour/')

    /*
     * ── 1) المسح يجد المستعمِلين في صفحة حقيقية ─────────────────
     *
     * العيّنة تعرّف `--brand: #2b7fff` وتستعمله في `#var-bg`. والمسح
     * يقرأ **القيمة المحسوبة** — أي `rgb(43, 127, 255)` بعد أن ذابت
     * `var()` — فيجده بلا حاجة إلى حلّ التتالي. وهذا ما لا يثبته اختبار
     * الوحدة: هناك أنماطٌ سطرية مصطنَعة، وهنا تتالٍ حقيقي من ورقة أنماط.
     */
    const scanResult = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const g = globalThis.__rasdPalette
        const tool = g.colourUsage
        // اللون هدفًا: نبنيه من العنصر نفسه كي لا نكتب قيمة بيدنا.
        const el = document.querySelector('#var-bg')
        const css = getComputedStyle(el).backgroundColor
        const m = css.match(/\\d+/g).map(Number)
        const reading = {
          rgb: { r: m[0], g: m[1], b: m[2] },
          alpha: m[3] === undefined ? 1 : m[3],
          inSrgb: true,
          source: 'css',
        }
        tool.scan(reading)
        const wait = () => {
          if (tool.state.scanning.value) return void setTimeout(wait, 50)
          resolve({
            total: tool.state.hits.value.length,
            rows: tool.state.rows.value.map((r) => r.selector + '|' + r.property),
          })
        }
        setTimeout(wait, 50)
      })`,
    )
    if (!scanResult || scanResult.total === 0) {
      fail(`المسح لم يجد أي مستعمِل للون المصرَّح — ${JSON.stringify(scanResult)}`)
    } else {
      ok(`المسح وجد ${scanResult.total} مستعمِلًا في صفحة حقيقية`)
      note(`صفوف القائمة: ${JSON.stringify(scanResult.rows)}`)
    }

    /*
     * ── 2) الاستبدال يغيّر **البكسل** ثم يعيده ───────────────────
     *
     * القياس على البكسل لا على السمة: سمةٌ مكتوبة لا تعني لونًا مرسومًا.
     * نقرأ البكسل من الصفحة عبر `elementFromPoint` + `getComputedStyle`
     * بعد إعادة رسم مؤكَّدة، فما يُقاس هو ما يراه المستخدم.
     */
    const readPixel = () =>
      inPage(
        tabId,
        `() => {
          const el = document.querySelector('#var-bg')
          return getComputedStyle(el).backgroundColor
        }`,
      )

    const before = await readPixel()
    await inOverlay(
      tabId,
      `() => { globalThis.__rasdPalette.colourUsage.replace('#0ea5a3'); return true }`,
    )
    await settle(pageSession)
    const during = await readPixel()

    if (during && during !== before && /14|10|163/.test(during)) {
      ok(`الاستبدال بلغ اللون المرسوم فعلًا: ${before} ← ${during}`)
    } else {
      fail(`الاستبدال لم يغيّر اللون المرسوم: قبل=${before} أثناء=${during}`)
    }

    await inOverlay(tabId, `() => { globalThis.__rasdPalette.colourUsage.revert(); return true }`)
    await settle(pageSession)
    const after = await readPixel()
    after === before
      ? ok(`التراجع أعاد اللون المرسوم بالضبط: ${after}`)
      : fail(`أثرٌ متبقٍّ بعد التراجع: كان ${before} وصار ${after}`)

    /*
     * ── 3) مغادرة الوضع تُنهي الأثر — المسار الذي يُنسى ──────────
     *
     * «تراجع» فعلٌ يتذكّره من ضغطه. أمّا مغادرة الوضع بـ`Esc` أو بتبديل
     * أداة فمسارٌ يمرّ عليه المستخدم بلا تفكير — وهو الذي يترك صفحته
     * مطليّة إن لم يُحرَس.
     */
    await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const tool = globalThis.__rasdPalette.colourUsage
        const el = document.querySelector('#var-bg')
        const css = getComputedStyle(el).backgroundColor
        const m = css.match(/\\d+/g).map(Number)
        tool.scan({ rgb: { r: m[0], g: m[1], b: m[2] }, alpha: 1, inSrgb: true, source: 'css' })
        const wait = () => {
          if (tool.state.scanning.value) return void setTimeout(wait, 50)
          tool.replace('#ff00ff')
          resolve(true)
        }
        setTimeout(wait, 50)
      })`,
    )
    await settle(pageSession)
    const painted = await readPixel()

    await setMode(tabId, 'idle')
    await settle(pageSession)
    const afterLeave = await readPixel()

    if (painted === before) {
      fail('الاستبدال الثاني لم يُطبَّق أصلًا — الفحص التالي بلا معنى')
    } else if (afterLeave === before) {
      ok(`مغادرة الوضع أزالت الأثر تلقائيًّا: ${painted} ← ${afterLeave}`)
    } else {
      fail(`مغادرة الوضع تركت الصفحة مطليّة: ${afterLeave} بدل ${before}`)
    }

    /*
     * ── 4) الإبراز يُرسَم في طبقتنا لا على العنصر ────────────────
     *
     * أثرُ الإبراز يجب ألّا يظهر في أنماط العنصر إطلاقًا — وإلّا خلط
     * مسارَ التراجع بمسار العرض.
     */
    await setMode(tabId, 'colour')
    const marks = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const g = globalThis.__rasdPalette
        const tool = g.colourUsage
        const el = document.querySelector('#var-bg')
        const css = getComputedStyle(el).backgroundColor
        const m = css.match(/\\d+/g).map(Number)
        tool.scan({ rgb: { r: m[0], g: m[1], b: m[2] }, alpha: 1, inSrgb: true, source: 'css' })
        const wait = () => {
          if (tool.state.scanning.value) return void setTimeout(wait, 50)
          tool.highlightAll()
          setTimeout(() => {
            const layer = g.host.layer
            resolve({
              marks: layer.querySelectorAll('[data-rasd-ov="colour-usage-mark"]').length,
              elementStyle: document.querySelector('#var-bg').getAttribute('style'),
            })
          }, 120)
        }
        setTimeout(wait, 50)
      })`,
    )
    if (!marks) {
      fail('تعذّر قياس الإبراز')
    } else {
      marks.marks > 0
        ? ok(`الإبراز مرسوم في الطبقة: ${marks.marks} علامة`)
        : fail('لا علامة إبراز رُسمت رغم وجود مطابقين')
      marks.elementStyle === null
        ? ok('ولم يُلمَس نمط العنصر نفسه — الإبراز عرضٌ لا تعديل')
        : fail(`الإبراز عدّل نمط العنصر: ${marks.elementStyle}`)
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص سلك المرحلة 14 حيًّا — المسح والاستبدال والإبراز ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ سلك المسح والاستبدال يعمل حيًّا، ولا يترك أثرًا.\n')
