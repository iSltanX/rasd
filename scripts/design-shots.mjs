#!/usr/bin/env node
/**
 * لقطات التصميم — كل شاشة منفَّذة كما يرسمها Chrome، بالوضعين، لمقارنتها بإطارها (`STAGES/04`).
 *
 * **ليست حارسًا.** لا تحكم ولا تسقط على فرق بكسل: متصفّح يتحدّث شهريًّا يغيّر تنعيم حرف فيُسقط
 * البناء بلا عطل (`tests/visual-baselines/phase-15/README.md`). عملها أن تضع الشاشة الحيّة أمام
 * العين بجوار إطارها، وأن تولّد خطوط الأساس في `tests/visual-baselines/` بأمر يُعاد لا بلقطة يدوية.
 *
 *   pnpm design:shots                  # كل المشاهد، الوضعان → artifacts/design/shots/
 *   pnpm design:shots --only=popup     # مجموعة واحدة أو أكثر مفصولة بفواصل
 *   pnpm design:shots --baselines      # ويكتب خطوط الأساس المسمّاة في tests/visual-baselines/
 *
 * **بناء تطوير في مجلّده لا `dist`.** صفحات المعاينة (`popup-preview`) مستبعَدة من بناء الإنتاج،
 * وحالات النافذة الاثنتا عشرة لا تُبلغ حيّةً بلا مهمّة التقاط حقيقية. والصفحات نفسها في البناءين
 * مصدرًا واحدًا — الفرق التصغير وخرائط المصدر.
 *
 * **والوضع من `prefers-color-scheme` لا من الإعدادات:** السمة الافتراضية «النظام»، فمحاكاة الوسيط
 * عبر CDP هي المسار الذي يسلكه المستخدم فعلًا، بلا كتابة إعدادات قد تتسرّب إلى مشهد تالٍ.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './live-fixtures.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(root, 'artifacts', 'design')
const EXT = join(OUT, 'ext')
const SHOTS = join(OUT, 'shots')
const PORT = Number(process.env.RASD_DESIGN_PORT ?? 9391)
const FIXTURES_PORT = Number(process.env.RASD_FIXTURES_PORT ?? 5399)
const WIDTH = 1440
const HEIGHT = 900

const args = process.argv.slice(2)
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean)
const writeBaselines = args.includes('--baselines')
const skipBuild = args.includes('--no-build')

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chromePath = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

// ── 1) بناء التطوير ────────────────────────────────────────────────
if (!skipBuild) {
  rmSync(EXT, { recursive: true, force: true })
  const vite = (config) =>
    execFileSync(
      'pnpm',
      ['exec', 'vite', 'build', '--mode', 'development', '--outDir', EXT, ...config],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
    )
  vite([])
  vite(['--config', 'vite.content.config.ts'])
}
mkdirSync(SHOTS, { recursive: true })

// ── 2) Chrome وبروتوكول التنقيح ───────────────────────────────────
const fixtures = await ensureFixturesServer({ port: FIXTURES_PORT })
const BASE = `http://127.0.0.1:${FIXTURES_PORT}`
const profile = mkdtempSync(join(tmpdir(), 'rasd-design-'))
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
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore'] },
)

function finish(code) {
  fixtures.stop()
  try {
    proc.kill('SIGKILL')
  } catch {
    /* أُغلق أصلًا */
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* Chrome ما يزال يكتب */
  }
  process.exit(code)
}

