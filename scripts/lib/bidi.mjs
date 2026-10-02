/**
 * نواة حرّاس Firefox — **WebDriver BiDi مباشرةً، بلا geckodriver ولا اعتمادية** (SS7، `Docs/Browsers/Architecture.md` §4.9).
 *
 * نُقلت من `scripts/firefox-probe.mjs` (المسبار الذي قاس أين تقف رصد في Firefox) وصارت على عقد
 * `scripts/lib/cdp.mjs` قدر ما يسمح البروتوكول: `startGuard` يجهّز البيئة ويعيدها، و**لا يملك حكمًا
 * واحدًا** — كل `ok` و`fail` في ملفّ حارسه تحت `scripts/firefox/`. ونواتان لا تمسّ إحداهما الأخرى:
 * لا تستورد هذه من `cdp.mjs` شيئًا، فلا يغيّر عملٌ هنا بصمة حارس كروم واحد.
 *
 * **ما قيس في Firefox 157 وصار هنا** (`Docs/Firefox/firefox_rasd.md` «كيف قِيس»، وجولات SS7):
 *
 * - التقييم في صفحات `moz-extension://` يطلب علم الإقلاع `-remote-allow-system-access`.
 * - BiDi يرفض التنقّل إلى `moz-extension://`، و`input.performActions` و`captureScreenshot` لا يعملان في سياقٍ
 *   مميَّز («privileged scope»): **صفحات الإضافة تُقرأ نصًّا وتُنقر بـ`click()`**، والطبقة فوق الموقع تُلتقط صورًا
 *   وتُنقر بمؤشّرٍ حقيقي.
 * - معرّف المضيف (`moz-extension://<UUID>/`) عشوائي لكل تثبيت، ويُثبَّت قبله بتفضيل `extensions.webextensions.uuids`.
 * - **صفحة الفحص** (`__rasd-harness.html`): صفحةٌ فارغة تُضاف إلى نسخة الفحص وحدها وتُفتح من سياق المتصفّح
 *   (`moz:scope: chrome` ثمّ `gBrowser.addTab`) — فيُنادى `chrome.*` بصلاحيات الإضافة نفسها **بلا اعتمادٍ على
 *   صفحةٍ من المنتج** ولا على خلفيةٍ حيّة. هي نظير العامل الذي ترتبط به حرّاس كروم: من خلفيةٍ مخرَّبة تبقى
 *   الصفحة تعمل، فيسقط الحارس على حكمه لا على تعذّر الفحص.
 * - **أخطاء الإضافة لا يراها `log.entryAdded`** في سياقٍ مميَّز (قِيس: صفر حدث لـ`console.error` في صفحة إضافة).
 *   فتُقرأ من مصدرين: خدمة الطرفية في المتصفّح (`Services.console` — الاستثناءات والرفض غير الملتقَط، بمصدرها
 *   `moz-extension://<UUID>/…`، ومنها `content.js` في صفحات المواقع)، ونداءات `console.error` من الخَرْج القياسي
 *   (`devtools.console.stdout.content`) — نظير `developerPrivate.runtimeErrors` في كروم.
 * - **BiDi `network.*` لا يرى طلبات الإضافة** (قِيس: `fetch` من صفحة إضافة ومن الخلفية بلا حدث، وطلب التبويب
 *   بحدثه). فمراقبة الشبكة شاهدان: `network.*` لسياقات المواقع، ومراقِب `http-on-opening-request` في المتصفّح لكل
 *   طلب — `watchRequests` أدناه، نظير NetLog في `verify:network`.
 *
 * **بصمة الحارس تشمل النواة.** على قاعدة ADR 0042: سجلّ ترقية حرّاس Firefox (`scripts/firefox-ledger.mjs`)
 * يحسب بصمة كل حارس من ملفّه وما يستورده من `scripts/` — فتعديلٌ هنا يبدأ سلاسلها كلّها من الصفر.
 *
 * **التخريب المقصود — لإثبات السالب.** `RASD_GUARD_SABOTAGE=service-worker-loader.js,content.js` كما في كروم:
 * الملفّات المسمّاة في نسخة الفحص تصير سطرًا يرمي، والحزمة المبنيّة لا تُمسّ، والتقرير يعلن التخريب سطرًا أوّل.
 *
 * **المنافذ خاصّة:** BiDi لكل حارس في 9231–9243، وخادم العيّنات على 5420 (والأصل الثاني 5421)، وقفل المنسّق
 * 9228 — لا شيء منها من منافذ حرّاس كروم (9333–9399 و5399 و5413)، فتجري الطائفتان معًا بلا تصادم.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './live-fixtures.mjs'
import { lintProblems } from './release-pack.mjs'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const DIST = join(ROOT, 'dist-firefox')

/** خادم العيّنات لحرّاس Firefox — منفذه غير منفذ كروم (5399) كي تجري الطائفتان معًا. */
export const FIXTURES_PORT = Number(process.env.RASD_FIREFOX_FIXTURES_PORT ?? 5420)
export const FIXTURES_BASE = `http://127.0.0.1:${FIXTURES_PORT}`

