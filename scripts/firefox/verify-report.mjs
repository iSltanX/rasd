#!/usr/bin/env node
/**
 * حارس Firefox `report` — تشخيص البلاغ في Firefox يحمل المتصفّح وإصداره ومحرّكه والمعمارية كما يقولها Firefox نفسه.
 *
 * **سببه ملاحظةٌ من الاختبار اليدوي (SS6، البلاغ #10 في app-reports):** وصل البلاغ من Firefox بـ`browser: unknown` و
 * `browser_version: unknown` و`arch: unknown`، وبلاغ كروم من الجهاز نفسه (#8) يحملها كاملة. والتحقيق (SS7) وجد سببين:
 * حزمة `dist-firefox/` قديمة في النسخة الرئيسية بُنيت قبل هوية SS2 (لا `getBrowserInfo` في حزمتها — فالحارس يقرأ ما
 * يُبنى الآن لا ما بقي على القرص)، و`aarch64` اسم Firefox لمعمارية ARM64 لم يكن في قاموس التشخيص (أُصلح مع اختباره).
 *
 * الحكم من شاشة «ما سيُرسَل بالضبط» نفسها (`data-report-key`) — الجسم الذي يخرج حرفًا (`reviewRows`) — مقابل قيمٍ
 * يقولها Firefox من خارج الإضافة (`Services.appinfo` في سياق المتصفّح، و`process` في Node):
 *   1. النافذة تُفتح من رابطها (`?section=about&report=1`) وتبلغ خطوة المراجعة بلا صورة، ولا شيء يُرسَل.
 *   2. `diagnostics.browser` = `Firefox`، و`browser_version` = إصدار Firefox، و`browser_id` = `firefox`، و`engine` = `Gecko <الإصدار>`،
 *      و`build_target` = `firefox`، و`install_source` = `unpacked` (تثبيتٌ مؤقّت = `development`).
 *   3. `os` نظام الجهاز، و`arch` معماريته (`XPCOMABI`)، و`app_version` نسخة `package.json`.
 *   4. `os_version` = `unknown` صادقًا: Firefox لا يكشف إصدار النظام للإضافات — لا `userAgentData`، و`navigator.oscpu`
 *      مجمَّدٌ على `Intel Mac OS X 10.15` حتى على ماك ARM بإصدارٍ أحدث (قِيس) — وقيمةٌ مجمَّدة كاذبة أسوأ من مجهولٍ معلَن.
 *   5. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:report
 *   RASD_GUARD_SABOTAGE=src/pages/settings/index.html pnpm firefox:report   # السالب: يجب أن يسقط
 *   RASD_BREAK_IDENTITY=1 pnpm firefox:report   # السالب المسمّى: الحزمة بلا getBrowserInfo — عَرَض البلاغ #10 نفسه
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, startGuard } from '../lib/bidi.mjs'

const PORT = 9244
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BREAK_IDENTITY = process.env.RASD_BREAK_IDENTITY === '1'
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * السالب المسمّى: اسم الواجهة في الحزمة يُغيَّر فلا تجدها الهوية — كحزمةٍ بُنيت قبلها. ويرمي بصوتٍ عالٍ إن لم يجد
 * الاسم: ترقيعٌ صامت يُنتج حارسًا أخضر لأنه لم يكسر شيئًا.
 */
function breakIdentity(stage) {
  if (!BREAK_IDENTITY) return
  const assets = join(stage, 'assets')
  let patched = 0
  for (const f of readdirSync(assets).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(assets, f), 'utf8')
    if (!src.includes('getBrowserInfo')) continue
    writeFileSync(join(assets, f), src.replaceAll('getBrowserInfo', 'getBrowserInfoGone'))
    patched++
  }
  if (patched === 0)
    throw new Error('RASD_BREAK_IDENTITY: لا getBrowserInfo في الحزمة — عدِّل الترقيع.')
}

