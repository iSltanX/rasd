#!/usr/bin/env node
/**
 * البوّابة A — مرّة عند إغلاق المرحلة · حتمية بالكامل · صفر حكم لغوي.
 *
 * ([القسم 5 من الدستور](../AGENTS.md)). تصمد لأنها لا تحتاج
 * تقديرًا: كل بند فيها أمرٌ نتيجته ثنائية، فلا يمكن ختمها مجاملةً كما
 * تُختَم مراجعةٌ تحتاج حكمًا.
 *
 * **سقفها الزمني 48 ثانية** — ضعف زمن `pnpm check` المقيس يوم التبنّي
 * (24s). البوّابة تطبع زمنها عند كل تشغيل وتُنذر عند التجاوز: بوّابةٌ
 * بطيئة تُعطَّل بعد أسبوعين، وحارس معطَّل أسوأ من غيابه (البند 69).
 *
 * **ما ليس فيها عمدًا — سكربتات `verify:*`**: قِيست فوجدت الواحد منها
 * يتجاوز السقف وحده (تشغيل Chrome حقيقي، و`verify:activate` يلتقط صفحة
 * كاملة في 16s ضمن جولة تتجاوز الدقيقة). ونصّ الدستور كان يضعها هنا؛
 * فحكم القياس وعُدِّل النصّ — وهي أوّل مرّة تعمل فيها المادّة «عند تعارض
 * الدستور مع قياس، القياس يحكم» (CHANGELOG 1.1). فتُشغَّل هذه السكربتات
 * قبل الإغلاق وقبل الدمج ضمن البوّابة B، وتطبع البوّابة A هنا **مخروط
 * الأثر**: أي سكربت يلزم تشغيله قبل إغلاق ما تغيّر — تذكيرًا لا تنفيذًا.
 *
 * **تُشغَّل مرّة عند إغلاق المرحلة لا بعد كل دفعة** (AGENTS.md §4، «اقتصاد
 * الفحوص»). والمخروط يُحسَب عندها على المرحلة كلّها لا على آخر التزام:
 *
 *   pnpm gate:a
 *   RASD_GATE_BASE=origin/main pnpm gate:a   ← عند الإغلاق، والدفعات التزامات محلّية
 *   RASD_GATE_BASE=wave-XX/base pnpm gate:a  ← مرحلة ضمن موجة، وبوّابة الموجة (ADR 0026)
 */
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { changedFiles, coneOf } from './impact.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** السقف المقيس عند التبنّي — تغييره يحتاج قياسًا جديدًا وقيدًا في CHANGELOG. */
const CEILING_SECONDS = 48

const STEPS = [
  { name: 'pnpm check', run: () => execSync('pnpm run check', { cwd: root, stdio: 'inherit' }) },
  // `build:bundle` ثمّ `verify:dist` لا `build`: الأخير يعيد `typecheck` التي جرت في `check`.
  {
    name: 'pnpm build:bundle · verify:dist',
    run: () =>
      execSync('pnpm run build:bundle && pnpm run verify:dist', { cwd: root, stdio: 'inherit' }),
  },
  {
    name: 'حارس سجلّ التناقضات',
    run: () =>
      execFileSync(process.execPath, ['scripts/docs-lint.mjs'], { cwd: root, stdio: 'inherit' }),
  },
  {
    name: 'حارس جرد نقاط الدخول',
    run: () =>
      execFileSync(process.execPath, ['scripts/entrypoints-lint.mjs'], {
        cwd: root,
        stdio: 'inherit',
      }),
  },
  {
    // الحالة تُكتب في ترويسات `STAGES/NN.md` وحدها، و`STATUS.md` وجدول `ROADMAP.md`
    // مشتقّان منها. الحارس يجعل افتراق الثلاثة مستحيلًا لا مُستبعَدًا.
    name: 'حارس مزامنة المراحل',
    run: () =>
      execFileSync(process.execPath, ['scripts/stages-sync.mjs', '--check'], {
        cwd: root,
        stdio: 'inherit',
      }),
  },
  {
    // عمود `blocking` في `ci.yml` كان يُكتَب بيد وقاعدتُه تعليقًا لا يقرؤه شيء.
    // الحارس يجعله مشتقًّا من سجلٍّ مقيس — بلا شبكة، فلا يُدخِل CI في دور.
    name: 'حارس سجلّ ترقية الحرّاس',
    run: () =>
      execFileSync(process.execPath, ['scripts/guards-sync.mjs', '--check'], {
        cwd: root,
        stdio: 'inherit',
      }),
  },
]

const started = Date.now()
const failed = []

for (const step of STEPS) {
  try {
    step.run()
  } catch {
    failed.push(step.name)
    break // البوّابة تتوقّف عند أوّل فشل — لا معنى لمواصلة بناء فوق شيفرة ساقطة.
  }
}

const seconds = Math.round((Date.now() - started) / 1000)

// ── مخروط الأثر ─────────────────────────────────────────────────
// الجدول ودالّتاه في `impact.mjs`: بوّابة الموجة تقرؤه أيضًا. و`RASD_GATE_BASE` يقبل وسم
// الموجة (`wave-XX/base`) كما يقبل `origin/main`.
const changed = changedFiles(process.env.RASD_GATE_BASE ?? 'HEAD')
const cone = coneOf(changed)
const needed = new Set(cone.needed)
const unmapped = cone.unmapped

console.log('\n── البوّابة A ──')
console.log(`  الزمن: ${seconds}s (السقف ${CEILING_SECONDS}s)`)
if (seconds > CEILING_SECONDS) {
  console.warn(`  ⚠ تجاوز السقف — يفرض تقليمًا أو نقلًا إلى البوّابة B، لا توسيعًا صامتًا للسقف.`)
}

if (changed.length > 0) {
  console.log(`\n  مخروط الأثر (${changed.length} ملفًّا متغيّرًا):`)
  if (unmapped > 0) {
    console.log(`  · ${unmapped} ملفًّا خارج جدول الربط ⇒ طقم الإغلاق كاملًا قبل الإغلاق أو الدمج`)
  }
  if (needed.size > 0) {
    console.log(`  · يلزم قبل الإغلاق: ${[...needed].map((s) => `pnpm ${s}`).join(' · ')}`)
  }
  if (unmapped === 0 && needed.size === 0) {
    console.log('  · لا أثر تشغيلي — تغييرات موثّقة الاستثناء (توثيق/سكربتات/اختبارات/إعداد CI)')
  }
}

if (failed.length > 0) {
  console.error(`\n✗ البوّابة A سقطت عند: ${failed.join(' · ')}\n`)
  process.exit(1)
}
console.log('\n✓ البوّابة A خضراء.\n')
