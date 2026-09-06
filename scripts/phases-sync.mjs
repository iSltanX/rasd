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
 * **الحراسة في الاتجاهين.** كتلةٌ في اللوحة بلا صفّ في §9 انحراف، وصفٌّ في §9
 * بلا كتلة في اللوحة انحرافٌ مثله: الأوّل يعرض مرحلةً لا وجود لها في المصدر،
 * والثاني يُخفي مرحلةً موجودةً فيه. حارسٌ يمشي في اتجاه واحد يترك النصف الآخر
 * صامتًا — وهو عين ما بُني ليمنعه.
 *
 * **وما لا يُقرأ يُعلَن لا يُسقَط.** كل شكلٍ لا تعرفه الأداة — صفٌّ مشوَّه في
 * §9، سطر `n:` لا يطابق الشكل المتوقَّع، خانة حالة بصيغة غريبة — كان إسقاطه
 * صمتًا يُخرج مرحلةً كاملة من الحراسة بلا أثر. يُعلَن هنا برقم سطره ونصّه،
 * ويُفصَل تشخيصه عن تشخيص «كتلة بلا صفّ» كي لا يُتَّهم السليم بعيب المشوَّه.
 *
 * **ثلاثة سجلّات لا سجلّ واحد.** `auto` ما تُصلحه الكتابة (قيمة تخالف §9)،
 * و`manual` ما يحتاج يدًا (حقل غائب · كتلة ناقصة · صفّ مشوَّه)، و`notices` ما
 * **لا يُحرَس** أصلًا مع سببه (حقل مرحلةٍ مُقسَّمة اختلفت أجزاؤها فيه). الثالث
 * لا يُفشِل البوّابة لكنّه يُطبَع في كل تشغيلة: «غير محروس» خبرٌ للقارئ لا
 * سكوتٌ عنه.
 *
 *   node scripts/phases-sync.mjs           # يكتب، ويقول ماذا صحّح، ويفشل إن بقي ما لا يُصلَح آليًّا
 *   node scripts/phases-sync.mjs --check   # يفشل عند الانحراف (البوّابة A)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PLAN = `${root}Rasd_Plan.md`
const DASH = `${root}Docs/Phases/Dashboard.html`

const check = process.argv.includes('--check')

/** انحرافٌ تُصلحه الكتابة بنفسها. */
const auto = []
/** انحرافٌ لا تُصلحه الكتابة — يُقال صراحةً لا يُبتلَع في «تمّت المزامنة». */
const manual = []
/** ما لا مصدر مفرد له فلا يُحرَس — يُعلَن سببه ولا يُفشِل البوّابة. */
const notices = []

/** قيمة حقلٍ لا مصدر مفرد له في §9؛ تُميَّز عن `null` التي تعني «المصدر يقول: لا شيء». */
const UNGUARDED = Symbol('غير محروس')
/** الشرطة الطويلة في §9: خانة فارغة **صريحة**، لا خانة مفقودة. */
const EMPTY = '—'

const HEADING = '## 9. سجلّ حالة المراحل'

/** «20أ» → «20»: اللوحة تعرض الرقم المُعرِّف لا الجزء التنفيذي (§9، الحاشية الأخيرة). */
const fold = (n) => n.replace(/[أب]$/, '')
const show = (v) => (v === null ? EMPTY : String(v))

/**
 * الحالة تُقرأ بشكل الخانة لا باحتوائها.
 *
 * `includes('مكتملة')` تقرأ «غير مكتملة» مكتملةً — كذبةٌ تُغلق مرحلةً في اللوحة
 * بكلمةٍ زائدة في الجدول، وتزيد عدّاد المكتملة معها. فيُطابَق أوّل الخانة على
 * الأشكال الثلاثة التي يكتبها §9 وحدها، وما عداها صفٌّ مشوَّه يُعلَن.
 */
function readStatus(cell) {
  if (/^✅\s+\*\*مكتملة\*\*(?:\s|$)/.test(cell)) return 'done'
  if (/^\*\*التالية\*\*(?:\s|$)/.test(cell)) return 'next'
  if (/^لم تبدأ(?:\s|$)/.test(cell)) return 'pending'
  return null
}