const g = await startGuard({
  prefix: 'report',
  port: PORT,
  title: '── حارس Firefox: تشخيص البلاغ ──',
  stage: { patch: breakIdentity },
  hardTimeoutMs: 120_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (BREAK_IDENTITY)
  note('سالبٌ مسمّى: getBrowserInfo مُخفاة في الحزمة — يجب أن يحمرّ المتصفّح وإصداره')
if (!g.extId || !g.ext) await g.abort()

// ── ما يقوله Firefox عن نفسه، من خارج الإضافة ────────────────────
const truth = JSON.parse(
  await g.inChrome(
    `JSON.stringify({ version: Services.appinfo.version, abi: Services.appinfo.XPCOMABI })`,
  ),
)
const cpu = String(truth.abi).split('-')[0]
const wantArch = { aarch64: 'arm64', x86_64: 'x86_64', x86: 'x86', arm: 'arm' }[cpu] ?? cpu
const wantOs =
  { darwin: 'macos', linux: 'linux', win32: 'windows' }[process.platform] ?? process.platform
const want = {
  app_version: pkg.version,
  os: wantOs,
  os_version: 'unknown',
  arch: wantArch,
  locale: 'ar',
  'diagnostics.browser': 'Firefox',
  'diagnostics.browser_version': truth.version,
  'diagnostics.browser_id': 'firefox',
  'diagnostics.engine': `Gecko ${truth.version}`,
  'diagnostics.build_target': 'firefox',
  'diagnostics.install_source': 'unpacked',
}

// ── 1) النافذة إلى خطوة المراجعة ─────────────────────────────────
const page = await g
  .openExtensionPage('src/pages/settings/index.html?section=about&report=1')
  .catch((e) => ({ error: e.message }))
if (page.error) await g.abort(`صفحة الإعدادات لم تُفتح: ${page.error}`)
const inPage = g.inContext(page.context)
const waitFor = async (expression, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    if ((await inPage(expression).catch(() => false)) === true) return true
    await sleep(150)
  }
  return false
}
const button = (text) =>
  inPage(
    `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`,
  )

if (!(await waitFor(`!!document.querySelector('#report-field-title')`))) {
  await g.abort('نافذة البلاغ لم تُفتح من رابطها')
}
await inPage(`(() => {
  const set = (id, value) => {
    const el = document.querySelector('#' + id)
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set('report-field-title', 'حارس Firefox')
  set('report-field-what', 'تشخيص البلاغ في Firefox — لا يُرسَل')
  return true
})()`)
await button('التالي: الصورة')
if (
  !(await waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'التالي: المراجعة')`,
  ))
) {
  await g.abort('خطوة الصورة لم تظهر بعد الوصف')
}
await button('التالي: المراجعة')
if (!(await waitFor(`document.querySelectorAll('[data-report-key]').length > 0`))) {
  await g.abort('خطوة المراجعة لم تظهر')
}
const rows = JSON.parse(
  await inPage(
    `JSON.stringify(Object.fromEntries([...document.querySelectorAll('[data-report-key]')].map((r) => [r.dataset.reportKey, r.lastElementChild.textContent.trim()])))`,
  ),
)
ok(`خطوة «ما سيُرسَل بالضبط» تعرض ${Object.keys(rows).length} حقلًا — ولا شيء أُرسل`)

// ── 2) و3) و4) القيم ─────────────────────────────────────────────
const groups = [
  [
    'هوية المتصفّح',
    [
      'diagnostics.browser',
      'diagnostics.browser_version',
      'diagnostics.browser_id',
      'diagnostics.engine',
    ],
  ],
  ['الحزمة ومصدرها', ['diagnostics.build_target', 'diagnostics.install_source', 'app_version']],
  ['النظام والمعمارية', ['os', 'arch', 'locale']],
]
for (const [label, keys] of groups) {
  const wrong = keys.filter((k) => rows[k] !== want[k])
  wrong.length === 0
    ? ok(`${label}: ${keys.map((k) => `${k.replace('diagnostics.', '')}=${rows[k]}`).join(' · ')}`)
    : fail(
        `${label}: ${wrong.map((k) => `${k}=«${rows[k] ?? 'غائب'}» والمتوقَّع «${want[k]}»`).join(' · ')}`,
      )
}
rows.os_version === 'unknown'
  ? ok(
      'os_version=unknown صادقًا — Firefox لا يكشف إصدار النظام (oscpu مجمَّد)، فلا قيمة مجمَّدة كاذبة',
    )
  : fail(`os_version=«${rows.os_version}» — Firefox لا يكشفه، فقيمةٌ هنا مختلَقة أو مجمَّدة`)

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ تشخيص البلاغ في Firefox يحمل هويته ومعماريته كما يقولها Firefox.' })
