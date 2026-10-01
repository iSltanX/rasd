/**
 * أثر رصد على الصفحة التي تعمل عليها — **قياس Lighthouse بلا الطبقة ثمّ معها** (`STAGES/22`، ADR 0049).
 *
 * كروم حقيقي والإضافة محمَّلة في الحالتين، ولايتهاوس هو المقياس: لا ساعاتٌ ولا مراقبو أداء مكتوبة هنا تحلّ محلّه.
 * والعيّنات محلّية بلا شبكة (`tests/fixtures/sites/`): `rtl-ar` أوّلًا لأنها الحالة الأساسية للمنتج.
 *
 * ## الجهتان: أصلان على الخادم نفسه
 *
 * نسخة الفحص تمنح صلاحية المضيف لأصلٍ واحد (`with.localhost`). ومسار الاستئناف في المنتَج (`src/background/resume.ts`)
 * يحقن الطبقة ويقلعها عند اكتمال كل تحميلٍ في أصلٍ ممنوح — فالصفحة «معها» تحمل الطبقة بمسار الحقن الحقيقي (بوّابته
 * وإقلاعه)، والصفحة في `localhost` الإضافةُ فيها خاملة. المحتوى والخادم وكروم واحد، فلا يفرّق إلا حضور الطبقة، **ويُثبَت
 * حضورها قبل كل قياس**: عدد مضيفاتها صفر في الجهة الخاملة وواحد في الفاعلة، وإلا سقط الحارس — مقارنةٌ بين جهتين
 * متساويتين كانت ستنجح.
 *
 * ## المشهدان
 *
 * **١ — الطبقة تعمل.** `startTimespan` في لايتهاوس يقيس `CLS` و`TBT` والطبقة في وضع الفحص والمؤشِّر يجول 1.5s،
 * مقابل الجولة نفسها في صفحةٍ خاملة. الحكم: `CLS` مضاف صفر · `TBT` ≤ 5%.
 *
 * **٢ — التحميل والحقن.** `navigation` بمحاكاة الاختناق يقيس `CLS` و`LCP` و`TBT` في تحميلٍ كامل تُحقَن الطبقة في
 * أثنائه. الحكم: `CLS` مضاف صفر · `LCP` و`TBT` ≤ 5% (دوالّ الحكم في `lighthouse-impact.mjs`).
 *
 * ## اختبار العكس — ثلاثة سوالب، لكلٍّ سببٌ يسقط به
 *
 *     RASD_BREAK_LIGHTHOUSE=shift pnpm verify:lighthouse   # يجب أن يفشل
 *
 * تُلحَق بنسخة الفحص من `content.js` شيفرةٌ تُدرج كتلةً في أعلى الصفحة بعد 100ms من تقييمها: انزياحٌ في التخطيط،
 * فيحمرّ بند `CLS` (في المشهد ٢ دائمًا؛ وفي ١ حين يقع الانزياح داخل نافذة القياس).
 *
 *     RASD_BREAK_LIGHTHOUSE=block pnpm verify:lighthouse   # يجب أن يفشل
 *
 * مثلها بحلقةٍ تحجز الخيط الرئيسي 300ms عند التقييم: مهمّةٌ طويلة، فيحمرّ بند `TBT` في المشهد ٢ (الأساس صفر فلا يبقى
 * صفرًا). والتقييم في المشهد ١ يقع عند التحميل قبل نافذة القياس، فلا يراه.
 *
 *     RASD_GUARD_SABOTAGE=content.js pnpm verify:lighthouse   # يجب أن يفشل
 *
 * (نواة الحرّاس، ADR 0042): `content.js` يرمي عند تقييمه فلا طبقة. فتسقط أحكام الحضور — لا تنجح المقارنات لأن الجهتين
 * صارتا واحدة. والترقيعان يرميان بصوتٍ عالٍ إن لم يجدا نمطهما.
 *
 * الإقلاع والاتصال والتحميل والارتباط والتنظيف في النواة المشتركة (`scripts/lib/cdp.mjs`، `STAGES/17`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import lighthouse, { startTimespan } from 'lighthouse'
import { connect } from 'puppeteer-core'

import { openTarget, startGuard } from './lib/cdp.mjs'
import { judgeAddedCls, judgeDegradation } from './lighthouse-impact.mjs'

const PORT = 9360
const BREAK = process.env.RASD_BREAK_LIGHTHOUSE ?? ''

/**
 * **جهتان بالاسم لا بالمنفذ.** الصلاحية في البيان لأصلٍ واحد (`with.localhost`) فيحقن مسار الاستئناف
 * (`src/background/resume.ts`) الطبقةَ عند اكتمال كل تحميلٍ فيه، بمسار المنتَج الحقيقي بوّابته وإقلاعه. وأصلٌ
 * آخر على الخادم نفسه (`localhost`) لا صلاحية له فالإضافة فيه خاملة. الخادم واحد والمحتوى واحد، والكروم واحد
 * — فلا يفرّق بين الجهتين إلا حضور الطبقة. (كروم يحلّ `*.localhost` إلى الحلقة المحلّية بلا DNS.)
 */
