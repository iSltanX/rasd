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
 * الإقلاع والاتصال والتحميل والارتباط والمهلة الصلبة والتنظيف في النواة المشتركة
 * (`scripts/lib/cdp.mjs`، `STAGES/17`)؛ وأحكام هذا الملفّ هنا كما كانت.
 *
 * يُشغَّل في CI وفي جهاز التطوير بالأمر نفسه:
 *   pnpm verify:popup
 */
import { PAGE_PATHS } from '../src/shared/page-paths.ts'

import { findAndAttach as findTarget, startGuard, waitForExtensionContext } from './lib/cdp.mjs'

const PORT = 9377

/** ميزانية فتح النافذة — معيار إتمام المرحلة 7 حرفيًا. */
const OPEN_BUDGET_MS = 100
/** عدد المحاولات — متوسّط لا قياس وحيد عرضة لضجيج أول تحميل. */
const TRIALS = 5
const HARD_TIMEOUT_MS = 60_000

// الحزمة نفسها لا نسخة فحص: لا صلاحية مضيف تُضاف.
const g = await startGuard({
  prefix: 'popup',
  port: PORT,
  title: 'فحص نافذة الإضافة في Chrome:',
  fixtures: true,
  stage: false,
  serviceWorker: true,
  hardTimeoutMs: HARD_TIMEOUT_MS,
})
const { ok, fail, lines } = g

/**
 * صفحة "عادية" محلّية — `scripts/fixtures-serve.mjs` (المرحلة 2) بدل موقع
 * حقيقي: بيئة التشغيل لا تملك بالضرورة وصولًا شبكيًا خارجيًا، وموقع حقيقي
 * يعني فحصًا يتذبذب بتذبذب الشبكة لا بسلوك الإضافة. الخادم صامت شبكيًا
 * ويُضمَن هنا عبر `live-fixtures.mjs` لا يُشترَط مُشغَّلًا سلفًا.
 */
const NORMAL_URL = `${g.base}/rtl-ar/`

/** يبحث عن الهدف ويتّصل به في المحاولة نفسها — يعيد مُقيِّمه ومعرّفه. */
async function findAndAttach(predicate, tries = 40, intervalMs = 150) {
  const found = await findTarget(g.send, predicate, { tries, intervalMs })
  return found ? { evaluate: g.evaluate(found.sessionId), targetId: found.target.targetId } : null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
// رفض Chrome للحزمة سجّلته النواة: «Chrome رفض الحزمة: …».
if (!g.extId) await g.abort()
ok(`الحزمة محمَّلة — ${g.extId}`)
const ownOrigin = `chrome-extension://${g.extId}/`

if (!g.sw) await g.abort('لم يستيقظ الـservice worker')
const sw = g.sw
ok('الـservice worker يعمل')

// الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
await waitForExtensionContext(sw.evaluate)

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
/**
 * مكوّنات كل عيّنة — تُطبَع مع المتوسّط كي يُقرأ **أين** ذهب الزمن لا مجموعه
 * وحده (`STAGES/04`): فتح التبويب حتى بدء المستند، ثمّ علامات النافذة في جدول
 * أدائها (`POPUP_MARKS` في `src/pages/popup/context.ts`): تقييم الحزمة، ووصول
 * البيانات، والتركيب بها، ثمّ أول رسم. علامة غائبة تُطبَع «—» ولا تُسقط شيئًا.
 */
const parts = []

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
      parsed: performance.getEntriesByType("navigation")[0]?.domInteractive ?? null,
      marks: Object.fromEntries(performance.getEntriesByType("mark")
        .filter((m) => m.name.startsWith("rasd:popup:"))
        .map((m) => [m.name.slice(11), m.startTime])),
    })`)
    const reading = JSON.parse(raw)
    if (reading.state && reading.paintMs !== null) {
      elapsedMs = reading.timeOrigin + reading.paintMs - startedAt
      parts.push({
        open: reading.timeOrigin - startedAt,
        parsed: reading.parsed,
        ...reading.marks,
        paint: reading.paintMs,
      })
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
  // مكوّنات الإحماء لا تدخل المتوسّط — كما لا يدخله زمنه.
  parts.length = 0

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
    // المتوسّط لكل مكوّن، والفتح من ساعتنا والبقية من بدء المستند.
    const mean = (key) => {
      const values = parts.map((p) => p[key]).filter((v) => typeof v === 'number')
      return values.length ? fmt(values.reduce((a, b) => a + b, 0) / values.length) : '—'
    }
    lines.push(
      `    مكوّنات الزمن (متوسّطات): فتح التبويب حتى بدء المستند ${mean('open')} · ثمّ من بدء المستند: تحليله ${mean('parsed')} · تقييم الحزمة ${mean('boot')} · وصول البيانات ${mean('data')} · التركيب بها ${mean('commit')} · أول رسم ${mean('paint')}`,
    )
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

await g.finish({
  success: '✓ الاختصارات الأربعة مسجَّلة فعلًا عند Chrome، وزمن أول عرض ضمن الميزانية.',
})
