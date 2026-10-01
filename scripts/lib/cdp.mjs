/**
 * نواة الحرّاس الحيّة — **ما يتكرّر في كل `scripts/verify-*.mjs` يعيش هنا مرّة** (`STAGES/17`، ADR 0042).
 *
 * كان كل حارس كروم ينسخ الشيء نفسه: البحث عن كروم، ونسخة الفحص وصلاحيتها، وملفّ التعريف المؤقّت،
 * وإقلاع كروم، وانتظار منفذ التنقيح، و`send` على المقبس، وتحميل الإضافة، والارتباط بالعامل، والتقاط
 * أخطاء الصفحة، والتقرير، والتنظيف. عشرون نسخة تنحرف عن بعضها عند أوّل تعديل — وقد انحرفت: مهلة
 * صلبة في أربعة وحدها (الصفّ 97)، و`send` يترك وعدًا معلَّقًا إلى الأبد إن مات المقبس، وكروم يبقى
 * يتيمًا على منفذه إن رمى الحارس استثناءً قبل تنظيفه.
 *
 * **ما تملكه النواة وما لا تملكه.** تملك البيئة: الإقلاع والاتصال والتحميل والارتباط والتقرير
 * والتنظيف والمهلة. **ولا تملك حكمًا واحدًا**: كل `ok` و`fail` يبقى في ملفّ حارسه، فلا يتغيّر ما
 * يؤكّده حارس بنقله إليها. ولذلك تعيد النواة ما وجدته (`extId` · `sw` · `loadError`) ولا تُسقط الفحص
 * بنفسها إلا حيث لا يبقى ما يُفحص: كروم غير موجود، أو حزمة غير مبنيّة، أو منفذ تنقيح لم يُفتح.
 *
 * **بصمة الحارس تشمل النواة.** سجلّ الترقية (`guards-sync.mjs`) يربط سلسلة كل حارس ببصمة ملفّه
 * ومعه ما يستورده من `scripts/` — فتعديلٌ هنا يبدأ سلاسل الحرّاس كلّها من الصفر، كما يفعل تعديل
 * ملفّ حارس بسلسلته. نواةٌ مشتركة خارج البصمة كانت ستصير بابًا يغيّر الحرّاس كلّهم بلا أثر.
 *
 * **التخريب المقصود — لإثبات السالب.** `RASD_GUARD_SABOTAGE=background.js,content.js` يستبدل
 * الملفّات المسمّاة في نسخة الفحص بسطرٍ يرمي — فيُثبَت أن الحارس يسقط حين يُكسر ما يقوده، بلا لمس
 * ملفّ متتبَّع (الصفّ 94: الاستعادة تُنسى). النسخة مؤقّتة والحزمة لا تُمسّ، والتقرير يُعلن التخريب
 * سطرًا أوّل كي لا يُقرأ سقوطه عطلًا.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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

import { ensureFixturesServer, FIXTURES_PORT } from './live-fixtures.mjs'
import { attachLiveServiceWorker, waitForInstallFlow } from './live-sw.mjs'

export { ensureFixturesServer, FIXTURES_PORT, probeFixtures } from './live-fixtures.mjs'
export { attachLiveServiceWorker, waitForExtensionContext, waitForInstallFlow } from './live-sw.mjs'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const DIST = join(ROOT, 'dist')

/** أصل العيّنات الأوّل كما تعرفه الحرّاس. */
export const FIXTURES_BASE = `http://127.0.0.1:${FIXTURES_PORT}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── كروم ─────────────────────────────────────────────────────────

export const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** `CHROME_PATH` أوّلًا، ثمّ أوّل مرشَّح موجود — أو `null`. */
export function findChrome(env = process.env) {
  return env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null
}

/**
 * معرّف الإضافة غير المضغوطة مشتقّ حتميًّا من مسارها المطلق: أوّل 16 بايتًا من SHA-256 للمسار،
 * كل نصف بايت يُخرَّط إلى a–p. ضروري لأن للمتصفّح إضافات مكوّنة لها عمّالها هي أيضًا.
 */
export function unpackedExtensionId(absPath) {
  const digest = createHash('sha256').update(absPath, 'utf8').digest()
  let id = ''
  for (const byte of digest.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f))
  }
  return id
}

/** الأعلام المشتركة — كل حارس يقلع كروم بها، ويزيد ما يخصّه. */
export const BASE_CHROME_FLAGS = [
  '--headless=new',
  '--enable-unsafe-extension-debugging',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
]

/**
 * يقلع كروم بملفّ تعريف مؤقّت على منفذ تنقيح ثابت.
 * @returns {{ proc: import('node:child_process').ChildProcess, profile: string, stderrTail: (n?: number) => string }}
 */
export function launchChrome({ chrome, port, prefix, args = [], url = 'about:blank' }) {
  const profile = mkdtempSync(join(tmpdir(), `rasd-${prefix}-`))
  const proc = spawn(
    chrome,
    [
      ...BASE_CHROME_FLAGS,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      ...args,
      url,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  proc.stderr.on('data', (d) => (stderr += d.toString()))
  proc.stdout.on('data', () => undefined)
  return { proc, profile, stderrTail: (n = 8) => stderr.split('\n').slice(-n).join('\n') }
}

// ── بروتوكول DevTools ────────────────────────────────────────────

/**
 * يتّصل بجلسة المتصفّح — `/json/list` لا يُدرج العمّال، فالمستوى مستوى المتصفّح.
 *
 * **ميزانية انتظار DevTools — ستّون ثانية لا عشر.** قِيس: كروم يُقلع على عدّاء بنواتين تحت ضغط فلا
 * يفتح منفذ التنقيح خلال 10s، فيخرج الحارس «تعذّر الاتصال» — إخفاق بيئة لا حكمٌ على المنتَج.
 *
 * **مُوزِّعٌ واحد لا مستمعٌ لكل نداء.** الوعود المعلَّقة في خريطة، والمقبس إن أُغلق رفضها كلّها — فلا
 * يبقى نداءٌ معلَّقًا إلى الأبد على مقبس مات (الصفّ 97: «مقبسٌ نصف حيّ يترك وعدًا معلَّقًا»).
 *
 * @returns {Promise<null | { ws: WebSocket, send: Function, onEvent: (fn: (msg: any) => void) => () => void, close: () => void }>}
 */
export async function connectCdp(port, { waitMs = 60_000 } = {}) {
  let wsUrl = null
  const deadline = Date.now() + waitMs
  while (!wsUrl && Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) wsUrl = (await res.json()).webSocketDebuggerUrl
    } catch {
      /* المتصفّح لم يجهز بعد */
    }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) return null

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

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
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      return
    }
    for (const fn of listeners) fn(msg)
  })
  ws.addEventListener('close', () => {
    closed = true
    for (const { reject } of pending.values()) reject(new Error('أُغلق مقبس DevTools'))
    pending.clear()
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error('أُغلق مقبس DevTools'))
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  const onEvent = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return { ws, send, onEvent, close: () => ws.close() }
}

/**
 * مُقيِّمٌ في جلسة: يرمي بأوّل سطر من وصف الاستثناء، ومع `withExpression` بمقتطف التعبير أيضًا.
 */
export function evaluator(send, sessionId, { withExpression = false } = {}) {
  return async (expression) => {
    const res = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    if (res.exceptionDetails) {
      const d = res.exceptionDetails
      const detail = d.exception?.description ?? d.exception?.value ?? d.text ?? 'بلا وصف'
      throw new Error(
        withExpression
          ? `${detail}\nفي: ${expression.slice(0, 200)}`
          : String(detail).split('\n')[0],
      )
    }
    return res.result.value
  }
}

/** يرتبط بهدفٍ ويفعّل `Runtime` (ومعه ما يُطلب من النطاقات) ويعيد الجلسة. */
export async function attachTarget(send, targetId, { enable = [] } = {}) {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  for (const domain of enable) await send(`${domain}.enable`, {}, sessionId)
  return sessionId
}

/**
 * يستطلع الأهداف حتى يطابق أحدها ثمّ يرتبط به. هدفٌ يختفي بين الاكتشاف والارتباط يُعاد استطلاعه.
 * @returns {Promise<{ target: any, sessionId: string } | null>}
 */
export async function findAndAttach(
  send,
  predicate,
  { tries = 60, intervalMs = 200, enable } = {},
) {
  for (let i = 0; i < tries; i++) {
    const { targetInfos } = await send('Target.getTargets')
    const target = targetInfos.find(predicate)
    if (target) {
      try {
        return { target, sessionId: await attachTarget(send, target.targetId, { enable }) }
      } catch {
        /* اختفى بين الاكتشاف والاتصال */
      }
    }
    await sleep(intervalMs)
  }
  return null
}

/** يفتح صفحة في هدف جديد ويرتبط بها. */
export async function openTarget(send, url, { enable = ['Page'] } = {}) {
  const { targetId } = await send('Target.createTarget', { url })
  return { targetId, sessionId: await attachTarget(send, targetId, { enable }) }
}

/**
 * يلتقط أخطاء الصفحات: الاستثناءات غير الملتقَطة و`console.error` — من كل جلسة فُعِّل فيها `Runtime`.
 * @returns {string[]} مصفوفةٌ حيّة تمتلئ مع الأحداث.
 */
export function collectPageErrors(conn) {
  const errors = []
  conn.onEvent((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails
      errors.push(d?.exception?.description ?? d?.text ?? 'استثناء بلا وصف')
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      errors.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? '?').join(' '))
    }
  })
  return errors
}

/**
 * يلتقط طلبات الشبكة في جلسة بعينها بعد `Network.enable` — عناوينها وأنواعها.
 * @returns {Promise<Array<{ url: string, type: string | undefined }>>}
 */
export async function collectRequests(conn, sessionId) {
  const requests = []
  conn.onEvent((msg) => {
    if (msg.method !== 'Network.requestWillBeSent') return
    if (sessionId && msg.sessionId !== sessionId) return
    requests.push({ url: msg.params.request.url, type: msg.params.type })
  })
  await conn.send('Network.enable', {}, sessionId)
  return requests
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
 * نسخة الفحص: `dist/` كما هي في مجلّد مؤقّت، ومعها ما يطلبه الحارس في بيانها. الحزمة المشحونة لا
 * تُمسّ — `verify:dist` يحرسها. والتخريب المقصود يقع هنا وحده.
 */
export function stageExtension({ prefix, hostPermissions, manifest, patch, sabotage = [] }) {
  const path = mkdtempSync(join(tmpdir(), `rasd-${prefix}-ext-`))
  cpSync(DIST, path, { recursive: true })
  if (hostPermissions || manifest) {
    const file = join(path, 'manifest.json')
    const m = JSON.parse(readFileSync(file, 'utf8'))
    if (hostPermissions) m.host_permissions = hostPermissions
    manifest?.(m)
    writeFileSync(file, JSON.stringify(m, null, 2))
  }
  // ترقيع الحارس لسالبه المسمّى (`RASD_BREAK_*`) — قبل التحميل، فالعامل لا يعيد قراءة ملفّاته بعد
  // إقلاعه. ويرمي بصوتٍ عالٍ إن لم يجد نمطه: ترقيعٌ صامت يُنتج حارسًا أخضر لأنه لم يكسر شيئًا.
  try {
    patch?.(path)
  } catch (e) {
    rmSync(path, { recursive: true, force: true })
    throw e
  }
  for (const rel of sabotage) {
    const target = join(path, rel)
    if (!existsSync(target)) throw new Error(`RASD_GUARD_SABOTAGE: «${rel}» ليس في dist/`)
    writeFileSync(target, "throw new Error('rasd-sabotage')\n")
  }
  return path
}

/** يحمّل الإضافة — `Extensions.loadUnpacked` هنا وحده، وChrome يعيد خطأ تحقّق البيان إن رفضها. */
export async function loadExtension(send, path) {
  try {
    return { id: (await send('Extensions.loadUnpacked', { path })).id, error: null }
  } catch (e) {
    return { id: null, error: e.message }
  }
}

// ── الحارس ───────────────────────────────────────────────────────

/** التقرير: أسطرٌ تتراكم وأخطاء تُعدّ. */
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

/** مهلة الحارس الصلبة الافتراضية — دون مهلة الخطوة (ست دقائق) كي يُطبع ما جُمع قبلها. */
export const DEFAULT_HARD_TIMEOUT_MS = 300_000

/**
 * يجهّز بيئة حارس كاملة ويعيدها — ولا يحكم بشيء غير وجودها.
 *
 * @param {object} o
 * @param {string} o.prefix              بادئة المجلّدات المؤقّتة (`rasd-<prefix>-…`).
 * @param {number} o.port                منفذ التنقيح — ثابت لكل حارس.
 * @param {string} o.title               عنوان التقرير.
 * @param {string} [o.requires]          ملفٌّ في `dist/` يُشترط وجوده (`manifest.json` افتراضًا).
 * @param {boolean} [o.fixtures]         يضمن خادم العيّنات.
 * @param {false | { hostPermissions?: string[], manifest?: (m: any) => void, patch?: (path: string) => void }} [o.stage]
 *   نسخة فحص، أو `false` لتحميل `dist/` نفسها (ما لم يُطلب تخريب). و`patch` يرقّعها قبل التحميل،
 *   ويرمي برسالةٍ تُطبع ويسقط بها الحارس.
 * @param {string[]} [o.args]            أعلام كروم الخاصّة (مقاس النافذة مثلًا).
 * @param {boolean} [o.serviceWorker]    يرتبط بالعامل الحيّ بعد التحميل.
 * @param {number} [o.hardTimeoutMs]
 */
export async function startGuard(o) {
  const report = createReport()
  const requires = o.requires ?? 'manifest.json'
  if (!existsSync(join(DIST, requires))) {
    console.error(`dist/${requires} غير موجود — شغّل \`pnpm build\` أولًا.`)
    process.exit(1)
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
    process.exit(1)
  }

  /*
   * **منفذ التنقيح يجب أن يكون خاليًا قبل الإقلاع.** كروم يتيم من جولة سابقة يبقى يجيب على المنفذ،
   * فيتّصل الحارس به لا بكرومه ويفحص حزمةً أخرى — ساعة ضاعت في مطاردة هذا العَرَض في `verify:fullpage`
   * قبل تشخيصه. كان الفحص فيه وحده، وصار هنا لكل حارس.
   */
  const busy = await fetch(`http://127.0.0.1:${o.port}/json/version`).then(
    () => true,
    () => false,
  )
  if (busy) {
    console.error(
      `المنفذ ${o.port} مشغول بنسخة Chrome سابقة. أغلقها أوّلًا:\n` +
        `  pkill -f "remote-debugging-port=${o.port}"`,
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

  /*
   * `RASD_GUARD_TRANSCRIPT=<مجلّد>` يكتب أسطر التقرير في `<مجلّد>/<البادئة>.txt` أيضًا: `verify:wave` لا
   * يطبع خَرْج الحارس الأخضر، فبلا هذا لا يُقرأ ما أثبته إلا من رمز خروجه.
   */
  const print = () => {
    console.log(`\n${o.title}`)
    console.log(report.lines.join('\n'))
    const dir = process.env.RASD_GUARD_TRANSCRIPT
    if (dir) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${o.prefix}.txt`), `${o.title}\n${report.lines.join('\n')}\n`)
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
    // خادمٌ أطلقه الحارس لا يبقى بعده إن رمى استثناءً غير ملتقَط — `stop` متزامنة وتقتل مولودها وحده.
    process.once('exit', () => fixtures.stop())
  }

  const staged = o.stage !== false || sabotage.length > 0
  let extPath = DIST
  if (staged) {
    try {
      extPath = stageExtension({ prefix: o.prefix, ...(o.stage || {}), sabotage })
    } catch (e) {
      console.error(e.message)
      await cleanup()
      process.exit(1)
    }
    const staging = extPath
    cleanups.push(() => rmSync(staging, { recursive: true, force: true }))
  }

  const chromeRun = launchChrome({ chrome, port: o.port, prefix: o.prefix, args: o.args })
  // كروم لا يبقى يتيمًا على منفذه المشترك مهما خرج الحارس — استثناءٌ غير ملتقَط أو `exit` مبكّر.
  const killChrome = () => {
    try {
      chromeRun.proc.kill('SIGKILL')
    } catch {
      /* أُغلق أصلًا */
    }
  }
  process.once('exit', killChrome)
  cleanups.push(async () => {
    killChrome()
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(chromeRun.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        return
      } catch {
        await sleep(200)
      }
    }
  })

  const conn = await connectCdp(o.port)
  if (!conn) {
    await cleanup()
    console.error('تعذّر الاتصال ببروتوكول DevTools.\n' + chromeRun.stderrTail())
    process.exit(1)
  }
  cleanups.push(() => conn.close())
  const { send } = conn

  const loaded = await loadExtension(send, extPath)
  if (loaded.error) report.fail(`Chrome رفض الحزمة: ${loaded.error}`)

  let sw = null
  if (o.serviceWorker && loaded.id) {
    const live = await attachLiveServiceWorker(send, loaded.id)
    if (live.swSession) {
      sw = {
        target: live.sw,
        sessionId: live.swSession,
        evaluate: evaluator(send, live.swSession),
      }
      /*
       * **لا يُسلَّم العامل قبل أن يفرغ مستمع التثبيت** — وإلا تقدّمت جولة التعريف فوق أوّل صفحة يفتحها
       * الحارس فخبّأتها (العلّة مقيسةً عند `waitForInstallFlow`). مهلةٌ تنقضي لا تُسقط شيئًا: حارسٌ
       * يكسر العامل أو التثبيت عمدًا يمضي، والسطر يقول لماذا قد تُخبّأ صفحته.
       */
      if (!(await waitForInstallFlow(sw.evaluate))) {
        report.note('مستمع التثبيت لم يقدّم جولة التعريف في مهلته — صفحةٌ تُفتح الآن قد تُخبّأ')
      }
    }
  }

  /**
   * يطبع التقرير وينظّف ويخرج: `1` إن سُجِّل إخفاق، وإلا `0` مع سطر النجاح.
   * @param {{ success: string, failure?: (n: number) => string }} m
   */
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

  /**
   * خروجٌ مبكّر حين لا يبقى ما يُفحص: يطبع ما جُمع ويسقط **دائمًا** — خروجٌ مبكّر بلا إخفاق مسجَّل
   * كان سيُقرأ أخضر وهو لم يحكم بشيء.
   */
  const abort = async (message) => {
    if (message) report.fail(message)
    else if (report.errors.length === 0) report.fail('توقّف الفحص قبل أحكامه بلا سبب مسجَّل')
    await finish()
  }

  return {
    ...report,
    report,
    chrome,
    conn,
    send,
    ws: conn.ws,
    extId: loaded.id,
    loadError: loaded.error,
    extPath,
    sabotage,
    fixtures,
    base: fixtures ? `http://127.0.0.1:${fixtures.port}` : FIXTURES_BASE,
    sw,
    evaluate: (sessionId, opts) => evaluator(send, sessionId, opts),
    onCleanup: (fn) => cleanups.push(fn),
    finish,
    abort,
  }
}
