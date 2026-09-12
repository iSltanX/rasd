#!/usr/bin/env node
/**
 * يثبت أن `dist/` تُحمَّل فعلًا في Chrome، وأن حالة صلاحياتها **وقت التشغيل**
 * تطابق السياسة.
 *
 * يشغّل Chrome بملف تعريف مؤقّت، ثم عبر بروتوكول DevTools:
 *   1. `Extensions.loadUnpacked` — يحمّل الحزمة **ويُرجع خطأ التحقّق** إن رفضها Chrome.
 *   2. يبحث عن هدف `service_worker` على معرّف إضافتنا تحديدًا.
 *   3. يتّصل به وينفّذ `chrome.permissions.getAll()` داخل الإضافة نفسها.
 *
 * لماذا لا `--load-extension`: Chrome 137+ يتجاهل هذا المفتاح صمتًا (ميزة
 * `DisableLoadExtensionCommandLineSwitch`). لا خطأ ولا تحذير — الإضافة ببساطة
 * لا تُحمَّل، فيبدو الفحص ناجحًا وهو لم يفحص شيئًا. `Extensions.loadUnpacked`
 * هو المسار المعتمد، وميزته الكبرى أن Chrome نفسه يتحقّق من صحّة البيان.
 *
 * الخطوة الثانية هي ما يحوّل «قارِن قائمة الصلاحيات المعروضة عند التثبيت يدويًا»
 * إلى فحص قابل للتكرار: الصلاحيات الممنوحة فعلًا، لا المعلَنة في البيان فقط.
 *
 * **تصحيح 2026-09-12 (الوحدة 23.1):** كان هنا «غير مُدرج في CI — المرحلة 23
 * تملك تشغيل المتصفح»، وصار مُدرجًا فعلًا منذ مصفوفة الحرّاس. و`§6` صفّ 97
 * يقتبس السطر القديم حرفيًّا حجّةً، فيبقى اقتباسه صحيحًا عن وقته لا عن اليوم —
 * والصفّ 98 يسجّل النقض. يُشغَّل في البيئتين بالأمر نفسه:
 *   pnpm verify:load
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import * as PERMS from '../src/shared/permission-policy.ts'

/** نطاق المحارف العربية. ثابت مُسمّى: سطر يبدأ بـ`/` يُقرأ قسمةً لا تعبيرًا نمطيًا. */
const ARABIC_RANGE = /[\u0600-\u06FF]/

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const PORT = 9333

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))

/**
 * معرّف الإضافة غير المضغوطة مشتقّ حتميًا من مسارها المطلق:
 * أول 16 بايتًا من SHA-256 للمسار، كل نصف بايت يُخرَّط إلى a–p.
 *
 * ضروري لأن المتصفح يشغّل إضافات مكوّنة مدمجة لها هي أيضًا service workers،
 * فالبحث عن «أي هدف service_worker» يلتقط إضافة Chrome داخلية بدل إضافتنا.
 */
function unpackedExtensionId(absPath) {
  const digest = createHash('sha256').update(absPath, 'utf8').digest()
  let id = ''
  for (const byte of digest.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f))
  }
  return id
}

if (!existsSync(dist)) {
  console.error('dist/ غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}

/** اللغة الافتراضية كما يعلنها البيان المبنيّ — تُقرأ ولا تُفترَض. */
const DEFAULT_LOCALE = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).default_locale
if (!chrome) {
  console.error('لم يُعثر على Chrome. مرّر المسار عبر CHROME_PATH.')
  process.exit(1)
}

const profile = mkdtempSync(join(tmpdir(), 'rasd-verify-'))
const proc = spawn(
  chrome,
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

let stderr = ''
proc.stderr.on('data', (d) => (stderr += d.toString()))

async function cleanup() {
  proc.kill('SIGKILL')
  // Chrome قد يكون ما يزال يكتب في ملف التعريف — لا نُفشل الفحص بسبب التنظيف.
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

/** جلسة CDP على مستوى المتصفح — `/json/list` لا يُدرج الـservice workers. */
async function connect() {
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
  if (!wsUrl) return null

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id !== id) return
        ws.removeEventListener('message', onMsg)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      }
      ws.addEventListener('message', onMsg)
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  return { ws, send }
}

const session = await connect()
if (!session) {
  await cleanup()
  console.error('تعذّر الاتصال ببروتوكول DevTools.\n' + stderr.split('\n').slice(-10).join('\n'))
  process.exit(1)
}

const { ws, send } = session

let loadedId = null
let loadRejection = null
try {
  const res = await send('Extensions.loadUnpacked', { path: dist })
  loadedId = res.id
} catch (e) {
  loadRejection = e.message
}

const expectedId = unpackedExtensionId(dist)
const ownOrigin = `chrome-extension://${loadedId ?? expectedId}/`

// الـservice worker في MV3 كسول: نمنحه فرصًا متتابعة ليستيقظ ويسجّل هدفه.
let targets = []
for (let i = 0; i < 20 && loadedId; i++) {
  const { targetInfos } = await send('Target.getTargets')
  targets = targetInfos
  if (targets.some((t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin))) break
  await new Promise((r) => setTimeout(r, 300))
}
// إضافتنا وحدها — لا أي service worker.
const sw = targets.find((t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin))

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}