let wsUrl = null
for (let i = 0; i < 240 && !wsUrl; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    if (res.ok) wsUrl = (await res.json()).webSocketDebuggerUrl
  } catch {
    /* لم يجهز */
  }
  if (!wsUrl) await new Promise((r) => setTimeout(r, 250))
}
if (!wsUrl) {
  console.error('تعذّر الاتصال بـDevTools')
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

const extId = (await send('Extensions.loadUnpacked', { path: EXT })).id
const ORIGIN = `chrome-extension://${extId}`

/** صفحة جديدة بمقاس الإطار ووضعه — تُرجع أدوات تقييمها ولقطتها وإغلاقها. */
async function openPage(url, mode, { beforeLoad } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  )
  await send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-color-scheme', value: mode }] },
    sessionId,
  )
  if (beforeLoad) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: beforeLoad }, sessionId)
  }
  await send('Page.navigate', { url }, sessionId)
  const page = {
    sessionId,
    async evaluate(expression) {
      const res = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      )
      if (res.exceptionDetails) {
        const d = res.exceptionDetails
        throw new Error(String(d.exception?.description ?? d.text).split('\n')[0])
      }
      return res.result.value
    },
    async waitFor(expression, timeoutMs = 8000) {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const v = await page.evaluate(expression).catch(() => null)
        if (v) return v
        await new Promise((r) => setTimeout(r, 80))
      }
      throw new Error(`لم يتحقّق: ${expression.slice(0, 120)}`)
    },
    /** إطارا رسم متتاليان وخطوط محمَّلة — ما يُلتقط هو ما رُسم. */
    async settle() {
      await page.evaluate(
        'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))',
      )
    },
    async shot(file, clip) {
      const { data } = await send(
        'Page.captureScreenshot',
        {
          format: 'png',
          // عنصر تحت أوّل 900 بكسل يُقصّ بلا هذا — قِيس في معاينة النافذة (`STAGES/04`).
          ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : {}),
        },
        sessionId,
      )
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
    async rectOf(selector) {
      return page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }
      })()`)
    },
    close: () => send('Target.closeTarget', { targetId }),
  }
  await page.waitFor('document.readyState === "complete" && location.href !== "about:blank"')
  return page
}

const MODES = ['dark', 'light']
const shotName = (frame, mode) => join(SHOTS, `${frame.replace(/[ /·]+/g, '_')}--${mode}.png`)

// ── 3) المشاهد ─────────────────────────────────────────────────────
//
// كل مشهد: الإطار الذي يقابله في `Docs/Design.md §5`، ومسار الوصول إلى حالته، وما يُلتقط.

/**
 * سياق المجموعات — كل ملفّ في `scripts/design-shots/` يصدّر `default async (ctx, mode) => عدد اللقطات`.
 *
 *   ctx.openPage(url, mode, { beforeLoad })  صفحة بمقاس الإطار ووضعه؛ `beforeLoad` نصّ يُقيَّم قبل
 *                                            سكربتات الصفحة (حقن عطل: `indexedDB.open` يرمي مثلًا)
 *   ctx.shot(page, frame, mode, clip?)        يكتب اللقطة باسم الإطار كما في `Docs/Design.md §5`
 *   ctx.ORIGIN · ctx.BASE · ctx.send          أصل الإضافة، وخادم العيّنات، وCDP الخام
 */
const ctx = {
  ORIGIN,
  BASE,
  send,
  openPage,
  async shot(page, frame, mode, clip) {
    await page.shot(shotName(frame, mode), clip)
  },
}

const groupDir = join(root, 'scripts', 'design-shots')
const groups = {}
for (const file of readdirSync(groupDir)
  .filter((f) => f.endsWith('.mjs'))
  .sort()) {
  groups[file.replace(/\.mjs$/, '')] = (await import(join(groupDir, file))).default
}

let total = 0
for (const [name, run] of Object.entries(groups)) {
  if (only.length && !only.includes(name)) continue
  for (const mode of MODES) {
    try {
      const n = await run(ctx, mode)
      total += n
      console.log(`  ✓ ${name} · ${mode} — ${n}`)
    } catch (e) {
      console.log(`  ✗ ${name} · ${mode} — ${e.message}`)
    }
  }
}
console.log(`\n${total} لقطة في ${SHOTS}`)
if (writeBaselines) console.log('خطوط الأساس: لم تُحدَّد بعد في هذا الإصدار')
finish(0)
