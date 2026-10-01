#!/usr/bin/env node
/**
 * مخروط الأثر — **جدولٌ واحد يقرؤه مستهلكان**: البوّابة A (`gate-a.mjs`) تطبعه تذكيرًا،
 * وبوّابة الموجة (`wave-verify.mjs`) تشغّل ما يطلبه في كروم حقيقي (ADR 0026).
 *
 * نُقل من `gate-a.mjs` كما هو حرفًا بحرف، ثمّ زاد أمرين مع موجات التوازي: مدخل الاستثناء الأخير يشمل
 * `.claude/` و`.prettierignore`، ومدخلان قبله يعطيان الحرّاس أنفسهم أثرًا — حارسٌ عُدّل ملفّه يلزمه هو،
 * وما تتشاركه الحرّاس يطلب الطقم كاملًا. كان تعديل `scripts/verify-editor.mjs` يُطبع «لا أثر تشغيلي»
 * فلا يُشغَّل الحارس الذي تغيّر (المراجعة المستقلّة، الصفّ 151). نسختان من الجدول كانتا ستنحرفان.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * مخروط الأثر: أي منطقة تغيّرت ← أي سكربت حيّ يلزم قبل الإغلاق.
 *
 * تغييرٌ لا يطابق أي مدخل هنا يستدعي **طقم الإغلاق كاملًا** — الافتراض
 * الآمن حين لا يُعرف الأثر، لا الصمت.
 */
