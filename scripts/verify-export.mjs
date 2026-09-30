/**
 * فحص قناة الخروج — الصيغ الثلاث، والدقّة، وتدهور الرفض، وتقرير المقارنة.
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
 *
 *     RASD_BREAK_STRIP=1 pnpm verify:export     # يجب أن يفشل
 *
 * يُرقَّع شرط الحذف في قاموس PDF (`captureMetadata`: `strip ? null : {title…}`) فيُكتب القاموس دائمًا —
 * أي أن `privacy.stripMetadataOnExport` يُقرأ ولا يُطبَّق. فيحمرّ بند «مع الحذف»: `Info` موجود والرابط
 * والعنوان في البايتات. والترقيع يرمي بصوتٍ عالٍ إن لم يجد نمطه، كنظيره أعلاه.
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

import { attachLiveServiceWorker } from './lib/live-sw.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9351
const BREAK = process.env.RASD_BREAK_DEGRADE === '1'
const BREAK_STRIP = process.env.RASD_BREAK_STRIP === '1'

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

if (BREAK_STRIP) {
  const assets = join(stage, 'assets')
  const files = existsSync(assets)
    ? (await import('node:fs')).readdirSync(assets).filter((f) => f.endsWith('.js'))
    : []
  // `strip ? null : { title: …` بعد التصغير: معرِّفٌ ثمّ `?null:{title:` — يصير شرطًا لا يتحقّق أبدًا.
  const pattern = /\b[A-Za-z_$][\w$]*\?null:\{title:/g
  let patched = 0
  for (const f of files) {
    const p = join(assets, f)
    const src = readFileSync(p, 'utf8')
    if (!pattern.test(src)) continue
    pattern.lastIndex = 0
    writeFileSync(p, src.replace(pattern, '!1?null:{title:'))
    patched++
  }
  if (patched === 0) {
    console.error('RASD_BREAK_STRIP: لم يُعثر على شرط الحذف في الحزمة المبنيّة — عدِّل النمط.')
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

/**
 * يفكّ ملفّ PDF **فعليًّا** — لا توقيعًا سحريًّا ولا قراءة `pdf-lib` نفسها.
 *
 * البنية من البايتات (الملفّ يُحفظ بلا تيّارات كائنات مضغوطة): الترويسة والذيل وعدد الصفحات وقاموس
 * `Info`. ثمّ كل صورة: تيّارها `FlateDecode` بمرشِّح PNG هو بيانات `IDAT` نفسها، فيُعاد بناء PNG منها —
 * توقيع و`IHDR` بأبعادها و`IDAT` وCRC صحيح — ويُفكّ بـ`createImageBitmap`. صورةٌ تُفكّ هنا يرسمها قارئ PDF.
 */