if (loadRejection) {
  // هنا يظهر خطأ تحقّق البيان الحقيقي من Chrome نفسه.
  fail(`Chrome رفض الحزمة: ${loadRejection}`)
} else if (!sw) {
  fail(`لم يُسجَّل service worker على ${ownOrigin} — إضافتنا لم تُحمَّل أو الـSW لم يعمل.`)
  lines.push('    الأهداف: ' + targets.map((t) => `${t.type}:${t.url}`).join('\n              '))
} else {
  ok(`Chrome قبِل الحزمة — المعرّف ${loadedId}`)
  const id = new URL(sw.url).host
  ok(`service worker يعمل — ${sw.url.replace(`chrome-extension://${id}/`, '')}`)
  loadedId === expectedId
    ? ok('المعرّف يطابق المحسوب من المسار — التحميل حتمي وقابل للتكرار')
    : fail(`المعرّف ${loadedId} لا يطابق المحسوب ${expectedId}`)

  // ── حالة الصلاحيات وقت التشغيل ────────────────────────────────
  try {
    const { sessionId } = await send('Target.attachToTarget', {
      targetId: sw.targetId,
      flatten: true,
    })
    const evaluate = async (expression) => {
      const res = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      )
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
      return res.result.value
    }

    const info = await evaluate(`(async () => {
      const m = chrome.runtime.getManifest()
      const granted = await chrome.permissions.getAll()
      return JSON.stringify({ name: m.name, version: m.version, ui: chrome.i18n.getUILanguage(), granted })
    })()`)
    const { name, version, ui, granted } = JSON.parse(info)

    /*
     * **الاسم يُقاس ضدّ لغة المتصفّح، لا ضدّ لغة جهاز المطوّر.**
     *
     * البيان يعلن `__MSG_extName__` و`default_locale: "ar"`، وChrome يحلّه
     * بلغة واجهته هو. فادّعاء «الاسم عربي» كان يمرّ على جهاز عربي ويسقط على
     * عدّاء إنجليزي بالاسم الصحيح تمامًا — وهذا ما قِيس في CI أربع جولات:
     * `الاسم ليس عربيًا: "Rasd"`، وهو الاسم الذي **يجب** أن يظهر هناك.
     *
     * فما يُثبَت هنا أدقّ وأقوى معًا: الاسم المحلول يطابق `extName` في
     * **ملفّ الترجمة الذي تختاره لغة هذا المتصفّح** (وإلّا فملفّ اللغة
     * الافتراضية). فيبقى الفحص المزدوج ضدّ الالتباس («هل اتّصلنا بإضافة
     * أخرى؟») قائمًا، ويصير عربيّةُ الاسم مقيسةً حيث تصحّ: في `ar` وحدها،
     * وهي `default_locale` المعلَنة — تُقرأ من القرص لا من المتصفّح.
     */
    const uiLocale = String(ui ?? '').replace('-', '_')
    const localeDir = [uiLocale, uiLocale.split('_')[0], DEFAULT_LOCALE].find((c) =>
      existsSync(join(dist, '_locales', c, 'messages.json')),
    )
    const expectedName = localeDir
      ? JSON.parse(readFileSync(join(dist, '_locales', localeDir, 'messages.json'), 'utf8')).extName
          ?.message
      : null
    name === expectedName
      ? ok(
          `الاسم بعد حلّ i18n: ${name} — يطابق _locales/${localeDir} للغة ${ui} · النسخة ${version}`,
        )
      : fail(
          `الاسم "${name}" لا يطابق extName في _locales/${localeDir} ("${expectedName}") — هل اتّصلنا بإضافة أخرى؟`,
        )

    // والعربية تُقاس في موضعها: اللغة الافتراضية المعلَنة في البيان.
    const arabicName = JSON.parse(
      readFileSync(join(dist, '_locales', DEFAULT_LOCALE, 'messages.json'), 'utf8'),
    ).extName?.message
    ARABIC_RANGE.test(arabicName ?? '')
      ? ok(`اللغة الافتراضية «${DEFAULT_LOCALE}» تحمل اسمًا عربيًا: ${arabicName}`)
      : fail(`اسم اللغة الافتراضية ليس عربيًا: "${arabicName}" — والمنتج عربي أوّلًا`)

    // هذا هو المعيار الحاسم للمرحلة 2، مقروءًا من المتصفح لا من الملف.
    const origins = granted.origins ?? []
    origins.length === 0
      ? ok('صفر صلاحيات مضيف ممنوحة — لا تحذير «قراءة وتغيير جميع بياناتك»')
      : fail(`صلاحيات مضيف ممنوحة عند التثبيت: ${origins.join(', ')}`)

    const grantedPerms = (granted.permissions ?? []).sort()
    const expected = [...PERMS.REQUIRED_PERMISSIONS].sort()
    const extra = grantedPerms.filter((p) => !expected.includes(p))
    const missing = expected.filter((p) => !grantedPerms.includes(p))
    extra.length === 0 && missing.length === 0
      ? ok(`الصلاحيات الممنوحة تطابق السياسة: ${grantedPerms.join(' · ')}`)
      : fail(`الممنوحة تخالف السياسة — زائدة: [${extra.join(', ')}] ناقصة: [${missing.join(', ')}]`)

    const optionalLeaked = [...PERMS.OPTIONAL_PERMISSIONS].filter((p) => grantedPerms.includes(p))
    optionalLeaked.length === 0
      ? ok('لا صلاحية اختيارية ممنوحة تلقائيًا')
      : fail(`صلاحيات اختيارية مُنحت بلا طلب: ${optionalLeaked.join(', ')}`)
  } catch (e) {
    fail(`تعذّر قراءة حالة الصلاحيات: ${e.message}`)
  }
}

ws.close()
await cleanup()

console.log('\nفحص التحميل في Chrome:')
console.log(`  المتصفح: ${chrome}`)
console.log(lines.join('\n'))

if (errors.length > 0) {
  console.error(`\n✗ فشل الفحص — ${errors.length} مشكلة.\n`)
  process.exit(1)
}
console.log('\n✓ الحزمة تُحمَّل في Chrome وتعمل بالصلاحيات المعلنة.\n')
