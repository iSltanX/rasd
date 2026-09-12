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

import { ensureFixturesServer } from './live-fixtures.mjs'
import { attachLiveServiceWorker } from './live-sw.mjs'

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
const fixtures = await ensureFixturesServer({ port: FIXTURES })

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

const centreOf = (r) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

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

/**
 * ضغطة مفتاح حقيقية على مستند الصفحة — لا محاكاة برمجية.
 *
 * `code` هو ما تطابقه `shortcuts.ts` (`event.code` لا `event.key`)، و`4`
 * قناع CDP لـ`Meta` (⌘ على macOS) — نفس القناع المستعمل في `verify-editor.mjs`.
 */
async function keyPress(pageSession, key, code, vkCode, modifiers = 0) {
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key, code, windowsVirtualKeyCode: vkCode, modifiers },
    pageSession,
  )
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key, code, windowsVirtualKeyCode: vkCode, modifiers },
    pageSession,
  )
  await settle(pageSession)
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

    /*
     * ── 5) `⌘K` يفتح لوحة الاستخراج من بكسلات الصفحة الحقيقية ─────
     *
     * **ضغطة مفتاح حقيقية على الصفحة**، لا نداء برمجيّ على الأداة —
     * هذا ما يُثبت أن السلك من `shortcuts.ts` إلى `colourPalette.open()`
     * موصولٌ فعلًا: الحقن يلتقط الحدث في مرحلة `capture` (`shortcuts.ts`)،
     * فالإرسال إلى مستند الصفحة (`pageSession`) يمرّ من نفس المسار الذي
     * يراه مستخدم حقيقي، لا مسارًا مختصرًا عبر `chrome.scripting`.
     *
     * والوضع `idle` قبل الضغطة عمدًا: يثبت أن `⌘K` تُفعِّل وضع اللون من
     * الصفر، لا أنها تفترضه نشطًا أصلًا.
     */
    await setMode(tabId, 'idle')
    await keyPress(pageSession, 'k', 'KeyK', 75, 4) // 4 = Meta (CDP)، ⌘ على macOS

    const paletteOpened = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const g = globalThis.__rasdPalette
        const wait = () => {
          if (!g.colourPalette.state.open.value) return void setTimeout(wait, 50)
          if (g.colourPalette.state.extracting.value) return void setTimeout(wait, 50)
          resolve({
            mode: g.modes.mode.value,
            open: g.colourPalette.state.open.value,
            swatches: g.colourPalette.state.swatches.value.map((s) => s.hex),
            domPresent: !!g.host.layer.querySelector('[data-rasd-ov="palette-panel"]'),
          })
        }
        setTimeout(wait, 50)
      })`,
    )
    if (!paletteOpened) {
      fail('⌘K لم يفتح لوحة الاستخراج خلال المهلة')
    } else {
      paletteOpened.mode === 'colour'
        ? ok('⌘K فعَّلت وضع اللون من idle')
        : fail(`⌘K لم تُفعِّل وضع اللون — الوضع الحالي: ${paletteOpened.mode}`)
      paletteOpened.open && paletteOpened.domPresent
        ? ok('لوحة الاستخراج مفتوحة ومرسومة في DOM فعلًا')
        : fail(`اللوحة لم تُفتح أو لم تُرسَم: ${JSON.stringify(paletteOpened)}`)
      paletteOpened.swatches.length > 0
        ? ok(
            `استخرجت ${paletteOpened.swatches.length} لونًا من بكسلات الصفحة الحقيقية: ${paletteOpened.swatches.slice(0, 3).join(', ')}`,
          )
        : fail('لا ألوان مستخرَجة — استخراجٌ من الظاهر عند فتح اللوحة فشل')
    }

    /*
     * ── 6) «افصل ألوان الواجهة عن الصور» يصنّف حيًّا — نقرة حقيقية ────
     *
     * `#var-bg` يصرّح `background-color: var(--brand)`؛ فبعد الاستخراج
     * أعلاه يجب أن يظهر لونٌ مصنَّف `خلفية` بمجرّد تفعيل المفتاح، بلا
     * إعادة استخراج (نفس ما يحرسه اختبار الوحدة، لكن بنقرة DOM حقيقية
     * لا استدعاء برمجي مباشر على الأداة).
     */
    const classified = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const panel = document.querySelector('[data-rasd-ov="palette-panel"]') ??
          globalThis.__rasdPalette.host.layer.querySelector('[data-rasd-ov="palette-panel"]')
        const toggle = panel.querySelectorAll('.rasd-ov-pal-toggle-input')[1]
        toggle.click()
        setTimeout(() => {
          const g = globalThis.__rasdPalette
          resolve({
            sources: g.colourPalette.state.swatches.value.map((s) => s.source),
          })
        }, 150)
      })`,
    )
    if (!classified) {
      fail('تعذّر تفعيل «افصل ألوان الواجهة عن الصور»')
    } else {
      classified.sources.includes('background')
        ? ok(`التصنيف الحيّ عمل بنقرة حقيقية: ${JSON.stringify(classified.sources)}`)
        : fail(`لا لون صُنِّف «خلفية» رغم تصريح حقيقي: ${JSON.stringify(classified.sources)}`)
    }

    await inOverlay(tabId, `() => { globalThis.__rasdPalette.colourPalette.close(); return true }`)

    /*
     * ── 7) «توليد الدرجات» من لونٍ مثبَّت حقيقي ─────────────────────
     *
     * يقطف لونًا فعليًّا بالقطّارة — نقرة مؤشِّر حقيقية على `#solid`
     * (نفس مسار الالتقاط في `verify-colour.mjs`)، لا كائنًا مصطنَعًا
     * يُمرَّر مباشرةً للأداة: `PinnedColour`/`ColourReading` عقدان
     * داخليان (`oklch`، `pixelReading`، …) لا يجوز تخمين حقولهما.
     */
    await setMode(tabId, 'colour')
    const solidRect = await pageRect(tabId, '#solid')
    const solidPoint = centreOf(solidRect)
    await moveTo(pageSession, solidPoint.x, solidPoint.y)
    await clickAt(pageSession, solidPoint.x, solidPoint.y)

    const scaleOpened = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const g = globalThis.__rasdPalette
        const pinned = g.colour.state.pinned.value
        if (!pinned) return resolve({ error: 'لا لون مثبَّت بعد النقر' })
        g.colourScale.open(pinned.reading)
        // إشارة تتغيّر لا تعني رسمًا فوريًّا — رسمة Preact تنتظر الإطار
        // التالي، فيُنتظَر تكرارَين منه (نفس نمط \`settle\` أعلاه لكن داخل
        // سياق الإضافة لا الصفحة المضيفة).
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve({
            pinnedHex: pinned.formats.hex,
            open: g.colourScale.state.open.value,
            stopsCount: g.colourScale.state.stops.value.length,
            domPresent: !!g.host.layer.querySelector('[data-rasd-ov="scale-panel"]'),
            sampleSteps: g.colourScale.sampleRows().map((r) => r.step),
          })
        }))
      })`,
    )
    if (!scaleOpened) {
      fail('تعذّر فتح لوحة توليد الدرجات')
    } else {
      scaleOpened.open && scaleOpened.domPresent
        ? ok('لوحة السلّم مفتوحة ومرسومة في DOM فعلًا')
        : fail(`السلّم لم يُفتح أو لم يُرسَم: ${JSON.stringify(scaleOpened)}`)
      scaleOpened.stopsCount === 11
        ? ok('السلّم المحسوب 11 درجة بالضبط')
        : fail(`عدد الدرجات ${scaleOpened.stopsCount} بدل 11`)
      JSON.stringify(scaleOpened.sampleSteps) === JSON.stringify([300, 500, 700, 900])
        ? ok('جدول العيّنة يعرض 300/500/700/900 بالضبط')
        : fail(`درجات العيّنة ${JSON.stringify(scaleOpened.sampleSteps)} لا 300/500/700/900`)
    }

    /*
     * ── 8) 5000 عقدة: تحت 2 ثانية، وبلا تجميد ─────────────────────
     *
     * معيار قبول صريح في نصّ المرحلة («تكامل: مسح صفحة بـ5000 عقدة لا
     * يتجاوز 2 ثانية ولا يجمّد الصفحة، يُقاس بالإطارات الطويلة») لم يكن
     * له أي أثر — لا اختبار وحدة يقيس زمنًا، ولا فحص حيّ. `happy-dom` لا
     * يصلح شاهدًا هنا أصلًا (سابقة `Phase_18.md`: تخطيطه لا يعكس زمن إطار
     * حقيقي)، فالقياس يقع في كروم حقيقي وحده.
     *
     * **«لا يجمّد» تُقاس بنبض `requestAnimationFrame` لا بالزمن الكلّي
     * وحده.** زمنٌ إجماليّ قصير قد يخفي جمودًا واحدًا طويلًا وسط عمل سريع
     * حوله؛ فيُسجَّل الفارق بين كل إطارين متتاليين طوال نافذة المسح، وأكبر
     * فارق هو الدليل على وجود (أو غياب) جمود فعلي — لا مجرّد استدلال من
     * المجموع.
     */
    await inPage(
      tabId,
      `() => {
        const box = document.createElement('div')
        box.id = 'rasd-perf-5000'
        box.style.cssText = 'position:fixed;inset-inline-start:-99999px;inset-block-start:0'
        const palette = ['#2b7fff', '#e7000b', '#00c950', '#f0f0f0', '#0f172b']
        for (let i = 0; i < 5000; i++) {
          const el = document.createElement('span')
          // كل عنصر خامس يحمل اللون الهدف فعليًّا — مطابقات حقيقية لا صفرية.
          el.style.color = palette[i % 5]
          box.appendChild(el)
        }
        document.body.appendChild(box)
        window.__rasdRafGaps = []
        window.__rasdRafStart = performance.now()
        let last = window.__rasdRafStart
        const tick = () => {
          const now = performance.now()
          window.__rasdRafGaps.push(now - last)
          last = now
          if (now - window.__rasdRafStart < 3500) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        return true
      }`,
    )

    const scanTiming = await inOverlay(
      tabId,
      `() => new Promise((resolve) => {
        const tool = globalThis.__rasdPalette.colourUsage
        const started = Date.now()
        tool.scan({ rgb: { r: 43, g: 127, b: 255 }, alpha: 1, inSrgb: true, source: 'css' })
        const wait = () => {
          if (tool.state.scanning.value) return void setTimeout(wait, 10)
          resolve({ elapsedMs: Date.now() - started, hits: tool.state.hits.value.length })
        }
        setTimeout(wait, 10)
      })`,
    )

    await new Promise((r) => setTimeout(r, 3600)) // نافذة تسجيل الإطارات (3500ms أعلاه) + هامش.

    const rafReport = await inPage(
      tabId,
      `() => {
        const gaps = window.__rasdRafGaps ?? []
        document.getElementById('rasd-perf-5000')?.remove()
        delete window.__rasdRafGaps
        return { maxGap: Math.max(0, ...gaps), frames: gaps.length }
      }`,
    )

    if (!scanTiming) {
      fail('تعذّر قياس مسح 5000 عقدة')
    } else {
      // 1000 من العقد الخمسة آلاف المحقونة (كل خامس عنصر) + مطابقات العيّنة
      // القائمة أصلًا على الصفحة (`#var-bg`/`span.tw-blue` من القسم 1 أعلاه)
      // — لا سببًا لعزلهما هنا، فالمسح يرى الصفحة كلّها كما تصلها فعليًّا.
      scanTiming.hits >= 1000
        ? ok(
            `المسح وجد ${scanTiming.hits} مطابقًا (١٠٠٠ من العقد المحقونة + مطابقات الصفحة القائمة)`,
          )
        : fail(`عدد المطابقات ${scanTiming.hits} دون 1000 المتوقَّعة من العقد المحقونة وحدها`)
      scanTiming.elapsedMs < 2000
        ? ok(`مسح 5000 عقدة اكتمل في ${scanTiming.elapsedMs}ms — دون سقف 2000ms`)
        : fail(`مسح 5000 عقدة استغرق ${scanTiming.elapsedMs}ms — تجاوز سقف 2000ms`)
      if (rafReport && rafReport.frames > 0) {
        // إطار عرض واحد ≈ 16.7ms؛ سقفٌ سخيّ (250ms) يفصل جمودًا حقيقيًّا عن
        // تذبذب عادي في بيئة CI، بلا تصديق زائف لعتبة 16.7ms المثالية.
        rafReport.maxGap < 250
          ? ok(
              `أكبر فارق بين إطارين متتاليين ${rafReport.maxGap.toFixed(1)}ms — لا تجميد (${rafReport.frames} إطارًا رُصدت)`,
            )
          : fail(`فارقٌ ${rafReport.maxGap.toFixed(1)}ms بين إطارين — الصفحة تجمّدت أثناء المسح`)
      } else {
        fail('تعذّر رصد إطارات العرض أثناء المسح')
      }
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
