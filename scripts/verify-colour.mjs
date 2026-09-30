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
 * **وتدقيق تباين الصفحة (`STAGES/14`)** بنقرات حقيقية من لوحة خمول الفحص: عيّنة
 * `contrast-5000/cases.html` بحالاتٍ معروفة القيمة — النسب تُقارَن بصيغة WCAG
 * مكتوبةٍ هنا على الألوان المصرَّحة، وللمركَّبة على بكسلات لقطة الشاشة نفسها، لا بمخرَج
 * الإضافة — ثمّ القفز
 * إلى نصٍّ تحت الطيّ و«سجّلها مشكلة»، ثمّ `contrast-5000/` بخمسة آلاف نصّ تحت
 * 150ms، ونسختها بخمسين ألفًا تُظهر التقدّم وتُلغى بنقرة.
 *
 *   pnpm build && pnpm verify:colour
 *   RASD_BREAK_AUDIT=1 pnpm verify:colour   # يجب أن يفشل: التدقيق يتجاهل `opacity`
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
const BREAK_AUDIT = process.env.RASD_BREAK_AUDIT === '1'
/** معيار القبول في `STAGES/14`: مسح عيّنة الخمسة آلاف. */
const AUDIT_BUDGET_MS = 150

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

/**
 * ترقيع الحالة السالبة للتدقيق: قراءة `opacity` في قارئ التباين تُستبدل بخاصيةٍ لا تُقرأ رقمًا، فتسقط
 * شفافية المجموعات ويُقرأ نصٌّ داخل حاويةٍ نصف شفّافة على خلفيتها المعتمة.
 *
 * **ويرمي بصوتٍ عالٍ إن لم يجد نمطه مرّة واحدة بالضبط** — ترقيعٌ صامت يُنتج حارسًا أخضر لأنه لم يكسر
 * شيئًا. نفس حكم `RASD_BREAK_STATUS` في `verify-issues.mjs`.
 */
if (BREAK_AUDIT) {
  const contentPath = join(stage, 'content.js')
  const src = readFileSync(contentPath, 'utf8')
  const hits = src.split('.opacity,1)').length - 1
  if (hits !== 1) {
    console.error(
      `RASD_BREAK_AUDIT: قراءة opacity في قارئ التباين وُجدت ${hits} مرّة لا مرّة — عدِّل النمط.`,
    )
    rmSync(stage, { recursive: true, force: true })
    fixtures.stop()
    process.exit(1)
  }
  writeFileSync(contentPath, src.replace('.opacity,1)', '.zIndex,1)'))
}

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

// ── 13–16) تدقيق تباين الصفحة (`STAGES/14`) ────────────────────────
/** صيغة WCAG 2.2 مكتوبةٌ هنا — الحَكَم مستقلٌّ عن `modules/colour/contrast.ts`. */
const luminance = ({ r, g, b }) => {
  const f = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const wcag = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const grey = (v) => ({ r: v, g: v, b: v })
const WHITE = grey(255)

/**
 * البكسل المرسوم فعلًا: لقطة شاشة الصفحة تفكّها الصفحة نفسها في قماش، ثمّ يُقرأ لكل نصٍّ مركَّب بكسلان —
 * مركز «█» في أوّله (لون النصّ) وطرف فقرته الأيسر (خلفيته).
 */
async function renderedPair(pageSession, ids) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, pageSession)
  const res = await send(
    'Runtime.evaluate',
    {
      expression: `(async () => {
        const img = new Image(); img.src = 'data:image/png;base64,${data}'; await img.decode()
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
        const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0)
        const k = img.width / innerWidth
        const at = (x, y) => { const d = ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return { r: d[0], g: d[1], b: d[2] } }
        const out = {}
        for (const id of ${JSON.stringify(ids)}) {
          const el = document.getElementById(id)
          const box = el.getBoundingClientRect()
          const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 1)
          const glyph = range.getBoundingClientRect()
          out[id] = { fg: at(glyph.left + glyph.width / 2, glyph.top + glyph.height / 2), bg: at(box.left + 4, box.top + box.height / 2) }
        }
        return out
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
    pageSession,
  )
  return res.result.value
}

/** نسبةٌ على بعد بايتٍ من البكسل المرسوم — أدنى وأعلى ما يُقبل. */
const byteBand = (fg, bg) => {
  const shift = (c, d) => ({ r: c.r + d, g: c.g + d, b: c.b + d })
  const all = [-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => wcag(shift(fg, a), shift(bg, b))))
  return [Math.min(...all), Math.max(...all)]
}

const auditState = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const a = globalThis.__rasdColour.audit.state
      return {
        open: a.open.value, phase: a.phase.value, done: a.done.value, total: a.total.value,
        texts: a.texts.value, elapsed: a.elapsed.value, selected: a.selected.value, box: a.box.value,
        findings: a.findings.value.map(f => ({ severity: f.severity, label: f.label, ratio: f.ratio, unknown: f.unknown, large: f.large })),
      }
    }`,
  )

/** مركز عنصرٍ في الطبقة بمعرّفه — والصفّ يُختار بنصّه. */
const overlayPoint = (tabId, id, text = null) =>
  inOverlay(
    tabId,
    `() => {
      const all = [...globalThis.__rasdColour.host.layer.querySelectorAll('[data-rasd-ov="${id}"]')]
      const el = ${JSON.stringify(text)} === null ? all[0] : all.find(e => e.textContent.includes(${JSON.stringify(text)}))
      if (!el) return null
      el.scrollIntoView({ block: 'nearest' })
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    }`,
  )

async function waitAudit(tabId, done, ms = 10_000) {
  const until = Date.now() + ms
  let st = await auditState(tabId)
  while (!done(st) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 10))
    st = await auditState(tabId)
  }
  return st
}