const inspectPdf = (sessionId, url, needles = []) =>
  evalIn(
    sessionId,
    `(async () => {
      const needles = ${JSON.stringify(needles)}
      const res = await fetch(${JSON.stringify(url)})
      const buf = new Uint8Array(await res.arrayBuffer())
      let text = ''
      for (let i = 0; i < buf.length; i += 0x8000) text += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const out = {
        bytes: buf.length,
        header: text.slice(0, 5),
        eof: text.trimEnd().endsWith('%%EOF'),
        pages: (text.match(/\\/Type \\/Page(?![s\\w])/g) ?? []).length,
        info: /\\/Info\\b/.test(text),
        title: /\\/Title </.test(text),
        producer: /\\/Producer </.test(text),
        lang: /\\/Lang \\(ar\\)/.test(text),
        images: [],
        traces: {},
      }
      // الأثر بشكليه: حرفيًّا (رابط لاتيني)، وستّ عشريًّا بـUTF-16 كما يكتب \`PDFHexString\`.
      const upper = text.toUpperCase()
      for (const n of needles) {
        const hex = [...n].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()
        out.traces[n] = text.includes(n) || upper.includes(hex)
      }
      const table = new Uint32Array(256)
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
      }
      const crc = (bytes) => {
        let c = 0xffffffff
        for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
        return (c ^ 0xffffffff) >>> 0
      }
      const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
      const chunk = (type, data) => {
        const body = new Uint8Array(4 + data.length)
        for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i)
        body.set(data, 4)
        return [...u32(data.length), ...body, ...u32(crc(body))]
      }
      const re = /\\/Subtype \\/Image/g
      let m
      while ((m = re.exec(text))) {
        const start = text.lastIndexOf('<<', m.index)
        const end = text.indexOf('>>\\nstream\\n', m.index)
        const dict = text.slice(start, end)
        const num = (k) => Number(new RegExp('/' + k + ' (\\\\d+)').exec(dict)?.[1])
        const w = num('Width')
        const h = num('Height')
        const len = num('Length')
        const from = end + '>>\\nstream\\n'.length
        const data = buf.subarray(from, from + len)
        const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 2, 0, 0, 0])
        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10,
          ...chunk('IHDR', ihdr), ...chunk('IDAT', data), ...chunk('IEND', new Uint8Array(0))])
        let decoded
        try {
          const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }))
          decoded = { w: bmp.width, h: bmp.height }
          bmp.close()
        } catch (e) { decoded = { error: String(e) } }
        out.images.push({ w, h, predictor: num('Predictor'), colors: num('Colors'), decoded })
      }
      return JSON.stringify(out)
    })().catch(e => JSON.stringify({ error: String(e) }))`,
  )

