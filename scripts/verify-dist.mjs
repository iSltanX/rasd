#!/usr/bin/env node
/**
 * بوّابة ما بعد البناء: تثبت أن `dist/` حزمة MV3 صالحة، **وأنها تطابق السياسة**.
 *
 * تُشغَّل تلقائيًا في نهاية `pnpm build`. الفحوص مقسومة قسمين:
 *   • صحّة الحزمة (المرحلة 1) — بيان صالح، ملفات موجودة، أيقونات سليمة.
 *   • مطابقة السياسة (المرحلة 2) — الصلاحيات، الحقن، CSP، الاختصارات، اللغات.
 *   • ميزانية الحزمة (`STAGES/19`) — المحتوى والنافذة مضغوطتين، بقرار ADR 0027.
 *   • مستهلك كل صلاحية (`STAGES/23`) — لا صلاحية معلَنة بلا نداء واجهتها في الحزمة، بقرار ADR 0055.
 *
 * القوائم تُقرأ من `src/shared/` نفسها، فلا يمكن أن تفترق السياسة عن البيان.
 *
 * **`--target chromium|firefox`** (الافتراضي `chromium` كما كان): الهدف يحدّد المجلّد (`dist/` أو `dist-firefox/`)
 * وتوقّعات البيان — الجدول في `Docs/Browsers/Architecture.md` §4.4، والفحوص كلّها بعده مشتركة. هذا فحصٌ ثانٍ على ما
 * يفرضه `tests/unit/build/manifest-targets.test.ts` على المصدر، فلا ينجو بيانٌ مبنيّ مخالف.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import * as PAGES from '../src/shared/page-paths.ts'
import * as PERMS from '../src/shared/permission-policy.ts'

import { OUT_DIRS, parseBuildTarget } from './build-target.ts'
import { BUDGETS, fmt, gzipBytes, judge, pageGraph } from './bundle-budget.mjs'
import { judgeExtensionCsp, judgeHostPermissions } from './csp-policy.mjs'
import { judgePermissionConsumers } from './permission-consumers.mjs'
import { CHROMIUM_MIN_VERSION, FIREFOX_SETTINGS } from './target-manifest.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

/** `--target <هدف>` أو `--target=<هدف>`. غيابه ⇐ `chromium`؛ وقيمةٌ ناقصة أو مجهولة ⇐ خروج بخطأ لا ضمنًا إلى الافتراضي. */
function targetFromArgs(argv) {
  const at = argv.findIndex((a) => a === '--target' || a.startsWith('--target='))
  if (at === -1) return parseBuildTarget(undefined)
  const raw = argv[at].includes('=') ? argv[at].slice(argv[at].indexOf('=') + 1) : argv[at + 1]
  if (raw === undefined || raw === '' || raw.startsWith('--')) {
    throw new Error('--target بلا قيمة — المسموح: chromium · firefox')
  }
  return parseBuildTarget(raw, '--target')
}

let target
try {
  target = targetFromArgs(process.argv.slice(2))
  /*
   * **لا نجاح زائف على حزمةٍ قديمة:** `RASD_TARGET=firefox pnpm build` يبني `dist-firefox/` ثمّ يفحص — بلا علَم — `dist/`
   * التي بُنيت قبل أسبوع فتمرّ. فمتغيّرٌ يسمّي هدفًا غير المفحوص، بلا علَمٍ يحسم، التباسٌ يُرفض لا يُخمَّن.
   */
  const fromEnv = parseBuildTarget(process.env.RASD_TARGET)
  const explicit = process.argv.slice(2).some((a) => a === '--target' || a.startsWith('--target='))
  if (!explicit && fromEnv !== target) {
    throw new Error(
      `RASD_TARGET = ${fromEnv} لكن الفحص بلا --target فيقع على ${target} — مرّر --target ${fromEnv} صراحةً (أو أزل المتغيّر)`,
    )
  }
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(2)
}
const FIREFOX = target === 'firefox'
const outDirName = OUT_DIRS[target]
const dist = join(root, outDirName)

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const group = (title) => lines.push(`\n  ── ${title} ──`)

if (!existsSync(dist)) {
  console.error(
    `${outDirName}/ غير موجود — شغّل \`${FIREFOX ? 'pnpm build:firefox' : 'pnpm build'}\` أولًا.`,
  )
  process.exit(1)
}

// ═══ صحّة الحزمة ═══════════════════════════════════════════════════
group('صحّة الحزمة')

