#!/usr/bin/env node
/**
 * يثبت أن محرّك التعليق (المرحلة 15) يرسم ويقيس فوق كروم حقيقي.
 *
 * **ما لا تكشفه 1577 اختبار وحدة:** بيئة الاختبار تُرجع `null` من
 * `getContext('2d')` بالقياس، فكل ما يُختبَر هناك هو **قرار الرسم** لا
 * الرسم نفسه. وثلاثة أسئلة لا يجيب عنها إلّا متصفّح يرسم فعلًا:
 *
 *   1. هل تُقلع الصفحة وتفكّ الصورة وتبني قماشَيها بالمقاس المخطَّط؟
 *   2. هل تُنشئ إيماءةُ مؤشِّر عقدةً في المشهد، ويعيدها `⌘Z` بالضبط؟
 *   3. **وكم تستهلك الذاكرة فعلًا؟** ADR 0011 يعلن ميزانية المحرر مفتوحة
 *      نصًّا: `CANVAS_BUDGET_BYTES` مقاسة لقماش **واحد** في الـservice
 *      worker لا لطبقتين في صفحة. وهذا القياس يسبق دفعة الخبز عمدًا كي لا
 *      تُبنى فوق رقم غير مقيس.
 *
 * ولا يحقن سكربت محتوى: المحرر **صفحة إضافة**، فالقيادة على هدف الصفحة
 * مباشرةً — كما يفعل `verify-popup.mjs`.
 *
 *   pnpm build && pnpm verify:editor
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9371
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

// ── قبل كروم: هل بُني الـworker أصلًا؟ ───────────────────────────
/*
 * فحصٌ يسبق إقلاع المتصفّح عمدًا: انحدارُ حزمٍ يسقط في مللي ثانية بدل أن
 * يسقط بعد تحميل إضافة وفتح تبويب. والشكل الحرفي `new Worker(new URL(…))`
 * هو ما يعرفه vite؛ ورفعُ الـ`URL` إلى متغيّر يُخرج ملفّ `.ts` خامًا.
 */
const bundlePreflight = []
{
  const { readdirSync } = await import('node:fs')
  const assets = join(dist, 'assets')
  const files = existsSync(assets) ? readdirSync(assets) : []
  const workerFile = files.find((f) => /^blur\.worker-.*\.js$/.test(f))
  bundlePreflight.push(
    workerFile
      ? { ok: true, text: `ملفّ الـworker في الحزمة: assets/${workerFile}` }
      : { ok: false, text: 'لا ملفّ blur.worker في dist/assets — الشكل الحرفي انكسر' },
  )
  if (workerFile) {
    const pages = files.filter((f) => f.endsWith('.js') && !f.startsWith('blur.worker'))
    const referenced = pages.some((f) => readFileSync(join(assets, f), 'utf8').includes(workerFile))
    bundlePreflight.push(
      referenced
        ? { ok: true, text: 'وموضع النداء يشير إليه بعنوان الحزمة لا بمسار المصدر' }
        : { ok: false, text: 'لا موضع نداء يشير إلى ملفّ الـworker' },
    )
  }
}

// ── خادم العيّنات ────────────────────────────────────────────────
const fixtures = spawn(process.execPath, [join(root, 'scripts', 'fixtures-serve.mjs')], {
  stdio: 'ignore',
  env: { ...process.env, RASD_FIXTURES_PORT: String(FIXTURES) },
})
await new Promise((r) => setTimeout(r, 600))

const stage = mkdtempSync(join(tmpdir(), 'rasd-editor-ext-'))
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

const profile = mkdtempSync(join(tmpdir(), 'rasd-editor-'))
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

/*
 * أخطاء الصفحة تُجمَع.
 *
 * وحدة بناء الرقع **تفشل صامتةً بالتصميم** — كل تعذّر يرسم تغطية معتمة —
 * فاستثناءٌ فيها يبدو سياسةً أمنية. وبلا هذا الجمع كان التشخيص تخمينًا.
 */
const pageErrors = []
ws.addEventListener('message', (event) => {
  let msg
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params?.exceptionDetails
    pageErrors.push(d?.exception?.description ?? d?.text ?? 'استثناء بلا وصف')
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    pageErrors.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? '?').join(' '))
  }
})

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

async function settle(sessionId) {
  await send(
    'Runtime.evaluate',
    {
      expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
      awaitPromise: true,
    },
    sessionId,
  )
}

async function moveTo(sessionId, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse' },
    sessionId,
  )
  await settle(sessionId)
}

const note = (m) => lines.push(`  · ${m}`)

const evalIn = async (sessionId, expression) => {
  const r = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}

/**
 * يفتح المحرر على لقطة يزرعها في قاعدة البيانات **من الصفحة نفسها**.
 *
 * الزرع من الصفحة لا من الـservice worker: كلاهما على أصل الإضافة فقاعدة
 * البيانات واحدة، والصفحة تملك `OffscreenCanvas` فتبني صورة PNG حقيقية
 * بنمط معروف — فيصير «هل رُسمت الصورة؟» سؤالًا يُجاب بقراءة بكسل لا بالنظر.
 */
