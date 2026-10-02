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
 *   pnpm design:shots --baselines-dir=D  # ويكتبها في المجلّد D (ما يقارنه `pnpm verify:visual`)
 *   pnpm design:shots --only=popup --extras  # والإضافية (المعرض وشبكة النافذة) مع `--only` أيضًا
 *   pnpm design:shots --surfaces --baselines # أسطح خطوط الأساس وحدها، وتُكتب خطوط أساسها (أسرع من الكل)
 *   pnpm design:shots --axe            # ويشغّل axe-core على كل مشهد بحالته → artifacts/design/axe.json
 *   pnpm design:shots --numerals       # ويفحص سياسة الأرقام: الهندية للعدّ، والغربية معزولةً للقياس
 *   pnpm design:shots --keys           # ويمرّ بـTab على صفحات الإضافة: كل محطّة تركيز لها أثر مرئي؟
 *   pnpm design:shots --dpr=2          # بكثافة 2× → artifacts/design/shots@2x/ — مصدر مواد الإطلاق (`launch:images`)
 *
 * **و`--axe` يرى ما داخل الطبقة فوق الصفحة.** جذر ظلّها مغلق (`content/host.ts`) فلا يبلغه axe من
 * الصفحة؛ وCDP يرى الجذور المغلقة، فيُسلَّم جذرها إلى axe عبر `shadowRoot` على عنصر المضيف في
 * عالم الصفحة وحده — للفحص، بلا مسّ الإضافة — ويُقصَر الفحص على المضيف لا على صفحة العيّنة.
 *
 * **بناء تطوير في مجلّده لا `dist`.** صفحات المعاينة (`popup-preview`) مستبعَدة من بناء الإنتاج،
 * وحالات النافذة الاثنتا عشرة لا تُبلغ حيّةً بلا مهمّة التقاط حقيقية. والصفحات نفسها في البناءين
 * مصدرًا واحدًا — الفرق التصغير وخرائط المصدر.
 *
 * **والوضع من `prefers-color-scheme` لا من الإعدادات:** السمة الافتراضية «النظام»، فمحاكاة الوسيط
 * عبر CDP هي المسار الذي يسلكه المستخدم فعلًا، بلا كتابة إعدادات قد تتسرّب إلى مشهد تالٍ.
 */
import { execFileSync, spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { ensureFixturesServer } from './lib/live-fixtures.mjs'
import { baselineShots, groupsNeeded, overlayIds, sceneNames } from './lib/visual-surfaces.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(root, 'artifacts', 'design')
const EXT = join(OUT, 'ext')
/**
 * `--dpr=<n>` كثافة البكسل: الإطار يبقى 1440 × 900 بالبكسل المنطقي والصورة `n` أضعافه، في مجلّدها
 * `shots@<n>x/` فلا تختلط بلقطات 1× التي تقارَن بإطاراتها. مصدر مواد الإطلاق وصور README (`launch:images`)
 * لتبقى حادّةً حين تُصدَّر ×2 أو تُصغَّر إلى 1280. **ولا خطوط أساس بها:** خطوط `tests/visual-baselines/` بكثافة
 * 1× وعليها يقارن `verify:visual`، فالجمع بين الخيارين يُرفض قبل أن يُقلع كروم.
 */
const DPR = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 1)
if (!Number.isInteger(DPR) || DPR < 1 || DPR > 3) {
  console.error('✗ --dpr يقبل 1 أو 2 أو 3.')
  process.exit(1)
}
const SHOTS = join(OUT, DPR === 1 ? 'shots' : `shots@${DPR}x`)
const PORT = Number(process.env.RASD_DESIGN_PORT ?? 9391)
const FIXTURES_PORT = Number(process.env.RASD_FIXTURES_PORT ?? 5399)
const WIDTH = 1440
const HEIGHT = 900

const args = process.argv.slice(2)
/**
 * `--surfaces` يلتقط ما تحويه خطوط الأساس وحده — أسطح `visual-surfaces.mjs` ومجموعاتها ومشاهدها
 * والإضافية — لا كل المشاهد. هو ما يقارنه `verify:visual`، وما يُكتب به خطّ الأساس من جديد.
 */
