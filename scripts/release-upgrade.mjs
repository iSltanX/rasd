#!/usr/bin/env node
/**
 * حزام الترقية ببيانات حقيقية في متصفّحات Chromium — مصفوفة القبول (`Docs/Release/acceptance.md`).
 *
 *   node scripts/release-upgrade.mjs --browser=chrome|edge|brave|opera --old=<مجلّد بناء Chromium قديم مفكوك> [--captures=300] [--uninstall]
 *   node scripts/release-upgrade.mjs --browser=firefox --old=<مجلّد بناء Chromium قديم مفكوك> --new=dist-firefox
 *
 * ما يفعله، في متصفّحٍ حقيقي وبملفّ تعريفٍ **دائم** بين جلستين:
 *   1. الجلسة الأولى: يحمّل **البناء القديم** مفكوكًا في مجلّدٍ ثابت، فيلتقط به لقطاتٍ حقيقية (الجزء الظاهر والصفحة كاملة)،
 *      ثمّ يكبّر المكتبة إلى مئات اللقطات بنسخ بايتات تلك اللقطات الحقيقية، ويزرع مشاريع ومرجعًا بمناطق مستثناة وألوانًا
 *      ولوحات وأدلّة وتعليقًا ومصغَّرات، ويضبط إعدادًا، ويفعّل **قفل المكتبة**. ثمّ يأخذ «تعداد» كل مخزن (سجلّات وبصمات
 *      بايتات). ثمّ يغلق المتصفّح.
 *   2. يستبدل محتوى المجلّد نفسه بـ**البناء الجديد** (المعرّف المشتقّ من المسار لا يتغيّر ⇐ التخزين نفسه).
 *   3. الجلسة الثانية: يقلع المتصفّح بالملفّ نفسه، فيرحّل البناء الجديد القاعدة. يتحقّق أن الصفحة تطلب الرمز، ويفتح المكتبة
 *      **بإدخال الرمز في الواجهة**، ويأخذ تعدادًا ثانيًا ويقارنه سجلًّا سجلًّا (كل حقل قديم يجب أن يبقى بقيمته)، ويتحقّق
 *      أن الإعدادات بقيت، وأن الالتقاط الحقيقي بعد الترقية يعمل ويزيد المكتبة لقطة واحدة.
 *   4. `--sabotage`: السالب — يفسد بيانات المكتبة بعد الترقية، ويجب أن يسقط الحزام (خروج 1) باختفاء سجلّ وتغيّر بايتٍ وحقل.
 *   5. `--uninstall`: يزيل الإضافة ويتحقّق من اختفاء مجلّد IndexedDB الخاصّ بها من الملفّ بعد الإغلاق.
 *
 * **ليس حارسًا:** لا يدخل سجلّ الترقية ولا يُشغَّل في البوّابة. منفذه 9397 وصفحة العيّنة على 5414. وبديلٌ واحد للقياس كما في
 * `chromium-probe.mjs`: `host_permissions: ["<all_urls>"]` في النسختين مكان إيماءة `activeTab`.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import {
  basePrefs,
  connectBidi,
  EXT_BASE,
  evaluator,
  extensionConsole,
  findContext,
  installExtension,
} from './lib/bidi.mjs'
import { BASE_CHROME_FLAGS, connectCdp, loadExtension } from './lib/cdp.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const KNOWN = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  opera: '/Applications/Opera.app/Contents/MacOS/Opera',
  vivaldi: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
}
const args = process.argv.slice(2)
const arg = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const name = arg('browser')
const FIREFOX = process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox'
const FF = name === 'firefox'
const BIN = FF ? FIREFOX : (process.env.CHROME_PATH ?? KNOWN[name])
const OLD = arg('old') && resolve(arg('old'))
const NEW = resolve(arg('new', join(ROOT, FF ? 'dist-firefox' : 'dist')))
const COUNT = Number(arg('captures', '300'))
const UNINSTALL = args.includes('--uninstall')
const SABOTAGE = args.includes('--sabotage')
const PIN = 'رصد-اختبار-٢٠٢٦'
const PORT = FF ? 9231 : 9397
const PAGE_PORT = 5414
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!BIN || !existsSync(BIN)) {
  console.error(
    `✗ لا متصفّح: --browser=${[...Object.keys(KNOWN), 'firefox'].join('|')} أو CHROME_PATH/FIREFOX_PATH.`,
  )
  process.exit(2)
}
if (!OLD || !existsSync(join(OLD, 'manifest.json'))) {
  console.error('✗ --old=<مجلّد بناء قديم مفكوك فيه manifest.json> مطلوب.')
  process.exit(2)
}
if (!existsSync(join(NEW, 'manifest.json'))) {
  console.error(
    '✗ لا بناء جديد — شغّل `pnpm build:bundle` (أو `pnpm build:firefox`) أو مرّر --new=.',
  )
  process.exit(2)
}

// ── خادم العيّنات ────────────────────────────────────────────────
const SITES = join(ROOT, 'tests', 'fixtures', 'sites')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
const server = createServer((req, res) => {
  const path = normalize(join(SITES, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  const file = path.endsWith('/') ? join(path, 'index.html') : path
  if (!file.startsWith(SITES) || !existsSync(file)) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(PAGE_PORT, '127.0.0.1')
const PAGES = ['rtl-ar', 'ltr-en', 'mixed', 'short', 'css', 'sticky'].map(
  (d) => `http://127.0.0.1:${PAGE_PORT}/${d}/index.html`,
)

// ── ما يجري داخل صفحة الإضافة (محرّكٌ واحد، نصٌّ واحد) ─────────────
const IDB = `
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('rasd'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')) })
const all = (db, store) => new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
const putAll = (db, store, rows) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); const s = tx.objectStore(store); rows.forEach((r) => s.put(r)); tx.oncomplete = () => res(rows.length); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })
const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')
`

/** تعداد كل مخزن: سجلّات بمفاتيحها، والـBlob يُستبدل بـ{size,type,sha}. */
const CENSUS = `(async () => {
${IDB}
const db = await idb()
const plain = async (v) => {
  if (v instanceof Blob) return { __blob: true, size: v.size, type: v.type, sha: await sha(await v.arrayBuffer()) }
  if (Array.isArray(v)) return Promise.all(v.map(plain))
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = await plain(v[k]); return o }
  return v
}
const out = { version: db.version, stores: {} }
for (const name of [...db.objectStoreNames]) {
  const store = db.transaction(name).objectStore(name)
  const rows = await all(db, name)
  const key = store.keyPath
  const map = {}
  for (const r of rows) map[String(r[key])] = await plain(r)
  out.stores[name] = { count: rows.length, rows: map }
}
db.close()
const local = await chrome.storage.local.get(null)
out.local = JSON.parse(JSON.stringify(local))
return JSON.stringify(out)
})()`