async function seedAndOpen(w, h, dpr) {
  await inSW(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/editor/index.html?capture=probe'), active: true }).then(t => t.id)`,
  )
  /*
   * **آخر هدفٍ للمحرر لا أوّله.** التبويب الجديد يُفتح فوق تبويبٍ سابق ما زال
   * حيًّا، و`find` تُعيد الأقدم — فتُزرع اللقطة في تبويب ويُقاس آخر، ويصير
   * قياس الحالة القصوى قياسًا للحالة العادية بلا رسالة.
   */
  let target = null
  for (let i = 0; i < 40; i++) {
    const { targetInfos } = await send('Target.getTargets')
    const editors = targetInfos.filter(
      (t) => t.type === 'page' && String(t.url).includes('/editor/'),
    )
    target = editors.at(-1) ?? null
    if (target) break
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!target) return null
  const { sessionId } = await send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)

  const seeded = await evalIn(
    sessionId,
    `(async () => {
      const cv = new OffscreenCanvas(${w}, ${h})
      const c = cv.getContext('2d')
      c.fillStyle='#204060'; c.fillRect(0,0,${w},${h})
      c.fillStyle='#ff3355'; c.fillRect(0,0,${Math.floor(w / 2)},${Math.floor(h / 2)})
      const blob = await cv.convertToBlob({ type: 'image/png' })
      /*
       * **تُنتظَر قاعدة التطبيق، ولا تُنشَأ هنا.**
       * فتحُ 'rasd' بنسخة 1 على قاعدة لم تُنشأ بعد **يُنشئها فارغة بلا
       * مخازن**، فيسبق الزرعُ ترقيةَ التطبيق ويعطي
       * «object store was not found». وهو سباقٌ كان يُربَح بالتوقيت وحده،
       * حتى أبطأت واردات الدفعة الرابعة إقلاع الصفحة قليلًا فانكشف.
       */
      const need = ['captures','blobs','annotations']
      const db = await (async () => {
        for (let i = 0; i < 80; i++) {
          const list = await indexedDB.databases()
          if (list.some(d => d.name === 'rasd')) {
            const opened = await new Promise((res, rej) => {
              const r = indexedDB.open('rasd')
              r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
            })
            if (need.every(n => opened.objectStoreNames.contains(n))) return opened
            opened.close()
          }
          await new Promise(r => setTimeout(r, 150))
        }
        throw new Error('قاعدة rasd لم تجهز بمخازنها')
      })()
      const tx = db.transaction(need, 'readwrite')
      tx.objectStore('annotations').delete('probe')
      tx.objectStore('captures').put({
        /*
         * **أصلٌ http عمدًا** — وهو البند الذي تركه ADR 0009 مفتوحًا:
         * النسخ من سياق غير آمن لا يعمل إطلاقًا (navigator.clipboard
         * غائبة)، ولا بديل قبل أن يوجد المحرر كوجهة مركَّزة بحكم بنائها.
         */
        id:'probe', createdAt: Date.now(), origin:'http://127.0.0.1:5399', url:'http://127.0.0.1:5399/probe',
        title:'لقطة القياس', kind:'viewport', status:'ready', projectId:null, tags:[],
        width:${w}, height:${h}, devicePixelRatio:${dpr}, favorite:false, trashedAt:null, archived:false,
      })
      tx.objectStore('blobs').put({ id:'probe', blob, mime:'image/png', bytes: blob.size })
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
      return JSON.stringify({ ok: true, bytes: blob.size })
    })().catch(e => JSON.stringify({ ok:false, error:String(e) }))`,
  )
  await send('Page.reload', {}, sessionId)
  return { sessionId, seeded: JSON.parse(seeded) }
}

/** ينتظر حالة المحرر أن تصير جاهزة وقماشيها مبنيَّين. */
async function waitReady(sessionId) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200))
    const raw = await evalIn(
      sessionId,
      `JSON.stringify({
        state: document.querySelector('[data-editor-state]')?.getAttribute('data-editor-state') ?? null,
        stage: !!document.querySelector('[data-editor-stage]'),
        base: (() => { const c = document.querySelector('[data-stage-layer="base"]'); return c ? { w: c.width, h: c.height } : null })(),
        anno: (() => { const c = document.querySelector('[data-stage-layer="annotations"]'); return c ? { w: c.width, h: c.height } : null })(),
      })`,
    ).catch(() => null)
    if (!raw) continue
    const s = JSON.parse(raw)
    /*
     * `annotating` لا `ready`: الدفعة الخامسة أدخلت الحالات المسمّاة في
     * الخطّة (`annotating` · `redact` · `exporting`)، والاسم القديم كان
     * يصف «حُمِّلت» لا «أيّ حالة». ويُقبَل الاثنان كي لا يسقط الفحص على
     * فرقٍ في التسمية وحده.
     */
    if ((s.state === 'annotating' || s.state === 'ready') && s.stage && s.base && s.base.w > 1) {
      return s
    }
  }
  return null
}

