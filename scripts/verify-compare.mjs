#!/usr/bin/env node
/**
 * يثبت أن أداة المقارنة (المرحلة 16) تعمل فوق Chrome حقيقي.
 *
 * happy-dom بلا محرّك تخطيط وبلا Shadow DOM حقيقي كاملًا، ورياضيات
 * `modules/compare/overlay.ts` مُختبَرة هناك بتحويلات مصطنعة — وما يُختبَر
 * هنا وحده هو **السلك**: هل يصل حدث سحب/عجلة/لوحة مفاتيح حقيقي من Chrome
 * إلى الأداة فعلًا، وهل الإفلات واللصق يحفظان مرجعًا في IndexedDB الحقيقي
 * ويحمّلانه حيًّا، وهل استدعاء المرجع المحفوظ عند إعادة دخول الوضع يعمل.
 *
 * حالتان لهما سابقة حيّة مباشرة هذه الدفعة تحديدًا: مستمع `paste` كان بلا
 * `capture: true` (مراجعة خصمة كشفته)، فاختبار اللصق هنا يُثبِت الإصلاح لا
 * يكتفي بإثبات أن اللصق يعمل — بتركيب مستمع صفحة مضيفة يستدعي
 * `stopPropagation` عمدًا، وهو بالضبط ما كان يُسكِت اللصق قبل الإصلاح.
 *
 * يعيد استعمال عيّنة `picker/` — هندستها معروفة ومختبَرة في
 * `verify-picker.mjs`/`verify-measure.mjs`، وأداة المقارنة لا تحتاج محتوى
 * صفحة محدَّدًا (تتفاعل مع طبقتنا نفسها لا عناصر الصفحة).
 *
 *   pnpm build && pnpm verify:compare
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9341
const FIXTURES = Number(process.env.RASD_FIXTURES_PORT ?? 5401)
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

const stage = mkdtempSync(join(tmpdir(), 'rasd-compare-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
manifest.host_permissions = ['http://127.0.0.1/*']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-compare-'))
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
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const note = (m) => lines.push(`  · ${m}`)

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
      if (r.ok) globalThis.__rasdCompare = r.value
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
    `() => { globalThis.__rasdCompare.modes.set(${JSON.stringify(mode)}); return true }`,
  )

/** حالة أداة المقارنة مباشرة من الإشارات — لا انتظار قراءة DOM. */
const readCompareState = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const c = globalThis.__rasdCompare.compare.state
      return {
        reference: c.reference.value,
        transform: c.transform.value,
        displayMode: c.displayMode.value,
        opacity: c.opacity.value,
        splitPosition: c.splitPosition.value,
      }
    }`,
  )

/** ما رُسم فعلًا فوق الصفحة. */
const readDrawn = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const layer = globalThis.__rasdCompare.host.layer
      return {
        idle: !!layer.querySelector('[data-rasd-ov="compare-idle"]'),
        panel: !!layer.querySelector('[data-rasd-ov="compare-panel"]'),
        referenceImg: layer.querySelector('[data-rasd-ov="compare-reference"]')?.getAttribute('src') ?? null,
        dock: !!layer.querySelector('[data-rasd-ov="compare-dock"]'),
      }
    }`,
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

/** انتظار قصير لسلسلة `await` غير متزامنة (IndexedDB، فكّ صورة) تستقرّ. */
const settleAsync = (ms = 300) => new Promise((r) => setTimeout(r, ms))

async function moveTo(pageSession, x, y, modifiers = 0) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse', modifiers },
    pageSession,
  )
  await settle(pageSession)
}

async function pressAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function releaseAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function clickAt(pageSession, x, y) {
  await pressAt(pageSession, x, y)
  await releaseAt(pageSession, x, y)
}

