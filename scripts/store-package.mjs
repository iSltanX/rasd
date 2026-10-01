#!/usr/bin/env node
/**
 * حزمة المتجر كما تُرفع — تُفكّ من ملفّها المضغوط وتُحمَّل في متصفّحٍ نظيف، وتُقرأ تحذيراتها من المتصفّح
 * نفسه (`STAGES/28`).
 *
 *   pnpm zip && pnpm store:package            # Chrome ثمّ Edge إن وُجد
 *   pnpm store:package --browser=edge         # متصفّحٌ واحد — وبلا الوسيط يسقط إن غاب أحدهما
 *   pnpm store:package --shots                # ويحفظ لقطة صفحة الإضافات في Docs/Store/evidence/
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
 * **ليس حارس CI.** منفذه خاصّ به (9395) لا من منافذ الحرّاس المشتركة، ولا يُبنى عليه سجلّ ترقية.
 * وسالبان مسمّيان يجب أن يسقطا: `RASD_STORE_BREAK=warning` يضيف إلى البيان المفكوك مفتاحًا مجهولًا،
 * و`RASD_STORE_BREAK=runtime` يرمي استثناءً في العامل بعد إقلاعه.
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
  connectCdp,
  evaluator,
  findChrome,
  launchChrome,
  loadExtension,
  openTarget,
  ROOT,
  unpackedExtensionId,
} from './lib/cdp.mjs'

const PORT = Number(process.env.RASD_STORE_PORT ?? 9395)
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
const EVIDENCE = join(ROOT, 'Docs', 'Store', 'evidence')
const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith('--browser='))?.slice(10)
const shots = args.includes('--shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const name = `rasd-${pkg.version}.zip`
const zip = join(ROOT, 'dist-zip', name)
if (!existsSync(zip)) {
  console.error(`✗ لا ${name} في dist-zip/ — شغّل \`pnpm zip\` أولًا.`)
  process.exit(1)
}
const recorded = readFileSync(`${zip}.sha256`, 'utf8').split(/\s+/)[0]
const actual = createHash('sha256').update(readFileSync(zip)).digest('hex')
if (recorded !== actual) {
  console.error(`✗ بصمة ${name} لا تطابق ملفّ .sha256 بجانبه — الحزمة تغيّرت بعد ضغطها.`)
  process.exit(1)
}

// المسار الحقيقي: المعرّف يُحسب منه، و`/var` على macOS رابطٌ إلى `/private/var`.
const unpacked = realpathSync(mkdtempSync(join(tmpdir(), 'rasd-store-')))
execFileSync('unzip', ['-q', zip, '-d', unpacked])
const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf8'))
const BREAK = process.env.RASD_STORE_BREAK ?? ''
if (BREAK === 'warning') {
  manifest.rasd_unknown_key = true
  writeFileSync(join(unpacked, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('  ! تخريب مقصود لإثبات السالب: مفتاحٌ مجهول في البيان المفكوك')
} else if (BREAK === 'runtime') {
  // استثناءٌ في العامل بعد إقلاعه — يثبت أن «أخطاء التشغيل: صفر» يُقرأ من مجمِّعٍ يعمل لا من قائمةٍ فارغة دائمًا.
  const sw = join(unpacked, manifest.background.service_worker)
  writeFileSync(
    sw,
    `${readFileSync(sw, 'utf8')}\nsetTimeout(() => { throw new Error('rasd-store-break') }, 200)\n`,
  )
  console.log('  ! تخريب مقصود لإثبات السالب: استثناءٌ في العامل')
} else if (BREAK) {
  console.error(`RASD_STORE_BREAK=${BREAK}: القيم warning أو runtime.`)
  process.exit(1)
}

const browsers = [
  { id: 'chrome', label: 'Chrome', path: findChrome(), scheme: 'chrome' },
  { id: 'edge', label: 'Edge', path: existsSync(EDGE) ? EDGE : null, scheme: 'edge' },
].filter((b) => !only || b.id === only)

let failures = 0
console.log(`\nحزمة المتجر: ${name} · SHA-256 ${actual.slice(0, 12)}…`)

for (const b of browsers) {
  if (!b.path) {
    // غيابه لا يُقرأ نجاحًا: من أراد متصفّحًا واحدًا سمّاه بـ`--browser`.
    console.log(`\n${b.label}: غير مثبَّت — لم يُفحص.`)
    failures++
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

    const loaded = await loadExtension(send, unpacked)
    if (loaded.error) {
      fail(`رفض الحزمة: ${loaded.error}`)
    } else {
      ok(`قبِل الحزمة — المعرّف ${loaded.id}`)
      if (loaded.id !== unpackedExtensionId(unpacked)) fail('المعرّف لا يطابق المحسوب من المسار')

      const ext = await openTarget(send, `${b.scheme}://extensions/?id=${loaded.id}`)
      const evaluate = evaluator(send, ext.sessionId)
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
        const t = await openTarget(send, `chrome-extension://${loaded.id}/${page}`)
        await sleep(1500)
        await send('Target.closeTarget', { targetId: t.targetId })
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
            runtimeErrors: (x.runtimeErrors ?? []).map((e) => e.message),
          }
        })()`).catch(() => null)
        if (!info) await sleep(250)
      }
      if (!info) {
        fail(`تعذّر قراءة developerPrivate من ${b.scheme}://extensions`)
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
      }
      if (shots) {
        await send(
          'Emulation.setDeviceMetricsOverride',
          {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          },
          ext.sessionId,
        )
        await sleep(800)
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, ext.sessionId)
        mkdirSync(EVIDENCE, { recursive: true })
        const file = join(EVIDENCE, `${b.id}-load.png`)
        writeFileSync(file, Buffer.from(data, 'base64'))
        ok(`لقطة صفحة الإضافات: Docs/Store/evidence/${b.id}-load.png`)
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

rmSync(unpacked, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n✗ حزمة المتجر — ${failures} مشكلة.\n`)
  process.exit(1)
}
console.log('\n✓ الحزمة المفكوكة تُحمَّل بلا تحذير ولا خطأ.\n')
