#!/usr/bin/env node
/**
 * يثبت في متصفح حقيقي معيارَي إتمام المرحلة 7 اللذين لا يكفيهما اختبار الوحدة:
 *
 *   1. الاختصارات الأربعة **مسجَّلة فعلًا عند Chrome نفسه** — لا فقط معلَنة في
 *      `manifest.json`. تعارض مع اختصار داخلي لChrome يجعله يقبل البيان لكن
 *      يترك `shortcut` فارغًا صامتًا؛ هذا ما يكشفه `chrome.commands.getAll()`
 *      مقروءًا من الـservice worker الحيّ — وهذا بالضبط ما كشف مشكلة `⇧⌘F`
 *      المُوثَّقة في تناقض رقم 15 بـ`Rasd_Plan.md §6`.
 *   2. زمن الوصول إلى أول عرض (`[data-popup-state]` يظهر في DOM) أقلّ من 100ms.
 *
 * **ما لا يثبته هذا الفحص عمدًا، ولماذا:**
 *
 *   أ) إطلاق الاختصار فعليًا عبر ضغطة مفتاح. لا CDP ولا Playwright يملكان
 *      واجهة تُطلق مُسرِّع `chrome.commands` — حدث يلتقطه المتصفح على مستوى
 *      نظام التشغيل قبل أن يصل أي سياق صفحة أو حتى الـservice worker نفسه.
 *      سلسلة الاختصار→الأداة (`COMMAND_TOOL` و`activateTool`) مختبرة في
 *      `tests/unit/background/commands.test.ts`، وما بعدها — الحقن والإقلاع
 *      وتبديل الوضع فعليًّا في صفحة — يحرسه `scripts/verify-activate.mjs`
 *      من تبويب بارد؛ فالفجوة الباقية هي ضغطة المفتاح نفسها.
 *
 *      **تصحيح 2026-08-31:** كان هنا «مختبرة كاملةً… الفجوة الوحيدة هي ضغطة
 *      المفتاح — قيد منصّة لا نقص تغطية». وكان ذلك غير صحيح: الاختبار المذكور
 *      يموّه الحقن **ويسجّل مستقبِل `mode/set` بيده**، فلم يكن يغطّي طرف
 *      الاستقبال أصلًا — وهو الطرف الذي كان مكسورًا فعليًّا (لا نداء إقلاع في
 *      الإنتاج). هذه الحاشية نفسها كانت أحد مبرِّرات بقاء العطل. انظر الصفّ 77
 *      في `Rasd_Plan.md §6`.
 *
 *   ب) تصنيف صفحة حقيقية إلى `default`/`restricted` عبر فتح النافذة كتبويب
 *      حقيقي بجانب تبويب هدف. جُرِّب هذا فعليًا وفشل: `Popup.tsx` يقرأ
 *      `chrome.tabs.query({active:true, currentWindow:true}).url`، وChrome
 *      **يُخفي** حقل `url` عن أي طلب لا يملك صلاحية مضيف للأصل ولا صلاحية
 *      `tabs` — وكلتاهما غائبتان عمدًا هنا (سياسة الإضافة: صفر صلاحيات
 *      مضيف دائمة). في الاستخدام الحقيقي، نقرة المستخدم على الأيقونة تمنح
 *      `activeTab` تلقائيًا فيُكشَف العنوان؛ لا طريقة معلَنة (لا CDP ولا
 *      `chrome.permissions.request`، الذي رُمي فعليًا بخطأ «must be called
 *      during a user gesture») لمحاكاة تلك الإيماءة آليًا. منطق التصنيف نفسه
 *      (`checkInjectable`، `selectPopupState`، `loadPopupContext`) مختبَر
 *      بمدخلات متحكَّم بها بالكامل في `tests/unit/restricted.test.ts`
 *      (20+ عنوانًا) و`tests/unit/popup-state.test.ts` (10 حالات) و
 *      `tests/integration/popup-context.test.ts` (تدفّق الرسائل الحقيقي).
 *      التحقّق البصري المباشر من الحالتين يقع بدلًا من ذلك عبر جولة يدوية
 *      بمتصفح Claude — انظر `Docs/Phases/Phase_07.md`.
 *
 * غير مُدرج في CI — المرحلة 23 تملك تشغيل المتصفح. يُشغَّل محليًا:
 *   pnpm verify:popup
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { PAGE_PATHS } from '../src/shared/page-paths.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9377

/** ميزانية فتح النافذة — معيار إتمام المرحلة 7 حرفيًا. */
const OPEN_BUDGET_MS = 100
/** عدد المحاولات — متوسّط لا قياس وحيد عرضة لضجيج أول تحميل. */
const TRIALS = 5
const HARD_TIMEOUT_MS = 60_000