const readModel = (cell) => {
  const m = /^`([^`]+)`/.exec(cell)
  return m ? { value: m[1].replace(/\s*5$/, '').trim() } : { bad: `خانة المودل «${cell}»` }
}

const readDate = (cell) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return { value: cell }
  if (cell === EMPTY) return { value: null }
  return { bad: `خانة التاريخ «${cell}»` }
}

const readArtifact = (cell) => {
  const link = /^\[[^\]]*\]\((https:\/\/[^)]+)\)$/.exec(cell)
  if (link) return { value: link[1] }
  // «⚠️ غير منشور» فجوةٌ معلَنة في حواشي §9 لا معرضٌ مجهول: مصدرٌ يقول «لا شيء».
  if (cell === EMPTY || /^⚠️\s*غير منشور$/.test(cell)) return { value: null }
  return { bad: `خانة المعرض «${cell}»` }
}

/**
 * يقرأ صفوف جدول §9 — المصدر الوحيد لحالة كل مرحلة.
 *
 * **القراءة محدودة بالقسم ثمّ بالجدول.** قراءةٌ تمتدّ إلى آخر الملفّ تلتقط أي
 * صفّ جدولٍ لاحقٍ يشبه الشكل، فيَجُبّ الصفَّ الحقيقي (المفتاح نفسه في `Map`)
 * ويُصدِّق لوحةً كاذبة بمصدرٍ كاذب. فيُقصّ القسم عند أوّل عنوان يليه، ثمّ يُقصّ
 * الجدول عند أوّل سطر لا يبدأ بـ`|`.
 */
function readPlan() {
  const text = readFileSync(PLAN, 'utf8')
  const start = text.indexOf(HEADING)
  if (start < 0) throw new Error(`تعذّر إيجاد «${HEADING}» في Rasd_Plan.md`)
  const after = text.slice(start + HEADING.length)
  const nextHeading = /\n#{1,6} /.exec(after)
  const section = after.slice(0, nextHeading ? nextHeading.index : after.length)
  const headingLine = text.slice(0, start).split('\n').length

  const lines = section.split('\n')
  const head = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l))
  if (head < 0) throw new Error('تعذّر إيجاد ترويسة جدول §9 — تغيّر شكل الجدول؟')
  let last = head + 1 // سطر الفواصل `| --- |`
  // (مسافة زائدة حول الصفّ لا تُنهي الجدول: فارقٌ لا أثر له في العرض، وصراخٌ
  // عليه يُدرَّب الناس على تجاهل الحارس — نفس مبدأ `exprValue` أدناه.)
  while (last + 1 < lines.length && lines[last + 1].trim().startsWith('|')) last++

  const rows = new Map()
  /** مراحلٌ صفُّها في §9 غير مقروء: عيبها في الجدول لا في اللوحة — والفرق تشخيصيّ. */
  const mangled = new Set()
  let unreadable = 0
  let gateAfter = null
  let gateSeen = false
  let previous = null

  for (let i = head + 2; i <= last; i++) {
    const line = lines[i].trim()
    const at = `Rasd_Plan.md:${headingLine + i}`
    const bad = (why) => {
      unreadable++
      manual.push(`صفّ §9 غير مقروء (${at}) — ${why}`)
    }
    if (!/^\|.*\|$/.test(line)) {
      bad(`لا يبدأ بـ«|» ولا ينتهي به: «${line}»`)
      continue
    }
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim())
    if (cells.length !== 6) {
      bad(`عدد الخانات ${cells.length} لا 6: «${line}»`)
      continue
    }
    const [num, title, modelCell, statusCell, dateCell, artifactCell] = cells

    if (num === EMPTY && /⟨\s*بوّابة MVP\s*⟩/.test(title)) {
      // صفّ البوّابة ليس مرحلة: موضعه هو الخبر — بعد أي مرحلة يقع (ADR 0013 §4).
      gateSeen = true
      gateAfter = previous
      continue
    }
    if (!/^\d+[أب]?$/.test(num)) {
      bad(`رقم مرحلة غير مقروء «${num}»`)
      continue
    }
    previous = fold(num)

    const model = readModel(modelCell)
    const date = readDate(dateCell)
    const artifact = readArtifact(artifactCell)
    const status = readStatus(statusCell)
    const faults = [
      title ? null : 'العنوان فارغ',
      model.bad,
      status ? null : `خانة الحالة «${statusCell}»`,
      date.bad,
      artifact.bad,
    ].filter(Boolean)
    if (faults.length > 0) {
      unreadable++
      mangled.add(fold(num))
      manual.push(
        `المرحلة ${num}: صفّها في §9 مشوَّه (${at}) — ${faults.join(' · ')} — فحقولها كلّها خارج الحراسة`,
      )
      continue
    }

    rows.set(num, {
      n: num,
      title,
      model: model.value,
      status,
      date: date.value,
      artifact: artifact.value,
      raw: { date: dateCell, artifact: artifactCell },
    })
  }

  if (rows.size === 0) throw new Error('لم يُقرأ أي صفّ من جدول §9 — تغيّر شكل الجدول؟')
  if (!gateSeen) manual.push('صفّ «⟨ بوّابة MVP ⟩» غير موجود في §9 — موضع البوّابة بلا مصدر')
  return { rows, mangled, unreadable, gateAfter }
}

/**
 * يقرأ كتلة كل مرحلة في اللوحة، بحدودها السطرية، لتُرقَّع في موضعها.
 *
 * وسطرُ `n:` الذي لا يطابق الشكل ليس سطرًا غريبًا يُتخطّى: هو رأس كتلةٍ كاملة،
 * وتخطّيه يُخرج مرحلةً من الحراسة في الاتجاهين معًا بلا أن يظهر ذلك في العدّ.
 */
function readDashboard() {
  const lines = readFileSync(DASH, 'utf8').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*n:/.test(lines[i])) continue
    const m = /^(\s*)n:\s*(\d+[أب]?),\s*$/.exec(lines[i])
    if (!m) {
      manual.push(
        `سطر \`n:\` غير مقروء في اللوحة (Dashboard.html:${i + 1}) — «${lines[i].trim()}» فكتلته كلّها خارج الحراسة`,
      )
      continue
    }
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

