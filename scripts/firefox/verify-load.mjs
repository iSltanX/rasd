#!/usr/bin/env node
/**
 * حارس Firefox `load` — الحزمة تُثبَّت في Firefox حقيقي وتعمل بالصلاحيات المعلنة، ومدقّق AMO يقبلها.
 *
 * نظير `scripts/verify-load.mjs` فوق النواة الثانية (`scripts/lib/bidi.mjs`، SS7). ما يُثبَت:
 *   1. Firefox يقبل `dist-firefox/` تثبيتًا مؤقّتًا، والمعرّف هو `gecko.id` المعلن.
 *   2. الخلفية **صفحة أحداث** (`background.scripts`) لا عامل خدمة، وتقلع: جولة التعريف تُفتح عند التثبيت
 *      (`onInstalled`)، وتردّ على رسائل رصد (`capture/latest`).
 *   3. الاسم يُحلّ بلغة المتصفّح، والنسخة تطابق `package.json`.
 *   4. الصلاحيات الممنوحة تطابق السياسة (`permission-policy.ts`): الستّ الدائمة، وصفر مضيف، وصفر اختيارية،
 *      وصفر موافقة جمع بيانات (`data_collection`) — لا شيء يُمنح بلا طلب.
 *   5. الاختصارات الأربعة مسجَّلة بمفاتيحها عند Firefox نفسه.
 *   6. `web-ext lint` على `dist-firefox/`: صفر خطأ، والتحذيرات المسموحة وحدها (`innerHTML` لأيقونات SVG ثابتة).
 *   7. صفر تحذير بيان عند التثبيت، وصفر خطأ من الإضافة في الطرفية طوال الجولة.
 *
 * نسخة الفحص بلا صلاحية مضيف — كالحزمة كما تُرفع — وفيها صفحة الفحص وحدها زيادةً (انظر ترويسة النواة).
 *
 *   pnpm build:firefox && pnpm firefox:load
 *   RASD_GUARD_SABOTAGE=service-worker-loader.js pnpm firefox:load   # السالب: يجب أن يسقط
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as PERMS from '../../src/shared/permission-policy.ts'
import { DIST, ROOT, startGuard, webExtLint } from '../lib/bidi.mjs'

const PORT = 9231
const ARABIC_RANGE = /[؀-ۿ]/u

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const g = await startGuard({
  prefix: 'load',
  port: PORT,
  title: '── حارس Firefox: التثبيت والصلاحيات ومدقّق AMO ──',
  hardTimeoutMs: 120_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)

if (!g.extId) await g.abort()
const geckoId = manifest.browser_specific_settings?.gecko?.id
g.extId === geckoId
  ? ok(`Firefox قبِل الحزمة — المعرّف ${g.extId} (gecko.id المعلن)`)
  : fail(`المعرّف ${g.extId} لا يطابق gecko.id المعلن ${geckoId}`)
if (!g.ext) await g.abort()

// ── الخلفية ──────────────────────────────────────────────────────
g.tour
  ? ok('جولة التعريف فُتحت عند التثبيت — الخلفية أقلعت ومستمع onInstalled يعمل')
  : fail('جولة التعريف لم تُفتح عند التثبيت — الخلفية لم تقلع أو onInstalled لم يُنادَ')

const background = await g
  .ext(
    `chrome.runtime.getBackgroundPage().then((w) => w ? new URL(w.location.href).pathname : 'none', (e) => 'error: ' + e.message)`,
  )
  .catch((e) => `error: ${e.message}`)
background === '/_generated_background_page.html'
  ? ok('الخلفية صفحة أحداث (background.scripts) لا عامل خدمة')
  : fail(`الخلفية ليست صفحة الأحداث المتوقَّعة: ${background}`)

const latest = await g.message('capture/latest').catch((e) => ({ ok: false, error: e.message }))
latest?.ok === true
  ? ok(`الخلفية تردّ على رسائل رصد — capture/latest ⇐ ${JSON.stringify(latest.value)}`)
  : fail(`الخلفية لا تردّ على capture/latest: ${JSON.stringify(latest)}`)

// ── الاسم والنسخة ────────────────────────────────────────────────
const info = JSON.parse(
  await g.ext(`(async () => {
    const m = chrome.runtime.getManifest()
    const granted = await chrome.permissions.getAll()
    const commands = await chrome.commands.getAll()
    return JSON.stringify({
      name: m.name, version: m.version, ui: chrome.i18n.getUILanguage(), granted,
      commands: commands.filter((c) => c.name.startsWith('capture-')).map((c) => ({ name: c.name, shortcut: c.shortcut ?? '' })),
    })
  })()`),
)
const ui = String(info.ui ?? '').replace('-', '_')
const localeDir = [ui, ui.split('_')[0], manifest.default_locale].find((c) =>
  existsSync(join(DIST, '_locales', c, 'messages.json')),
)
const messages = (dir) =>
  JSON.parse(readFileSync(join(DIST, '_locales', dir, 'messages.json'), 'utf8'))
const expectedName = localeDir ? messages(localeDir).extName?.message : null
info.name === expectedName
  ? ok(`الاسم بعد حلّ i18n: ${info.name} — يطابق _locales/${localeDir} للغة ${info.ui}`)
  : fail(`الاسم «${info.name}» لا يطابق extName في _locales/${localeDir} («${expectedName}»)`)
ARABIC_RANGE.test(messages(manifest.default_locale).extName?.message ?? '')
  ? ok(`اللغة الافتراضية «${manifest.default_locale}» تحمل اسمًا عربيًّا`)
  : fail('اسم اللغة الافتراضية ليس عربيًّا — والمنتج عربي أوّلًا')
info.version === pkg.version
  ? ok(`النسخة ${info.version} تطابق package.json`)
  : fail(`النسخة ${info.version} لا تطابق package.json (${pkg.version})`)

// ── الصلاحيات الممنوحة ───────────────────────────────────────────
const granted = (info.granted.permissions ?? []).sort()
const expected = [...PERMS.REQUIRED_PERMISSIONS].sort()
const extra = granted.filter((p) => !expected.includes(p))
const missing = expected.filter((p) => !granted.includes(p))
extra.length === 0 && missing.length === 0
  ? ok(`الصلاحيات الممنوحة تطابق السياسة: ${granted.join(' · ')}`)
  : fail(`الممنوحة تخالف السياسة — زائدة: [${extra.join(', ')}] ناقصة: [${missing.join(', ')}]`)
;(info.granted.origins ?? []).length === 0
  ? ok('صفر صلاحيات مضيف ممنوحة عند التثبيت')
  : fail(`صلاحيات مضيف ممنوحة عند التثبيت: ${info.granted.origins.join(', ')}`)
const leaked = [...PERMS.OPTIONAL_PERMISSIONS].filter((p) => granted.includes(p))
leaked.length === 0
  ? ok('لا صلاحية اختيارية ممنوحة تلقائيًّا')
  : fail(`صلاحيات اختيارية مُنحت بلا طلب: ${leaked.join(', ')}`)
Array.isArray(info.granted.data_collection) && info.granted.data_collection.length === 0
  ? ok('صفر موافقة جمع بيانات ممنوحة — data_collection يُطلب عند أوّل إرسال لا قبله')
  : fail(`data_collection عند التثبيت: ${JSON.stringify(info.granted.data_collection)}`)

// ── الاختصارات ───────────────────────────────────────────────────
const declared = Object.keys(manifest.commands ?? {}).filter((n) => n.startsWith('capture-'))
const bound = info.commands.filter((c) => c.shortcut)
bound.length === declared.length && declared.length === 4
  ? ok(
      `الاختصارات الأربعة مسجَّلة بمفاتيحها: ${bound.map((c) => `${c.name.slice(8)}=${c.shortcut}`).join(' · ')}`,
    )
  : fail(
      `اختصارٌ بلا إسناد: ${info.commands.map((c) => `${c.name}=${c.shortcut || '∅'}`).join(' · ')}`,
    )

// ── مدقّق AMO ────────────────────────────────────────────────────
const lint = webExtLint(DIST)
if (lint.report) {
  const s = lint.report.summary ?? {}
  note(
    `web-ext lint: ${s.errors ?? '?'} خطأ · ${s.warnings ?? '?'} تحذير · ${s.notices ?? '?'} ملاحظة`,
  )
}
lint.problems.length === 0
  ? ok('web-ext lint على dist-firefox/: صفر خطأ، والتحذيرات المسموحة وحدها')
  : fail(`web-ext lint:\n      ${lint.problems.join('\n      ')}`)

// ── الطرفية ──────────────────────────────────────────────────────
const warnings = await g.manifestWarnings()
warnings.length === 0
  ? ok('صفر تحذير بيان عند التثبيت (Reading manifest)')
  : fail(`تحذيرات البيان: ${warnings.length}\n      ${warnings.join('\n      ')}`)
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({
  success: '✓ الحزمة تُثبَّت في Firefox وتعمل بالصلاحيات المعلنة، ومدقّق AMO يقبلها.',
})