/** معرّف المضيف الثابت — `moz-extension://<UUID>/` معروفٌ قبل التثبيت. */
export const EXT_UUID = '7a5d0c1e-2b3f-4c8d-9e0f-5a6b7c8d9e0f'
export const EXT_BASE = `moz-extension://${EXT_UUID}/`

/** صفحة الفحص في نسخة الفحص وحدها — انظر الترويسة. */
export const HARNESS = '__rasd-harness.html'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Firefox ──────────────────────────────────────────────────────

export const FIREFOX_CANDIDATES = [
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
  '/usr/bin/firefox',
  '/usr/local/bin/firefox',
]

/** `FIREFOX_PATH` أوّلًا، ثمّ أوّل مرشَّح موجود — أو `null`. */
export function findFirefox(env = process.env) {
  return env.FIREFOX_PATH ?? FIREFOX_CANDIDATES.find((p) => existsSync(p)) ?? null
}

/**
 * التفضيلات المشتركة. والوكيل البعيد يضيف «تفضيلاته الموصى بها» للأتمتة (`remote.prefs.recommended`): لا
 * تحديثات ولا قياسات ولا صفحة ترحيب — فما يبقى هنا ما يخصّ رصد.
 */
export function basePrefs({ geckoId, downloads }) {
  return {
    'extensions.webextensions.uuids': JSON.stringify({ [geckoId]: EXT_UUID }),
    // نداءات `console.*` من سياقات المحتوى (صفحات الإضافة وخلفيتها والمواقع) إلى الخَرْج القياسي.
    'devtools.console.stdout.content': true,
    // التنزيلات إلى مجلّدٍ مؤقّت لا إلى مجلّد المستخدم، بلا نافذة سؤال.
    'browser.download.folderList': 2,
    'browser.download.dir': downloads,
    'browser.download.useDownloadDir': true,
    'browser.download.always_ask_before_handling_new_types': false,
    'browser.download.alwaysOpenPanel': false,
    'browser.startup.page': 0,
    'browser.shell.checkDefaultBrowser': false,
  }
}

