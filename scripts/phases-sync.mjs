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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PLAN = `${root}Rasd_Plan.md`
const DASH = `${root}Docs/Phases/Dashboard.html`

/**
 * مخرَجان مشتقّان ثانيان — علّتهما كلفة القراءة لا نقص المعلومة.
 *
 * `Rasd_Plan.md` بلغ 243,300 حرفًا في 2,647 سطرًا، وجدول §9 وحده 45,949 حرفًا.
 * فجلسةٌ تفتح الملفّ لتعرف «أين وصلنا» تدفع الكلفة كاملةً قبل أن تكتب سطرًا،
 * وحاجتها الفعلية سطران: ما المرحلة التالية، وما حالة السابقة.
 *
 * فلا مصدر ثانٍ يُنشأ: §9 يبقى المصدر الوحيد، وهذان مشتقّان منه كما اللوحة —
 * `STATUS.md` يجيب السطرين، و`INDEX.md` يعطي نطاق أسطر كل مرحلة كي تُقرأ
 * بـ`sed -n 'من,إلىp'` بدل فتح الملفّ كلّه.
 *
 * **ولماذا `INDEX.md` ملفٌّ مستقلّ لا قسمٌ في `Rasd_Plan.md`:** الفهرس يسجّل
 * أرقام أسطرٍ في الملفّ نفسه، فوضعُه داخله يزيح ما يسجّله — كل توليدٍ يغيّر
 * الأرقام التي وُلِّد ليثبّتها، فلا يستقرّ على نقطة ثابتة. وملفٌّ خارجه يسلم
 * من ذلك بالبناء. والمكسب الثاني أن `docs-lint` يمسح `Rasd_Plan.md` كلّه بحثًا
 * عن صفوف `| <رقم> |`، فجدولٌ جديد داخله سطحُ تصادمٍ بلا مقابل.
 */
const STATUS_MD = `${root}STATUS.md`
const INDEX_MD = `${root}Docs/Phases/INDEX.md`

/**
 * سقفٌ صلب على `STATUS.md` — الغاية كلّها أن يُقرأ رخيصًا.
 *
 * ملفٌّ يتضخّم يصير `Rasd_Plan.md` ثانيًا فينقض سبب وجوده، والتضخّم يقع صامتًا
 * (مرحلةٌ تُضاف، عنوانٌ يطول). فيُفشَل التوليد صراحةً بدل الكتابة — والفشل هنا
 * خبرٌ صحيح: «المخرَج تجاوز غايته» لا «العملية تعطّلت».
 */
const STATUS_MAX_LINES = 48
const STATUS_MAX_CHARS = 4000

/** عنوان §10.1 — مصدر حالة الوحدات وترتيب تنفيذها (ADR 0018). */
const UNITS_HEADING = '### 10.1 ترتيب التنفيذ المعتمد'

const check = process.argv.includes('--check')

/** انحرافٌ تُصلحه الكتابة بنفسها. */
const auto = []
/** انحرافٌ لا تُصلحه الكتابة — يُقال صراحةً لا يُبتلَع في «تمّت المزامنة». */
const manual = []
/** ما لا مصدر مفرد له فلا يُحرَس — يُعلَن سببه ولا يُفشِل البوّابة. */
const notices = []
/** مخرَجٌ مشتقٌّ انحرف عن §9 — تُصلحه الكتابة بإعادة توليده كاملًا. */
const derived = []

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

/**
 * يقرأ نطاق أسطر كل مرحلة في `Rasd_Plan.md` — من عنوانها إلى ما قبل ما يليها.
 *
 * **والعنوانان الفرعيّان جزءٌ من المرحلة لا فاصلٌ بينها وبين ما بعدها.** المرحلة
 * 26 تحمل `### 26أ —` و`### 26ب —` داخل جسمها؛ فلو أنهى الفهرسُ المرحلةَ عند
 * أوّل `###` يليها لأعطى نطاقًا يقطعها في منتصفها، وهو أسوأ من لا فهرس: يقرأ
 * القارئ نصف مرحلة وهو يظنّه كلّها. فالنهاية أوّل عنوانٍ **يبدأ شيئًا آخر**:
 * مرحلةً تالية، أو قسمًا (`##`)، أو عنوانًا أعلى.
 *
 * ويُقلَّم الذيل من الأسطر الفارغة وفاصل `---`: لا معلومة فيهما، ووجودهما يجعل
 * كل `sed` ينتهي بسطرين لا يقرأهما أحد.
 */
