#!/usr/bin/env node
/**
 * بوّابة ما بعد البناء: تثبت أن `dist/` حزمة MV3 صالحة، **وأنها تطابق السياسة**.
 *
 * تُشغَّل تلقائيًا في نهاية `pnpm build`. الفحوص مقسومة قسمين:
 *   • صحّة الحزمة (المرحلة 1) — بيان صالح، ملفات موجودة، أيقونات سليمة.
 *   • مطابقة السياسة (المرحلة 2) — الصلاحيات، الحقن، CSP، الاختصارات، اللغات.
 *
 * القوائم تُقرأ من `src/shared/` نفسها، فلا يمكن أن تفترق السياسة عن البيان.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import * as PAGES from '../src/shared/page-paths.ts'
import * as PERMS from '../src/shared/permission-policy.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')

const errors = []
const lines = []
const ok = (m) => lines.push(`  ✓ ${m}`)
const fail = (m) => {
  errors.push(m)
  lines.push(`  ✗ ${m}`)
}
const group = (title) => lines.push(`\n  ── ${title} ──`)

if (!existsSync(dist)) {
  console.error('dist/ غير موجود — شغّل `pnpm build` أولًا.')
  process.exit(1)
}

// ═══ صحّة الحزمة ═══════════════════════════════════════════════════
group('صحّة الحزمة')

const manifestPath = join(dist, 'manifest.json')
let manifest = null
if (!existsSync(manifestPath)) {
  fail('dist/manifest.json غير موجود')
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
    ? ok('service worker من نوع module')
    : fail('background.type يجب أن يكون "module"')

  // كل ملف يشير إليه البيان موجود فعلًا
  const referenced = new Set()
  for (const p of Object.values(manifest.icons ?? {})) referenced.add(p)
  for (const p of Object.values(manifest.action?.default_icon ?? {})) referenced.add(p)
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker)
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

  Array.isArray(manifest.optional_host_permissions) && manifest.optional_host_permissions.length > 0
    ? ok(`صلاحيات المضيف اختيارية (${manifest.optional_host_permissions.join(', ')})`)
    : fail('optional_host_permissions مفقودة')
}

// ═══ سياسة الحقن والأمن ════════════════════════════════════════════
if (manifest) {
  group('الحقن والأمن')

  !manifest.content_scripts
    ? ok('لا content_scripts تلقائي — الحقن يدوي عبر chrome.scripting')
    : fail('content_scripts موجود — يخالف ADR 0005 (سياسة الحقن اليدوي)')

  const csp = manifest.content_security_policy?.extension_pages ?? ''
  csp && !/unsafe-eval|unsafe-inline|https?:\/\//.test(csp)
    ? ok('CSP بلا unsafe-eval ولا unsafe-inline ولا مصادر خارجية')
    : fail(`CSP غير آمنة أو مفقودة: "${csp}"`)

  manifest.incognito === 'split'
    ? ok('incognito = split')
    : fail(`incognito = ${manifest.incognito} — المطلوب "split"`)

  const war = manifest.web_accessible_resources ?? []
  war.length > 0 && war.every((e) => e.use_dynamic_url === true)
    ? ok(`web_accessible_resources بعناوين ديناميكية (${war.length} مجموعة)`)
    : fail('web_accessible_resources يجب أن تستخدم use_dynamic_url لمنع التبصيم')

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

console.log('\nفحص الحزمة:')
console.log(lines.join('\n'))

if (errors.length > 0) {
  console.error(`\n✗ فشل الفحص — ${errors.length} مشكلة.\n`)
  process.exit(1)
}
console.log('\n✓ الحزمة صالحة ومطابقة للسياسة.\n')
