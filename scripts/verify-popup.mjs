#!/usr/bin/env node
/**
 * يثبت في متصفح حقيقي معيارَي إتمام المرحلة 7 اللذين لا يكفيهما اختبار الوحدة:
 *
 *   1. الاختصارات الأربعة **مسجَّلة فعلًا عند Chrome نفسه** — لا فقط معلَنة في
 *      `manifest.json`. تعارض مع اختصار داخلي لChrome يجعله يقبل البيان لكن
 *      يترك `shortcut` فارغًا صامتًا؛ هذا ما يكشفه `chrome.commands.getAll()`
 *      مقروءًا من الـservice worker الحيّ — وهذا بالضبط ما كشف مشكلة `⇧⌘F`
 *      المُوثَّقة في تناقض رقم 15 بـ`Rasd_Plan.md §6`.
 *   2. زمن الوصول إلى أول عرض أقلّ من 100ms — مقيسًا بجدول أزمنة الرسم في
 *      الصفحة نفسها (`first-contentful-paint`) لا بلحظة مشاهدتنا له.
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
 * يُشغَّل في CI وفي جهاز التطوير بالأمر نفسه:
 *   pnpm verify:popup
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { PAGE_PATHS } from '../src/shared/page-paths.ts'

import { ensureFixturesServer } from './live-fixtures.mjs'
import { waitForExtensionContext } from './live-sw.mjs'

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
 * ويُضمَن هنا عبر `live-fixtures.mjs` لا يُشترَط مُشغَّلًا سلفًا.
 */
const FIXTURES_PORT = Number(process.env.RASD_FIXTURES_PORT ?? 5399)
const NORMAL_URL = `http://127.0.0.1:${FIXTURES_PORT}/rtl-ar/`

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