const manifestPath = join(dist, 'manifest.json')
let manifest = null
if (!existsSync(manifestPath)) {
  fail(`${outDirName}/manifest.json غير موجود`)
} else {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    ok('manifest.json صالح JSON')
  } catch (e) {
    fail(`manifest.json غير صالح: ${e.message}`)
  }
}

if (manifest) {
  manifest.manifest_version === 3
    ? ok('manifest_version = 3')
    : fail(`manifest_version = ${manifest.manifest_version} — مطلوب 3`)

  for (const field of ['name', 'version', 'icons', 'action', 'background']) {
    manifest[field] ? ok(`حقل ${field} موجود`) : fail(`حقل ${field} مفقود`)
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  manifest.version === pkg.version
    ? ok(`النسخة ${manifest.version} تطابق package.json`)
    : fail(`النسخة ${manifest.version} لا تطابق package.json (${pkg.version})`)

  manifest.background?.type === 'module'
    ? ok(`${FIREFOX ? 'صفحة الأحداث' : 'service worker'} من نوع module`)
    : fail('background.type يجب أن يكون "module"')

  // كل ملف يشير إليه البيان موجود فعلًا
  const referenced = new Set()
  for (const p of Object.values(manifest.icons ?? {})) referenced.add(p)
  for (const p of Object.values(manifest.action?.default_icon ?? {})) referenced.add(p)
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker)
  for (const script of manifest.background?.scripts ?? []) referenced.add(script)
  if (manifest.action?.default_popup) referenced.add(manifest.action.default_popup)

  let missingRefs = 0
  for (const ref of referenced) {
    if (!existsSync(join(dist, ref))) {
      fail(`البيان يشير إلى ملف غير موجود: ${ref}`)
      missingRefs++
    }
  }
  if (missingRefs === 0) ok(`كل الملفات المشار إليها موجودة (${referenced.size})`)

  // الأيقونات: توقيع PNG وأبعاد مقروءة من ترويسة IHDR
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (const [size, path] of Object.entries(manifest.icons ?? {})) {
    const full = join(dist, path)
    if (!existsSync(full)) continue
    const buf = readFileSync(full)
    if (!buf.subarray(0, 8).equals(PNG_SIG)) {
      fail(`الأيقونة ${path} ليست PNG صالحة`)
      continue
    }
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    w === Number(size) && h === Number(size)
      ? ok(`أيقونة ${size}×${size} صالحة`)
      : fail(`الأيقونة ${path} أبعادها ${w}×${h} والمطلوب ${size}×${size}`)
  }
}

// ═══ اللغات ════════════════════════════════════════════════════════
let messages = null
if (manifest) {
  group('اللغات')
  const locale = manifest.default_locale
  if (!locale) {
    fail('default_locale مفقود — الاسم والوصف يجب أن يمرّا عبر chrome.i18n')
  } else {
    const msgPath = join(dist, '_locales', locale, 'messages.json')
    if (!existsSync(msgPath)) {
      fail(`default_locale = ${locale} لكن _locales/${locale}/messages.json غير موجود`)
    } else {
      try {
        messages = JSON.parse(readFileSync(msgPath, 'utf8'))
        ok(`لغة الأساس ${locale} — ${Object.keys(messages).length} رسالة`)
      } catch (e) {
        fail(`ملف رسائل ${locale} غير صالح: ${e.message}`)
      }
    }

    // كل لغة أخرى تحمل نفس المفاتيح
    const localesDir = join(dist, '_locales')
    if (existsSync(localesDir) && messages) {
      const baseKeys = Object.keys(messages).sort().join(',')
      for (const loc of await readdir(localesDir)) {
        if (loc === locale) continue
        const p = join(localesDir, loc, 'messages.json')
        if (!existsSync(p)) {
          fail(`لغة ${loc} بلا messages.json`)
          continue
        }
        const other = JSON.parse(readFileSync(p, 'utf8'))
        Object.keys(other).sort().join(',') === baseKeys
          ? ok(`لغة ${loc} مكتملة المفاتيح`)
          : fail(`لغة ${loc} لا تطابق مفاتيح ${locale}`)
      }
    }
  }
}

/** نطاق المحارف العربية الأساسي. ثابت مُسمّى: سطر يبدأ بـ`/` يُقرأ قسمةً لا تعبيرًا نمطيًا. */
const ARABIC_RANGE = /[\u0600-\u06FF]/