function readPhaseSpans() {
  const lines = readFileSync(PLAN, 'utf8').split('\n')
  const PHASE = /^### المرحلة (\d+) — (.+)$/
  const heads = []
  for (let i = 0; i < lines.length; i++) {
    const m = PHASE.exec(lines[i])
    if (m) heads.push({ n: m[1], title: m[2].trim(), start: i })
  }
  if (heads.length === 0) throw new Error('لم يُعثر على عنوان مرحلة واحد في Rasd_Plan.md')

  // حدٌّ يُنهي مرحلة: مرحلةٌ تالية أو قسمٌ أو عنوانٌ أعلى — لا عنوان فرعي داخلها.
  const ends = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (PHASE.test(lines[i]) || /^#{1,2} /.test(lines[i])) ends.add(i)
  }

  return heads.map((h) => {
    let end = lines.length - 1
    for (let j = h.start + 1; j < lines.length; j++) {
      if (ends.has(j)) {
        end = j - 1
        break
      }
    }
    while (end > h.start && (lines[end].trim() === '' || lines[end].trim() === '---')) end--
    return { n: h.n, title: h.title, from: h.start + 1, to: end + 1 }
  })
}

/**
 * رابط اللوحة المنشورة كما هو في §9 — لا يُكتب بيد في مخرَجٍ مشتقّ.
 *
 * والبحث يبدأ من عنوان §9 لا من أوّل الملفّ: روابط المعارض في خانات الجدول
 * وفي §10 تطابق الشكل نفسه، وأوّل إصابةٍ قبل القسم تعطي رابط مرحلةٍ مكان
 * رابط اللوحة — كذبةٌ صامتة في ملفٍّ غايته أن يُقرأ وحده.
 */
function readBoardUrl() {
  const text = readFileSync(PLAN, 'utf8')
  const at = text.indexOf(HEADING)
  if (at < 0) return null
  const m = /<(https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]+)>/.exec(text.slice(at))
  return m ? m[1] : null
}

/**
 * حالة الوحدة في §10.1 — تُقرأ بشكل الخانة لا باحتوائها، كحالة المرحلة في §9.
 *
 * و«وسم إصداري لا محطة توقّف» في صفّ البوّابة ليس حالةً: الصفّ يُلتقَط بعنوانه
 * قبل أن يصل إلى هنا، ووصولُه إليه يعني أن شكل الجدول تغيّر فيُعلَن.
 */
function readUnitStatus(cell) {
  if (/^✅\s*(?:\*\*)?مكتملة(?:\*\*)?(?:\s|$)/.test(cell)) return 'done'
  if (/^(?:\*\*)?قيد التنفيذ(?:\*\*)?(?:\s|$)/.test(cell)) return 'next'
  if (/^لم تبدأ(?:\s|$)/.test(cell)) return 'pending'
  return null
}

/**
 * يقرأ جدول §10.1 — مصدر **حالة الوحدات وترتيب تنفيذها** بعد ADR 0018.
 *
 * **ولماذا مصدرٌ ثانٍ ليس مصدرًا موازيًا.** بعد ADR 0018 صار السؤالان اثنين لا
 * واحدًا: «ما حالة المرحلة رقم س؟» جوابه §9 وحده، و«ما الوحدة التالية؟» جوابه
 * §10.1 وحده — لأن وحدات ثلاث مراحل **متداخلة** في الترتيب لا متجاورة (المرحلة
 * 19 في المواضع 4 · 5 · 9 · 10، والمرحلة 20 في سبعة مواضع)، فلا موضع واحد في
 * ترتيب التنفيذ يمثّل مرحلةً كاملة. ولا ثالث بينهما: الحارس المتقاطع أدناه
 * يمنع افتراقهما.
 *
 * والقراءة محدودة بالقسم ثمّ بالجدول، كقراءة §9 حرفيًّا وللعلّة نفسها.
 */
