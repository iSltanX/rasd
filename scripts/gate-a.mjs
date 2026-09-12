#!/usr/bin/env node
/**
 * البوّابة A — كل التزام · حتمية بالكامل · صفر حكم لغوي.
 *
 * ([القسم 5 من الدستور](../Docs/Constitution.md)). تصمد لأنها لا تحتاج
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
 *   pnpm gate:a
 */
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** السقف المقيس عند التبنّي — تغييره يحتاج قياسًا جديدًا وقيدًا في CHANGELOG. */
const CEILING_SECONDS = 48

/**
 * مخروط الأثر: أي منطقة تغيّرت ← أي سكربت حيّ يلزم قبل الإغلاق.
 *
 * تغييرٌ لا يطابق أي مدخل هنا يستدعي **طقم الإغلاق كاملًا** — الافتراض
 * الآمن حين لا يُعرف الأثر، لا الصمت.
 */
const IMPACT = [
  { match: /^src\/background\/commands\.ts/u, scripts: ['verify:activate'] },
  {
    match: /^src\/background\/full-page-job\.ts/u,
    scripts: ['verify:activate', 'verify:fullpage'],
  },
  { match: /^src\/content\/index\.ts/u, scripts: ['verify:activate'] },
  { match: /^src\/content\/host\.ts/u, scripts: ['verify:activate', 'verify:overlay'] },
  { match: /^src\/content\/tools\/compare\.ts/u, scripts: ['verify:compare'] },
  { match: /^src\/content\/tools\/measure\.ts/u, scripts: ['verify:measure'] },
  { match: /^src\/content\/tools\/eyedropper\.ts/u, scripts: ['verify:colour'] },
  { match: /^src\/content\/tools\/inspect\.ts/u, scripts: ['verify:inspect'] },
  { match: /^src\/ui\/overlay\/compare\//u, scripts: ['verify:compare'] },
  { match: /^src\/pages\/popup\//u, scripts: ['verify:popup'] },
  { match: /^src\/pages\/editor\//u, scripts: ['verify:editor'] },
  { match: /^src\/pages\/library\//u, scripts: ['verify:library'] },
  { match: /^src\/shared\/messaging\//u, scripts: ['verify:activate', 'verify:capture'] },
  { match: /^src\/shared\/storage\//u, scripts: ['verify:library', 'verify:compare'] },
  {
    match: /^(manifest\.config\.ts|src\/shared\/permission-policy\.ts)/u,
    scripts: ['verify:load'],
  },
  // توثيق وسكربتات وخطّة: لا أثر تشغيلي — تُستثنى صراحةً لا صمتًا.
  {
    match: /^(Docs\/|scripts\/|tests\/|Rasd_Plan\.md|README\.md|STATUS\.md|package\.json)/u,
    scripts: [],
  },
]

const STEPS = [
  { name: 'pnpm check', run: () => execSync('pnpm run check', { cwd: root, stdio: 'inherit' }) },
  { name: 'pnpm build', run: () => execSync('pnpm run build', { cwd: root, stdio: 'inherit' }) },
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
    // خريطة المراحل كانت تُحدَّث يدويًّا داخل طقس الإغلاق، فانحرفت صامتةً حين
    // أُغلقت مراحل بلا طقس كامل (§8). الحارس يجعل الانحراف مستحيلًا لا مُستبعَدًا.
    name: 'حارس خريطة المراحل',
    run: () =>
      execFileSync(process.execPath, ['scripts/phases-sync.mjs', '--check'], {
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
/** ما تغيّر: شجرة العمل أوّلًا، وإن كانت نظيفة فآخر التزام — كي يعمل قبل الالتزام وبعده. */
function changedFiles() {
  const base = process.env.RASD_GATE_BASE ?? 'HEAD'
  const list = (ref) =>
    execSync(`git diff --name-only ${ref}`, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  try {
    const working = list(base)
    return working.length > 0 ? working : list('HEAD~1')
  } catch {
    return []
  }
}

const changed = changedFiles()

const needed = new Set()
let unmapped = 0
for (const file of changed) {
  const entry = IMPACT.find((i) => i.match.test(file))
  if (!entry) {
    unmapped += 1
    continue
  }
  for (const s of entry.scripts) needed.add(s)
}

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
    console.log('  · لا أثر تشغيلي — تغييرات موثّقة الاستثناء (توثيق/سكربتات/اختبارات)')
  }
}

if (failed.length > 0) {
  console.error(`\n✗ البوّابة A سقطت عند: ${failed.join(' · ')}\n`)
  process.exit(1)
}
console.log('\n✓ البوّابة A خضراء.\n')
