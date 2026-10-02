#!/usr/bin/env node
/**
 * حزمة المتجر كما تُرفع — تُفكّ من ملفّها المضغوط وتُحمَّل في متصفّحٍ نظيف، وتُقرأ تحذيراتها من المتصفّح
 * نفسه (`STAGES/28`).
 *
 *   pnpm zip && pnpm store:package            # Chrome وEdge (يسقط إن غاب أحدهما)، وما وُجد من Brave وVivaldi وOpera
 *   pnpm store:package --browser=edge,brave   # متصفّحات بأسمائها — وغياب أحدها سقوط
 *   pnpm store:package --shots                # ويحفظ لقطة صفحة الإضافات في Docs/Store/evidence/
 *   pnpm zip:firefox && pnpm store:package --browser=firefox   # حزمة Firefox عبر BiDi (SS7) — انظر أسفل الترويسة
 *
 * **كل Chromium على macOS بالحزمة نفسها** (`Docs/Launch/browsers.md`): التحميل عبر `Extensions.loadUnpacked`
 * و`developerPrivate` واحدان فيها كلّها، وصفحة الإضافات تُفتح بـ`chrome://extensions` حتى في Brave وVivaldi وOpera.
 * وArc خارج الجدول: لا يقبل `--user-data-dir` ولا منفذ تنقيح كما يقبلها غيره (المصدر نفسه).
 *
 * **ولا مسار جهازٍ في اللقطة.** صفحة الإضافات تطبع مجلّد الحزمة المفكوكة (مجلّدًا مؤقّتًا باسم الجهاز)، فيُستبدل
 * نصّه قبل الالتقاط بعبارةٍ تقول ما هو — حجبٌ معلَن لا قصّ.
 *
 * **ما لا يقوله `verify:load`.** ذاك يحمّل `dist/` ويقرأ الصلاحيات الممنوحة، ولا يرى تحذيرات التثبيت:
 * مفتاحٌ لا يعرفه المتصفّح في البيان («Unrecognized manifest key») يقبله `Extensions.loadUnpacked` بلا خطأ،
 * ويظهر شريطًا أصفر في صفحة الإضافات ويراه مراجع المتجر. فهنا يُقرأ ما تعرضه تلك الصفحة نفسها —
 * `developerPrivate.getExtensionInfo` من داخلها: `installWarnings` و`manifestErrors` و`runtimeErrors` —
 * بعد أن تُفتح النافذة والإعدادات فيقلع العامل وتجري الصفحات.
 *
 * **الحزمة لا `dist/`.** يُفكّ `dist-zip/rasd-<النسخة>.zip` بعد مطابقة بصمته لملفّ `.sha256` بجانبه، في
 * مجلّدٍ مؤقّت، ويُحمَّل منه — فما يُفحص هو ما يُرفع بايتًا ببايت.
 *
 * **Firefox (`--browser=firefox`، SS7):** `dist-zip/rasd-<النسخة>-firefox.zip` بعد مطابقة بصمته، مفكوكًا كما هو بلا صفحة
 * فحص ولا صلاحية زائدة، ثمّ: `web-ext lint` عليه (مدقّق AMO: صفر خطأ والتحذيرات المسموحة وحدها)، وتثبيتٌ مؤقّت في Firefox
 * عبر BiDi (`scripts/lib/bidi.mjs`) بمعرّف `gecko.id`، وتُفتح النافذة والإعدادات من سياق المتصفّح، وتُقرأ الطرفية بالحكم
 * نفسه الذي تحاكِم به حرّاس Firefox (`extensionConsole`): صفر تحذير بيان («Reading manifest») وصفر خطأ تشغيل.
 * منفذه 9245. والسالبان المسمّيان نفسهما يُسقطانه.
 *
 * **ليس حارس CI.** منفذه خاصّ به (9395) لا من منافذ الحرّاس المشتركة، ولا يُبنى عليه سجلّ ترقية.
 * وسالبان مسمّيان يجب أن يسقطا: `RASD_STORE_BREAK=warning` يضيف إلى البيان المفكوك مفتاحًا مجهولًا،
 * و`RASD_STORE_BREAK=runtime` يرمي استثناءً في صفحة النافذة بعد فتحها.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  basePrefs,
  connectBidi,
  evaluator as bidiEvaluator,
  EXT_BASE,
  extensionConsole,
  findContext,
  findFirefox,
  installExtension,
  launchFirefox,
  webExtLint,
} from './lib/bidi.mjs'
import {
  connectCdp,
  evaluator,
  findChrome,
  launchChrome,
  loadExtension,
  attachTarget,
  ROOT,
  unpackedExtensionId,
} from './lib/cdp.mjs'

const PORT = Number(process.env.RASD_STORE_PORT ?? 9395)
/** منفذ BiDi لحزمة Firefox — بعد منافذ حرّاسها (9231–9244). */
const FIREFOX_PORT = Number(process.env.RASD_STORE_FIREFOX_PORT ?? 9245)
const APP = (name, binary = name) => `/Applications/${name}.app/Contents/MacOS/${binary}`
/** `required`: غيابه سقوط. وغيره يُفحص إن وُجد ويُذكر إن غاب. */
const BROWSERS = [
  { id: 'chrome', label: 'Chrome', path: APP('Google Chrome'), required: true },
  { id: 'edge', label: 'Edge', path: APP('Microsoft Edge'), required: true },
  { id: 'brave', label: 'Brave', path: APP('Brave Browser') },
  { id: 'vivaldi', label: 'Vivaldi', path: APP('Vivaldi') },
  { id: 'opera', label: 'Opera', path: APP('Opera') },
]
const EVIDENCE = join(ROOT, 'Docs', 'Store', 'evidence')
const args = process.argv.slice(2)
const only = args
  .find((a) => a.startsWith('--browser='))
  ?.slice(10)
  .split(',')
  .filter(Boolean)