/** هل يُصغي شيءٌ على المنفذ الآن؟ */
export function portBusy(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/**
 * يقلع Firefox بملفّ تعريفٍ مؤقّت على منفذ BiDi ثابت.
 * @returns {{ proc: import('node:child_process').ChildProcess, profile: string, stderr: () => string, stdout: () => string[] }}
 */
export function launchFirefox({ firefox, port, prefix, prefs = {}, width = 1280, height = 800 }) {
  const profile = mkdtempSync(join(tmpdir(), `rasd-ff-${prefix}-`))
  writeFileSync(
    join(profile, 'user.js'),
    Object.entries(prefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n') + '\n',
  )
  const proc = spawn(
    firefox,
    [
      ...(process.env.RASD_FIREFOX_HEADFUL ? [] : ['--headless']),
      '--no-remote',
      '--profile',
      profile,
      '--remote-debugging-port',
      String(port),
      // التقييم في صفحات `moz-extension://` وسياق المتصفّح يطلبه (قِيس: «System access is required»).
      '-remote-allow-system-access',
      // `--window-size` لا يعرفه Firefox (قِيس: «unrecognized command line flag»).
      `--width=${width}`,
      `--height=${height}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  const stdout = []
  let partial = ''
  proc.stderr.on('data', (d) => (stderr = (stderr + d).slice(-64 * 1024)))
  proc.stdout.on('data', (d) => {
    const text = partial + d
    const parts = text.split('\n')
    partial = parts.pop()
    stdout.push(...parts)
    if (stdout.length > 5000) stdout.splice(0, stdout.length - 5000)
  })
  return { proc, profile, stderr: () => stderr, stdout: () => stdout }
}

// ── WebDriver BiDi ───────────────────────────────────────────────

/**
 * يتّصل بجلسة BiDi جديدة. **مُوزِّعٌ واحد ومهلةٌ لكل نداء**: المقبس إن أُغلق رفض الوعود المعلَّقة كلّها،
 * ونداءٌ لا يعود يصير خطأً باسم أمره — لا وعدًا معلَّقًا إلى الأبد (درس `cdp.mjs`، الصفّ 97).
 *
 * @param {number} port
 * @param {{ waitMs?: number, ready?: () => boolean }} [o] `ready` يقول إن Firefox أعلن الإصغاء.
 * @returns {Promise<null | { send: Function, onEvent: Function, chromeContext: () => Promise<string>, close: () => void }>}
 */
export async function connectBidi(port, { waitMs = 60_000, ready = () => true } = {}) {
  const deadline = Date.now() + waitMs
  let ws = null
  while (!ws && Date.now() < deadline) {
    await sleep(250)
    if (!ready()) continue
    try {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/session`)
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
      ws = socket
    } catch {
      /* لم يجهز بعد */
    }
  }
  if (!ws) return null

  const pending = new Map()
  const listeners = new Set()
  let nextId = 1
  let closed = false
  ws.addEventListener('message', (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.type === 'error'
        ? reject(new Error(`${msg.error}: ${String(msg.message ?? '').split('\n')[0]}`))
        : resolve(msg.result)
      return
    }
    if (msg.type === 'event') for (const fn of listeners) fn(msg)
  })
  ws.addEventListener('close', () => {
    closed = true
    for (const { reject } of pending.values()) reject(new Error('أُغلق مقبس BiDi'))
    pending.clear()
  })

  const send = (method, params = {}, ms = 30_000) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error('أُغلق مقبس BiDi'))
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`مهلة ${ms / 1000} ثانية في ${method}`))
      }, ms)
      pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const onEvent = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  await send('session.new', { capabilities: {} })

  /** سياق نافذة المتصفّح نفسها (`browser.xhtml`) — `Services` ومراقِبات الشبكة وفتح التبويبات. */
  let chromeCtx = null
  const chromeContext = async () => {
    if (chromeCtx) return chromeCtx
    const { contexts } = await send('browsingContext.getTree', { 'moz:scope': 'chrome' })
    chromeCtx = contexts.find((c) => c.url.startsWith('chrome://browser/'))?.context ?? null
    if (!chromeCtx)
      throw new Error('لا سياق لنافذة المتصفّح — هل أُقلع بـ-remote-allow-system-access؟')
    return chromeCtx
  }

  const close = () => {
    try {
      ws.close()
    } catch {
      /* أُغلق */
    }
  }
  return { send, onEvent, chromeContext, close }
}

/**
 * مُقيِّمٌ في سياق: يعيد القيمة البدائية (والنصّ JSON يُفكّ عند الطلب)، ويرمي بأوّل سطر من الاستثناء.
 * `userActivation` يمنح الصفحة تنشيطًا عابرًا كالنقرة — `click()` بعده يحمل إيماءةً حيث تُقرأ.
 */
export function evaluator(send, context, { userActivation = false } = {}) {
  return async (expression, ms = 30_000) => {
    const r = await send(
      'script.evaluate',
      {
        expression,
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
        userActivation,
      },
      ms,
    )
    if (r.type === 'exception') {
      const d = r.exceptionDetails
      throw new Error(String(d?.text ?? d?.exception?.value ?? 'استثناء بلا وصف').split('\n')[0])
    }
    return r.result?.value
  }
}

/** يستطلع شجرة السياقات حتى يطابق أحدها. */
export async function findContext(send, predicate, { tries = 60, intervalMs = 250 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { contexts } = await send('browsingContext.getTree', {})
    const hit = contexts.find(predicate)
    if (hit) return hit
    await sleep(intervalMs)
  }
  return null
}