const surfacesOnly = args.includes('--surfaces')
if (surfacesOnly) {
  process.env.RASD_OVERLAY_ONLY ??= overlayIds().join(',')
  process.env.RASD_SCENES ??= sceneNames().join(',')
}
const only = surfacesOnly
  ? groupsNeeded()
  : (args.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean)
/**
 * `--baselines-dir=<مجلّد>` يكتب خطوط الأساس هناك بدل `tests/visual-baselines/` — وهو ما يستعمله
 * `verify:visual` ليلتقط الشاشات الحيّة ويقارنها بالمحفوظة دون أن يلمسها. ويُغني عن `--baselines`.
 */
const baselinesDirArg = args.find((a) => a.startsWith('--baselines-dir='))?.slice(16)
const writeBaselines = args.includes('--baselines') || baselinesDirArg !== undefined
if (writeBaselines && DPR !== 1) {
  console.error(
    '✗ خطوط الأساس بكثافة 1× وحدها (يقارنها `verify:visual`) — لا تجمع --dpr مع --baselines.',
  )
  process.exit(1)
}
const skipBuild = args.includes('--no-build')
const runAxe = args.includes('--axe')
const runKeys = args.includes('--keys')
/** `--numerals` يفحص سياسة الأرقام على كل مشهد بحالته → `artifacts/design/numerals.json`. */
const runNumerals = args.includes('--numerals')
/** `--extras` يكتب خطوط الأساس الإضافية (المعرض وشبكة النافذة) مع `--only` أيضًا. */
const forceExtras = args.includes('--extras') || surfacesOnly
const BASELINES = baselinesDirArg
  ? resolve(baselinesDirArg)
  : join(root, 'tests', 'visual-baselines')
/**
 * مشاهد تُنسخ خطوطَ أساس — الأسطح ومساراتها في `scripts/lib/visual-surfaces.mjs` (مصدرٌ واحد يقرؤه
 * `verify:visual` أيضًا). الأسماء القائمة لا تُغيَّر ولا تُعاد ترقيمًا (`AGENTS.md` §4)، فبعضها يحمل
 * اسم حالة قديمة (`crop-square`) وما فيه موصوف في `README.md` مجلّده.
 */
