#!/usr/bin/env node
/**
 * حارس Firefox `network` — «لا شيء يغادر هذا الجهاز» في «الوضع المحلّي فقط»، مقيسًا في Firefox لا موعودًا.
 *
 * نظير `scripts/verify-network.mjs` (ADR 0056) **مبنيٌّ من جديد لا منقول**: NetLog وDevTools أداتا كروم، وBiDi
 * `network.*` في Firefox **لا يرى طلبات الإضافة** (قِيس: `fetch` من صفحة إضافة ومن الخلفية بلا حدث). فالشاهدان هنا:
 *
 * 1. **مراقِب `http-on-opening-request` في عملية المتصفّح من قبل التثبيت** (`o.network` في النواة): كل قناة HTTP(S) —
 *    من الخلفية وصفحات الإضافة وسكربت المحتوى والمواقع — بعنوانها ومبدئها. وما ليس الحلقة المحلّية **يُلغى لحظة فتحه**
 *    بعد تسجيله، فلا شيء يغادر الجهاز أثناء الفحص ولو حاول.
 * 2. **BiDi `network.beforeRequestSent`** لتبويبات المواقع، و**الطرفية** لما تحجبه سياسة المحتوى قبل أن يصير طلبًا
 *    (Firefox يطبع «Content-Security-Policy: … blocked» خطأً — `consoleErrors`).
 *
 * والحكم على **ما بادر به غير المتصفّح**: طلبات Firefox الداخلية (مبدؤها `system`) تُعدّ وتُذكر ولا تُحاكَم — كما
 * يحاكِم `verify:network` ما بادر به أصلٌ لا كل ما في NetLog. وكل مسارٍ يُثبت أنه جرى بأثره، فصفرٌ من مسارٍ لم يجرِ
 * لا يُقرأ نجاحًا، والشاهد الموجب أن المراقِب يرى طلبات العيّنات المحلّية نفسها — فصفرُ التسرّب صفرُ مراقِبٍ يرى:
 *   1. التثبيت وجولة التعريف، والنافذة، والإعدادات بأقسامها التسعة، والمكتبة.
 *   2. القياس والفحص والألوان على عيّنة، والالتقاط الظاهر والكامل في المكتبة.
 *   3. المحرّر على اللقطة، وتصدير PNG إلى القرص، ونافذة البلاغ حتى «ما سيُرسَل» بلا إرسال.
 *   4. صفر طلبٍ غير محلّي بادرت به الإضافة أو صفحة، وصفر محاولةٍ حجبتها السياسة.
 *
 *   pnpm build:firefox && pnpm firefox:network
 *   RASD_BREAK_EGRESS=worker pnpm firefox:network    # الخلفية تطلب api.github.com عند إقلاعها بلا فعلٍ — يجب أن يسقط
 *   RASD_BREAK_EGRESS=content pnpm firefox:network   # سكربت المحتوى يطلب صورةً من خارج الجهاز — يجب أن يسقط
 *   RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:network   # يجب أن يسقط
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { startGuard } from '../lib/bidi.mjs'

const PORT = 9243
const BREAK = process.env.RASD_BREAK_EGRESS ?? ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SECTIONS = [
  'capture',
  'annotation',
  'colors',
  'appearance',
  'shortcuts',
  'privacy',
  'data',
  'integrations',
  'about',
]

/** السالبان المسمّيان — في نسخة الفحص قبل تثبيتها. */
function breakEgress(stage) {
  if (!BREAK) return
  const file = { worker: 'service-worker-loader.js', content: 'content.js' }[BREAK]
  if (!file) throw new Error(`RASD_BREAK_EGRESS=${BREAK}: القيم worker أو content.`)
  const leak =
    BREAK === 'worker'
      ? "fetch('https://api.github.com/rasd-egress-probe').catch(() => {});\n"
      : "new Image().src = 'https://rasd-leak.invalid/pixel.png';\n"
  const path = join(stage, file)
  writeFileSync(path, leak + readFileSync(path, 'utf8'))
}

