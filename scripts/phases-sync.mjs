#!/usr/bin/env node
/**
 * مزامنة خريطة المراحل — `Rasd_Plan.md §9` هو المصدر، واللوحة تتبع.
 *
 * **العلّة التي بُني لأجلها.** `Docs/Phases/Dashboard.html` كانت تُحدَّث يدويًّا
 * داخل طقس الإغلاق. فحين أُغلقت مرحلة بلا طقس كامل، انحرفت اللوحة عن الجدول
 * بلا أن يلاحظ أحد: بقيت تقول «١٦ مكتملة» و«17 التالية» بينما 17 منتهية
 * و14 جارية. والانحراف الصامت هو ما تحرسه هذه الأداة — نفس منطق
 * `tokens-sync.mjs --check` حرفيًّا: مصدرٌ واحد، وحارسٌ يكشف الانحراف عنه.
 *
 * **ما يُزامَن وما لا يُزامَن — والفرق مقصود.** الجدول في §9 يحمل ستّة حقول
 * لكل مرحلة (الرقم · العنوان · النموذج · الحالة · التاريخ · المعرض)، وهي
 * وحدها ما لهذه الأداة سلطان عليه. أمّا نثر اللوحة — `oneliner` و`units`
 * و`completion` و`hashNote` — فمكتوبٌ بيد ولا مصدر آليًّا له، فلا يُلمَس
 * إطلاقًا. أداةٌ تُولّد اللوحة كاملةً كانت ستمحو ذلك النثر أو تخترعه، وكلاهما
 * أسوأ من الانحراف الذي جاءت تمنعه.
 *
 *   node scripts/phases-sync.mjs           # يكتب
 *   node scripts/phases-sync.mjs --check   # يفشل عند الانحراف (البوّابة A)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PLAN = `${root}Rasd_Plan.md`
const DASH = `${root}Docs/Phases/Dashboard.html`

const check = process.argv.includes('--check')

/** يقرأ صفوف جدول §9 — المصدر الوحيد لحالة كل مرحلة. */
function readPlan() {
  const text = readFileSync(PLAN, 'utf8')
  const start = text.indexOf('## 9. سجلّ حالة المراحل')
  if (start < 0) throw new Error('تعذّر إيجاد «## 9. سجلّ حالة المراحل» في Rasd_Plan.md')
  const section = text.slice(start)

  const rows = new Map()
  // | 16 | العنوان | `Sonnet 5` | ✅ **مكتملة** — [`Phase_16.md`](…) | 2026-08-31 | [السادسة عشرة](url) |
  const re =
    /^\|\s*(\d+[أب]?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`[^|]*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm
  let m
  while ((m = re.exec(section))) {
    const [, num, title, model, statusCell, dateCell, artifactCell] = m
    const status = statusCell.includes('مكتملة')
      ? 'done'
      : statusCell.includes('التالية')
        ? 'next'
        : 'pending'
    const artifactMatch = /\((https:\/\/[^)]+)\)/.exec(artifactCell)
    rows.set(num, {
      n: num,
      title: title.trim(),
      model: model.replace(/\s*5$/, '').trim(),
      status,
      date: /^\d{4}-\d{2}-\d{2}$/.test(dateCell.trim()) ? dateCell.trim() : null,
      artifact: artifactMatch ? artifactMatch[1] : null,
    })
  }
  if (rows.size === 0) throw new Error('لم يُقرأ أي صفّ من جدول §9 — تغيّر شكل الجدول؟')
  return rows
}

/** يقرأ كتلة كل مرحلة في اللوحة، بحدودها السطرية، لتُرقَّع في موضعها. */
function readDashboard() {
  const lines = readFileSync(DASH, 'utf8').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)n:\s*(\d+[أب]?),\s*$/.exec(lines[i])
    if (!m) continue
    // نهاية الكتلة: أوّل سطر لاحق بنفس مسافة البادئة يبدأ كتلة جديدة أو يغلقها.
    let end = i
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\},?\s*$/.test(lines[j]) && lines[j].search(/\S/) < lines[i].search(/\S/)) {
        end = j
        break
      }
    }
    blocks.push({ n: m[2], start: i, end, indent: m[1] })
  }
  return { lines, blocks }
}

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** كتابة المعرض كما تكتبه اللوحة: `ART + '<uuid>'` لا الرابط كاملًا. */
const ART = 'https://claude.ai/code/artifact/'
const artifactExpr = (url) =>
  url.startsWith(ART) ? `ART + ${quote(url.slice(ART.length))}` : quote(url)

/**
 * يُرجع **قيمة** التعبير لا نصّه — فالحارس يحرس المعنى لا الأسلوب.
 *
 * `ART + 'x'` و`'https://…/x'` معرضٌ واحد؛ لو قارنّا النصّين لفشلت البوّابة على
 * فارقٍ لا أثر له في المتصفّح، وحارسٌ يصرخ بلا سبب يُدرَّب الناس على تجاهله.
 * (الكتابة تُوحّد الشكل مع ذلك، فيبقى الملفّ متّسقًا.)
 */
const exprValue = (expr) => {
  const concat = /^ART\s*\+\s*'(.*)'$/.exec(expr.trim())
  if (concat) return ART + concat[1]
  const literal = /^'(.*)'$/.exec(expr.trim())
  return literal ? literal[1] : expr.trim()
}

/**
 * يطوي المراحل المُقسَّمة في §9 (`20أ`/`20ب`) إلى الرقم الواحد الذي تعرضه اللوحة.
 *
 * **وما لا مصدر مفرد له لا يُفرَض.** العنوان مثلًا عنوانان لا عنوان، فيُترك
 * لليد التي كتبته — نفس مبدأ ترك `oneliner` و`units`. أمّا الحالة فلها اشتقاق
 * صادق: المرحلة مكتملة حين تكتمل أجزاؤها كلّها، لا حين يكتمل أحدها.
 */
function foldSplit(parts) {
  const status = parts.every((p) => p.status === 'done')
    ? 'done'
    : parts.some((p) => p.status === 'next')
      ? 'next'
      : 'pending'
  const agree = (key) => {
    const values = new Set(parts.map((p) => p[key]))
    return values.size === 1 ? parts[0][key] : null
  }
  return {
    n: parts[0].n.replace(/[أب]$/, ''),
    title: null,
    model: agree('model'),
    status,
    date: status === 'done' ? agree('date') : null,
    artifact: agree('artifact'),
  }
}

const plan = readPlan()

// اطوِ `20أ`/`20ب` → `20` قبل المقارنة، فاللوحة تعرض الرقم لا الجزء.
const split = new Map()
for (const [key, row] of plan) {
  const base = /^(\d+)[أب]$/.exec(key)
  if (!base) continue
  const list = split.get(base[1]) ?? []
  list.push(row)
  split.set(base[1], list)
}
for (const [base, parts] of split) plan.set(base, foldSplit(parts))
const { lines, blocks } = readDashboard()

const drift = []
let changed = 0

for (const block of blocks) {
  const want = plan.get(block.n)
  if (!want) {
    drift.push(`المرحلة ${block.n} في اللوحة بلا صفّ في §9`)
    continue
  }
  const fields = [
    ['title', want.title === null ? null : quote(want.title)],
    ['model', want.model === null ? null : quote(want.model)],
    ['status', quote(want.status)],
    ['date', want.date ? quote(want.date) : null],
    ['artifact', want.artifact ? artifactExpr(want.artifact) : null],
  ]

  for (const [key, value] of fields) {
    if (value === null) continue // لا تاريخ/معرض بعد — لا يُفرَض فراغ على اللوحة
    const re = new RegExp(`^(\\s*)${key}:\\s*(.+?),?\\s*$`)
    let found = false
    for (let i = block.start; i <= block.end; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      found = true
      const current = m[2].replace(/,$/, '')
      const same = key === 'artifact' ? exprValue(current) === exprValue(value) : current === value
      if (!same) {
        drift.push(`المرحلة ${block.n} · ${key}: اللوحة ${current} — §9 ${value}`)
      }
      if (!check && current !== value) {
        lines[i] = `${m[1]}${key}: ${value},`
        changed++
      }
      break
    }
    // الحقل الغائب انحرافٌ يُعلَن لا صمتٌ يُغتفَر — الصمت هو العلّة التي بُنيت
    // هذه الأداة أصلًا لتمنعها، فلا يجوز أن تسكت هي نفسها عند غياب هدفها.
    if (!found) drift.push(`المرحلة ${block.n} · ${key}: الحقل غائب من اللوحة (يُضاف يدويًّا)`)
  }
}

// العدّاد الثابت في HTML **احتياطيّ**: `renderProgress()` يستبدله وقت التشغيل بما
// يُشتقّ من `phases` نفسها. تُبقيه المزامنة صادقًا رغم ذلك، لأن قيمةً مكتوبةً
// كاذبةً في الملفّ تُقرأ على أنها حقيقة حين يفتحه إنسان لا متصفّح.
const doneCount = [...plan.entries()]
  .filter(([key]) => !/[أب]$/.test(key))
  .filter(([, p]) => p.status === 'done').length
const countRe = /(<b[^>]*id="doneCount"[^>]*>)(\d+)(<\/b>)/
let countSeen = false
for (let i = 0; i < lines.length; i++) {
  const m = countRe.exec(lines[i])
  if (!m) continue
  countSeen = true
  if (m[2] !== String(doneCount)) {
    drift.push(`عدّاد المكتملة: اللوحة ${m[2]} — §9 ${doneCount}`)
    if (!check) {
      lines[i] = lines[i].replace(countRe, `$1${doneCount}$3`)
      changed++
    }
  }
  break
}
if (!countSeen) drift.push('عدّاد المكتملة: `id="doneCount"` غير موجود في اللوحة — تغيّر الوسم؟')

console.log('\nمزامنة خريطة المراحل (§9 ← اللوحة):')
console.log(
  `  قُرئ من §9: ${[...plan.keys()].filter((k) => !/[أب]$/.test(k)).length} مرحلة · مكتملة: ${doneCount}`,
)
console.log(`  كتل اللوحة: ${blocks.length}`)

if (drift.length === 0 && (check || changed === 0)) {
  console.log('  ✓ اللوحة مطابقة للجدول — لا انحراف.\n')
  process.exit(0)
}

if (drift.length === 0) {
  // فارق أسلوبٍ لا معنًى: يُوحَّد بلا أن يُعَدّ انحرافًا.
  writeFileSync(DASH, lines.join('\n'))
  console.log(`  ✓ وُحِّد شكل ${changed} حقلًا (بلا انحراف في القيمة).\n`)
  process.exit(0)
}

if (check) {
  console.error(`\n✗ ${drift.length} انحرافًا عن §9:\n`)
  for (const d of drift) console.error(`  · ${d}`)
  console.error('\nشغّل `pnpm run phases:sync` لمزامنتها.\n')
  process.exit(1)
}

writeFileSync(DASH, lines.join('\n'))
console.log(`  ✓ صُحِّح ${changed} حقلًا في اللوحة.\n`)