/** ما تكتبه اللوحة حين لا قيمة: `null` هي العُرف فيها، ويُقبل ما يعادلها. */
const EMPTY_EXPR = /^(?:null|undefined|'')$/

/**
 * يطوي المراحل المُقسَّمة في §9 (`20أ`/`20ب`) إلى الرقم الواحد الذي تعرضه اللوحة.
 *
 * **وما لا مصدر مفرد له لا يُفرَض — لكنّه يُعلَن.** العنوان مثلًا عنوانان لا
 * عنوان، فيُترك لليد التي كتبته (نفس مبدأ ترك `oneliner` و`units`). وكذلك أي
 * حقلٍ اختلفت فيه الأجزاء: المرحلة 26 اليوم `Opus 5` في 26أ و`Sonnet 5` في 26ب،
 * فمودلها بلا مصدر مفرد. وسكوتُ الأداة عن ذلك هو العلّة نفسها التي بُنيت
 * لمنعها — فيُقال «غير محروس ولماذا» في كل تشغيلة، ولا يُفشِل البوّابة لأنه
 * وصفٌ صادق للمصدر لا انحرافٌ عنه. أمّا الحالة فلها اشتقاق صادق: المرحلة
 * مكتملة حين تكتمل أجزاؤها كلّها، لا حين يكتمل أحدها.
 */