function readUnits() {
  const text = readFileSync(PLAN, 'utf8')
  const start = text.indexOf(UNITS_HEADING)
  if (start < 0) {
    manual.push(`تعذّر إيجاد «${UNITS_HEADING}» في Rasd_Plan.md — حالة الوحدات بلا مصدر`)
    return { units: [], unreadable: 1 }
  }
  const after = text.slice(start + UNITS_HEADING.length)
  const nextHeading = /\n#{1,6} /.exec(after)
  const section = after.slice(0, nextHeading ? nextHeading.index : after.length)
  const headingLine = text.slice(0, start).split('\n').length

  const lines = section.split('\n')
  const head = lines.findIndex((l) => /^\|\s*#\s*\|\s*الوحدة\s*\|/.test(l))
  if (head < 0) {
    manual.push('تعذّر إيجاد ترويسة جدول §10.1 — تغيّر شكل الجدول؟')
    return { units: [], unreadable: 1 }
  }
  let last = head + 1
  while (last + 1 < lines.length && lines[last + 1].trim().startsWith('|')) last++

  const units = []
  let unreadable = 0
  for (let i = head + 2; i <= last; i++) {
    const line = lines[i].trim()
    const at = `Rasd_Plan.md:${headingLine + i}`
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim())
    if (!/^\|.*\|$/.test(line) || cells.length !== 5) {
      unreadable++
      manual.push(`صفّ §10.1 غير مقروء (${at}) — عدد الخانات ${cells.length} لا 5: «${line}»`)
      continue
    }
    const [pos, unitCell, phaseCell, modelCell, statusCell] = cells
    // صفّ البوّابة ليس وحدة: موضعه هو الخبر، لا حالته (ADR 0013 §4).
    if (pos === EMPTY && /⟨\s*بوّابة MVP\s*⟩/.test(unitCell)) continue

    const id = /^\*\*([\d.]+|ذ\d+)\*\*\s*(.+)$/.exec(unitCell)
    const model = readModel(modelCell)
    const status = readUnitStatus(statusCell)
    const faults = [
      /^\d+$/.test(pos) ? null : `خانة الموضع «${pos}»`,
      id ? null : `خانة الوحدة «${unitCell}»`,
      model.bad,
      status ? null : `خانة الحالة «${statusCell}»`,
      /^(\d+|—)$/.test(phaseCell) ? null : `خانة المرحلة «${phaseCell}»`,
    ].filter(Boolean)
    if (faults.length > 0) {
      unreadable++
      manual.push(`صفّ §10.1 مشوَّه (${at}) — ${faults.join(' · ')} — فالوحدة خارج الحراسة`)
      continue
    }
    units.push({
      pos: Number(pos),
      id: id[1],
      title: id[2].trim(),
      phase: phaseCell === EMPTY ? null : phaseCell,
      model: model.value,
      status,
    })
  }
  if (units.length === 0 && unreadable === 0) {
    manual.push('جدول §10.1 بلا وحدة واحدة مقروءة — تغيّر شكله؟')
  }
  return { units, unreadable }
}

/**
 * الحارس المتقاطع: §9 و§10.1 يصفان الشيء نفسه من زاويتين، فافتراقهما عطل.
 *
 * **والعلّة التي بُني لأجلها وقعت فعلًا**: ADR 0018 نقل ترتيب التنفيذ إلى §10.1
 * وترك رأس §9 يدّعي أنه يحمله، فقال المشتقّ «التالية: المرحلة 19» بينما الوحدة
 * التالية `23.1`. لا سكربت كان يرى التعارض لأن أحدًا لم يكن يقارن المصدرين.
 *
 * والقاعدة في الاتجاهين: مرحلةٌ مكتملة في §9 كل وحداتها مكتملة في §10.1، ومرحلةٌ
 * كل وحداتها مكتملة هي مكتملة في §9. ومرحلةٌ بلا وحدات (1–18) خارج الحراسة لا
 * مخالِفة لها: أُغلقت قبل إعادة الهيكلة فلا تدّعي §10.1 عنها شيئًا.
 */
