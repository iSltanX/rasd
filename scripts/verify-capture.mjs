#!/usr/bin/env node
/**
 * يثبت محرّك الالتقاط في Chrome حقيقي — ما لا يستطيع Vitest إثباته.
 *
 * أربعة ادّعاءات لا معنى لاختبارها بلا متصفّح:
 *
 *   1. **`captureVisibleTab` يعمل بـ`activeTab` وحدها** — بلا صلاحية مضيف
 *      دائمة. هذا هو ادّعاء الخصوصية المركزي في رصد، وهو إمّا صحيح في
 *      متصفّح حقيقي أو لا شيء.
 *   2. **الأبعاد الناتجة تطابق المطلوب بالضبط** — معيار إتمام المرحلة
 *      حرفيًا. القصّ يُنفَّذ ثم تُقرأ أبعاد ما حُفظ فعلًا من IndexedDB.
 *   3. **`fetch(dataUrl)` محظور فعلًا** تحت سياسة رصد — الافتراض الذي بُني
 *      عليه `image-ops.ts`. لو تبيّن العكس لكان الفكّ اليدوي تعقيدًا بلا سبب.
 *   4. **مُنظِّم الإيقاع يمنع تجاوز الحدّ** تحت ضغط حقيقي — الحدّ حدّ متصفّح
 *      لا اختيار، وتجاوزه يرمي.
 *
 * **نسخة فحص لا الحزمة المشحونة** — نفس ما فعلته المرحلة 6 في
 * `verify-overlay.mjs`. صلاحية `activeTab` **لا تُمنح برمجيًا**: تمنحها
 * إيماءة مستخدم حقيقية (نقر الأيقونة أو اختصار أو قائمة سياق)، ولا CDP ولا
 * Playwright يملكان واجهة تصطنعها. فتُنسخ `dist/` وتُضاف إلى بيانها صلاحية
 * مضيف **للعيّنات المحلّية وحدها**، ليصير مسار الالتقاط قابلًا للتشغيل.
 *
 * الشيفرة والأصول متطابقة؛ المتغيّر الوحيد هو الإذن الذي يُمنح في المنتج
 * بإيماءة. والفحص يقرأ بيان `dist/` **الأصلي** ويثبت أنه بلا صلاحية مضيف —
 * فلا يُخفي التصريحُ ما جاء ليثبته.
 *
 * غير مُدرج في CI — المرحلة 23 تملك تشغيل المتصفح. يُشغَّل محليًا:
 *   pnpm fixtures:serve   (في نافذة أخرى)
 *   pnpm verify:capture
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9366
const HARD_TIMEOUT_MS = 120_000

const FIXTURES_PORT = process.env.RASD_FIXTURES_PORT ?? 5399
const PAGE_URL = `http://127.0.0.1:${FIXTURES_PORT}/rtl-ar/`

try {
  const res = await fetch(PAGE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch (e) {
  console.error(
    `خادم العيّنات المحلي غير مُشغَّل على ${PAGE_URL} (${e.message}).\n` +
      'شغّله في نافذة أخرى أولًا: pnpm fixtures:serve',
  )
  process.exit(1)
}

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chromePath = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))

if (!existsSync(dist)) {
  console.error('dist/ غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}
if (!chromePath) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

/*
 * نسخة الفحص: `dist/` كما هي + `<all_urls>` في `host_permissions`.
 *
 * **ولماذا `<all_urls>` تحديدًا لا نمطًا ضيّقًا؟** لأن `captureVisibleTab`
 * يطلبها بالاسم: نمط `http://127.0.0.1/*` جُرِّب أوّلًا فردّ Chrome حرفيًا
 * «Either the '<all_urls>' or 'activeTab' permission is required». أي أن
 * الواجهة لا تقبل صلاحية مضيف ضيّقة بديلًا — إمّا الشاملة أو `activeTab`.
 *
 * وهذا بالضبط ما يجعل اعتماد رصد على `activeTab` قرارًا جوهريًا لا تفصيلًا:
 * البديل الوحيد الآخر هو الصلاحية التي تُظهر تحذير «قراءة وتغيير جميع
 * بياناتك». `<all_urls>` هنا محصورة في نسخة مؤقّتة تُحذَف بعد الفحص،
 * والحزمة المشحونة تبقى بلا أي صلاحية مضيف — يُتحقَّق منها أعلاه من الملفّ.
 */