/** يحلّ `__MSG_key__` إلى نصّه من لغة الأساس. */
const resolveMsg = (value, where) => {
  const m = /^__MSG_(\w+)__$/.exec(String(value ?? ''))
  if (!m) return value ?? null
  const entry = messages?.[m[1]]
  if (!entry) {
    fail(`الرسالة ${m[1]} (${where}) مشار إليها في البيان وغير معرَّفة`)
    return null
  }
  return entry.message
}

if (manifest) {
  const resolvedName = resolveMsg(manifest.name, 'name')
  ARABIC_RANGE.test(resolvedName ?? '')
    ? ok(`الاسم عربي بعد حلّ i18n: ${resolvedName}`)
    : fail(`الاسم ليس عربيًا: ${resolvedName}`)
  resolveMsg(manifest.description, 'description')
  resolveMsg(manifest.action?.default_title, 'action.default_title')
}

// ═══ سياسة الصلاحيات ═══════════════════════════════════════════════
if (manifest) {
  group('سياسة الصلاحيات')

  const declared = manifest.permissions ?? []
  const required = [...PERMS.REQUIRED_PERMISSIONS]
  const extra = declared.filter((p) => !required.includes(p))
  const missing = required.filter((p) => !declared.includes(p))
  extra.length === 0 && missing.length === 0
    ? ok(`الصلاحيات الدائمة تطابق السياسة (${declared.length})`)
    : fail(
        `الصلاحيات الدائمة تخالف السياسة — زائدة: [${extra.join(', ')}] ناقصة: [${missing.join(', ')}]`,
      )

  const optDeclared = manifest.optional_permissions ?? []
  const optPolicy = [...PERMS.OPTIONAL_PERMISSIONS]
  optDeclared.length === optPolicy.length && optDeclared.every((p) => optPolicy.includes(p))
    ? ok(`الصلاحيات الاختيارية تطابق السياسة (${optDeclared.length})`)
    : fail(`الصلاحيات الاختيارية تخالف السياسة: [${optDeclared.join(', ')}]`)

  const forbidden = [...declared, ...optDeclared].filter((p) =>
    PERMS.FORBIDDEN_PERMISSIONS.includes(p),
  )
  forbidden.length === 0
    ? ok('لا صلاحية من القائمة المحظورة')
    : fail(`صلاحيات محظورة في البيان: ${forbidden.join(', ')}`)

  // هذا هو المعيار الحاسم للمرحلة 2
  !manifest.host_permissions || manifest.host_permissions.length === 0
    ? ok('لا صلاحيات مضيف دائمة — لا تحذير «قراءة وتغيير جميع بياناتك»')
    : fail(
        `صلاحيات مضيف دائمة: ${manifest.host_permissions.join(', ')} — تُظهر تحذيرًا عند التثبيت`,
      )

  /*
   * **مطابقة لا حضور** (ADR 0046): كان الفحص «القائمة غير فارغة»، فنمطٌ يُضاف بلا قرار يمرّ أخضر. والقائمة اليوم
   * `<all_urls>` وأنماط الخدمات المسمّاة، فتُطابَق بالسياسة مجموعةً.
   */
  const hosts = judgeHostPermissions(manifest.optional_host_permissions, [
    ...PERMS.OPTIONAL_HOST_PERMISSIONS,
  ])
  hosts.extra.length === 0 && hosts.missing.length === 0
    ? ok(`صلاحيات المضيف الاختيارية تطابق السياسة (${PERMS.OPTIONAL_HOST_PERMISSIONS.join(', ')})`)
    : fail(
        `صلاحيات المضيف الاختيارية تخالف السياسة — زائدة: [${hosts.extra.join(', ')}] ناقصة: [${hosts.missing.join(', ')}]`,
      )
}

// ═══ مستهلك كل صلاحية ══════════════════════════════════════════════
/*
 * **«لا صلاحية في البيان بلا مستهلك»** (ADR 0055): مطابقة البيان للسياسة أعلاه لا تكفي — السياسة نفسها حملت
 * `tabs` و`desktopCapture` و`offscreen` بصفر مستهلك حتى `STAGES/23`. فكل صلاحية معلَنة تشترط بصمة نداء واجهتها في
 * ملفّات الحزمة نفسها.
 */