function crossCheck(plan, units) {
  const byPhase = new Map()
  for (const u of units) {
    if (u.phase === null) continue // `ذ1` لا مرحلة لها — وحدة خارج الترقيم
    const list = byPhase.get(u.phase) ?? []
    list.push(u)
    byPhase.set(u.phase, list)
  }
  for (const [phase, list] of byPhase) {
    const row = plan.get(phase)
    if (!row) {
      manual.push(`المرحلة ${phase}: لها وحدات في §10.1 ولا صفّ لها في §9`)
      continue
    }
    const allDone = list.every((u) => u.status === 'done')
    if (row.status === 'done' && !allDone) {
      const open = list.filter((u) => u.status !== 'done').map((u) => u.id)
      manual.push(
        `تعارض §9 ↔ §10.1 — المرحلة ${phase} مكتملة في §9 ووحداتها لم تكتمل: ${open.join(' · ')}`,
      )
    }
    if (row.status !== 'done' && allDone) {
      manual.push(
        `تعارض §9 ↔ §10.1 — وحدات المرحلة ${phase} كلّها مكتملة (${list.map((u) => u.id).join(' · ')}) وصفّها في §9 ليس مكتملًا`,
      )
    }
  }
}

const STATUS_MARK = { done: '✅', next: '▶', pending: '—' }
const STATUS_WORD = { done: 'مكتملة', next: 'قيد التنفيذ', pending: 'لم تبدأ' }

/**
 * يبني `STATUS.md` — السطران اللذان تحتاجهما الجلسة في مستهلّها.
 *
 * **والتالية تُشتقّ ولا تُكتب:** إن حمل صفٌّ حالة «التالية» صراحةً فهو المقصود،
 * وإلّا فأوّل صفٍّ غير مكتمل في ترتيب الجدول — و§9 مرتَّب بترتيب التنفيذ
 * المعتمد (ADR 0013) لا بالترتيب الرقمي، فالأوّل غير المكتمل هو التالي بالتعريف.
 *
 * والعدّاد على المراحل المطويّة (28) لا على الصفوف (30) كي لا يُخترَع عددٌ ثالث
 * يخالف اللوحة و§9 معًا؛ والجدول يعرض الصفوف كما تُكتب. والأرقام غربية كما في
 * اللوحة: §3.5 معيار قبولٍ لواجهة المنتج (12–19) عبر `src/shared/bidi/`، لا
 * لوثيقةٍ مولَّدة.
 */
function renderStatus({ rows, units, total, doneCount, boardUrl }) {
  // **التالية تُشتقّ من §10.1 لا من §9** — وهذا هو الفرق كلّه. ترتيب التنفيذ
  // بعد ADR 0018 بحبيبة الوحدة لا المرحلة، ووحدات المرحلة الواحدة **متداخلة**
  // مع غيرها: 19 في المواضع 4 · 5 · 9 · 10، و20 في سبعة. فقراءة «التالية» من
  // ترتيب §9 تعطي مرحلةً لا وحدة، وتقول «19» حيث الصواب `23.1` — وهو ما وقع
  // فعلًا حتى بُني الحارس المتقاطع.
  const next = units.find((u) => u.status === 'next') ?? units.find((u) => u.status !== 'done')
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const nextText = next
    ? `**${next.id}** ${next.title} · \`${next.model} 5\``
    : 'لا شيء — كل الوحدات مكتملة'
  const posText = next
    ? `الوحدة ${next.pos} من ${units.length} في §10.1`
    : `${units.length} وحدة، كلّها مكتملة`

  // كل سطرٍ هنا محسوبٌ في السقف، فالترويسة أربعة أسطر لا تسعة: الغاية أن تُقرأ
  // الحالة في نظرة، والنثر الزائد يزاحم الجدول الذي جاء القارئ لأجله.
  const board = boardUrl ? `<${boardUrl}>` : '— (لا رابط في §9)'
  const out = [
    '# حالة رصد',
    '',
    '> **مشتقٌّ آليًّا — لا يُحرَّر بيد.** يكتبه `pnpm phases:sync` ويحرسه `--check` في بوّابة A.',
    '> مصدره مصدران بحسب السؤال: **حالة المرحلة** من `Rasd_Plan.md §9`، و**الوحدة التالية**',
    '> من `§10.1`؛ وحارسٌ متقاطع يمنع افتراقهما. وعند أي تعارض **المصدر هو الصحيح لا هذا الملفّ**.',
    '',
    `**التالية:** ${nextText}`,
    `**موضعها:** ${posText}`,
    `**المكتمل:** ${doneCount} من ${total} مرحلة (${pct}%) · ${rows.length} صفًّا — 20 و26 مُقسَّمتان`,
    `**اللوحة:** ${board}`,
    '',
    '| # | المرحلة | المودل | الحالة |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.n} | ${r.title} | \`${r.model} 5\` | ${STATUS_MARK[r.status]} ${STATUS_WORD[r.status]} |`,
    ),
    '',
  ]
  return out.join('\n')
}

