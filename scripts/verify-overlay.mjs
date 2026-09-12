#!/usr/bin/env node
/**
 * يثبت أن الطبقة داخل الصفحة تعمل فوق صفحات حقيقية — في Chrome حقيقي.
 *
 * هذا هو الفحص الذي لا يستطيع Vitest تقديمه: happy-dom بلا محرّك تخطيط،
 * وبلا طبقة عليا، وبلا تتالٍ فعلي. كل ادّعاءات المرحلة 6 عن العزل والصمود
 * تُقاس هنا أو لا تُقاس.
 *
 * الحقن يجري عبر `chrome.scripting.executeScript` من الـservice worker —
 * المسار الحقيقي نفسه الذي ستستعمله النافذة في المرحلة 7.
 *
 * **نسخة فحص لا الحزمة المشحونة.** `chrome.permissions.request()` يشترط
 * إيماءة مستخدم ولا يمكن استدعاؤه من service worker، لذلك يُنسخ `dist/`
 * إلى مجلّد مؤقّت وتُضاف إلى بيانه صلاحية مضيف **للعيّنات المحلّية وحدها**
 * (`http://127.0.0.1/*`). الشيفرة والأصول متطابقة بايتًا ببايت؛ المتغيّر
 * الوحيد هو الإذن الذي يُمنح في المنتج بإيماءة. والحزمة الحقيقية تبقى بلا
 * صلاحية مضيف دائمة — `verify:dist` يفرض ذلك ولم يُمسّ.
 *
 *   pnpm build && pnpm verify:overlay
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
const PORT = 9334
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
const stage = mkdtempSync(join(tmpdir(), 'rasd-overlay-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(stagedManifest, 'utf8'))
manifest.host_permissions = ['http://127.0.0.1/*']
writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-overlay-'))
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
    func: () => globalThis.__rasdContent.startOverlay().then(r => ({
      ok: r.ok,
      level: r.ok ? r.value.host.level : null,
      error: r.ok ? null : r.error.message,
    })),
  }).then(r => r[0].result)`)
}

const census = `() => ({
  nodes: document.getElementsByTagName('*').length,
  rootKids: document.documentElement.childNodes.length,
  fonts: document.fonts.size,
})`

/**
 * المرحلة 16: استئناف صامت (`background/resume.ts`) يحقن الطبقة تلقائيًا في
 * أي تبويب يبلغ complete على أصل ممنوحة صلاحيته — وصلاحيتنا هنا أعلاه هي
 * بالذات صلاحية العيّنات المحلّية (منحناها لتشريع الحقن اليدوي أدناه، لا
 * رغبةً في سلوك الاستئناف). فيتسابق استئنافه الصامت مع حقننا الصريح على
 * حدث الاكتمال نفسه — ويُلوِّث تعداد "قبل" (المضيف يظهر) و"بعد" (خطوط
 * تحميلها ما زال قيد التنفيذ حين نقرأ).
 *
 * لا نُسكت الاستئناف ولا نُعطّله — سلوك مقصود مُثبَت بمكانه (الصفّ 85) —
 * بل نمنحه فرصة ليكتمل، ونفكّك ما حقنه، قبل أخذ تعداد "قبل" الحقيقي. هذا
 * نفس ما اضطُرّ إليه verify:activate حين أعاد تعريف "تبويب بارد" أول مرّة
 * ظهر فيها الاستئناف.
 */
async function settleResume(tabId) {
  const overlayPresent = () =>
    inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} }, world: 'ISOLATED',
      func: () => !!globalThis.__rasdOverlay,
    }).then(r => r[0].result).catch(() => false)`)

  let present = false
  for (let i = 0; i < 30; i++) {
    present = await overlayPresent()
    if (present) break
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!present) return // لم يستأنف على هذا التبويب — لا أثر لتفكيكه

  // نفس المهلة التي يثق بها الفحص أدناه لاكتمال تحميل وجوه الخطّ.
  await new Promise((r) => setTimeout(r, 400))
  await inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} }, world: 'ISOLATED',
    func: () => { const w = globalThis.__rasdOverlay; if (w) w.teardown() },
  })`)
  for (let i = 0; i < 15; i++) {
    if (!(await overlayPresent())) return
    await new Promise((r) => setTimeout(r, 100))
  }
}