// ── الإضافة ──────────────────────────────────────────────────────

/** أسماء الملفّات المخرَّبة من البيئة — انظر الترويسة. */
export function sabotageList(env = process.env) {
  return String(env.RASD_GUARD_SABOTAGE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * نسخة الفحص: `dist-firefox/` في مجلّدٍ مؤقّت، ومعها صفحة الفحص وما يطلبه الحارس في بيانها. الحزمة المبنيّة لا
 * تُمسّ — `verify:dist --target firefox` و`web-ext lint` يحرسانها.
 *
 * `hostPermissions` بديل إيماءة `activeTab` (لا أتمتة تنقر أيقونة الشريط — وحرّاس كروم تفعل الشيء نفسه)، وFirefox
 * يمنحها في التثبيت المؤقّت حين تُعلَن (قِيس). و`permissions` يجعل الاختيارية دائمة (`downloads`): طلبها بإيماءة
 * نافذةُ إذنٍ لا تُنقر آليًّا.
 */
export function stageExtension({
  prefix,
  hostPermissions,
  permissions,
  manifest,
  patch,
  sabotage = [],
}) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), `rasd-ff-${prefix}-ext-`)))
  cpSync(DIST, path, { recursive: true })
  writeFileSync(
    join(path, HARNESS),
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>rasd harness</title></html>\n',
  )
  const file = join(path, 'manifest.json')
  const m = JSON.parse(readFileSync(file, 'utf8'))
  if (hostPermissions) m.host_permissions = hostPermissions
  if (permissions) m.permissions = [...new Set([...m.permissions, ...permissions])]
  manifest?.(m)
  writeFileSync(file, JSON.stringify(m, null, 2))
  // ترقيع الحارس لسالبه المسمّى — يرمي بصوتٍ عالٍ إن لم يجد نمطه، كنظيره في `cdp.mjs`.
  try {
    patch?.(path)
  } catch (e) {
    rmSync(path, { recursive: true, force: true })
    throw e
  }
  for (const rel of sabotage) {
    const target = join(path, rel)
    if (!existsSync(target)) {
      rmSync(path, { recursive: true, force: true })
      throw new Error(`RASD_GUARD_SABOTAGE: «${rel}» ليس في dist-firefox/`)
    }
    writeFileSync(target, "throw new Error('rasd-sabotage')\n")
  }
  return { path, geckoId: m.browser_specific_settings?.gecko?.id ?? null }
}

/**
 * `web-ext lint` — مدقّق addons.mozilla.org نفسه بنسخته المثبَّتة في `package.json` — على مجلّد حزمة. يعيد
 * التقرير ومشكلاته بقاعدة الإصدار (`lintProblems`: صفر خطأ، والتحذيرات المسموحة بعدّها)؛ والحكم للمستدعي.
 */