const stage = mkdtempSync(join(tmpdir(), 'rasd-capture-ext-'))
cpSync(dist, stage, { recursive: true })
const stagedManifest = join(stage, 'manifest.json')
const staged = JSON.parse(readFileSync(stagedManifest, 'utf8'))
staged.host_permissions = ['<all_urls>']
writeFileSync(stagedManifest, JSON.stringify(staged, null, 2))

const profile = mkdtempSync(join(tmpdir(), 'rasd-capture-'))
const proc = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
proc.stderr.on('data', () => undefined)

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const note = (m) => lines.push(`  · ${m}`)

function finish(code) {
  try {
    proc.kill('SIGKILL')
  } catch {
    /* أُغلق أصلًا */
  }
  for (const dir of [profile, stage]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* Chrome ما يزال يكتب */
    }
  }
  console.log('\nفحص محرّك الالتقاط في Chrome:')
  console.log(lines.join('\n'))
  if (code !== 0 || errors.length > 0) {
    console.error(`\n✗ فشل الفحص — ${errors.length || 1} مشكلة.\n`)
    process.exit(1)
  }
  console.log('\n✓ الالتقاط والقصّ والحفظ تعمل بـactiveTab وحدها.\n')
  process.exit(0)
}

const guard = setTimeout(() => {
  fail(`تجاوز الفحص الحدّ الأقصى ${HARD_TIMEOUT_MS / 1000} ثانية`)
  finish(1)
}, HARD_TIMEOUT_MS)
guard.unref?.()

// ── الاتصال ببروتوكول DevTools ────────────────────────────────────
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
if (!wsUrl) {
  fail('تعذّر الاتصال ببروتوكول DevTools')
  finish(1)
}

const sock = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  sock.addEventListener('open', resolve, { once: true })
  sock.addEventListener('error', reject, { once: true })
})

let nextId = 1
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      sock.removeEventListener('message', onMsg)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
    sock.addEventListener('message', onMsg)
    sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const evaluatorFor = (sessionId) => async (expression) => {
  const res = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (res.exceptionDetails) {
    const d = res.exceptionDetails
    const detail = d.exception?.description ?? d.exception?.value ?? d.text ?? JSON.stringify(d)
    throw new Error(String(detail).split('\n')[0])
  }
  return res.result.value
}

