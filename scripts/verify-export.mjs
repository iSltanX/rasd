/**
 * فحص قناة الخروج — الصيغتان، والدقّة، وتدهور الرفض.
 *
 * **يفكّ الترميز فعليًّا لا يقرأ توقيعًا سحريًّا.** بايتات كل تصدير تُجلَب من
 * عنوان كائنها وتُمرَّر على `createImageBitmap`؛ فما لا يُفتَح لا يُقبَل مهما
 * بدأت بايتاته صحيحة. وهذا شرط `§10.2` نصًّا للوحدة 19.1.
 *
 * **وثلاثة أحكام مقيسة يثبّتها هذا الملفّ** (Chrome 152.0.7977.83)، وكلٌّ
 * منها ينقض ما كان مفترَضًا:
 *
 * ١. نوعٌ غير مدعوم **لا يرمي** — يتدهور صامتًا إلى PNG ويكذب في `blob.type`.
 *    فالبوّابة تقارن المُنتَج بالمطلوب، والفحص يقرأ الصيغة من التقرير.
 * ٢. مُرمِّج WebP يكتب مقطع `ICCP` في **كل** مخرَج؛ وPNG يخرج بلا أي مقطع
 *    نصّي. فحجّة «إعادة الترميز تنظّف مجّانًا» في ADR 0015 §5 صحيحة لـPNG
 *    وحدها — والفحص يثبّت الحالتين كما هما لا كما نتمنّاهما.
 * ٣. الحافظة ترفض WebP، فالنافذة تُعلن ذلك بدل أن تُعطي المستخدم غير ما اختار.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_DEGRADE=1 pnpm verify:export   # يجب أن يفشل
 *
 * يُرقَّع فرع «رُفضت الصلاحية» في نسخة `dist` المرحلية قبل إقلاع كروم: يصير
 * الطريق `managed` والإعلان `null` — أي تعطيلٌ لتدهور الرفض بشقّيه.
 *
 * **والنتيجة المقيسة: بندٌ واحد هو الذي يحمرّ**، وهو غياب إعلان ما فُقد.
 * والبند الثاني (ظهور «افتح المجلّد») لا يُطلَق في هذه البيئة لأن الصلاحية
 * غير ممنوحة أصلًا، فينكسر `chrome.downloads.download` ويتدهور `deliver`
 * إلى المرساة فلا يوجد مُعرِّف تنزيل. فهو حارسٌ ثانٍ **قائم لا مُطلَق** —
 * يعمل حين تُمنَح الصلاحية. وقول «بندان يحمرّان» كان سيكون ادّعاءً أوسع
 * ممّا قِيس.
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { attachLiveServiceWorker } from './live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9351
const BREAK = process.env.RASD_BREAK_DEGRADE === '1'

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

const stage = mkdtempSync(join(tmpdir(), 'rasd-export-ext-'))
cpSync(dist, stage, { recursive: true })

/**
 * ترقيع اختبار العكس.
 *
 * **ويرمي بصوتٍ عالٍ إن لم يجد نمطه** — ترقيعٌ صامت يُنتج فحصًا أخضر لأنه
 * لم يكسر شيئًا، وهو أسوأ من فشل صريح. نفس حكم `RASD_BREAK_CANCEL`.
 */