const BASELINE_SHOTS = baselineShots()
/** مشاهد تُكتب شجرة إتاحتها كما يبنيها Chrome — `Accessibility.getFullAXTree` لا تقريبًا من DOM. */
const BASELINE_TREES = {
  'popup / default|dark': [
    'phase-07/popup-rtl-a11y-tree.md',
    'نافذة الإضافة — الحالات الاثنتا عشرة',
  ],
  'privacy / excluded-sites|dark': [
    'phase-20/settings-privacy-a11y-tree.md',
    'الإعدادات ‹ الخصوصية ‹ المواقع المستثناة، بقائمة مواقع',
  ],
  'onboarding / step-1|dark': ['onboarding/step-1-a11y-tree.md', 'جولة التعريف ‹ الخطوة ١'],
  'onboarding / step-2|dark': ['onboarding/step-2-a11y-tree.md', 'جولة التعريف ‹ الخطوة ٢'],
  'onboarding / step-3|dark': ['onboarding/step-3-a11y-tree.md', 'جولة التعريف ‹ الخطوة ٣'],
  'onboarding / step-4|dark': ['onboarding/step-4-a11y-tree.md', 'جولة التعريف ‹ الخطوة ٤'],
}
const baselineLog = []
/** محطّات تركيز بلا أثر مرئي — `--keys`. */
const keyFindings = []
/** ترتيب Tab لكل مشهد — يُكتب في `keys-trails.json` ومنه الجولة الموثَّقة في `Docs/Accessibility.md`. */
const keyTrails = []
let keyScenes = 0
let keyStops = 0
/** الحالة السالبة: يُمحى كل أثر تركيز قبل المرور فيجب أن تسقط المحطّات كلّها. */
const stripFocus = process.env.RASD_KEYS_STRIP === '1'
const MAX_TAB_STOPS = 40
const AXE_SOURCE = runAxe
  ? readFileSync(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
  : ''
/** نتائج axe: الخطيرة والحرجة وحدها — معيار القبول (`STAGES/04`). */
const axeFindings = []
let axeScenes = 0
/** مشاهد على صفحات ضخمة تخطّاها axe — تُعلَن في الخاتمة ولا تُسكت. */
const axeSkipped = []
const AXE_MAX_ELEMENTS = 20_000

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

/**
 * **تخريب مقصود لإثبات السالب** — `RASD_DESIGN_BREAK=colour|layout` يرقّع التوكنز في البناء المؤقّت قبل
 * أي لقطة، فيثبت `verify:visual` أنه يسقط حين يتغيّر لونٌ أو تخطيطٌ حقًّا لا حين تُعدَّل صورةٌ بعد التقاطها.
 * يرمي إن لم يجد نمطه: ترقيعٌ صامت يعطي أخضر كاذبًا. **والترقيع يبقى في المجلّد المبنيّ** — فبعده بناءٌ
 * جديد (بلا `--no-build`) وإلا حملت اللقطات التالية التخريب.
 */
const BREAK = process.env.RASD_DESIGN_BREAK ?? ''
if (BREAK && BREAK !== 'numerals') {
  const patches = {
    // زرّ الإجراء الرئيس رماديّ، والنصّ الثانوي بلون الإشارة — في الوضعين: لونٌ تغيّر عمدًا.
    colour: [
      [
        '--rasd-action-primary-rest: var(--rasd-color-signal-300);',
        '--rasd-action-primary-rest: var(--rasd-color-ink-500);',
      ],
      [
        '--rasd-action-primary-rest: var(--rasd-color-signal-700);',
        '--rasd-action-primary-rest: var(--rasd-color-ink-500);',
      ],
      [
        '--rasd-text-secondary: var(--rasd-color-ink-300);',
        '--rasd-text-secondary: var(--rasd-color-signal-300);',
      ],
      [
        '--rasd-text-secondary: var(--rasd-color-ink-800);',
        '--rasd-text-secondary: var(--rasd-color-signal-700);',
      ],
    ],
    // فجوةٌ أوسع بأربعة بكسلات — تخطيطٌ تغيّر عمدًا.
    layout: [['--rasd-space-16: 16px;', '--rasd-space-16: 20px;']],
  }[BREAK]
  if (!patches) {
    console.error(`RASD_DESIGN_BREAK=${BREAK}: القيم colour أو layout أو numerals.`)
    process.exit(1)
  }
  // نسختان من التوكنز: صفحات الإضافة (`:root`) والطبقة فوق الصفحة (`:host` في جذر الظلّ).
  const files = ['tokens.css', 'tokens-shadow.css'].map((f) => join(EXT, 'assets', f))
  const css = files.map((f) => readFileSync(f, 'utf8'))
  for (const [from, to] of patches) {
    if (!css.some((c) => c.includes(from))) {
      console.error(`RASD_DESIGN_BREAK=${BREAK}: لا «${from}» في التوكنز المبنيّة — عدِّل النمط.`)
      process.exit(1)
    }
    for (let i = 0; i < css.length; i++) css[i] = css[i].replaceAll(from, to)
  }
  files.forEach((f, i) => writeFileSync(f, css[i]))
  console.log(`  ! تخريب مقصود لإثبات السالب: ${BREAK}`)
}

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
    `--force-device-scale-factor=${DPR}`,
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

/**
 * **تبويب جولة التعريف يُغلق قبل أوّل مشهد.** التحميل تثبيتٌ في ملفّ تعريف جديد، والتثبيت يفتح
 * التأهيل ويقدّمه إلى الواجهة ما دام ما فيها صفحةً غريبة (`background/install-flow.ts`) — وفي الواجهة هنا
 * `about:blank`. فكان يصل بعد مشهدٍ فُتح ويخفيه، وصفحةٌ مخفيّة لا ترسم إطارًا فيعلق `settle()` بلا نهاية.
 * يُنتظر التبويب حتى يظهر ثمّ يُغلق، فتبدأ المشاهد على متصفّح هادئ.
 */
{
  const installUrl = `${ORIGIN}/src/pages/onboarding/index.html`
  const deadline = Date.now() + 15_000
  let closed = false
  while (!closed && Date.now() < deadline) {
    const { targetInfos } = await send('Target.getTargets')
    const tab = targetInfos.find((t) => t.type === 'page' && t.url === installUrl)
    if (tab) {
      await send('Target.closeTarget', { targetId: tab.targetId })
      closed = true
    } else {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  if (!closed) console.log('  ! لم يظهر تبويب جولة التعريف عند التثبيت خلال 15 ثانية')
}

/** صفحة جديدة بمقاس الإطار ووضعه — تُرجع أدوات تقييمها ولقطتها وإغلاقها. */
async function openPage(url, mode, { beforeLoad } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false },
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
/**
 * axe على المشهد كما هو. فوق صفحة: جذر الطبقة المغلق يُكشف لـaxe من CDP، والفحص على المضيف وحده.
 * وفي صفحة إضافة: المستند كلّه.
 */
async function audit(page, frame, mode) {
  /*
   * **صفحةٌ ضخمة لا يُشغَّل عليها axe.** يبني شجرة المستند كلّه قبل أن يقصر الفحص على المضيف، فعلى صفحة
   * بثلاثمئة ألف عنصر (`contrast-audit / scanning`) يشغل الخيط دقائق ويعلّق الجولة كلّها بلا سطر — قِيس في
   * `STAGES/24`. واللوحة نفسها تُفحص في مشهدَي «الخمول» و«النتائج» على صفحة عادية.
   */
  if ((await page.evaluate('document.getElementsByTagName("*").length')) > AXE_MAX_ELEMENTS) {
    axeSkipped.push(`${frame} · ${mode}`)
    return
  }
  const { root: doc } = await send('DOM.getDocument', { depth: -1, pierce: true }, page.sessionId)
  const html = doc.children?.find((n) => n.nodeName === 'HTML')
  const host = html?.children?.find((n) => n.shadowRoots?.[0]?.shadowRootType === 'closed')
  if (host) {
    const hostObj = await send('DOM.resolveNode', { nodeId: host.nodeId }, page.sessionId)
    const rootObj = await send(
      'DOM.resolveNode',
      { nodeId: host.shadowRoots[0].nodeId },
      page.sessionId,
    )
    await send(
      'Runtime.callFunctionOn',
      {
        objectId: hostObj.object.objectId,
        functionDeclaration: `function (root) {
          Object.defineProperty(this, 'shadowRoot', { get: () => root, configurable: true })
          this.setAttribute('data-rasd-axe-host', '')
        }`,
        arguments: [{ objectId: rootObj.object.objectId }],
      },
      page.sessionId,
    )
  }
  if (!(await page.evaluate('typeof axe !== "undefined"'))) await page.evaluate(AXE_SOURCE)
  const context = host ? `{ include: [['[data-rasd-axe-host]']] }` : 'document'
  const violations = await page.evaluate(
    `axe.run(${context}, { resultTypes: ['violations'] }).then((r) => r.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target, summary: n.failureSummary })) })))`,
  )
  axeScenes++
  for (const v of violations) axeFindings.push({ frame, mode, ...v })
}

/**
 * لوحة المفاتيح على صفحة إضافة: Tab حتى يعود التركيز إلى أوّل محطّة أو تبلغ الحدّ، وكل محطّة يُسأل
 * عنها: هل يرى المستخدم أين التركيز؟ الأثر حدٌّ أو ظلّ على العنصر أو على أقرب ثلاثة آباء (بطاقة
 * المكتبة ترسم حلقتها على الحاوية بـ`:has()`). والمشهد يُعاد بعدها إلى حاله بإعادة التحميل؟ لا —
 * اللقطة أُخذت قبله، والمشهد التالي يفتح صفحته.
 */
async function walkKeys(page, frame, mode) {
  if (!(await page.evaluate('location.protocol === "chrome-extension:"'))) return
  keyScenes++
  if (stripFocus) {
    await page.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'), {
      textContent: '*, *:focus, *:focus-visible, *:focus-within, *:has(:focus-visible) { outline: none !important; box-shadow: none !important }',
    }))`)
  }
  const seen = []
  const trail = []
  for (let i = 0; i < MAX_TAB_STOPS; i++) {
    for (const type of ['keyDown', 'keyUp']) {
      await send(
        'Input.dispatchKeyEvent',
        { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
        page.sessionId,
      )
    }
    const stop = await page.evaluate(`(() => {
      let a = document.activeElement
      while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
      if (!a || a === document.body) return null
      const marked = (el) => {
        const cs = getComputedStyle(el)
        return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
      }
      let el = a, visible = false
      for (let d = 0; d < 4 && el && !visible; d++, el = el.parentElement) visible = marked(el)
      const name = (a.getAttribute('aria-label') || a.textContent || a.getAttribute('placeholder') || '').trim().slice(0, 40)
      // حوارٌ مشروط مفتوح: كل محطّة يجب أن تكون داخله، وإلا خرج Tab إلى صفحةٍ لا يراها المستخدم (المرحلة 24).
      const modal = document.querySelector('[aria-modal="true"]')
      const outside = modal ? !modal.contains(a) : false
      return { key: a.tagName + '|' + name + '|' + Math.round(a.getBoundingClientRect().x) + ',' + Math.round(a.getBoundingClientRect().y), tag: a.tagName.toLowerCase(), name, visible, outside }
    })()`)
    if (!stop) continue
    if (seen.includes(stop.key)) break
    seen.push(stop.key)
    trail.push(`${stop.tag} «${stop.name}»`)
    keyStops++
    if (!stop.visible) keyFindings.push({ frame, mode, tag: stop.tag, name: stop.name })
    if (stop.outside)
      keyFindings.push({ frame, mode, tag: stop.tag, name: `خارج الحوار: ${stop.name}` })
  }
  keyTrails.push({ frame, mode, stops: trail })
}

/**
 * سياسة الأرقام على ما يراه المستخدم (`AGENTS.md` §4: الهندية للعدّ البشري، والغربية للقياسات والقيم
 * التقنية — `shared/bidi/isolate.ts`). تُقاس على النصّ المرسوم بعد أن حسب Chrome اتّجاهه، لا على الشيفرة:
 *
 *  - **خلط (`mixed`):** عقدة نصّ فيها نظاما الأرقام معًا — «٣٠x» أو «٣ من 10». الصنفان لا يلتقيان في
 *    عقدة: العدّ البشري عقدةٌ والقيمة التقنية عقدةٌ معزولة.
 *  - **انقلاب (`bidi-hazard`):** رقمان غربيّان يفصلهما محايدٌ وحده في عقدة اتّجاهها المحسوب `rtl` بلا عزل —
 *    `1440 × 900` تُعرَض `900 × 1440` (الأرقام تأخذ حكم R في N1 فتُرتَّب الجزر باتّجاه المحيط). وهذا ما
 *    تحرسه قاعدة `dimensionIsolationSelector` في ESLint على الشيفرة، وهنا يُقاس على ما رُسم. وما يفصله
 *    حرفٌ أو كلمة (`17043 بكسل مختلف من 1024000`) لا ينقلب، وما كان بين محرفَي عزل (`⁦3 : 1⁩`) أو في عقدةٍ
 *    اتّجاهها المحسوب `ltr` (قيمة تقنية في `<bdi>` أو `direction: ltr`) معزول. وعزلُ عنصرٍ يحوي النصّ كلّه
 *    لا يكفي: يعزله عمّا حوله لا بعضَه عن بعض.
 *
 * وجذرها المستند في صفحة إضافة، وجذر الظلّ المغلق للطبقة فوق الصفحة (يُسلَّم عبر CDP كما في axe).
 * وما يعرضه المضيف من نصّ الصفحة نفسها خارج الجذر فلا يُفحص.
 */
const NUMERAL_SCAN = `function () {
  const root = this
  const WEST = /[0-9]/, EAST = /[٠-٩]/
  // رقمان بينهما محايدٌ وحده: بعد حذف ما بين محرفَي العزل. الفاصل المفرد بلا مسافة (16:9 · 1.7 · 1/2) يلتحم رقمًا واحدًا (W4).
  const HAZARD = /[0-9][^\\p{L}\\p{N}]+[0-9]/u
  const JOINED = /^[:.,\\/]$/
  const doc = root.ownerDocument ?? root
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    const west = WEST.test(text), east = EAST.test(text)
    if (!west && !east) continue
    const el = node.parentElement
    if (!el || el.closest('script, style, noscript, textarea')) continue
    if (el.getClientRects().length === 0) continue
    const excerpt = text.trim().slice(0, 60)
    if (west && east) {
      hits.push({ kind: 'mixed', text: excerpt })
      continue
    }
    if (!west || getComputedStyle(el).direction !== 'rtl') continue
    const bare = text.replace(/[\\u2066-\\u2068][^\\u2069]*\\u2069/g, ' ')
    const match = HAZARD.exec(bare)
    if (match && !JOINED.test(match[0].slice(1, -1))) hits.push({ kind: 'bidi-hazard', text: excerpt })
  }
  return hits
}`

const numeralFindings = []
let numeralScenes = 0

/** يفحص الأرقام في جذور Rasd المرئية في المشهد — المستند في صفحة إضافة، وجذر الطبقة المغلق فوق صفحة. */
async function scanNumerals(page, frame, mode) {
  const { root: doc } = await send('DOM.getDocument', { depth: -1, pierce: true }, page.sessionId)
  const html = doc.children?.find((n) => n.nodeName === 'HTML')
  const host = html?.children?.find((n) => n.shadowRoots?.[0]?.shadowRootType === 'closed')
  const roots = []
  if (host) {
    roots.push(
      (await send('DOM.resolveNode', { nodeId: host.shadowRoots[0].nodeId }, page.sessionId))
        .object,
    )
  } else if (await page.evaluate('location.protocol === "chrome-extension:"')) {
    roots.push((await send('Runtime.evaluate', { expression: 'document' }, page.sessionId)).result)
  }
  for (const root of roots) {
    const { result } = await send(
      'Runtime.callFunctionOn',
      {
        objectId: root.objectId,
        functionDeclaration: NUMERAL_SCAN,
        returnByValue: true,
      },
      page.sessionId,
    )
    numeralScenes++
    for (const hit of result.value ?? []) numeralFindings.push({ frame, mode, ...hit })
  }
}

const INTERACTIVE = new Set([
  'button',
  'link',
  'checkbox',
  'switch',
  'tab',
  'radio',
  'textbox',
  'searchbox',
  'combobox',
  'menuitem',
  'slider',
  'spinbutton',
  'listbox',
  'option',
])
const STRUCTURAL = new Set([
  'heading',
  'dialog',
  'alertdialog',
  'status',
  'alert',
  'progressbar',
  'tablist',
  'tabpanel',
  'navigation',
  'main',
  'region',
  'img',
])

/** شجرة الإتاحة كما يبنيها Chrome، مكتوبةً خطَّ أساس يُقرأ بالعين. */
async function writeTree(page, file, title) {
  const { nodes } = await send('Accessibility.getFullAXTree', {}, page.sessionId)
  const live = nodes.filter((n) => !n.ignored)
  const rows = live
    .map((n) => ({ role: n.role?.value ?? '', name: (n.name?.value ?? '').trim() }))
    .filter((r) => INTERACTIVE.has(r.role) || STRUCTURAL.has(r.role))
  const unnamed = rows.filter((r) => INTERACTIVE.has(r.role) && !r.name).length
  const body =
    `# شجرة الإتاحة — ${title}\n\n` +
    'مولَّدة بـ`pnpm design:shots --baselines` من `Accessibility.getFullAXTree` في Chrome حقيقي،\n' +
    'بالوضع الداكن وRTL. **تُقرأ بالعين ولا تُقارَن آليًّا**: التغيّر فيها متوقَّع مع كل إضافة،\n' +
    'والمقصود أن يمرّ عليها قارئ حين يتغيّر شيء — لا أن تُسقط البناء.\n\n' +
    `العناصر التفاعلية والبنيوية: ${rows.length} · **بلا اسم: ${unnamed}** (من ${live.length} عقدة فعّالة)\n\n` +
    '```\n' +
    rows.map((r) => `${r.role} — ${r.name || '(بلا اسم)'}`).join('\n') +
    '\n```\n'
  mkdirSync(dirname(join(BASELINES, file)), { recursive: true })
  writeFileSync(join(BASELINES, file), body)
  baselineLog.push(`${file} — ${rows.length} عنصرًا، بلا اسم ${unnamed}`)
}

