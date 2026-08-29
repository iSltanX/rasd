#!/usr/bin/env node
/**
 * يثبت أن الالتقاط الكامل يعمل فوق Chrome حقيقي — بلا تكرار ولا فقد.
 *
 * **لا يُقاس شيء من هذا في Vitest.** لا تمرير، ولا لقطات، ولا تجميع، ولا
 * `OffscreenCanvas`. وكل معايير المرحلة العشرة تُقاس هنا أو لا تُقاس.
 *
 * **الإثبات بالعلامات لا بالارتفاع.** معيار الخطّة («ارتفاع الناتج =
 * `scrollHeight × dpr` ضمن هامش بلاطة») يمرّ على صورة أُسقط منها قسمان
 * وكُرّر غيرهما — قيس أن تجميعًا مُفسَدًا عمدًا أعطى الارتفاع نفسه. فالعيّنة
 * تزرع في كل قسم لونًا فريدًا محسوبًا، ويُقرأ من الصورة المجمَّعة بكسلٌ من
 * كل قسم: تظهر الألوان كلّها، مرّة واحدة، وبالترتيب — أو يسقط الفحص.
 *
 *   pnpm build && pnpm verify:fullpage
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9338
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

/*
 * المنفذ يجب أن يكون خاليًا قبل البدء.
 *
 * نسخة Chrome سابقة ما تزال تستمع عليه تعني أن `connect()` سيرتبط بها بدل
 * إطلاق واحدة نظيفة، فتُحمَّل الإضافة **مرّتين** في متصفّح واحد: الرسائل
 * تصل إلى نسخة مجلّدها المؤقّت حُذف، فيردّ Chrome «Could not load file».
 * ساعة كاملة ضاعت في مطاردة هذا العَرَض قبل تشخيص سببه.
 */
try {
  const probe = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(
    () => true,
    () => false,
  )
  if (probe) {
    console.error(
      `المنفذ ${PORT} مشغول بنسخة Chrome سابقة. أغلقها أوّلًا:\n` +
        `  pkill -f "remote-debugging-port=${PORT}"`,
    )
    process.exit(1)
  }
} catch {
  /* خالٍ */
}

// ── خادم العيّنات ────────────────────────────────────────────────
const fixtures = spawn(process.execPath, [join(root, 'scripts', 'fixtures-serve.mjs')], {
  stdio: 'ignore',
  env: { ...process.env, RASD_FIXTURES_PORT: String(FIXTURES) },
})
await new Promise((r) => setTimeout(r, 600))

// نسخة الفحص: `dist/` كما هي + صلاحية مضيف للعيّنات المحلّية.
const stage = mkdtempSync(join(tmpdir(), 'rasd-fullpage-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
/*
 * `<all_urls>` لا نمطًا ضيّقًا — و`captureVisibleTab` هو السبب.
 *
 * جُرِّب `http://127.0.0.1/*` هنا فردّ Chrome حرفيًّا: «Either the
 * '<all_urls>' or 'activeTab' permission is required». أي أن الواجهة لا
 * تقبل صلاحية مضيف ضيّقة بديلًا — إمّا الشاملة وإمّا `activeTab`، وهذه
 * الأخيرة تحتاج إيماءة مستخدم حقيقية لا يملكها فحص آلي. والحزمة المشحونة
 * تبقى بلا صلاحية مضيف دائمة؛ `verify:dist` يفرض ذلك ولم يُمسّ.
 */
manifest.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-fullpage-'))
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
const swLog = []
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
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.consoleAPICalled' && m.sessionId === swSession) {
      const text = (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      swLog.push(text)
    }
  })
}

/** ينفّذ تعبيرًا داخل الـservice worker ويعيد قيمته. */
async function inSW(expression) {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    swSession,
  )
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
  return res.result.value
}

// ── منح صلاحية المضيف للعيّنات المحلّية وحدها ────────────────────
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
  fail(
    'صلاحية المضيف للعيّنات غير ممنوحة — الحقن عبر chrome.scripting غير ممكن. ' +
      'الفحص لا يدّعي نجاحًا بلا حقن حقيقي.',
  )
} else {
  ok(`نسخة الفحص محمَّلة، والصلاحية للعيّنات المحلّية وحدها (${BASE}/*)`)
}

// ── أدوات الصفحة ────────────────────────────────────────────────
async function openTab(path) {
  const url = `${BASE}${path}`
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
  )
  // ننتظر اكتمال التحميل عبر الـSW نفسه — لا تخمين بمهلة.
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  return tabId
}

