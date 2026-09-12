#!/usr/bin/env node
/**
 * يثبت أن محرّك الألوان (المرحلة 13) يقرأ الحقيقة فوق Chrome حقيقي.
 *
 * **هذا السكربت ليس تكرارًا لاختبارات الوحدة بل الحَكَم فيما لا تراه.**
 * رياضيات `modules/colour/*` مُختبَرة على 111 حالة في happy-dom، لكن
 * happy-dom **لا يرسم بكسلًا واحدًا**. وأربعة أسئلة لا يجيب عنها إلّا
 * متصفّح يرسم فعلًا:
 *
 *   1. هل بايتات اللقطة تطابق ما يرسمه المتصفّح للون **خارج مدى sRGB**؟
 *      هذا هو السؤال الذي غيّر `formats.ts`: القياس أثبت أن كروم **يقصّ
 *      القنوات** ولا يخفض التشبّع كما توصي CSS Color 4. والاختبار هنا
 *      يقفل الباب على أي عودة عن ذلك.
 *   2. هل تطابق العيّنة قيمة CSS **تمامًا** حين لا شفافية ولا مزج؟ (نصّ
 *      معيار الاكتمال في المرحلة 13).
 *   3. هل تقرأ العيّنة ما لا تعرفه `getComputedStyle` أصلًا — تدرّجًا،
 *      وصورة، و`mix-blend-mode`، وطبقةً نصف شفّافة؟
 *   4. هل مقياس الصورة إلى النافذة مشتقٌّ صحيحًا (`scaleX`) بدل أن
 *      يُفترَض من `devicePixelRatio`؟
 *
 * عيّنة `colour/` مبنية لهذا: كل كتلة فيها حالة يفترق فيها المصدران أو
 * تُثبت تطابقهما، بمواضع ثابتة لا تحتاج قياسًا.
 *
 *   pnpm build && pnpm verify:colour
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './live-fixtures.mjs'
import { attachLiveServiceWorker } from './live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9341
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
const fixtures = await ensureFixturesServer({ port: FIXTURES })

const stage = mkdtempSync(join(tmpdir(), 'rasd-colour-ext-'))
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

const profile = mkdtempSync(join(tmpdir(), 'rasd-colour-'))
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
  fixtures.stop()
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
  // **ميزانية انتظار DevTools — ستّون ثانية لا عشر.** قِيس: كروم يُقلع على
  // عدّاء بنواتين تحت ضغط فلا يفتح منفذ التنقيح خلال 10s، فيخرج الحارس
  // «تعذّر الاتصال بـDevTools» — وهو إخفاق بيئة لا حكمٌ على المنتَج. والسقف
  // الحقيقي مهلةُ الخطوة (6 دقائق)، فانتظارٌ أطول يميّز «بطيء» من «ميّت».
  for (let i = 0; i < 240 && !wsUrl; i++) {
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

// ── تحميل الإضافة ────────────────────────────────────────────────
let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

/*
 * الارتباط بسياقٍ **حيّ** لا بهدفٍ موجود — انظر ترويسة `live-sw.mjs`:
 * الهدف يظهر قبل اكتمال إقلاع العامل، فيقع التقييم بلا ربط `chrome`.
 */
const { sw, swSession } = await attachLiveServiceWorker(send, extId)

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
      if (r.ok) globalThis.__rasdColour = r.value
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
    `() => { globalThis.__rasdColour.modes.set(${JSON.stringify(mode)}); return true }`,
  )

const pageRect = (tabId, selector) =>
  inPage(
    tabId,
    `() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
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

/** `modifiers`: قناع بتّات CDP — Alt=1، Ctrl=2، Meta=4، Shift=8. */
async function moveTo(pageSession, x, y, modifiers = 0) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse', modifiers },
    pageSession,
  )
  await settle(pageSession)
}

async function clickAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

/** الحالة الحيّة للأداة — من الإشارات مباشرة. */
const readColourState = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const c = globalThis.__rasdColour.colour.state
      const live = c.live.value
      const pinned = c.pinned.value
      return {
        loading: c.loading.value,
        error: c.error.value,
        live: live ? { point: live.point, pixel: live.pixel, patchLen: live.patch ? live.patch.length : null,
          patchCentre: live.patch ? live.patch[Math.floor(live.patch.length / 2)] : null } : null,
        pinned: pinned ? {
          source: pinned.source,
          hex: pinned.formats.hex,
          rgb: pinned.reading.rgb,
          pixelRgb: pinned.pixelReading.rgb,
          inSrgb: pinned.reading.inSrgb,
          mismatch: pinned.mismatch,
          tailwind: { verdict: pinned.tailwind.verdict, name: pinned.tailwind.name },
          declared: pinned.declared.map(d => ({ prop: d.prop, computed: d.computed, varName: d.trace ? d.trace.chain[0].name : null })),
          background: pinned.background ? { rgb: pinned.background.colour.rgb, assumedWhite: pinned.background.assumedWhite, sawImage: pinned.background.sawImage } : null,
          contrast: pinned.contrast ? { ratio: pinned.contrast.wcag.ratio, level: pinned.contrast.wcag.level, lc: pinned.contrast.lc } : null,
        } : null,
      }
    }`,
  )

