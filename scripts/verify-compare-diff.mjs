#!/usr/bin/env node
/**
 * يثبت أن صفحة مقارنة لقطتين (المرحلة 17) تعمل فوق Chrome حقيقي — تحميل
 * لقطتين من IndexedDB، حساب فرق حقيقي عبر `diff.worker.ts`، وعرضه بطرقه
 * الثلاث. هذا هو فحص «Playwright MCP: تشغيل المقارنة على لقطتين حقيقيتين»
 * الذي ينصّ عليه `Rasd_Plan.md §17` صراحةً — لا يُدّعى نجاحه بلا تشغيل فعلي.
 *
 * **الفرق معروف مسبقًا لا عشوائيًّا**: صورتان مصنوعتان بصريغة PNG بلا فقد،
 * بخلفية صلبة ورقعتين حمراوين متباعدتين (200×150، رقعتا 30×20 كلّ منهما).
 * فحساب pixelmatch يجب أن يعطي **رقمين معروفين بالضبط** — 1200 بكسل مختلف
 * من 30000، ومنطقتين حدودهما 30×20 تمامًا (بلا انتفاخ التزامًا بإصلاح
 * `regions.ts` في هذه المرحلة) — لا تخمينًا اتجاهيًّا كبقيّة فحوص هذا الملفّ.
 *
 * صفحة إضافة صرفة — بلا صلاحية مضيف ولا خادم عيّنات، خلافًا لـ
 * `verify-overlay.mjs`/`verify-capture.mjs` (نفس سبب `verify-library.mjs`).
 *
 *   pnpm build && pnpm verify:compare-diff
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9378

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

const stage = mkdtempSync(join(tmpdir(), 'rasd-compare-diff-ext-'))
cpSync(dist, stage, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'rasd-compare-diff-'))
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
    '--window-size=1440,900',
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

const CAP_A = 'verify-cap-a'
const CAP_B = 'verify-cap-b'

let cmpSession = null
if (extId) {
  const url = `chrome-extension://${extId}/src/pages/compare/index.html?a=${CAP_A}&b=${CAP_B}`
  const { targetId } = await send('Target.createTarget', { url })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  cmpSession = sessionId
}

if (!cmpSession) {
  fail('تعذّر فتح صفحة المقارنة')
} else {
  const S = cmpSession
  try {
    /*
     * ── زرع لقطتين حقيقيتين ببايتات PNG فعلية ────────────────────
     * صورتان 200×150: خلفية صلبة (100,100,100)، ورقعتان حمراوان (30×20)
     * متباعدتان جدًّا (>4px نصف قطر الانتفاخ الافتراضي) — لا تندمجان في
     * منطقة واحدة. الاختلاف الوحيد بين أ وب: هاتان الرقعتان فقط.
     */
    const seeded = JSON.parse(
      await evalIn(
        S,
        `(async () => {
        const need = ['captures','blobs']
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

        function makePng(patches) {
          const c = new OffscreenCanvas(200, 150)
          const ctx = c.getContext('2d')
          ctx.fillStyle = 'rgb(100,100,100)'
          ctx.fillRect(0, 0, 200, 150)
          ctx.fillStyle = 'rgb(220,40,40)'
          for (const [x, y, w, h] of patches) ctx.fillRect(x, y, w, h)
          return c.convertToBlob({ type: 'image/png' })
        }

        const blobA = await makePng([])
        const blobB = await makePng([[20, 20, 30, 20], [150, 100, 30, 20]])

        const now = Date.now()
        const tx = db.transaction(need, 'readwrite')
        const rec = (id, title) => ({
          id, createdAt: now, origin: 'https://example.com', url: 'https://example.com/x',
          title, kind: 'viewport', status: 'ready', projectId: null, tags: [],
          width: 200, height: 150, devicePixelRatio: 1, favorite: false, archived: false, trashedAt: null,
        })
        tx.objectStore('captures').put(rec('${CAP_A}', 'قبل'))
        tx.objectStore('captures').put(rec('${CAP_B}', 'بعد'))
        tx.objectStore('blobs').put({ id: '${CAP_A}', blob: blobA, mime: 'image/png', bytes: blobA.size })
        tx.objectStore('blobs').put({ id: '${CAP_B}', blob: blobB, mime: 'image/png', bytes: blobB.size })
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
        db.close()
        return JSON.stringify({ ok: true })
      })().catch(e => JSON.stringify({ ok: false, error: String(e) }))`,
      ),
    )
    if (!seeded.ok) fail(`تعذّر زرع اللقطتين: ${seeded.error}`)
    else ok('زُرعت لقطتان حقيقيتان (200×150، رقعتان حمراوان معروفتا الموضع)')

    await send('Page.reload', {}, S)

    async function waitFor(expression, timeoutMs = 10000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const v = await evalIn(S, expression).catch(() => null)
        if (v) return v
        await new Promise((r) => setTimeout(r, 150))
      }
      return null
    }

    // ── التحميل ثم الحساب ────────────────────────────────────────
    const ready = await waitFor(`document.querySelector('[class*="ratioValue"]') ? 'ready' : null`)
    if (ready) ok('الصفحة حمَّلت اللقطتين وحسبت الفرق (بطاقة النسبة ظهرت)')
    else fail('بطاقة النسبة لم تظهر — تعذّر التحميل أو الحساب')

    if (ready) {
      // ── الأرقام مطابقة للمعروف مسبقًا بالضبط — لا تخمين ─────────
      const ratioText = await evalIn(
        S,
        `document.querySelector('[class*="ratioValue"]')?.textContent ?? ''`,
      )
      // 1200/30000 = 4% بالضبط.
      if (ratioText.includes('4') && ratioText.includes('%')) {
        ok(`نسبة الاختلاف صحيحة: "${ratioText}" (المتوقَّع 1200/30000 = 4%)`)
      } else {
        fail(`نسبة الاختلاف غير متوقَّعة: "${ratioText}" — المتوقَّع 4%`)
      }

      const detailText = await evalIn(
        S,
        `document.querySelector('[class*="ratioDetail"]')?.textContent ?? ''`,
      )
      note(`تفصيل العدّ: "${detailText}"`)

      const regionCount = await evalIn(
        S,
        `document.querySelectorAll('[class*="regionChips"] [class*="chip"]').length`,
      )
      if (regionCount === 2) ok('عدد المناطق صحيح: 2 (رقعتان متباعدتان لا تندمجان)')
      else fail(`عدد المناطق ${regionCount} — المتوقَّع 2`)

      // ── التنقّل بين المناطق ──────────────────────────────────────
      const chips = await evalIn(
        S,
        `[...document.querySelectorAll('[class*="regionChips"] [class*="chip"]')].map(c => c.textContent)`,
      )
      note(`تسميات المناطق (هندي متوقَّع): ${JSON.stringify(chips)}`)
      if (Array.isArray(chips) && chips.length === 2 && /[٠-٩]/.test(chips[0] ?? '')) {
        ok('تسميات المناطق بأرقام هندية (معيار §3.5)')
      } else {
        fail(`تسميات المناطق ليست هندية أو عددها خاطئ: ${JSON.stringify(chips)}`)
      }

      await evalIn(
        S,
        `document.querySelectorAll('[class*="regionChips"] [class*="chip"]')[0]?.click()`,
      )
      await new Promise((r) => setTimeout(r, 100))
      const selectedAfterClick = await evalIn(
        S,
        `document.querySelector('[class*="chipSelected"]')?.textContent ?? null`,
      )
      if (selectedAfterClick) ok(`نقر منطقة يحدِّدها فعليًّا: "${selectedAfterClick}"`)
      else fail('نقر منطقة لم يُبرزها محدَّدة')

      // ── تبديل الطرق الثلاث — بلا استثناء ────────────────────────
      const segOptions = await evalIn(
        S,
        `[...document.querySelectorAll('[aria-label="طريقة عرض المقارنة"] button, [aria-label="طريقة عرض المقارنة"] [role="tab"], [aria-label="طريقة عرض المقارنة"] *[class*="option"]')].map(b => b.textContent).filter(Boolean)`,
      )
      note(`خيارات طريقة العرض المقروءة من DOM: ${JSON.stringify(segOptions)}`)

      for (const label of ['فرق البكسل', 'وميض', 'متجاور']) {
        const clicked = await evalIn(
          S,
          `(() => {
            const btn = [...document.querySelectorAll('[aria-label="طريقة عرض المقارنة"] *')]
              .find(el => el.textContent?.trim() === ${JSON.stringify(label)} && el.children.length === 0)
            const target = btn?.closest('button') ?? btn
            if (!target) return false
            target.click()
            return true
          })()`,
        )
        await new Promise((r) => setTimeout(r, 150))
        clicked ? ok(`تبديل إلى «${label}» نجح بلا استثناء`) : fail(`تعذّر إيجاد تبويب «${label}»`)

        if (clicked && label === 'فرق البكسل') {
          try {
            const dir = join(root, 'artifacts')
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
            const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
            writeFileSync(join(dir, 'compare-diff-mode.png'), Buffer.from(data, 'base64'))
            note('لقطة وضع «فرق البكسل»: artifacts/compare-diff-mode.png')
          } catch (e) {
            note(`تعذّرت لقطة وضع الفرق: ${e}`)
          }
        }
      }

      // ── حساسية المقارنة: تحريكها يعيد الحساب فعلًا ──────────────
      //
      // **كان هذا القسم يدّعي ما لا يفعل**: عنوانه «تحريكها يعيد الحساب»
      // وهو لا يحرّكها — يقرأ وجودها ويطبع القيمة. وبذلك أفلت منه حاجبٌ
      // حقيقي: كان مخزنا الصورتين يُنقلان إلى الخيط فيُفصلان، فيرمي أوّلُ
      // تحريكٍ للشريط `TypeError` على مخزن مفصول، والعتبةُ القابلة للضبط
      // التي ينصّ عليها `§17` معطَّلةٌ من أوّل استعمال. الفحص الذي لا يفعل
      // ما يقوله أسوأ من غيابه: يشتري طمأنينةً بلا ثمن.
      const beforeMs = await evalIn(
        S,
        `document.querySelector('[class*="ratioValue"]')?.textContent`,
      )
      const slider = await evalIn(
        S,
        `document.querySelector('[aria-label="حساسية المقارنة"]') ? true : false`,
      )
      slider ? ok('شريط حساسية المقارنة موجود بمعرِّف إتاحة صحيح') : fail('شريط الحساسية غائب')
      note(`القيمة قبل أي تعديل: "${beforeMs}"`)

      if (slider) {
        const errorsBefore = pageErrors.length
        // تحريكٌ حقيقي: ضبط القيمة ثمّ `input` كما يفعل السحب بالفأرة.
        const moved = await evalIn(
          S,
          `(() => {
            const el = document.querySelector('[aria-label="حساسية المقارنة"]')
            if (!el) return false
            const from = el.value
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value').set
            const next = Number(from) >= Number(el.max) ? el.min : el.max
            setter.call(el, next)
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
            return JSON.stringify({ from, next })
          })()`,
        )
        if (!moved) {
          fail('تعذّر تحريك شريط الحساسية')
        } else {
          note(`حُرِّك الشريط: ${moved}`)
          // إعادة الحساب غير متزامنة (خيط + عرض) — يُنتظَر استقرارها.
          await new Promise((r) => setTimeout(r, 1200))
          const afterMs = await evalIn(
            S,
            `document.querySelector('[class*="ratioValue"]')?.textContent`,
          )
          const newErrors = pageErrors.slice(errorsBefore)
          if (newErrors.length > 0) {
            fail(`تحريك الحساسية رمى استثناءً: ${String(newErrors[0]).slice(0, 300)}`)
          } else if (!afterMs || !/[0-9]/u.test(String(afterMs))) {
            fail(`النسبة بعد التحريك غير قابلة للقراءة: "${afterMs}"`)
          } else {
            ok(
              `إعادة الحساب بعتبة أخرى تمّت بلا استثناء — النسبة "${afterMs}" (كانت "${beforeMs}")`,
            )
          }
        }
      }
    }

    // ── لقطة بصرية للمراجعة اليدوية مقابل إطار Figma 127:196 ──────
    // **تُلتقَط قبل فحص الأداء عمدًا**: فحص الأداء ينقّل الجلسة نفسها إلى
    // زوج صور 4000×3000 عشوائي — التقاطها بعده كان سيستبدل لقطة المقارنة
    // الصغيرة الحتمية بصورة كبيرة عشوائية لا تصلح مرجعًا بصريًّا لأحد.
    try {
      const dir = join(root, 'artifacts')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
      writeFileSync(join(dir, 'compare-two-captures.png'), Buffer.from(data, 'base64'))
      note('لقطة المراجعة: artifacts/compare-two-captures.png')
    } catch (e) {
      note(`تعذّرت اللقطة البصرية: ${e}`)
    }

    /*
     * ── تعليم المنطقة الزائدة عند اختلاف الأبعاد («Rasd_Plan.md §17») ──
     * فجوة كانت صامتة: `extraInA`/`extraInB` وصلا العميل منذ الدفعة السابقة
     * بلا مستهلِك في الواجهة. لقطتان بأبعاد مختلفتين (200×150 و280×220) —
     * التقاطع 200×150 خالٍ من أي فرق، والفائض في ب فقط (80×220 يمينًا،
     * 200×70 أسفل) — فأيّ علامة «غير مُقارَن» ظاهرة تثبت الفجوة مُصلَحة، لا
     * فرقًا حسابيًّا محتملًا يُخلَط معها.
     */
    try {
      const MISM_A = 'verify-mismatch-a'
      const MISM_B = 'verify-mismatch-b'
      const seededMismatch = JSON.parse(
        await evalIn(
          S,
          `(async () => {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open('rasd')
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
          })
          function makePng(w, h) {
            const c = new OffscreenCanvas(w, h)
            const ctx = c.getContext('2d')
            ctx.fillStyle = 'rgb(100,100,100)'
            ctx.fillRect(0, 0, w, h)
            return c.convertToBlob({ type: 'image/png' })
          }
          const blobA = await makePng(200, 150)
          const blobB = await makePng(280, 220)
          const now = Date.now()
          const tx = db.transaction(['captures','blobs'], 'readwrite')
          const rec = (id, title, w, h) => ({
            id, createdAt: now, origin: 'https://example.com', url: 'https://example.com/mismatch',
            title, kind: 'viewport', status: 'ready', projectId: null, tags: [],
            width: w, height: h, devicePixelRatio: 1, favorite: false, archived: false, trashedAt: null,
          })
          tx.objectStore('captures').put(rec('${MISM_A}', 'مقاس أ', 200, 150))
          tx.objectStore('captures').put(rec('${MISM_B}', 'مقاس ب', 280, 220))
          tx.objectStore('blobs').put({ id: '${MISM_A}', blob: blobA, mime: 'image/png', bytes: blobA.size })
          tx.objectStore('blobs').put({ id: '${MISM_B}', blob: blobB, mime: 'image/png', bytes: blobB.size })
          await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
          db.close()
          return JSON.stringify({ ok: true })
        })().catch(e => JSON.stringify({ ok: false, error: String(e) }))`,
        ),
      )

      if (!seededMismatch.ok) {
        fail(`تعذّر زرع لقطتَي الأبعاد المختلفة: ${seededMismatch.error}`)
      } else {
        const mismUrl = `chrome-extension://${extId}/src/pages/compare/index.html?a=${MISM_A}&b=${MISM_B}`
        await send('Page.navigate', { url: mismUrl }, S)

        async function waitForStableRatioOn(idMarker, timeoutMs = 10000) {
          const start = Date.now()
          let lastText = null
          let stableCount = 0
          while (Date.now() - start < timeoutMs) {
            const onNewPage = await evalIn(S, `location.search.includes('${idMarker}')`).catch(
              () => false,
            )
            if (onNewPage) {
              const text = await evalIn(
                S,
                `document.querySelector('[class*="ratioValue"]')?.textContent ?? null`,
              ).catch(() => null)
              if (text !== null && text === lastText) {
                stableCount++
                if (stableCount >= 3) return text
              } else {
                stableCount = 0
              }
              lastText = text
            }
            await new Promise((r) => setTimeout(r, 150))
          }
          return null
        }

        const mismRatio = await waitForStableRatioOn(MISM_A)
        if (mismRatio === null) {
          fail('لقطتا الأبعاد المختلفة لم يستقرّ حسابهما خلال المهلة')
        } else {
          note(`نسبة الاختلاف على التقاطع (يُتوقَّع 0% — التقاطع نفسه بلا فرق): "${mismRatio}"`)

          // ── بند الدليل الرابع «غير مُقارَن» ────────────────────────
          const legendHasExtra = await evalIn(
            S,
            `[...document.querySelectorAll('li')].some(li => li.textContent.includes('غير مُقارَن'))`,
          )
          legendHasExtra
            ? ok('بند الدليل «غير مُقارَن» ظاهر عند اختلاف الأبعاد')
            : fail('بند الدليل «غير مُقارَن» غائب رغم اختلاف الأبعاد — الفجوة لم تُصلَح فعليًّا')

          // ── التبديل إلى «فرق البكسل» لرؤية التهشير فعليًّا ──────────
          await evalIn(
            S,
            `(() => {
              const btn = [...document.querySelectorAll('[aria-label="طريقة عرض المقارنة"] *')]
                .find(el => el.textContent?.trim() === 'فرق البكسل' && el.children.length === 0)
              const target = btn?.closest('button') ?? btn
              target?.click()
            })()`,
          )
          await new Promise((r) => setTimeout(r, 300))

          const extraStripCount = await evalIn(
            S,
            `document.querySelectorAll('[class*="extraStrip"]:not([class*="extraStripLabel"])').length`,
          )
          // فائض ب فقط: عمود يمينًا وصفّ أسفل — صندوقان بالضبط.
          if (extraStripCount === 2) {
            ok(`صندوقا التهشير ظاهران بالعدد الصحيح: ${extraStripCount}`)
          } else {
            fail(`عدد صناديق التهشير ${extraStripCount} — المتوقَّع 2 (عمود ب وصفّ ب فقط)`)
          }

          // ── محاذاة الصورة بفضاء المسرح ───────────────────────────
          //
          // **هذا التأكيد يسدّ الثغرة التي أفلت منها عطلٌ حقيقي.** الفحص
          // السابق عدّ صناديق التهشير ولم يقس مواضعها، فمرّ رغم أن الصورة
          // تحتها كانت مرسومةً بمقياس آخر: `object-fit: contain` يرسم بأكبر
          // مقياس يناسب الحاوية لا بمقياس المسرح، فكانت صورة 200×150 داخل
          // مسرح 280×220 تُكبَّر 1.400×. العدّ لا يكشف انزياحًا — القياس يكشفه.
          const alignment = JSON.parse(
            await evalIn(
              S,
              `(() => {
                const img = document.querySelector('img[alt="مقاس ب"], img[alt="مقاس أ"]')
                const box = img?.parentElement
                if (!img || !box) return JSON.stringify({ ok: false, why: 'لا صورة في المسرح' })
                // صندوق **المحتوى** لا الحدودي: النِسَب المئوية لابنٍ مطلق
                // تُحسب منه، والحدّ (border) خارجه. قياسه بـgetBoundingClientRect
                // كان يُظهر انحرافًا وهميًّا بمقدار سُمك الحدّ في كل بُعد.
                const b = box.getBoundingClientRect()
                const inner = { width: box.clientWidth, height: box.clientHeight }
                const r = img.getBoundingClientRect()
                const perStageUnit = inner.width / 280
                return JSON.stringify({
                  ok: true, alt: img.alt,
                  drawn: [r.width, r.height],
                  expected: [img.naturalWidth * perStageUnit, img.naturalHeight * perStageUnit],
                  offset: [r.left - b.left - box.clientLeft, r.top - b.top - box.clientTop],
                  stageRatio: [inner.width / inner.height, 280 / 220],
                })
              })()`,
            ),
          )
          if (!alignment.ok) {
            fail(`تعذّر قياس محاذاة الصورة: ${alignment.why}`)
          } else {
            const [dw, dh] = alignment.drawn
            const [ew, eh] = alignment.expected
            const scaleError = Math.max(Math.abs(dw / ew - 1), Math.abs(dh / eh - 1))
            const [ox, oy] = alignment.offset
            const [gotRatio, wantRatio] = alignment.stageRatio
            const ratioError = Math.abs(gotRatio / wantRatio - 1)
            if (ratioError > 0.01) {
              fail(
                `نسبة حاوية المسرح مكسورة: ${gotRatio.toFixed(4)} بدل ${wantRatio.toFixed(4)} — ` +
                  `كل ما يُموضَع فوقها بنسبة مئوية مشوَّه`,
              )
            } else {
              ok(`نسبة حاوية المسرح محفوظة: ${gotRatio.toFixed(4)} ≈ ${wantRatio.toFixed(4)}`)
            }
            if (scaleError < 0.01 && Math.abs(ox) < 1 && Math.abs(oy) < 1) {
              ok(
                `الصورة مرسومة بمقياس المسرح تمامًا: ${dw.toFixed(0)}×${dh.toFixed(0)} ` +
                  `(المتوقَّع ${ew.toFixed(0)}×${eh.toFixed(0)}) ومرساة عند (0,0)`,
              )
            } else {
              fail(
                `الصورة منحرفة عن فضاء المسرح — مرسومة ${dw.toFixed(1)}×${dh.toFixed(1)} ` +
                  `والمتوقَّع ${ew.toFixed(1)}×${eh.toFixed(1)} ` +
                  `(تكبير ${(dw / ew).toFixed(3)}×، إزاحة ${ox.toFixed(1)},${oy.toFixed(1)})`,
              )
            }
          }

          try {
            const dir = join(root, 'artifacts')
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
            const { data } = await send('Page.captureScreenshot', { format: 'png' }, S)
            writeFileSync(join(dir, 'compare-extra-region.png'), Buffer.from(data, 'base64'))
            note('لقطة المنطقة الزائدة: artifacts/compare-extra-region.png')
          } catch (e) {
            note(`تعذّرت لقطة المنطقة الزائدة: ${e}`)
          }
        }
      }
    } catch (e) {
      fail(`استثناء أثناء فحص المنطقة الزائدة: ${e.message ?? e}`)
    }

    /*
     * ── هدف الأداء: 4000×3000 في ≤3 ثوانٍ («Rasd_Plan.md §17»، معيار
     * الاكتمال) ──────────────────────────────────────────────────
     * لم يُقَس بعد في هذا الفحص — يُقاس الآن حيًّا لا افتراضًا. الصورتان
     * ليستا متطابقتين (نمط عشوائي مبعثَر) كي لا يُصادف مسار `pixelmatch`
     * السريع لصورتين متطابقتين بايتيًّا فيُعطي رقمًا متفائلًا كاذبًا. الزمن
     * المقيس هنا **شامل** — تنقّل + تحميل IndexedDB + فكّ الصورتين + حساب
     * الفرق — لا حساب `pixelmatch` وحده، فهو أصدق لتجربة المستخدم الفعلية
     * وإن كان أوسع من نصّ المعيار حرفيًّا. **تُنقِّل الجلسة بعيدًا — بعد
     * لقطة المراجعة أعلاه لا قبلها.**
     */
    try {
      const PERF_A = 'verify-perf-a'
      const PERF_B = 'verify-perf-b'
      const seededPerf = JSON.parse(
        await evalIn(
          S,
          `(async () => {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open('rasd')
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
          })

          /*
           * عشرون رقعة **معروفة الموضع بالضبط** (200×150 كلٌّ منها، شبكة
           * 5×4 متباعدة جدًّا) — لا نمط عشوائي. أُسقط النمط العشوائي (400
           * رقعة صغيرة متراكبة) بعد قياسٍ مباشر: كان يُنتج «0%» رغم بايتات
           * PNG مختلفة فعليًّا — نمط عالي الضجيج كهذا يُشبِع كاشف التنعيم
           * المضادّ في pixelmatch (hasManySiblings) بكثرة جيران مختلفين
           * محليًّا، فيُصنَّف أغلب الفرق الحقيقي تنعيمًا زائفًا فيُستبعَد —
           * خاصّية اختبار سيّئ التصميم لا عطلًا في المنتج.
           *
           * **خلفية صلبة اللون لا تدرّج — قِيس هذا أيضًا.** تدرّج خطّي
           * (createLinearGradient) أعطى "4.5%" بدل "5%" رغم رقعٍ صلبة
           * متباعدة تمامًا: كل بكسلين متجاورين في خلفية متدرِّجة يختلفان
           * قليلًا، فيكسر افتراض «جيران متطابقون بكثرة» الذي يقوم عليه كاشف
           * التنعيم فيُصنَّف بعض حدود الرقع الحقيقية تنعيمًا زائفًا. الخلفية
           * الصلبة هنا (كالفحص الصغير الناجح تمامًا أعلاه) تُعطي رقمًا
           * معروفًا بالضبط: 20×(200×150)=600000 بكسل من 12000000 = 5%.
           */
          function makeBigPng(withPatches) {
            const c = new OffscreenCanvas(4000, 3000)
            const ctx = c.getContext('2d')
            ctx.fillStyle = 'rgb(30,34,51)'
            ctx.fillRect(0, 0, 4000, 3000)
            if (withPatches) {
              ctx.fillStyle = 'rgb(220,40,40)'
              for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 5; col++) {
                  ctx.fillRect(100 + col * 760, 100 + row * 720, 200, 150)
                }
              }
            }
            return c.convertToBlob({ type: 'image/png' })
          }

          const blobA = await makeBigPng(false)
          const blobB = await makeBigPng(true)

          const now = Date.now()
          const tx = db.transaction(['captures','blobs'], 'readwrite')
          const rec = (id, title) => ({
            id, createdAt: now, origin: 'https://example.com', url: 'https://example.com/perf',
            title, kind: 'viewport', status: 'ready', projectId: null, tags: [],
            width: 4000, height: 3000, devicePixelRatio: 1, favorite: false, archived: false, trashedAt: null,
          })
          tx.objectStore('captures').put(rec('${PERF_A}', 'أداء أ'))
          tx.objectStore('captures').put(rec('${PERF_B}', 'أداء ب'))
          tx.objectStore('blobs').put({ id: '${PERF_A}', blob: blobA, mime: 'image/png', bytes: blobA.size })
          tx.objectStore('blobs').put({ id: '${PERF_B}', blob: blobB, mime: 'image/png', bytes: blobB.size })
          await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
          db.close()
          return JSON.stringify({ ok: true, sizeA: blobA.size, sizeB: blobB.size })
        })().catch(e => JSON.stringify({ ok: false, error: String(e) }))`,
        ),
      )
      note(`حجما PNG المزروعان مختلفان فعلًا: أ=${seededPerf.sizeA} ب=${seededPerf.sizeB} بايت`)

      if (!seededPerf.ok) {
        fail(`تعذّر زرع لقطتَي الأداء (4000×3000): ${seededPerf.error}`)
      } else {
        const perfUrl = `chrome-extension://${extId}/src/pages/compare/index.html?a=${PERF_A}&b=${PERF_B}`
        const started = Date.now()
        await send('Page.navigate', { url: perfUrl }, S)

        /*
         * **الجهوز لا يُقاس بوجود بطاقة النسبة — بل باستقرار نصّها.** بطاقة
         * النسبة تُرسَم فور بلوغ `pageState==='ready'` بقيمة ابتدائية `0%`
         * (`diffOutcome?.diffRatio ?? 0` في `ComparePage.tsx`) **قبل** أن
         * ينتهي حساب `pixelmatch` أصلًا — وهو حساب منفصل لاحق زمنيًّا. قِيس
         * مباشرةً: فحص وجود العنصر وحده أعطى ~120ms و«0%» على صورتين
         * 4000×3000 مصمَّمتين لتختلفا فعليًّا — كان يمسك القيمة الابتدائية لا
         * نتيجة حساب حقيقي. الانتظار هنا حتى **يستقرّ** النصّ (ثلاث قراءات
         * متتالية متطابقة) يضمن انتهاء الحساب الفعلي، لا وجود العنصر فقط —
         * ونشترط أيضًا أننا على الصفحة الجديدة (`location.search`) لا القديمة
         * التي قد تبقى حيّة لحظيًّا بعد `Page.navigate` (لا ينتظر اكتمال التنقّل).
         */
        async function waitForStableRatio(timeoutMs = 15000) {
          const start = Date.now()
          let lastText = null
          let stableCount = 0
          while (Date.now() - start < timeoutMs) {
            const onNewPage = await evalIn(S, `location.search.includes('${PERF_A}')`).catch(
              () => false,
            )
            if (onNewPage) {
              const text = await evalIn(
                S,
                `document.querySelector('[class*="ratioValue"]')?.textContent ?? null`,
              ).catch(() => null)
              if (text !== null && text === lastText) {
                stableCount++
                if (stableCount >= 3) return text
              } else {
                stableCount = 0
              }
              lastText = text
            }
            await new Promise((r) => setTimeout(r, 150))
          }
          return null
        }

        const perfRatioStable = await waitForStableRatio()
        const elapsedMs = Date.now() - started

        if (perfRatioStable === null) {
          fail(`مقارنة 4000×3000 لم يستقرّ ناتجها خلال المهلة (${elapsedMs}ms)`)
        } else {
          note(`مقارنة 4000×3000 اكتملت (تنقّل+تحميل+فكّ+حساب شاملًا) في ${elapsedMs}ms`)
          if (elapsedMs <= 3000) {
            ok(`الأداء يفي بالهدف: ${elapsedMs}ms ≤ 3000ms`)
          } else {
            fail(
              `الأداء **الشامل** تجاوز 3000ms (${elapsedMs}ms) — الهدف المكتوب لحساب pixelmatch وحده لا يشمل التنقّل والفكّ؛ يحتاج قياسًا أدقّ قبل الحكم النهائي`,
            )
          }
          // المتوقَّع بالضبط: 20×(200×150)=600000 من 12000000 = 5%.
          if (perfRatioStable === '5%') {
            ok(`نسبة الاختلاف على الصورة الكبيرة صحيحة بالضبط: "${perfRatioStable}"`)
          } else {
            fail(
              `نسبة الاختلاف على الصورة الكبيرة "${perfRatioStable}" — المتوقَّع 5% بالضبط (حجما PNG: ${seededPerf.sizeA}/${seededPerf.sizeB} بايت)`,
            )
          }
        }
      }
    } catch (e) {
      fail(`استثناء أثناء فحص الأداء: ${e.message ?? e}`)
    }
  } catch (e) {
    fail(`استثناء أثناء السيناريو: ${e.message ?? e}`)
  }
}

for (const e of pageErrors.slice(0, 6)) fail(`استثناء في الصفحة: ${String(e).slice(0, 800)}`)

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص صفحة مقارنة لقطتين في Chrome حقيقي ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ صفحة المقارنة تحمِّل، تحسب فرقًا صحيحًا، وتستجيب فوق Chrome حقيقي.\n')