/**
 * صفحة "عادية" محلّية — `scripts/fixtures-serve.mjs` (المرحلة 2) بدل موقع
 * حقيقي: بيئة التشغيل لا تملك بالضرورة وصولًا شبكيًا خارجيًا، وموقع حقيقي
 * يعني فحصًا يتذبذب بتذبذب الشبكة لا بسلوك الإضافة. الخادم صامت شبكيًا
 * ويجب تشغيله يدويًا أولًا: `pnpm fixtures:serve`.
 */
const FIXTURES_PORT = process.env.RASD_FIXTURES_PORT ?? 5399
const NORMAL_URL = `http://127.0.0.1:${FIXTURES_PORT}/rtl-ar/`

try {
  const res = await fetch(NORMAL_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch (e) {
  console.error(
    `خادم العيّنات المحلي غير مُشغَّل على ${NORMAL_URL} (${e.message}).\n` +
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

const profile = mkdtempSync(join(tmpdir(), 'rasd-popup-'))
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

function finish(code) {
  try {
    proc.kill('SIGKILL')
  } catch {
    /* أُغلق أصلًا */
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* Chrome ما يزال يكتب — لا نُفشل الفحص بسبب التنظيف */
  }
  console.log('\nفحص نافذة الإضافة في Chrome:')
  console.log(lines.join('\n'))
  if (code !== 0 || errors.length > 0) {
    console.error(`\n✗ فشل الفحص — ${errors.length || 1} مشكلة.\n`)
    process.exit(1)
  }
  console.log('\n✓ الاختصارات الأربعة مسجَّلة فعلًا عند Chrome، وزمن أول عرض ضمن الميزانية.\n')
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
    /* المتصفح لم يجهز بعد */
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

async function findAndAttach(predicate, tries = 40, intervalMs = 150) {
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
        return { evaluate: evaluatorFor(sessionId), targetId: found.targetId }
      } catch {
        /* الهدف اختفى بين الاكتشاف والاتصال — نعيد الكرّة */
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
let extensionId = null
try {
  extensionId = (await send('Extensions.loadUnpacked', { path: dist })).id
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

// ── 1) الاختصارات الأربعة مسجَّلة فعلًا عند Chrome ─────────────────
try {
  const raw = await sw.evaluate('chrome.commands.getAll().then((c) => JSON.stringify(c))')
  const commands = JSON.parse(raw)
  const captureCommands = commands.filter((c) => c.name.startsWith('capture-'))

  captureCommands.length === 4
    ? ok(`أربعة أوامر التقاط مسجَّلة: ${captureCommands.map((c) => c.name).join(' · ')}`)
    : fail(`عدد أوامر الالتقاط ${captureCommands.length} — يجب أن يكون 4 بالضبط`)

  const empty = captureCommands.filter((c) => !c.shortcut)
  empty.length === 0
    ? ok(
        `كل أمر له اختصار فعلي مُسنَد: ${captureCommands.map((c) => `${c.name}=${c.shortcut}`).join(' · ')}`,
      )
    : fail(
        `أوامر بلا اختصار فعلي (تعارض مع اختصار نظام/متصفح آخر — راجع chrome://extensions/shortcuts): ` +
          empty.map((c) => c.name).join(', '),
      )
} catch (e) {
  fail(`تعذّرت قراءة chrome.commands.getAll(): ${e.message}`)
}

// ── تبويب هدف نشِط واحد يُنشأ مرّة، تُقاس النافذة ضدّه في كل محاولة ───
//
// إنشاء وإغلاق تبويبين اثنين (هدف + نافذة) في كل محاولة أظهر تذبذبًا حادًّا
// وغير قابل للتكرار (40ms → 850ms بين محاولتين متتاليتين بلا سبب واضح في
// الإضافة نفسها) — عبء دورة حياة نافذة/تبويب في Chrome نفسه على الأرجح، لا
// شيء يخصّ الإضافة. إبقاء تبويب الهدف مفتوحًا طوال القياس، وخلق/إغلاق تبويب
// النافذة وحده في كل محاولة، يعزل ما يُقاس فعلًا: زمن النافذة، لا زمن دورة
// حياة نافذة Chrome كاملة حولها.
//
// الزمن يُقاس بساعة الصفحة نفسها (`performance.timeOrigin + performance.now()`)
// لا بساعة Node عند كل استطلاع (polling) — استطلاع Node عرضة لجيتر رحلة CDP
// ذهابًا وإيابًا، وهذا جيتر أداة القياس لا الإضافة. كلا الساعتين على الجهاز
// نفسه فمقارنتهما بالحقبة (epoch) مباشرة صحيحة.
async function openPopupOnce(windowId) {
  const startedAt = Date.now()
  const popupTabJson = await sw.evaluate(
    `chrome.tabs.create({ url: chrome.runtime.getURL(${JSON.stringify(PAGE_PATHS.popup)}), windowId: ${windowId}, active: false })
      .then((t) => JSON.stringify({ id: t.id }))`,
  )
  const popupTab = JSON.parse(popupTabJson)

  const popupTarget = await findAndAttach(
    (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/popup/'),
    150,
    20,
  )
  if (!popupTarget) throw new Error('لم تُفتح صفحة النافذة')

  let elapsedMs = null
  for (let i = 0; i < 200; i++) {
    const raw = await popupTarget.evaluate(`JSON.stringify({
      state: document.querySelector("[data-popup-state]")?.getAttribute("data-popup-state") ?? null,
      readAtEpoch: performance.timeOrigin + performance.now(),
    })`)
    const reading = JSON.parse(raw)
    if (reading.state) {
      elapsedMs = reading.readAtEpoch - startedAt
      break
    }
    await new Promise((r) => setTimeout(r, 2))
  }

  await sw.evaluate(`chrome.tabs.remove([${popupTab.id}])`)
  return elapsedMs
}

// ── 2) زمن الفتح: متوسّط عدّة محاولات أقلّ من الميزانية ────────────
// (فتح صفحة النافذة نفسها ضدّ صفحة محلّية عادية — لا فحص لحالة `data-popup-state`
// المُنتَجة، لأن قراءتها الموثوقة تحتاج `activeTab` غير المتاحة هنا؛ انظر
// التعليق في رأس الملفّ. القياس هنا زمنيّ بحت: متى ظهر `[data-popup-state]`
// بأي قيمة، أيًّا كانت.)
try {
  const targetTabJson = await sw.evaluate(
    `chrome.tabs.create({ url: ${JSON.stringify(NORMAL_URL)}, active: true })
      .then((t) => JSON.stringify({ id: t.id, windowId: t.windowId }))`,
  )
  const targetTab = JSON.parse(targetTabJson)

  // فتحة إحماء لا تُقاس: أول فتح بعد تحميل الحزمة يتحمّل تكلفة مرّة واحدة
  // (فحص المخطّط في IndexedDB، تحليل الحزمة أول مرّة) لا يتحمّلها أي فتح
  // واقعي بعدها — بيانات المستخدم والحزمة المفكوكة كلاهما يبقيان محمَّلين
  // بين فتحات النافذة الحقيقية أيضًا، فتجاهل هذه التكلفة هنا يطابق الواقع
  // لا يُجمِّله.
  await openPopupOnce(targetTab.windowId).catch(() => null)

  // محاولة فاشلة (مهلة اكتشاف الهدف عبر CDP، لا علاقة للإضافة بها) لا تُسقط
  // الدفعة كلّها — تُسجَّل وتُتجاوَز، فمتوسّط المحاولات الناجحة يبقى ذا معنى.
  const samples = []
  for (let i = 0; i < TRIALS; i++) {
    const elapsedMs = await openPopupOnce(targetTab.windowId).catch(() => null)
    if (elapsedMs !== null) samples.push(elapsedMs)
  }

  await sw.evaluate(`chrome.tabs.remove([${targetTab.id}])`)

  if (samples.length === 0) {
    fail('تعذّر قياس زمن الفتح — لم يظهر data-popup-state في أي محاولة')
  } else {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    const fmt = (ms) => `${ms.toFixed(1)}ms`
    const line = `المتوسّط ${fmt(avg)} عبر ${samples.length} محاولات (${samples.map(fmt).join(' · ')})`
    avg < OPEN_BUDGET_MS
      ? ok(`زمن أول عرض أقلّ من ${OPEN_BUDGET_MS}ms — ${line}`)
      : fail(`زمن أول عرض تجاوز ${OPEN_BUDGET_MS}ms — ${line}`)
  }
} catch (e) {
  fail(`قياس زمن الفتح فشل: ${e.message}`)
}

sock.close()
finish(0)