const ctx = {
  ORIGIN,
  BASE,
  send,
  openPage,
  async shot(page, frame, mode, clip) {
    await page.shot(shotName(frame, mode), clip)
    if (runAxe) await audit(page, frame, mode)
    if (runKeys) await walkKeys(page, frame, mode)
    if (runNumerals) {
      /*
       * سالب الأرقام: بُعدان غربيّان بينهما × في فقرة عربية بلا عزل، يُحقنان **بعد** اللقطة فلا يمسّان
       * البكسلات — يثبت أن الفحص يرى نصًّا مرسومًا لا يعتمد على بكسل. في صفحات الإضافة وحدها.
       */
      if (
        BREAK === 'numerals' &&
        (await page.evaluate('location.protocol === "chrome-extension:"'))
      ) {
        await page.evaluate(`document.body.append(Object.assign(document.createElement('p'), {
          textContent: 'حجم الصورة 1440 × 900', dir: 'rtl' })) && true`)
      }
      await scanNumerals(page, frame, mode)
    }
    if (writeBaselines) {
      const target = BASELINE_SHOTS[`${frame}|${mode}`]
      if (target) {
        mkdirSync(dirname(join(BASELINES, target)), { recursive: true })
        copyFileSync(shotName(frame, mode), join(BASELINES, target))
        baselineLog.push(target)
      }
      const tree = BASELINE_TREES[`${frame}|${mode}`]
      if (tree) await writeTree(page, ...tree)
    }
  },
}