/** صورٌ كلّها تُفكّ بأبعادها المُعلَنة، بمرشِّح PNG وثلاث قنوات — أو سبب السقوط. */
const imagesDecode = (pdf) =>
  pdf.images.length > 0 &&
  pdf.images.every(
    (i) => i.predictor === 15 && i.colors === 3 && i.decoded?.w === i.w && i.decoded?.h === i.h,
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
  if (BREAK_STRIP)
    note('وضع اختبار العكس: حذف بيانات PDF معطَّل عمدًا — يجب أن يحمرّ بند «مع الحذف»')

  const opened = await seedAndOpen()
  if (!opened) fail('لم تُفتح صفحة المحرر')
  else if (!opened.seeded.ok) fail(`تعذّر زرع اللقطة: ${opened.seeded.error}`)
  else {
    const S = opened.sessionId
    if (!(await waitFor(S, '[data-export-open]', 120))) {
      fail('المحرر لم يجهز — زرّ «تصدير» لم يظهر')
    } else {
      ok(`اللقطة مزروعة والمحرر جاهز (${W}×${H})`)

      // ── 1) الصيغ الثلاث تعمل كلّها، والمتّجهة محذوفة ─────────────────────
      // `STAGES/03` حذفت المتّجهة بقرار النطاق (الصفّ 107)، فعودتُها سقوط. وPDF تعمل منذ `STAGES/05`.
      await evalIn(S, `document.querySelector('[data-export-open]').click(), 1`, true)
      await waitFor(S, '[data-export-modal]')
      const tiles = JSON.parse(
        await evalIn(
          S,
          `JSON.stringify([...document.querySelectorAll('[data-export-format]')].map(b => ({
            id: b.dataset.exportFormat, off: b.disabled,
          })))`,
        ),
      )
      const enabled = tiles.filter((t) => !t.off).map((t) => t.id)
      if (enabled.join(',') === 'png,webp,pdf' && tiles.length === 3) {
        ok('ثلاث صيغ تعمل: png وwebp وpdf — ولا معطَّلة ولا متّجهة')
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

      // ── 7) PDF من المحرّر: ملفٌّ يُفكّ، وصفحة تفاصيل، وبيانات وصفية تُكتب أو تُحذف كلّها ──
      const pdfOnce = async (pageMeta) => {
        await evalIn(S, `document.querySelector('[data-export-close]')?.click(), 1`, true)
        await evalIn(S, `document.querySelector('[data-export-open]').click(), 1`, true)
        if (!(await waitFor(S, '[data-export-modal]'))) return { error: 'لم تُفتح نافذة التصدير' }
        await evalIn(S, `document.querySelector('[data-export-format="pdf"]').click(), 1`, true)
        const modal = JSON.parse(
          await evalIn(
            S,
            `JSON.stringify({
              label: document.querySelector('#export-options-label')?.textContent ?? '',
              notesOff: !!document.querySelector('[data-export-toggle="notes"][data-export-toggle-disabled]'),
              metaOff: !!document.querySelector('[data-export-toggle="page-meta"][data-export-toggle-disabled]'),
              pages: Number(document.querySelector('[data-export-pages]')?.dataset.exportPages ?? -1),
              copy: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'انسخ إلى الحافظة'),
            })`,
          ),
        )
        if (pageMeta && !modal.metaOff) {
          await evalIn(
            S,
            `document.querySelector('[data-export-toggle="page-meta"] input').click(), 1`,
            true,
          )
        }
        await evalIn(
          S,
          `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'تنزيل').click(), 1`,
          true,
        )
        if (!(await waitFor(S, '[data-export-result][data-export-kind="pdf"]', 240))) {
          const err = await evalIn(
            S,
            `document.querySelector('[data-export-error]')?.textContent ?? ''`,
          )
          return { error: `لم تظهر نتيجة PDF${err ? ` — ${err}` : ''}`, modal }
        }
        const shown = JSON.parse(
          await evalIn(
            S,
            `JSON.stringify({
              blob: document.querySelector('[data-export-result]').dataset.exportBlob,
              pages: Number(document.querySelector('[data-export-result]').dataset.exportPages),
              stripped: document.querySelector('[data-export-metadata]')?.dataset.exportMetadataStripped,
            })`,
          ),
        )
        const pdf = JSON.parse(
          await inspectPdf(S, shown.blob, ['http://127.0.0.1:5399/probe', 'لقطة قناة الخروج']),
        )
        return { modal, shown, pdf }
      }

      const withMeta = await pdfOnce(true)
      if (withMeta.error) {
        fail(`PDF: ${withMeta.error}`)
      } else {
        const { modal, shown, pdf } = withMeta
        if (modal.label === 'خيارات PDF' && modal.notesOff && !modal.copy) {
          ok(
            'PDF: «خيارات PDF» مكان الدقّة، و«قائمة الملاحظات» معطَّلة بسببها (لا ملاحظات)، ولا نسخ إلى الحافظة',
          )
        } else {
          fail(`نافذة PDF غير متوقَّعة: ${JSON.stringify(modal)}`)
        }
        if (pdf.error) {
          fail(`PDF: تعذّرت قراءته — ${pdf.error}`)
        } else if (pdf.header !== '%PDF-' || !pdf.eof) {
          fail(`PDF: ترويسة «${pdf.header}» وذيل ${pdf.eof}`)
        } else if (pdf.pages !== 2 || shown.pages !== 2) {
          fail(
            `PDF بصفحة التفاصيل: ${pdf.pages} صفحة في الملفّ و${shown.pages} معروضة — المتوقَّع 2`,
          )
        } else if (!imagesDecode(pdf)) {
          fail(`PDF: صورة لا تُفكّ — ${JSON.stringify(pdf.images)}`)
        } else {
          const [photo] = pdf.images
          ok(
            `PDF: ${pdf.bytes} بايتًا، صفحتان (اللقطة وتفاصيلها)، و${pdf.images.length} صور فُكّت فعلًا — الأولى ${photo.decoded.w}×${photo.decoded.h}`,
          )
          if (photo.w === W && photo.h === H) {
            ok(`وصورة اللقطة بكسلها كما التُقطت (${W}×${H}) — من البوّابة كما خرجت، بمرشِّح PNG`)
          } else {
            fail(`صورة اللقطة ${photo.w}×${photo.h} والمتوقَّع ${W}×${H}`)
          }
        }
        if (
          pdf.info &&
          pdf.title &&
          pdf.producer &&
          pdf.lang &&
          pdf.traces['http://127.0.0.1:5399/probe']
        ) {
          ok('بلا حذف: قاموس Info بالعنوان والمنتِج والرابط، واللغة ar')
        } else {
          fail(
            `البيانات الوصفية بلا حذف ناقصة: ${JSON.stringify({ info: pdf.info, title: pdf.title, producer: pdf.producer, lang: pdf.lang, traces: pdf.traces })}`,
          )
        }
      }

      // الحذف: `privacy.stripMetadataOnExport` في الإعدادات — تقرؤه النافذة حيًّا.
      await evalIn(
        S,
        `(async () => {
          const cur = (await chrome.storage.local.get('rasd:settings'))['rasd:settings'] ?? {}
          await chrome.storage.local.set({ 'rasd:settings': { ...cur, privacy: { ...(cur.privacy ?? {}), stripMetadataOnExport: true } } })
          return 1
        })()`,
      )
      const stripped = await pdfOnce(true)
      await evalIn(
        S,
        `(async () => {
          const cur = (await chrome.storage.local.get('rasd:settings'))['rasd:settings'] ?? {}
          await chrome.storage.local.set({ 'rasd:settings': { ...cur, privacy: { ...(cur.privacy ?? {}), stripMetadataOnExport: false } } })
          return 1
        })()`,
      )
      if (stripped.error) {
        fail(`PDF مع الحذف: ${stripped.error}`)
      } else {
        const { modal, shown, pdf } = stripped
        const traces = Object.entries(pdf.traces ?? {}).filter(([, found]) => found)
        if (
          modal.metaOff &&
          pdf.pages === 1 &&
          !pdf.info &&
          traces.length === 0 &&
          shown.stripped === 'true'
        ) {
          ok(
            'مع الحذف: «بيانات الصفحة» معطَّلة بسببه، ولا Info، ولا أثر للرابط ولا للعنوان في البايتات',
          )
        } else {
          fail(
            `الحذف ناقص: ${JSON.stringify({ metaOff: modal.metaOff, pages: pdf.pages, info: pdf.info, traces, stripped: shown.stripped })}`,
          )
        }
      }

      // ── 8) تقرير المقارنة و«التقط الفرق» — على لقطتين طويلتين تختلفان ──────────
      const CW = 480
      const CH = 2400
      const seededPair = await evalIn(
        S,
        `(async () => {
          const paint = async (changed) => {
            const cv = new OffscreenCanvas(${CW}, ${CH})
            const c = cv.getContext('2d')
            c.fillStyle = '#ffffff'; c.fillRect(0, 0, ${CW}, ${CH})
            c.fillStyle = '#1f2937'
            // أسطر «نصّ» تفصلها فراغات — ما يبحث فيه القاطع عن مكانٍ لا يقطع سطرًا.
            for (let y = 20; y < ${CH}; y += 36) for (let x = 20; x < ${CW} - 20; x += 14) c.fillRect(x, y, 9, 14)
            // في الحالية سرٌّ مخطّط داخل منطقةٍ محجوبة في مشهدها — لا يخرج في التقرير ولا في «التقط الفرق».
            if (changed) for (let x = 100; x < 260; x += 8) { c.fillStyle = (x / 8) % 2 ? '#dc2626' : '#16a34a'; c.fillRect(x, 1200, 8, 90) }
            return cv.convertToBlob({ type: 'image/png' })
          }
          const [blobA, blobB] = await Promise.all([paint(false), paint(true)])
          const db = await new Promise((res, rej) => { const r = indexedDB.open('rasd'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
          const tx = db.transaction(['captures', 'blobs'], 'readwrite')
          const rec = (id, title, blob, at) => {
            tx.objectStore('captures').put({
              id, createdAt: at, origin: 'http://127.0.0.1:5399', url: 'http://127.0.0.1:5399/' + id,
              title, kind: 'full-page', status: 'ready', projectId: null, tags: [],
              width: ${CW}, height: ${CH}, devicePixelRatio: 1, favorite: false, trashedAt: null, archived: false,
            })
            tx.objectStore('blobs').put({ id, blob, mime: 'image/png', bytes: blob.size })
          }
          rec('cmp-a', 'الدفع v1', blobA, Date.now() - 60000)
          rec('cmp-b', 'الدفع v2', blobB, Date.now())
          const redact = {
            kind: 'redact', id: 'r1', locked: false, rotation: 0,
            stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 1 },
            rect: { space: 'device', x: 100, y: 1200, width: 160, height: 90 },
            mode: 'cover', strength: 0, coverToken: 'status/danger/solid',
          }
          await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
          const atx = db.transaction(['annotations'], 'readwrite')
          atx.objectStore('annotations').put({ captureId: 'cmp-b', updatedAt: Date.now(), scene: {
            schemaVersion: 1, captureId: 'cmp-b', source: { width: ${CW}, height: ${CH}, dpr: 1 },
            meta: { crop: null, pinStart: 1, pinShape: 'circle' }, revision: 1, nodes: [redact],
          } })
          await new Promise((res, rej) => { atx.oncomplete = res; atx.onerror = () => rej(atx.error) })
          db.close()
          return 'ok'
        })().catch(e => String(e))`,
      )
      if (seededPair !== 'ok') {
        fail(`تعذّر زرع لقطتي المقارنة: ${seededPair}`)
      } else {
        await inSW(
          `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/compare/index.html?a=cmp-a&b=cmp-b'), active: true }).then(t => t.id)`,
        )
        let compare = null
        for (let i = 0; i < 60 && !compare; i++) {
          const { targetInfos } = await send('Target.getTargets')
          compare =
            targetInfos.find((t) => t.type === 'page' && String(t.url).includes('/compare/')) ??
            null
          if (!compare) await new Promise((r) => setTimeout(r, 200))
        }
        const C = compare
          ? (await send('Target.attachToTarget', { targetId: compare.targetId, flatten: true }))
              .sessionId
          : null
        if (C) await send('Runtime.enable', {}, C)
        const ready =
          C &&
          (await waitFor(C, '[data-compare-report]:not([disabled])', 200)) &&
          (await waitFor(C, '[data-compare-capture-diff]:not([disabled])', 40))
        if (!ready) {
          fail('صفحة المقارنة لم تجهز — زرّا التقرير والتقاط الفرق لم يُفعَّلا')
        } else {
          ok('صفحة المقارنة: «تصدير التقرير» و«التقط الفرق» مفعَّلان بعد حساب الفرق — لا «قريبًا»')
          await evalIn(C, `document.querySelector('[data-compare-report]').click(), 1`, true)
          await waitFor(C, '[data-report-export]')
          await evalIn(C, `document.querySelector('[data-report-export]').click(), 1`, true)
          if (!(await waitFor(C, '[data-report-result]', 300))) {
            const err = await evalIn(
              C,
              `document.querySelector('[data-report-error]')?.textContent ?? ''`,
            )
            fail(`لم يكتمل التقرير${err ? ` — ${err}` : ''}`)
          } else {
            const blob = await evalIn(
              C,
              `document.querySelector('[data-report-result]').dataset.reportBlob`,
            )
            const shownPages = Number(
              await evalIn(C, `document.querySelector('[data-report-result]').dataset.reportPages`),
            )
            const pdf = JSON.parse(await inspectPdf(C, blob))
            const diffImage = pdf.images?.find((i) => i.w === CW && i.h === CH)
            if (pdf.error || pdf.header !== '%PDF-' || !pdf.eof) {
              fail(
                `التقرير: ليس PDF سليمًا — ${JSON.stringify({ error: pdf.error, header: pdf.header, eof: pdf.eof })}`,
              )
            } else if (!imagesDecode(pdf) || !diffImage) {
              fail(`التقرير: صورة لا تُفكّ أو صورة الفرق غائبة — ${JSON.stringify(pdf.images)}`)
            } else if (pdf.pages !== shownPages || pdf.pages < 3) {
              fail(
                `التقرير: ${pdf.pages} صفحة في الملفّ و${shownPages} معروضة — المتوقَّع ملخّص وصورة فرق مقسومة`,
              )
            } else {
              ok(
                `التقرير: ${pdf.bytes} بايتًا في ${pdf.pages} صفحات — ملخّص وصورة فرق ${CW}×${CH} مقسومة وفُكّت فعلًا`,
              )
            }
          }
          await evalIn(C, `document.querySelector('[data-report-close]')?.click(), 1`, true)
          await evalIn(
            C,
            `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'أغلق')?.click(), 1`,
            true,
          )
          await evalIn(C, `document.querySelector('[data-compare-capture-diff]').click(), 1`, true)
          if (!(await waitFor(C, '[data-diff-saved="saved"]', 200))) {
            const state = await evalIn(
              C,
              `document.querySelector('[data-diff-saved]')?.textContent ?? 'لا نافذة'`,
            )
            fail(`«التقط الفرق» لم يحفظ: ${state}`)
          } else {
            const id = await evalIn(
              C,
              `document.querySelector('[data-diff-saved]').dataset.diffCapture`,
            )
            const stored = JSON.parse(
              await evalIn(
                C,
                `(async () => {
                  const db = await new Promise((res, rej) => { const r = indexedDB.open('rasd'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
                  const get = (store) => new Promise((res) => { const q = db.transaction(store).objectStore(store).get(${JSON.stringify(id)}); q.onsuccess = () => res(q.result ?? null) })
                  const rec = await get('captures')
                  const blob = await get('blobs')
                  db.close()
                  let decoded = null
                  let secret = null
                  if (blob) {
                    const bmp = await createImageBitmap(blob.blob)
                    decoded = { w: bmp.width, h: bmp.height }
                    // داخل المحجوب بعيدًا عن إطار المنطقة ورقمها: لونٌ واحد — لا خطوط السرّ ولا شكل الفرق.
                    const cv = new OffscreenCanvas(bmp.width, bmp.height)
                    const cx = cv.getContext('2d')
                    cx.drawImage(bmp, 0, 0)
                    bmp.close()
                    const px = cx.getImageData(124, 1224, 112, 42).data
                    const colours = new Set()
                    for (let i = 0; i < px.length; i += 4) colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
                    secret = colours.size
                  }
                  return JSON.stringify({ title: rec?.title ?? null, url: rec?.url ?? null, decoded, secret })
                })().catch(e => JSON.stringify({ error: String(e) }))`,
              ),
            )
            if (
              stored.title?.startsWith('الفرق') &&
              stored.url?.endsWith('/cmp-b') &&
              stored.decoded?.w === CW &&
              stored.decoded?.h === CH
            ) {
              ok(
                `«التقط الفرق»: لقطة «${stored.title}» في المكتبة، بصورةٍ تُفكّ ${CW}×${CH} ورابط الحالية`,
              )
            } else {
              fail(`لقطة الفرق غير متوقَّعة: ${JSON.stringify(stored)}`)
            }
            // ADR 0015 §6: ما حُجب في المحرّر لا يخرج — لا من اللقطة الأصلية ولا من شكل الفرق فوقها.
            if (stored.secret === 1) {
              ok(
                'وما حُجب في مشهد الحالية مسطّحٌ بلونٍ واحد في صورة الفرق — لا السرّ ولا شكل الفرق فوقه',
              )
            } else {
              fail(`المنطقة المحجوبة في صورة الفرق تحمل ${stored.secret} لونًا — تسرّب ما حُجب`)
            }
          }
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
console.log(
  '✓ الصيغ الثلاث تُنتج ملفًّا يُفكّ فعلًا، والتقرير وصورة الفرق كذلك، والرفض يتدهور ويُعلن ما فُقد.\n',
)