const nodeCount = async (S) =>
  Number(await evalIn(S, `document.querySelector('[data-editor-nodes]').textContent`))

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const opened = await seedAndOpen(1200, 900, 2)
  if (!opened) fail('لم تُفتح صفحة المحرر')
  else if (!opened.seeded.ok) fail(`تعذّر زرع اللقطة: ${opened.seeded.error}`)
  else {
    ok(`اللقطة مزروعة (${opened.seeded.bytes} بايتًا من PNG)`)
    const S = opened.sessionId
    const ready = await waitReady(S)

    if (!ready) fail('المحرر لم يبلغ حالة الجاهزية')
    else {
      ok(`المحرر جاهز — قماشان ${ready.base.w}×${ready.base.h} و${ready.anno.w}×${ready.anno.h}`)

      // ── 1) الطبقتان بمقاس المسرح لا بمقاس الصورة ───────────────
      const s1 = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const wrap = document.querySelector('[data-editor-stage]').getBoundingClientRect()
            const base = document.querySelector('[data-stage-layer="base"]')
            return { cssW: Math.round(wrap.width), cssH: Math.round(wrap.height), bw: base.width, dpr: devicePixelRatio }
          })())`,
        ),
      )
      if (s1.bw <= s1.cssW * s1.dpr + 2 && s1.bw < 1200 * s1.dpr) {
        ok(`الطبقتان بمقاس المسرح (${s1.bw} بكسل) لا بمقاس الصورة (${1200 * s1.dpr})`)
      } else {
        fail(`مقاس الطبقة ${s1.bw} غير متوقَّع (مسرح ${s1.cssW} × كثافة ${s1.dpr})`)
      }

      // ── 2) الصورة مرسومة فعلًا — لا قماش حيّ فارغ ──────────────
      const px = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const c = document.querySelector('[data-stage-layer="base"]')
            const d = c.getContext('2d').getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data
            return { r: d[0], g: d[1], b: d[2], a: d[3] }
          })())`,
        ),
      )
      if (px.a > 0 && px.r === 32 && px.g === 64 && px.b === 96) {
        ok(`طبقة الأساس مرسومة باللون المزروع بالضبط — rgb(${px.r},${px.g},${px.b})`)
      } else {
        fail(`البكسل المركزي rgba(${px.r},${px.g},${px.b},${px.a}) لا يطابق المزروع`)
      }

      // ── 3) إيماءة تُنشئ عقدة، والتراجع يعيدها ─────────────────
      await evalIn(S, `document.querySelector('[data-tool="rect"]').click()`)
      const box = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify(document.querySelector('[data-editor-stage]').getBoundingClientRect().toJSON())`,
        ),
      )
      const cx = Math.round(box.x + box.width / 2)
      const cy = Math.round(box.y + box.height / 2)

      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: cx - 80,
          y: cy - 60,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await moveTo(S, cx, cy)
      await moveTo(S, cx + 80, cy + 60)
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: cx + 80,
          y: cy + 60,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 200))

      const afterDraw = await nodeCount(S)
      if (afterDraw === 1) ok('سحبةٌ بأداة المستطيل أنشأت عقدة واحدة')
      else fail(`عدد العقد بعد السحب ${afterDraw} لا 1`)

      const anno = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const c = document.querySelector('[data-stage-layer="annotations"]')
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
            let opaque = 0
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++
            return { opaque }
          })())`,
        ),
      )
      if (anno.opaque > 0) ok(`طبقة التعليقات رُسمت — ${anno.opaque} بكسلًا غير شفّاف`)
      else fail('طبقة التعليقات فارغة رغم وجود عقدة')

      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 },
        S,
      )
      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 },
        S,
      )
      await new Promise((r) => setTimeout(r, 300))
      if ((await nodeCount(S)) === 0) ok('و⌘Z أعاد المشهد فارغًا')
      else fail('التراجع لم يُفرغ المشهد')

      // ── 4) النصّ العربي على القماش — ما لا يُقاس إلّا بمتصفّح يرسم ─
      /*
       * أربع مقدّمات بُنيت عليها `draw/text.ts` و`text-layout.ts`، وكلّها
       * دعاوى عن **سلوك كروم** لا عن منطقنا. بيئة الاختبار بلا سياق ثنائي
       * الأبعاد أصلًا، فلا تنفي ولا تثبت. وتُقاس هنا مرّةً واحدة.
       */
      const canvasFacts = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const c = document.querySelector('[data-stage-layer="annotations"]').getContext('2d')
            const fresh = document.createElement('canvas').getContext('2d')
            const F = '400 16px system-ui'

            c.save(); c.setTransform(1,0,0,1,0,0)
            const inheritedDir = c.direction
            c.restore()

            fresh.font = F
            const joined = fresh.measureText('مرحبا').width
            const apart = ['م','ر','ح','ب','ا'].reduce((s,ch) => s + fresh.measureText(ch).width, 0)

            fresh.letterSpacing = '3px'
            const arabicSpaced = fresh.measureText('مرحبا').width
            const latinSpaced = fresh.measureText('ABC').width
            fresh.letterSpacing = '0px'
            const latinPlain = fresh.measureText('ABC').width

            const bare = fresh.measureText('الحشوة 14px واللون #3B82F6').width
            const isolated = fresh.measureText('الحشوة ⁦14px⁩ واللون ⁦#3B82F6⁩').width

            return {
              inheritedDir, joined, apart, arabicSpaced, latinSpaced, latinPlain, bare, isolated,
            }
          })())`,
        ),
      )

      if (canvasFacts.inheritedDir === 'rtl') {
        ok('اتجاه سياق القماش يرث `rtl` من المستند — فالضبط الصريح في كل رسمة ليس زيادة')
      } else {
        fail(`اتجاه السياق الموروث ${canvasFacts.inheritedDir} لا rtl — راجع تعليل draw/text.ts`)
      }

      if (canvasFacts.joined < canvasFacts.apart) {
        ok(
          `**التشكيل المتّصل يعمل** — «مرحبا» ${canvasFacts.joined.toFixed(2)} مقابل ${canvasFacts.apart.toFixed(2)} لحروفها مفردة، فنداءٌ لكل كلمة كان سيوسّعها`,
        )
      } else {
        fail('لا فرق بين المتّصل والمفرد — التشكيل لا يعمل في هذا السياق')
      }

      if (
        Math.abs(canvasFacts.arabicSpaced - canvasFacts.joined) < 0.01 &&
        canvasFacts.latinSpaced > canvasFacts.latinPlain + 1
      ) {
        ok(
          `و\`letterSpacing\` يُتجاهَل على العربية (${canvasFacts.arabicSpaced.toFixed(2)}) ويُطبَّق على اللاتيني (${canvasFacts.latinPlain.toFixed(2)} ← ${canvasFacts.latinSpaced.toFixed(2)}) — ولذلك صفرٌ مفروضٌ بالنوع`,
        )
      } else {
        fail('سلوك letterSpacing لا يطابق المقيس — راجع FontSpec.letterSpacingPx')
      }

      if (Math.abs(canvasFacts.bare - canvasFacts.isolated) < 0.5) {
        ok(
          `**ومحارف العزل لا تُضيف عرضًا** (${canvasFacts.bare.toFixed(2)} ≈ ${canvasFacts.isolated.toFixed(2)}) — فاللفّ يُقاس على النصّ المرسوم بلا فرق`,
        )
      } else {
        fail(
          `العزل غيّر العرض ${canvasFacts.bare.toFixed(2)} ← ${canvasFacts.isolated.toFixed(2)} — اللفّ سيخالف الرسم`,
        )
      }

      // ── 5) سطر القبول: يُكتَب حيًّا، ويُلَفّ، ويُرسَم ────────────
      await evalIn(S, `document.querySelector('[data-tool="text"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 120))

      // سحبةٌ تحدّد عرض اللفّ — نقرةٌ كانت ستعني «بلا لفّ».
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: cx - 120,
          y: cy - 40,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await moveTo(S, cx - 40, cy - 20)
      await moveTo(S, cx + 30, cy)
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: cx + 30,
          y: cy,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 250))

      const editorOpen = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const el = document.querySelector('[data-text-editor]')
            return el ? { dir: el.dir, focused: document.activeElement === el } : null
          })())`,
        ),
      )
      if (editorOpen?.focused) {
        ok('أداة النصّ تفتح حقلًا مركَّزًا فور وضعها — لا خطوة ثانية يكتشفها المستخدم')
      } else {
        fail('حقل النصّ لم يُفتَح أو لم يُركَّز')
      }

      /** يكتب محرفًا واحدًا كما يكتبه إنسان — بأحداث لوحة مفاتيح حقيقية. */
      const typeChar = async (ch) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }, S)
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, S)
      }

      const LINE = 'الحشوة 14px 24px واللون #3B82F6'
      for (const ch of LINE) await typeChar(ch)
      await settle(S)
      await new Promise((r) => setTimeout(r, 200))

      const typed = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const el = document.querySelector('[data-text-editor]')
            return el ? { value: el.value, dir: el.dir } : null
          })())`,
        ),
      )
      if (typed?.value === LINE) ok(`**سطر القبول مكتوب حيًّا** — «${LINE}»`)
      else fail(`ما وصل إلى الحقل «${typed?.value ?? 'لا شيء'}» لا سطر القبول`)

      if (typed?.dir === 'rtl') {
        ok('واتجاه الحقل `rtl` — أوّل محرف قويّ عربي، والأرقام والرموز لا تقلبه')
      } else {
        fail(`اتجاه الحقل ${typed?.dir} لا rtl`)
      }

      // ⎋ يُنهي التحرير فتنتقل الصورة من الحقل إلى القماش.
      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
        S,
      )
      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 300))

      /*
       * يُلغى التحديد قبل قياس النطاقات.
       *
       * مستطيل التحديد ومقابضه حبرٌ أيضًا، ويصل بين الأسطر فيدمج نطاقاتها
       * في نطاق واحد. وهذا ما وقع فعلًا حين صارت حدود النصّ مقيسة: العدّ
       * هبط من ٢ إلى ١ بلا تغيّر في اللفّ نفسه.
       */
      await evalIn(S, `document.querySelector('[data-tool="select"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 120))
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: cx - 260,
          y: cy + 200,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: cx - 260,
          y: cy + 200,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 200))

      /*
       * اللفّ يُقاس بعدّ **نطاقات الحبر الأفقية**: سطرٌ ملفوف يترك فراغًا
       * بين نطاقين. وهذا قياسٌ على البكسلات لا على بنيتنا — فلو لفّ التخطيط
       * صحيحًا ورسم الرسّام كل الأسطر فوق بعضها لكشفه العدّ.
       */
      const bands = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const c = document.querySelector('[data-stage-layer="annotations"]')
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
            const rows = new Uint8Array(c.height)
            for (let y = 0; y < c.height; y++) {
              for (let x = 0; x < c.width; x++) {
                if (d[(y * c.width + x) * 4 + 3] > 24) { rows[y] = 1; break }
              }
            }
            let bands = 0, ink = 0
            for (let y = 0; y < c.height; y++) {
              if (rows[y]) { ink++; if (y === 0 || !rows[y - 1]) bands++ }
            }
            return { bands, ink }
          })())`,
        ),
      )
      if (bands.ink > 0) ok(`والنصّ مرسوم على القماش — ${bands.ink} صفًّا فيه حبر`)
      else fail('لا حبر على طبقة التعليقات بعد إنهاء التحرير')

      if (bands.bands >= 2) {
        ok(`**والسطر لُفّ إلى ${bands.bands} نطاقات** — العرض المسحوب أضيق من السطر`)
      } else {
        fail(`نطاقٌ واحد فقط (${bands.bands}) — لم يقع لفّ رغم ضيق العرض`)
      }

      /*
       * لقطةٌ للعين لا للتأكيد.
       *
       * كل ما سبق يقيس أرقامًا؛ ولا رقم يكشف «الحروف متّصلة لكنها تبدو
       * خاطئة» — الهمزة على السطر، أو التشكيل المكسور، أو سطرٌ يلامس الذي
       * تحته. تُكتَب إلى `artifacts/` ولا تُفحَص آليًّا.
       */
      try {
        const shot = await send('Page.captureScreenshot', { format: 'png' }, S)
        const dir = join(root, 'artifacts')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const file = join(dir, 'editor-arabic-text.png')
        writeFileSync(file, Buffer.from(shot.data, 'base64'))
        note(`لقطة للمراجعة البصرية: artifacts/editor-arabic-text.png`)
      } catch (e) {
        note(`تعذّرت اللقطة البصرية: ${e}`)
      }

      // ── 6) نوبة الكتابة على المكدّس: ⌘Z تمحو كلمة لا فقرة ───────
      const undoOnce = async () => {
        await send(
          'Input.dispatchKeyEvent',
          { type: 'rawKeyDown', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 },
          S,
        )
        await send(
          'Input.dispatchKeyEvent',
          { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4, windowsVirtualKeyCode: 90 },
          S,
        )
        await settle(S)
        await new Promise((r) => setTimeout(r, 150))
      }

      await undoOnce()
      if ((await nodeCount(S)) === 1) {
        ok('و⌘Z واحدة **لم تمحُ عقدة النصّ** — النوبة كلمةٌ لا جلسة كاملة')
      } else {
        fail('⌘Z واحدة محت عقدة النصّ — الكتابة كلّها في علامة واحدة')
      }

      /*
       * ما بقي بعد التراجع يُقرأ من الحقل نفسه: يُعاد فتحه بنقرة مزدوجة على
       * النصّ. وهذا هو بند القبول حرفيًّا — «تُمحى كلمةٌ لا الفقرة».
       */
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: cx - 60,
          y: cy - 26,
          button: 'left',
          clickCount: 2,
          pointerType: 'mouse',
        },
        S,
      )
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: cx - 60,
          y: cy - 26,
          button: 'left',
          clickCount: 2,
          pointerType: 'mouse',
        },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 250))

      await evalIn(S, `document.querySelector('[data-tool="text"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 120))

      const stacked = await nodeCount(S)
      if (stacked === 1) {
        ok('**والنقر على نصٍّ قائم يفتحه ولا يكدّس فوقه عقدةً فارغة**')
      } else {
        fail(`النقر على النصّ أعطى ${stacked} عقدة لا 1 — عقدة فارغة تراكمت فوقه`)
      }

      const remaining = await evalIn(
        S,
        `(document.querySelector('[data-text-editor]')?.value ?? '\u0000')`,
      )
      if (remaining === '\u0000') {
        note('تعذّر إعادة فتح النصّ بنقرة مزدوجة — يُكتفى بعدّ الضغطات أدناه')
      } else if (remaining !== '' && remaining.length < LINE.length && LINE.startsWith(remaining)) {
        ok(`**وما بقي «${remaining}»** — بادئةٌ صحيحة أقصر من السطر، لا فراغ ولا الفقرة كلّها`)
      } else {
        fail(`ما بقي بعد ⌘Z واحدة «${remaining}» — ليس بادئةً أقصر من السطر`)
      }

      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
        S,
      )
      await send(
        'Input.dispatchKeyEvent',
        { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
        S,
      )
      await settle(S)

      let presses = 1
      while (presses < 40 && (await nodeCount(S)) > 0) {
        await undoOnce()
        presses++
      }
      /*
       * حدّا القبول معًا: أكثر من ضغطتين (وإلّا فالسطر كلّه علامة واحدة)،
       * وأقلّ من نصف عدد المحارف (وإلّا فعلامةٌ لكل حرف تُخلي مكدّسًا سعته
       * خمسون بسطرٍ واحد).
       */
      if (presses > 2 && presses < LINE.length / 2) {
        ok(
          `**ومحو السطر كلّه احتاج ${presses} ضغطة** لا ${LINE.length} — بين الطرفين اللذين يُسقطان بند القبول`,
        )
      } else {
        fail(`محو السطر احتاج ${presses} ضغطة على ${LINE.length} محرفًا — خارج المدى المقبول`)
      }

      // ── 7) الحجب والطمس: البكسلات نفسها لا طبقة عرض ──────────────
      for (const line of bundlePreflight) {
        if (line.ok) ok(line.text)
        else fail(line.text)
      }

      /** يقرأ بكسلات مستطيل من طبقة معلومة، ويُرجع تباينه وعدد ألوانه. */
      const regionStats = async (layer, x, y, w, h) =>
        JSON.parse(
          await evalIn(
            S,
            `JSON.stringify((() => {
              const c = document.querySelector('[data-stage-layer="${layer}"]')
              const d = c.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data
              let sum = 0, n = 0
              const seen = new Set()
              for (let i = 0; i < d.length; i += 4) {
                sum += 77*d[i] + 150*d[i+1] + 29*d[i+2]
                seen.add((d[i]<<24 | d[i+1]<<16 | d[i+2]<<8 | d[i+3]) >>> 0)
                n++
              }
              const mean = sum / n
              let acc = 0
              for (let i = 0; i < d.length; i += 4) {
                const v = 77*d[i] + 150*d[i+1] + 29*d[i+2] - mean
                acc += v * v
              }
              return { variance: acc / n / 65536, colours: seen.size, n }
            })())`,
          ),
        )

      /*
       * المنطقة تُرسم **على حدّ اللونين المزروعين**، أي على مركز الصورة
       * حيث يلتقي الربع الأحمر بالخلفية. ومنطقةٌ داخل لون واحد كانت ستُعطي
       * تباينًا صفرًا بعد الضباب كما قبله — فيمرّ الفحص على محرّك معطّل.
       */
      await evalIn(S, `document.querySelector('[data-tool="redact"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 120))

      const rx = cx - 70
      const ry = cy - 45
      await send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x: rx, y: ry, button: 'left', clickCount: 1, pointerType: 'mouse' },
        S,
      )
      await moveTo(S, rx + 70, ry + 45)
      await moveTo(S, rx + 140, ry + 90)
      await send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: rx + 140,
          y: ry + 90,
          button: 'left',
          clickCount: 1,
          pointerType: 'mouse',
        },
        S,
      )
      await settle(S)
      await new Promise((r) => setTimeout(r, 300))

      const frameBox = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const wrap = document.querySelector('[data-editor-stage]').getBoundingClientRect()
            const c = document.querySelector('[data-stage-layer="annotations"]')
            return { sx: c.width / wrap.width, x: wrap.x, y: wrap.y }
          })())`,
        ),
      )
      // مستطيل داخل منطقة الحجب، بفضاء مخزن القماش، بعيدًا عن حدّه المتقطّع.
      const bx = Math.round((rx + 30 - frameBox.x) * frameBox.sx)
      const by = Math.round((ry + 20 - frameBox.y) * frameBox.sx)
      const bw = Math.round(80 * frameBox.sx)
      const bh = Math.round(50 * frameBox.sx)

      const covered = await regionStats('annotations', bx, by, bw, bh)
      if (covered.variance === 0 && covered.colours === 1) {
        ok('**التغطية تُسطّح المنطقة تمامًا** — تباين صفر ولونٌ واحد على القماش')
      } else {
        fail(`التغطية تركت تباينًا ${covered.variance.toFixed(3)} و${covered.colours} لونًا`)
      }

      // تُبدَّل إلى ضبابي من اللوحة — وهي المسار الذي يمرّ من العقدة والرقعة.
      const switched = await evalIn(
        S,
        `(() => {
          const b = document.querySelector('[data-redact-mode="blur"]')
          if (!b) return 'no-panel'
          b.click()
          return 'ok'
        })()`,
      )
      if (switched !== 'ok') {
        fail('لوحة الحجب لم تُعرض — لا زرّ نمط')
      } else {
        // الرقعة تُبنى غير متزامنة؛ الإطار الأوّل تغطية. وحركةُ مؤشِّر
        // تضمن إطارًا جديدًا بعد جهوزها.
        await new Promise((r) => setTimeout(r, 600))
        await moveTo(S, cx, cy)
        await new Promise((r) => setTimeout(r, 900))
        await settle(S)

        const blurred = await regionStats('annotations', bx, by, bw, bh)
        if (blurred.colours > 1 && blurred.variance > 0) {
          ok(
            `**والضباب يُعاين بالبكسلات فعلًا** — ${blurred.colours} لونًا وتباين ${blurred.variance.toFixed(1)} حيث كانت التغطية لونًا واحدًا`,
          )
        } else {
          fail('التبديل إلى ضبابي أبقى المنطقة مسطّحة — المعاينة لم تُبنَ')
        }

        try {
          const shot = await send('Page.captureScreenshot', { format: 'png' }, S)
          writeFileSync(
            join(root, 'artifacts', 'editor-redact.png'),
            Buffer.from(shot.data, 'base64'),
          )
          note('لقطة للمراجعة البصرية: artifacts/editor-redact.png')
        } catch (e) {
          note(`تعذّرت لقطة الطمس: ${e}`)
        }

        const path = await evalIn(
          S,
          `(document.querySelector('[data-editor-stage]')?.dataset.blurPath ?? 'none')`,
        )
        if (path === 'worker') {
          ok('**والحساب وقع على الـworker** — يُبنى بـCRXJS ويُحمَّل بلا انتهاك CSP')
        } else if (path === 'main') {
          fail('سقط الحساب إلى الخيط الرئيسي — الـworker لم يعمل داخل الإضافة')
        } else {
          fail('لم يُسجَّل مسار الحساب أصلًا')
        }

        // الشدّة المعروضة هي المطبَّقة: رفعُها يزيد التسطّح.
        const strong = await evalIn(
          S,
          `(() => {
            const s = document.querySelector('[data-redact-strength]')
            if (!s) return 'none'
            s.value = '40'
            s.dispatchEvent(new Event('input', { bubbles: true }))
            return s.value
          })()`,
        )
        if (strong === '40') {
          await new Promise((r) => setTimeout(r, 1200))
          await settle(S)
          const heavy = await regionStats('annotations', bx, by, bw, bh)
          if (heavy.variance < blurred.variance) {
            ok(
              `**والشدّة المعروضة هي المطبَّقة** — التباين هبط من ${blurred.variance.toFixed(1)} إلى ${heavy.variance.toFixed(1)} برفع σ إلى 40`,
            )
          } else {
            fail(
              `رفع الشدّة لم يزد التنعيم (${blurred.variance.toFixed(1)} ← ${heavy.variance.toFixed(1)})`,
            )
          }
        } else {
          fail('شريط الشدّة غير معروض في وضع الضباب')
        }
      }

      // ── 8) البايتات المصدَّرة — ما لا يُثبَت إلّا على ملفّ حقيقي ───
      /*
       * كل ما سبق يقيس ما يُرسَم على الشاشة. وهذه المرحلة تَعِد بشيء عن
       * **الملفّ**: «لا يمكن استرجاع ما تحت التغطية من الملفّ المصدَّر».
       * ولا يُثبَت ذلك إلّا بترميز حقيقي في كروم حقيقي ثمّ قراءة بايتاته.
       *
       * والاختبار **التفاضلي** يقع في الوحدة على سطحٍ مزيّف يرسم فعلًا؛
       * وما يضيفه التشغيل الحيّ هو ما لا يملكه السطح المزيّف: مرمِّز كروم،
       * وحاوية PNG حقيقية، ومسار الحافظة كاملًا.
       */
      /*
       * يُعاد النمط إلى التغطية قبل التصدير.
       *
       * القسم السابق تركه ضبابيًّا بشدّة 40 — والضبابي **لا يُعلَن مضمونًا
       * أبدًا**. فتصديرٌ عليه يقيس الشقّ السالب من الوعد لا الموجب، ويُختبَر
       * الشقّان معًا أدناه.
       */
      await evalIn(S, `document.querySelector('[data-redact-mode="cover"]')?.click(), 1`)
      await new Promise((r) => setTimeout(r, 300))
      await evalIn(S, `document.querySelector('[data-tool="select"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 120))

      const exportClicked = await evalIn(
        S,
        `(() => {
          const b = document.querySelector('[data-export-scale="1"]')
          if (!b) return 'no-button'
          b.click()
          return 'ok'
        })()`,
      )

      if (exportClicked !== 'ok') {
        fail('لا زرّ تصدير في الواجهة')
      } else {
        // الخبز يفرّغ الحلقة بين الخطوات، فالانتظار على ظهور الرابط.
        let url = null
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 200))
          url = await evalIn(
            S,
            `(document.querySelector('[data-export-url]')?.dataset.exportUrl ?? '')`,
          )
          if (url) break
        }

        if (!url) {
          const shown = await evalIn(
            S,
            `(document.querySelector('[data-export-error]')?.textContent ?? 'لا رسالة')`,
          )
          fail(`لم يكتمل التصدير: ${shown}`)
        } else {
          ok('التصدير اكتمل وأنتج بايتات')

          /*
           * **إغلاق ADR 0009.**
           *
           * البند المفتوح: النسخ من صفحة `http:` مستحيل — `navigator.clipboard`
           * غائبة في السياق غير الآمن. والمحرر صفحة إضافة، أي سياقٌ آمن
           * **بحكم بنائه**، مهما كان أصل اللقطة. واللقطة هنا مزروعة بأصل
           * `http://` تحديدًا.
           *
           * ويُثبَت الأمران معًا: أن السياق آمن، وأن الكتابة نجحت فعلًا —
           * فلو فشلت لَظهرت رسالتها في اللوحة.
           */
          const clip = JSON.parse(
            await evalIn(
              S,
              `JSON.stringify({
                secure: window.isSecureContext,
                clipboard: typeof navigator.clipboard?.write,
                origin: document.querySelector('[data-meta-field="url"]')?.textContent ?? '',
                error: document.querySelector('[data-export-error]')?.textContent ?? null,
              })`,
            ),
          )

          if (clip.secure === true && clip.clipboard === 'function' && clip.error === null) {
            ok(
              `**والنسخ نجح من لقطة أصلها \`http:\`** — المحرر سياقٌ آمن بحكم بنائه، وهو البند الذي تركه ADR 0009 مفتوحًا`,
            )
          } else {
            fail(
              `النسخ لم ينجح: آمن=${clip.secure} حافظة=${clip.clipboard} خطأ=${clip.error ?? 'لا'}`,
            )
          }

          if (String(clip.origin).includes('http://')) {
            ok('واللقطة المزروعة أصلها غير آمن فعلًا — الشرط الذي يجعل البند ذا معنى')
          } else {
            fail(`أصل اللقطة ليس http: — ${clip.origin}`)
          }

          /*
           * قراءة الحاوية داخل الصفحة: البلوب يعيش هناك. ودالّة التحليل
           * مكتوبة حرفيًّا لا مستوردة — الصفحة لا تستورد من `tests/`.
           */
          const bytes = JSON.parse(
            await evalIn(
              S,
              `(async () => {
                const res = await fetch(${JSON.stringify(url)})
                const buf = new Uint8Array(await res.arrayBuffer())
                const view = new DataView(buf.buffer)
                const sig = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]
                for (let i = 0; i < 8; i++) {
                  if (buf[i] !== sig[i]) return JSON.stringify({ error: 'bad-signature' })
                }
                const types = []
                let at = 8, end = -1, w = 0, h = 0
                while (at + 8 <= buf.length) {
                  const len = view.getUint32(at)
                  let type = ''
                  for (let i = 0; i < 4; i++) type += String.fromCharCode(view.getUint8(at + 4 + i))
                  if (type === 'IHDR') { w = view.getUint32(at + 8); h = view.getUint32(at + 12) }
                  types.push(type)
                  at += 12 + len
                  if (type === 'IEND') { end = at; break }
                }
                return JSON.stringify({ types, trailing: buf.length - end, size: buf.length, w, h })
              })()`,
            ),
          )

          if (bytes.error) {
            fail(`الملفّ المصدَّر ليس PNG صالحًا: ${bytes.error}`)
          } else {
            if (bytes.trailing === 0) {
              ok(
                `**والمجرى ينتهي عند \`IEND\` بالضبط** — لا بايت خلفه (${bytes.size} بايتًا)، انحدارٌ مباشر لـaCropalypse`,
              )
            } else {
              fail(`${bytes.trailing} بايتًا خلف IEND — ذيلٌ ناجٍ في الملفّ المصدَّر`)
            }

            const meta = bytes.types.filter((t) => ['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(t))
            if (meta.length === 0) {
              ok(`ولا مقاطع بيانات وصفية — المقاطع: ${[...new Set(bytes.types)].join('·')}`)
            } else {
              fail(`مقاطع بيانات وصفية نجت إلى الملفّ: ${meta.join('، ')}`)
            }
          }

          /*
           * **المنطقة المحجوبة في الملفّ نفسه**: يُفكّ الملفّ ويُقرأ
           * مستطيلها. وهذا يقرأ ما خرج لا ما رُسم — فلو أخطأ الاقتصاص أو
           * المقياس لَبقي تحته بكسلات المصدر.
           */
          const region = JSON.parse(
            await evalIn(
              S,
              `(async () => {
                const res = await fetch(${JSON.stringify(url)})
                const bm = await createImageBitmap(await res.blob())
                const c = new OffscreenCanvas(bm.width, bm.height)
                const g = c.getContext('2d')
                g.drawImage(bm, 0, 0)
                const el = document.querySelector('[data-export-guaranteed]')
                const d = g.getImageData(0, 0, bm.width, bm.height).data
                // أكبر مساحة أحادية اللون متّصلة أفقيًّا لا تلزم؛ يكفي عدّ
                // الألوان في كامل الصورة ومقارنته بلقطة بلا حجب.
                const seen = new Set()
                for (let i = 0; i < d.length; i += 4) {
                  seen.add((d[i]<<24 | d[i+1]<<16 | d[i+2]<<8 | d[i+3]) >>> 0)
                }
                bm.close()
                return JSON.stringify({
                  guaranteed: Number(el?.dataset.exportGuaranteed ?? -1),
                  reencoded: el?.dataset.exportReencoded ?? null,
                  colours: seen.size,
                  w: bm.width,
                  h: bm.height,
                })
              })()`,
            ),
          )

          if (region.guaranteed >= 1 && region.reencoded === 'true') {
            ok(
              `**وتقرير الخبز يُعلن ${region.guaranteed} منطقة مضمونة** — والضمان مقيسٌ على البايتات المكتوبة لا مشتقٌّ من النمط`,
            )
          } else {
            fail(`تقرير الخبز: مضمون=${region.guaranteed} مُعاد الترميز=${region.reencoded}`)
          }

          if (region.w > 0 && region.h > 0) {
            note(`الملفّ المصدَّر ${region.w}×${region.h} بـ${region.colours} لونًا`)
          }

          /*
           * **والشقّ السالب على ملفّ حقيقي**: النمط نفسه بالضبابي يجب
           * ألّا يُعلَن مضمونًا. وهذا ما يُثبِّت في الشيفرة — لا في التوثيق —
           * أن الطمس ليس حجبًا.
           */
          await evalIn(S, `document.querySelector('[data-tool="redact"]').click(), 1`)
          await new Promise((r) => setTimeout(r, 150))
          const toBlur = await evalIn(
            S,
            `(() => {
              const b = document.querySelector('[data-redact-mode="blur"]')
              if (!b) return 'no-panel'
              b.click()
              return 'ok'
            })()`,
          )
          if (toBlur !== 'ok') {
            fail('تعذّر إعادة النمط إلى الضبابي للشاهد السالب')
          } else {
            await new Promise((r) => setTimeout(r, 400))
            await evalIn(S, `document.querySelector('[data-tool="select"]').click(), 1`)
            await new Promise((r) => setTimeout(r, 120))
            await evalIn(S, `document.querySelector('[data-export-scale="1"]').click(), 1`)

            let blurGuaranteed = -1
            for (let i = 0; i < 40; i++) {
              await new Promise((r) => setTimeout(r, 200))
              const raw = await evalIn(
                S,
                `(document.querySelector('[data-export-guaranteed]')?.dataset.exportGuaranteed ?? '')`,
              )
              if (raw !== '') {
                blurGuaranteed = Number(raw)
                if (blurGuaranteed === 0) break
              }
            }

            if (blurGuaranteed === 0) {
              ok('**والشاهد السالب على ملفّ حقيقي** — الضبابي لا يُعلَن مضمونًا، فالطمس ليس حجبًا')
            } else {
              fail(`الضبابي أُعلن مضمونًا (${blurGuaranteed}) — الوعد يتجاوز ما يفي به`)
            }
          }
        }
      }

      // ── 9) الاقتصاص والحفظ — الدفعة السابعة ───────────────────────
      /*
       * ثلاث دعاوى لا يثبتها اختبار وحدة: أن الاقتصاص يصل نافذةَ التصدير
       * فعلًا، وأن ما حُفظ يعود بعد إعادة التحميل، وأن تبويبًا ثانيًا لا
       * يمحو الأوّل.
       */
      await evalIn(S, `document.querySelector('[data-tool="crop"]').click(), 1`)
      await new Promise((r) => setTimeout(r, 150))

      const cropBar = await evalIn(S, `(document.querySelector('[data-crop-bar]') ? 'ok' : 'none')`)
      if (cropBar !== 'ok') {
        fail('شريط الاقتصاص لا يظهر في وضع الاقتصاص')
      } else {
        // سحبة اقتصاص في وسط اللقطة.
        await send(
          'Input.dispatchMouseEvent',
          {
            type: 'mousePressed',
            x: cx - 120,
            y: cy - 90,
            button: 'left',
            clickCount: 1,
            pointerType: 'mouse',
          },
          S,
        )
        await moveTo(S, cx - 40, cy - 30)
        await moveTo(S, cx + 120, cy + 90)
        await send(
          'Input.dispatchMouseEvent',
          {
            type: 'mouseReleased',
            x: cx + 120,
            y: cy + 90,
            button: 'left',
            clickCount: 1,
            pointerType: 'mouse',
          },
          S,
        )
        await settle(S)
        await new Promise((r) => setTimeout(r, 300))

        const readout = await evalIn(
          S,
          `(document.querySelector('[data-crop-readout]')?.textContent ?? '')`,
        )
        if (/\d/.test(readout) && !readout.includes('كاملة')) {
          ok(`**الاقتصاص يُرسَم ويُقرأ** — ${readout.trim()}`)
        } else {
          fail(`الاقتصاص لم يُثبَّت — القراءة «${readout.trim()}»`)
        }

        // نسبة 1:1 على اقتصاصٍ قائم — العيب الذي كان يُبقي النسبة كما هي.
        await evalIn(S, `document.querySelector('[data-crop-preset="1:1"]').click(), 1`)
        await new Promise((r) => setTimeout(r, 300))
        try {
          const shot = await send('Page.captureScreenshot', { format: 'png' }, S)
          writeFileSync(
            join(root, 'artifacts', 'editor-crop.png'),
            Buffer.from(shot.data, 'base64'),
          )
          note('لقطة للمراجعة البصرية: artifacts/editor-crop.png')
        } catch (e) {
          note(`تعذّرت لقطة الاقتصاص: ${e}`)
        }

        const square = await evalIn(
          S,
          `(document.querySelector('[data-crop-readout]')?.textContent ?? '')`,
        )
        if (square.includes('1 : 1')) {
          ok(`**ونسبة 1:1 تُطبَّق فعلًا** — ${square.trim()}`)
        } else {
          fail(`النسبة لم تُطبَّق — «${square.trim()}»`)
        }

        // والتصدير يتبع نافذة الاقتصاص.
        await evalIn(S, `document.querySelector('[data-tool="select"]').click(), 1`)
        await new Promise((r) => setTimeout(r, 150))
        await evalIn(S, `document.querySelector('[data-export-scale="1"]').click(), 1`)

        let cropped = null
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 200))
          cropped = await evalIn(
            S,
            `(document.querySelector('[data-export-url]')?.textContent ?? '')`,
          )
          if (cropped && /\d/.test(cropped)) break
        }
        if (cropped && /\d+\s*×\s*\d+/.test(cropped)) {
          const [w, h] = cropped
            .match(/(\d+)\s*×\s*(\d+)/)
            .slice(1)
            .map(Number)
          if (w === h && w < 1200) {
            ok(`**والتصدير يتبع نافذة الاقتصاص** — ${w}×${h} لا 1200×900`)
          } else {
            fail(`مقاس التصدير ${w}×${h} لا يطابق الاقتصاص المربّع`)
          }
        } else {
          fail('لم يظهر مقاس التصدير بعد الاقتصاص')
        }
      }

      // ── الحفظ التلقائي: ما حُفظ يعود ──────────────────────────────
      const beforeReload = await nodeCount(S)
      const savedLabel = await evalIn(
        S,
        `(document.querySelector('[data-save-status]')?.dataset.saveStatus ?? 'none')`,
      )
      note(`حالة الحفظ قبل إعادة التحميل: ${savedLabel} · العقد ${beforeReload}`)

      await send('Page.reload', {}, S)
      const readyAgain = await waitReady(S)
      if (!readyAgain) {
        fail('المحرر لم يعد بعد إعادة التحميل')
      } else {
        await new Promise((r) => setTimeout(r, 500))
        const afterReload = await nodeCount(S)
        if (afterReload === beforeReload && afterReload > 0) {
          ok(`**والاستعادة بعد الإغلاق تعمل** — ${afterReload} عقدة عادت كما كانت`)
        } else {
          fail(`بعد إعادة التحميل ${afterReload} عقدة بدل ${beforeReload}`)
        }

        const keptCrop = await evalIn(
          S,
          `JSON.stringify((() => {
            const el = document.querySelector('[data-export-scale="1"]')
            return { hasExport: !!el }
          })())`,
        )
        if (JSON.parse(keptCrop).hasExport) {
          ok('والمحرر يعود كاملًا بأدواته بعد إعادة التحميل')
        } else {
          fail('المحرر عاد ناقصًا بعد إعادة التحميل')
        }
      }

      // ── 4) الذاكرة — البند الذي يعلنه ADR 0011 مفتوحًا ─────────
      const mem = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
            const m = performance.memory
            const b = document.querySelector('[data-stage-layer="base"]')
            const a = document.querySelector('[data-stage-layer="annotations"]')
            return {
              usedMB: m ? +(m.usedJSHeapSize/1048576).toFixed(1) : null,
              surfaceMB: +(((b.width*b.height + a.width*a.height)*4)/1048576).toFixed(1),
            }
          })())`,
        ),
      )
      note(`ذاكرة (1200×900، كثافة ${s1.dpr}): أسطح ${mem.surfaceMB}MB · كومة JS ${mem.usedMB}MB`)

      /*
       * يُغلَق تبويب المحرر الأوّل قبل الحالة القصوى.
       *
       * تبويبان مفتوحان يتنازعان أمرين: اختيارَ الهدف (يُحلّ أعلاه)،
       * و**الذاكرة** — والحالة القصوى هي بالضبط ما يُقاس. فبقاء الأوّل
       * يُلوّث الرقم الذي تُبنى عليه ميزانية الخبز.
       */
      await send('Target.closeTarget', {
        targetId: (await send('Target.getTargets')).targetInfos
          .filter((t) => t.type === 'page' && String(t.url).includes('/editor/'))
          .at(-1).targetId,
      })
      await new Promise((r) => setTimeout(r, 400))

      // الحالة القصوى — الرقم الذي تُبنى عليه ميزانية الخبز.
      const extreme = await seedAndOpen(2560, 28_672, 1)
      if (!extreme || !extreme.seeded.ok) fail('تعذّر زرع لقطة الحالة القصوى')
      else {
        const E = extreme.sessionId
        const readyE = await waitReady(E)
        if (!readyE) fail('المحرر لم يجهز على الحالة القصوى')
        else {
          const memE = JSON.parse(
            await evalIn(
              E,
              `JSON.stringify((() => {
                const m = performance.memory
                const b = document.querySelector('[data-stage-layer="base"]')
                const a = document.querySelector('[data-stage-layer="annotations"]')
                return {
                  usedMB: m ? +(m.usedJSHeapSize/1048576).toFixed(1) : null,
                  surfaceMB: +(((b.width*b.height + a.width*a.height)*4)/1048576).toFixed(1),
                  w: b.width, h: b.height,
                }
              })())`,
            ),
          )
          note(
            `ذاكرة (القصوى 2560×28,672): أسطح ${memE.surfaceMB}MB · كومة JS ${memE.usedMB}MB · قماش ${memE.w}×${memE.h}`,
          )
          if (memE.surfaceMB < 100) {
            ok(
              `**الحالة القصوى تُفتح وتُحرَّر** — الأسطح ${memE.surfaceMB}MB لا 560MB التي يكلّفها قماشان بمقاس الصورة`,
            )
          } else {
            fail(`أسطح الحالة القصوى ${memE.surfaceMB}MB — تتجاوز المتوقَّع`)
          }
          const pe = JSON.parse(
            await evalIn(
              E,
              `JSON.stringify((() => {
                const c = document.querySelector('[data-stage-layer="base"]')
                const d = c.getContext('2d').getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data
                return { a: d[3] }
              })())`,
            ),
          )
          if (pe.a > 0) ok('ولقطة الحالة القصوى مرسومة فعلًا لا قماشًا ميّتًا')
          else fail('الحالة القصوى أعطت قماشًا فارغًا')
        }
      }
    }
  }
}

for (const e of pageErrors.slice(0, 6)) fail(`استثناء في الصفحة: ${String(e).slice(0, 200)}`)

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص محرّك التعليق في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ محرّك التعليق يرسم ويقيس فوق Chrome حقيقي.\n')