/** يبني `Docs/Phases/INDEX.md` — نطاق أسطر كل مرحلة في `Rasd_Plan.md`. */
function renderIndex(spans) {
  return [
    '# فهرس أسطر المراحل',
    '',
    '> **مشتقٌّ آليًّا من `Rasd_Plan.md` — لا يُحرَّر بيد.** يكتبه `pnpm phases:sync`،',
    '> ويحرسه `--check` في بوّابة A. وهو يتقادم مع أي تحرير في الخطّة، فالحارس',
    '> هو ما يمنع قراءة نطاقٍ صار يشير إلى غير مرحلته.',
    '',
    "**الاستعمال:** `sed -n '<من>,<إلى>p' Rasd_Plan.md` — تُقرأ المرحلة وحدها بدل",
    'فتح الملفّ كلّه. والنطاق يشمل الأجزاء الفرعية داخل المرحلة (26أ · 26ب).',
    '',
    '| # | المرحلة | من | إلى |',
    '| --- | --- | --- | --- |',
    ...spans.map((p) => `| ${p.n} | ${p.title} | ${p.from} | ${p.to} |`),
    '',
  ].join('\n')
}

/**
 * يقارن مخرَجًا مشتقًّا بما على القرص، ويكتبه عند الانحراف.
 *
 * الغياب انحرافٌ كالاختلاف: ملفٌّ لم يُولَّد بعدُ ليس حالةً خاصّة تُغتفَر، بل
 * أشدّ صور الانحراف — قارئٌ يبحث عنه فلا يجده يعود إلى الملفّ الكبير.
 */