if (manifest) {
  group('مستهلك كل صلاحية')

  const jsFiles = (await walk(dist)).filter((f) => f.endsWith('.js'))
  const consumers = judgePermissionConsumers(
    manifest,
    jsFiles.map((file) => ({ file: relative(dist, file), text: readFileSync(file, 'utf8') })),
  )
  for (const { permission, file } of consumers.matched) ok(`${permission} ← ${file}`)
  for (const problem of consumers.problems) fail(problem)
}

// ═══ بيان الهدف ═════════════════════════════════════════════════════
/*
 * جدول `Docs/Browsers/Architecture.md` §4.4 حرفًا: ما يفرضه كل هدف، وما يُحظر عليه. الفحص بالقيمتين معًا — `chromium`
 * بلا `gecko` وبـ`service_worker` و`minimum_chrome_version`، و`firefox` بالعكس — فلا يتسرّب مفتاح هدفٍ إلى الآخر.
 */
if (manifest) {
  group(`بيان الهدف (${target})`)

  const gecko = manifest.browser_specific_settings?.gecko
  const hasWorker = typeof manifest.background?.service_worker === 'string'
  const scripts = manifest.background?.scripts
  const hasScripts = Array.isArray(scripts) && scripts.length > 0
  const hasMinChrome = manifest.minimum_chrome_version !== undefined

  if (FIREFOX) {
    typeof gecko?.id === 'string' && gecko.id.includes('@')
      ? ok(`gecko.id = ${gecko.id}`)
      : fail('browser_specific_settings.gecko.id مفقود — إلزامي للتوقيع في MV3')
    typeof gecko?.strict_min_version === 'string'
      ? ok(`gecko.strict_min_version = ${gecko.strict_min_version}`)
      : fail('gecko.strict_min_version مفقود — موافقة جمع البيانات المضمَّنة تُعرض من Firefox 140')
    Array.isArray(gecko?.data_collection_permissions?.required)
      ? ok('gecko.data_collection_permissions موجود — إلزامي للإضافات الجديدة منذ 2025-11-03')
      : fail('gecko.data_collection_permissions مفقود')
    /*
     * **المطابقة حرفًا لا حضورًا:** المعرّف دائم بقرار المالك، وحضور `@` لا يمسك معرّفًا آخر ولا حدًّا أدنى خاطئًا ولا فئة
     * بيانات تُضاف. فالمبنيّ يُقارَن بما يبنيه `manifest.config.ts` نفسه (`scripts/target-manifest.ts`) — فيمسك ما يطرأ
     * بعد المصدر أو داخل البناء.
     */
    isDeepStrictEqual(manifest.browser_specific_settings, FIREFOX_SETTINGS)
      ? ok(
          'browser_specific_settings تطابق ما يبنيه البيان حرفًا (المعرّف الدائم والحدّان الأدنيان وفئات البيانات)',
        )
      : fail(
          `browser_specific_settings تخالف المصدر — المبنيّ: ${JSON.stringify(manifest.browser_specific_settings)} · المتوقَّع: ${JSON.stringify(FIREFOX_SETTINGS)}`,
        )
    hasScripts
      ? ok(`background.scripts موجود (${scripts.length})`)
      : fail('background.scripts مفقود — Firefox لا يشغّل service_worker')
    !hasWorker
      ? ok('لا background.service_worker')
      : fail('background.service_worker موجود — يُرفض في Firefox')
    !hasMinChrome
      ? ok('لا minimum_chrome_version')
      : fail('minimum_chrome_version موجود — بلا معنى في Firefox ويحذّر المدقّق')
  } else {
    hasWorker
      ? ok('background.service_worker موجود')
      : fail('background.service_worker مفقود — Chromium MV3 يشترطه')
    !hasScripts ? ok('لا background.scripts') : fail('background.scripts موجود في بيان Chromium')
    manifest.minimum_chrome_version === CHROMIUM_MIN_VERSION
      ? ok(`minimum_chrome_version = ${manifest.minimum_chrome_version}`)
      : fail(
          `minimum_chrome_version = ${manifest.minimum_chrome_version ?? 'مفقود'} — المطلوب ${CHROMIUM_MIN_VERSION}`,
        )
    manifest.browser_specific_settings === undefined
      ? ok('لا browser_specific_settings — لا يُشحن ما لا يقرؤه Chrome')
      : fail('browser_specific_settings موجود في بيان Chromium — مفتاحُ Firefox تسرّب')
  }
}