if (BREAK) {
  const assets = join(stage, 'assets')
  const files = existsSync(assets)
    ? (await import('node:fs')).readdirSync(assets).filter((f) => f.endsWith('.js'))
    : []
  let patched = 0
  /*
   * **علامة الاقتباس ليست مفترَضة.** الحزمة المبنيّة تستعمل الشرطة المائلة
   * الخلفية لا `"`، والنمط الأوّل كان يفترض `"` فلم يجد شيئًا — وأنقذه أن
   * الترقيع الصامت ممنوع هنا. فصار المُطابِق يقبل الثلاثة.
   */
  const Q = String.raw`["'\u0060]`
  const pattern = new RegExp(
    String.raw`case\s*${Q}denied${Q}\s*:\s*return\s*\{\s*route\s*:\s*${Q}anchor${Q}\s*,\s*ask\s*:\s*!1\s*,\s*note\s*:\s*[A-Za-z_$][\w$]*`,
    'g',
  )
  for (const f of files) {
    const p = join(assets, f)
    const src = readFileSync(p, 'utf8')
    if (!pattern.test(src)) continue
    pattern.lastIndex = 0
    writeFileSync(
      p,
      src.replace(
        pattern,
        'case\u0060denied\u0060:return{route:\u0060managed\u0060,ask:!1,note:null',
      ),
    )
    patched++
  }
  if (patched === 0) {
    console.error(
      'RASD_BREAK_DEGRADE: لم يُعثر على فرع «denied» في الحزمة المبنيّة — عدِّل النمط.\n' +
        'الترقيع الصامت يُنتج فحصًا أخضر لأنه لم يكسر شيئًا.',
    )
    rmSync(stage, { recursive: true, force: true })
    process.exit(1)
  }
}

const profile = mkdtempSync(join(tmpdir(), 'rasd-export-'))
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
  // ستّون ثانية لا عشر — نفس تعليل `verify-gate.mjs`.
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

let extId = null
try {
  extId = (await send('Extensions.loadUnpacked', { path: stage })).id
} catch (e) {
  fail(`Chrome رفض الحزمة: ${e.message}`)
}

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

async function evalIn(sessionId, expression, gesture = false) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, userGesture: gesture },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

const W = 480
const H = 320

