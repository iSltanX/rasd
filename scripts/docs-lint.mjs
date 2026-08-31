#!/usr/bin/env node
/**
 * حارس سجلّ التناقضات — **كل صفّ جديد في §6 يحمل دليلًا أو يُعلن غيابه**.
 *
 * العلّة التي بُني لها: الصفّ 38 سجّل فجوة تغطية حقيقية ثم أغلقها بـ
 * «`verify-fullpage.mjs` يمرّ به فعلًا الآن» — ادّعاءٌ لم يُقَس، وكان
 * باطلًا (ذلك السكربت يُسلِّح المستقبِلات يدويًا قبل الاختبار). فتحوّل
 * الإنذارُ الصحيح إلى **ختم أمانٍ زائف** ورثته كل مرحلة بعده ومنع إعادة
 * الفحص. صفٌّ يغلق فجوة بلا قياس أخطر من الفجوة نفسها.
 *
 * **حتمي بلا حكم لغوي** (شرط البوّابة A): لا يقرأ الصفّ ليحكم هل هو
 * «ادّعاء إغلاق» — ذلك حكم دلالي يُنتج إنذارات كاذبة. يفرض بدلًا منه
 * قاعدة ثنائية على كل صفّ: إمّا **أمر قابل لإعادة التشغيل**، وإمّا
 * **إعلان صريح لغياب الأمر وسببه** بالوسم `[بلا أمر: …]`. فيصير كل صفّ
 * مُصرِّحًا بحالته الإثباتية، والصمت وحده هو المرفوض.
 *
 * **يحكم من الصفّ 82 فصاعدًا** — أي بعد صفّ التبنّي (81) مباشرةً. الصفوف
 * السابقة لا تُمسّ: §6 سجلّ إلحاقي لا يُعدَّل، وتطبيق قاعدةٍ بأثر رجعي
 * يفرض تحرير ثمانين صفًّا مغلقًا. القاعدة تسري على ما يُكتب بعد اعتمادها.
 *
 *   node scripts/docs-lint.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PLAN = join(root, 'Rasd_Plan.md')

/** أوّل صفّ يحكمه هذا الحارس — صفّ التبنّي (81) وما قبله خارج نطاقه. */
const FIRST_GOVERNED_ROW = 82

/**
 * ما يُعدّ أمرًا قابلًا لإعادة التشغيل.
 *
 * لا يكفي ذكر اسم سكربت: «راجع verify-x» ليس أمرًا. المطلوب صيغة تُنسَخ
 * وتُشغَّل كما هي — ولذلك يشترط النمط بادئةَ مُشغِّل (`pnpm`/`node`/`npx`)
 * أو أداة سطر أوامر معروفة بوسائطها.
 */
const COMMAND_PATTERNS = [
  /\bpnpm\s+(?:run\s+)?[\w:@./-]+/u,
  /\bnode\s+scripts\/[\w./-]+\.mjs/u,
  /\bnpx\s+[\w@./-]+/u,
  /\bgit\s+(?:worktree|diff|log|show)\b/u,
  /\bgrep\s+-[\w]*\s/u,
  /\btest\s+-[fd]\s/u,
]

/** إعلانٌ صريح بغياب الأمر وسببه — الصيغة مقصودة الصرامة كي لا تُكتب سهوًا. */
const NO_COMMAND_DECLARATION = /\[بلا أمر:\s*[^\]]{8,}\]/u

if (!existsSync(PLAN)) {
  console.error('Rasd_Plan.md غير موجود.')
  process.exit(1)
}

const lines = readFileSync(PLAN, 'utf8').split('\n')

/** صفوف §6: تبدأ بـ`| <رقم> |` — الجداول الأخرى في الملفّ لا تبدأ برقم مجرّد. */
const ROW = /^\|\s*(\d+)\s*\|/u

const checked = []
const failures = []

for (const [index, line] of lines.entries()) {
  const match = ROW.exec(line)
  if (!match) continue
  const number = Number(match[1])
  if (number < FIRST_GOVERNED_ROW) continue

  const hasCommand = COMMAND_PATTERNS.some((p) => p.test(line))
  const declares = NO_COMMAND_DECLARATION.test(line)

  checked.push(number)
  if (!hasCommand && !declares) {
    failures.push({ number, line: index + 1 })
  }
}

console.log('\nحارس سجلّ التناقضات (§6):')
console.log(`  يحكم من الصفّ ${FIRST_GOVERNED_ROW} فصاعدًا — الصفوف قبله خارج نطاقه بالتصميم`)

if (checked.length === 0) {
  console.log('  · لا صفوف خاضعة بعد — لا شيء يُفحَص')
} else {
  console.log(`  فُحص ${checked.length} صفًّا: ${checked.join(' · ')}`)
}

if (failures.length > 0) {
  console.error('')
  for (const f of failures) {
    console.error(
      `  ✗ الصفّ ${f.number} (سطر ${f.line}): بلا أمر قابل لإعادة التشغيل، وبلا إعلان صريح لغيابه.`,
    )
  }
  console.error('')
  console.error('  أضِف أمرًا يُنسَخ ويُشغَّل كما هو (pnpm … · node scripts/….mjs · grep -n … )،')
  console.error('  أو أعلن غيابه صراحةً بالوسم: [بلا أمر: <السبب>].')
  console.error(`\n✗ ${failures.length} صفًّا بلا حالة إثباتية معلَنة.\n`)
  process.exit(1)
}

console.log('  ✓ كل صفّ خاضع يحمل أمرًا أو يُعلن غيابه\n')