function syncDerived(path, label, want) {
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (have === want) return
  derived.push(
    have === null ? `${label}: غير موجود — يُولَّد` : `${label}: انحرف عن مصدره — يُعاد توليده`,
  )
  if (!check) writeFileSync(path, want)
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

// صفوف §9 بترتيبها الخام — تُلتقط **قبل** الطيّ لأن `foldSplit` يُلحق `20` و`26`
// بذيل الـ`Map`، فقراءتها بعده تعطي ترتيبًا ليس ترتيب الجدول. و`STATUS.md` يعرض
// الصفوف كما تُكتب في §9 لا مطويّةً: الطيّ يُسقط عنوان المرحلة المُقسَّمة
// (`title` بلا مصدر مفرد)، وجدولٌ بخانة عنوانٍ فارغة أسوأ من صفّين.
const ordered = [...plan.values()]

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

// ── المخرَجان المشتقّان الثانيان ────────────────────────────────
//
// موضعهما هنا لا أعلى: `total` و`doneCount` و«التالية» تُشتقّ من الجدول
// المقروء، ومراسي اللوحة تُصحَّح قبلهما فتبقى المخرجات الثلاثة عن حالةٍ واحدة.
//
// وصفٌّ مشوَّه في §9 يوقفهما كما يوقف المراسي: مخرَجٌ «رخيص القراءة» مبنيٌّ على
// جدولٍ نصفُه غير مقروء يُسكِت الانحراف في مكانٍ أقرب إلى القارئ لا أبعد.
const { units, unreadable: unitsUnreadable } = readUnits()
if (unreadable === 0 && unitsUnreadable === 0) crossCheck(plan, units)

if (unreadable > 0 || unitsUnreadable > 0) {
  notices.push(
    `STATUS.md وINDEX.md غير محروسَين: ${unreadable} صفًّا في §9 و${unitsUnreadable} في §10.1 لم يُقرأ`,
  )
} else {
  const status = renderStatus({
    rows: ordered,
    units,
    total,
    doneCount,
    boardUrl: readBoardUrl(),
  })
  const lineCount = status.split('\n').length - 1
  if (lineCount > STATUS_MAX_LINES || status.length > STATUS_MAX_CHARS) {
    manual.push(
      `STATUS.md تجاوز سقفه (${lineCount} سطرًا · ${status.length} حرفًا — السقف ` +
        `${STATUS_MAX_LINES} · ${STATUS_MAX_CHARS}) — لم يُكتب. غايته أن يُقرأ رخيصًا، ` +
        `فتضخّمه ينقض سببه: قلّم الجدول أو ارفع السقف بقرار مكتوب.`,
    )
  } else {
    syncDerived(STATUS_MD, 'STATUS.md', status)
  }
  syncDerived(INDEX_MD, 'Docs/Phases/INDEX.md', renderIndex(readPhaseSpans()))
}

console.log('\nمزامنة خريطة المراحل (§9 ← اللوحة):')
console.log(
  `  قُرئ من §9: ${total} مرحلة · مكتملة: ${doneCount} · بوّابة MVP بعد ${show(gateAfter)}`,
)
console.log(`  كتل اللوحة: ${blocks.length}`)
console.log(
  `  قُرئ من §10.1: ${units.length} وحدة · مكتملة: ${units.filter((u) => u.status === 'done').length}`,
)
for (const note of notices) console.log(`  ⓘ ${note}`)

const fixable = auto.length + derived.length

if (check) {
  if (fixable + manual.length === 0) {
    console.log('  ✓ اللوحة والمشتقّان مطابقون للجدول — لا انحراف.\n')
    process.exit(0)
  }
  console.error(`\n✗ ${fixable + manual.length} انحرافًا عن §9:\n`)
  for (const d of auto) console.error(`  · ${d}`)
  for (const d of derived) console.error(`  · ${d}`)
  for (const d of manual) console.error(`  ✋ ${d}`)
  // لا تَعِد بما لا تفعله الكتابة: توجيهٌ إلى `phases:sync` لانحرافٍ لا يُصلَح
  // آليًّا يُبلّغ نجاحًا كاذبًا — وهو الصمت نفسه في ثوب رسالة.
  if (fixable > 0) console.error(`\nشغّل \`pnpm run phases:sync\` — يُصلح ${fixable} منها.`)
  if (manual.length > 0) {
    console.error(
      `${fixable > 0 ? 'و' : '\n'}${manual.length} منها لا تُصلَح آليًّا (✋): تُعالَج باليد في اللوحة أو في §9.`,
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

if (derived.length > 0) {
  console.log(`  ✓ أُعيد توليد ${derived.length} مخرَجًا مشتقًّا:`)
  for (const d of derived) console.log(`    − ${d}`)
} else {
  console.log('  ✓ المشتقّان (STATUS.md · INDEX.md) مطابقان لمصدرهما.')
}

// الكتابة لا تُغلق ما لا تفتحه: ما بقي يُقال، ويخرج بغير صفر كي لا تُقرأ
// التشغيلة نجاحًا وهي نصف نجاح.
if (manual.length > 0) {
  console.error(`\n✗ بقي ${manual.length} انحرافًا لا تُصلحه المزامنة:\n`)
  for (const d of manual) console.error(`  ✋ ${d}`)
  console.error('')
  process.exit(1)
}
console.log('')
