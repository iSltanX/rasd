#!/usr/bin/env node
/**
 * يثبت أن محرّك القياس (المرحلة 12) يعمل فوق Chrome حقيقي.
 *
 * happy-dom بلا محرّك تخطيط، فرياضيات `modules/measure/*` مُختبَرة هناك
 * بمستطيلات محقونة — وما يُختبَر هنا وحده هو ربطها بهندسة حقيقية: هل
 * تطابق قيمة الفجوة المعروضة الفرق الفعلي بين حدَّي عنصرين حقيقيين، وهل
 * يعمل الالتقاط اللحظي وتعطيله بـ⌥ على متصفّح فعلي.
 *
 * يعيد استعمال عيّنة `picker/` نفسها لا عيّنة جديدة: هندستها معروفة
 * ومُختبَرة فعلًا في `verify-picker.mjs` (تحويلات، تعشيش، إطارات)، فتكفي
 * لقياس محرّك القياس بلا تكرار بناء عيّنة.
 *
 *   pnpm build && pnpm verify:measure
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9337
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

const stage = mkdtempSync(join(tmpdir(), 'rasd-measure-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
manifest.host_permissions = ['http://127.0.0.1/*']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-measure-'))
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
      if (r.ok) globalThis.__rasdMeasure = r.value
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
    `() => { globalThis.__rasdMeasure.modes.set(${JSON.stringify(mode)}); return true }`,
  )

/** حالة أداة القياس مباشرة من الإشارات — لا انتظار قراءة DOM. */
const readMeasureState = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const m = globalThis.__rasdMeasure.measure.state
      return {
        hover: m.hover.value,
        reference: m.reference.value,
        comparison: m.comparison.value,
        freeRect: m.freeRect.value,
      }
    }`,
  )

/** ما رُسم فعلًا فوق الصفحة — للتحقّق من أن الحالة تصل إلى العرض. */
const readDrawn = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const layer = globalThis.__rasdMeasure.host.layer
      return {
        highlights: [...layer.querySelectorAll('[data-rasd-ov="measure-highlight"]')].map(el => el.getAttribute('data-role')),
        gaps: layer.querySelectorAll('[data-rasd-ov="measure-gap"]').length,
        guides: layer.querySelectorAll('[data-rasd-ov="align-guide"]').length,
        marquee: !!layer.querySelector('[data-rasd-ov="marquee"]'),
      }
    }`,
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

/**
 * أوّل نقطة تُرجع `<body>`/`<html>` فعليًّا — لا نقطة مخمَّنة.
 *
 * عيّنة `picker/` عامرة (`#stress` وحدها 5000 عقدة قد يتجاوز صفّها ارتفاع
 * أيقوناتها الفعلي 4px بسبب صندوق السطر الافتراضي)، فتخمين إحداثية «فارغة»
 * يخطئ بصمت — كما وقع هنا فعلًا عند أوّل محاولة.
 */
/**
 * تُنفَّذ في العالم المعزول لا الرئيسي: طبقتنا فعّالة `pointer-events: auto`
 * في كامل مساحة النافذة أثناء وضع القياس، فأيّ نقطة «فارغة» بمعيار محتوى
 * الصفحة سيلتقطها `elementFromPoint` **مضيفَنا نفسه** — وهو المطلوب
 * بالضبط، لا شرطَ فشل. اسم وسم المضيف عشوائي كل جلسة (`randomTagName`)
 * فلا يُقارَن بحرفه؛ يُقارَن بمرجعه الحقيقي المتاح هنا وحده.
 */