// ═══ سياسة الحقن والأمن ════════════════════════════════════════════
if (manifest) {
  group('الحقن والأمن')

  !manifest.content_scripts
    ? ok('لا content_scripts تلقائي — الحقن يدوي عبر chrome.scripting')
    : fail('content_scripts موجود — يخالف ADR 0005 (سياسة الحقن اليدوي)')

  /*
   * **المطابقة بالقائمة المسمّاة — ADR 0046.** كان الشرط «لا `https?://` في السياسة» ومعه فحص حضور
   * `connect-src 'self'` (الوحدة 20.3: سياسةٌ تحذف `connect-src` كانت تمرّ خضراء). والأوّل يمنع الخدمة المسمّاة
   * نفسها، فصار الحكم في `csp-policy.mjs`: `connect-src` تساوي `'self'` و`NETWORK_ORIGINS` حرفًا، وكل توجيهٍ غيرها
   * على الإضافة وحدها، ولا `unsafe-*` في أيّها. ومصدرٌ ثانٍ يُضاف إلى البيان بلا أن يُسمّى في السياسة يُسقط البناء.
   */
  const csp = manifest.content_security_policy?.extension_pages ?? ''
  const cspVerdict = judgeExtensionCsp(csp, [...PERMS.NETWORK_ORIGINS])
  if (cspVerdict.problems.length === 0) {
    ok('CSP بلا unsafe-* ولا سكربت خارجي، وكل توجيهٍ غير connect-src على الإضافة وحدها')
    ok(`connect-src تطابق الخدمات المسمّاة حرفًا: ${cspVerdict.connect.join(' ')}`)
  } else {
    for (const problem of cspVerdict.problems) fail(`CSP: ${problem} — "${csp}"`)
  }

  // Firefox لا يعرف `split` (يُثبَّته `not_allowed` ويحذّر المدقّق)، و`use_dynamic_url` بلا معنى فيه: مضيف
  // `moz-extension://<UUID>` عشوائي لكل تثبيت أصلًا. فتوقّعه للهدف الثاني العكس صراحةً (§4.4).
  const wantIncognito = FIREFOX ? 'not_allowed' : 'split'
  manifest.incognito === wantIncognito
    ? ok(`incognito = ${wantIncognito}`)
    : fail(`incognito = ${manifest.incognito} — المطلوب "${wantIncognito}"`)

  const war = manifest.web_accessible_resources ?? []
  if (FIREFOX) {
    war.length > 0 && war.every((e) => !('use_dynamic_url' in e))
      ? ok(`web_accessible_resources بلا use_dynamic_url (${war.length} مجموعة)`)
      : fail(
          'web_accessible_resources في Firefox بلا use_dynamic_url — لا معنى له فيه ويحذّر المدقّق',
        )
  } else {
    war.length > 0 && war.every((e) => e.use_dynamic_url === true)
      ? ok(`web_accessible_resources بعناوين ديناميكية (${war.length} مجموعة)`)
      : fail('web_accessible_resources يجب أن تستخدم use_dynamic_url لمنع التبصيم')
  }

  const cmds = Object.entries(manifest.commands ?? {})
  const suggested = cmds.filter(([, c]) => c.suggested_key)
  suggested.length <= 4
    ? ok(`اختصارات مقترحة: ${suggested.length}/4 (حدّ Chrome)`)
    : fail(`${suggested.length} اختصارًا مقترحًا — Chrome يسمح بأربعة فقط`)
  for (const [name, c] of cmds) resolveMsg(c.description, `commands.${name}`)
}

// ═══ صفحات الإضافة ═════════════════════════════════════════════════
group('صفحات الإضافة')
for (const [name, path] of Object.entries(PAGES.PAGE_PATHS)) {
  existsSync(join(dist, path)) ? ok(`صفحة ${name}`) : fail(`صفحة ${name} مفقودة: ${path}`)
}

// ═══ نظافة الحزمة ══════════════════════════════════════════════════
group('نظافة الحزمة')
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}
const files = await walk(dist)

const leaked = files.filter((f) => /\.(ts|tsx)$/.test(f))
leaked.length === 0
  ? ok('لا ملفات TypeScript في الحزمة')
  : fail(`تسرّبت ملفات مصدر: ${leaked.map((f) => relative(dist, f)).join(', ')}`)

const totalBytes = files.reduce((n, f) => n + statSync(f).size, 0)
ok(`حجم الحزمة: ${(totalBytes / 1024).toFixed(1)} KB عبر ${files.length} ملفًا`)