const WITH_HOST = 'with.localhost'
const BASE_HOST = 'localhost'

/** `rtl-ar` أوّلًا — الحالة الأساسية للمنتج — و`perf-5000` أثقل العيّنات. */
const FIXTURES = ['rtl-ar', 'ltr-en', 'perf-5000']
/** مشهد ٢ على عيّنتين: التشغيلة الواحدة نحو خمس ثوانٍ وللحارس مهلة خطوته. */
const LOAD_FIXTURES = ['rtl-ar', 'perf-5000']
/**
 * قياسات كل جهة. المشهد ١ أربعة: مقياساه (`CLS` و`TBT`) صفرٌ على كل عيّنة محلّية فلا ضجيج يُحسَم بعدد. والمشهد ٢
 * خمسة بعد إحماءٍ يُهمَل: أوّل تشغيلة لكل جهة أبطأ (قِيس `LCP` 237ms ثمّ 165)، ولا يُحكَم على وسيطٍ من أقلّ من
 * ثلاث (`MIN_SAMPLES`). والمدّة الكلّية نحو أربع دقائق وسقف الحارس ست.
 */
const WORKING_SAMPLES = 4
const LOAD_SAMPLES = 5
/** نافذة جولة المؤشِّر تحت الطبقة، ms. */
const SWEEP_MS = 1500

const AUDITS = ['cumulative-layout-shift', 'total-blocking-time']
const LOAD_AUDITS = [...AUDITS, 'largest-contentful-paint']

/** ما يُلحَق بـ`content.js` في نسخة الفحص لإثبات السالب — ويرمي إن لم يجد نمطه. */
const BREAKS = {
  shift: `;setTimeout(() => {
  const d = document.createElement('div')
  d.style.cssText = 'height:200px;background:#eee'
  document.body.insertBefore(d, document.body.firstChild)
}, 100)\n`,
  block: `;{ const t = Date.now(); while (Date.now() - t < 300); }\n`,
}

function patchBundle(stage) {
  if (!BREAK) return
  if (!(BREAK in BREAKS)) {
    throw new Error(
      `RASD_BREAK_LIGHTHOUSE: «${BREAK}» غير معروف (${Object.keys(BREAKS).join(' · ')})`,
    )
  }
  const file = join(stage, 'content.js')
  const src = readFileSync(file, 'utf8')
  if (!src.includes('__rasdContent')) {
    throw new Error('RASD_BREAK_LIGHTHOUSE: لا `__rasdContent` في content.js — الترقيع لم يجد نمطه')
  }
  writeFileSync(file, src + BREAKS[BREAK])
}

const g = await startGuard({
  prefix: 'lighthouse',
  port: PORT,
  title: '── أثر الحقن على الصفحة المضيفة (Lighthouse) ──',
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: [`http://${WITH_HOST}/*`], patch: patchBundle },
  serviceWorker: true,
  args: ['--window-size=1280,800'],
  hardTimeoutMs: 340_000,
})
const { ok, fail, note } = g
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!g.extId || !g.sw) {
  await g.abort(`الإضافة أو الـservice worker لم يجهزا${g.loadError ? ` — ${g.loadError}` : ''}`)
}
const inSW = (expression) => g.sw.evaluate(expression)

const urlOf = (host, fixture) => `http://${host}:${g.fixtures.port}/${fixture}/`