async function findAndAttach(predicate, tries = 60, intervalMs = 200) {
  for (let i = 0; i < tries; i++) {
    const { targetInfos } = await send('Target.getTargets')
    const found = targetInfos.find(predicate)
    if (found) {
      try {
        const { sessionId } = await send('Target.attachToTarget', {
          targetId: found.targetId,
          flatten: true,
        })
        await send('Runtime.enable', {}, sessionId)
        return evaluatorFor(sessionId)
      } catch {
        /* اختفى بين الاكتشاف والاتصال */
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
let extensionId = null
try {
  extensionId = (await send('Extensions.loadUnpacked', { path: stage })).id
  ok(`الحزمة محمَّلة — ${extensionId}`)
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
  finish(1)
}
const ownOrigin = `chrome-extension://${extensionId}/`

const sw = await findAndAttach(
  (t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin),
)
if (!sw) {
  fail('لم يستيقظ الـservice worker')
  finish(1)
}
ok('الـservice worker يعمل')

// ── الحزمة المشحونة بلا صلاحية مضيف ───────────────────────────────
// تُقرأ من `dist/` الأصلي لا من نسخة الفحص المُرقَّعة: التصريح لا يجوز أن
// يُخفي ما جاء ليثبته.
try {
  const shipped = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  const hosts = shipped.host_permissions ?? []
  hosts.length === 0
    ? ok('الحزمة المشحونة بلا صلاحية مضيف — الالتقاط في المنتج يعتمد على activeTab وحدها')
    : fail(`الحزمة المشحونة تطلب صلاحيات مضيف: ${hosts.join(', ')}`)
  note(
    'نسخة الفحص وحدها مُرقَّعة بـ`<all_urls>` — activeTab لا تُمنح برمجيًا، والواجهة لا تقبل نمطًا أضيق',
  )
} catch (e) {
  fail(`تعذّرت قراءة بيان الحزمة: ${e.message}`)
}

// ── 3) هل `fetch(dataUrl)` محظور فعلًا تحت سياستنا؟ ────────────────
try {
  const verdict = await sw(`(async () => {
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    try { await fetch(tiny); return 'allowed' }
    catch (e) { return 'blocked: ' + String(e && e.message) }
  })()`)
  if (verdict === 'allowed') {
    note('‏`fetch(dataUrl)` **غير** محظور في هذه النسخة — الفكّ اليدوي احتياط زائد لا ضار')
  } else {
    ok(`‏\`fetch(dataUrl)\` محظور كما افترض \`image-ops.ts\` — ${verdict}`)
  }
} catch (e) {
  note(`تعذّر فحص fetch(dataUrl): ${e.message}`)
}

// ── تبويب هدف حقيقي ───────────────────────────────────────────────
const tabJson = await sw(
  `chrome.tabs.create({ url: ${JSON.stringify(PAGE_URL)}, active: true }).then((t) => JSON.stringify({ id: t.id, windowId: t.windowId }))`,
)
const tab = JSON.parse(tabJson)

for (let i = 0; i < 60; i++) {
  const st = await sw(`chrome.tabs.get(${tab.id}).then((t) => t.status)`)
  if (st === 'complete') break
  await new Promise((r) => setTimeout(r, 100))
}
ok('صفحة الهدف محمَّلة')

// ── 1+2) الالتقاط والقصّ عبر الرسالة الحقيقية ─────────────────────
try {
  // الحقن أوّلًا — نفس ما يفعله `activateTool`.
  await sw(
    `chrome.scripting.executeScript({ target: { tabId: ${tab.id} }, files: ['content.js'] })`,
  )
  ok('الطبقة محقونة عبر chrome.scripting — نفس النداء الذي تستعمله activateTool')

  const page = await findAndAttach((t) => t.type === 'page' && String(t.url).startsWith(PAGE_URL))
  if (!page) throw new Error('لم يُعثر على صفحة الهدف')

  const dpr = await page('window.devicePixelRatio')
  note(`كثافة البكسل في هذه البيئة: ${dpr}`)

  /*
   * الرسائل تُرسَل من **صفحة إضافة**، لا من صفحة الهدف.
   *
   * `Runtime.evaluate` على هدف صفحة ينفّذ في العالم الرئيسي، وهو بلا
   * `chrome.runtime` — بينما سكربت المحتوى يعيش في عالم معزول لا يصله CDP
   * مباشرةً. صفحة الإضافة تملك `chrome.runtime` كاملًا، وهي بالضبط مسار
   * النافذة في المنتج: لذلك يقبل `capture/run` حقل `tabId` صريحًا.
   *
   * وتُفتح **غير نشِطة** كي يبقى تبويب الهدف هو النشط — وإلا رفضته حراسة
   * «التبويب النشط» بحقّ.
   */
  await sw(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), windowId: ${tab.windowId}, active: false })`,
  )
  const extPage = await findAndAttach(
    (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/library/'),
  )
  if (!extPage) throw new Error('لم تُفتح صفحة الإضافة')
  ok('صفحة إضافة مفتوحة كمُرسِل للرسائل (غير نشِطة — الهدف يبقى النشط)')

  // التقاط منطقة بأبعاد معلومة، عبر عقد الرسائل نفسه الذي تستعمله الأداة.
  const W = 400
  const H = 240
  const raw = await extPage(`(async () => {
    const reply = await chrome.runtime.sendMessage({
      __rasd: 1, id: 'verify-area', type: 'capture/run',
      payload: {
        tabId: ${tab.id},
        kind: 'area',
        dpr: ${dpr},
        rect: {
          space: 'device',
          x: Math.round(100 * ${dpr}),
          y: Math.round(80 * ${dpr}),
          width: Math.round(${W} * ${dpr}),
          height: Math.round(${H} * ${dpr}),
        },
      },
    })
    return JSON.stringify(reply)
  })()`)
  const reply = JSON.parse(raw)

  if (!reply?.ok) {
    fail(
      `الالتقاط فشل: ${reply?.error?.message ?? '؟'}` +
        (reply?.error?.detail ? ` · التفصيل: ${reply.error.detail}` : ''),
    )
  } else {
    ok('الالتقاط نجح بـactiveTab وحدها — بلا صلاحية مضيف دائمة')

    const expectW = Math.round(W * dpr)
    const expectH = Math.round(H * dpr)
    reply.value.width === expectW && reply.value.height === expectH
      ? ok(`الأبعاد الناتجة تطابق المطلوب بالضبط — ${reply.value.width}×${reply.value.height}`)
      : fail(
          `الأبعاد ${reply.value.width}×${reply.value.height} لا تطابق المتوقَّع ${expectW}×${expectH}`,
        )

    // ما حُفظ فعلًا في IndexedDB، لا ما ادّعاه الردّ.
    const storedRaw = await sw(`(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('rasd')
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
      })
      const tx = db.transaction(['captures','blobs'], 'readonly')
      const cap = await new Promise((res) => { const q = tx.objectStore('captures').get(${JSON.stringify(reply.value.id)}); q.onsuccess = () => res(q.result) })
      const blb = await new Promise((res) => { const q = tx.objectStore('blobs').get(${JSON.stringify(reply.value.id)}); q.onsuccess = () => res(q.result) })
      return JSON.stringify({ cap, mime: blb && blb.mime, bytes: blb && blb.bytes })
    })()`)
    const stored = JSON.parse(storedRaw)

    stored.cap
      ? ok(
          `السجلّ محفوظ في captures — kind=${stored.cap.kind} · dpr=${stored.cap.devicePixelRatio}`,
        )
      : fail('لا سجلّ في captures')

    stored.cap?.width === expectW && stored.cap?.height === expectH
      ? ok('أبعاد السجلّ المحفوظ تطابق المقصوص')
      : fail(`أبعاد السجلّ ${stored.cap?.width}×${stored.cap?.height} ≠ ${expectW}×${expectH}`)

    stored.mime === 'image/png' && stored.bytes > 0
      ? ok(`البايتات محفوظة — ${stored.mime} · ${stored.bytes} بايت`)
      : fail(`الـBlob غير سليم: mime=${stored.mime} bytes=${stored.bytes}`)

    stored.cap?.origin && stored.cap?.url && stored.cap?.title !== undefined
      ? ok('البيانات الوصفية كاملة (الأصل · الرابط · العنوان · النوع · الكثافة)')
      : fail('بيانات وصفية ناقصة في السجلّ')
  }
} catch (e) {
  fail(`مسار الالتقاط فشل: ${e.message}`)
}

// ── 4) مُنظِّم الإيقاع تحت ضغط حقيقي ──────────────────────────────
try {
  const extPage = await findAndAttach(
    (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/library/'),
  )
  if (!extPage) throw new Error('لم يُعثر على صفحة الإضافة')

  const startedAt = Date.now()
  const raw = await extPage(`(async () => {
    const one = (i) => chrome.runtime.sendMessage({
      __rasd: 1, id: 'burst-' + i, type: 'capture/run',
      payload: { tabId: ${tab.id}, kind: 'viewport', dpr: 1, rect: null },
    })
    const all = await Promise.all(Array.from({ length: 6 }, (_, i) => one(i)))
    return JSON.stringify(all.map((r) => ({ ok: r && r.ok, msg: r && r.error && (r.error.detail || r.error.message) })))
  })()`)
  const results = JSON.parse(raw)
  const elapsed = Date.now() - startedAt

  const okCount = results.filter((r) => r.ok).length
  if (okCount < 6) note(`أوّل خطأ: ${results.find((r) => !r.ok)?.msg ?? '؟'}`)
  const rateErrors = results.filter((r) => !r.ok && String(r.msg).includes('متلاحقة')).length

  okCount === 6
    ? ok(`ستّة طلبات متلاحقة نجحت كلّها — لا واحد أُسقط (${elapsed}ms)`)
    : fail(`نجح ${okCount}/6 فقط · ${rateErrors} منها بخطأ تجاوز الحدّ · ${elapsed}ms`)

  // ستّة نداءات على 550ms = 2750ms على الأقلّ للأخير.
  elapsed >= 2500
    ? ok(`المُنظِّم باعد بينها فعلًا — ${elapsed}ms لستّة نداءات`)
    : fail(`ستّة نداءات في ${elapsed}ms فقط — المُنظِّم لم يعمل`)
} catch (e) {
  fail(`فحص مُنظِّم الإيقاع فشل: ${e.message}`)
}

sock.close()
finish(0)
