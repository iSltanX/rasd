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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  let target = null
  for (let i = 0; i < 40; i++) {
    const { targetInfos } = await send('Target.getTargets')
    target = targetInfos.find((t) => t.type === 'page' && String(t.url).includes('/editor/'))
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
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('rasd', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
      })
      const tx = db.transaction(['captures','blobs','annotations'], 'readwrite')
      tx.objectStore('annotations').delete('probe')
      tx.objectStore('captures').put({
        id:'probe', createdAt: Date.now(), origin:'https://probe.test', url:'https://probe.test/p',
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
    if (s.state === 'ready' && s.stage && s.base && s.base.w > 1) return s
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
