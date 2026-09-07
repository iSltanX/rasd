#!/usr/bin/env node
/**
 * بوّابة عقد التوكنز — التطبيق العملي لصفحة 32 في ملف Figma.
 *
 * نصّ العقد: «المكوّن الذي يُثبّت قيمة حرفية عطل، لا اختصار». هذه البوّابة تجعل
 * ذلك قابلًا للفرض بدل أن يبقى اتفاقًا شفويًا.
 *
 * تفحص ثلاثة أشياء في كل CSS و TSX خارج `src/tokens/` المولَّد:
 *   1. **قيمة لونية حرفية** — `#3B82F6` · `rgb(...)` · `red`.
 *   2. **`px` حرفية** — كل بُعد يأتي من `var(--rasd-…)`.
 *   3. **خاصية CSS فيزيائية** — `left` `right` `margin-left` وأخواتها.
 *      واجهة عربية RTL لا تحتمل خاصية فيزيائية واحدة.
 *
 *   pnpm verify:tokens
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** مجلّدات لا تُفحص: مولَّدة، أو ليست مصدرًا. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-zip', 'coverage', '.git', 'tokens'])

/** ملفّات تُفحص. */
const EXTENSIONS = /\.(css|tsx|ts)$/

/**
 * قيمة لونية حرفية.
 *
 * `color-mix()` نفسها غير مدرجة: هي دالّة لا قيمة، وحين تُشتقّ من توكن
 * (`color-mix(in oklab, var(--rasd-…) 25%, transparent)`) فهي استخدام سليم.
 * الحرفي الحقيقي داخل حجّتها يُكشف بالبدائل الأخرى في هذا التعبير نفسه.
 */
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(/

/** أسماء ألوان CSS الشائعة — تُمنع صراحةً حتى لا تتسلّل بدل السداسي. */
const NAMED_COLORS =
  /(^|[\s:(,])(?:red|blue|green|black|white|gray|grey|orange|purple|pink|yellow|cyan|magenta|teal|navy|silver|gold)(?=[\s;,)]|$)/

/** `12px` وما شابه — يُسمح بـ`0` وحده. */
const LITERAL_PX = /(?<![\w-])(?!0(?:px)?(?![\d.]))\d*\.?\d+px\b/

/** خصائص فيزيائية ممنوعة في واجهة RTL. */
const PHYSICAL = new RegExp(
  [
    '(?<![\\w-])(?:margin|padding|border|inset)-(?:left|right)(?![\\w-])',
    '(?<![\\w-])border-(?:top|bottom)-(?:left|right)-radius(?![\\w-])',
    '(?<![\\w-])(?:left|right)\\s*:',
    'text-align\\s*:\\s*(?:left|right)',
    'float\\s*:\\s*(?:left|right)',
  ].join('|'),
)

/** استثناءات مبرَّرة، بسبب مكتوب. */
const ALLOWED = [
  {
    // المونو وكتل الكود تُجبَر على LTR — استثناء منصوص عليه في عقد الاتجاه.
    test: (line) => /direction:\s*ltr|unicode-bidi/.test(line),
    reason: 'عزل اتجاه مقصود',
  },
  {
    // تعليق يشرح لماذا القيمة حرفية.
    test: (line) => /rasd-allow-literal/.test(line),
    reason: 'استثناء موثّق بتعليق rasd-allow-literal',
  },
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (EXTENSIONS.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * إعفاء على مستوى الملفّ — لملفّ **كلّه** بيانات لونية خام.
 *
 * الإعفاء السطري لا يكفي لجدول مرجعي من ثلاثمئة سطر: التعليق على كل سطر
 * ضجيجٌ يخفي ما يشرحه. والبديل الذي وقع فعلًا أسوأ: بقيت البوّابة حمراء منذ
 * المرحلة 13، فصار `pnpm check` لا يُشغَّل — وحارسٌ لا يعمل أسوأ من لا حارس،
 * لأنه يُعطي أمانًا لا يقدّمه.
 *
 * والإعفاء **يُعلَن**: كل ملفّ يستعمله يُطبَع في التقرير، فلا يتسلّل ملفّ
 * واجهة إلى القائمة بلا أن يراه أحد.
 */
const FILE_EXEMPT = /rasd-allow-literal-file/

/**
 * **الرموز المعرَّفة فعلًا** — من ملفّ التوكنز المولَّد وحده.
 *
 * وُجدت الحاجة إليه بالقياس: `--rasd-space-14` و`--rasd-space-36`
 * مستعملان في **أحد عشر** موضعًا وغير معرَّفين في أي مكان. والسلّم مولَّد
 * من Figma ولا يحوي 14 ولا 36 — فهما اختراعان، ومرّا لأن الحُرّاس الثلاثة
 * السابقين يفحصون ما **يُكتب حرفيًّا** لا ما **يُشار إليه**.
 *
 * **والأثر ليس تجميليًّا**: `var()` بلا تعريف ولا قيمة احتياطية تُنتج
 * قيمةً غير صالحة، فيسقط **الإعلان كلّه** — لا الخاصية وحدها. أي أن
 * `padding: var(--rasd-space-14) var(--rasd-space-16)` لا تعطي حشوًا
 * ناقصًا بل **لا حشو إطلاقًا**، صامتةً بلا تحذير في الطرفية.
 */
const DEFINED_TOKENS = new Set(
  [
    ...(await readFile(join(root, 'public/assets/tokens.css'), 'utf8')).matchAll(
      /(--rasd-[\w-]+)\s*:/g,
    ),
  ].map((m) => m[1]),
)

/**
 * **ورموزٌ محلّية تُضبَط سطريًّا ليست عيبًا.**
 *
 * `--rasd-ov-w` و`--rasd-slider-value` وأمثالهما تُمرَّر من JS عبر `style`
 * لأن قيمتها تُقاس وقت التشغيل ولا يمكن أن تكون في عقدٍ مولَّد من Figma.
 * فتُجمَع من مصادرها الحقيقية — أي تعريف داخل CSS المشروع، وأي مفتاح
 * `'--rasd-…':` في TSX — قبل الحكم.
 *
 * وبلا هذا التمييز يصرخ الحارس على أربعةٍ وعشرين موضعًا سليمًا، فيُدرَّب
 * قارئه على تجاهله — وحارسٌ يُتجاهَل أسوأ من غيابه.
 */
for (const file of await walk(join(root, 'src'))) {
  const text = await readFile(file, 'utf8')
  const pattern = file.endsWith('.css') ? /(--rasd-[\w-]+)\s*:/g : /'(--rasd-[\w-]+)'\s*:/g
  for (const [, name] of text.matchAll(pattern)) DEFINED_TOKENS.add(name)
}

/**
 * رمزٌ مُشار إليه داخل `var()`.
 *
 * القيمة الاحتياطية (`var(--x, 1px)`) تُستثنى: الإشارة إلى رمزٍ قد لا
 * يوجد **مع** بديلٍ صريح قرارٌ مشروع، لا سهو. وهو ما يفعله `Stage.tsx`
 * بـ`--rasd-stage-ratio` المُمرَّر سطريًّا.
 */
const VAR_REF = /var\(\s*(--rasd-[\w-]+)\s*\)/g

const violations = []
const exempted = []
const files = await walk(join(root, 'src'))
let scanned = 0

for (const file of files) {
  const rel = relative(root, file)
  const isCss = file.endsWith('.css')
  const text = await readFile(file, 'utf8')
  scanned++

  // الإعفاء يُقرأ من ترويسة الملفّ وحدها — لا من سطرٍ في وسطه.
  if (FILE_EXEMPT.test(text.slice(0, 2000))) {
    exempted.push(rel)
    continue
  }

  // التعليقات لا تُفحص — الشروح والأمثلة تحمل قيمًا حرفية عمدًا،
  // ويجب تتبّع تعليقات الكتلة عبر الأسطر لا سطرًا سطرًا.
  let inBlockComment = false

  text.split('\n').forEach((line, i) => {
    let code = line
    if (inBlockComment) {
      const end = code.indexOf('*/')
      if (end === -1) return
      code = code.slice(end + 2)
      inBlockComment = false
    }
    code = code.replace(/\/\*[\s\S]*?\*\//g, '')
    const open = code.indexOf('/*')
    if (open !== -1) {
      inBlockComment = true
      code = code.slice(0, open)
    }
    code = code.replace(/\/\/.*$/, '')
    if (!code.trim()) return
    if (ALLOWED.some((rule) => rule.test(line))) return

    const at = `${rel}:${i + 1}`

    if (LITERAL_COLOR.test(code) || NAMED_COLORS.test(code)) {
      violations.push({ at, rule: 'قيمة لونية حرفية', line: code.trim() })
    }
    if (isCss && LITERAL_PX.test(code)) {
      violations.push({ at, rule: 'قيمة px حرفية', line: code.trim() })
    }
    if (isCss && PHYSICAL.test(code)) {
      violations.push({ at, rule: 'خاصية CSS فيزيائية', line: code.trim() })
    }
    for (const [, name] of code.matchAll(VAR_REF)) {
      if (!DEFINED_TOKENS.has(name)) {
        violations.push({ at, rule: `رمز غير معرَّف: ${name}`, line: code.trim() })
      }
    }
  })
}

console.log('\nبوّابة عقد التوكنز:')
console.log(`  فُحص ${scanned} ملفًا خارج src/tokens/ المولَّد`)
for (const rel of exempted) {
  console.log(`  ⊘ معفى بترويسته (بيانات لونية خام): ${rel}`)
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} مخالفة:\n`)
  for (const v of violations.slice(0, 40)) {
    console.error(`  ${v.at}`)
    console.error(`    ${v.rule}: ${v.line.slice(0, 100)}`)
  }
  if (violations.length > 40) console.error(`  … و${violations.length - 40} أخرى`)
  console.error(
    '\nاستخدم var(--rasd-…) والخصائص المنطقية.' +
      '\nللاستثناء السطري: /* rasd-allow-literal */' +
      '\nولملفّ كلّه بيانات لونية خام: rasd-allow-literal-file في ترويسته.\n',
  )
  process.exit(1)
}

console.log('  ✓ لا قيمة لونية حرفية')
console.log('  ✓ لا px حرفية')
console.log('  ✓ لا خاصية CSS فيزيائية')
console.log(`  ✓ كل رمز مُشار إليه معرَّف (${String(DEFINED_TOKENS.size)} رمزًا في العقد)`)
console.log('\n✓ العقد محترَم.\n')
