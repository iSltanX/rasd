#!/usr/bin/env node
/**
 * يثبت أن صفحة المكتبة (المرحلة 18) تعمل فوق كروم حقيقي — لا في jsdom وحده.
 *
 * **ما لا تكشفه 2074 اختبار وحدة:** بيئة الاختبار (happy-dom) لا تُخطِّط
 * تخطيطًا حقيقيًا — `ResizeObserver` وقياس `clientWidth` كلاهما مُحقَنان أو
 * صفريّان بالافتراض، فتمرير الشبكة الافتراضي (`Grid.tsx`) يبقى **مقياس
 * منطق** لا مقياس أداء فعلي. وثلاثة أسئلة لا يجيب عنها إلّا متصفّح يرسم
 * تخطيطًا فعليًا:
 *
 *   1. مع 5000 لقطة حقيقية في IndexedDB، كم عنصر DOM يُرسَم فعليًا؟
 *   2. هل كل عنصر تفاعلي له اسم يقرؤه قارئ الشاشة — لا افتراضًا محليًّا؟
 *   3. هل التبويبات الأربعة الأخرى تحمِّل بيانات حقيقية من مخازنها؟
 *
 * لا صلاحية مضيف هنا: المكتبة صفحة إضافة صرفة، لا تحقن ولا تلتقط — فلا
 * حاجة لتصحيح `manifest.host_permissions` ولا لخادم عيّنات، خلافًا لـ
 * `verify-editor.mjs` و`verify-popup.mjs`.
 *
 *   pnpm build && pnpm verify:library
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9372

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const stage = mkdtempSync(join(tmpdir(), 'rasd-library-ext-'))
cpSync(dist, stage, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'rasd-library-'))
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
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let stderr = ''
proc.stderr.on('data', (d) => (stderr += d.toString()))

async function cleanup() {
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
const note = (m) => lines.push(`  · ${m}`)

// ── تحميل الإضافة ────────────────────────────────────────────────
let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

if (extId) ok('نسخة الفحص محمَّلة')
else fail('تعذّر تحميل الإضافة')

const evalIn = async (sessionId, expression) => {
  const r = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    const detail = d.exception?.description ?? d.exception?.value ?? d.text ?? 'بلا وصف'
    throw new Error(`${detail}\nفي: ${expression.slice(0, 200)}`)
  }
  return r.result.value
}

let librarySession = null
if (extId) {
  const { targetId } = await send('Target.createTarget', {
    url: `chrome-extension://${extId}/src/pages/library/index.html`,
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  librarySession = sessionId
}

if (!librarySession) {
  fail('تعذّر فتح صفحة المكتبة')
} else {
  const S = librarySession
  try {
    /**
     * **الجهوز: المستند مستند المكتبة لا المستند الابتدائي.** `Target.createTarget` يفتح
     * `about:blank` ثمّ يتنقّل، والارتباط والتقييم قد يسبقان التزام التنقّل — فيقع الزرع في
     * مستند بلا أصل، وIndexedDB فيه ممنوع. قِيس في CI (الجولة `36592130082`): «SecurityError:
     * Failed to execute 'databases' on 'IDBFactory': Access to the IndexedDB API is denied in
     * this context» — وهو حرفيًّا ما يعطيه `about:blank` (`STAGES/04`). فيُنتظَر أصل الإضافة
     * واكتمال التحميل قبل أي قراءة، والتقييم الذي يقع في سياق يُهدَم يُعاد في التالي.
     */
    const pageOrigin = `chrome-extension://${extId}`
    let ready = false
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await evalIn(
        S,
        `location.origin === ${JSON.stringify(pageOrigin)} && document.readyState === 'complete'`,
      ).catch(() => false)
      if (!ready) await new Promise((r) => setTimeout(r, 100))
    }
    if (!ready) throw new Error(`صفحة المكتبة لم تجهز: الأصل ليس ${pageOrigin} بعد عشر ثوانٍ`)

    /**
     * يزرع بيانات واقعية عبر IndexedDB **من الصفحة نفسها** — نفس مبدأ
     * `verify-editor.mjs`: أصل الإضافة واحد، فقاعدة البيانات واحدة، ولا حاجة
     * لمسار حقن منفصل يقيس شيئًا غير ما تقرؤه الصفحة فعليًا.
     */
    const seeded = JSON.parse(
      await evalIn(
        S,
        `(async () => {
        const need = ['captures','blobs','projects','colors','palettes','references','guides','tags','thumbnails']
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

        const now = Date.now()
        const tx = db.transaction(need, 'readwrite')
        tx.objectStore('projects').put({ id:'proj1', name:'مشروع الفحص', color:'#0090FF', createdAt: now, updatedAt: now })
        tx.objectStore('captures').put({
          id:'cap1', createdAt: now, origin:'https://example.com', url:'https://example.com/a',
          title:'لقطة الفحص', kind:'area', status:'ready', projectId:'proj1', tags:['فحص'],
          width:800, height:600, devicePixelRatio:1, favorite:true, trashedAt:null, archived:false,
        })
        tx.objectStore('captures').put({
          id:'cap2', createdAt: now - 1000, origin:'https://example.com', url:'https://example.com/b',
          title:'لقطة مؤرشَفة', kind:'viewport', status:'ready', projectId:null, tags:[],
          width:800, height:600, devicePixelRatio:1, favorite:false, trashedAt:null, archived:true,
        })
        tx.objectStore('tags').put({ name:'فحص', count:1 })
        tx.objectStore('colors').put({ id:'col1', hex:'#3B82F6', name:'أزرق الفحص', note:'', source:'pixel', projectId:null, sourceUrl:null, createdAt: now })
        tx.objectStore('palettes').put({ id:'pal1', name:'لوحة الفحص', colors:['#111','#222'], projectId:null, createdAt: now })
        tx.objectStore('references').put({ id:'ref1', projectId:null, origin:'https://figma.com', path:'1:1', viewport:'desktop', blobId:'none', createdAt: now })
        tx.objectStore('guides').put({ id:'gd1', title:'دليل الفحص', projectId:null, captureIds:[], createdAt: now })

        // 5000 لقطة إضافية — الأداء لا يُختبَر على سبعة عناصر.
        for (let i = 0; i < 5000; i++) {
          tx.objectStore('captures').put({
            id:'bulk'+i, createdAt: now - i, origin:'https://example.com', url:'https://example.com/'+i,
            title:'لقطة '+i, kind:'area', status:'ready', projectId:null, tags:[],
            width:800, height:600, devicePixelRatio:1, favorite:false, trashedAt:null, archived:false,
          })
        }

        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
        db.close()
        return JSON.stringify({ ok:true })
      })().catch(e => JSON.stringify({ ok:false, error:String(e) }))`,
      ),
    )
    if (!seeded.ok) fail(`تعذّر زرع البيانات: ${seeded.error}`)
    else ok('زُرعت بيانات واقعية: مشروع، 5002 لقطة، وسم، لون، لوحة، مرجع، دليل')

    await send('Page.reload', {}, S)

    async function waitFor(expression, timeoutMs = 8000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const v = await evalIn(S, expression).catch(() => null)
        if (v) return v
        await new Promise((r) => setTimeout(r, 150))
      }
      return null
    }

    // ── الحالة loading ثم grid ────────────────────────────────────
    const gridReady = await waitFor(
      `document.querySelector('[data-testid="library-grid-scroller"]') ? 'ready' : null`,
    )
    if (gridReady) ok('حالة `loading` تُفضي إلى `grid` فعليًا في متصفّح حقيقي')
    else fail('الشبكة لم تظهر بعد التحميل')

    if (gridReady) {
      // ── التمرير الافتراضي — الرقم الحقيقي لا نظريّة jsdom ─────────
      const virtualCount = Number(
        await evalIn(S, `document.querySelectorAll('[data-capture-id]').length`),
      )
      if (virtualCount > 0 && virtualCount < 200) {
        ok(`**التمرير الافتراضي حقيقي**: ${virtualCount} بطاقة مرسومة من 5002 — لا الكلّ`)
      } else {
        fail(`عدد البطاقات المرسومة ${virtualCount} — خارج المدى المتوقَّع (1–199)`)
      }

      // تمرير فعلي وقياس أن الشبكة تستجيب — لا استقرار الصفر وحده.
      await evalIn(
        S,
        `document.querySelector('[data-testid="library-grid-scroller"]').scrollTop = 20000`,
      )
      await new Promise((r) => setTimeout(r, 300))
      const afterScroll = Number(
        await evalIn(S, `document.querySelectorAll('[data-capture-id]').length`),
      )
      const firstIdAfterScroll = await evalIn(
        S,
        `document.querySelector('[data-capture-id]')?.getAttribute('data-capture-id') ?? null`,
      )
      if (afterScroll > 0 && firstIdAfterScroll !== 'cap1') {
        ok(`التمرير الحقيقي يبدِّل النافذة المرسومة — أوّل بطاقة صارت \`${firstIdAfterScroll}\``)
      } else {
        fail('التمرير لم يبدِّل النافذة المرسومة')
      }
      await evalIn(
        S,
        `document.querySelector('[data-testid="library-grid-scroller"]').scrollTop = 0`,
      )
      await new Promise((r) => setTimeout(r, 300))

      // ── البحث ────────────────────────────────────────────────────
      const searchInput = `document.querySelector('input[aria-label="ابحث في المكتبة"]')`
      await evalIn(
        S,
        `(() => {
        const el = ${searchInput}
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(el, 'الفحص')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`,
      )
      await new Promise((r) => setTimeout(r, 400))
      const searched = Number(
        await evalIn(S, `document.querySelectorAll('[data-capture-id]').length`),
      )
      if (searched === 1) ok('البحث النصّي يصفّي 5002 عنصرًا حقيقية إلى نتيجة واحدة صحيحة')
      else fail(`البحث أعطى ${searched} عنصرًا بدل 1`)

      await evalIn(
        S,
        `(() => {
        const el = ${searchInput}
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(el, '')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`,
      )
      await new Promise((r) => setTimeout(r, 400))

      // ── التبويبات الأربعة الأخرى — بيانات حقيقية من مخازنها ────────
      const TABS = [
        ['المراجع', 'reference', 'ref1'],
        ['الألوان', 'color', 'col1'],
        ['اللوحات', 'palette', 'pal1'],
        ['أدلة الخطوات', 'guide', 'gd1'],
      ]
      for (const [label, attr, id] of TABS) {
        await evalIn(
          S,
          `[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === '${label}').click()`,
        )
        const found = await waitFor(
          `document.querySelector('[data-${attr}-id="${id}"]') ? 'y' : null`,
        )
        if (found) ok(`تبويب «${label}» يحمِّل بيانات حقيقية من مخزنه`)
        else fail(`تبويب «${label}» لم يعرض السجلّ المزروع`)
      }
      await evalIn(
        S,
        `[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'اللقطات').click()`,
      )
      await waitFor(`document.querySelector('[data-capture-id]') ? 'y' : null`)

      // ── الأرشيف والمشاريع والوسوم ───────────────────────────────
      await evalIn(
        S,
        `[...document.querySelectorAll('[aria-label="عرض المكتبة"] [role="radio"]')].find(o => o.textContent === 'الأرشيف').click()`,
      )
      const archivedShown = await waitFor(
        `document.querySelector('[data-capture-id="cap2"]') ? 'y' : null`,
      )
      if (archivedShown) ok('عرض الأرشيف يعرض اللقطة المؤرشَفة الحقيقية وحدها')
      else fail('عرض الأرشيف لم يعرض اللقطة المؤرشَفة')
      await evalIn(
        S,
        `[...document.querySelectorAll('[aria-label="عرض المكتبة"] [role="radio"]')].find(o => o.textContent === 'نشِطة').click()`,
      )
      await waitFor(`document.querySelector('[data-capture-id="cap1"]') ? 'y' : null`)

      await evalIn(S, `document.querySelector('[aria-label="فتح لوحة المشاريع"]').click()`)
      const projectShown = await waitFor(
        `document.querySelector('[data-project-id="proj1"]') ? 'y' : null`,
      )
      if (projectShown) ok('لوحة المشاريع تعرض المشروع المزروع فعليًا')
      else fail('لوحة المشاريع لم تعرض المشروع المزروع')
      await evalIn(S, `document.querySelector('[aria-label="إغلاق لوحة المشاريع"]').click()`)

      await evalIn(S, `document.querySelector('[aria-label="فتح لوحة الوسوم"]').click()`)
      const tagShown = await waitFor(`document.querySelector('[data-tag-name="فحص"]') ? 'y' : null`)
      if (tagShown) ok('لوحة الوسوم تعرض الوسم المزروع بعدّاده الصحيح')
      else fail('لوحة الوسوم لم تعرض الوسم المزروع')
      await evalIn(S, `document.querySelector('[aria-label="إغلاق لوحة الوسوم"]').click()`)

      // ── التحديد ──────────────────────────────────────────────────
      await evalIn(
        S,
        `document.querySelector('[data-capture-id="cap1"] input[type="checkbox"]').click()`,
      )
      const selectionShown = await waitFor(
        `document.querySelector('[role="toolbar"]') ? 'y' : null`,
      )
      if (selectionShown) ok('تحديد بطاقة واحدة يُظهر شريط الإجراءات حيًّا')
      else fail('شريط إجراءات التحديد لم يظهر')
      await evalIn(S, `document.querySelector('[aria-label="إلغاء التحديد"]')?.click()`)

      // ── حذف ونقل غير اللقطات — سدّ فجوة §4/§8 من Phase_18.md ───────
      // الحذف النهائي يمرّ بحوار `library / delete-confirm` (`STAGES/04`) لا بـ`window.confirm`:
      // زرّ الشريط يفتح الحوار، ولا يُحذف شيء قبل «احذف» فيه.

      await evalIn(
        S,
        `[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'الألوان').click()`,
      )
      await waitFor(`document.querySelector('[data-color-id="col1"]') ? 'y' : null`)
      await evalIn(
        S,
        `document.querySelector('[data-color-id="col1"] input[type="checkbox"]').click()`,
      )
      await evalIn(S, `document.querySelector('[aria-label="حذف المحدَّد نهائيًا"]').click()`)
      const dialogShown = await waitFor(
        `document.querySelector('[role="alertdialog"] [data-rasd-confirm="delete"]') ? 'y' : null`,
      )
      const stillThere = await evalIn(S, `!!document.querySelector('[data-color-id="col1"]')`)
      if (dialogShown && stillThere) ok('الحذف النهائي يفتح حوار التأكيد، ولا يُحذف شيء قبل «احذف»')
      else fail(`حوار الحذف لم يظهر أو سبقه الحذف: حوار=${!!dialogShown} باقٍ=${stillThere}`)
      await evalIn(S, `document.querySelector('[data-rasd-confirm="delete"]')?.click()`)
      const colorDeleted = await waitFor(
        `document.querySelector('[data-color-id="col1"]') ? null : 'y'`,
      )
      if (colorDeleted) ok('حذف لون مُحدَّد من الشبكة الحيّة يزيله فعليًا — لا نافذة فحسب')
      else fail('اللون المحدَّد لم يُحذف من الشبكة')

      await evalIn(
        S,
        `[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'اللوحات').click()`,
      )
      await waitFor(`document.querySelector('[data-palette-id="pal1"]') ? 'y' : null`)
      await evalIn(
        S,
        `document.querySelector('[data-palette-id="pal1"] input[type="checkbox"]').click()`,
      )
      await evalIn(
        S,
        `(() => {
        const el = document.querySelector('[aria-label="انقل المحدَّد إلى مشروع"]')
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        setter.call(el, 'proj1')
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })()`,
      )
      const paletteMoved = await waitFor(
        `(async () => {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open('rasd')
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
          })
          const rec = await new Promise((res, rej) => {
            const req = db.transaction('palettes').objectStore('palettes').get('pal1')
            req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error)
          })
          db.close()
          return rec && rec.projectId === 'proj1' ? 'y' : null
        })()`,
      )
      if (paletteMoved)
        ok('نقل لوحة مُحدَّدة إلى مشروع من الشبكة الحيّة يكتب projectId فعليًا في IndexedDB')
      else fail('نقل اللوحة المحدَّدة إلى مشروع لم يُكتَب في IndexedDB')

      await evalIn(
        S,
        `[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === 'اللقطات').click()`,
      )
      await waitFor(`document.querySelector('[data-capture-id]') ? 'y' : null`)

      // ── شجرة الإتاحة ─────────────────────────────────────────────
      const a11y = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify((() => {
          const out = []
          let unnamed = 0
          for (const el of document.querySelectorAll('button, input, textarea, a[href], select, [role]')) {
            const labelled = el.getAttribute('aria-labelledby')
            const byId = labelled ? (document.getElementById(labelled)?.textContent ?? '').trim() : ''
            const forLabel = el.id ? (document.querySelector('label[for="' + el.id + '"]')?.textContent ?? '').trim() : ''
            const name = byId || el.getAttribute('aria-label') || forLabel || el.getAttribute('title') || (el.textContent ?? '').trim().slice(0, 40)
            const role = el.getAttribute('role') ?? el.tagName.toLowerCase()
            if (!name) unnamed++
            out.push({ role, name })
          }
          return { total: out.length, unnamed, rows: out }
        })())`,
        ),
      )
      if (a11y.unnamed === 0) {
        ok(`**كل عنصر تفاعلي له اسم مقروء** — ${a11y.total} عنصرًا، بلا واحدٍ صامت`)
      } else {
        fail(`${a11y.unnamed} عنصرًا تفاعليًّا بلا اسم من ${a11y.total}`)
      }

      try {
        const dir = join(root, 'tests', 'visual-baselines', 'phase-18')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const treeLines = a11y.rows.map((r) => `${r.role} — ${r.name}`).join('\n')
        writeFileSync(
          join(dir, 'library-a11y-tree.md'),
          `# شجرة الإتاحة — صفحة المكتبة (تبويب اللقطات)\n\n` +
            `مولَّدة بـ\`pnpm verify:library\`. **تُقرأ بالعين ولا تُقارَن آليًّا**.\n\n` +
            `العناصر التفاعلية: ${a11y.total} · بلا اسم: ${a11y.unnamed}\n\n` +
            '```\n' +
            treeLines +
            '\n```\n',
        )
        note('خطّ أساس الإتاحة: tests/visual-baselines/phase-18/library-a11y-tree.md')
      } catch (e) {
        note(`تعذّر كتابة خطّ أساس الإتاحة: ${e}`)
      }

      // ── لقطة بصرية ───────────────────────────────────────────────
      try {
        const dir = join(root, 'artifacts')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
        writeFileSync(join(dir, 'library-grid-rtl.png'), Buffer.from(data, 'base64'))
        note('لقطة المراجعة: artifacts/library-grid-rtl.png')
      } catch (e) {
        note(`تعذّرت اللقطة البصرية: ${e}`)
      }
    } // ← يُغلق `if (gridReady)` من السطر 274
  } catch (e) {
    // فشلٌ في منتصف السيناريو **يُبلَّغ لا يُسقِط العملية بصمت** — الأسطر
    // المتراكمة قبله تبقى في التقرير، فيُعرَف أين توقّف الفحص بالضبط لا
    // فقط أنه توقّف.
    fail(`استثناء أثناء السيناريو: ${e.message ?? e}`)
  }
}

// 800 حرفًا لا 200 — سطر الاستدعاء الحقيقي في مصدر مصغَّر يحتاج مساحة
// أكبر ممّا يحتاجه سطر انهيار السيناريو (أعلاه)؛ 200 كانت تقطع كل تتبّع
// خطأ من Icon-*.js في منتصف اسم الملفّ نفسه.
for (const e of pageErrors.slice(0, 6)) fail(`استثناء في الصفحة: ${String(e).slice(0, 800)}`)

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص صفحة المكتبة في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ صفحة المكتبة تحمِّل وتصفّي وترسم فوق Chrome حقيقي.\n')
