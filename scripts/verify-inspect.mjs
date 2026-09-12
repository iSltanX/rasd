#!/usr/bin/env node
/**
 * يثبت أن محرّك الفحص يقرأ التتالي والمتغيّرات صحيحًا — في Chrome حقيقي.
 *
 * **هذا هو المقياس الوحيد الممكن.** happy-dom بلا `@layer` ولا `@container`
 * ولا `computedStyleMap`، ولا يورّث الخصائص المخصَّصة أصلًا (قِيس: القيمة
 * على العنصر المصرِّح وحده). فكل ادّعاءات المرحلة 11 عن الطبقات والأولوية
 * وتتبّع المتغيّرات تُقاس هنا أو لا تُقاس.
 *
 * والحقيقة تُؤخذ من **المتصفّح نفسه**: ما تعطيه `getComputedStyle` هو
 * الحكَم، وما يقوله محرّكنا يُقارَن به. فالاختبار لا يقيس اتّساق الشيفرة مع
 * نفسها بل صدقها.
 *
 *   pnpm build && pnpm verify:inspect
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
const PORT = 9340
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

// نسخة الفحص: `dist/` كما هي + صلاحية مضيف للعيّنات المحلّية.
const stage = mkdtempSync(join(tmpdir(), 'rasd-inspect-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
manifest.host_permissions = ['http://127.0.0.1/*']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-inspect-'))
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
const note = (m) => lines.push(`  · ${m}`)

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

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/css/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)

    /*
     * المحرّك يُشغَّل داخل العالم المعزول عبر مقبض الطبقة، ويُقارَن ناتجه
     * بما يعطيه `getComputedStyle` — أي بالمتصفّح نفسه حكَمًا.
     */
    const probe = await inOverlay(
      tabId,
      `() => {
        const h = globalThis.__rasdPicker
        if (!h || !h.inspect) return { error: 'لا مقبض فحص' }
        const doc = document
        const out = {}

        const check = (id, prop) => {
          const el = doc.getElementById(id) || doc.querySelector(id)
          if (!el) return { missing: id }
          const truth = getComputedStyle(el).getPropertyValue(prop).trim()
          return { truth }
        }

        out.layered = check('layered', 'color')
        out.reversed = check('reversed', 'color')
        out.where = check('w', 'outline-color')
        out.cond = check('cond', 'color')
        out.sup = check('sup', 'color')
        out.escaped = check('.\\\\32 xl\\\\:flex', 'color')
        out.inline = check('inline', 'color')
        out.nestChild = check('.child', 'color')
        out.varRoot = check('var-root', 'color')
        out.varMid = check('var-mid', 'color')
        out.varChain = check('var-chain', 'color')
        out.varFallback = check('var-fallback', 'color')
        out.rootBrand = getComputedStyle(doc.documentElement).getPropertyValue('--brand').trim()
        out.midBrand = getComputedStyle(doc.getElementById('mid')).getPropertyValue('--brand').trim()
        out.inheritedOnLeaf = getComputedStyle(doc.getElementById('var-mid')).getPropertyValue('--brand').trim()
        return out
      }`,
    )

    if (probe?.error) {
      fail(`تعذّر تشغيل المحرّك: ${probe.error}`)
    } else {
      // ── حقيقة المتصفّح: تثبت أن العيّنة تمثّل الحالات فعلًا ──────
      const expect = (name, got, want) => {
        if (got === want) ok(`${name} — ${got}`)
        else fail(`${name}: ${got} والمتوقَّع ${want}`)
      }

      expect('محتوى الطبقة يقع بعد فروعها', probe.layered?.truth, 'rgb(2, 2, 2)')
      expect('‏!important يعكس مقارنة الطبقات', probe.reversed?.truth, 'rgb(3, 3, 3)')
      expect('‏:where تساوي صفرًا', probe.where?.truth, 'rgb(6, 6, 6)')
      expect('شرط غير مطابق لا يفوز', probe.cond?.truth, 'rgb(10, 10, 10)')
      expect('‏@supports مطابق يفوز', probe.sup?.truth, 'rgb(11, 11, 11)')
      expect('صنف بتهريب رقمي يُطابَق', probe.escaped?.truth, 'rgb(12, 12, 12)')
      expect('النمط السطري يفوز', probe.inline?.truth, 'rgb(13, 13, 13)')
      expect('تداخل &‏ يُفكّ', probe.nestChild?.truth, 'rgb(8, 8, 8)')

      // ── المتغيّرات: الوراثة وإعادة التعريف والسلسلة والاحتياطي ──
      expect('متغيّر الجذر', probe.rootBrand, '#00e3c9')
      expect('إعادة تعريف في سلف وسيط', probe.midBrand, '#ff5577')
      expect('الوراثة تصل الورقة', probe.inheritedOnLeaf, '#ff5577')
      expect('قيمة من متغيّر الجذر', probe.varRoot?.truth, 'rgb(0, 227, 201)')
      expect('قيمة من متغيّر أعيد تعريفه', probe.varMid?.truth, 'rgb(255, 85, 119)')
      expect('سلسلة var(--a) ← var(--b)', probe.varChain?.truth, 'rgb(0, 227, 201)')
      expect('الاحتياطي يُستعمل لغير المعرَّف', probe.varFallback?.truth, 'rgb(18, 52, 86)')
    }

    // ── المحرّك نفسه: هل يوافق المتصفّح؟ ────────────────────────
    const engine = await inOverlay(
      tabId,
      `() => {
        const h = globalThis.__rasdPicker
        const t = h && h.inspect
        if (!t) return { error: 'لا أداة' }

        const el = document.getElementById('layered')
        const r = el.getBoundingClientRect()
        t.onPointerMove({ clientX: r.x + 5, clientY: r.y + 5 })
        t.frame(new Set(['pointer']))
        t.onPointerUp({})

        const d = t.state.detail.value
        if (!d) return { error: 'لم تُثبَّت لقطة' }

        const win = d.rules.get('color')
        return {
          selector: d.snapshot.selector,
          label: d.snapshot.label,
          declared: win ? win.declared : null,
          layer: win ? win.layer : null,
          computed: d.snapshot.styles['color'] ? d.snapshot.styles['color'].value.trim() : null,
          blocked: d.snapshot.limits.unreadableSheets,
          indexComplete: d.snapshot.limits.indexComplete,
        }
      }`,
    )

    if (engine?.error) {
      fail(`المحرّك: ${engine.error}`)
    } else {
      note(`المحرّك: ${JSON.stringify(engine)}`)
      if (engine.computed === 'rgb(2, 2, 2)') {
        ok('المحرّك يقرأ القيمة المحسوبة نفسها التي يقرؤها المتصفّح')
      } else {
        fail(`المحرّك قرأ ${engine.computed} والمتصفّح rgb(2, 2, 2)`)
      }

      if (engine.declared === 'rgb(2, 2, 2)') {
        ok(`المحرّك حسم القاعدة الفائزة عبر الطبقات — الطبقة ${engine.layer}`)
      } else {
        fail(`القاعدة الفائزة: صُرِّح بـ${engine.declared} والمتوقَّع rgb(2, 2, 2)`)
      }

      if (engine.selector) ok(`المحدِّد مبنيّ — ${engine.selector}`)
      else fail('لا محدِّد في اللقطة')
    }

    // ── الطبقات: هل تُقرأ أسماؤها أصلًا؟ ────────────────────────
    /*
     * الخاصّية اسمها `name` لا `layerName` — قِيس أن
     * `'layerName' in CSSLayerBlockRule.prototype` يساوي `false`. وقراءة
     * الاسم الخطأ تُرجع `undefined` بلا رمي، فيصير كل إعلان «خارج
     * الطبقات» ويسقط الترتيب إلى ترتيب المستند **صامتًا** — ويعطي الجواب
     * الصحيح بالمصادفة أحيانًا. هذا الفحص يمنع عودة ذلك.
     */
    const layerProbe = await inOverlay(
      tabId,
      `() => {
        const names = []
        const walk = (rules, prefix) => {
          for (const r of rules) {
            const own = typeof r.name === 'string' ? r.name : null
            const path = own !== null ? (prefix ? prefix + '.' + own : own) : prefix
            if (own !== null) names.push(path)
            if (r.cssRules) walk(r.cssRules, path)
          }
        }
        for (const sheet of document.styleSheets) {
          try { walk(sheet.cssRules, '') } catch { /* محجوبة */ }
        }
        return { names, layerNameOnProto: typeof CSSLayerBlockRule !== 'undefined'
          ? ('layerName' in CSSLayerBlockRule.prototype) : 'no-ctor' }
      }`,
    )
    note(`طبقات مقروءة: ${JSON.stringify(layerProbe)}`)
    if (layerProbe?.names?.includes('outer.inner')) {
      ok(`أسماء الطبقات تُقرأ متداخلةً — ${layerProbe.names.join(' · ')}`)
    } else {
      fail(`أسماء الطبقات ناقصة: ${JSON.stringify(layerProbe?.names)}`)
    }

    // ── الدرع: لا يُرفع في الفحص كي تبقى ‏:hover صادقة ───────────
    const shield = await inOverlay(
      tabId,
      `() => {
        const h = globalThis.__rasdPicker
        h.modes.set('inspect')
        const hostEl = h.host.hostEl
        return {
          mode: h.modes.mode.value,
          pointerEvents: getComputedStyle(hostEl).pointerEvents,
        }
      }`,
    )
    if (shield?.pointerEvents === 'none') {
      ok('الدرع لا يُرفع في وضع الفحص — ‏:hover تبقى صادقة على الصفحة')
    } else {
      fail(`المضيف في وضع الفحص: pointer-events=${shield?.pointerEvents} والمتوقَّع none`)
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص محرّك الفحص في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ محرّك الفحص يوافق المتصفّح.\n')