function foldSplit(base, parts) {
  const status = parts.every((p) => p.status === 'done')
    ? 'done'
    : parts.some((p) => p.status === 'next')
      ? 'next'
      : 'pending'
  const unguarded = ['title (عنوانان لا عنوان)']
  const agree = (key) => {
    const values = new Set(parts.map((p) => p[key]))
    if (values.size === 1) return parts[0][key]
    unguarded.push(`${key} (${parts.map((p) => `${p.n}: ${show(p[key])}`).join(' · ')})`)
    return UNGUARDED
  }
  const uniq = (key) => [...new Set(parts.map((p) => p.raw[key]))].join(' · ')
  const folded = {
    n: base,
    title: UNGUARDED,
    model: agree('model'),
    status,
    date: status === 'done' ? agree('date') : null,
    artifact: agree('artifact'),
    raw: { date: uniq('date'), artifact: uniq('artifact') },
  }
  notices.push(
    `المرحلة ${base} مُقسَّمة (${parts.map((p) => p.n).join(' · ')}) — غير محروس: ${unguarded.join(' · ')}`,
  )
  return folded
}

const { rows: plan, mangled, unreadable, gateAfter } = readPlan()

// اطوِ `20أ`/`20ب` → `20` قبل المقارنة، فاللوحة تعرض الرقم لا الجزء.
const split = new Map()
for (const [key, row] of plan) {
  const base = /^(\d+)[أب]$/.exec(key)
  if (!base) continue
  const list = split.get(base[1]) ?? []
  list.push(row)
  split.set(base[1], list)
}
for (const [base, parts] of split) {
  // جزءٌ مشوَّه يعني أن ما نجا نصفُ مصدرٍ لا مصدر — والطيّ فوقه يحرس بنصف حقيقة.
  if (mangled.has(base)) continue
  plan.set(base, foldSplit(base, parts))
}

const { lines, blocks } = readDashboard()

let styleOnly = 0
let writes = 0

for (const block of blocks) {
  const want = plan.get(block.n)
  if (!want) {
    // فرّق بين عيب اللوحة وعيب الجدول: مرحلةٌ صفُّها مشوَّه أُعلن عيبها هناك،
    // واتّهام اللوحة بها يُرسل القارئ يصلح السليم ويترك المعطوب.
    if (!mangled.has(block.n)) manual.push(`المرحلة ${block.n} في اللوحة بلا صفّ في §9`)
    continue
  }
  const fields = [
    ['title', want.title],
    ['model', want.model],
    ['status', want.status],
    ['date', want.date],
    ['artifact', want.artifact],
  ]

  for (const [key, source] of fields) {
    if (source === UNGUARDED) continue // أُعلن سببه في «غير محروس» أعلاه
    const value =
      source === null ? 'null' : key === 'artifact' ? artifactExpr(source) : quote(source)
    const re = new RegExp(`^(\\s*)${key}:\\s*(.+?),?\\s*$`)
    let found = false
    for (let i = block.start; i <= block.end; i++) {
      const m = re.exec(lines[i])
      if (!m) continue
      found = true
      const current = m[2].replace(/,$/, '')
      const same =
        source === null
          ? EMPTY_EXPR.test(current)
          : key === 'artifact'
            ? exprValue(current) === exprValue(value)
            : current === value
      if (!same) {
        // خانة §9 الفارغة ليست «بلا مصدر»: هي مصدرٌ يقول «لا شيء». وتخطّيها كان
        // يترك اللوحة تُثبت تاريخًا ومعرضًا لمرحلة لم تبدأ — كذبةٌ صامتة.
        auto.push(
          source === null
            ? `المرحلة ${block.n} · ${key}: اللوحة ${current} — §9 لا تُثبت قيمة (الخانة «${want.raw[key]}»)`
            : `المرحلة ${block.n} · ${key}: اللوحة ${current} — §9 ${value}`,
        )
      }
      if (!check && current !== value) {
        lines[i] = `${m[1]}${key}: ${value},`
        writes++
        if (same) styleOnly++
      }
      break
    }
    // الحقل الغائب انحرافٌ يُعلَن لا صمتٌ يُغتفَر — الصمت هو العلّة التي بُنيت
    // هذه الأداة أصلًا لتمنعها، فلا يجوز أن تسكت هي نفسها عند غياب هدفها.
    // (وغيابُ حقلٍ لا قيمة له في §9 ليس انحرافًا: اللوحة لا تدّعي شيئًا.)
    if (!found && source !== null) {
      manual.push(`المرحلة ${block.n} · ${key}: الحقل غائب من اللوحة (يُضاف يدويًّا)`)
    }
  }
}