async function findEmptyPoint(tabId, candidates) {
  for (const p of candidates) {
    const isEmpty = await inOverlay(
      tabId,
      `() => {
        const hit = document.elementFromPoint(${p.x}, ${p.y})
        const hostEl = globalThis.__rasdMeasure.host.hostEl
        return hit === null || hit === document.body || hit === document.documentElement || hit === hostEl
      }`,
    )
    if (isEmpty) return p
  }
  return null
}

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/picker/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)
    await setMode(tabId, 'measure')
    const diag = await inOverlay(
      tabId,
      `() => {
        const layer = globalThis.__rasdMeasure.host.layer
        const hostEl = globalThis.__rasdMeasure.host.hostEl
        return {
          layerInteractive: layer.getAttribute('data-rasd-interactive'),
          hostPointerEvents: hostEl.style.getPropertyValue('pointer-events'),
          hostRect: hostEl.getBoundingClientRect ? (({x,y,width,height}) => ({x,y,width,height}))(hostEl.getBoundingClientRect()) : null,
        }
      }`,
    )
    note(`تشخيص: ${JSON.stringify(diag)}`)
    const pageSession = await attachToPage('/picker/')
    if (!pageSession) fail('تعذّر الاتصال بهدف الصفحة.')
    else {
      // ── 1) التتبّع: المرور فوق عنصر يملأ hover بمستطيله الحقيقي ──
      const plainRect = await pageRect(tabId, '#plain')
      const cx1 = plainRect.x + plainRect.w / 2
      const cy1 = plainRect.y + plainRect.h / 2
      await moveTo(pageSession, cx1, cy1)
      let st = await readMeasureState(tabId)
      if (
        st.hover &&
        near(st.hover.rect.width, plainRect.w) &&
        near(st.hover.rect.height, plainRect.h)
      ) {
        ok(`التتبّع: hover يطابق #plain الحقيقي (${st.hover.rect.width}×${st.hover.rect.height})`)
      } else {
        fail(
          `التتبّع: hover=${JSON.stringify(st.hover?.rect)} بينما #plain=${JSON.stringify(plainRect)}`,
        )
      }
      let drawn = await readDrawn(tabId)
      if (drawn.highlights.includes('hover')) ok('الإبراز المرسوم يحمل data-role="hover"')
      else fail(`لا إبراز hover مرسوم: ${JSON.stringify(drawn)}`)

      // ── 2) تثبيت مرجع + مقارنة مع هدف حقيقي ثانٍ ──────────────
      await clickAt(pageSession, cx1, cy1)
      st = await readMeasureState(tabId)
      if (st.reference && near(st.reference.rect.x, plainRect.x)) {
        ok('نقرة على #plain ثبّتته مرجعًا')
      } else {
        fail(`لم يُثبَّت المرجع: ${JSON.stringify(st.reference)}`)
      }

      const scaledRect = await pageRect(tabId, '#scaled')
      const cx2 = scaledRect.x + scaledRect.w / 2
      const cy2 = scaledRect.y + scaledRect.h / 2
      await moveTo(pageSession, cx2, cy2)
      st = await readMeasureState(tabId)

      if (st.comparison) {
        // القيمة المتوقَّعة من الهندسة الحقيقية بالصيغة نفسها في distance.ts.
        const expected = {
          top: plainRect.y - (scaledRect.y + scaledRect.h),
          right: scaledRect.x - (plainRect.x + plainRect.w),
          bottom: scaledRect.y - (plainRect.y + plainRect.h),
          left: plainRect.x - (scaledRect.x + scaledRect.w),
        }
        const g = st.comparison.gap
        const matches =
          near(g.top, expected.top, 2) &&
          near(g.right, expected.right, 2) &&
          near(g.bottom, expected.bottom, 2) &&
          near(g.left, expected.left, 2)
        if (matches) {
          ok(
            `الفجوة تطابق الهندسة الحقيقية بين #plain و#scaled (nearest=${g.nearest}, ${Math.round(g.nearestValue ?? -1)}px)`,
          )
        } else {
          fail(`فجوة غير مطابقة: حُسبت ${JSON.stringify(g)} والمتوقَّع ${JSON.stringify(expected)}`)
        }
        note(`المحاذاة: ${st.comparison.alignment.length} محورًا مكتشَفًا`)
      } else {
        fail('لا مقارنة رغم وجود مرجع وهدف تتبّع معًا')
      }

      drawn = await readDrawn(tabId)
      if (drawn.gaps > 0) ok(`${drawn.gaps} خطّ قياس مرسوم فعليًّا بين المرجع والهدف`)
      else fail('لا خطوط قياس مرسومة رغم وجود مقارنة')

      // ── نقطة خلفية حقيقية — مُتحقَّق منها لا مُخمَّنة (انظر findEmptyPoint) ──
      // مقاسا `--window-size` وصفتان اسميّتان لا حقيقيّتان: النافذة الحقيقية
      // قِيست 1265×713 لا 1280×800 حتى بلا واجهة متصفّح (headless) — فتُقرَأ
      // الأبعاد الفعلية بدل افتراضها، وإلا سقطت نقاط «الفراغ» خارج حدود
      // الطبقة القابلة للتفاعل فعلًا (نفس عطل الاختبار الذي وقع هنا فعلًا).
      const vw = await inPage(tabId, `() => window.innerWidth`)
      const vh = await inPage(tabId, `() => window.innerHeight`)
      note(`أبعاد النافذة الفعلية: ${vw}×${vh}`)
      const bg = await findEmptyPoint(tabId, [
        { x: vw - 20, y: vh - 20 },
        { x: vw - 20, y: 20 },
        { x: 20, y: vh - 20 },
        { x: Math.round(vw * 0.9), y: Math.round(vh * 0.5) },
      ])
      if (!bg) {
        fail('تعذّر إيجاد نقطة خلفية فارغة في العيّنة — تُخطَّى بقيّة اختبارات الخلفية.')
      } else {
        note(`نقطة الخلفية الفارغة المُتحقَّقة: (${bg.x}, ${bg.y})`)

        // ── 3) مسح المرجع بنقرة على الخلفية ─────────────────────
        await clickAt(pageSession, bg.x, bg.y)
        st = await readMeasureState(tabId)
        if (!st.reference) ok('نقرة على الخلفية مسحت المرجع')
        else fail(`المرجع بقي بعد نقرة على الخلفية: ${JSON.stringify(st.reference.rect)}`)
      }

      // ── 4) القياس الحرّ بالسحب — بلا مرشَّحات التقاط قريبة ────
      const freeStart = bg ?? { x: vw - 20, y: vh - 20 }
      const freeEnd = { x: freeStart.x - 60, y: freeStart.y - 40 }
      await send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', ...freeStart, button: 'left', clickCount: 1, pointerType: 'mouse' },
        pageSession,
      )
      await moveTo(pageSession, freeEnd.x, freeEnd.y)
      st = await readMeasureState(tabId)
      const expectFree = {
        x: Math.min(freeStart.x, freeEnd.x),
        y: Math.min(freeStart.y, freeEnd.y),
        width: Math.abs(freeEnd.x - freeStart.x),
        height: Math.abs(freeEnd.y - freeStart.y),
      }
      if (
        st.freeRect &&
        near(st.freeRect.x, expectFree.x) &&
        near(st.freeRect.y, expectFree.y) &&
        near(st.freeRect.width, expectFree.width) &&
        near(st.freeRect.height, expectFree.height)
      ) {
        ok(
          `القياس الحرّ: ${Math.round(st.freeRect.width)}×${Math.round(st.freeRect.height)} — يطابق نقطتَي السحب`,
        )
      } else {
        fail(
          `القياس الحرّ غير مطابق: ${JSON.stringify(st.freeRect)} والمتوقَّع ${JSON.stringify(expectFree)}`,
        )
      }
      drawn = await readDrawn(tabId)
      if (drawn.marquee) ok('مستطيل السحب الحرّ مرسوم (Marquee)')
      else fail('لا Marquee مرسوم أثناء السحب الحرّ')
      await send(
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', ...freeEnd, button: 'left', clickCount: 1, pointerType: 'mouse' },
        pageSession,
      )

      // ── 5) الالتقاط اللحظي ضمن 4px، وتعطيله بـ⌥ ──────────────
      await clickAt(pageSession, cx1, cy1) // #plain مرجعًا من جديد
      const snapTargetX = plainRect.x + plainRect.w // الحافّة اليمنى لـ#plain
      const dragOrigin = bg ?? { x: vw - 20, y: vh - 20 }
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          ...dragOrigin,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        pageSession,
      )
      await moveTo(pageSession, snapTargetX + 2, plainRect.y + 20) // ضمن 4px من الحافّة، بلا ⌥
      st = await readMeasureState(tabId)
      // الأصل (dragOrigin) على يمين الهدف، فالحافّة الملتقَطة تصير x اليسرى للمستطيل بعد normalizeRect — لا x+width.
      if (st.freeRect && near(st.freeRect.x, snapTargetX, 0.5)) {
        ok(`الالتقاط اللحظي شدّ نهاية السحب إلى حافّة #plain اليمنى (${Math.round(snapTargetX)}px)`)
      } else {
        fail(
          `لم يلتقط: نهاية السحب عند ${JSON.stringify(st.freeRect)} والحافّة المتوقَّعة ${snapTargetX}`,
        )
      }

      await moveTo(pageSession, snapTargetX + 2, plainRect.y + 22, 1) // نفس النقطة تقريبًا، لكن بـ⌥ (bit 1)
      st = await readMeasureState(tabId)
      if (st.freeRect && !near(st.freeRect.x, snapTargetX, 0.5)) {
        ok('⌥ عطّل الالتقاط اللحظي — النهاية بقيت عند نقطة المؤشِّر الفعلية')
      } else {
        fail(`⌥ لم يعطّل الالتقاط: ${JSON.stringify(st.freeRect)}`)
      }
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: snapTargetX + 2,
          y: plainRect.y + 22,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        pageSession,
      )

      // ── 6) الخروج ينظّف ────────────────────────────────────────
      await setMode(tabId, 'idle')
      drawn = await readDrawn(tabId)
      if (drawn.highlights.length === 0 && drawn.gaps === 0 && !drawn.marquee) {
        ok('الخروج من الوضع يمحو كل رسوم القياس')
      } else {
        fail(`رسوم باقية بعد الخروج: ${JSON.stringify(drawn)}`)
      }
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص محرّك القياس في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ محرّك القياس يعمل بدقّة فوق Chrome حقيقي.\n')
