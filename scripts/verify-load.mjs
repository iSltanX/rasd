#!/usr/bin/env node
/**
 * يثبت أن `dist/` تُحمَّل فعلًا في Chrome، وأن حالة صلاحياتها **وقت التشغيل**
 * تطابق السياسة.
 *
 * يشغّل Chrome بملف تعريف مؤقّت، ثم عبر بروتوكول DevTools:
 *   1. تحميل الحزمة عبر البروتوكول (`loadExtension` في النواة) — **ويُرجع خطأ التحقّق** إن رفضها Chrome.
 *   2. يبحث عن هدف `service_worker` على معرّف إضافتنا تحديدًا.
 *   3. يتّصل به وينفّذ `chrome.permissions.getAll()` داخل الإضافة نفسها.
 *
 * لماذا لا `--load-extension`: Chrome 137+ يتجاهل هذا المفتاح صمتًا (ميزة
 * `DisableLoadExtensionCommandLineSwitch`). لا خطأ ولا تحذير — الإضافة ببساطة
 * لا تُحمَّل، فيبدو الفحص ناجحًا وهو لم يفحص شيئًا. التحميل عبر بروتوكول DevTools
 * هو المسار المعتمد، وميزته الكبرى أن Chrome نفسه يتحقّق من صحّة البيان.
 *
 * **فوق النواة المشتركة** (`scripts/lib/cdp.mjs`، `STAGES/17`): الإقلاع والاتصال والتحميل والارتباط
 * والمهلة الصلبة والتنظيف هناك، وأحكام هذا الملفّ هنا كما كانت.
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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as PERMS from '../src/shared/permission-policy.ts'

import {
  attachLiveServiceWorker,
  DIST as dist,
  startGuard,
  unpackedExtensionId,
} from './lib/cdp.mjs'

/** نطاق المحارف العربية. ثابت مُسمّى: سطر يبدأ بـ`/` يُقرأ قسمةً لا تعبيرًا نمطيًا. */
const ARABIC_RANGE = /[\u0600-\u06FF]/

const PORT = 9333

/** اللغة الافتراضية كما يعلنها البيان المبنيّ — تُقرأ ولا تُفترَض. */
const DEFAULT_LOCALE = existsSync(join(dist, 'manifest.json'))
  ? JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).default_locale
  : null

/**
 * **مهلة صلبة — حارسٌ معلَّق يبتلع جولةً كاملة.** قِيس في CI مرّتين متتاليتين:
 * `verify:load` بلغ مهلة الخطوة (ستّ دقائق) بلا سطر واحد من خَرْجه. فتسعون ثانية
 * سقفٌ مقيس لا مقدَّر: الجولة الناجحة على العدّاء أقلّ من عشرين ثانية، وستّون منها
 * لانتظار منفذ التنقيح وحده. وبلوغُه يطبع **ما جُمع حتى اللحظة** ثمّ يسقط. ومهلة
 * بقيّة الحرّاس صارت في النواة المشتركة (`STAGES/17`) لا أربع عشرة رقعة متطابقة.
 */
const HARD_TIMEOUT_MS = 90_000

// الحزمة نفسها لا نسخة فحص: المعرّف المحسوب من مسارها جزءٌ ممّا يُثبَت.
const g = await startGuard({
  prefix: 'verify',
  port: PORT,
  title: 'فحص التحميل في Chrome:',
  stage: false,
  hardTimeoutMs: HARD_TIMEOUT_MS,
})
const { send, ok, fail, lines } = g
lines.push(`  المتصفح: ${g.chrome}`)

const loadedId = g.extId
const loadRejection = g.loadError

const expectedId = unpackedExtensionId(g.extPath)
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

if (loadRejection) {
  // هنا يظهر خطأ تحقّق البيان الحقيقي من Chrome نفسه — سجّلته النواة: «Chrome رفض الحزمة: …».
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
    /*
     * **الارتباط بسياقٍ حيّ لا بهدفٍ موجود** — انظر ترويسة `live-sw.mjs`.
     *
     * كان هذا الملفّ الوحيد الباقي خارج تلك الوحدة: أربعة عشر حارسًا اعتمدوها
     * حين حُسم السباق (‏`§6` صفّ 96) وبقي هو يرتبط بالهدف مباشرةً. والأثر
     * قِيس هنا: `Target.attachToTarget` على عاملٍ يُستبدَل أثناء إقلاعه —
     * أو أوّل تقييم بعده — يترك وعدًا معلَّقًا **بلا مهلة**، فبلغ الحارس
     * مهلة الخطوة (ستّ دقائق) في CI مرّتين، ثمّ سمّت المهلةُ الصلبة موضعه
     * بالضبط: «علّق بعد ✓ المعرّف يطابق المحسوب».
     */
    const { swSession } = await attachLiveServiceWorker(send, loadedId)
    if (!swSession) throw new Error('سياق الـservice worker لم يصر حيًّا خلال المهلة')
    const sessionId = swSession
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

await g.finish({ success: '✓ الحزمة تُحمَّل في Chrome وتعمل بالصلاحيات المعلنة.' })