const browser = await connect({
  browserURL: `http://127.0.0.1:${PORT}`,
  defaultViewport: null,
})
g.onCleanup(() => browser.disconnect())

/** عدد مضيفات الطبقة تحت `documentElement` — مضيفها عنصرٌ باسمٍ عشوائي يبدأ بـ`x-`. */
const HOSTS = `[...document.documentElement.children].filter((e) => /^X-/.test(e.tagName)).length`

/** ينتظر حتى يبلغ عدد المضيفات ما يُرجى (`want`) أو تنقضي المهلة، ويعيد آخر ما رُصد. */
async function waitHosts(read, want, tries = 40) {
  let n = await read()
  for (let i = 0; i < tries && n !== want; i++) {
    await sleep(150)
    n = await read()
  }
  return n
}

const tabIdOf = (url) =>
  inSW(
    `chrome.tabs.query({}).then((tabs) => tabs.find((t) => t.url === ${JSON.stringify(url)})?.id ?? null)`,
  )

/** ينفّذ دالّةً في العالم المعزول حيث تُقلَع الطبقة — وتُعيد `startOverlay` الجلسة القائمة لا جلسةً ثانية. */
const inOverlay = (tabId, fnSource) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} }, world: 'ISOLATED', func: ${fnSource},
  }).then((r) => r[0].result)`)

const setMode = (tabId, mode) =>
  inOverlay(
    tabId,
    `() => globalThis.__rasdContent.startOverlay().then((r) =>
      r.ok ? JSON.stringify(r.value.modes.set(${JSON.stringify(mode)})) : JSON.stringify(r))`,
  )

/** المؤشِّر يجول داخل الصفحة طوال النافذة — الحركة نفسها في الجهتين، فلا يفرّق بينهما إلا الطبقة. */
async function sweep(page, ms) {
  const until = Date.now() + ms
  let moves = 0
  while (Date.now() < until) {
    await page.mouse.move(60 + ((moves * 37) % 1100), 120 + ((moves * 23) % 600))
    moves++
    await sleep(8)
  }
  return moves
}

const numeric = (lhr, id) => lhr.audits[id]?.numericValue
const series = (runs, key) => runs.map((r) => r[key])
const list = (values) =>
  values.map((v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v)).join(' · ')
const verdict = (tag, v) => (v.pass ? ok : fail)(`${tag} ${v.text}`)

// ── مشهد ١: الطبقة تعمل (وضع الفحص والمؤشِّر يجول) ───────────────────────

async function workingRun(fixture, withLayer) {
  const url = urlOf(withLayer ? WITH_HOST : BASE_HOST, fixture)
  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'load' })
    // مسار الاستئناف يحقن الطبقة عند اكتمال التحميل — تُنتظر قبل القياس لا خلاله (المشهد ٢ يقيس الحقن).
    const hosts = await waitHosts(
      () => page.evaluate(HOSTS),
      withLayer ? 1 : 0,
      withLayer ? 40 : 12,
    )
    await sleep(300)

    const timespan = await startTimespan(page, {
      config: {
        extends: 'lighthouse:default',
        settings: {
          onlyAudits: AUDITS,
          formFactor: 'desktop',
          screenEmulation: { disabled: true },
        },
      },
    })
    let tabId = null
    if (withLayer) {
      tabId = await tabIdOf(url)
      await setMode(tabId, 'inspect')
    }
    await sweep(page, SWEEP_MS)
    if (withLayer) await setMode(tabId, 'idle')
    const { lhr } = await timespan.endTimespan()
    return {
      hosts,
      cls: numeric(lhr, 'cumulative-layout-shift'),
      tbt: numeric(lhr, 'total-blocking-time'),
    }
  } finally {
    await page.close().catch(() => undefined)
  }
}

for (const fixture of FIXTURES) {
  const tag = `[١ ${fixture}]`
  const base = []
  const withRuns = []
  for (let i = 0; i < WORKING_SAMPLES; i++) {
    // التناوب لا الكتل: انحراف الجهاز على مدى الجولة يصيب الجهتين معًا.
    base.push(await workingRun(fixture, false))
    withRuns.push(await workingRun(fixture, true))
  }
  note(`${tag} TBT بلا ${list(series(base, 'tbt'))} · معها ${list(series(withRuns, 'tbt'))}`)
  note(`${tag} CLS بلا ${list(series(base, 'cls'))} · معها ${list(series(withRuns, 'cls'))}`)

  if (base.every((r) => r.hosts === 0))
    ok(`${tag} الجهة الخاملة بلا طبقة في ${base.length} تشغيلات`)
  else fail(`${tag} طبقةٌ في الجهة الخاملة — المقارنة بين جهتين متساويتين`)
  if (withRuns.every((r) => r.hosts === 1)) {
    ok(`${tag} الطبقة حاضرة في كل تشغيلات الجهة الفاعلة (${withRuns.length}) بمسار الاستئناف`)
  } else {
    fail(
      `${tag} الطبقة غائبة في تشغيلةٍ فاعلة (${series(withRuns, 'hosts').join(' · ')}) — القياس على صفحةٍ لا طبقة فيها`,
    )
  }

  verdict(tag, judgeAddedCls(series(base, 'cls'), series(withRuns, 'cls')))
  verdict(tag, judgeDegradation(series(base, 'tbt'), series(withRuns, 'tbt'), { label: 'TBT' }))
}

// ── مشهد ٢: التحميل والحقن — لايتهاوس `navigation` ────────────────────────

const LOAD_FLAGS = {
  port: PORT,
  output: 'json',
  logLevel: 'error',
  onlyAudits: LOAD_AUDITS,
  formFactor: 'desktop',
  screenEmulation: { disabled: true },
  throttlingMethod: 'simulate',
  throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
}

for (const fixture of LOAD_FIXTURES) {
  const tag = `[٢ ${fixture}]`
  // الإثبات خارج القياس: عنوان «معها» يحقن الطبقة وعنوان «بلاها» لا يحقنها. لا يُجرى داخل تشغيلة لايتهاوس —
  // يُنهيها بتحميل `about:blank` فلا يبقى ما يُسأل عنه.
  const hosts = {}
  for (const [key, host] of [
    ['base', BASE_HOST],
    ['with', WITH_HOST],
  ]) {
    const target = await openTarget(g.send, urlOf(host, fixture))
    const read = () => g.evaluate(target.sessionId)(HOSTS)
    hosts[key] = await waitHosts(read, key === 'with' ? 1 : 0, key === 'with' ? 40 : 12)
    await g.send('Target.closeTarget', { targetId: target.targetId })
  }
  if (hosts.base === 0 && hosts.with === 1) {
    ok(`${tag} «معها» يحقن الطبقة (${hosts.with}) و«بلاها» لا يحقنها (${hosts.base})`)
  } else {
    fail(`${tag} الحقن لا يطابق الجهة: بلاها ${hosts.base} · معها ${hosts.with}`)
  }

  const runs = { base: [], with: [] }
  for (let i = -1; i < LOAD_SAMPLES; i++) {
    for (const [key, host] of [
      ['base', BASE_HOST],
      ['with', WITH_HOST],
    ]) {
      const { lhr } = await lighthouse(urlOf(host, fixture), LOAD_FLAGS)
      if (i < 0) continue
      runs[key].push(Object.fromEntries(LOAD_AUDITS.map((id) => [id, numeric(lhr, id)])))
    }
  }
  const pick = (key, id) => runs[key].map((r) => r[id])
  note(
    `${tag} LCP بلا ${list(pick('base', 'largest-contentful-paint'))} · معها ${list(pick('with', 'largest-contentful-paint'))}`,
  )
  verdict(tag, judgeAddedCls(pick('base', AUDITS[0]), pick('with', AUDITS[0])))
  verdict(tag, judgeDegradation(pick('base', AUDITS[1]), pick('with', AUDITS[1]), { label: 'TBT' }))
  verdict(
    tag,
    judgeDegradation(
      pick('base', 'largest-contentful-paint'),
      pick('with', 'largest-contentful-paint'),
      {
        label: 'LCP',
      },
    ),
  )
}

await g.finish({
  success: '✓ الطبقة لا تضيف انزياحًا ولا حجبًا للخيط، ولا تتدهور `LCP` فوق الحدّ.',
})
