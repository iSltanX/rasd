/**
 * تقطيع النصّ إلى ذرّات، وعزل المقاطع التقنية.
 *
 * **العزل يعمل على Canvas — حُسم بالقياس لا بالافتراض.** رُسم السطر نفسه
 * ثلاث مرّات ونُظر إليه: بلا عزل عند `direction: rtl` يُرسم `3B82F6#` —
 * الهاش يقفز إلى الطرف الخطأ — وبعزل يُرسم `#3B82F6`. ومحارف العزل تزيد
 * العرض **0.000px** فلا تُرسم مربّعات. فلا حاجة لبنية عزل يدوي تقسّم السطر
 * إلى مقاطع اتّجاهية وترسم كلًّا بموضع محسوب، وهي البنية التي كانت ستفرض
 * فخّ «مجموع الأجزاء ≠ الكلّ» على كل سطر.
 *
 * **وقيدان مقيسان يحكمان الترتيب:**
 *   - `Intl.Segmenter` بـ`granularity: 'line'` يرمي `RangeError` — غير مشحون.
 *   - و`'word'` **يكسر الرموز التقنية**: `#3B82F6` يصير `#` و`3B82F6`،
 *     و`--color-primary` يصير خمسة مقاطع، و`rgba(0,0,0,.5)` سبعة.
 *
 * ⇒ **المقاطع التقنية تُنتزَع ذرّاتٍ قبل التقطيع لا بعده.** ولو قُطِّع أوّلًا
 * لانكسرت قيمة سداسية على سطرين.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { isolate } from '@/shared/bidi'

/** وحدة نصّ لا تُقطَع من داخلها. */
export interface Atom {
  readonly text: string
  /** مقطع تقني — يُعزَل اتّجاهيًّا ولا يُكسَر مهما ضاق السطر. */
  readonly technical: boolean
  /** مسافة — **فرصة القطع الوحيدة**. */
  readonly breakable: boolean
}

/**
 * أنماط المقاطع التقنية.
 *
 * الترتيب مهمّ: الأطول أوّلًا كي لا يبتلع نمطٌ قصير بداية مقطع أطول
 * (`--color` قبل `color`, و`#3B82F6` قبل `#3B`).
 *
 * وليست قائمةً شاملة ولا تدّعي ذلك: تغطّي ما يكتبه مراجع واجهات فعلًا —
 * قيمة لون، ومتغيّر CSS، ومقاس بوحدة، ومحدِّد، ومسار، ورابط، واختصار مفاتيح.
 * وما فاتها يُعامَل كلمةً عادية: يُقطع عند مسافاته لا داخله، فالضرر أقصاه
 * لفٌّ أقلّ جمالًا لا نصٌّ مقلوب.
 */