/** يزرع لقطةً ويفتح المحرر عليها — نفس نمط `verify-editor.mjs`. */
async function seedAndOpen() {
  await inSW(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/editor/index.html?capture=probe'), active: true }).then(t => t.id)`,
  )
  let target = null
  for (let i = 0; i < 60; i++) {
    const { targetInfos } = await send('Target.getTargets')
    target =
      targetInfos.filter((t) => t.type === 'page' && String(t.url).includes('/editor/')).at(-1) ??
      null
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
      const cv = new OffscreenCanvas(${W}, ${H})
      const c = cv.getContext('2d')
      c.fillStyle='#204060'; c.fillRect(0,0,${W},${H})
      c.fillStyle='#ff3355'; c.fillRect(0,0,${W >> 1},${H >> 1})
      const blob = await cv.convertToBlob({ type: 'image/png' })
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
        id:'probe', createdAt: Date.now(), origin:'http://127.0.0.1:5399', url:'http://127.0.0.1:5399/probe',
        title:'لقطة قناة الخروج', kind:'viewport', status:'ready', projectId:null, tags:[],
        width:${W}, height:${H}, devicePixelRatio:1, favorite:false, trashedAt:null, archived:false,
      })
      tx.objectStore('blobs').put({ id:'probe', blob, mime:'image/png', bytes: blob.size })
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
      return JSON.stringify({ ok: true, bytes: blob.size })
    })().catch(e => JSON.stringify({ ok:false, error:String(e) }))`,
  )

  /*
   * **الرفض يُزرَع قبل إعادة التحميل، لا بعدها.**
   *
   * التدفّق يستطلع حالة الصلاحية عند التركيب ويقرؤها متزامنًا لحظة النقر؛
   * فزرعُها بعد التركيب يصل متأخّرًا ويُقرأ «مجهولة»، فتُطلَب الصلاحية —
   * وطلبُها في وضعٍ بلا رأس لا يُجاب. وهذا سباقٌ كان سيُقرأ «تعذّر التصدير».
   */
  await evalIn(sessionId, `chrome.storage.session.set({ 'export.downloadsRefused': true })`)
  await send('Page.reload', {}, sessionId)
  return { sessionId, seeded: JSON.parse(seeded) }
}

async function waitFor(sessionId, selector, tries = 80) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 150))
    const found = await evalIn(sessionId, `!!document.querySelector(${JSON.stringify(selector)})`)
    if (found === true) return true
  }
  return false
}

/** يفكّ ترميز البايتات **فعليًّا** ويفحص مقاطع الحاوية. */
const inspectBlob = (sessionId, url) =>
  evalIn(
    sessionId,
    `(async () => {
      const res = await fetch(${JSON.stringify(url)})
      const buf = new Uint8Array(await res.arrayBuffer())
      const blob = new Blob([buf])
      let decoded = null
      try {
        const bmp = await createImageBitmap(blob)
        decoded = { w: bmp.width, h: bmp.height }
        bmp.close()
      } catch (e) { decoded = { error: String(e) } }

      const ascii = (a, b) => String.fromCharCode(...buf.slice(a, b))
      const out = { bytes: buf.length, decoded, kind: 'unknown', chunks: [], trailing: 0 }

      if (ascii(0, 8) === String.fromCharCode(137) + 'PNG' + String.fromCharCode(13,10,26,10)) {
        out.kind = 'png'
        const dv = new DataView(buf.buffer)
        let off = 8
        while (off + 8 <= buf.length) {
          const size = dv.getUint32(off)
          const id = ascii(off + 4, off + 8)
          out.chunks.push(id)
          off += 12 + size
          if (id === 'IEND') break
        }
        out.trailing = buf.length - off
      } else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
        out.kind = 'webp'
        const dv = new DataView(buf.buffer)
        out.declared = dv.getUint32(4, true)
        out.actual = buf.length - 8
        let off = 12
        while (off + 8 <= buf.length) {
          const id = ascii(off, off + 4)
          const size = dv.getUint32(off + 4, true)
          out.chunks.push(id)
          off += 8 + size + (size % 2)
        }
        out.trailing = buf.length - off
      }
      return JSON.stringify(out)
    })().catch(e => JSON.stringify({ error: String(e) }))`,
  )

/** يفتح النافذة، يضبط الصيغة والدقّة، ينزّل، ويُعيد ما تعرضه شاشة النتيجة. */
async function exportOnce(S, format, scale) {
  await evalIn(S, `document.querySelector('[data-export-close]')?.click(), 1`, true)
  await evalIn(S, `document.querySelector('[data-export-open]').click(), 1`, true)
  if (!(await waitFor(S, '[data-export-modal]'))) return { error: 'لم تُفتح نافذة التصدير' }

  await evalIn(S, `document.querySelector('[data-export-format="${format}"]').click(), 1`, true)
  await evalIn(
    S,
    `(() => {
      const sel = document.querySelector('[data-export-scale-select]')
      sel.value = '${scale}'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      return 1
    })()`,
    true,
  )

  const estimate = await evalIn(
    S,
    `document.querySelector('[data-export-estimate]')?.textContent ?? ''`,
  )

  await evalIn(
    S,
    `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'تنزيل').click(), 1`,
    true,
  )
  if (!(await waitFor(S, '[data-export-result]', 200))) {
    const err = await evalIn(S, `document.querySelector('[data-export-error]')?.textContent ?? ''`)
    return { error: `لم تظهر شاشة النتيجة${err ? ` — ${err}` : ''}` }
  }

  const raw = await evalIn(
    S,
    `JSON.stringify({
      blob: document.querySelector('[data-export-result]').dataset.exportBlob,
      bytes: Number(document.querySelector('[data-export-result]').dataset.exportBytes),
      metadata: document.querySelector('[data-export-metadata]')?.dataset.exportMetadata ?? null,
      degraded: document.querySelector('[data-export-degraded]')?.textContent ?? null,
      reveal: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'افتح المجلّد'),
      signals: Number(document.querySelector('[data-export-signals]')?.dataset.exportSignals ?? -1),
    })`,
  )
  return { ...JSON.parse(raw), estimate }
}

// ── الجولة ──────────────────────────────────────────────────────
if (!extId || !sw) {
  fail('الإضافة أو الـservice worker لم يجهزا.')
} else {
  if (BREAK) note('وضع اختبار العكس: تدهور الرفض معطَّل عمدًا — يجب أن يحمرّ ما يلي')

  const opened = await seedAndOpen()
  if (!opened) fail('لم تُفتح صفحة المحرر')
  else if (!opened.seeded.ok) fail(`تعذّر زرع اللقطة: ${opened.seeded.error}`)
  else {
    const S = opened.sessionId
    if (!(await waitFor(S, '[data-export-open]', 120))) {
      fail('المحرر لم يجهز — زرّ «تصدير» لم يظهر')
    } else {
      ok(`اللقطة مزروعة والمحرر جاهز (${W}×${H})`)

      // ── 1) الصيغتان المؤجَّلتان معطَّلتان بسببٍ معروض ──────────────
      await evalIn(S, `document.querySelector('[data-export-open]').click(), 1`, true)
      await waitFor(S, '[data-export-modal]')
      const tiles = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify([...document.querySelectorAll('[data-export-format]')].map(b => ({
            id: b.dataset.exportFormat, off: b.disabled, why: (b.title ?? '').length,
          })))`,
        ),
      )
      const enabled = tiles.filter((t) => !t.off).map((t) => t.id)
      const deferred = tiles.filter((t) => t.off)
      if (
        enabled.join(',') === 'png,webp' &&
        deferred.length === 2 &&
        deferred.every((d) => d.why > 0)
      ) {
        ok('أربع صيغ: png وwebp تعملان، وpdf وsvg معطَّلتان بسببٍ معروض لا مخفيَّتين')
      } else {
        fail(`مُنتقي الصيغ غير متوقَّع: ${JSON.stringify(tiles)}`)
      }

      // ── 2) الحافظة تُعلن قيدها عند WebP ─────────────────────────
      await evalIn(S, `document.querySelector('[data-export-format="webp"]').click(), 1`, true)
      const clipNote = await evalIn(
        S,
        `document.querySelector('[data-export-clipboard-note]')?.textContent ?? ''`,
      )
      await evalIn(S, `document.querySelector('[data-export-format="png"]').click(), 1`, true)
      const clipNotePng = await evalIn(
        S,
        `document.querySelector('[data-export-clipboard-note]')?.textContent ?? ''`,
      )
      if (clipNote.includes('PNG') && clipNotePng === '') {
        ok('واختيار WebP يُعلن أن الحافظة تقبل PNG وحدها — ولا يُعلَن عند PNG')
      } else {
        fail(`إعلان قيد الحافظة غير صحيح: webp="${clipNote}" png="${clipNotePng}"`)
      }

      // ── 3) الصيغتان تُنتجان ملفًّا **يُفكّ ترميزه** ────────────────
      const decoded = {}
      for (const format of ['png', 'webp']) {
        const run = await exportOnce(S, format, 1)
        if (run.error) {
          fail(`${format}: ${run.error}`)
          continue
        }
        const info = JSON.parse(await inspectBlob(S, run.blob))
        decoded[format] = { run, info }

        if (info.error || info.decoded?.error) {
          fail(`${format}: تعذّر فكّ الترميز — ${info.error ?? info.decoded.error}`)
          continue
        }
        if (info.kind !== format) {
          fail(`${format}: الحاوية المُنتَجة ${info.kind} لا ${format}`)
          continue
        }
        if (info.decoded.w !== W || info.decoded.h !== H) {
          fail(`${format}: فُكّ إلى ${info.decoded.w}×${info.decoded.h} والمتوقَّع ${W}×${H}`)
          continue
        }
        ok(
          `${format}: ${info.bytes} بايتًا فُكّت فعلًا إلى ${info.decoded.w}×${info.decoded.h} — لا توقيعًا سحريًّا`,
        )
      }

      // ── 4) المقاطع كما قِيست لا كما نتمنّى ───────────────────────
      if (decoded.png) {
        const c = decoded.png.info.chunks
        const dirty = c.filter((id) => ['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(id))
        if (dirty.length === 0 && decoded.png.info.trailing === 0 && c.includes('IEND')) {
          ok('PNG: لا مقاطع نصّية ولا بايت بعد IEND — انحدار aCropalypse مغلق')
        } else {
          fail(`PNG: مقاطع=${c.join(',')} زائدة=${decoded.png.info.trailing}`)
        }
      }
      if (decoded.webp) {
        const i = decoded.webp.info
        const hasIccp = i.chunks.includes('ICCP')
        if (i.declared === i.actual && i.trailing === 0 && hasIccp) {
          ok(
            `WebP: الحجم المُعلَن = الفعلي وصفر بايت زائد؛ و**ICCP موجود** — حدٌّ معلَن لا مُدّعى حذفه`,
          )
        } else {
          fail(
            `WebP: مُعلَن=${i.declared} فعلي=${i.actual} زائدة=${i.trailing} ICCP=${hasIccp} مقاطع=${i.chunks.join(',')}`,
          )
        }
        if (decoded.webp.run.metadata === 'webp') {
          ok('وشاشة النتيجة تقول الحقيقة عن بياناته الوصفية لا نصّ الإطار الثابت')
        } else {
          fail(`صفّ البيانات الوصفية لم يُشتقّ من الصيغة: ${decoded.webp.run.metadata}`)
        }
      }

      // ── 5) `2×` يعطي ضعف الأبعاد **بالضبط** ─────────────────────
      const twice = await exportOnce(S, 'png', 2)
      if (twice.error) {
        fail(`2×: ${twice.error}`)
      } else {
        const info = JSON.parse(await inspectBlob(S, twice.blob))
        if (info.decoded?.w === W * 2 && info.decoded?.h === H * 2) {
          ok(`2× أعطى ${info.decoded.w}×${info.decoded.h} — ضعف ${W}×${H} بالضبط لا تقريبًا`)
        } else {
          fail(`2× أعطى ${JSON.stringify(info.decoded)} والمتوقَّع ${W * 2}×${H * 2}`)
        }
      }

      // ── 6) تدهور الرفض — وهو بوّابة الإكمال ─────────────────────
      const refused = decoded.png?.run ?? twice
      if (!refused || refused.error) {
        fail('لا نتيجة تُفحَص لمسار الرفض')
      } else {
        if (refused.degraded && refused.degraded.includes('مجلّد التنزيلات')) {
          ok('وبعد رفضٍ محفوظ للجلسة: التصدير **تمّ** وأُعلن ما فُقد بالاسم')
        } else {
          fail(`الرفض لم يُعلن ما فُقد: ${JSON.stringify(refused.degraded)}`)
        }
        if (refused.reveal === false) {
          ok('ولا زرّ «افتح المجلّد» — مسار المرساة لا يُعطي مُعرِّف تنزيل، ولا يُعرض ما لا يعمل')
        } else {
          fail('ظهر زرّ «افتح المجلّد» على مسارٍ لا مُعرِّف تنزيل له')
        }
        if (refused.signals >= 0) {
          ok(`وإشارات المرحلة 15 معروضة لأوّل مرّة — القسم موجود بعدد ${refused.signals}`)
        } else {
          fail('قسم إشارات التصدير غائب — الغياب يُقرأ «لم يُفحَص»')
        }
      }
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
console.log('\n── فحص قناة الخروج (فكُّ ترميزٍ فعلي، وتدهورٌ مقيس) ──\n')
for (const l of lines) console.log(l)
console.log('')
await cleanup()
ws.close()
if (errors.length > 0) {
  console.error(`✗ ${errors.length} إخفاق.\n`)
  process.exit(1)
}
console.log('✓ الصيغتان تُنتجان ملفًّا يُفكّ ترميزه، والرفض يتدهور ويُعلن ما فُقد.\n')