/** يكبّر المكتبة ويزرع ما حولها. */
const SEED = (count, pin) => `(async () => {
${IDB}
const COUNT = ${count}
const db = await idb()
const enc = new TextEncoder()
const captures = await all(db, 'captures')
const blobs = Object.fromEntries((await all(db, 'blobs')).map((b) => [b.id, b]))
const real = captures.filter((c) => blobs[c.id])
const realBefore = real.length
const now = Date.now()
// بناءٌ قديم لا يلتقط في هذا المتصفّح (لا بناء Firefox سابقًا قطّ): يولّد المتصفّح نفسه PNG بترميزه الخاصّ بدل الالتقاط.
if (real.length < 3) {
  for (let i = 0; i < 7; i++) {
    const cv = new OffscreenCanvas(640, 360)
    const g = cv.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 640, 360); grad.addColorStop(0, 'hsl(' + i * 50 + ' 70% 50%)'); grad.addColorStop(1, 'hsl(' + (i * 50 + 120) + ' 60% 30%)')
    g.fillStyle = grad; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = '32px sans-serif'; g.fillText('rasd upgrade ' + i, 40, 180)
    const blob = await cv.convertToBlob({ type: 'image/png' })
    const id = 'synthetic-' + i
    const rec = { id, createdAt: now - i * 1000, origin: 'http://127.0.0.1', url: 'http://127.0.0.1/' + i, title: 'عيّنة ' + i, kind: 'viewport', status: 'ready', projectId: null, tags: [], width: 640, height: 360, devicePixelRatio: 1, favorite: false, archived: false, trashedAt: null }
    await putAll(db, 'captures', [rec]); await putAll(db, 'blobs', [{ id, blob, mime: 'image/png', bytes: blob.size }])
    real.push(rec); blobs[id] = { id, blob, mime: 'image/png', bytes: blob.size }
  }
}
const DAY = 86400000
const projects = Array.from({ length: 5 }, (_, i) => ({ id: 'seed-project-' + i, name: 'مشروع ' + (i + 1), color: ['#2563EB', '#16A34A', '#DC2626', '#CA8A04', '#7C3AED'][i], createdAt: now - (30 - i) * DAY, updatedAt: now - i * DAY }))
const tagNames = ['واجهة', 'خطأ', 'مرجع', 'نموذج', 'تباين', 'RTL']
const kinds = ['area', 'element', 'viewport', 'full-page']
const origins = Array.from({ length: 8 }, (_, i) => 'https://site-' + i + '.example')
const cloneCaptures = [], cloneBlobs = [], tagCount = {}
for (let i = 0; i < COUNT - real.length; i++) {
  const src = real[i % real.length]
  const id = 'seed-capture-' + String(i).padStart(4, '0')
  const tags = tagNames.filter((_, t) => (i + t) % 4 === 0)
  tags.forEach((t) => (tagCount[t] = (tagCount[t] ?? 0) + 1))
  const origin = origins[i % origins.length]
  cloneCaptures.push({ ...src, id, createdAt: now - i * 3600000, origin, url: origin + '/page/' + i, title: 'لقطة ' + i + ' — ' + origin, kind: kinds[i % 4], projectId: i % 6 === 5 ? null : projects[i % 5].id, tags, favorite: i % 11 === 0, archived: i % 37 === 0, trashedAt: i % 53 === 0 ? now - DAY : null })
  const bytes = new Blob([blobs[src.id].blob, enc.encode('#' + id)], { type: blobs[src.id].mime })
  cloneBlobs.push({ id, blob: bytes, mime: blobs[src.id].mime, bytes: bytes.size })
}
await putAll(db, 'captures', cloneCaptures)
await putAll(db, 'blobs', cloneBlobs)
await putAll(db, 'projects', projects)
await putAll(db, 'tags', Object.entries(tagCount).map(([name, count]) => ({ name, count })))
const hex = (i) => '#' + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0').toUpperCase()
await putAll(db, 'colors', Array.from({ length: 60 }, (_, i) => ({ id: 'seed-color-' + i, hex: hex(i + 1), name: 'لون ' + i, note: i % 3 ? '' : 'ملاحظة ' + i, source: ['pixel', 'css', 'manual'][i % 3], projectId: i % 4 ? projects[i % 5].id : null, sourceUrl: i % 2 ? origins[i % 8] + '/' : null, createdAt: now - i * 60000 })))
await putAll(db, 'palettes', Array.from({ length: 6 }, (_, i) => ({ id: 'seed-palette-' + i, name: 'لوحة ' + i, colors: [hex(i + 1), hex(i + 2), hex(i + 3), hex(i + 4)], projectId: projects[i % 5].id, createdAt: now - i * 120000 })))
const refBlobs = ['desktop', 'tablet', 'phone'].map((vp, i) => { const src = real[i % real.length]; const b = new Blob([blobs[src.id].blob, enc.encode('#ref-' + vp)], { type: blobs[src.id].mime }); return { id: 'seed-refblob-' + vp, blob: b, mime: blobs[src.id].mime, bytes: b.size } })
await putAll(db, 'blobs', refBlobs)
const zone = { id: 'z1', label: 'الوقت', createdAt: now, anchor: { kind: 'rect', rect: { x: 10, y: 20, width: 120, height: 40 } } }
await putAll(db, 'references', ['desktop', 'tablet', 'phone'].map((vp, i) => ({ id: 'seed-ref-' + vp, projectId: projects[i].id, origin: origins[i], path: '/', viewport: vp, blobId: 'seed-refblob-' + vp, createdAt: now - i * 1000, ...(db.version >= 4 ? { exclusions: i === 0 ? [zone] : [] } : {}) })))
await putAll(db, 'annotations', Array.from({ length: 20 }, (_, i) => ({ captureId: cloneCaptures[i].id, scene: { objects: [{ type: 'rect', x: i, y: i, w: 40, h: 30 }], note: 'تعليق ' + i }, updatedAt: now - i * 1000, schemaVersion: 1, redaction: { total: i % 3, irreversible: i % 2 } })))
await putAll(db, 'guides', Array.from({ length: 3 }, (_, i) => ({ id: 'seed-guide-' + i, title: 'دليل ' + i, projectId: projects[i].id, captureIds: cloneCaptures.slice(i * 4, i * 4 + 4).map((c) => c.id), createdAt: now - i * 5000, ...(db.version >= 5 ? { stepText: Object.fromEntries(cloneCaptures.slice(i * 4, i * 4 + 4).map((c, k) => [c.id, { text: 'خطوة ' + k }])), updatedAt: now - i * 4000 } : {}) })))
// المصغَّرات: تُولَّد من بايتات حقيقية بالمتصفّح نفسه.
const thumbs = []
for (const c of cloneCaptures.slice(0, 30)) {
  const bmp = await createImageBitmap(blobs[real[0].id].blob)
  const cv = new OffscreenCanvas(160, 90); cv.getContext('2d').drawImage(bmp, 0, 0, 160, 90)
  thumbs.push({ id: c.id, blob: await cv.convertToBlob({ type: 'image/webp' }), width: 160, height: 90 })
}
await putAll(db, 'thumbnails', thumbs)
db.close()
// الإعدادات عبر الخلفية كما يفعل المستخدم، ثمّ قفل المكتبة بالاشتقاق نفسه الذي في modules/privacy/kdf.ts.
const patched = await chrome.runtime.sendMessage({ __rasd: 1, type: 'settings/patch', payload: { patch: { appearance: { theme: 'dark', density: 'compact' } } }, id: 'upgrade#settings' })
if (!patched?.ok) throw new Error('settings/patch: ' + JSON.stringify(patched))
const salt = crypto.getRandomValues(new Uint8Array(16))
const iterations = 600000
const material = await crypto.subtle.importKey('raw', enc.encode(${JSON.stringify(pin)}.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
const verifier = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256))
const b64 = (u) => btoa(String.fromCharCode(...u))
await chrome.storage.local.set({ 'rasd:lock': { v: 1, salt: b64(salt), iterations, verifier: b64(verifier) } })
return JSON.stringify({ captures: real.length + cloneCaptures.length, real: realBefore })
})()`