// ── الجولة ──────────────────────────────────────────────────────
const results = []

if (extId && sw && granted) {
  for (const fixture of ['rtl-ar', 'ltr-en', 'mixed', 'spa', 'mutating', 'hostile']) {
    const tabId = await openTab(`/${fixture}/`)
    await settleResume(tabId)
    const before = await inPage(tabId, census)

    // جامع أخطاء في **العالمين**: أخطاء طبقتنا تقع في العالم المعزول ولا
    // تصل إلى `window.onerror` الخاصّ بالصفحة، والعكس صحيح. وصفر أخطاء في
    // الصفحة المضيفة شرط صريح للمرحلة.
    const collector = `() => {
      globalThis.__rasdErrors = []
      addEventListener('error', (e) => globalThis.__rasdErrors.push('error: ' + e.message))
      addEventListener('unhandledrejection', (e) => globalThis.__rasdErrors.push('reject: ' + e.reason))
      const orig = console.error
      console.error = (...a) => { globalThis.__rasdErrors.push('console: ' + a.join(' ')); orig(...a) }
      return true
    }`
    await inPage(tabId, collector)
    await inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} }, world: 'ISOLATED', func: ${collector},
    })`)

    const injected = await injectOverlay(tabId)
    if (String(injected).startsWith('ERR')) {
      fail(`${fixture}: فشل الحقن — ${injected}`)
      continue
    }
    const started = await startOverlay(tabId)
    if (!started?.ok) {
      fail(`${fixture}: لم تبدأ الطبقة — ${started?.error ?? 'سبب غير معروف'}`)
      continue
    }

    // وجوه الخطّ تُحمَّل غير متزامنة — ننتظرها ثم نقيس أنها وصلت فعلًا.
    // هذا هو الفحص الوحيد الذي يكشف أن `@font-face` داخل ورقة الظلّ تُهمَل
    // بصمت: كل فحص عبر CSSOM يمرّ، وطلب الشبكة وحده يقول الحقيقة.
    await new Promise((r) => setTimeout(r, 400))
    const fontsActive = await inPage(tabId, `() => document.fonts.size`)
    fontsActive >= 3
      ? ok(`${fixture}: وجوه الخطّ محمَّلة أثناء العمل (${fontsActive})`)
      : fail(`${fixture}: وجوه الخطّ لم تُحمَّل — ${fontsActive} بدل 3`)

    // من عالَم الصفحة: ماذا تستطيع الصفحة أن ترى وتفعل بنا؟
    const seen = await inPage(
      tabId,
      `() => {
        const kids = [...document.documentElement.children]
        const foreign = kids.filter(el => el.tagName !== 'HEAD' && el.tagName !== 'BODY')
        const host = foreign[foreign.length - 1] || null
        const cs = host ? getComputedStyle(host) : null
        return {
          foreignCount: foreign.length,
          hostTag: host ? host.tagName.toLowerCase() : null,
          // جذر ظلّ مغلق: الصفحة لا تصل إليه إطلاقًا.
          shadowVisible: host ? host.shadowRoot !== null : null,
          position: cs ? cs.position : null,
          display: cs ? cs.display : null,
          visibility: cs ? cs.visibility : null,
          opacity: cs ? cs.opacity : null,
          direction: cs ? cs.direction : null,
          zIndex: cs ? cs.zIndex : null,
          inTopLayer: host ? host.matches(':popover-open') : false,
          // اسم المضيف يجب ألّا يطابق ما تستهدفه الصفحات المعادية.
          matchesRasdSelectors: host
            ? host.matches('[class*="rasd"], [id*="rasd"], [data-rasd], rasd-overlay')
            : null,
          pageDir: getComputedStyle(document.documentElement).direction,
        }
      }`,
    )

    results.push({ fixture, before, seen, level: started.level })

    // ── تأكيدات لكل عيّنة ────────────────────────────────────────
    const tag = `${fixture}:`

    // `mutating/` تحذف مضيفنا فور إلحاقه بحكم تصميمها، فالتأكيدات على
    // **وجوده** تُقاس هناك في كتلتها الخاصّة أدناه لا هنا.
    if (fixture === 'mutating') {
      note(`${tag} عيّنة عدائية — التأكيدات في كتلتها أدناه`)
    } else {
      seen.foreignCount === 1
        ? ok(`${tag} مضيف واحد ملحق بـdocumentElement`)
        : fail(`${tag} عدد المضيفين ${seen.foreignCount} — يُتوقّع 1`)

      seen.shadowVisible === false
        ? ok(`${tag} جذر الظلّ مغلق — الصفحة لا تصل إليه`)
        : fail(`${tag} جذر الظلّ مكشوف للصفحة`)

      seen.matchesRasdSelectors === false
        ? ok(`${tag} اسم المضيف لا يطابق محدِّدات الاستهداف الشائعة`)
        : fail(`${tag} المضيف يطابق محدِّدًا تستهدفه الصفحات`)

      // العزل: الصفحة العدائية تفرض `all: unset !important` و`display: none`.
      const survived =
        seen.position === 'fixed' && seen.display !== 'none' && seen.visibility === 'visible'
      survived
        ? ok(`${tag} الأنماط الحرجة صمدت (position=${seen.position}, display=${seen.display})`)
        : fail(
            `${tag} الأنماط الحرجة لم تصمد — position=${seen.position} display=${seen.display} visibility=${seen.visibility}`,
          )

      seen.direction === 'ltr'
        ? ok(`${tag} اتجاه المضيف ltr رغم أن الصفحة ${seen.pageDir} — لا تسرّب`)
        : fail(`${tag} اتجاه المضيف ${seen.direction} — تسرّب من الصفحة`)

      seen.inTopLayer
        ? ok(`${tag} في الطبقة العليا عبر popover`)
        : note(`${tag} على الطبقة الدنيا (level=${started.level})`)
    }

    // ── عيّنات خاصّة ─────────────────────────────────────────────
    if (fixture === 'hostile') {
      // الطبقة العليا الحقيقية: `dialog.showModal()` من الصفحة.
      await inPage(tabId, `() => window.__attackTopLayer()`)
      const afterDialog = await inPage(
        tabId,
        `() => { const els = document.elementsFromPoint(5, 5); return els.map(e => e.tagName).slice(0, 3) }`,
      )
      note(`hostile: بعد showModal الصفحة، أعلى العناصر = ${afterDialog.join(' › ')}`)
      await inPage(tabId, `() => window.__clearTopLayer()`)

      // تحوّل على الجذر يكسر position:fixed — الطبقة العليا لا تتأثر.
      await inPage(tabId, `() => window.__attackTransform()`)
      const afterTransform = await inPage(
        tabId,
        `() => {
          const kids = [...document.documentElement.children]
          const foreign = kids.filter(el => el.tagName !== 'HEAD' && el.tagName !== 'BODY')
          const host = foreign[foreign.length - 1]
          const r = host.getBoundingClientRect()
          return { top: Math.round(r.top), height: Math.round(r.height), vh: window.innerHeight }
        }`,
      )
      const sane =
        Math.abs(afterTransform.top) <= 2 && afterTransform.height <= afterTransform.vh + 2
      sane
        ? ok(
            `hostile: صمد أمام transform على <html> — الارتفاع ${afterTransform.height} ≈ النافذة ${afterTransform.vh}`,
          )
        : fail(
            `hostile: انكسر بـtransform على <html> — top=${afterTransform.top} height=${afterTransform.height} vh=${afterTransform.vh}`,
          )
      await inPage(tabId, `() => window.__clearTransform()`)
    }

    if (fixture === 'spa') {
      // نقرة حقيقية لا استدعاء برمجي: المسار الذي يسلكه المستخدم.
      const routed = await inPage(
        tabId,
        `() => new Promise(res => {
          const btn = [...document.querySelectorAll('header button')].find(b => b.dataset.route === '/tasks')
          btn.click()
          setTimeout(() => res({ path: location.pathname, view: document.querySelector('h1').textContent }), 150)
        })`,
      )
      routed.path === '/tasks'
        ? ok(`spa: نقرة حقيقية غيّرت المسار إلى ${routed.path}`)
        : fail(`spa: المسار لم يتغيّر (${routed.path})`)

      const stillThere = await inPage(
        tabId,
        `() => [...document.documentElement.children].filter(el => el.tagName !== 'HEAD' && el.tagName !== 'BODY').length`,
      )
      stillThere === 1
        ? ok('spa: الطبقة نجت من تغيّر المسار')
        : fail(`spa: عدد المضيفين بعد التنقّل ${stillThere}`)
    }

    if (fixture === 'mutating') {
      // الصفحة تحذف كل عنصر غريب في كل طفرة — نتحقّق أننا نعود.
      await new Promise((r) => setTimeout(r, 1200))
      const state = await inPage(
        tabId,
        `() => ({
          sweeps: window.__sweepCount(),
          hosts: [...document.documentElement.children].filter(el => el.tagName !== 'HEAD' && el.tagName !== 'BODY').length,
        })`,
      )
      note(`mutating: الماسح حذف ${state.sweeps} عنصرًا`)
      state.hosts <= 1
        ? ok(`mutating: تراجع منضبط تحت الكنس — لا تكاثر (${state.hosts} مضيف)`)
        : fail(`mutating: ${state.hosts} مضيفين — الحقن تكاثر`)

      // العيّنة غير قابلة للفوز عمدًا؛ السلوك الصحيح هو التراجع ثم **العودة**
      // حين يهدأ الماسح. هذا ما يفصل التراجع المنضبط عن الاستسلام الدائم.
      await inPage(tabId, `() => window.__stopMutating()`)
      await inSW(`chrome.scripting.executeScript({
        target: { tabId: ${tabId} },
        world: 'ISOLATED',
        func: () => { const w = globalThis.__rasdOverlay; if (w) w.reassert() },
      })`)
      await new Promise((r) => setTimeout(r, 250))
      const revived = await inPage(
        tabId,
        `() => [...document.documentElement.children].filter(el => el.tagName !== 'HEAD' && el.tagName !== 'BODY').length`,
      )
      revived === 1
        ? ok('mutating: عاد المضيف بعد أن هدأ الماسح')
        : fail(`mutating: لم يعد المضيف بعد هدوء الماسح (${revived})`)
    }

    // ── التفكيك ────────────────────────────────────────────────
    await inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} },
      world: 'ISOLATED',
      func: () => { const w = globalThis.__rasdOverlay; if (w) w.teardown() },
    })`)

    const after = await inPage(tabId, census)
    // العدّ المطلق للعقد لا يصلح على صفحة تضيف عقدًا من نفسها كل 250ms.
    // أثرُنا كلّه **طفل مباشر واحد** تحت الجذر، فهو المقياس الصحيح — ومعه
    // وجوه الخطّ، وهي الأثر الآخر الوحيد الذي نتركه في مستند لا نملكه.
    const clean = after.rootKids === before.rootKids && after.fonts === before.fonts
    clean
      ? ok(
          `${tag} التفكيك نظيف — أطفال الجذر ${after.rootKids}=${before.rootKids}، الخطوط ${after.fonts}=${before.fonts}`,
        )
      : fail(
          `${tag} التفكيك ترك أثرًا — أطفال الجذر ${before.rootKids}→${after.rootKids}، خطوط ${before.fonts}→${after.fonts}`,
        )

    const pageErrors = await inPage(tabId, `() => globalThis.__rasdErrors || []`)
    const isoErrors = await inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} }, world: 'ISOLATED',
      func: () => globalThis.__rasdErrors || [],
    }).then(r => r[0].result)`)
    const allErrors = [...pageErrors, ...isoErrors]
    allErrors.length === 0
      ? ok(`${tag} صفر أخطاء console في العالمين`)
      : fail(`${tag} ${allErrors.length} خطأ: ${allErrors.slice(0, 2).join(' | ')}`)

    await inSW(`chrome.tabs.remove(${tabId})`)
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\nفحص الطبقة داخل الصفحة:')
console.log(`  المتصفح: ${chrome}`)
for (const line of lines) console.log(line)

ws.close()
await cleanup()

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('\n✓ الطبقة تعمل فوق العيّنات، معزولة، وتفكّك بلا أثر.\n')