export const IMPACT = [
  { match: /^src\/background\/commands\.ts/u, scripts: ['verify:activate', 'verify:lighthouse'] },
  /*
   * بوّابة الحقن: قرارها يسبق **كل** حقن — الاختصارات والقائمة والنافذة
   * والالتقاط والاستئناف. فمسّها يستدعي مسارَي الإقلاع والنافذة معًا، لا
   * أحدهما: خطأٌ فيها يظهر إمّا حقنًا لا يقع أو حالةً لا تُعرَض.
   */
  {
    match: /^(src\/background\/gate\.ts|src\/shared\/(injection-gate|site-match)\.ts)/u,
    scripts: ['verify:gate', 'verify:activate', 'verify:popup'],
  },
  {
    match: /^src\/background\/full-page-job\.ts/u,
    scripts: ['verify:activate', 'verify:fullpage'],
  },
  { match: /^src\/content\/index\.ts/u, scripts: ['verify:activate', 'verify:lighthouse'] },
  // منطقة حسّاسة مسمّاة كانت خارج الجدول (الصفّ 114 في `Docs/Engineering.md §6`).
  { match: /^src\/background\/lifecycle\.ts/u, scripts: ['verify:lifecycle'] },
  {
    match: /^src\/content\/host\.ts/u,
    scripts: ['verify:activate', 'verify:overlay', 'verify:lighthouse'],
  },
  { match: /^src\/content\/tools\/compare\.ts/u, scripts: ['verify:compare'] },
  { match: /^src\/content\/tools\/measure\.ts/u, scripts: ['verify:measure'] },
  { match: /^src\/content\/tools\/eyedropper\.ts/u, scripts: ['verify:colour'] },
  { match: /^src\/content\/tools\/inspect\.ts/u, scripts: ['verify:inspect'] },
  /*
   * المشكلات (`STAGES/32`): النموذج ولوحة الصفحة وإعادة الفحص ومعالجاتها وهوية العنصر — يحرسها رحلتها
   * كاملةً في `verify:issues`.
   */
  {
    match:
      /^(src\/content\/tools\/issues\.ts|src\/ui\/overlay\/issues\/|src\/modules\/issues\/|src\/background\/issues\.ts|src\/modules\/dom-picker\/identity\.ts|src\/shared\/issue-schema\.ts)/u,
    scripts: ['verify:issues'],
  },
  { match: /^src\/ui\/overlay\/compare\//u, scripts: ['verify:compare'] },
  { match: /^src\/pages\/popup\//u, scripts: ['verify:popup'] },
  { match: /^src\/pages\/editor\//u, scripts: ['verify:editor'] },
  { match: /^src\/pages\/library\//u, scripts: ['verify:library'] },
  /*
   * المشاركة المحلّية (`STAGES/10`): النافذة ومحرّكاها ومولِّد صفحة اللقطة — يحرسها `verify:share` بمراقبة الشبكة
   * أثناء المسارات الثلاثة وفتح الصفحة المصدَّرة بلا إنترنت.
   */
  { match: /^src\/pages\/share\//u, scripts: ['verify:share'] },
  /*
   * أثر الحقن على الصفحة (`STAGES/22`): كل ما يُحقَن في الصفحة المضيفة أو يقرّر حقنه — حزمة المحتوى والطبقة ومسار
   * الاستئناف عند التحميل. يقيسه `verify:lighthouse` بلايتهاوس: `CLS` المضاف صفر و`LCP` و`TBT` ضمن الخمسة بالمئة.
   */
  {
    match: /^(src\/content\/|src\/ui\/overlay\/|src\/background\/resume\.ts)/u,
    scripts: ['verify:lighthouse'],
  },
  { match: /^src\/shared\/messaging\//u, scripts: ['verify:activate', 'verify:capture'] },
  { match: /^src\/shared\/storage\//u, scripts: ['verify:library', 'verify:compare'] },
  {
    match: /^(manifest\.config\.ts|src\/shared\/permission-policy\.ts)/u,
    scripts: ['verify:load'],
  },
  /*
   * إعداد CI وسجلّ ترقية الحرّاس: لا يدخلان الحزمة ولا يغيّران سلوك الإضافة، فلا
   * سكربت حيّ محلّيًّا يثبت عنهما شيئًا. دليل `ci.yml` الجولة التي يطلقها رفعه،
   * ودليل السجلّ `guards:check` في هذه البوّابة نفسها. وكان غياب هذا المدخل يطلب
   * طقم الإغلاق كاملًا عند أي تعديل على ملفّ CI (الصفّ 136 في `Docs/Engineering.md §6`).
   */
  { match: /^\.github\//u, scripts: [] },
  /*
   * الحرّاس أنفسهم. حارسا الحزمة والتوكنز يجريان في البوّابة A نفسها. وحارس كروم عُدّل ملفّه يلزمه
   * هو — `scripts` هنا دالّة على نتيجة المطابقة. وما تتشاركه الحرّاس — نواتها في `scripts/lib/`
   * (`STAGES/17`) ومعها `live-*`، ومقاييس `runtime-budgets.mjs`، وخادم العيّنات وعيّناته — لا يُعرف
   * أيّ حارس يمسّ، فـ`scripts: null` يُعدّه خارج الجدول: الطقم كاملًا.
   */
  { match: /^scripts\/verify-(dist|tokens)\.mjs$/u, scripts: [] },
  { match: /^scripts\/verify-([a-z-]+)\.mjs$/u, scripts: (m) => [`verify:${m[1]}`] },
  {
    match:
      /^(scripts\/lib\/|scripts\/runtime-budgets\.mjs$|scripts\/fixtures-serve\.mjs$|tests\/fixtures\/sites\/)/u,
    scripts: null,
  },
  // توثيق وسكربتات وخطّة: لا أثر تشغيلي — تُستثنى صراحةً لا صمتًا.
  /*
   * `.claude/` (مهارات الجلسات ووكلاؤها وسير المراجعة) و`.prettierignore` بلا أثر تشغيلي
   * كذلك — أُضيفا مع موجات التوازي (ADR 0026) كي لا يطلب تعديلُ مهارةٍ طقمَ الإغلاق كاملًا.
   */
  {
    match:
      /^(Docs\/|STAGES\/|scripts\/|tests\/|\.claude\/|\.prettierignore$|README\.md|ROADMAP\.md|STATUS\.md|AGENTS\.md|package\.json)/u,
    scripts: [],
  },
]

/**
 * ما تغيّر منذ `base`: شجرة العمل أوّلًا، وإن كانت نظيفة فآخر التزام — كي يعمل قبل الالتزام
 * وبعده. و`base` يقبل أي مرجع: `HEAD` افتراضًا، و`origin/main`، ووسم `wave-XX/base`.
 */
export function changedFiles(base = 'HEAD') {
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

/**
 * المخروط لقائمة ملفّات: السكربتات الحيّة اللازمة، وعدد ما لا يطابق أي مدخل. ملفٌّ خارج الجدول
 * يعني طقم الإغلاق كاملًا — الافتراض الآمن حين لا يُعرف الأثر، لا الصمت.
 */
export function coneOf(files) {
  const needed = new Set()
  let unmapped = 0
  for (const file of files) {
    const entry = IMPACT.find((i) => i.match.test(file))
    if (!entry || entry.scripts === null) {
      unmapped += 1
      continue
    }
    const scripts =
      typeof entry.scripts === 'function' ? entry.scripts(entry.match.exec(file)) : entry.scripts
    for (const s of scripts) needed.add(s)
  }
  return { needed: [...needed], unmapped }
}