const g = await startGuard({
  prefix: 'network',
  port: PORT,
  title: '── حارس Firefox: صفر طلب في «الوضع المحلّي فقط» ──',
  fixtures: true,
  network: true,
  stage: { hostPermissions: ['<all_urls>'], permissions: ['downloads'], patch: breakEgress },
  hardTimeoutMs: 280_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (BREAK) note(`سالبٌ مسمّى: RASD_BREAK_EGRESS=${BREAK} — يجب أن يحمرّ بند التسرّب`)
if (!g.extId || !g.ext) await g.abort()
await g.acceptSavePrompts()

const ran = []
const step = (label, passed, detail = '') => {
  if (passed) ran.push(label)
  else fail(`لم يجرِ «${label}» — ${detail}`)
}
/** يفتح صفحة إضافة وينتظر أثرها — ويعيد سبب الإخفاق نصًّا، فلا يُقرأ «لم يجرِ» بلا سبب. */
const rendered = async (
  path,
  probe = `document.readyState === 'complete' && (document.body?.innerText ?? '').trim().length > 0`,
) => {
  const page = await g.openExtensionPage(path).catch((e) => ({ error: e.message }))
  if (page.error) return { error: page.error }
  const inPage = g.inContext(page.context)
  for (let i = 0; i < 60; i++) {
    if ((await inPage(probe).catch(() => false)) === true) return page
    await sleep(150)
  }
  return { error: `لم يظهر أثرها: ${probe.slice(0, 80)}` }
}
const stepPage = async (label, path, probe) => {
  const page = await rendered(path, probe)
  step(label, !page.error, page.error)
  return page.error ? null : page
}

// ── 1) الصفحات ───────────────────────────────────────────────────
const localOnly = await g.message('settings/get').catch(() => null)
localOnly?.ok && localOnly.value?.privacy?.localOnly === true
  ? ok('«الوضع المحلّي فقط» مفعَّل — افتراض المنتج')
  : fail(
      `«الوضع المحلّي فقط» ليس مفعَّلًا: ${JSON.stringify(localOnly?.value?.privacy ?? localOnly)}`,
    )
step('جولة التعريف عند التثبيت', Boolean(g.tour), 'لم تُفتح')
await stepPage(
  'النافذة',
  'src/pages/popup/index.html',
  `!!document.querySelector('[data-popup-state]')`,
)
for (const section of SECTIONS) {
  await stepPage(`الإعدادات · ${section}`, `src/pages/settings/index.html?section=${section}`)
}
await stepPage('المكتبة', 'src/pages/library/index.html')

// ── 2) الأدوات والالتقاط ─────────────────────────────────────────
const site = await g.openSite('/rtl-ar/')
for (const tool of ['measure', 'inspect', 'colour']) {
  const r = await g
    .message('tool/activate', { tool, tabId: site.tabId }, 45_000)
    .catch((e) => ({ ok: false, error: e.message }))
  step(`أداة ${tool}`, r?.ok && r.value?.started === true, JSON.stringify(r))
  await sleep(600)
}
const newCapture = async (tool) => {
  await g.activate(site.tabId)
  const before = await g.message('capture/latest').catch(() => null)
  const r = await g
    .message('tool/activate', { tool, tabId: site.tabId }, 60_000)
    .catch((e) => ({ ok: false, error: e.message }))
  for (let i = 0; i < 120; i++) {
    await sleep(500)
    const latest = await g.message('capture/latest').catch(() => null)
    if (latest?.ok && latest.value && latest.value.id !== before?.value?.id) return latest.value
  }
  fail(`لم يجرِ «${tool}» — ${JSON.stringify(r)}`)
  return null
}
const viewport = await newCapture('viewport')
if (viewport) ran.push('الالتقاط الظاهر')
const full = await newCapture('full-page')
if (full) ran.push('الالتقاط الكامل')

// ── 3) المحرّر والتصدير والبلاغ ──────────────────────────────────
const shot = full ?? viewport
if (shot) {
  const editor = await stepPage(
    'المحرّر',
    `src/pages/editor/index.html?capture=${shot.id}`,
    `!!document.querySelector('[data-export-open]')`,
  )
  if (editor) {
    const inEditor = g.inContext(editor.context)
    await inEditor(`document.querySelector('[data-export-open]').click(), true`)
    await sleep(500)
    await inEditor(`document.querySelector('[data-export-format="png"]')?.click(), true`)
    const at = JSON.parse(
      await inEditor(
        `JSON.stringify((() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'تنزيل'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })())`,
      ),
    )
    if (at) {
      await g.nativeMouse([
        { type: 'move', x: at.x, y: at.y },
        { type: 'down', x: at.x, y: at.y },
        { type: 'up', x: at.x, y: at.y },
      ])
    }
    let done = false
    for (let i = 0; i < 80 && !done; i++) {
      await sleep(250)
      done = await inEditor(`!!document.querySelector('[data-export-result]')`).catch(() => false)
    }
    step('تصدير PNG', done, 'لم تظهر النتيجة')
  }
}
const report = await stepPage(
  'نافذة البلاغ',
  'src/pages/settings/index.html?section=about&report=1',
  `!!document.querySelector('#report-field-title')`,
)
if (report) {
  const inReport = g.inContext(report.context)
  await inReport(`(() => {
    const set = (id, value) => { const el = document.querySelector('#' + id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })) }
    set('report-field-title', 'حارس الشبكة'); set('report-field-what', 'لا يُرسَل')
    return true
  })()`)
  const click = (text) =>
    inReport(
      `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`,
    )
  await sleep(200)
  await click('التالي: الصورة')
  for (let i = 0; i < 40; i++) {
    if (await click('التالي: المراجعة')) break
    await sleep(150)
  }
  let review = false
  for (let i = 0; i < 40 && !review; i++) {
    await sleep(150)
    review = await inReport(`document.querySelectorAll('[data-report-key]').length > 0`).catch(
      () => false,
    )
  }
  step('نافذة البلاغ حتى «ما سيُرسَل»', review, 'لم تبلغ خطوة المراجعة')
}
ok(`جرت المسارات كلّها بأثرها (${ran.length}): ${ran.join(' · ')}`)

// ── 4) الحكم ─────────────────────────────────────────────────────
await sleep(1000)
const seen = await g.requests()
const http = seen.browser.filter((r) => /^https?:/u.test(r.url))
const local = http.filter((r) => !r.cancelled)
const firefox = http.filter((r) => r.cancelled && r.by === 'system')
const leaks = http.filter((r) => r.cancelled && r.by !== 'system')
const tabLeaks = seen.tabs.filter(
  (r) => /^https?:/u.test(r.url) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/u.test(r.url),
)
local.length > 0
  ? ok(`المراقِب يرى: ${local.length} طلبًا محلّيًّا (العيّنات) — فالصفر أدناه صفرُ مراقِبٍ يرى`)
  : fail('المراقِب لم يرَ طلبًا واحدًا ولا العيّنات المحلّية — مراقِبٌ أعمى')
if (firefox.length > 0) {
  note(
    `طلبات Firefox الداخلية (مبدؤها system، أُلغيت ولا تُحاكَم): ${[...new Set(firefox.map((r) => new URL(r.url).host))].join(' · ')}`,
  )
}
leaks.length === 0 && tabLeaks.length === 0
  ? ok('صفر طلبٍ غير محلّي بادرت به الإضافة أو صفحة — لا شيء غادر الجهاز')
  : fail(
      `طلبات غادرت (أُلغيت قبل الخروج): ${[...leaks.map((r) => `${r.url} ← ${r.by || r.loading}`), ...tabLeaks.map((r) => `${r.url} ← تبويب`)].slice(0, 6).join(' · ')}`,
    )
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ في الطرفية — ولا محاولة حجبتها سياسة المحتوى')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ لا شيء يغادر الجهاز في «الوضع المحلّي فقط» في Firefox.' })