// ── التشغيل ──────────────────────────────────────────────────────
const work = realpathSync(mkdtempSync(join(tmpdir(), `rasd-upgrade-${name ?? 'chromium'}-`)))
const EXT = join(work, 'ext') // مجلّد ثابت ⇐ معرّف ثابت
const PROFILE = join(work, 'profile')
mkdirSync(PROFILE)
const line = (mark, text) => console.log(`  ${mark} ${text}`)
let failures = 0
const fail = (text) => {
  failures++
  line('✗', text)
}
const GECKO_ID = FF
  ? JSON.parse(readFileSync(join(NEW, 'manifest.json'), 'utf8')).browser_specific_settings?.gecko
      ?.id
  : null

/**
 * يجهّز مجلّد الإضافة الثابت من بناءٍ مفكوك. `bump`: النسخة التي يجب أن يعلوها البناء — **الترقية الحقيقية تغيّر رقم النسخة
 * دائمًا** (المتاجر تشترط ذلك)، فالحزام يرفعه إن تساوى.
 *
 * في Firefox: لا بناء Firefox سابقًا لرصد قطّ، فالبناء القديم هو بناء Chromium القديم بأقلّ تعديلات البيان التي يطلبها
 * Firefox (`background.scripts` مكان `service_worker`، ومعرّف gecko، وبلا `incognito: "split"`) — الشيفرة نفسها لا نسخةٌ
 * مكتوبة لهذا الحزام.
 */