export function webExtLint(dir) {
  const bin = join(ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js')
  if (!existsSync(bin)) {
    return {
      report: null,
      problems: ['web-ext غير مثبَّت — شغّل `pnpm install --frozen-lockfile`'],
    }
  }
  const run = spawnSync(process.execPath, [bin, 'lint', '--source-dir', dir, '--output', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    return {
      report: null,
      problems: [
        `web-ext lint لم يعطِ تقريرًا مقروءًا (خروج ${run.status}): ${run.stderr.slice(0, 200)}`,
      ],
    }
  }
  return { report, problems: lintProblems(report) }
}

/** يثبّت الإضافة تثبيتًا مؤقّتًا — Firefox يعيد خطأ التحقّق إن رفضها. */
export async function installExtension(send, path) {
  try {
    return {
      id: (await send('webExtension.install', { extensionData: { type: 'path', path } })).extension,
      error: null,
    }
  } catch (e) {
    return { id: null, error: e.message }
  }
}

// ── الحارس ───────────────────────────────────────────────────────

/** التقرير: أسطرٌ تتراكم وأخطاء تُعدّ — العقد نفسه في `cdp.mjs`. */
export function createReport() {
  const errors = []
  const lines = []
  return {
    errors,
    lines,
    ok: (m) => lines.push(`  ✓ ${m}`),
    fail: (m) => {
      errors.push(m)
      lines.push(`  ✗ ${m}`)
    },
    note: (m) => lines.push(`  · ${m}`),
  }
}

/** مهلة الحارس الصلبة الافتراضية — دون مهلة المنسّق (ست دقائق) كي يُطبع ما جُمع قبلها. */
export const DEFAULT_HARD_TIMEOUT_MS = 300_000

/**
 * يجهّز بيئة حارس Firefox كاملة ويعيدها — ولا يحكم بشيء غير وجودها.
 *
 * @param {object} o
 * @param {string} o.prefix              بادئة المجلّدات المؤقّتة.
 * @param {number} o.port                منفذ BiDi — ثابت لكل حارس.
 * @param {string} o.title               عنوان التقرير.
 * @param {boolean} [o.fixtures]         يضمن خادم العيّنات على منفذه الخاص.
 * @param {{ hostPermissions?: string[], permissions?: string[], manifest?: (m: any) => void, patch?: (path: string) => void }} [o.stage]
 * @param {number} [o.hardTimeoutMs]
 */
export async function startGuard(o) {
  const report = createReport()
  if (!existsSync(join(DIST, 'manifest.json'))) {
    console.error('dist-firefox/manifest.json غير موجود — شغّل `pnpm build:firefox` أولًا.')
    process.exit(1)
  }
  const firefox = findFirefox()
  if (!firefox) {
    console.error('لم يُعثر على Firefox. مرّر المسار عبر FIREFOX_PATH.')
    process.exit(1)
  }
  // Firefox يتيم من جولة سابقة على المنفذ نفسه يُخاطَب بدل Firefox الحارس — العَرَض نفسه الذي سُمّي في `cdp.mjs`.
  if (await portBusy(o.port)) {
    console.error(
      `المنفذ ${o.port} مشغول (Firefox سابق؟). أغلقه أوّلًا:\n  pkill -f "remote-debugging-port ${o.port}"`,
    )
    process.exit(1)
  }

  const cleanups = []
  let finished = false
  const cleanup = async () => {
    if (finished) return
    finished = true
    for (const fn of cleanups.reverse()) {
      try {
        await fn()
      } catch {
        /* التنظيف لا يُسقط الحكم */
      }
    }
  }

  // `RASD_GUARD_TRANSCRIPT=<مجلّد>` يكتب التقرير ملفًّا أيضًا — كما في `cdp.mjs`.
  const print = () => {
    console.log(`\n${o.title}`)
    console.log(report.lines.join('\n'))
    const dir = process.env.RASD_GUARD_TRANSCRIPT
    if (dir) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, `firefox-${o.prefix}.txt`),
        `${o.title}\n${report.lines.join('\n')}\n`,
      )
    }
  }

  const hardTimeoutMs = o.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS
  const hardTimeout = setTimeout(async () => {
    print()
    console.error(
      `\n✗ تجاوز الفحص الحدّ الأقصى ${hardTimeoutMs / 1000} ثانية — علّق بعد آخر سطر أعلاه.\n`,
    )
    await cleanup()
    process.exit(1)
  }, hardTimeoutMs)
  hardTimeout.unref?.()
  cleanups.push(() => clearTimeout(hardTimeout))

  const sabotage = sabotageList()
  if (sabotage.length > 0) report.note(`تخريب مقصود لإثبات السالب: ${sabotage.join(' · ')}`)

  const fixtures = o.fixtures ? await ensureFixturesServer({ port: FIXTURES_PORT }) : null
  if (fixtures) {
    cleanups.push(() => fixtures.stop())
    process.once('exit', () => fixtures.stop())
  }

  let staged
  try {
    staged = stageExtension({ prefix: o.prefix, ...(o.stage || {}), sabotage })
  } catch (e) {
    console.error(e.message)
    await cleanup()
    process.exit(1)
  }
  cleanups.push(() => rmSync(staged.path, { recursive: true, force: true }))
  if (!staged.geckoId) {
    console.error(
      'dist-firefox/manifest.json بلا browser_specific_settings.gecko.id — ليست حزمة Firefox.',
    )
    await cleanup()
    process.exit(1)
  }

  const downloads = realpathSync(mkdtempSync(join(tmpdir(), `rasd-ff-${o.prefix}-dl-`)))
  cleanups.push(() => rmSync(downloads, { recursive: true, force: true }))

  const run = launchFirefox({
    firefox,
    port: o.port,
    prefix: o.prefix,
    prefs: { ...basePrefs({ geckoId: staged.geckoId, downloads }), ...(o.prefs ?? {}) },
  })
  const kill = () => {
    try {
      run.proc.kill('SIGKILL')
    } catch {
      /* أُغلق أصلًا */
    }
  }
  process.once('exit', kill)
  cleanups.push(async () => {
    kill()
    await sleep(300)
    rmSync(run.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })

  const conn = await connectBidi(o.port, {
    ready: () => run.stderr().includes('WebDriver BiDi listening'),
  })
  if (!conn) {
    await cleanup()
    console.error(
      `تعذّر الاتصال بـWebDriver BiDi.\n${run.stderr().split('\n').slice(-8).join('\n')}`,
    )
    process.exit(1)
  }
  cleanups.push(async () => {
    await conn.send('session.end', {}, 3000).catch(() => undefined)
    conn.close()
  })
  const { send } = conn
  await send('session.subscribe', { events: ['log.entryAdded'] })
  const pageLog = []
  conn.onEvent((msg) => {
    if (msg.method === 'log.entryAdded') pageLog.push(msg.params)
  })

  const version = await (async () => {
    const ctx = await conn.chromeContext()
    return evaluator(send, ctx)(`Services.appinfo.name + ' ' + Services.appinfo.version`)
  })().catch(() => 'Firefox ?')

  const inChrome = async (expression, ms) =>
    evaluator(send, await conn.chromeContext())(expression, ms)

  const installed = await installExtension(send, staged.path)
  if (installed.error) report.fail(`Firefox رفض الحزمة: ${installed.error}`)

  /*
   * جولة التعريف التي تفتحها الإضافة عند التثبيت (`onInstalled`) — دليلٌ على أن الخلفية أقلعت. تُسجَّل ولا يُحكم
   * بها هنا: `load` يحكم، والبقيّة لا يعنيها.
   */
  const tour = installed.id
    ? await findContext(send, (c) => c.url.startsWith(`${EXT_BASE}src/pages/onboarding/`), {
        tries: 40,
      })
    : null

  /** يفتح صفحةً في تبويب من سياق المتصفّح — يصل إلى `moz-extension://` الذي يرفضه BiDi. */
  const openTrusted = async (url) => {
    await inChrome(`(() => {
      const tab = gBrowser.addTab(${JSON.stringify(url)}, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      })
      gBrowser.selectedTab = tab
      return true
    })()`)
    return findContext(send, (c) => c.url === url, { tries: 80 })
  }

  let harness = null
  if (installed.id) {
    const found = await openTrusted(`${EXT_BASE}${HARNESS}`)
    harness = found?.context ?? null
    if (!harness) report.fail('لم تُفتح صفحة الفحص في الإضافة')
  }
  const ext = harness ? evaluator(send, harness) : null
  // صفحة الفحص جاهزة لـ`chrome.*` قبل أوّل نداء.
  if (ext) {
    for (let i = 0; i < 40; i++) {
      if (
        (await ext(`typeof chrome?.runtime?.sendMessage === 'function'`).catch(() => false)) ===
        true
      )
        break
      await sleep(150)
    }
  }

  let messageSeq = 0
  /** رسالة رصد إلى الخلفية بمغلّفها (`contract.ts`) — الردّ `{ ok, value | error }` أو رميٌ بسبب الانقطاع. */
  const message = async (type, payload, ms = 30_000) =>
    JSON.parse(
      await ext(
        `chrome.runtime.sendMessage({ __rasd: 1, type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload ?? null)}, id: 'ff#${++messageSeq}' }).then((r) => JSON.stringify(r ?? null))`,
        ms,
      ),
    )

  const tabReady = (tabId) =>
    ext(
      `new Promise((res) => { const check = () => chrome.tabs.get(${tabId}).then((t) => t.status === 'complete' ? res(true) : setTimeout(check, 100), () => res(false)); check() })`,
      30_000,
    )

  let siteSeq = 0
  /**
   * يفتح صفحة عيّنة في تبويبٍ نشط من الإضافة (`tabs.create` كما تفعل رصد)، ويعيد معرّف التبويب وسياقه في BiDi.
   * العنوان يحمل علامةً فريدة كي يُطابَق السياق بلا لبس.
   */
  const openSite = async (path) => {
    const url = `${fixtures ? `http://127.0.0.1:${fixtures.port}` : FIXTURES_BASE}${path}${path.includes('?') ? '&' : '?'}ff=${++siteSeq}`
    const tabId = Number(
      await ext(
        `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then((t) => t.id)`,
      ),
    )
    await tabReady(tabId)
    const found = await findContext(send, (c) => c.url === url)
    if (!found) throw new Error(`لم يظهر سياق ${url}`)
    return { tabId, context: found.context, url }
  }

  /** يفتح صفحة إضافة في تبويب من الإضافة نفسها، ويعيد معرّف تبويبها وسياقها. */
  const openExtensionPage = async (path) => {
    const url = `${EXT_BASE}${path}`
    const tabId = Number(
      await ext(
        `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then((t) => t.id)`,
      ),
    )
    await tabReady(tabId)
    const found = await findContext(send, (c) => c.url === url)
    if (!found) throw new Error(`لم يظهر سياق ${url}`)
    return { tabId, context: found.context, url }
  }

  /** يجعل التبويب نشطًا في نافذته — `captureVisibleTab` يلتقط النشط. */
  const activate = async (tabId) => {
    await ext(`chrome.tabs.update(${tabId}, { active: true }).then(() => true)`)
  }

  /** يشغّل دالّةً (نصّها) في العالم المعزول لسكربت المحتوى — حيث `globalThis.__rasdContent`. */
  const inContent = async (tabId, fnSource, ms) =>
    ext(
      `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, func: ${fnSource} }).then((r) => r[0]?.result)`,
      ms,
    )

  /**
   * يقرأ من جلسة الطبقة **القائمة** دون أن يقلع واحدة: `read` نصّ دالّة `(session) => قيمة` تجري في العالم المعزول
   * وتُعاد JSON. وبلا جلسة يعيد `{ __none: true }` — فلا يُخفي القارئ تفعيلًا لم يقع بإقلاعه هو (`startOverlay`
   * يبني جلسة إن لم يجدها، والجلسة على `window.__rasdSession` وعدًا، `src/content/index.ts`).
   */
  const overlay = async (tabId, read, ms) => {
    const raw = await inContent(
      tabId,
      `async () => {
        const running = window.__rasdSession
        if (!running) return JSON.stringify({ __none: true })
        const r = await running
        if (!r.ok) return JSON.stringify({ __none: true, error: String(r.error?.message ?? '') })
        return JSON.stringify((${read})(r.value) ?? null)
      }`,
      ms,
    )
    return raw === undefined || raw === null ? { __none: true } : JSON.parse(raw)
  }

  /** إطاران في الصفحة — ما وصلها من حدثٍ رُسم. */
  const settle = (context) =>
    evaluator(
      send,
      context,
    )('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))')

  /** مؤشّرٌ حقيقي في صفحة موقع — أحداثٌ موثوقة كيد المستخدم. */
  const pointer = (context, actions) =>
    send('input.performActions', {
      context,
      actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions }],
    }).then(() => send('input.releaseActions', { context }))

  /** لقطة سياق موقع PNG — صفحات الإضافة لا تُلتقط (قِيس). */
  const screenshot = async (context) =>
    Buffer.from((await send('browsingContext.captureScreenshot', { context })).data, 'base64')

  /**
   * أخطاء الإضافة حتى اللحظة: الاستثناءات والرفض غير الملتقَط بمصدرٍ من الإضافة (`Services.console`)، ونداءات
   * `console.error` من سياقات المحتوى (الخَرْج القياسي)، و`log.entryAdded` بمستوى خطأ من صفحات المواقع.
   */
  const consoleErrors = async () => {
    const fromService = JSON.parse(
      await inChrome(`JSON.stringify(Services.console.getMessageArray().flatMap((m) => {
        if (!(m instanceof Ci.nsIScriptError)) return []
        if (m.flags & (Ci.nsIScriptError.warningFlag | Ci.nsIScriptError.infoFlag)) return []
        const where = String(m.sourceName || '')
        if (!where.startsWith(${JSON.stringify(EXT_BASE)}) && !String(m.errorMessage).includes(${JSON.stringify(EXT_BASE)})) return []
        return [m.errorMessage + ' @ ' + where.replace(${JSON.stringify(EXT_BASE)}, '') + ':' + m.lineNumber]
      }))`).catch(() => '[]'),
    )
    const fromStdout = run.stdout().filter((l) => l.startsWith('console.error:'))
    const fromPages = pageLog
      .filter((e) => e.level === 'error')
      .map((e) => {
        const frame = e.stackTrace?.callFrames?.[0]
        return `${e.text}${frame ? ` @ ${frame.url}:${frame.lineNumber}:${frame.columnNumber}` : ''} (${e.type ?? 'log'})`
      })
    return [...new Set([...fromService, ...fromStdout, ...fromPages])]
  }

  /**
   * يراقب كل طلب شبكة يفتحه المتصفّح — مراقِب `http-on-opening-request` في سياق المتصفّح (يرى طلبات الإضافة
   * وخلفيتها التي لا يراها `network.*`) ومعه `network.beforeRequestSent` لسياقات المواقع. يعيد دالّةً تقرأ ما جُمع.
   */
  const watchRequests = async () => {
    await inChrome(`(() => {
      const seen = (globalThis.__rasdRequests = [])
      const observer = {
        observe(subject) {
          try {
            const channel = subject.QueryInterface(Ci.nsIChannel)
            const info = channel.loadInfo
            const by = info?.triggeringPrincipal?.originNoSuffix ?? ''
            const loading = info?.loadingPrincipal?.originNoSuffix ?? ''
            seen.push({ url: channel.URI.spec, by, loading, type: info?.externalContentPolicyType ?? null })
          } catch {}
        },
      }
      Services.obs.addObserver(observer, 'http-on-opening-request')
      globalThis.__rasdRequestObserver = observer
      return true
    })()`)
    const tabs = []
    await send('session.subscribe', { events: ['network.beforeRequestSent'] })
    conn.onEvent((msg) => {
      if (msg.method === 'network.beforeRequestSent') {
        tabs.push({ url: msg.params.request.url, context: msg.params.context })
      }
    })
    return async () => ({
      browser: JSON.parse(await inChrome(`JSON.stringify(globalThis.__rasdRequests)`)),
      tabs: [...tabs],
    })
  }

  const finish = async ({ success, failure } = {}) => {
    print()
    await cleanup()
    if (report.errors.length > 0) {
      console.error(
        failure
          ? failure(report.errors.length)
          : `\n✗ فشل الفحص — ${report.errors.length} مشكلة.\n`,
      )
      process.exit(1)
    }
    if (success) console.log(`\n${success}\n`)
    process.exit(0)
  }

  /** خروجٌ مبكّر حين لا يبقى ما يُفحص — يسقط **دائمًا**، كنظيره في `cdp.mjs`. */
  const abort = async (msg) => {
    if (msg) report.fail(msg)
    else if (report.errors.length === 0) report.fail('توقّف الفحص قبل أحكامه بلا سبب مسجَّل')
    await finish()
  }

  return {
    ...report,
    report,
    firefox,
    version,
    conn,
    send,
    extId: installed.id,
    installError: installed.error,
    extPath: staged.path,
    extBase: EXT_BASE,
    sabotage,
    fixtures,
    base: fixtures ? `http://127.0.0.1:${fixtures.port}` : FIXTURES_BASE,
    downloads,
    tour: tour?.context ?? null,
    harness,
    ext,
    message,
    inChrome,
    inContext: (context, opts) => evaluator(send, context, opts),
    openSite,
    openExtensionPage,
    activate,
    inContent,
    overlay,
    settle,
    pointer,
    screenshot,
    consoleErrors,
    watchRequests,
    stdout: run.stdout,
    onCleanup: (fn) => cleanups.push(fn),
    finish,
    abort,
  }
}