async function wheelAt(pageSession, x, y, deltaY) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseWheel', x, y, deltaX: 0, deltaY, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function keyPress(pageSession, key, modifiers = 0) {
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key, windowsVirtualKeyCode: keyCode(key), modifiers },
    pageSession,
  )
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key, windowsVirtualKeyCode: keyCode(key), modifiers },
    pageSession,
  )
  await settle(pageSession)
}
function keyCode(key) {
  const map = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }
  return map[key] ?? 0
}

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

/** ملفّ صورة PNG صالح ١×١ — بلا حاجة لعيّنة خارجية. */
const TEST_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/picker/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)
    const pageSession = await attachToPage('/picker/')
    if (!pageSession) fail('تعذّر الاتصال بهدف الصفحة.')
    else {
      const vw = await inPage(tabId, `() => window.innerWidth`)
      const vh = await inPage(tabId, `() => window.innerHeight`)
      note(`أبعاد النافذة الفعلية: ${vw}×${vh}`)
      // خارج مربّع اللوحة تمامًا (40,64)–(~380,~563) — أسفل يمين الشاشة.
      const bg = { x: vw - 80, y: vh - 80 }

      await setMode(tabId, 'compare')
      const diag = await inOverlay(
        tabId,
        `() => {
          const layer = globalThis.__rasdCompare.host.layer
          const hostEl = globalThis.__rasdCompare.host.hostEl
          return {
            layerInteractive: layer.getAttribute('data-rasd-interactive'),
            hostPointerEvents: hostEl.style.getPropertyValue('pointer-events'),
          }
        }`,
      )
      note(`تشخيص: ${JSON.stringify(diag)}`)

      // ── 1) الحالة الفارغة تُعرض، والوضع تفاعليّ ────────────────
      let drawn = await readDrawn(tabId)
      if (diag.layerInteractive === 'true' && diag.hostPointerEvents === 'auto') {
        ok('الطبقة تفاعلية في وضع المقارنة')
      } else {
        fail(`الطبقة ليست تفاعلية: ${JSON.stringify(diag)}`)
      }
      if (drawn.idle) ok('compare-idle مرسومة بلا مرجع')
      else fail(`compare-idle غائبة: ${JSON.stringify(drawn)}`)

      // ── 2) سهم بلا مرجع لا يفعل شيئًا (إصلاح مُراجَع هذه الدفعة) ──
      let st = await readCompareState(tabId)
      const tx0 = st.transform.tx
      await keyPress(pageSession, 'ArrowRight')
      st = await readCompareState(tabId)
      if (st.transform.tx === tx0 && !st.reference) {
        ok('سهم بلا مرجع لا يحرّك شيئًا (لا يُبتلع تمرير الصفحة بلا داعٍ)')
      } else {
        fail(`سهم بلا مرجع غيّر الحالة: tx ${tx0}→${st.transform.tx}`)
      }

      // ── 3) الإفلات يعيّن مرجعًا فعليًّا (لا نصًّا فقط) ─────────
      const dropped = await inOverlay(
        tabId,
        `() => (async () => {
          const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
          const file = new File([blob], 'ref.png', { type: 'image/png' })
          const dt = new DataTransfer()
          dt.items.add(file)
          const zone = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-dropzone')
          if (!zone) return 'no-dropzone'
          const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
          zone.dispatchEvent(ev)
          return 'dispatched'
        })()`,
      )
      await settleAsync(500)
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (dropped === 'dispatched' && st.reference && drawn.referenceImg?.startsWith('blob:')) {
        ok(`الإفلات عيّن مرجعًا حيًّا (${drawn.referenceImg.slice(0, 24)}…)`)
      } else {
        fail(
          `الإفلات لم يعيّن مرجعًا: dropped=${dropped} reference=${JSON.stringify(st.reference)} img=${drawn.referenceImg}`,
        )
      }
      if (drawn.panel) ok('لوحة المقارنة النشطة ظهرت بعد تعيين المرجع')
      else fail('لوحة المقارنة لم تظهر رغم وجود مرجع')

      /*
       * ── الحدّ غير المتماثل: كُتب من الصفحة، فيُقرأ من **أصل الإضافة** ──
       *
       * كل ما سبق كتب وقرأ من الطرف نفسه، فينجح **حتى لو كان المخزن
       * خاطئًا** — وهذا بالضبط ما وقع: نجحت هذه الفحوص كاملةً بينما
       * المراجع تُكتب في قاعدة بيانات الموقع المزار لا قاعدة رصد (الصفّ
       * 78). خطأٌ متماثل الاتجاهين لا يكشفه اختبارٌ متماثل الاتجاهين.
       *
       * فالقراءة هنا من الـservice worker: أصلٌ آخر، وقاعدةٌ أخرى — إن
       * وُجد السجلّ فيها فالكتابة وقعت حيث يجب.
       */
      const inExtensionDb = await inSW(`(async () => {
        const db = await new Promise((res, rej) => {
          const q = indexedDB.open('rasd')
          q.onsuccess = () => res(q.result)
          q.onerror = () => rej(q.error)
        })
        if (![...db.objectStoreNames].includes('references')) return { stores: [...db.objectStoreNames], count: -1 }
        const count = await new Promise((res) => {
          const tx = db.transaction('references', 'readonly')
          const r = tx.objectStore('references').count()
          r.onsuccess = () => res(r.result)
          r.onerror = () => res(-2)
        })
        return { origin: self.location.origin, count }
      })()`)
      if (inExtensionDb.count > 0) {
        ok(
          `المرجع مكتوب في قاعدة **الإضافة** لا الموقع — ${inExtensionDb.count} سجلًّا مقروءًا من ${inExtensionDb.origin}`,
        )
      } else {
        fail(
          `المرجع غائب عن قاعدة الإضافة: ${JSON.stringify(inExtensionDb)} — أي أنه كُتب في مكان آخر (الصفّ 78)`,
        )
      }

      // ── 3.5) مقبض التقسيم القابل بالسحب — SplitHandle.tsx ──────
      // **قبل أي سحب لكامل الصورة عمدًا**: `transform` لا يزال محايدًا هنا
      // (`tx=ty=0` قبل النقل أدناه). `nudge` ينقل المرجع خارج مربّع لوحة
      // المقارنة (`PANEL_INSET=40`..~380 أفقيًّا، `PANEL_TOP=64`..~563
      // رأسيًّا) كي لا تلتقط اللوحة الحدث بدل المقبض تحتها.
      //
      // **نقلات صغيرة ضمن حدود المقبض ذاته عمدًا — لا سحبًا واسعًا كخطوة
      // 4.** قِيس مباشرةً أثناء بناء هذا الفحص أن `Input.dispatchMouseEvent`
      // في Chrome بلا رأس **لا يحترم `setPointerCapture`**: `pointerdown`
      // يصل المقبض دومًا، لكن `pointermove` بعد نقلة تُخرج المؤشِّر من
      // حدود المقبض (حتى مع `setPointerCapture` ناجحًا بلا رمي) لا يصله
      // إطلاقًا — CDP يوجّه بحسب اختبار إصابة عاديّ عند كل نقطة، لا بإعادة
      // توجيه الأسر. المقبض ثابت المقاس بصريًّا (`~28×48px`، انظر تعليق
      // `.rasd-ov-split-handle` في overlay.css)، فنقلات ≤10px تبقى داخله
      // دون حاجة للأسر أصلًا — وهذا الحدّ سمة بيئة CDP الاصطناعية لا
      // سلوك متصفّح حقيقي (لمسة أو فأرة حقيقيّان يستمرّان عبر `setPointerCapture`
      // بصرف النظر عن موضع المؤشِّر، وهو ما تثبته `split-handle.test.tsx`
      // بأحداث مصطنَعة مباشرة على العنصر لا بإحداثيات شاشة).
      //
      // `displayMode` الافتراضي `split` — لا حاجة لتبديل الوضع. **المقياس
      // اتجاهيّ لا دقيق**: عرض الصورة الطبيعي 1px يجعل أي دلتا سحب تُشبِع
      // الموضع فورًا عند 0 أو 100 — الدقّة الحسابية (بما فيها التحجيم 2×)
      // مُثبَتة في `split-handle.test.tsx` (10 حالات). ما لا تثبته الوحدات:
      // هل `setPointerCapture` الحقيقي في Chrome (بخلاف happy-dom الذي لا
      // يطبّقه قط) يمرّ بلا رمي، وهل حدث مؤشِّر CDP حقيقي — لا مصطنَع
      // بـ`dispatchEvent` — يصل المقبض عبر اختبار إصابة حقيقي.
      await inOverlay(
        tabId,
        `() => { globalThis.__rasdCompare.compare.nudge(700, 100); return true }`,
      )
      await settle(pageSession)
      const handleRect = await inOverlay(
        tabId,
        `() => {
          const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-split-handle')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        }`,
      )
      if (!handleRect) {
        fail('مقبض التقسيم غائب من DOM رغم وضع split ومرجع قائم.')
      } else {
        // **تسخين لازم قِيس لا حدس**: هذا أوّل `pressAt` في السكربت كلّه —
        // بلا `moveTo` أوّليّ هنا يفشل أوّل press+move صامتًا (٥٠٪→٥٠٪) رغم
        // نجاح الثاني مباشرةً بعده بالإحداثيات نفسها؛ CDP يحتاج مؤشِّرًا
        // «واصلًا» فعليًّا إلى نقطة قبل أن يقبل ضغطًا هناك أوّل مرّة في جلسة
        // جديدة. الخطوة 4 لاحقًا لا تحتاج تسخينًا مماثلًا لأن هذه الخطوة
        // سبقتها وأدّت الغرض عرَضًا.
        await moveTo(pageSession, handleRect.x, handleRect.y)
        st = await readCompareState(tabId)
        const splitBefore = st.splitPosition
        await pressAt(pageSession, handleRect.x, handleRect.y)
        await moveTo(pageSession, handleRect.x + 8, handleRect.y)
        await releaseAt(pageSession, handleRect.x + 8, handleRect.y)
        st = await readCompareState(tabId)
        if (st.splitPosition > splitBefore) {
          ok(`سحب المقبض يمينًا زاد موضع الفاصل (${splitBefore}٪ → ${st.splitPosition}٪)`)
        } else {
          fail(
            `سحب المقبض لم يغيّر الموضع في الاتجاه المتوقَّع: ${splitBefore} → ${st.splitPosition}`,
          )
        }

        // والاتجاه المعاكس — نفس المقبض، دلتا سالبة.
        await pressAt(pageSession, handleRect.x, handleRect.y)
        await moveTo(pageSession, handleRect.x - 8, handleRect.y)
        await releaseAt(pageSession, handleRect.x - 8, handleRect.y)
        const stAfterBack = await readCompareState(tabId)
        if (stAfterBack.splitPosition < st.splitPosition) {
          ok(
            `سحب المقبض يسارًا أنقص موضع الفاصل (${st.splitPosition}٪ → ${stAfterBack.splitPosition}٪)`,
          )
        } else {
          fail(`السحب العكسي لم يُنقص الموضع: ${st.splitPosition} → ${stAfterBack.splitPosition}`)
        }

        // إعادة الموضع إلى منتصفه — الخطوات اللاحقة (منزلق الشفافية،
        // إعادة الدخول) لا تفترض قيمة بعينها، لكن نظافة الحالة أوضح للقارئ.
        await inOverlay(
          tabId,
          `() => { globalThis.__rasdCompare.compare.setSplitPosition(50); return true }`,
        )
      }

      // ── 4) السحب يحرّك التحويل بمقدار حركة المؤشِّر الحقيقية ────
      st = await readCompareState(tabId)
      const before = st.transform
      await pressAt(pageSession, bg.x, bg.y)
      await moveTo(pageSession, bg.x - 40, bg.y - 25)
      st = await readCompareState(tabId)
      const afterMove = st.transform
      await releaseAt(pageSession, bg.x - 40, bg.y - 25)
      if (near(afterMove.tx - before.tx, -40, 2) && near(afterMove.ty - before.ty, -25, 2)) {
        ok(
          `السحب حرّك المرجع بمقدار حركة المؤشِّر الحقيقية (Δx=${afterMove.tx - before.tx}, Δy=${afterMove.ty - before.ty})`,
        )
      } else {
        fail(
          `السحب لم يطابق حركة المؤشِّر: قبل ${JSON.stringify(before)} بعد ${JSON.stringify(afterMove)}`,
        )
      }

      // ── 5) عجلة الفأرة تُكبِّر/تُصغِّر فعليًّا ───────────────────
      st = await readCompareState(tabId)
      const scaleBefore = st.transform.scale
      await wheelAt(pageSession, bg.x, bg.y, -240) // دلتا سالبة = تكبير، انظر compare.ts
      st = await readCompareState(tabId)
      if (st.transform.scale > scaleBefore) {
        ok(
          `عجلة الفأرة كبّرت المرجع (${scaleBefore.toFixed(3)} → ${st.transform.scale.toFixed(3)})`,
        )
      } else {
        fail(`العجلة لم تغيّر التحجيم: ${scaleBefore} → ${st.transform.scale}`)
      }

      // ── 6) لوحة المفاتيح: 1px عاديًا، 10px مع ⇧ (مرجع موجود الآن) ──
      st = await readCompareState(tabId)
      const txBeforeNudge = st.transform.tx
      await keyPress(pageSession, 'ArrowRight')
      st = await readCompareState(tabId)
      const plainStep = st.transform.tx - txBeforeNudge
      await keyPress(pageSession, 'ArrowRight', 8) // Shift = bit 8 في قناع CDP
      st = await readCompareState(tabId)
      const shiftStep = st.transform.tx - (txBeforeNudge + plainStep)
      if (near(plainStep, 1, 0.1) && near(shiftStep, 10, 0.1)) {
        ok(`الأسهم تحرِّك 1px عاديًا و10px مع ⇧ (قِيس: ${plainStep}px ثم ${shiftStep}px)`)
      } else {
        fail(`خطوتا التحريك غير متوقَّعتين: عادي=${plainStep} ⇧=${shiftStep}`)
      }

      // ── 7) اللصق يعيّن مرجعًا جديدًا رغم `stopPropagation` من الصفحة ──
      // هذا يثبت إصلاح `capture: true` المُراجَع هذه الدفعة تحديدًا — بلاه،
      // مستمع الصفحة كان يُسكِت اللصق قبل وصوله إلى مستمعنا.
      const referenceUrlBeforePaste = drawn.referenceImg
      await inPage(
        tabId,
        `() => { document.addEventListener('paste', (e) => e.stopPropagation()) }`,
      )
      const pasted = await inPage(
        tabId,
        `() => (async () => {
          const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
          const file = new File([blob], 'pasted.png', { type: 'image/png' })
          const dt = new DataTransfer()
          dt.items.add(file)
          const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
          document.dispatchEvent(ev)
          return 'dispatched'
        })()`,
      )
      await settleAsync(500)
      drawn = await readDrawn(tabId)
      if (
        pasted === 'dispatched' &&
        drawn.referenceImg?.startsWith('blob:') &&
        drawn.referenceImg !== referenceUrlBeforePaste
      ) {
        ok('اللصق (مع capture:true) عيّن مرجعًا جديدًا رغم stopPropagation من الصفحة')
      } else {
        fail(
          `اللصق لم يعيّن مرجعًا جديدًا: قبل=${referenceUrlBeforePaste} بعد=${drawn.referenceImg}`,
        )
      }

      // ── 8) منزلق الشفافية في اللوحة يعمل فعليًّا ─────────────────
      const sliderRect = await inOverlay(
        tabId,
        `() => {
          const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-slider input[type="range"]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }`,
      )
      if (!sliderRect) {
        fail('لم يُعثر على منزلق الشفافية في DOM.')
      } else {
        const opacityBefore = (await readCompareState(tabId)).opacity
        // نقرة قرب الطرف الأيسر من المسار — قيمة منخفضة (RTL: الحدّ الأدنى يمين المسار حسب اتجاه اللوحة، لكن input[type=range] الأصلي يبقى بصريًا LTR داخليًا ما لم يُعكَس صراحةً؛ الاختبار هنا يتحقّق من *وجود* أثر لا قيمة محدَّدة).
        await clickAt(
          pageSession,
          sliderRect.x + sliderRect.w * 0.1,
          sliderRect.y + sliderRect.h / 2,
        )
        const opacityAfter = (await readCompareState(tabId)).opacity
        if (opacityAfter !== opacityBefore) {
          ok(`منزلق الشفافية يستجيب للنقر (${opacityBefore}٪ → ${opacityAfter}٪)`)
        } else {
          fail(`منزلق الشفافية بلا أثر: بقي ${opacityBefore}٪`)
        }
      }

      // ── 8.5) معرض المقاسات — `compare / viewports` (`127:315`، المرحلة 16) ──
      // زرّ «المقاس الحالي» في اللوحة يفتح المعرض؛ المقاس الحيّ الآن مصنَّف
      // `desktop` (عرض النافذة المقيس أعلاه = 1280، داخل حدّي `classifyViewport`).
      const galleryBtnPresent = await inOverlay(
        tabId,
        `() => !!globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-vp-btn')`,
      )
      if (!galleryBtnPresent) {
        fail('زرّ فتح معرض المقاسات غائب من اللوحة.')
      } else {
        const btnRect = await inOverlay(
          tabId,
          `() => {
            const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-vp-btn')
            const r = el.getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          }`,
        )
        await clickAt(pageSession, btnRect.x, btnRect.y)
        await settleAsync(400)

        const galleryOpen = await inOverlay(
          tabId,
          `() => {
            const layer = globalThis.__rasdCompare.host.layer
            const cards = [...layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
            return {
              present: !!layer.querySelector('[data-rasd-ov="viewport-gallery"]'),
              cardCount: cards.length,
              filledCount: cards.filter((c) => c.querySelector('img')).length,
            }
          }`,
        )
        if (galleryOpen.present && galleryOpen.cardCount === 4 && galleryOpen.filledCount === 1) {
          ok(`المعرض فُتح بأربع بطاقات، واحدة مملوءة (مقاس الصفحة الحيّ — ${vw}×${vh})`)
        } else {
          fail(`المعرض غير مطابق للمتوقَّع: ${JSON.stringify(galleryOpen)}`)
        }

        // إفلات صورة على بطاقة «هاتف» الفارغة — مقاس يخالف المقاس الحيّ الآن.
        const referenceUrlBeforeGalleryDrop = (await readDrawn(tabId)).referenceImg
        const galleryDropped = await inOverlay(
          tabId,
          `() => (async () => {
            const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
            const file = new File([blob], 'phone-ref.png', { type: 'image/png' })
            const dt = new DataTransfer()
            dt.items.add(file)
            const zone = [...globalThis.__rasdCompare.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
              .find((c) => c.getAttribute('aria-label') === 'هاتف')
              ?.querySelector('.rasd-ov-vpg-thumb-empty')
            if (!zone) return 'no-zone'
            const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
            zone.dispatchEvent(ev)
            return 'dispatched'
          })()`,
        )
        await settleAsync(500)
        const filledAfterGalleryDrop = await inOverlay(
          tabId,
          `() => [...globalThis.__rasdCompare.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
            .filter((c) => c.querySelector('img')).length`,
        )
        const referenceUrlAfterGalleryDrop = (await readDrawn(tabId)).referenceImg
        if (
          galleryDropped === 'dispatched' &&
          filledAfterGalleryDrop === 2 &&
          referenceUrlAfterGalleryDrop === referenceUrlBeforeGalleryDrop
        ) {
          ok('إفلات على بطاقة «هاتف» عيّن مرجعها وحده — اللوحة الحيّة (سطح المكتب) لم تتأثّر')
        } else {
          fail(
            `إفلات المعرض لم يتصرّف كما يجب: dropped=${galleryDropped} filled=${filledAfterGalleryDrop} refBefore=${referenceUrlBeforeGalleryDrop} refAfter=${referenceUrlAfterGalleryDrop}`,
          )
        }

        // نفس الحدّ غير المتماثل أعلاه — بطاقة «هاتف» كُتبت من الصفحة، فتُقرأ من أصل الإضافة.
        const phoneRefCount = await inSW(`(async () => {
          const db = await new Promise((res, rej) => {
            const q = indexedDB.open('rasd')
            q.onsuccess = () => res(q.result)
            q.onerror = () => rej(q.error)
          })
          const all = await new Promise((res) => {
            const r = db.transaction('references', 'readonly').objectStore('references').getAll()
            r.onsuccess = () => res(r.result)
            r.onerror = () => res([])
          })
          return all.filter((r) => r.viewport === 'phone').length
        })()`)
        if (phoneRefCount > 0) {
          ok(`مرجع «هاتف» أيضًا في قاعدة الإضافة — ${phoneRefCount} سجلًّا`)
        } else {
          fail('مرجع «هاتف» غائب عن قاعدة الإضافة.')
        }

        // زرّ الإغلاق يطوي المعرض.
        const closeBtnRect = await inOverlay(
          tabId,
          `() => {
            const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-vpg-icon')
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          }`,
        )
        if (closeBtnRect) await clickAt(pageSession, closeBtnRect.x, closeBtnRect.y)
        await settleAsync(200)
        const galleryClosed = await inOverlay(
          tabId,
          `() => !globalThis.__rasdCompare.host.layer.querySelector('[data-rasd-ov="viewport-gallery"]')`,
        )
        if (galleryClosed) ok('زرّ الإغلاق يطوي المعرض')
        else fail('المعرض بقي مفتوحًا بعد نقر زرّ الإغلاق.')
      }

      // ── 9) مغادرة الوضع تمسح الحيّ، وإعادة الدخول تستدعي المحفوظ ──
      await setMode(tabId, 'idle')
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (!st.reference && !drawn.dock) {
        ok('مغادرة الوضع مسحت المرجع الحيّ ولوحته')
      } else {
        fail(`بقايا بعد المغادرة: reference=${JSON.stringify(st.reference)} dock=${drawn.dock}`)
      }

      await setMode(tabId, 'compare')
      await settleAsync(500)
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (st.reference && drawn.referenceImg?.startsWith('blob:')) {
        ok('إعادة دخول الوضع استدعت المرجع المحفوظ من IndexedDB تلقائيًّا')
      } else {
        fail(`لم يُستدعَ المرجع المحفوظ: reference=${JSON.stringify(st.reference)}`)
      }

      // ── 10) الخروج النهائي ينظّف كل شيء ───────────────────────
      await setMode(tabId, 'idle')
      drawn = await readDrawn(tabId)
      if (!drawn.idle && !drawn.panel && !drawn.dock) {
        ok('الخروج النهائي يمحو كل رسوم المقارنة')
      } else {
        fail(`رسوم باقية بعد الخروج: ${JSON.stringify(drawn)}`)
      }
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص أداة المقارنة في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ أداة المقارنة تعمل بدقّة فوق Chrome حقيقي.\n')
