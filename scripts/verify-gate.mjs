#!/usr/bin/env node
/**
 * حارس البوّابة الواحدة للحقن — **امتناعٌ مقيس، لا قرارٌ في اختبار**.
 *
 * **العلّة التي بُني لها.** الاختبار الوحدوي يُثبت أن `canOperateOnTab` تردّ
 * `excluded-site`. وهذا ليس إثباتًا أن الإضافة **لا تحقن**: بين القرار
 * والحقن `activateTool` و`chrome.scripting` وكروم. والوعد المكتوب في شاشة
 * الإعدادات («لا تعمل الإضافة هنا») وعدٌ عن الحقن لا عن قيمةٍ مُعادة —
 * فيُقاس ما يراه المستخدم وحده: هل ظهر المضيف في صفحته أم لا.
 *
 * **وأخطر ما يُقاس هنا: المسار بلا إيماءة.** النسخة مُرقَّعة بـ`<all_urls>`،
 * فالاستئناف التلقائي (`background/resume.ts`) يحقن في كل تبويب جديد —
 * صلاحية حقيقية فتصرّف حقيقي. ولهذا **يُكتَب الاستثناء قبل فتح التبويب**:
 * لو كُتب بعده لَما قاس الفحص إلّا مسار الإيماءة، ولَبدا التبويب محقونًا
 * أصلًا فلا يُقرأ منه شيء. وهذا هو بالضبط سيناريو المستخدم الحقيقي: منح
 * صلاحيةً لموقع، ثمّ استثناه بعدها — فلا يجوز أن يعلو الإذن القديم على
 * قراره الجديد (ADR 0020، الحقيقة 3).
 *
 * **والسالب يُثبَت على التبويب نفسه**: يُرفَع الاستثناء فيعمل التفعيل. بلا
 * هذا البند يمرّ الحارس أخضر لو كان التفعيل معطّلًا لسببٍ آخر تمامًا —
 * ويُقرأ العطل حمايةً.
 *
 * **ليس فيه**: دلالة الأنماط (‏٦٤ متجهًا في `tests/unit/site-match.test.ts`)
 * ولا الإغلاق عند تعذّر قراءة الإعدادات (‏`tests/unit/injection-gate.test.ts`).
 * تلك قرارات خالصة تُقاس أرخص وأشمل بلا كروم. هنا الجسر وحده: من القرار
 * إلى الامتناع الفعلي.
 *
 * الحارس فوق النواة المشتركة `scripts/lib/cdp.mjs` (`STAGES/17`): الإقلاع والتحميل والارتباط والتنظيف هناك.
 *
 *   pnpm build && pnpm verify:gate
 */
import { attachTarget, startGuard } from './lib/cdp.mjs'

const PORT = 9347

/*
 * `<all_urls>` مقصودة هنا لا تسهيلًا: هي ما يُفعِّل الاستئناف التلقائي على
 * كل تبويب، وهو المسار الذي يُقاس. نسخة الفحص وحدها مُرقَّعة — المنتج
 * المشحون بلا صلاحية مضيف (‏`verify:capture` يحرس ذلك).
 */
const g = await startGuard({
  prefix: 'gate',
  port: PORT,
  title: '── فحص البوّابة الواحدة للحقن (امتناعٌ مقيس لا قرارٌ مُعاد) ──',
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  serviceWorker: true,
  args: ['--window-size=1280,800'],
})
const { send, ok, fail, note, extId, sw } = g
const BASE = g.base

const inSW = (expression) => g.sw.evaluate(expression)

let granted = false
if (sw) {
  try {
    granted = await inSW(
      `chrome.permissions.contains({ origins: ['${BASE}/*'] }).then(g => g).catch(() => false)`,
    )
  } catch {
    granted = false
  }
}

if (!extId || !sw) {
  fail('الإضافة أو الـservice worker لم يجهزا.')
} else if (!granted) {
  fail('صلاحية المضيف للعيّنات غير ممنوحة — بلا صلاحية لا يُقاس مسار الاستئناف أصلًا.')
} else {
  ok(`نسخة الفحص محمَّلة وصلاحيتها ممنوحة (${BASE}/*) — الاستئناف التلقائي مُفعَّل`)
}

async function openTab(path) {
  const url = `${BASE}${path}`
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  return tabId
}

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  return attachTarget(send, t.targetId)
}

async function evalIn(sessionId, expression) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  )
  if (r.exceptionDetails) return { error: r.exceptionDetails.text }
  return r.result?.value
}

/**
 * وجود المضيف في الصفحة — **الدليل الوحيد المقبول على الحقن**.
 *
 * لا يُقرأ `globalThis.__rasdCompare` ولا أي مرجع جلسة: تلك تفترض إقلاعًا
 * هو نفسه موضع الفحص. وجذر الظلّ مغلق، فالمتاح هو العنصر المضيف وسماته.
 */