/** يفتح عيّنةً ويشغّل الطبقة ويدخل وضع الفحص — ويُرجع جلسة الصفحة للنقر الحقيقي. */
async function openAuditPage(path) {
  const tabId = await openTab(path)
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)
  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة على ${path}: ${injected} / ${JSON.stringify(started)}`)
    return null
  }
  const pageSession = await attachToPage(path)
  if (!pageSession) {
    fail(`تعذّر الاتصال بهدف ${path}.`)
    return null
  }
  await setMode(tabId, 'inspect')
  await settle(pageSession)
  return { tabId, pageSession }
}

/** نقرةٌ حقيقية على عنصرٍ في الطبقة — `false` إن لم يُرسم. */
async function tapOverlay(page, id, text = null) {
  const p = await overlayPoint(page.tabId, id, text)
  if (!p) return false
  await clickAt(page.pageSession, p.x, p.y)
  return true
}

if (extId && sw && granted) {
  // ── 13) الحالات المعروفة: من لوحة خمول الفحص إلى النتائج بنقرتين ────
  const cases = await openAuditPage('/contrast-5000/cases.html')
  if (cases) {
    // البكسلات قبل أي نقرة: لا إبراز ولا إطار فوق الصفحة بعد.
    const rendered = await renderedPair(cases.pageSession, ['veil', 'grouped', 'alpha']).catch(
      () => null,
    )
    if (!(await tapOverlay(cases, 'audit-open'))) {
      fail('لا مدخل «دقّق تباين الصفحة» في لوحة خمول الفحص')
    } else if (!(await tapOverlay(cases, 'audit-start'))) {
      fail('لوحة التدقيق لم تُفتح بالنقر على مدخلها')
    } else {
      const st = await waitAudit(cases.tabId, (s) => s.phase !== 'scanning')
      if (st.phase === 'done') ok(`التدقيق بدأ بنقرتين حقيقيتين وانتهى (${st.texts} نصًّا ظاهرًا)`)
      else fail(`التدقيق لم ينتهِ: ${JSON.stringify(st.phase)}`)

      if (st.texts === 18)
        ok('النصوص الظاهرة ثمانية عشر — المخفيّ والمقصوص والمدفوع خارج الصفحة لا تُعدّ')
      else fail(`النصوص الظاهرة ${st.texts} لا 18`)

      // الحَكَم: صيغة WCAG هنا على الألوان المصرَّحة، وللمركَّبة على ما رُسم فعلًا قبل أي إبراز.
      const px = rendered ?? {}
      const failing = [
        ['#fill', 'below-3', grey(204), WHITE, 'ملء -webkit-text-fill-color لا color'],
        ['#in-shadow', 'below-3', grey(187), WHITE, 'نصٌّ في جذر ظلّ مفتوح'],
        ['#faint', 'below-3', grey(170), WHITE, 'رماديّ فاتح'],
        ['#big-fail', 'below-3', grey(170), WHITE, 'نصٌّ كبير دون حدّه 3'],
        ['#contents', 'below-3', grey(170), WHITE, 'نصٌّ في غلاف display: contents'],
        ['#bare-host', 'below-3', grey(187), WHITE, 'نصٌّ ابنٌ مباشر لجذر ظلّ'],
        ['#below-fold', 'below-3', grey(153), WHITE, 'نصٌّ تحت الطيّ'],
        ['#veil', 'below-4.5', px.veil?.fg, px.veil?.bg, 'طبقة سوداء 50% فوق الأبيض'],
        ['#grouped', 'below-4.5', px.grouped?.fg, px.grouped?.bg, 'حاوية سوداء بـopacity 0.5'],
        ['#alpha', 'below-4.5', px.alpha?.fg, px.alpha?.bg, 'لون نصّ بألفا 0.5'],
        ['#mid', 'below-4.5', grey(119), WHITE, 'رماديّ متوسّط'],
      ]
      const unknown = {
        '#on-image': 'image',
        '#on-gradient': 'gradient',
        '#over-img': 'overlap',
        '#on-p3': 'unreadable',
      }
      const byLabel = new Map(st.findings.map((f) => [f.label, f]))
      for (const [label, severity, fg, bg, what] of failing) {
        const f = byLabel.get(label)
        if (!fg || !bg) {
          fail(`${what} (${label}): لم يُقرأ البكسل المرسوم`)
          continue
        }
        // على بعد بايتٍ من المرسوم: الحَكَم البكسل، والتقريب إلى بايت حدّ قراءته.
        const [lo, hi] = byteBand(fg, bg)
        const drawn = `${JSON.stringify(fg)} على ${JSON.stringify(bg)}`
        const inBand = f?.ratio != null && f.ratio >= lo - 1e-9 && f.ratio <= hi + 1e-9
        if (f?.severity === severity && inBand) {
          ok(`${what} (${label}): ${f.ratio.toFixed(2)} : 1 والمرسوم ${drawn} ⟵ ${severity}`)
        } else {
          fail(
            `${what} (${label}): ${JSON.stringify(f)} والمتوقَّع ${severity} في [${lo.toFixed(3)}, ${hi.toFixed(3)}] — المرسوم ${drawn}`,
          )
        }
      }
      if (byLabel.get('#big-fail')?.large === true) ok('النصّ الكبير مميَّز: حدّه 3 : 1')
      else fail(`النصّ الكبير لم يُميَّز: ${JSON.stringify(byLabel.get('#big-fail'))}`)
      for (const [label, reason] of Object.entries(unknown)) {
        const f = byLabel.get(label)
        if (f?.severity === 'unknown' && f.ratio === null && f.unknown === reason) {
          ok(`«تعذّر الحساب» بلا رقم (${label}): ${reason}`)
        } else {
          fail(`${label}: ${JSON.stringify(f)} والمتوقَّع «تعذّر الحساب» بسبب ${reason}`)
        }
      }
      const passing = [
        '#big',
        '#solid',
        '#slotted',
        '#hidden',
        '#invisible',
        '#sr-only',
        '#offscreen',
      ]
      const leaked = passing.filter((label) => byLabel.has(label))
      if (leaked.length === 0) {
        ok('لا نتيجة لسليم ولا لمخفيّ — والمُسند إلى فتحةٍ يُقرأ على إطار الظلّ لا على الجسم')
      } else {
        fail(`نتائج لا تُتوقَّع: ${leaked.join(' · ')}`)
      }
      const extra = st.findings.filter(
        (f) => !failing.some(([l]) => l === f.label) && !(f.label in unknown),
      )
      if (extra.length) fail(`نتائج زائدة: ${JSON.stringify(extra)}`)
      const rank = { 'below-3': 0, 'below-4.5': 1, unknown: 2 }
      const sorted = st.findings.every((f, i, all) => {
        const prev = all[i - 1]
        if (!prev) return true
        const d = rank[prev.severity] - rank[f.severity]
        return d < 0 || (d === 0 && (prev.ratio ?? 0) <= (f.ratio ?? 0) + 1e-9)
      })
      if (sorted) ok('القائمة مرتّبة بالخطورة ثمّ بالنسبة، و«تعذّر الحساب» آخرًا')
      else fail(`ترتيبٌ خاطئ: ${st.findings.map((f) => f.label).join(' ← ')}`)

      // ── 14) القفز إلى نصٍّ تحت الطيّ وإبرازه، و«سجّلها مشكلة» ────
      const before = await inPage(
        cases.tabId,
        `() => document.getElementById('below-fold').getBoundingClientRect().top`,
      )
      if (!(await tapOverlay(cases, 'audit-row', '#below-fold'))) {
        fail('لا صفّ لـ#below-fold في القائمة')
      } else {
        await settle(cases.pageSession)
        const after = await inPage(
          cases.tabId,
          `() => { const r = document.getElementById('below-fold').getBoundingClientRect(); return { top: r.top, height: r.height, vh: innerHeight } }`,
        )
        const picked = await auditState(cases.tabId)
        const drawn = await inOverlay(
          cases.tabId,
          `() => !!globalThis.__rasdColour.host.layer.querySelector('[data-rasd-ov="audit-box"]')`,
        )
        if (before > after.vh && after.top >= 0 && after.top + after.height <= after.vh) {
          ok(
            `النقر على النتيجة قفز إليها: من ${Math.round(before)} إلى ${Math.round(after.top)} داخل النافذة`,
          )
        } else {
          fail(`لم يُقفز إلى العنصر: ${Math.round(before)} ⟵ ${JSON.stringify(after)}`)
        }
        if (drawn && picked.box && near(picked.box.y, after.top, 2)) {
          ok('وإطارها مرسومٌ على العنصر نفسه')
        } else {
          fail(`إطار النتيجة: ${drawn} ${JSON.stringify(picked.box)}`)
        }
        if (!(await tapOverlay(cases, 'audit-log-issue'))) {
          fail('«سجّلها مشكلة» لا يظهر تحت النتيجة المختارة')
        } else {
          const form = await inOverlay(
            cases.tabId,
            `() => { const f = globalThis.__rasdColour.issues.state.form.value; return f && { expected: f.expected, title: f.title, kind: f.options[0]?.kind, value: f.options[0]?.value } }`,
          )
          const floor = (Math.floor(wcag(grey(153), WHITE) * 100) / 100).toFixed(2)
          if (form?.kind === 'contrast' && form.expected === '4.5' && form.value === floor) {
            ok(
              `«سجّلها مشكلة» فتح نموذج 32: التباين الآن ${form.value} والمتوقَّعة ${form.expected}`,
            )
          } else {
            fail(`نموذج المشكلة: ${JSON.stringify(form)} والمتوقَّع التباين ${floor} بحدّ 4.5`)
          }
        }
      }
    }
    await setMode(cases.tabId, 'idle')
  }

  // ── 15) عيّنة الخمسة آلاف تحت حدّها ─────────────────────────────
  const big = await openAuditPage('/contrast-5000/')
  let fast = false
  if (big) {
    const built = await inPage(big.tabId, `() => window.__texts`)
    await tapOverlay(big, 'audit-open')
    await tapOverlay(big, 'audit-start')
    const st = await waitAudit(big.tabId, (s) => s.phase !== 'scanning')
    if (built === 5000 && st.total === 5000 && st.phase === 'done') {
      ok(`عيّنة ${st.total} عنصر نصّ مُسحت كاملة: ${st.texts} ظاهرًا و${st.findings.length} نتيجة`)
    } else {
      fail(`عيّنة الخمسة آلاف: بُني ${built} ومُسح ${st.total} والحالة ${st.phase}`)
    }
    fast = st.elapsed !== null && st.elapsed <= AUDIT_BUDGET_MS
    if (fast) ok(`المسح في ${Math.round(st.elapsed)}ms ≤ ${AUDIT_BUDGET_MS}ms`)
    else
      lines.push(
        `  · المسح في ${Math.round(st.elapsed ?? -1)}ms فوق ${AUDIT_BUDGET_MS}ms — فالتقدّم والإلغاء شرطٌ أدناه`,
      )
    await setMode(big.tabId, 'idle')
  }

  // ── 16) خمسون ألفًا: التقدّم مرئي، و«ألغِ» يُلغي فورًا ─────────────
  const huge = await openAuditPage('/contrast-5000/?n=50000')
  if (huge) {
    await tapOverlay(huge, 'audit-open')
    await tapOverlay(huge, 'audit-start')
    const mid = await waitAudit(huge.tabId, (s) => s.phase !== 'scanning' || s.done > 0, 5000)
    const bar = await inOverlay(
      huge.tabId,
      `() => { const b = globalThis.__rasdColour.host.layer.querySelector('[role="progressbar"]'); return b && Number(b.getAttribute('aria-valuenow')) }`,
    )
    if (mid.phase === 'scanning' && mid.done > 0 && mid.done < mid.total && bar > 0) {
      ok(`التقدّم مرئي أثناء المسح: ${mid.done} من ${mid.total}، والشريط عند ${bar}`)
    } else {
      fail(
        `لا تقدّم مرئي: ${JSON.stringify({ phase: mid.phase, done: mid.done, total: mid.total, bar })}`,
      )
    }
    const tapped = await tapOverlay(huge, 'audit-cancel')
    const cut = await auditState(huge.tabId)
    await new Promise((r) => setTimeout(r, 300))
    const later = await auditState(huge.tabId)
    if (
      tapped &&
      cut.phase === 'cancelled' &&
      later.phase === 'cancelled' &&
      later.done === 0 &&
      later.findings.length === 0
    ) {
      ok('«ألغِ» أوقف المسح مع النقرة نفسها، ولا شريحة كتبت بعده')
    } else {
      fail(
        `الإلغاء: ${JSON.stringify({ tapped, now: cut.phase, later: later.phase, done: later.done })}`,
      )
    }
    await setMode(huge.tabId, 'idle')
  }
  if (!fast) lines.push('  · معيار الخمسة آلاف قائمٌ بشقّه الثاني: تقدّمٌ مرئي وإلغاءٌ فوري (16)')
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