const shots = args.includes('--shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/**
 * مهلةٌ لكل خطوة: نداء CDP لا يعود في متصفّحٍ بعينه (قِيس في Vivaldi) يصير سقوطًا مسمّى بخطوته، لا
 * فحصًا معلّقًا بلا سطر.
 */
const step = (label, promise, ms = 15_000) =>
  Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`مهلة ${ms / 1000} ثانية في «${label}»`)
    }),
  ])

/**
 * تبويبٌ ثمّ مهلةٌ قبل الارتباط. `openTarget` في النواة يرتبط فورًا، وVivaldi لا يعيد ذلك النداء (قِيس؛ §6 الصفّ 465)؛
 * ومهلة ثلاث ثوانٍ تكفيه ولا تضرّ غيره.
 */
async function openSlow(send, url) {
  const { targetId } = await send('Target.createTarget', { url })
  await sleep(3000)
  return { targetId, sessionId: await attachTarget(send, targetId) }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const BREAK = process.env.RASD_STORE_BREAK ?? ''

/** يفكّ حزمةً مضغوطة بعد مطابقة بصمتها لملفّ `.sha256` بجانبها — في مجلّدٍ مؤقّت بمساره الحقيقي. */
function unpackVerified(name, build) {
  const zip = join(ROOT, 'dist-zip', name)
  if (!existsSync(zip)) {
    console.error(`✗ لا ${name} في dist-zip/ — شغّل \`${build}\` أولًا.`)
    process.exit(1)
  }
  const recorded = readFileSync(`${zip}.sha256`, 'utf8').split(/\s+/)[0]
  const actual = createHash('sha256').update(readFileSync(zip)).digest('hex')
  if (recorded !== actual) {
    console.error(`✗ بصمة ${name} لا تطابق ملفّ .sha256 بجانبه — الحزمة تغيّرت بعد ضغطها.`)
    process.exit(1)
  }
  // المسار الحقيقي: المعرّف يُحسب منه، و`/var` على macOS رابطٌ إلى `/private/var`.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-store-')))
  execFileSync('unzip', ['-q', zip, '-d', dir])
  return { dir, actual }
}

/** السالبان المسمّيان على حزمةٍ مفكوكة — في Chromium وFirefox بالمعنى نفسه. */
function applyBreak(unpacked, manifest) {
  if (BREAK === 'warning') {
    manifest.rasd_unknown_key = true
    writeFileSync(join(unpacked, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log('  ! تخريب مقصود لإثبات السالب: مفتاحٌ مجهول في البيان المفكوك')
  } else if (BREAK === 'runtime') {
    /*
     * استثناءٌ في سكربت النافذة — يثبت أن «أخطاء التشغيل: صفر» يُقرأ من مجمِّعٍ يعمل لا من قائمةٍ فارغة دائمًا. في النافذة
     * لا في العامل: العامل يقلع لحظة التحميل، قبل أن يُشغَّل وضع المطوّر فيبدأ الجمع؛ والنافذة تُفتح بعده.
     */
    const html = readFileSync(join(unpacked, manifest.action.default_popup), 'utf8')
    const src = /<script[^>]+src="\/?([^"]+)"/u.exec(html)?.[1]
    if (!src) throw new Error('RASD_STORE_BREAK=runtime: لا سكربت في صفحة النافذة')
    writeFileSync(
      join(unpacked, src),
      `${readFileSync(join(unpacked, src), 'utf8')}\nsetTimeout(() => { throw new Error('rasd-store-break') }, 200)\n`,
    )
    console.log('  ! تخريب مقصود لإثبات السالب: استثناءٌ في صفحة النافذة')
  } else if (BREAK) {
    console.error(`RASD_STORE_BREAK=${BREAK}: القيم warning أو runtime.`)
    process.exit(1)
  }
}

const unknown = (only ?? []).filter((id) => id !== 'firefox' && !BROWSERS.some((b) => b.id === id))
if (unknown.length > 0) {
  console.error(
    `--browser: لا أعرف ${unknown.join('، ')} — المعروف ${BROWSERS.map((b) => b.id).join('، ')}`,
  )
  process.exit(1)
}
const browsers = BROWSERS.filter((b) => (only ? only.includes(b.id) : true)).map((b) => ({
  ...b,
  // `CHROME_PATH` يستبدل Chrome وحده، كما في الحرّاس.
  path: b.id === 'chrome' ? findChrome() : existsSync(b.path) ? b.path : null,
  required: b.required || Boolean(only),
}))

let failures = 0
const name = `rasd-${pkg.version}.zip`
const chromium = browsers.length > 0 ? unpackVerified(name, 'pnpm zip') : null
const unpacked = chromium?.dir
const manifest = chromium ? JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8')) : null
if (chromium) {
  applyBreak(unpacked, manifest)
  console.log(`\nحزمة المتجر: ${name} · SHA-256 ${chromium.actual.slice(0, 12)}…`)
}

for (const b of browsers) {
  if (!b.path) {
    // غياب المطلوب لا يُقرأ نجاحًا: من أراد متصفّحًا واحدًا سمّاه بـ`--browser`.
    console.log(`\n${b.label}: غير مثبَّت — لم يُفحص.`)
    if (b.required) failures++
    continue
  }
  const run = launchChrome({
    chrome: b.path,
    port: PORT,
    prefix: `store-${b.id}`,
    args: ['--window-size=1280,800', '--lang=ar'],
  })
  const lines = []
  const fail = (m) => (failures++, lines.push(`  ✗ ${m}`))
  const ok = (m) => lines.push(`  ✓ ${m}`)
  try {
    const conn = await connectCdp(PORT)
    if (!conn) throw new Error(`تعذّر الاتصال ببروتوكول DevTools.\n${run.stderrTail()}`)
    const { send } = conn
    const version = await send('Browser.getVersion')
    lines.push(`  المتصفّح: ${version.product}`)

    const loaded = await step('التحميل', loadExtension(send, unpacked))
    if (loaded.error) {
      fail(`رفض الحزمة: ${loaded.error}`)
    } else {
      ok(`قبِل الحزمة — المعرّف ${loaded.id}`)
      if (loaded.id !== unpackedExtensionId(unpacked)) fail('المعرّف لا يطابق المحسوب من المسار')

      const ext = await step(
        'فتح صفحة الإضافات',
        // صفحة التفاصيل: تعرض الصلاحيات كما يراها المستخدم، ومسار الحزمة (يُحجب قبل اللقطة).
        openSlow(send, `chrome://extensions/?id=${loaded.id}`),
      )
      const run = evaluator(send, ext.sessionId)
      const evaluate = (expression) => step('تقييمٌ في صفحة الإضافات', run(expression), 10_000)
      // وضع المطوّر قبل تشغيل الصفحات: بدونه لا يجمع المتصفّح أخطاء التشغيل، فيُقرأ «صفر» أعمى.
      for (let i = 0; i < 40; i++) {
        const set = await evaluate(`(async () => {
          if (!globalThis.chrome?.developerPrivate) return false
          await chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })
          return (await chrome.developerPrivate.getProfileConfiguration()).inDeveloperMode
        })()`).catch(() => false)
        if (set) break
        await sleep(250)
      }

      // صفحات الإضافة تجري فيقلع العامل وتظهر أخطاء التشغيل إن وُجدت.
      for (const page of [manifest.action?.default_popup, 'src/pages/settings/index.html']) {
        if (!page) continue
        const t = await step(
          `فتح ${page}`,
          openSlow(send, `chrome-extension://${loaded.id}/${page}`),
        )
        await sleep(1500)
        await step('إغلاق الصفحة', send('Target.closeTarget', { targetId: t.targetId }))
      }
      let info = null
      for (let i = 0; i < 40 && !info; i++) {
        info = await evaluate(`(async () => {
          if (!globalThis.chrome?.developerPrivate) return null
          const x = await chrome.developerPrivate.getExtensionInfo(${JSON.stringify(loaded.id)})
          return {
            name: x.name, version: x.version, state: x.state,
            installWarnings: x.installWarnings ?? [],
            manifestErrors: (x.manifestErrors ?? []).map((e) => e.message),
            runtimeErrors: (x.runtimeErrors ?? []).filter((e) => e.severity === 'ERROR').map((e) => e.message),
            consoleWarnings: (x.runtimeErrors ?? []).filter((e) => e.severity !== 'ERROR').map((e) => e.message),
            commands: (x.commands ?? []).filter((c) => c.name.startsWith('capture-')).map((c) => c.name.slice(8) + '=' + (c.keybinding || '∅')),
          }
        })()`).catch(() => null)
        if (!info) await sleep(250)
      }
      if (!info) {
        fail('تعذّر قراءة developerPrivate من chrome://extensions')
      } else {
        ok(`${info.name} ${info.version} · الحالة ${info.state}`)
        info.version === pkg.version
          ? ok(`النسخة ${info.version} تطابق package.json`)
          : fail(`النسخة ${info.version} لا تطابق package.json (${pkg.version})`)
        for (const [key, label] of [
          ['installWarnings', 'تحذيرات التثبيت'],
          ['manifestErrors', 'أخطاء البيان'],
          ['runtimeErrors', 'أخطاء التشغيل'],
        ]) {
          info[key].length === 0
            ? ok(`${label}: صفر`)
            : fail(`${label}: ${info[key].length}\n      ${info[key].join('\n      ')}`)
        }
        // الاختصارات كما أسندها المتصفّح فعلًا — متصفّحٌ يحجز تركيبةً يتركها فارغة بصمت.
        info.commands.length === 4 && info.commands.every((c) => !c.endsWith('∅'))
          ? ok(`الاختصارات الأربعة مُسنَدة: ${info.commands.join(' · ')}`)
          : b.id === 'chrome' || b.id === 'edge'
            ? fail(`اختصارٌ بلا إسناد: ${info.commands.join(' · ')}`)
            : // متصفّحٌ يحجز تركيباتٍ لنفسه (Opera: ⇧⌘T وE وS) — يُسندها المستخدم من صفحة الاختصارات؛ لا تُسقط إلا في متصفّحَي المتجرين.
              lines.push(
                `  ! اختصارٌ يحجزه المتصفّح لنفسه، فيُسند يدويًّا: ${info.commands.join(' · ')}`,
              )
        /*
         * تحذيرات الطرفية لا تُسقط: مجمِّع الأخطاء في وضع المطوّر يلتقطها مع الأخطاء، وبعضها من المتصفّح لا من
         * رصد — Opera وVivaldi على Chromium 152 يطبعان «A preload … cross-world extension resource mismatch» لكل
         * `modulepreload` في صفحات الإضافة، وChromium 154 (Chrome وBrave وEdge) لا يطبعه (`Docs/Launch/browsers.md`).
         * فتُذكر بعددها ونصّها بلا تكرار، والحكم على الأخطاء وحدها.
         */
        const warnings = [
          ...new Set(info.consoleWarnings.map((m) => m.replace(/'[^']*'/gu, "'…'"))),
        ]
        info.consoleWarnings.length === 0
          ? ok('تحذيرات الطرفية: صفر')
          : lines.push(
              `  ! تحذيرات الطرفية: ${info.consoleWarnings.length}\n      ${warnings.join('\n      ')}`,
            )
      }
      if (shots) {
        // اللقطة دليلٌ مساند لا حكم: تعذّرها يُذكر ولا يُسقط (صفحة التفاصيل في Vivaldi لا تُلتقط عبر البروتوكول — قِيس).
        try {
          await step(
            'المقاس',
            send(
              'Emulation.setDeviceMetricsOverride',
              {
                width: 1280,
                height: 800,
                deviceScaleFactor: 1,
                mobile: false,
              },
              ext.sessionId,
            ),
          )
          await sleep(800)
          // مسار المجلّد المؤقّت يُحجب في النصّ، عبر جذور الظلّ المفتوحة كلّها في الصفحة.
          const masked = await evaluate(`(() => {
            const path = ${JSON.stringify(unpacked)}
            let n = 0
            const walk = (root) => {
              const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
              for (let t = it.nextNode(); t; t = it.nextNode()) {
                if (t.nodeValue.includes(path)) {
                  t.nodeValue = t.nodeValue.replaceAll(path, '‹مجلّد الحزمة المفكوكة›')
                  n++
                }
              }
              for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot)
            }
            walk(document)
            return n
          })()`)
          await sleep(200)
          const { data } = await step(
            'الالتقاط',
            send('Page.captureScreenshot', { format: 'png' }, ext.sessionId),
          )
          mkdirSync(EVIDENCE, { recursive: true })
          const file = join(EVIDENCE, `${b.id}-load.png`)
          writeFileSync(file, Buffer.from(data, 'base64'))
          ok(
            `لقطة صفحة الإضافات: Docs/Store/evidence/${b.id}-load.png — مسار الحزمة محجوبٌ في ${masked} موضع`,
          )
        } catch (e) {
          lines.push(`  ! تعذّرت لقطة صفحة الإضافات: ${e.message.split('\n')[0]}`)
        }
      }
    }
    conn.close()
  } catch (e) {
    fail(e.message)
  } finally {
    run.proc.kill('SIGKILL')
    await sleep(300)
    rmSync(run.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  console.log(`\n${b.label}:\n${lines.join('\n')}`)
}

if (unpacked) rmSync(unpacked, { recursive: true, force: true })
if (only?.includes('firefox')) failures += await checkFirefox()
if (failures > 0) {
  console.error(`\n✗ حزمة المتجر — ${failures} مشكلة.\n`)
  process.exit(1)
}
console.log('\n✓ الحزمة المفكوكة تُحمَّل بلا تحذير ولا خطأ.\n')

/**
 * Firefox — الحزمة المضغوطة مفكوكةً: مدقّق AMO، ثمّ التثبيت عبر BiDi، ثمّ الطرفية بعد فتح النافذة والإعدادات. يعيد
 * عدد المشكلات ويطبع أسطره كما يطبع نظيره في Chromium.
 */
async function checkFirefox() {
  const lines = []
  let problems = 0
  const fail = (m) => (problems++, lines.push(`  ✗ ${m}`))
  const ok = (m) => lines.push(`  ✓ ${m}`)
  const zipName = `rasd-${pkg.version}-firefox.zip`
  const { dir, actual: digest } = unpackVerified(zipName, 'pnpm zip:firefox')
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  applyBreak(dir, m)
  const geckoId = m.browser_specific_settings?.gecko?.id
  console.log(`\nحزمة Firefox: ${zipName} · SHA-256 ${digest.slice(0, 12)}…`)

  const lint = webExtLint(dir)
  lint.problems.length === 0
    ? ok(
        `web-ext lint: صفر خطأ، والتحذيرات المسموحة وحدها (${lint.report?.summary?.warnings ?? '?'} تحذير)`,
      )
    : fail(`web-ext lint:\n      ${lint.problems.join('\n      ')}`)

  const firefox = findFirefox()
  if (!firefox) {
    fail('Firefox غير مثبَّت — مرّر FIREFOX_PATH')
  } else {
    const downloads = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-store-ff-dl-')))
    const run = launchFirefox({
      firefox,
      port: FIREFOX_PORT,
      prefix: 'store',
      prefs: basePrefs({ geckoId, downloads }),
    })
    try {
      const conn = await connectBidi(FIREFOX_PORT, {
        ready: () => run.stderr().includes('WebDriver BiDi listening'),
      })
      if (!conn) throw new Error(`تعذّر الاتصال بـWebDriver BiDi.\n${run.stderr().slice(-400)}`)
      const { send } = conn
      await send('session.subscribe', { events: ['log.entryAdded'] })
      const browserContext = await conn.chromeContext()
      const inChrome = bidiEvaluator(send, browserContext)
      lines.push(
        `  المتصفّح: ${await inChrome('Services.appinfo.name + " " + Services.appinfo.version')}`,
      )
      const installed = await installExtension(send, dir)
      if (installed.error) {
        fail(`رفض الحزمة: ${installed.error}`)
      } else {
        installed.id === geckoId
          ? ok(`قبِل الحزمة — المعرّف ${installed.id} (gecko.id المعلن)`)
          : fail(`المعرّف ${installed.id} لا يطابق gecko.id ${geckoId}`)
        // صفحات الإضافة تجري فتظهر أخطاء التشغيل إن وُجدت — من سياق المتصفّح، فلا صفحة فحص تُضاف إلى الحزمة.
        let popup = null
        for (const page of [m.action?.default_popup, 'src/pages/settings/index.html']) {
          if (!page) continue
          const url = `${EXT_BASE}${page}`
          await inChrome(
            `(() => { gBrowser.selectedTab = gBrowser.addTab(${JSON.stringify(url)}, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); return true })()`,
          )
          const found = await findContext(send, (c) => c.url === url, { tries: 80 })
          if (!found) fail(`لم تُفتح ${page}`)
          else if (page === m.action?.default_popup) popup = found.context
        }
        await sleep(2000)
        if (popup) {
          const info = JSON.parse(
            await bidiEvaluator(
              send,
              popup,
            )(
              `chrome.commands.getAll().then((c) => JSON.stringify({ version: chrome.runtime.getManifest().version, commands: c.filter((x) => x.name.startsWith('capture-')).map((x) => x.name.slice(8) + '=' + (x.shortcut || '∅')) }))`,
            ),
          )
          info.version === pkg.version
            ? ok(`النسخة ${info.version} تطابق package.json`)
            : fail(`النسخة ${info.version} لا تطابق package.json (${pkg.version})`)
          info.commands.length === 4 && info.commands.every((c) => !c.endsWith('∅'))
            ? ok(`الاختصارات الأربعة مُسنَدة: ${info.commands.join(' · ')}`)
            : fail(`اختصارٌ بلا إسناد: ${info.commands.join(' · ')}`)
        }
        const seen = await extensionConsole(inChrome, run.stdout(), installed.id)
        seen.manifestWarnings.length === 0
          ? ok('تحذيرات البيان: صفر')
          : fail(
              `تحذيرات البيان: ${seen.manifestWarnings.length}\n      ${seen.manifestWarnings.join('\n      ')}`,
            )
        seen.errors.length === 0
          ? ok('أخطاء التشغيل: صفر')
          : fail(
              `أخطاء التشغيل: ${seen.errors.length}\n      ${[...new Set(seen.errors)].slice(0, 6).join('\n      ')}`,
            )
      }
      await send('session.end', {}, 3000).catch(() => undefined)
      conn.close()
    } catch (e) {
      fail(e.message)
    } finally {
      run.proc.kill('SIGKILL')
      await sleep(300)
      rmSync(run.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      rmSync(downloads, { recursive: true, force: true })
    }
  }
  rmSync(dir, { recursive: true, force: true })
  console.log(`\nFirefox:\n${lines.join('\n')}`)
  return problems
}