const readPage = (tabId) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: () => {
      const all = [...document.documentElement.children]
      const hosts = all.filter((el) => el.hasAttribute('popover') && el.style.getPropertyValue('z-index') === '2147483647')
      return { hostCount: hosts.length, hasContentLib: typeof globalThis.__rasdContent !== 'undefined' }
    },
  }).then(r => r[0].result)`)

/**
 * التفعيل كما يقع للمستخدم — رسالة `tool/activate` تنتهي إلى `activateTool`.
 * تُرسَل من صفحة إضافة لا من الـservice worker: رسالة العامل إلى ذاته ترتدّ
 * (‏نفس القيد الموثَّق في `verify-activate.mjs` و`verify-fullpage.mjs`).
 */
const activate = (driver, tabId, tool) =>
  evalIn(
    driver,
    `chrome.runtime.sendMessage({
      __rasd: 1,
      id: 'verify-gate-${tool}',
      type: 'tool/activate',
      payload: { tool: ${JSON.stringify(tool)}, tabId: ${tabId} },
    })`,
  )

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const driverTab = await inSW(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), active: false }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${driverTab}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  const driver = await attachToPage('src/pages/library/')
  if (!driver) fail('تعذّر فتح صفحة الإضافة القائدة.')

  /** تُكتب القائمة كما تكتبها شاشة الإعدادات: رسالة `settings/patch`. */
  const setExcluded = (sites) =>
    evalIn(
      driver,
      `chrome.runtime.sendMessage({
        __rasd: 1,
        id: 'verify-gate-exclude-${sites.length}',
        type: 'settings/patch',
        payload: { patch: { privacy: { excludedSites: ${JSON.stringify(sites)} } } },
      })`,
    )

  if (driver) {
    // ── 1) الاستثناء يُكتَب **قبل** فتح التبويب — انظر الترويسة ──
    const written = await setExcluded(['127.0.0.1'])
    const list = written?.value?.privacy?.excludedSites
    if (Array.isArray(list) && list[0] === '127.0.0.1') {
      ok('الاستثناء مكتوب في الإعدادات عبر `settings/patch` — كما تكتبه الشاشة')
    } else {
      fail(`لم تُكتب قائمة الاستثناء: ${JSON.stringify(written)}`)
    }

    const excludedTab = await openTab('/index.html')
    await settle(1500) // onUpdated ← permissions.contains ← activateResume — كلّها غير متزامنة.

    const passive = await readPage(excludedTab)
    if (passive.hostCount === 0 && !passive.hasContentLib) {
      ok('**الاستئناف التلقائي لم يحقن في موقع مستثنى** — بلا إيماءة، والصلاحية ممنوحة له')
    } else {
      fail(
        `حُقن بلا إيماءة في موقع مستثنى: hostCount=${passive.hostCount} lib=${passive.hasContentLib}`,
      )
    }

    // ── 2) والتفعيل الصريح يُرفض بسببه هو ──
    const denied = await activate(driver, excludedTab, 'measure')
    note(`ردّ التفعيل على موقع مستثنى: ${JSON.stringify(denied?.value ?? denied)}`)
    if (denied?.value?.started === false && denied.value.reason === 'excluded-site') {
      ok('والتفعيل الصريح رُفض بـ`excluded-site` — سببه هو، لا خطأ عام ولا نجاح كاذب')
    } else {
      fail(`ردٌّ غير متوقّع على موقع مستثنى: ${JSON.stringify(denied)}`)
    }

    const afterDenied = await readPage(excludedTab)
    if (afterDenied.hostCount === 0 && !afterDenied.hasContentLib) {
      ok('ولم تُحقَن شيفرة بعد الرفض — امتناعٌ فعلي لا رسالةٌ فقط')
    } else {
      fail(`حُقنت شيفرة بعد رفضٍ معلَن: hostCount=${afterDenied.hostCount}`)
    }

    // ── 3) السالب على التبويب نفسه — بلا هذا البند يُقرأ العطل حمايةً ──
    await setExcluded([])
    const allowed = await activate(driver, excludedTab, 'measure')
    const after = await readPage(excludedTab)
    if (allowed?.value?.started === true && after.hostCount === 1) {
      ok('وبعد رفع الاستثناء نجح التفعيل وظهر المضيف — المنع كان بالقائمة لا بعطل')
    } else {
      fail(
        `رفع الاستثناء لم يُعِد التفعيل: ${JSON.stringify(allowed)} hostCount=${after.hostCount}`,
      )
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
await g.finish({
  success: '✓ المواقع المستثناة تمنع الحقن فعلًا — في مسار الإيماءة وفي مسار الاستئناف.',
  failure: (n) => `✗ ${n} إخفاق.\n`,
})