// الاتجاه المعاكس: صفٌّ في §9 بلا كتلة في اللوحة. لا تُولَّد الكتلة آليًّا لأن
// نثرها (`oneliner` · `units` · `completion`) لا مصدر له — لكنّ غيابها يُقال.
const onBoard = new Set(blocks.map((b) => b.n))
for (const key of plan.keys()) {
  if (/[أب]$/.test(key)) continue // جزء لا مرحلة: اللوحة تعرض الرقم المطوي
  if (!onBoard.has(key)) manual.push(`المرحلة ${key} في §9 بلا كتلة في اللوحة (تُكتب يدويًّا)`)
}

const phases = [...plan.entries()].filter(([key]) => !/[أب]$/.test(key))
const total = phases.length
const doneCount = phases.filter(([, p]) => p.status === 'done').length

let text = lines.join('\n')

/**
 * الأعداد الثابتة في اللوحة: عدّاد المكتملة، والإجمالي، وموضع بوّابة MVP.
 *
 * ثلاثتها مشتقّةٌ من §9 وقت القراءة — الإجمالي عدد المراحل المطويّة في الجدول،
 * والبوّابة تقع بعد آخر مرحلة سبقت صفَّ «⟨ بوّابة MVP ⟩» فيه (ADR 0013 §4). وما
 * دام العدد معلومًا للأداة فسكوتها عنه سكوتٌ عن انحراف: العدد المكتوب بيدٍ
 * ينجرف كما انجرف عدّاد المكتملة نفسه (التعليق داخل `renderProgress()` في
 * اللوحة يروي ذلك).
 *
 * **ولماذا يبقى العدّاد بأرقام غربية في الوسم.** لأن اللوحة نفسها تكتبه غربيًّا
 * وقت التشغيل: `document.getElementById('doneCount').textContent = done` بلا
 * `toIndic` — بخلاف `progressPct` وبطاقة «مكتملة» المجاورتين اللتين تُهنِّدان.
 * فلو كتب الحارس «١٦» لأثبت في الملفّ شكلًا لا يظهر في المتصفّح لحظةً واحدة،
 * ثمّ خالف جارَه `<b class="num">28</b>` الغربيَّ في السطر نفسه. وسياسة الأرقام
 * الهندية للعدّ البشري في §3.5 معيارُ قبولٍ **لواجهة المنتج (12–19)** عبر
 * `src/shared/bidi/` لا لهذه اللوحة الوثائقية. فالتناقض داخل اللوحة مذكورٌ هنا
 * لا مسكوتٌ عنه، وإصلاحه — إن أُريد — تغييرٌ في `renderProgress()` لا في
 * المزامنة: هذه تحرس القيمة، وشكلُ رقمها قرار اللوحة.
 */