function stageBuild(from, bump = null) {
  rmSync(EXT, { recursive: true, force: true })
  cpSync(from, EXT, { recursive: true })
  const file = join(EXT, 'manifest.json')
  const m = JSON.parse(readFileSync(file, 'utf8'))
  m.host_permissions = ['<all_urls>']
  // يبقى مطلوبًا ما يغطّيه <all_urls> فيصير الاختياري منه «زائدًا» ويُسجَّل خطأ بيان من أثر الحزام لا من المنتَج.
  delete m.optional_host_permissions
  if (m.optional_permissions)
    m.optional_permissions = m.optional_permissions.filter(
      (p) => !p.includes('://') && p !== '<all_urls>',
    )
  if (FF && m.background?.service_worker) {
    m.background = { scripts: [m.background.service_worker], type: 'module' }
    m.browser_specific_settings = { gecko: { id: GECKO_ID, strict_min_version: '140.0' } }
    delete m.incognito
    m.permissions = (m.permissions ?? []).filter((p) => !['offscreen', 'sidePanel'].includes(p))
  }
  if (bump && m.version === bump) {
    const [a, b, c] = m.version.split('.').map(Number)
    m.version = `${a}.${b}.${(c || 0) + 1}`
  }
  writeFileSync(file, JSON.stringify(m, null, 2))
  return m.version
}

const timed = (what, p, ms = 30_000) =>
  Promise.race([
    p,
    sleep(ms).then(() => Promise.reject(new Error(`مهلة ${ms / 1000}ث في «${what}»`))),
  ])