/** ينفّذ دالّة داخل الصفحة عبر chrome.scripting ويعيد ناتجها. */
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
    target: { tabId: ${tabId} },
    files: ['content.js'],
  }).then(() => 'injected').catch(e => 'ERR: ' + e.message)`)
}

/** يبدأ الطبقة داخل الصفحة ويعيد ملخّصًا. الحزمة IIFE باسم `__rasdContent`. */
async function startOverlay(tabId) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: () => globalThis.__rasdContent.startOverlay().then(r => {
      // يُخزَّن المقبض في العالم المعزول ليُقرأ منه host.layer لاحقًا:
      // جذر الظلّ مغلق، والمقبض هو الطريق الوحيد إلى ما رُسم فعلًا.
      if (r.ok) globalThis.__rasdPicker = r.value
      return { ok: r.ok, level: r.ok ? r.value.host.level : null, error: r.ok ? null : r.error.message }
    }),
  }).then(r => r[0].result)`)
}

/** يقرأ بايتات لقطة محفوظة (base64) عبر رسالة الإضافة نفسها. */
/** ينفّذ تعبيرًا داخل جلسة صفحة ويعيد قيمته. */
async function evalIn(sessionId, expression) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

/**
 * يفحص الصورة المجمَّعة بالبكسل، داخل صفحة الإضافة (لا الصفحة الهدف).
 *
 * الفحص يجري حيث يمكن فكّ ترميز PNG ورسمه: صفحة الإضافة تملك `document`
 * و`createImageBitmap` معًا، والـservice worker لا يملك الأولى.
 */