/** خطوط أساس ليست مشهدًا من المجموعات: المعرض بأوضاعه الأربعة، وشبكة حالات النافذة كاملة. */
async function extraBaselines() {
  for (const mode of MODES) {
    for (const dir of ['rtl', 'ltr']) {
      const page = await openPage(`${ORIGIN}/src/pages/gallery/index.html`, mode)
      await page.waitFor(`document.querySelector('[aria-label="الاتجاه"]')`)
      if (dir === 'ltr') {
        await page.evaluate(`[...document.querySelectorAll('[aria-label="الاتجاه"] button')]
          .find((b) => b.textContent.trim() === 'LTR').click()`)
        await page.waitFor('document.documentElement.dir === "ltr"')
      }
      // نموذج `Menu` في المعرض يركّز عنصره عند التركيب فيمرّر المتصفّح إليه — والخطّ رأسُ المعرض.
      await page.evaluate('window.scrollTo(0, 0)')
      await page.settle()
      const file = `phase-05/gallery-${mode}-${dir}.png`
      mkdirSync(dirname(join(BASELINES, file)), { recursive: true })
      await page.shot(join(BASELINES, file))
      baselineLog.push(file)
      if (mode === 'dark' && dir === 'rtl') {
        await writeTree(page, 'phase-05/gallery-rtl-a11y-tree.md', 'معرض المكوّنات')
      }
      await page.close()
    }
  }
  const grid = await openPage(`${ORIGIN}/src/pages/popup-preview/index.html?theme=dark`, 'dark')
  await grid.waitFor('document.querySelectorAll("[data-popup-state]").length >= 12')
  /*
   * **الحركة تُجمَّد قبل لقطة الشبكة.** حالة «الالتقاط» فيها خطّ مسحٍ يتحرّك، فيختلف موضعه بين لقطتين
   * متتاليتين لشاشةٍ واحدة (1304 بكسلًا، 12.5% في بلاطته) — وهذا ضجيجٌ يضيّق هامش `verify:visual`
   * (`Docs/ADR/0052-visual-regression.md`). خطّ الأساس لا يتعلّق بطور حركة.
   */
  await grid.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'), {
    textContent: '*, *::before, *::after { animation: none !important; transition: none !important }',
  })) && true`)
  await grid.settle()
  const { contentSize } = await send('Page.getLayoutMetrics', {}, grid.sessionId)
  mkdirSync(join(BASELINES, 'phase-07'), { recursive: true })
  await grid.shot(join(BASELINES, 'phase-07/popup-states-dark-rtl.png'), {
    x: 0,
    y: 0,
    width: Math.ceil(contentSize.width),
    height: Math.ceil(contentSize.height),
  })
  baselineLog.push('phase-07/popup-states-dark-rtl.png')
  await grid.close()
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
    const started = Date.now()
    try {
      const n = await run(ctx, mode)
      total += n
      console.log(`  ✓ ${name} · ${mode} — ${n} (${Math.round((Date.now() - started) / 1000)}s)`)
    } catch (e) {
      console.log(`  ✗ ${name} · ${mode} — ${e.message}`)
    }
  }
}
if (writeBaselines && (!only.length || forceExtras)) {
  try {
    await extraBaselines()
  } catch (e) {
    console.log(`  ✗ خطوط الأساس الإضافية — ${e.message}`)
  }
}
console.log(`\n${total} لقطة في ${SHOTS}`)
if (runKeys) {
  writeFileSync(join(OUT, 'keys.json'), JSON.stringify(keyFindings, null, 2))
  writeFileSync(join(OUT, 'keys-trails.json'), JSON.stringify(keyTrails, null, 2))
  console.log(
    `لوحة المفاتيح: ${keyScenes} مشهدًا، ${keyStops} محطّة تركيز، ${keyFindings.length} بلا أثر مرئي أو خارج حوارٍ مشروط`,
  )
  const byName = {}
  for (const f of keyFindings)
    byName[`${f.tag} «${f.name}»`] = (byName[`${f.tag} «${f.name}»`] ?? 0) + 1
  for (const [k, n] of Object.entries(byName)) console.log(`  ${k}: ${n}`)
}
if (runAxe) {
  writeFileSync(join(OUT, 'axe.json'), JSON.stringify(axeFindings, null, 2))
  console.log(
    `axe: ${axeScenes} مشهدًا، ${axeFindings.length} مخالفة خطيرة أو حرجة → artifacts/design/axe.json`,
  )
  for (const skipped of axeSkipped) console.log(`  تخطّى axe (صفحة ضخمة): ${skipped}`)
  const byRule = {}
  for (const f of axeFindings) byRule[f.id] = (byRule[f.id] ?? 0) + 1
  for (const [id, n] of Object.entries(byRule)) console.log(`  ${id}: ${n}`)
}
if (runNumerals) {
  writeFileSync(join(OUT, 'numerals.json'), JSON.stringify(numeralFindings, null, 2))
  console.log(
    `الأرقام: ${numeralScenes} جذرًا مفحوصًا، ${numeralFindings.length} مخالفة → artifacts/design/numerals.json`,
  )
}
if (writeBaselines) {
  console.log(`خطوط الأساس (${baselineLog.length}) في tests/visual-baselines/:`)
  for (const line of baselineLog) console.log(`  ${line}`)
}
finish(0)