/** ما رسمته الطبقة فعلًا — العدسة واللوحة. */
const readColourDrawn = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const layer = globalThis.__rasdColour.host.layer
      const badge = layer.querySelector('.rasd-ov-clp-hex')
      return {
        loupe: !!layer.querySelector('[data-rasd-ov="loupe"]'),
        panel: !!layer.querySelector('[data-rasd-ov="colour-panel"]'),
        idle: !!layer.querySelector('[data-rasd-ov="colour-idle"]'),
        crosshair: !!layer.querySelector('[data-rasd-ov="crosshair"]'),
        badge: badge ? badge.textContent.trim() : null,
        rows: [...layer.querySelectorAll('.rasd-ov-cp-row')].map(r => r.textContent.replace(/\\s+/g, ' ').trim()),
      }
    }`,
  )

/** ما يرسمه المتصفّح لقيمة CSS — قماش sRGB، وهو مرجع الحقيقة. */
const canvasHex = (tabId, css) =>
  inPage(
    tabId,
    `() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 4
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = ${JSON.stringify(css)}
      ctx.fillRect(0, 0, 4, 4)
      const d = ctx.getImageData(1, 1, 1, 1).data
      const h = n => n.toString(16).padStart(2, '0')
      return '#' + h(d[0]) + h(d[1]) + h(d[2])
    }`,
  )

const centreOf = (r) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/colour/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)
    const pageSession = await attachToPage('/colour/')
    if (!pageSession) fail('تعذّر الاتصال بهدف الصفحة.')
    else {
      // اللوحة الخاملة قبل أي عيّنة.
      await setMode(tabId, 'colour')
      let drawn = await readColourDrawn(tabId)
      if (drawn.idle) ok('لوحة الخمول معروضة قبل أوّل عيّنة')
      else fail(`لا لوحة خمول: ${JSON.stringify(drawn)}`)

      // اللقطة تُطلب عند دخول الوضع — تحتاج جولة رسائل فتُنتظر.
      const solid = await pageRect(tabId, '#solid')
      const p = centreOf(solid)
      await moveTo(pageSession, p.x, p.y)
      let st = null
      for (let i = 0; i < 40; i++) {
        st = await readColourState(tabId)
        if (st.live?.pixel) break
        await moveTo(pageSession, p.x + (i % 2), p.y)
        await new Promise((r) => setTimeout(r, 150))
      }

      if (st?.live?.pixel) {
        ok(`اللقطة وصلت وفُكّت — البكسل تحت المؤشِّر ${JSON.stringify(st.live.pixel)}`)
      } else {
        fail(`لم تصل لقطة: ${JSON.stringify(st)}`)
      }

      // ── 1) العيّنة تطابق قيمة CSS تمامًا بلا شفافية ولا مزج ───
      if (st?.live?.pixel) {
        const px = st.live.pixel
        if (px.r === 255 && px.g === 0 && px.b === 0) {
          ok('العيّنة على لون معتم صريح تطابق التصريح بالضبط: rgb(255, 0, 0)')
        } else {
          fail(`العيّنة على #solid أعطت ${JSON.stringify(px)} بدل (255,0,0)`)
        }
      }

      // ── 2) رقعة العدسة: 21×21 ومركزها هو البكسل نفسه ──────────
      if (st?.live) {
        if (st.live.patchLen === 441) ok('رقعة العدسة 21×21 = 441 بكسلًا')
        else fail(`طول الرقعة ${st.live.patchLen} لا 441`)
        const c = st.live.patchCentre
        if (c && c.r === st.live.pixel.r && c.g === st.live.pixel.g && c.b === st.live.pixel.b) {
          ok('مركز الرقعة هو البكسل المعروض نفسه — الشبكة متمركزة على المؤشِّر')
        } else {
          fail(`مركز الرقعة ${JSON.stringify(c)} يخالف البكسل ${JSON.stringify(st.live.pixel)}`)
        }
      }

      // العدسة والخطّان مرسومان.
      drawn = await readColourDrawn(tabId)
      if (drawn.loupe && drawn.crosshair) ok('العدسة وخطّا التصويب مرسومان مع الحركة')
      else fail(`لا عدسة/خطوط: ${JSON.stringify(drawn)}`)
      if (drawn.badge === '#FF0000') ok('الشارة السداسية تحت العدسة تعرض #FF0000')
      else fail(`الشارة تعرض ${JSON.stringify(drawn.badge)}`)

      // ── 3) التثبيت بنقرة يبني التحليل الكامل ──────────────────
      await clickAt(pageSession, p.x, p.y)
      st = await readColourState(tabId)
      if (st.pinned?.hex === '#ff0000' && st.pinned.source === 'pixel') {
        ok('النقرة ثبّتت العيّنة من البكسل (#ff0000)')
      } else {
        fail(`التثبيت أعطى ${JSON.stringify(st.pinned)}`)
      }
      if (st.pinned && st.pinned.mismatch === false) {
        ok('لا اختلاف معلَن — البكسل يطابق التصريح كما يجب')
      } else {
        fail(`اختلاف معلَن زورًا على لون معتم: ${JSON.stringify(st.pinned?.mismatch)}`)
      }
      drawn = await readColourDrawn(tabId)
      if (drawn.panel && drawn.rows.length === 5) {
        ok(`اللوحة معروضة بصيغها الخمس: ${drawn.rows.length} صفوف`)
      } else {
        fail(`اللوحة/الصفوف: ${JSON.stringify(drawn)}`)
      }

      // ── 4) اللون خارج المدى — الحَكَم على قرار `formats.ts` ────
      const wide = await pageRect(tabId, '#wide')
      const wp = centreOf(wide)
      await moveTo(pageSession, wp.x, wp.y)
      await clickAt(pageSession, wp.x, wp.y)
      st = await readColourState(tabId)
      const browserHex = await canvasHex(tabId, 'oklch(72.3% 0.219 149.579)')
      if (st.pinned?.hex === browserHex) {
        ok(`لون خارج مدى sRGB: العيّنة ${st.pinned.hex} تطابق ما يرسمه المتصفّح بالضبط`)
      } else {
        fail(`العيّنة ${st.pinned?.hex} بينما المتصفّح يرسم ${browserHex} — قرار القصّ خاطئ`)
      }
      if (st.pinned?.mismatch === false) {
        ok('ولا يُعلَن اختلاف: قراءة CSS تقصّ بالطريق نفسه')
      } else {
        fail('اختلاف معلَن بين قراءتين للقيمة نفسها — الطريقان افترقا')
      }

      // ── 5) تدرّج: `getComputedStyle` لا يعرفه والبكسل يعرفه ────
      const grad = await pageRect(tabId, '#gradient')
      const gp = { x: Math.round(grad.x + 10), y: Math.round(grad.y + grad.h / 2) }
      await moveTo(pageSession, gp.x, gp.y)
      await clickAt(pageSession, gp.x, gp.y)
      st = await readColourState(tabId)
      const bgDecl = st.pinned?.declared.find((d) => d.prop === 'background-color')
      if (st.pinned && !bgDecl) {
        ok('تدرّج: لا `background-color` مصرَّحة أصلًا — البكسل هو المصدر الوحيد')
      } else {
        fail(`تدرّج: تصريح غير متوقَّع ${JSON.stringify(bgDecl)}`)
      }
      if (st.pinned?.background?.sawImage === true) {
        ok('وصورة الخلفية معلَنة حدًّا (`sawImage`) لا مبتلَعة')
      } else {
        fail('لم تُعلَن صورة الخلفية')
      }

      // ── 6) طبقة نصف شفّافة: أسود 50% فوق أبيض = 128 ───────────
      const under = await pageRect(tabId, '#under')
      const up2 = centreOf(under)
      await moveTo(pageSession, up2.x, up2.y)
      await clickAt(pageSession, up2.x, up2.y)
      st = await readColourState(tabId)
      const px = st.pinned?.pixelRgb
      if (px && near(px.r, 128, 1) && near(px.g, 128, 1) && near(px.b, 128, 1)) {
        ok(`تركيب الشفافية الحقيقي: أسود 50% فوق أبيض يعطي ${px.r} (المتوقَّع 128)`)
      } else {
        fail(`تركيب الشفافية أعطى ${JSON.stringify(px)}`)
      }
      if (st.pinned?.mismatch === true) {
        ok('والاختلاف بين البكسل والتصريح معلَن — وهو المعلومة لا العطل')
      } else {
        fail('لم يُعلَن الاختلاف رغم وجود طبقة فوق العنصر')
      }

      // ── 7) `⌥` يبدّل المصدر إلى التصريح ───────────────────────
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: up2.x,
          y: up2.y,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
          modifiers: 1,
        },
        pageSession,
      )
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: up2.x,
          y: up2.y,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
          modifiers: 1,
        },
        pageSession,
      )
      await settle(pageSession)
      st = await readColourState(tabId)
      if (st.pinned?.source === 'css') {
        ok(`⌥+نقرة بدّلت المصدر إلى التصريح (${st.pinned.hex})`)
      } else {
        fail(`⌥ لم يبدّل المصدر: ${JSON.stringify(st.pinned?.source)}`)
      }
      if (st.pinned?.mismatch === true) {
        ok('والاختلاف ما زال معلَنًا — المقارنة على البكسل لا على المعروض')
      } else {
        fail('⌥ أخفى الاختلاف — المقارنة صارت على المعروض بنفسه')
      }

      // ── 8) المزج: ناتج لا يعرفه أي تصريح ──────────────────────
      const blend = await pageRect(tabId, '#blend-base')
      const bp = centreOf(blend)
      await moveTo(pageSession, bp.x, bp.y)
      await clickAt(pageSession, bp.x, bp.y)
      st = await readColourState(tabId)
      // أصفر × سماوي بـmultiply = أخضر (0,255,0).
      const bpx = st.pinned?.pixelRgb
      if (bpx && bpx.r === 0 && bpx.g === 255 && bpx.b === 0) {
        ok('mix-blend-mode: البكسل يعطي ناتج المزج (0,255,0) وهو ما لا يعرفه أي تصريح')
      } else {
        fail(`المزج أعطى ${JSON.stringify(bpx)} بدل (0,255,0)`)
      }

      // ── 9) الخلفية على جدّ + التباين ─────────────────────────
      const leaf = await pageRect(tabId, '#leaf')
      const lp = centreOf(leaf)
      await moveTo(pageSession, lp.x, lp.y)
      await clickAt(pageSession, lp.x, lp.y)
      st = await readColourState(tabId)
      const bg = st.pinned?.background
      if (bg && bg.rgb.r === 0 && bg.rgb.g === 128 && bg.rgb.b === 0 && bg.assumedWhite === false) {
        ok('الخلفية الفعلية وُجدت على الجدّ (0,128,0) بلا افتراض أبيض')
      } else {
        fail(`الصعود أعطى ${JSON.stringify(bg)}`)
      }
      if (st.pinned?.contrast && st.pinned.contrast.ratio > 1) {
        ok(
          `التباين محسوب على الخلفية الحقيقية: ${st.pinned.contrast.ratio.toFixed(2)} : 1 (${st.pinned.contrast.level})`,
        )
      } else {
        fail(`لا تباين محسوب: ${JSON.stringify(st.pinned?.contrast)}`)
      }

      // ── 10) المتغيّر يُتتبَّع إلى اسمه ────────────────────────
      const varBg = await pageRect(tabId, '#var-bg')
      const vp = centreOf(varBg)
      await moveTo(pageSession, vp.x, vp.y)
      await clickAt(pageSession, vp.x, vp.y)
      st = await readColourState(tabId)
      const traced = st.pinned?.declared.find((d) => d.varName === '--brand')
      if (traced) ok(`المتغيّر مُتتبَّع: ${traced.prop} ← --brand`)
      else fail(`لم يُتتبَّع --brand: ${JSON.stringify(st.pinned?.declared)}`)

      // ── 11) تسمية Tailwind على درجات حقيقية مرسومة ────────────
      const blueSwatch = await pageRect(tabId, '.tw-blue')
      const swp = centreOf(blueSwatch)
      await moveTo(pageSession, swp.x, swp.y)
      await clickAt(pageSession, swp.x, swp.y)
      st = await readColourState(tabId)
      if (st.pinned?.tailwind.verdict === 'exact' && st.pinned.tailwind.name === 'blue-500') {
        ok('درجة Tailwind مرسومة فعلًا تُسمّى blue-500 تطابقًا تامًّا')
      } else {
        fail(`تسمية الدرجة: ${JSON.stringify(st.pinned?.tailwind)}`)
      }

      // ── 12) الخروج من الوضع ينظّف ────────────────────────────
      await setMode(tabId, 'idle')
      drawn = await readColourDrawn(tabId)
      if (!drawn.loupe && !drawn.panel && !drawn.idle) {
        ok('الخروج من الوضع يمحو العدسة واللوحة معًا')
      } else {
        fail(`رسوم باقية بعد الخروج: ${JSON.stringify(drawn)}`)
      }
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص محرّك الألوان في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ محرّك الألوان يقرأ الحقيقة فوق Chrome حقيقي.\n')