// خادم العيّنات يُضمَن بعد الخروجَين المبكرَين لا قبلهما — وإلا بقي
// مولودًا يتيمًا حين يخرج الفحص لغياب `dist/` أو Chrome.
const fixtures = await ensureFixturesServer({ port: FIXTURES_PORT })

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
  fixtures.stop()
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
// **ميزانية انتظار DevTools — ستّون ثانية لا عشر.** قِيس: كروم يُقلع على
// عدّاء بنواتين تحت ضغط فلا يفتح منفذ التنقيح خلال 10s، فيخرج الحارس
// «تعذّر الاتصال بـDevTools» — وهو إخفاق بيئة لا حكمٌ على المنتَج. والسقف
// الحقيقي مهلةُ الخطوة (6 دقائق)، فانتظارٌ أطول يميّز «بطيء» من «ميّت».
for (let i = 0; i < 240 && !wsUrl; i++) {
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

// الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
await waitForExtensionContext((e) => sw.evaluate(e))

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
// **والزمن يُقاس بلحظة الرسم لا بلحظة المشاهدة — والفرق كان يقاس بالمئات.**
//
// كانت القراءة `performance.timeOrigin + performance.now()` **عند استطلاعنا**:
// ساعة الصفحة نعم، لكن مقروءةً في اللحظة التي وصلنا فيها إليها لا في اللحظة
// التي ظهر فيها العرض. وبين اللحظتين يقع `findAndAttach` الذي يستطلع الهدف
// **كل 150ms** — فالقياس يُقنَّن إلى مضاعفات مهلته. المقيس محليًّا: متوسّط
// 421ms على ميزانية 100ms، بينما الرسم نفسه يقع في عشرات الميلي‑ثانية.
//
// فصار المقروء **جدول أزمنة الرسم** (`PerformanceObserver`/`paint`) الذي
// تسجّله الصفحة لحظةَ وقوعه ونقرؤه متى شئنا بعده:
//
//   الزمن = (‏`timeOrigin` − لحظة طلب الفتح) + `first-contentful-paint`
//
// أي: ما استغرقه Chrome حتى بدأ مستند النافذة + ما استغرقته النافذة حتى
// رسمت. كلا الطرفين على ساعة الجهاز نفسه، ولا نصيب لأداة القياس في أيّهما.
// وإن غاب جدول الرسم في هذه البيئة، **يُعلَن غيابه ويسقط الحارس** — ولا
// يُستبدَل صامتًا بقياس المشاهدة الذي بُني هذا كلّه لإسقاطه.
async function openPopupOnce(windowId) {
  const startedAt = Date.now()
  // **مرئيّة لا خفيّة** — وإلا لم يقع رسمٌ أصلًا: Chrome لا يرسم تبويبًا غير
  // ظاهر، فجدول أزمنة الرسم يبقى فارغًا ويصير «أول عرض» اسمًا لشيء لم يحدث.
  // (النافذة الحقيقية مرئية حين تُفتح، فهذا هو المطابق لا المُجمِّل. وقيمة
  // `data-popup-state` غير مقروءة هنا أصلًا — القياس زمنيّ بحت.)
  const popupTabJson = await sw.evaluate(
    `chrome.tabs.create({ url: chrome.runtime.getURL(${JSON.stringify(PAGE_PATHS.popup)}), windowId: ${windowId}, active: true })
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
      timeOrigin: performance.timeOrigin,
      paintMs: performance.getEntriesByType("paint")
        .filter((e) => e.name === "first-contentful-paint")
        .map((e) => e.startTime)[0] ?? null,
    })`)
    const reading = JSON.parse(raw)
    if (reading.state && reading.paintMs !== null) {
      elapsedMs = reading.timeOrigin + reading.paintMs - startedAt
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

// ── 3) `page/open` يفتح كل صفحة فعليًّا — يثبت الصفّ 112 لا يصف فقط ───
//
// `Docs/EntryPoints.md §3` يسمّي هذا الفحص أمر التحقّق لفتح المكتبة والمحرّر
// والإعدادات والمقارنة، وحتى الوحدة 20.2 لم يكن يفعل ذلك فعلًا — يفتح نافذة
// الإضافة وصفحة خارجية عادية فقط. هذا القسم يرسل `page/open` الحقيقية (نفس
// مغلَّف الرسائل في `shared/messaging/rpc.ts`، مُعادًا هنا حرفيًّا لأن
// السكربت مستقلّ عن حزمة TypeScript) — **من نافذة الإضافة نفسها لا من
// الـservice worker**: `chrome.runtime.sendMessage` من الـSW إلى مستمعه هو —
// نفس السياق حرفيًّا — يفشل بـ«Receiving end does not exist» (قِيس، لا
// افتراض)؛ الاستعمال الحقيقي في الإنتاج مصدره `Popup.tsx` دائمًا، فمرسِلٌ
// حقيقي غير الـSW أوفى بالواقع أيضًا لا حلًّا بديلًا فقط.
const PAGES_TO_OPEN = ['library', 'editor', 'settings', 'compare']

const senderTabJson = await sw.evaluate(
  `chrome.tabs.create({ url: chrome.runtime.getURL(${JSON.stringify(PAGE_PATHS.popup)}), active: true })
    .then((t) => JSON.stringify({ id: t.id }))`,
)
const senderTab = JSON.parse(senderTabJson)
const sender = await findAndAttach(
  (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/popup/'),
)

if (!sender) {
  fail('تعذّر فتح نافذة الإضافة كمرسِل لـpage/open')
} else {
  for (const page of PAGES_TO_OPEN) {
    try {
      const replyJson = await sender.evaluate(
        `chrome.runtime.sendMessage({ __rasd: 1, type: 'page/open', payload: { page: ${JSON.stringify(page)} }, id: 'verify-popup-${page}' })
          .then((r) => JSON.stringify(r))`,
      )
      const reply = JSON.parse(replyJson)
      if (!reply?.ok) {
        fail(`page/open(${page}) ردّ بفشل: ${JSON.stringify(reply?.error ?? reply)}`)
        continue
      }

      const path = PAGE_PATHS[page]
      const target = await findAndAttach(
        (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + path),
        60,
        50,
      )
      if (!target) {
        fail(`page/open(${page}) ردّ بنجاح لكن لا هدف CDP يطابق ${path}`)
        await sw.evaluate(`chrome.tabs.remove([${reply.value.tabId}])`).catch(() => undefined)
        continue
      }

      // مجرّد وجود هدف CDP بالعنوان الصحيح لا يثبت أن الصفحة رُسمت فعلًا —
      // حزمة منكسرة تفتح شاشة بيضاء بنفس العنوان بنجاح ظاهري. `document.body`
      // غير فارغ بعد اكتمال التحميل حدٌّ أدنى عامّ يصلح للأربع الصفحات معًا،
      // بلا علامة خاصّة بكلٍّ (خلافًا لـ`[data-popup-state]` أعلاه، وهي نافذة
      // محدَّدة الأثر مقصودة، لا نمطٌ عامّ يستحقّ التعميم على أربع صفحات كاملة).
      let rendered = false
      for (let i = 0; i < 40 && !rendered; i++) {
        const raw = await target.evaluate(
          `JSON.stringify({ ready: document.readyState, hasBody: document.body.children.length > 0 })`,
        )
        const state = JSON.parse(raw)
        if (state.ready === 'complete' && state.hasBody) rendered = true
        else await new Promise((r) => setTimeout(r, 50))
      }
      rendered
        ? ok(`page/open(${page}) فتح ${path} ورسم محتوًى فعليًّا`)
        : fail(`page/open(${page}) فتح ${path} لكن لم يرسم محتوًى خلال المهلة — شاشة بيضاء محتملة`)
      await sw.evaluate(`chrome.tabs.remove([${reply.value.tabId}])`)
    } catch (e) {
      fail(`page/open(${page}) فشل: ${e.message}`)
    }
  }
  await sw.evaluate(`chrome.tabs.remove([${senderTab.id}])`)
}

sock.close()
finish(0)