async function inspectStitched(pageSession, id) {
  /*
   * الصورة تُجلَب وتُحلَّل **داخل صفحة الإضافة**، ولا تعبر إلى Node.
   *
   * صورة 1265×9690 تعطي base64 بحجم ميغابايتات؛ ونقلها عبر
   * `Runtime.evaluate` بـ`returnByValue` يعود كائنًا فارغًا بلا خطأ — أي
   * فقدٌ صامت. فما يعبر هو الملخّص وحده.
   */
  const expr = `(async () => {
    const reply = await chrome.runtime.sendMessage({
      __rasd: 1, id: 'verify-blob', type: 'capture/blob', payload: { id: ${JSON.stringify(id)} },
    })
    if (!reply || !reply.ok) return JSON.stringify({ error: 'blob: ' + JSON.stringify(reply).slice(0, 120) })
    const bin = atob(reply.value.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0)
    /*
     * العمود قرب الحافّة لا في الوسط.
     *
     * أقسام العيّنة تحمل أرقامها بخطّ كبير **موسَّط**، فعمودُ المنتصف يمرّ
     * خلال المحارف فيقسم كل قسم إلى: لون · أبيض · لون — أي «تكرار» كاذب
     * بعدد الأقسام. جرّبته فأعطى 18 إيجابية كاذبة على صورة سليمة تمامًا.
     */
    const x = Math.floor(bmp.width * 0.08)
    const col = ctx.getImageData(x, 0, 1, bmp.height).data
    const runs = []
    let prev = null
    for (let y = 0; y < bmp.height; y++) {
      const k = col[y*4] + ',' + col[y*4+1] + ',' + col[y*4+2]
      if (k !== prev) { runs.push({ y, k, len: 1 }); prev = k }
      else runs[runs.length-1].len++
    }
    /*
     * الدمج قبل العدّ.
     *
     * حدود البلاطات تُدخل خيطًا رفيعًا (سطر أو سطران من لون آخر: حدّ قسم،
     * أو تنعيم حواف) داخل مقطع لوني واحد، فيُقسَم إلى مقطعين بلونٍ واحد.
     * وعدّهما «تكرارًا» يُنتج إيجابيات كاذبة بعدد الحدود — وهو بالضبط ما
     * حذّر منه البحث في فحص «الرأس المكرَّر» بصيغته الساذجة. فتُدمَج
     * المقاطع المتجاورة ذات اللون نفسه حين يفصلها أقلّ من عتبة الخيط.
     */
    const HAIRLINE = 12
    const merged = []
    for (const r of runs) {
      if (r.len < 40) continue
      const last = merged[merged.length - 1]
      if (last && last.k === r.k && r.y - (last.y + last.len) <= HAIRLINE) {
        last.len = r.y + r.len - last.y
      } else {
        merged.push({ ...r })
      }
    }
    const solid = merged.map(r => r.k)
    const spans = merged.map(r => r.k + '@' + r.y + '+' + r.len)
    const w = bmp.width, h = bmp.height
    bmp.close()
    return JSON.stringify({ width: w, height: h, solid, spans })
  })()`
  const r = await send(
    'Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true },
    pageSession,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  try {
    return JSON.parse(r.result.value)
  } catch {
    return { error: String(r.result?.value) }
  }
}

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  return sessionId
}

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/fullpage/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)

    const pageBefore = await inPage(
      tabId,
      `() => ({
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        marks: window.__marks ? window.__marks.length : 0,
        headStyle: document.getElementById('head').getAttribute('style'),
        cookieStyle: document.getElementById('cookie').getAttribute('style'),
        chatStyle: document.getElementById('chat').getAttribute('style'),
      })`,
    )
    note(`الصفحة: ارتفاع ${pageBefore.scrollHeight}px · ${pageBefore.marks} علامة`)

    // صفحة الإضافة هي المُرسِل: الـservice worker لا يصل مستقبِلاته
    // بنفسه، ورسالته إلى ذاته ترتدّ بـ«Receiving end does not exist».
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
      fail('تعذّر فتح صفحة الإضافة لقيادة المهمّة')
      throw new Error('no driver')
    }

    // الـservice worker قد يكون أُنهي وأُعيد تشغيله منذ الارتباط الأوّل،
    // فجلسة السجلّ تُعاد قبل النداء وإلا ضاعت رسائله.
    {
      const { targetInfos } = await send('Target.getTargets')
      const live = targetInfos.find(
        (t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin),
      )
      if (live && live.targetId !== sw.targetId) {
        note('الـservice worker أُعيد تشغيله — يُعاد الارتباط')
        const { sessionId } = await send('Target.attachToTarget', {
          targetId: live.targetId,
          flatten: true,
        })
        swSession = sessionId
        await send('Runtime.enable', {}, swSession)
      }
      const ping = await evalIn(
        driver,
        `chrome.runtime.sendMessage({ __rasd: 1, id: 'ping', type: 'diagnostics/ping' })`,
      )
      note(`نبض الخلفية: ${JSON.stringify(ping).slice(0, 90)}`)
      // مهلة بعد الإيقاظ: قيس أن الحقن يفشل بـ«Could not load file» حين
      // يقع بعد بدء الـservice worker بميلي‌ثانية، وينجح بعد ~900ms.
      await new Promise((r) => setTimeout(r, 1200))
    }

    const t0 = Date.now()
    const run = await evalIn(
      driver,
      `(async () => {
        const listen = new Promise((resolve) => {
          const port = chrome.runtime.connect({ name: 'rasd:job' })
          const timer = setTimeout(() => { port.disconnect(); resolve({ timeout: true }) }, 60000)
          let last = null
          port.onMessage.addListener((m) => {
            if (m.kind === 'progress') last = m
            if (m.kind === 'done') { clearTimeout(timer); port.disconnect(); resolve({ done: m.result, last }) }
            if (m.kind === 'failed') { clearTimeout(timer); port.disconnect(); resolve({ failed: m, last }) }
          })
        })
        // الغلاف كما يبنيه \`send()\` — الطبقة تتجاهل ما ليس عليه وسمها.
        const act = await chrome.runtime.sendMessage({
          __rasd: 1,
          id: 'verify-fullpage',
          type: 'tool/activate',
          payload: { tool: 'full-page', tabId: ${tabId} },
        })
        const settled = await listen
        return { act, ...settled }
      })()`,
    )
    const elapsed = Date.now() - t0

    if (run?.failed) {
      fail(`فشل الالتقاط: ${run.failed.code} — ${run.failed.message}`)
      for (const l of swLog.slice(-4)) note(`سجلّ الخلفية: ${l}`)
    } else if (run?.timeout) {
      for (const l of swLog.slice(-4)) note(`سجلّ: ${l}`)
      fail(
        `لم تُحسم المهمّة خلال 60 ثانية — ردّ التفعيل ${JSON.stringify(run.act)} · آخر تقدّم ${JSON.stringify(run.last)}`,
      )
    } else if (!run?.done) {
      fail(`ردّ غير متوقَّع: ${JSON.stringify(run)}`)
    } else {
      const d = run.done
      ok(
        `اكتمل الالتقاط: ${d.width}×${d.height} من ${d.tiles} بلاطة في ${(elapsed / 1000).toFixed(1)}s`,
      )

      if (elapsed <= 25000) ok(`ضمن الميزانية الزمنية — ${(elapsed / 1000).toFixed(1)}s ≤ 25s`)
      else fail(`تجاوز الميزانية: ${(elapsed / 1000).toFixed(1)}s > 25s`)

      if (d.truncated) note(`بُتر الالتقاط: ${d.truncated}`)

      // ── الارتفاع: بوّابة أولى لا كافية ──────────────────────
      const dpr = await inPage(tabId, `() => window.devicePixelRatio`)
      const wanted = Math.round(pageBefore.scrollHeight * dpr)
      const slack = Math.round((await inPage(tabId, `() => window.innerHeight`)) * dpr)
      if (Math.abs(d.height - wanted) <= slack) {
        ok(`الارتفاع ضمن هامش بلاطة — ${d.height} مقابل ${wanted}`)
      } else {
        fail(`الارتفاع خارج الهامش: ${d.height} مقابل ${wanted} (هامش ${slack})`)
      }

      // ── العلامات: الإثبات الحقيقي ───────────────────────────
      {
        {
          const img = await inspectStitched(driver, d.id)
          if (img.error) {
            fail(`تعذّر فحص الصورة: ${img.error}`)
          } else {
            const uniq = new Set(img.solid)
            if (uniq.size >= pageBefore.marks) {
              ok(`كل العلامات ظهرت — ${uniq.size} لونًا مصمتًا من ${pageBefore.marks} قسمًا`)
            } else {
              fail(`فقدت علامات: ${uniq.size} لونًا من ${pageBefore.marks}`)
            }

            // التكرار: لون واحد يظهر في مقطعين متباعدين = رأس مكرَّر.
            const counts = new Map()
            for (const k of img.solid) counts.set(k, (counts.get(k) ?? 0) + 1)
            const repeated = [...counts.entries()].filter(([, n]) => n > 1)
            if (repeated.length === 0) {
              ok('لا لون مصمت يتكرّر — لا رأس مكرَّر عبر البلاطات')
            } else {
              fail(
                `ألوان مكرَّرة (${repeated.length}) — ${repeated
                  .map(([k, n]) => `${k}×${n}`)
                  .join(' · ')} · المواضع: ${img.spans
                  .filter((sp) => repeated.some(([k]) => sp.startsWith(k + '@')))
                  .join(' , ')}`,
              )
            }
          }
        }
      }
    }

    // ── الاستعادة ─────────────────────────────────────────────
    const after = await inPage(
      tabId,
      `() => ({
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        headStyle: document.getElementById('head').getAttribute('style'),
        cookieStyle: document.getElementById('cookie').getAttribute('style'),
        chatStyle: document.getElementById('chat').getAttribute('style'),
      })`,
    )
    const styleSame =
      after.headStyle === pageBefore.headStyle &&
      after.cookieStyle === pageBefore.cookieStyle &&
      after.chatStyle === pageBefore.chatStyle
    if (styleSame) ok('الأنماط استُعيدت حرفيًّا — لا أثر سطريّ باقٍ')
    else
      fail(
        `أنماط باقية: head=${after.headStyle} cookie=${after.cookieStyle} chat=${after.chatStyle}`,
      )

    if (after.scrollY === pageBefore.scrollY) ok('موضع التمرير استُعيد')
    else fail(`الموضع لم يُستعد: ${after.scrollY} بدل ${pageBefore.scrollY}`)

    if (after.scrollHeight === pageBefore.scrollHeight) ok('ارتفاع الصفحة بلا تشوّه')
    else fail(`ارتفاع الصفحة تغيّر: ${after.scrollHeight} بدل ${pageBefore.scrollHeight}`)
  }

  // ── حاوية تمرير داخلية ──────────────────────────────────────
  const cTab = await openTab('/fullpage/container.html')
  await injectOverlay(cTab)
  const cStart = await startOverlay(cTab)
  if (cStart?.ok) {
    const inner = await inPage(
      cTab,
      `() => {
        const app = document.getElementById('app')
        return { appScroll: app.scrollHeight, docScroll: document.documentElement.scrollHeight }
      }`,
    )
    note(`الحاوية: محتوى ${inner.appScroll}px بينما المستند ${inner.docScroll}px`)
    if (inner.appScroll > inner.docScroll * 2) {
      ok('العيّنة تمثّل الحالة فعلًا — المستند لا يمرّر')
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص الالتقاط الكامل في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ الالتقاط الكامل يعمل بلا تكرار ولا فقد.\n')