// ── محرّك Chromium (CDP) ─────────────────────────────────────────
async function chromiumSession(label, body) {
  const proc = spawn(
    BIN,
    [
      ...BASE_CHROME_FLAGS,
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--window-size=1366,768',
      '--lang=ar',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  proc.stderr.on('data', (d) => (stderr += d.toString()))
  proc.stdout.on('data', () => undefined)
  const exited = new Promise((r) => proc.on('exit', r))
  let conn = null
  try {
    conn = await connectCdp(PORT)
    if (!conn)
      throw new Error(`تعذّر الاتصال بـDevTools.\n${stderr.split('\n').slice(-6).join('\n')}`)
    const { send } = conn
    const version = await send('Browser.getVersion')
    line('·', `${label}: ${version.product}`)
    const loaded = await timed('التحميل', loadExtension(send, EXT))
    if (loaded.error) throw new Error(`رفض التحميل: ${loaded.error}`)
    await sleep(2000)
    const ctx = {
      id: loaded.id,
      base: `chrome-extension://${loaded.id}/`,
      async open(url, wait = 2500) {
        const { targetId } = await timed('إنشاء التبويب', send('Target.createTarget', { url }))
        await sleep(wait)
        const { sessionId } = await timed(
          'الارتباط',
          send('Target.attachToTarget', { targetId, flatten: true }),
        )
        return { targetId, sessionId }
      },
      async evaluate(page, expression, ms = 60_000) {
        const r = await timed(
          'التقييم',
          send(
            'Runtime.evaluate',
            { expression, awaitPromise: true, returnByValue: true },
            page.sessionId,
          ),
          ms,
        )
        if (r.exceptionDetails)
          throw new Error(
            r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text,
          )
        return r.result.value
      },
      activate: (page) => send('Target.activateTarget', { targetId: page.targetId }),
      close: (page) => send('Target.closeTarget', { targetId: page.targetId }),
      async health() {
        const ext = await ctx.open('chrome://extensions/', 2500)
        const info = JSON.parse(
          await ctx.evaluate(
            ext,
            `chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }).then(() => chrome.developerPrivate.getExtensionInfo(${JSON.stringify(loaded.id)})).then((x) => JSON.stringify({ warnings: x.installWarnings.map((w) => w.message ?? String(w)).concat(x.manifestErrors.map((e) => e.message.slice(0, 200))), errors: x.runtimeErrors.filter((e) => e.severity === 'ERROR').map((e) => e.message.slice(0, 160)) }))`,
          ),
        )
        await ctx.close(ext)
        return info
      },
      async uninstall() {
        await send('Extensions.uninstall', { id: loaded.id })
        await sleep(1500)
      },
    }
    return await body(ctx)
  } finally {
    try {
      await Promise.race([sleep(2000), conn?.send('Browser.close')])
    } catch {
      /* أُغلق */
    }
    const t = await Promise.race([exited.then(() => 'exit'), sleep(10_000).then(() => 'timeout')])
    if (t === 'timeout') proc.kill('SIGKILL')
    await exited
    await sleep(500)
  }
}

// ── محرّك Firefox (WebDriver BiDi) ───────────────────────────────
async function firefoxSession(label, body) {
  const downloads = join(work, 'downloads')
  mkdirSync(downloads, { recursive: true })
  writeFileSync(
    join(PROFILE, 'user.js'),
    Object.entries({ ...basePrefs({ geckoId: GECKO_ID, downloads }) })
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n') + '\n',
  )
  const proc = spawn(
    BIN,
    [
      '--headless',
      '--no-remote',
      '--profile',
      PROFILE,
      '--remote-debugging-port',
      String(PORT),
      '-remote-allow-system-access',
      '--width=1366',
      '--height=768',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  const stdout = []
  proc.stderr.on('data', (d) => (stderr = (stderr + d).slice(-64 * 1024)))
  proc.stdout.on('data', (d) => stdout.push(...String(d).split('\n')))
  const exited = new Promise((r) => proc.on('exit', r))
  let conn = null
  try {
    conn = await connectBidi(PORT, { ready: () => stderr.includes('WebDriver BiDi listening') })
    if (!conn) throw new Error(`تعذّر الاتصال بـBiDi.\n${stderr.split('\n').slice(-6).join('\n')}`)
    const { send } = conn
    const inChrome = async (expression, ms) =>
      evaluator(send, await conn.chromeContext())(expression, ms)
    const product = await inChrome(`Services.appinfo.name + ' ' + Services.appinfo.version`)
    line('·', `${label}: ${product}`)
    const installed = await installExtension(send, EXT)
    if (installed.error) throw new Error(`Firefox رفض الحزمة: ${installed.error}`)
    await sleep(2500)
    const ctx = {
      id: EXT_BASE.split('/')[2],
      base: EXT_BASE,
      async open(url, wait = 2500) {
        if (url.startsWith('moz-extension://')) {
          await inChrome(
            `(() => { const tab = gBrowser.addTab(${JSON.stringify(url)}, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); gBrowser.selectedTab = tab; return true })()`,
          )
          const hit = await findContext(send, (c) => c.url === url, { tries: 80 })
          if (!hit) throw new Error('لم يُفتح ' + url)
          await sleep(wait)
          return { context: hit.context }
        }
        const { context } = await send('browsingContext.create', { type: 'tab' })
        await send('browsingContext.navigate', { context, url, wait: 'complete' }, 30_000)
        await sleep(wait)
        return { context }
      },
      evaluate: (page, expression, ms = 60_000) => evaluator(send, page.context)(expression, ms),
      // صفحة الإضافة المفتوحة بصلاحية النظام هي المحدَّدة أصلًا، و`browsingContext.activate` يرفض سياقًا مميَّزًا (قِيس).
      activate: (page) =>
        send('browsingContext.activate', { context: page.context }).catch(() => undefined),
      close: (page) =>
        send('browsingContext.close', { context: page.context }).catch(() => undefined),
      async health() {
        const r = await extensionConsole(inChrome, stdout, installed.id)
        // سطرٌ واحد من Firefox نفسه يُفرَد ولا يُخفى: إغلاق تبويبٍ فيه طبقةٌ حيّة يقطع نداء `mode/report` الذي يرسله `pagehide`
        // (`src/content/page-report.ts`) فيطبع Firefox «Promise rejected after context unloaded» في طرفية المتصفّح — لا يراه
        // المستخدم، ولا يُتجنَّب إلا بنقل التبليغ إلى الخلفية (مؤجَّل: Docs/Release/acceptance.md).
        const benign = r.errors.filter((e) =>
          /^Promise rejected after context unloaded: Actor 'Conduits' destroyed before query 'RuntimeMessage'/u.test(
            e,
          ),
        )
        if (benign.length)
          line(
            '·',
            `طرفية Firefox: ${benign.length} سطرًا «Promise rejected after context unloaded» عند إغلاق تبويبٍ فيه طبقة — مسجَّل لا عطل`,
          )
        return { warnings: r.manifestWarnings, errors: r.errors.filter((e) => !benign.includes(e)) }
      },
      async uninstall() {
        await send('webExtension.uninstall', { extension: installed.id })
        await sleep(1500)
      },
    }
    return await body(ctx)
  } finally {
    try {
      await conn?.send('browser.close', {}, 5000)
    } catch {
      /* أُغلق */
    }
    conn?.close()
    const t = await Promise.race([exited.then(() => 'exit'), sleep(15_000).then(() => 'timeout')])
    if (t === 'timeout') proc.kill('SIGKILL')
    await exited
    await sleep(500)
  }
}

const session = FF ? firefoxSession : chromiumSession

/**
 * التقاطٌ حقيقي كما تفعل النافذة: التبويب يُنشأ من صفحة الإضافة (`tabs.create` كما تفعل رصد وكما تفعل حرّاس Firefox)، ثمّ
 * `tool/activate`. ظهور التبويب في Chromium بلا رأس وفي Firefox يمرّ من الواجهة نفسها فلا فرع لكل محرّك.
 */
async function realCapture(ctx, popup, pageUrl, tool, nth) {
  const tabId = await ctx.evaluate(
    popup,
    `chrome.tabs.create({ url: '${pageUrl}', active: true }).then((t) => new Promise((res) => { const check = () => chrome.tabs.get(t.id).then((x) => (x.status === 'complete' ? res(t.id) : setTimeout(check, 100)), () => res(null)); check() }))`,
  )
  if (tabId == null) throw new Error('لم يُفتح تبويب ' + pageUrl)
  await sleep(1500)
  await ctx.evaluate(popup, `chrome.tabs.update(${tabId}, { active: true }).then(() => true)`)
  await sleep(500)
  const r = await ctx.evaluate(
    popup,
    `chrome.runtime.sendMessage({ __rasd: 1, type: 'tool/activate', payload: { tool: '${tool}', tabId: ${tabId} }, id: 'upgrade#cap${nth}' }).then((r) => JSON.stringify(r))`,
    40_000,
  )
  await sleep(tool === 'full-page' ? 9000 : 3500)
  await ctx.evaluate(popup, `chrome.tabs.remove(${tabId}).then(() => true)`).catch(() => undefined)
  return r
}

try {
  console.log(`\nحزام الترقية — ${name ?? 'chromium'} · القديم ${OLD} · الجديد ${NEW}`)
  const oldVersion = stageBuild(OLD)
  let census0 = null
  let extId = null

  // ── الجلسة 1: البناء القديم وبياناته ──
  await session('الجلسة 1 (القديم)', async (ctx) => {
    extId = ctx.id
    const popup = await ctx.open(`${ctx.base}src/pages/popup/index.html`)
    line('✓', `البناء القديم ${oldVersion} يُحمَّل بمعرّف ${ctx.id}`)
    let ok = 0
    for (let i = 0; i < PAGES.length; i++) {
      const r = await realCapture(ctx, popup, PAGES[i], 'viewport', i)
        .then((x) => JSON.parse(x))
        .catch((e) => ({ ok: false, error: e.message }))
      if (r?.ok) ok++
      else line('·', `التقاط ${i}: ${JSON.stringify(r).slice(0, 160)}`)
    }
    const full = await realCapture(ctx, popup, PAGES[0], 'full-page', 99)
      .then((x) => JSON.parse(x))
      .catch(() => null)
    if (full?.ok) ok++
    line(
      ok >= 5 ? '✓' : '·',
      ok >= 5
        ? `${ok} لقطات حقيقية بالبناء القديم`
        : `التقاطات حقيقية ناجحة ${ok} — يُكمَل بـPNG يولّده المتصفّح نفسه`,
    )
    const seeded = JSON.parse(await ctx.evaluate(popup, SEED(COUNT, PIN), 180_000))
    line(
      '✓',
      `المكتبة كُبّرت إلى ${seeded.captures} لقطة (${seeded.real} التقطها البناء القديم)، وفُعّل القفل والإعداد`,
    )
    census0 = JSON.parse(await ctx.evaluate(popup, CENSUS, 180_000))
    line(
      '✓',
      `تعداد القديم: قاعدة v${census0.version} · ${Object.entries(census0.stores)
        .filter(([, s]) => s.count)
        .map(([n, s]) => `${n} ${s.count}`)
        .join(' · ')}`,
    )
  })
  writeFileSync(join(work, 'census-old.json'), JSON.stringify(census0))

  // استبدالُ مجلّدٍ غير مضغوط في مكانه يترك سجلّ عامل الخدمة ونصوصه المخبَّأة في ملفّ Chromium، فيعمل العامل القديم مع صفحاتٍ جديدة
  // (قِيس: «The requested version (5) is less than the existing version (6)»). تحديث المتجر يعيد تسجيل العامل بالنسخة الجديدة،
  // فالحزام يمسح مجلّد `Service Worker` وحده — لا IndexedDB ولا التخزين. يُثبَت تحديثٌ مضغوطٌ حقيقي بعد أوّل نشر (SS10).
  const newVersion = stageBuild(NEW, oldVersion)
  line('·', `استُبدل المجلّد بالبناء الجديد ${newVersion}`)
  if (!FF) rmSync(join(PROFILE, 'Default', 'Service Worker'), { recursive: true, force: true })

  // ── الجلسة 2: الترقية ──
  await session('الجلسة 2 (الجديد)', async (ctx) => {
    if (ctx.id !== extId) fail(`المعرّف تغيّر: ${extId} ← ${ctx.id}`)
    else line('✓', 'المعرّف نفسه ⇐ التخزين نفسه')
    const lib = await ctx.open(`${ctx.base}src/pages/library/index.html`, 4000)
    // 1) الصفحة تطلب الرمز.
    const locked = await ctx.evaluate(
      lib,
      `!!document.querySelector('#lock-code') || document.body.innerText.includes('المكتبة مقفلة')`,
    )
    if (locked) line('✓', 'المكتبة بعد الترقية مقفلة وتطلب الرمز (القفل بقي)')
    else fail('المكتبة بعد الترقية لم تطلب الرمز')
    // 2) فتحها من الواجهة: يكتب الرمز في الحقل كما يفعل المحرّك ثمّ ينقر «افتح».
    await ctx.activate(lib)
    await ctx.evaluate(
      lib,
      `(() => { const el = document.querySelector('#lock-code'); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(PIN)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
    )
    await sleep(300)
    await ctx.evaluate(
      lib,
      `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'افتح')?.click()`,
    )
    await sleep(3500)
    const open = await ctx.evaluate(lib, `!document.querySelector('#lock-code')`)
    if (open) line('✓', 'الرمز يفتح المكتبة من الواجهة')
    else fail('الرمز لم يفتح المكتبة')
    const header = await ctx.evaluate(
      lib,
      `(document.body.innerText.match(/[\\d٠-٩]+\\s*(لقطة|لقطات)[^\\n]*/u) ?? [''])[0]`,
    )
    // ما تعدّه الواجهة هو الحيّ فقط (لا المؤرشف ولا المحذوف إلى المهملات) — يُحسب من تعداد القديم لا من رقمٍ مكتوب هنا.
    const live = Object.values(census0.stores.captures.rows).filter(
      (c) => !c.archived && c.trashedAt == null,
    ).length
    const shown = Number(
      header.match(/[\d٠-٩]+/u)?.[0].replace(/[٠-٩]/gu, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)),
    )
    if (shown === live) line('✓', `المكتبة تعرض ${live} لقطة حيّة — كما في بيانات القديم تمامًا`)
    else fail(`المكتبة تعرض «${header}» والحيّ في بيانات القديم ${live}`)

    // 3) التعداد الجديد يُقارَن بالقديم.
    const popup = await ctx.open(`${ctx.base}src/pages/popup/index.html`)
    // السالب: يُفسد الحزام بيانات المكتبة بعد الترقية ليثبت أن المقارنة تسقط — سجلٌّ يُحذف وبايتٌ يتغيّر وحقلٌ يتبدّل.
    if (SABOTAGE)
      await ctx.evaluate(
        popup,
        `(async () => {
        ${IDB}
        const db = await idb()
        const tx = db.transaction(['captures', 'blobs', 'projects'], 'readwrite')
        tx.objectStore('captures').delete('seed-capture-0003')
        const b = await new Promise((res) => { const q = tx.objectStore('blobs').get('seed-capture-0004'); q.onsuccess = () => res(q.result) })
        tx.objectStore('blobs').put({ ...b, blob: new Blob([b.blob, 'x'], { type: b.mime }) })
        const p = await new Promise((res) => { const q = tx.objectStore('projects').get('seed-project-1'); q.onsuccess = () => res(q.result) })
        tx.objectStore('projects').put({ ...p, name: 'تغيّر' })
        await new Promise((res) => { tx.oncomplete = res })
        db.close()
        return true
      })()`,
      )
    const census1 = JSON.parse(await ctx.evaluate(popup, CENSUS, 180_000))
    writeFileSync(join(work, 'census-new.json'), JSON.stringify(census1))
    line('·', `القاعدة بعد الترقية: v${census1.version} (كانت v${census0.version})`)
    const subset = (a, b, path) => {
      if (a && typeof a === 'object' && !Array.isArray(a)) {
        if (!b || typeof b !== 'object') return [path]
        return Object.keys(a).flatMap((k) => subset(a[k], b[k], `${path}.${k}`))
      }
      if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return [path]
        return a.flatMap((x, i) => subset(x, b[i], `${path}[${i}]`))
      }
      return a === b ? [] : [path]
    }
    const before = failures
    let rowsChecked = 0
    for (const [store, old] of Object.entries(census0.stores)) {
      const now = census1.stores[store]
      if (!now) {
        fail(`المخزن ${store} اختفى`)
        continue
      }
      // المصغَّرات مخزن مخبَّأ يُولَّد كسولًا عند أوّل عرض لبطاقة — يزيد ولا ينقص، وكل سجلّ قديم يبقى.
      if (store === 'thumbnails' ? now.count < old.count : now.count !== old.count) {
        fail(`${store}: ${old.count} ← ${now.count}`)
        continue
      }
      const diffs = Object.entries(old.rows).flatMap(([k, row]) =>
        now.rows[k] ? subset(row, now.rows[k], `${store}[${k}]`) : [`${store}[${k}] مفقود`],
      )
      rowsChecked += old.count
      if (diffs.length) fail(`${store}: ${diffs.length} فرقًا، أوّلها ${diffs[0]}`)
    }
    if (failures === before)
      line('✓', `كل مخزن قديم محفوظ سجلًّا سجلًّا وبايتًا ببايت — ${rowsChecked} سجلًّا`)
    // ما تضيفه الخطوات من حقولٍ يجب أن يصل سجلّاتٍ قديمة بقيمٍ آمنة (الخطوتان 4 و5).
    if (
      census0.version < 4 &&
      Object.values(census1.stores.references.rows).some((r) => !Array.isArray(r.exclusions))
    )
      fail('references بلا exclusions بعد الخطوة 4')
    if (
      census0.version < 5 &&
      Object.values(census1.stores.guides.rows).some(
        (g) => typeof g.stepText !== 'object' || typeof g.updatedAt !== 'number',
      )
    )
      fail('guides بلا stepText/updatedAt بعد الخطوة 5')
    const added = Object.keys(census1.stores).filter((s) => !(s in census0.stores))
    if (added.length) line('·', `مخازن أُضيفت بالترقية: ${added.join(' · ')}`)
    const lockBefore = JSON.stringify(census0.local['rasd:lock'])
    if (lockBefore && JSON.stringify(census1.local['rasd:lock']) === lockBefore)
      line('✓', 'سجلّ القفل في التخزين لم يتغيّر')
    else fail('سجلّ القفل تغيّر أو ضاع')

    // 4) الإعدادات.
    const settings = await ctx.evaluate(
      popup,
      `chrome.runtime.sendMessage({ __rasd: 1, type: 'settings/get', payload: undefined, id: 'upgrade#get' }).then((r) => JSON.stringify(r))`,
    )
    const a = JSON.parse(settings)?.value?.appearance
    if (a?.theme === 'dark' && a?.density === 'compact')
      line('✓', 'الإعدادات بقيت: المظهر داكن والكثافة مدمجة')
    else fail(`الإعدادات لم تبقَ: ${settings.slice(0, 200)}`)

    // 5) الالتقاط الحقيقي بعد الترقية يعمل ويزيد المكتبة لقطة.
    const count = census1.stores.captures.count
    const r = await realCapture(ctx, popup, PAGES[1], 'viewport', 200)
      .then((x) => JSON.parse(x))
      .catch((e) => ({ ok: false, error: e.message }))
    if (!r?.ok) line('·', `رد التقاط ما بعد الترقية: ${JSON.stringify(r).slice(0, 200)}`)
    await sleep(2500)
    const census2 = JSON.parse(await ctx.evaluate(popup, CENSUS, 180_000))
    if (census2.stores.captures.count === count + 1)
      line('✓', `التقاطٌ حقيقي بعد الترقية يزيد المكتبة لقطة (${count} ← ${count + 1})`)
    else fail(`الالتقاط بعد الترقية: ${count} ← ${census2.stores.captures.count}`)

    // 6) لا تحذير ولا خطأ من الإضافة بعد كل ما سبق.
    const health = await ctx.health()
    if (health.warnings.length || health.errors.length)
      fail(`بعد الترقية: ${JSON.stringify(health).slice(0, 400)}`)
    else line('✓', 'بعد الترقية: صفر تحذير بيان/تثبيت وصفر خطأ تشغيل')

    if (UNINSTALL) {
      try {
        await ctx.uninstall()
        line('·', 'أُرسلت إزالة الإضافة')
      } catch (e) {
        fail(`الإزالة: ${e.message}`)
      }
    }
  })

  // ── بعد إغلاق الجلسة: ما بقي من الإضافة في الملفّ ──
  if (UNINSTALL) {
    await sleep(1000)
    const idbDir = FF ? join(PROFILE, 'storage', 'default') : join(PROFILE, 'Default', 'IndexedDB')
    const left = existsSync(idbDir)
      ? readdirSync(idbDir).filter((d) => d.includes(FF ? extId : extId))
      : []
    if (left.length === 0) line('✓', 'إلغاء التثبيت: لا بقيّة لتخزين الإضافة في ملفّ التعريف')
    else fail(`إلغاء التثبيت: بقي ${left.join(', ')}`)
    if (!FF) {
      const les = join(PROFILE, 'Default', 'Local Extension Settings')
      const stale = existsSync(les) ? readdirSync(les).filter((d) => d === extId) : []
      if (stale.length === 0) line('✓', 'إلغاء التثبيت: Local Extension Settings خالٍ من الإضافة')
      else fail('إلغاء التثبيت: بقي Local Extension Settings')
    }
  }
} catch (e) {
  fail(e.message.split('\n')[0])
} finally {
  server.close()
  console.log(
    `\n${failures ? `✗ ${failures} إخفاق` : '✓ الترقية تحفظ المكتبة والإعدادات والقفل'}\n(الملفّات في ${work})`,
  )
  if (!args.includes('--keep') && !failures) {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* لا يهمّ */
    }
  }
  process.exit(failures ? 1 : 0)
}