export const TECHNICAL_PATTERNS: readonly RegExp[] = [
  // رابط
  /https?:\/\/[^\s]+/u,
  // متغيّر CSS أو خاصّية مركّبة الشرطات
  /--[A-Za-z][\w-]*/u,
  // قيمة لون سداسية
  /#[0-9A-Fa-f]{3,8}\b/u,
  // دالّة لون أو تحويل بأقواسها
  /[a-z]+\([^)\s]*\)/u,
  // مقاس بوحدة
  /-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ch|s|ms|deg|fr)\b/u,
  // محدِّد CSS: وسم.صنف#معرّف
  /[A-Za-z][\w-]*(?:[.#][\w-]+)+/u,
  // معرّف أو صنف مفرد
  /[.#][A-Za-z][\w-]*/u,
  // مسار
  /[\w-]+(?:\/[\w.-]+)+/u,
  // اختصار مفاتيح
  /(?:[⌘⌥⇧⌃]\s*)+[A-Za-z0-9]/u,
]

/** أوّل مطابقة تقنية تبدأ عند `from` أو بعده — أو `null`. */
function nextTechnical(text: string, from: number): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null
  for (const pattern of TECHNICAL_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    re.lastIndex = from
    const m = re.exec(text)
    if (!m) continue
    const start = m.index
    const end = start + m[0].length
    // الأبكر يفوز؛ وعند التساوي يفوز الأطول — فلا يُبتَر مقطع.
    if (!best || start < best.start || (start === best.start && end > best.end)) {
      best = { start, end }
    }
  }
  return best
}

/**
 * يقطّع النصّ إلى ذرّات: مقاطع تقنية، وكلمات، ومسافات.
 *
 * المسافات ذرّاتٌ مستقلّة لأنها **فرص القطع**، ولأن حذفها عند القطع يجب
 * أن يكون قرارًا صريحًا لا أثرًا جانبيًّا.
 */
export function segmentAtoms(text: string): readonly Atom[] {
  const atoms: Atom[] = []

  const pushPlain = (chunk: string): void => {
    if (!chunk) return
    // تقسيم على المسافات مع إبقائها.
    for (const part of chunk.split(/(\s+)/u)) {
      if (!part) continue
      atoms.push({ text: part, technical: false, breakable: /^\s+$/u.test(part) })
    }
  }

  let at = 0
  for (;;) {
    const hit = nextTechnical(text, at)
    if (!hit) break
    pushPlain(text.slice(at, hit.start))
    atoms.push({ text: text.slice(hit.start, hit.end), technical: true, breakable: false })
    at = hit.end
  }
  pushPlain(text.slice(at))

  return atoms
}

/**
 * يركّب السطر المرسوم من ذرّاته — المقاطع التقنية معزولة.
 *
 * **والنصّ المقيس هو النصّ المرسوم.** لو قِيس السطر بلا عزل ورُسم بعزل
 * لاختلفا — ومحارف العزل وإن كانت صفرية العرض تغيّر ترتيب bidi، وترتيبٌ
 * مختلف قد يعطي تشكيلًا مختلفًا عند حدود المقاطع.
 */
export function isolateAtoms(atoms: readonly Atom[]): string {
  return atoms.map((a) => (a.technical ? isolate(a.text) : a.text)).join('')
}

/** اختصار: نصّ ← نصّ معزول جاهز للرسم والقياس. */
export function isolateText(text: string): string {
  return isolateAtoms(segmentAtoms(text))
}

/**
 * محارف عربية وعبرية وما يجري مجراها — اتجاه قويّ من اليمين.
 *
 * **بالهروب لا بالحرف**: المدى ينتهي عند `U+FEFF`، وكتابته حرفًا تضع مسافة
 * صفرية غير قابلة للكسر في المصدر — لا تُرى في المحرر، ويقرأها كل من يفتح
 * الملفّ بعدُ نهايةَ مدًى مختلفة عمّا يظنّ.
 */
const RTL_STRONG = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u0860-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u
/** لاتيني ويوناني وسيريلي — اتجاه قويّ من اليسار. */
const LTR_STRONG = /[A-Za-z\u00C0-\u02AF\u0370-\u058F]/u

/**
 * يحسم اتجاه الفقرة — **ولا يُرجع `'auto'` أبدًا**.
 *
 * `ctx.direction` الافتراضي في صفحة المحرر **`rtl`** بالقياس، لأنه يرث
 * `dir="rtl"` من المستند. فترك الاتجاه للوراثة يعني أن نصًّا لاتينيًّا خالصًا
 * يُرسم باتجاه فقرة عربي، فتقفز علامات الترقيم الطرفية: `Hi!` تصير `!Hi`.
 *
 * والحسم بأوّل محرف ذي اتجاه قويّ — وهي قاعدة `FSI` في UAX #9 نفسها،
 * وقاعدة `dir="auto"` في HTML.
 */
export function resolveDirection(text: string, declared: 'rtl' | 'ltr' | 'auto'): 'rtl' | 'ltr' {
  if (declared !== 'auto') return declared

  for (const ch of text) {
    if (RTL_STRONG.test(ch)) return 'rtl'
    if (LTR_STRONG.test(ch)) return 'ltr'
  }
  // بلا محرف قويّ (أرقام ورموز فقط): العربية هي لغة المنتج.
  return 'rtl'
}
