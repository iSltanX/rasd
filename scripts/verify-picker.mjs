#!/usr/bin/env node
/**
 * يثبت أن استهداف العناصر يعمل فوق Chrome حقيقي — وهو ما لا يقدّمه Vitest.
 *
 * happy-dom بلا محرّك تخطيط ولا اختبار إصابة ولا `elementsFromPoint`، فكل
 * ادّعاءات المرحلة 9 عن دقّة الحدود واختراق الظلّ والنزول في الإطارات
 * وسرعة الإطار تُقاس هنا أو لا تُقاس.
 *
 * القراءة تجري على **المخرَج المرسوم** لا على حالة داخلية: مقبض التشغيل
 * يعطي `host.layer`، فتُقاس حدود عنصر الإبراز نفسه كما رسمه المتصفّح.
 *
 *   pnpm build && pnpm verify:picker
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9336
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

// نسخة الفحص: `dist/` كما هي + صلاحية مضيف للعيّنات المحلّية.
const stage = mkdtempSync(join(tmpdir(), 'rasd-picker-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
manifest.host_permissions = ['http://127.0.0.1/*']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-picker-'))
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

/** ينفّذ دالّة في العالم المعزول حيث يعيش مقبض الطبقة. */
async function inOverlay(tabId, fnSource) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: ${fnSource},
  }).then(r => r[0].result)`)
}

/** يضبط وضع الطبقة. */
const setMode = (tabId, mode) =>
  inOverlay(
    tabId,
    `() => { globalThis.__rasdPicker.modes.set(${JSON.stringify(mode)}); return true }`,
  )

/** حدود عنصر الإبراز كما رسمه المتصفّح، ونصّ البطاقة. */
const readOverlay = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const layer = globalThis.__rasdPicker.host.layer
      const hl = layer.querySelector('[data-rasd-ov="element-highlight"]')
      const label = layer.querySelector('[data-rasd-ov="node-label"]')
      const r = hl ? hl.getBoundingClientRect() : null
      return {
        drawn: !!hl,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        label: label ? label.textContent : null,
        actions: layer.querySelectorAll('[data-rasd-ov="quick-actions"] button').length,
      }
    }`,
  )

/** حدود عنصر في الصفحة، للمقارنة. */
const pageRect = (tabId, selector) =>
  inPage(
    tabId,
    `() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }`,
  )

// ── جلسة الصفحة، لإرسال أحداث مؤشِّر حقيقية ─────────────────────
async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  return sessionId
}

async function moveTo(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse' },
    pageSession,
  )
  // إطاران: الأوّل يعالج الحدث، والثاني يلتزم بالرسمة.
  await send(
    'Runtime.evaluate',
    {
      expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
      awaitPromise: true,
    },
    pageSession,
  )
}