const anchors = [
  { label: 'عدّاد المكتملة', want: doneCount, re: /(<b[^>]*id="doneCount"[^>]*>)(\d+)(<\/b>)/ },
  {
    label: 'إجمالي المراحل · ترويسة التقدّم',
    want: total,
    re: /(من <b class="num">)(\d+)(<\/b> مرحلة مغلقة)/,
  },
  {
    label: 'إجمالي المراحل · نسبة التقدّم',
    want: total,
    re: /(Math\.round\(\(done \/ )(\d+)(\) \* 100\))/,
  },
  {
    label: 'إجمالي المراحل · بطاقة «مكتملة»',
    want: total,
    re: /(toIndic\(done\) \+ ' \/ ' \+ toIndic\()(\d+)(\))/,
  },
  {
    label: 'إجمالي المراحل · علامة البوّابة',
    want: total,
    re: /(var gatePos = \(\d+ \/ )(\d+)(\) \* 100)/,
  },
  {
    label: 'موضع بوّابة MVP · علامة الشريط',
    want: gateAfter,
    re: /(var gatePos = \()(\d+)( \/ \d+\) \* 100)/,
  },
  {
    label: 'موضع بوّابة MVP · بطاقة الإحصاء',
    want: gateAfter,
    re: /(\['بوّابة MVP', 'بعد )(\d+)(')/,
  },
  {
    label: 'موضع بوّابة MVP · شريط الترتيب',
    want: gateAfter,
    re: /(\n\s+)(\d+)(,\n\s+'GATE',)/,
  },
]

// عددٌ مشتقٌّ من جدولٍ فيه صفٌّ لم يُقرأ عددٌ كاذب: لا يُقارَن به شيء، ويُقال لماذا.
if (unreadable > 0) {
  notices.push(
    `الإجمالي وعدّاد المكتملة وموضع البوّابة غير محروسة: ${unreadable} صفًّا في §9 لم يُقرأ`,
  )
}
for (const anchor of anchors) {
  if (unreadable > 0) break
  if (anchor.want === null) continue // موضع البوّابة بلا مصدر — أُعلن أعلاه
  const m = anchor.re.exec(text)
  if (!m) {
    manual.push(`${anchor.label}: الوسم غير موجود في اللوحة — تغيّر شكلها؟`)
    continue
  }
  if (m[2] === String(anchor.want)) continue
  auto.push(`${anchor.label}: اللوحة ${m[2]} — §9 ${anchor.want}`)
  if (!check) {
    text = text.replace(anchor.re, (_, before, __, tail) => `${before}${anchor.want}${tail}`)
    writes++
  }
}

console.log('\nمزامنة خريطة المراحل (§9 ← اللوحة):')
console.log(
  `  قُرئ من §9: ${total} مرحلة · مكتملة: ${doneCount} · بوّابة MVP بعد ${show(gateAfter)}`,
)
console.log(`  كتل اللوحة: ${blocks.length}`)
for (const note of notices) console.log(`  ⓘ ${note}`)

if (check) {
  if (auto.length + manual.length === 0) {
    console.log('  ✓ اللوحة مطابقة للجدول — لا انحراف.\n')
    process.exit(0)
  }
  console.error(`\n✗ ${auto.length + manual.length} انحرافًا عن §9:\n`)
  for (const d of auto) console.error(`  · ${d}`)
  for (const d of manual) console.error(`  ✋ ${d}`)
  // لا تَعِد بما لا تفعله الكتابة: توجيهٌ إلى `phases:sync` لانحرافٍ لا يُصلَح
  // آليًّا يُبلّغ نجاحًا كاذبًا — وهو الصمت نفسه في ثوب رسالة.
  if (auto.length > 0) console.error(`\nشغّل \`pnpm run phases:sync\` — يُصلح ${auto.length} منها.`)
  if (manual.length > 0) {
    console.error(
      `${auto.length > 0 ? 'و' : '\n'}${manual.length} منها لا تُصلَح آليًّا (✋): تُعالَج باليد في اللوحة أو في §9.`,
    )
  }
  console.error('')
  process.exit(1)
}

if (writes > 0) writeFileSync(DASH, text)

if (auto.length > 0) {
  console.log(`\n  ✓ صُحِّح ${auto.length} حقلًا (ما كان ← ما في §9):`)
  for (const d of auto) console.log(`    − ${d}`)
} else {
  console.log('  ✓ لا انحراف في القيم.')
}
if (styleOnly > 0) console.log(`  ✓ وُحِّد شكل ${styleOnly} حقلًا (بلا انحراف في القيمة).`)

// الكتابة لا تُغلق ما لا تفتحه: ما بقي يُقال، ويخرج بغير صفر كي لا تُقرأ
// التشغيلة نجاحًا وهي نصف نجاح.
if (manual.length > 0) {
  console.error(`\n✗ بقي ${manual.length} انحرافًا لا تُصلحه المزامنة:\n`)
  for (const d of manual) console.error(`  ✋ ${d}`)
  console.error('')
  process.exit(1)
}
console.log('')
