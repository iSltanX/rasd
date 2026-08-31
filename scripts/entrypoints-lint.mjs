#!/usr/bin/env node
/**
 * حارس جرد نقاط الدخول — **لا بند في قائمة مغلقة بلا صفّ في الجرد**.
 *
 * العلّة التي بُني لها: لا أحد عدّ «نقرة الأيقونة» مسارًا يُختبَر، فبقي
 * مسار التفعيل بلا تغطية عشر مراحل (الصفّ 77) — والإغفال لم يكن قرارًا
 * بل **غياب قائمة يُقارَن بها**. فما دام الكود يحمل قوائم مغلقة
 * (`RequestMap`، `COMMAND_TOOL`، `ITEMS`)، تصير المقارنة آلية ويصير
 * الإغفال مستحيلًا لا مُستبعَدًا.
 *
 * **حتمي بلا حكم لغوي** (شرط البوّابة A): لا يحكم على جودة صفّ الجرد ولا
 * على صحّة أمر تحقّقه — يفحص **الوجود** وحده: كل معرّف في القائمة المغلقة
 * مذكور نصًّا في `Docs/EntryPoints.md`. جودة الصفّ شأن البوّابة B.
 *
 * ولا يقرأ الأنواع بمترجم: يستخرج المعرّفات بمطابقة نصّية على الكتل
 * المسمّاة — أرخص، وكافٍ لأن القوائم الثلاث كلّها حرفية مسطّحة.
 *
 *   node scripts/entrypoints-lint.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(root, rel), 'utf8')

const INVENTORY = 'Docs/EntryPoints.md'
if (!existsSync(join(root, INVENTORY))) {
  console.error(`${INVENTORY} غير موجود — الجرد شرطٌ في الدستور (القسم 4).`)
  process.exit(1)
}
const inventory = read(INVENTORY)

/** يقتطع كتلة نصّية بين بداية مُعطاة وأوّل سطر إغلاق في عمود الصفر. */
function block(source, startPattern, endPattern) {
  const start = source.search(startPattern)
  if (start === -1) return null
  const rest = source.slice(start)
  const end = rest.search(endPattern)
  return end === -1 ? rest : rest.slice(0, end)
}

const sources = [
  {
    name: 'RequestMap (عقد الرسائل)',
    file: 'src/shared/messaging/contract.ts',
    extract: (s) => {
      const b = block(s, /export interface RequestMap/u, /\n\}/u)
      if (!b) return null
      return [...b.matchAll(/^\s{2}'([a-z][a-z/-]*)'\s*:/gmu)].map((m) => m[1])
    },
  },
  {
    name: 'COMMAND_TOOL (اختصارات chrome.commands)',
    file: 'src/background/commands.ts',
    extract: (s) => {
      const b = block(s, /export const COMMAND_TOOL/u, /\n\}/u)
      if (!b) return null
      return [...b.matchAll(/'([a-z-]+)'\s*:/gu)].map((m) => m[1])
    },
  },
  {
    name: 'ITEMS (بنود قائمة السياق)',
    file: 'src/background/context-menus.ts',
    extract: (s) => [...s.matchAll(/\{\s*id:\s*'([a-z-]+)'\s*,\s*title:/gu)].map((m) => m[1]),
  },
]

const lines = []
const failures = []

for (const source of sources) {
  const ids = source.extract(read(source.file))
  if (!ids || ids.length === 0) {
    failures.push(`تعذّر استخراج ${source.name} من ${source.file} — تغيّر شكل القائمة؟`)
    continue
  }
  const missing = ids.filter((id) => !inventory.includes(id))
  lines.push(`  ${missing.length === 0 ? '✓' : '✗'} ${source.name}: ${ids.length} بندًا`)
  if (missing.length > 0) {
    failures.push(`${source.name} — بنود بلا صفّ في الجرد: ${missing.join(' · ')}`)
  }
}

console.log('\nحارس جرد نقاط الدخول:')
for (const l of lines) console.log(l)

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error(`\n  أضِف صفًّا لكل بند في ${INVENTORY}: المسار الإنتاجي · الأثر · أمر التحقّق.`)
  console.error('  وإن كان البند لا يقابله أمر تحقّق، أعلن ذلك بحدّه الحقيقي لا أوسع.')
  console.error(`\n✗ ${failures.length} مشكلة.\n`)
  process.exit(1)
}

console.log('  ✓ كل بند في القوائم المغلقة مذكور في الجرد\n')