const near = (a, b, tol = 2) => a !== null && b !== null && Math.abs(a - b) <= tol
const rectNear = (a, b, tol = 2) =>
  !!a &&
  !!b &&
  near(a.x, b.x, tol) &&
  near(a.y, b.y, tol) &&
  near(a.w, b.w, tol) &&
  near(a.h, b.h, tol)

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/picker/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)
    await setMode(tabId, 'element')
    const pageSession = await attachToPage('/picker/')
    if (!pageSession) fail('تعذّر الاتصال بهدف الصفحة — لا يمكن إرسال أحداث مؤشِّر.')
    else {
      const nodes = await inPage(tabId, `() => document.getElementsByTagName('*').length`)
      note(`الصفحة: ${nodes} عقدة`)

      // ── 1) هدف عادي: الإبراز يطابق العنصر ─────────────────────
      await moveTo(pageSession, 140, 70)
      let ov = await readOverlay(tabId)
      let want = await pageRect(tabId, '#plain')
      if (rectNear(ov.rect, want)) ok(`الإبراز يطابق العنصر العادي (${want.w}×${want.h})`)
      else
        fail(`الإبراز لا يطابق: رُسم ${JSON.stringify(ov.rect)} والمتوقَّع ${JSON.stringify(want)}`)

      if (ov.actions === 2) ok('رقاقتان فقط — لا وعد بما لا محرّك له')
      else fail(`عدد الإجراءات ${ov.actions} والمتوقَّع 2`)

      // ── 2) التحويلات ──────────────────────────────────────────
      await moveTo(pageSession, 140, 190)
      ov = await readOverlay(tabId)
      want = await pageRect(tabId, '#scaled')
      if (rectNear(ov.rect, want)) ok(`الحدود تعكس scale(2) — ${want.w}×${want.h}`)
      else fail(`scale: رُسم ${JSON.stringify(ov.rect)} والمتوقَّع ${JSON.stringify(want)}`)

      await moveTo(pageSession, 390, 165)
      ov = await readOverlay(tabId)
      want = await pageRect(tabId, '#rotated')
      if (rectNear(ov.rect, want)) ok(`الحدود تعكس rotate(45°) — صندوق محيط ${want.w}×${want.h}`)
      else fail(`rotate: رُسم ${JSON.stringify(ov.rect)} والمتوقَّع ${JSON.stringify(want)}`)

      // ── 3) القصّ: الفجوة المُعلَنة ─────────────────────────────
      await moveTo(pageSession, 200, 350)
      ov = await readOverlay(tabId)
      want = await pageRect(tabId, '#clipped')
      if (rectNear(ov.rect, want)) {
        note(
          `القصّ لا يُختصَر: الإبراز ${ov.rect.w}px بينما المرئي ~100px — حدّ مُعلَن (المرحلة 12)`,
        )
      } else {
        note(`القصّ: رُسم ${JSON.stringify(ov.rect)}`)
      }

      // ── 4) اختراق الظلّ المتعشّش ───────────────────────────────
      await moveTo(pageSession, 100, 460)
      ov = await readOverlay(tabId)
      if (ov.label && ov.label.includes('leaf')) ok(`اخترق ظلّين متعشّشين — البطاقة: ${ov.label}`)
      else fail(`الظلّ: البطاقة ${JSON.stringify(ov.label)} ولا تذكر الورقة`)

      // ── 5) النزول في إطار مطابق للأصل ─────────────────────────
      // الإطار عند (340,430) بحدّ 10px ⇒ أصل المحتوى (350,440).
      // العنصر الداخلي عند (20,100) محلّيًا ⇒ (370,540) في الأعلى.
      await moveTo(pageSession, 400, 555)
      ov = await readOverlay(tabId)
      if (rectNear(ov.rect, { x: 370, y: 540, w: 120, h: 40 }, 3)) {
        ok('نزل في الإطار المطابق للأصل وترجم الإحداثيات (370,540 · 120×40)')
      } else {
        fail(`الإطار: رُسم ${JSON.stringify(ov.rect)} والمتوقَّع {x:370,y:540,w:120,h:40}`)
      }

      // ── 6) المشي في الشجرة ↑↓ ─────────────────────────────────
      await moveTo(pageSession, 140, 70)
      const before = (await readOverlay(tabId)).rect
      await send(
        'Input.dispatchKeyEvent',
        { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
        pageSession,
      )
      await send(
        'Runtime.evaluate',
        {
          expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
          awaitPromise: true,
        },
        pageSession,
      )
      const up = (await readOverlay(tabId)).rect
      if (up && before && (up.w > before.w || up.h > before.h))
        ok(`↑ صعد إلى الأب (${before.w}×${before.h} ← ${up.w}×${up.h})`)
      else fail(`↑ لم يصعد: ${JSON.stringify(before)} → ${JSON.stringify(up)}`)

      await send(
        'Input.dispatchKeyEvent',
        { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
        pageSession,
      )
      await send(
        'Runtime.evaluate',
        {
          expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
          awaitPromise: true,
        },
        pageSession,
      )
      const down = (await readOverlay(tabId)).rect
      if (rectNear(down, before)) ok('↓ عاد إلى نقطة البدء — التنقّل انعكاسي')
      else fail(`↓ أعطى ${JSON.stringify(down)} بينما البدء ${JSON.stringify(before)}`)

      // ── 6.5) البند 51 — التمرير التلقائي في المشي إلى أب خارج النافذة ──
      // الهدف: تمرير الصفحة إلى موضع يُبقي `#offscreen-child` مرئيًا قرب
      // أعلى النافذة بينما `#offscreen-parent` الأوسع يبدأ فوق حافّتها —
      // يُحسَب من مستطيلي الصفحة الفعليَّين لا رقمًا ثابتًا، فلا ينكسر
      // باختلاف ارتفاع نافذة المتصفّح الفعلي.
      const vh = await inPage(tabId, `() => window.innerHeight`)
      const childPage = await pageRect(tabId, '#offscreen-child')
      const scrollTarget = childPage.y - 20
      await send(
        'Runtime.evaluate',
        { expression: `window.scrollTo(0, ${scrollTarget})` },
        pageSession,
      )
      const actualScroll = await inPage(tabId, `() => window.scrollY`)
      await moveTo(pageSession, childPage.x + childPage.w / 2, childPage.y - actualScroll + childPage.h / 2)
      const childOv = (await readOverlay(tabId)).rect
      if (childOv && childOv.y < vh && childOv.y >= 0) {
        ok(`الابن مرئي بعد تمرير الصفحة يدويًا (y=${childOv.y})`)
        const parentBefore = await pageRect(tabId, '#offscreen-parent')
        const parentBeforeViewportY = parentBefore.y - actualScroll
        if (parentBeforeViewportY >= 0) {
          fail(`الإعداد فاسد: الأب مرئيّ أصلًا (y=${parentBeforeViewportY}) — لا يختبر شيئًا`)
        } else {
          await send(
            'Input.dispatchKeyEvent',
            { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
            pageSession,
          )
          await send(
            'Runtime.evaluate',
            {
              expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
              awaitPromise: true,
            },
            pageSession,
          )
          const parentOv = (await readOverlay(tabId)).rect
          if (parentOv && parentOv.y >= 0 && parentOv.y + parentOv.h <= vh) {
            ok(`↑ إلى أب خارج النافذة مرّر الصفحة تلقائيًا — صار كاملًا مرئيًا (y=${parentOv.y}, h=${parentOv.h})`)
          } else {
            fail(
              `التمرير التلقائي لم يقع: الأب بعد المشي ${JSON.stringify(parentOv)} والنافذة ${vh}px — كان قبل المشي ${JSON.stringify(parentBefore)}`,
            )
          }
        }
      } else {
        fail(`تعذّر تهيئة الاختبار: الابن بعد تمرير الصفحة ${JSON.stringify(childOv)}`)
      }
      await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' }, pageSession)

      // ── 7) الأداء فوق منطقة الضغط ─────────────────────────────
      const perf = await send(
        'Runtime.evaluate',
        {
          expression: `(async () => {
            const times = []
            let last = performance.now()
            let raf = 0
            const tick = () => { const n = performance.now(); times.push(n - last); last = n; raf = requestAnimationFrame(tick) }
            raf = requestAnimationFrame(tick)
            await new Promise(r => setTimeout(r, 1200))
            cancelAnimationFrame(raf)
            times.sort((a,b) => a-b)
            return { frames: times.length, median: times[Math.floor(times.length/2)], p95: times[Math.floor(times.length*0.95)] }
          })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        pageSession,
      )
      // حركة مستمرّة فوق منطقة الـ5000 عقدة أثناء القياس
      for (let i = 0; i < 40; i++) {
        await send(
          'Input.dispatchMouseEvent',
          { type: 'mouseMoved', x: 700 + (i % 200), y: 60 + (i % 120), pointerType: 'mouse' },
          pageSession,
        )
      }
      const p = perf.result?.value
      if (p) {
        const fps = 1000 / p.median
        if (fps >= 55)
          ok(
            `الإطار فوق ${nodes} عقدة: وسيط ${p.median.toFixed(1)}ms ⇒ ${fps.toFixed(0)}fps (p95 ${p.p95.toFixed(1)}ms)`,
          )
        else
          fail(`الإطار بطيء: وسيط ${p.median.toFixed(1)}ms ⇒ ${fps.toFixed(0)}fps — الشرط ≥55fps`)
      }

      // ── 8) الخروج يُنظّف ──────────────────────────────────────
      await setMode(tabId, 'idle')
      ov = await readOverlay(tabId)
      if (!ov.drawn) ok('الخروج من الوضع يمحو الإبراز')
      else fail('الإبراز باقٍ بعد الخروج من الوضع')
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص منتقي العناصر في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ الاستهداف دقيق وسريع فوق Chrome حقيقي.\n')