// ═══ ميزانية الحزمة ════════════════════════════════════════════════
group('ميزانية الحزمة (ADR 0027)')

/**
 * رقمان مطبوعان في كل بناء، وسقوطٌ عند تجاوز أيّهما. كانت الميزانية مكتوبةً منذ ADR 0002 ولا
 * يقيسها شيء، والمحتوى بلغ نحو 80% منها بلا أن يراه أحد إلا بقياس يدوي (`STAGES/19`).
 * والسقف لا يُرفع: من تجاوزه يسلك الروافع بترتيبها في ADR 0027.
 */
const verdict = (label, result, detail) => {
  const line = `${label}: ${fmt(result.bytes)} بايت مضغوطة من ${fmt(result.budget)} (${(result.ratio * 100).toFixed(1)}%) — ${detail}`
  result.ok
    ? ok(line)
    : fail(
        `${line} — تتجاوز السقف بـ${fmt(result.over)} بايت؛ لا تُرفع الميزانية، والروافع في ADR 0027`,
      )
}

const contentPath = join(dist, 'content.js')
if (existsSync(contentPath)) {
  const raw = readFileSync(contentPath)
  verdict('content.js', judge(gzipBytes(raw), BUDGETS.content), `${fmt(raw.length)} بايت خامًا`)
} else {
  fail('content.js غير موجود — تعذّر قياس ميزانية المحتوى')
}

const popupHtml = PAGES.PAGE_PATHS.popup
if (existsSync(join(dist, popupHtml))) {
  const graph = pageGraph(dist, popupHtml)
  for (const m of graph.missing) fail(`النافذة تحمّل ملفًّا غير موجود: ${m}`)
  const sizeOf = (ext) =>
    graph.files
      .filter((f) => f.endsWith(ext))
      .reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0)
  const js = sizeOf('.js')
  const css = sizeOf('.css')
  verdict(
    'النافذة',
    judge(js + css, BUDGETS.popup),
    `${graph.files.length} ملفًّا عند الفتح: JS ${fmt(js)} · CSS ${fmt(css)}`,
  )
} else {
  fail(`${popupHtml} غير موجود — تعذّر قياس ميزانية النافذة`)
}

// ═══ قدرات محظورة لكل حزمة ═════════════════════════════════════════
group('قدرات محظورة لكل حزمة')

/**
 * عقدٌ مدوَّن: ما لا يجوز أن يصل حزمةً بعينها مهما التوى مسار الاستيراد.
 *
 * **حارس ناتج لا حارس مصدر**: `architectureZones` في `eslint.config.js`
 * يمنع الاستيراد المباشر ويُنذر مبكرًا، لكنه **أعمى عن العبور** — العطل
 * الحقيقي كان `content ← modules/compare/reference ← shared/storage`، وكل
 * حلقة فيه مشروعة منفردةً (`modules/library/search.ts` يستورد التخزين بحقّ
 * لأنه يعمل في صفحة إضافة). الحزمة المبنية وحدها تُظهر ما وصل فعلًا.
 * القسم 2 من `AGENTS.md`.
 */
const BUNDLE_BANS = [
  {
    file: 'content.js',
    pattern: /\bindexedDB\b/,
    capability: 'نفاذ IndexedDB',
    why: 'سكربت المحتوى يعمل بأصل الصفحة المزارة، فقاعدته قاعدة الموقع لا قاعدة رصد — كل كتابة «تنجح» في المكان الخطأ (الصفّ 78 في §6). التخزين تملكه الخلفية، والطريق رسالة في contract.ts.',
  },
]

for (const ban of BUNDLE_BANS) {
  const path = join(dist, ban.file)
  if (!existsSync(path)) {
    fail(`${ban.file} غير موجود — تعذّر فحص القدرات المحظورة عليه`)
    continue
  }
  const source = readFileSync(path, 'utf8')
  if (ban.pattern.test(source)) {
    fail(`${ban.file} يحوي ${ban.capability} — ${ban.why}`)
  } else {
    ok(`${ban.file} بلا ${ban.capability}`)
  }
}

console.log('\nفحص الحزمة:')
console.log(lines.join('\n'))

if (errors.length > 0) {
  console.error(`\n✗ فشل الفحص — ${errors.length} مشكلة.\n`)
  process.exit(1)
}
console.log('\n✓ الحزمة صالحة ومطابقة للسياسة.\n')
