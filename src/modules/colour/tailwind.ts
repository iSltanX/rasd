/**
 * أقرب لون في لوحة Tailwind — أو الاعتراف بأن لا اسم لهذا اللون.
 *
 * **الحدّ مع المرحلة 11 مقصود لا متناقض.** `style-export/tailwind.ts` يرفض
 * تسمية الألوان رفضًا تامًّا ويكتب `bg-[#2b7fff]` دائمًا، ونصّه: «أسماء
 * اللوحة تتغيّر بالإصدار والتخصيص — القيمة الصريحة لا تكذب». وذاك مسار
 * **تصدير كود** يُلصَق فيُصرَّف: اسم خاطئ هناك ينتج لونًا آخر في المنتج.
 * وهذا مسار **معلومة** يُعرض في لوحة اللون: «هذا اللون هو `blue-500`» جواب
 * عن سؤال يسأله المطوّر فعلًا. فالقاعدة الجامعة: **يُسمّى ما يُعرض،
 * ولا يُسمّى ما يُنسَخ كودًا** — والمسافة تُعلَن مع الاسم في الحالتين.
 *
 * **المسافة في OKLab لا في sRGB.** المسافة الإقليدية في sRGB لا تقيس
 * شيئًا يراه أحد: أزرقان يبعدان فيها بقدر ما يبعد أخضران متمايزان بيّنًا.
 * وOKLab مبنيّ ليكون فيه البُعد الإقليدي تقريبًا للفرق المُدرَك، وهو
 * الفضاء الذي كُتبت به لوحة v4 أصلًا.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { converter, modeOklab, modeOklch, modeRgb, useMode, type Color } from 'culori/fn'

import { formatColour, readColour, type ColourReading } from './formats'
import {
  TAILWIND_PALETTE,
  TAILWIND_PALETTE_4_2_NEUTRALS,
  TAILWIND_VERSION,
  type TailwindSwatch,
} from './tailwind-palette'

useMode(modeRgb)
useMode(modeOklch)
useMode(modeOklab)
const toOklab = converter('oklab')

interface Lab {
  readonly l: number
  readonly a: number
  readonly b: number
}

/**
 * عتبة «قريب بما يكفي لتسميته» — **0.02**، مقيسة على اللوحة نفسها بالمسار
 * الذي تسلكه الأداة (قصّ القنوات ثم تقريب إلى بايت)، لا مُقدَّرة.
 *
 *   - **وسيط أقرب جارَين في اللوحة كلّها 0.0275.** فما قلّ عن 0.02 يكون
 *     أقرب إلى درجته ممّا تكون الدرجات إلى بعضها — أي أن الاسم **يميّز**.
 *     ولو وُسِّعت العتبة لصار الاسم قرعةً بين جارين.
 *   - **9.8% فقط** من مكعّب sRGB تقع داخل 0.02 من أي درجة (عيّنة 20,000
 *     لون، والوسيط 0.045). فاللوحة لا تبتلع فضاء الألوان، والاسم يُرفَض في
 *     تسع حالات من كل عشر — وهو المطلوب.
 *
 * **وما لا تعِد به العتبة**: أضيق فجوة بين درجتين متجاورتين **0.0149**
 * (`neutral-50`→`neutral-100`)، وهي دون العتبة. فقد يقع لون داخل مدى
 * درجتين معًا. ولا يُخفى ذلك: الأقرب يُختار بالمسافة لا بالعتبة،
 * والمسافة تُعرض، والمتساويات تُسرَد في `ties`، و`exact` وحده يعني
 * التطابق. العتبة تحكم **هل يُقال اسم**، لا **أيّ اسم يُقال**.
 *
 * **ولا تُلقى على العتبة مهمّة تمييز الإصدارات**: `blue-500` في v3
 * (`#3b82f6`) يبعد **0.0193** عن `blue-500` في v4 — داخل العتبة. فيُسمّى
 * `near` لا `exact`، وهو الصواب: الاسم صحيح على ذلك الموقع، وعدم التطابق
 * معلَن بالحكم والمسافة معًا.
 */
export const TAILWIND_NEAR_DELTA = 0.02

/**
 * فرق يقلّ عن هذا يُعدّ تعادلًا — لسرد الأسماء المتساوية لا لترجيح أحدها.
 *
 * ليس اعتباطًا: في اللوحة تعادل حقيقي (`zinc-50` و`neutral-50` كلاهما
 * `#fafafa` بالضبط)، فترجيح أحدهما بترتيب المصفوفة إخفاءٌ لحقيقة.
 */
const TIE_DELTA = 1e-6

/** مطابقة واحدة مع مسافتها. */
export interface TailwindMatch {
  readonly swatch: TailwindSwatch
  /** المسافة الإقليدية في OKLab — صفر يعني تطابقًا رياضيًّا. */
  readonly deltaE: number
  /** القيمة السداسية التي تُنتجها هذه الدرجة فعلًا — للمقارنة جنبًا إلى جنب. */
  readonly hex: string
}

/**
 * حكم على قابلية التسمية — ثلاثة لا اثنان.
 *
 * `exact` **لا يُقاس بعتبة**: هو تطابق البايتات بعد التقريب إلى sRGB. فما
 * يُعرض على الشاشة من الدرجة يُعرض من اللون سواء بسواء، فلا حكم ولا اجتهاد.
 */
export type TailwindVerdict = 'exact' | 'near' | 'far'

export interface TailwindNaming {
  readonly verdict: TailwindVerdict
  /** الأقرب دائمًا — يُعرض حتى في `far`، مقرونًا بمسافته، ليحكم القارئ. */
  readonly nearest: TailwindMatch
  /** درجات أخرى على المسافة نفسها؛ فارغة في الغالب. */
  readonly ties: readonly TailwindMatch[]
  /**
   * الاسم الجاهز للاستعمال، أو `null` حين لا اسم يُقال بصدق.
   *
   * يحمل مُعدِّل الشفافية حين تكون الشفافية دون الواحد (`blue-500/50`)،
   * فالاسم بلا مُعدِّله يعد بلون معتم لا يطابق ما يُرى.
   */
  readonly name: string | null
  /**
   * القيمة الصريحة بين قوسين — `[#2b7fff]`.
   *
   * تُلحَق بأي بادئة أداة (`bg-` · `text-` · `border-`). موجودة **دائمًا**
   * حتى مع `exact`: القيمة الصريحة لا تتغيّر بإصدار ولا بتخصيص.
   */
  readonly arbitrary: string
  /**
   * القيمة كما تُكتب في `@theme` — بصيغة OKLCH، وهي الصيغة التي تكتب بها
   * v4 لوحتها نفسها. بلا اسم متغيّر: تسمية المتغيّر قرار المستخدم.
   */
  readonly themeValue: string
  readonly version: typeof TAILWIND_VERSION
}

export interface NearestOptions {
  /**
   * ضمّ محايدات 4.2 الأربع (`mauve` · `mist` · `olive` · `taupe`).
   *
   * افتراضها `false`: أسماؤها لا تُصرَّف في مشروع على 4.0 أو 4.1. انظر
   * ترويسة `tailwind-palette.ts`.
   */
  readonly include42Neutrals?: boolean
}

/**
 * اللوحة الموسَّعة ثابتٌ لا تُبنى في كل نداء.
 *
 * لو بُنيت داخل الدالّة لكان كل استدعاء مصفوفةً جديدة، فلا تُصيب ذاكرةُ
 * التحويل أبدًا وتُعاد 286 عملية تحويل مع **كل حركة مؤشِّر**.
 */
const PALETTE_WITH_4_2: readonly TailwindSwatch[] = [
  ...TAILWIND_PALETTE,
  ...TAILWIND_PALETTE_4_2_NEUTRALS,
]

/** ذاكرة التحويل — اللوحة ثابتة، فتُحوَّل مرّة لا مع كل حركة مؤشِّر. */
const labCache = new WeakMap<
  readonly TailwindSwatch[],
  { swatch: TailwindSwatch; lab: Lab; hex: string }[]
>()

/*
 * **الطرفان يُحوَّلان بالطريق نفسه — وإلّا لم يتطابق المتطابقان.**
 *
 * اللوحة تُقرأ بـ`readColour` نفسها التي تقرأ بها كل قيمة في الأداة، ثم
 * يُقاس البُعد من `rgb` الناتجة **بعد التقريب إلى بايت**. وهذا ليس تدقيقًا
 * زائدًا بل شرط صحّة، كشفه اختبار الدورة الكاملة على 242 درجة:
 *
 *   - لوحة v4 مكتوبة بمدى P3، وعشرات درجاتها (`fuchsia` · `pink` · `rose`
 *     المشبَّعة) **خارج sRGB**. وقصّ القنوات يعطيها لونًا غير الذي يعطيه
 *     `clampChroma` — فلو حُوِّلت اللوحة بطريق والقراءة بآخر لأخفق التطابق
 *     في كل درجة خارجة عن المدى.
 *   - والبكسل المُلتقَط ثمانيّ البتّات بحكم مصدره. فمقارنته بقيمة كاملة
 *     الدقّة تُبقي فرقًا ثابتًا لا يزول (قِيس: ΔE ‎0.00097‎ لـ`red-500`
 *     المطابق تمامًا) — ويصير «التطابق التامّ» مسافةً غير صفرية.
 *
 * فالمقارنة تقع حيث تقع الرؤية: في sRGB ثمانيّ البتّات.
 */
function prepared(palette: readonly TailwindSwatch[]) {
  const hit = labCache.get(palette)
  if (hit) return hit
  const built = palette.map((swatch) => {
    // اللوحة بيانات مُتحقَّق منها؛ لو أخفقت القراءة فالخطأ في البيانات لا
    // في المدخل، ولا يُبتلع صامتًا.
    const reading = readColour(swatch.oklch)
    if (!reading) throw new Error(`قيمة لوحة غير صالحة: ${swatch.name}`)
    return { swatch, lab: labOfReading(reading), hex: formatColour(reading).hex }
  })
  labCache.set(palette, built)
  return built
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function labOf(c: Color): Lab {
  const l = toOklab(c)
  // الرماديات الخالصة تُكتب `oklch(98.5% 0 none)`، فيُرجِع `culori` لونًا
  // بلا محاور — والصفر هو معناها لا افتراضٌ عليها.
  return { l: l.l ?? 0, a: l.a ?? 0, b: l.b ?? 0 }
}

/** من قراءة إلى OKLab — عبر `rgb` المعروضة لا الإحداثيات الخام. */
function labOfReading(c: ColourReading): Lab {
  return labOf({ mode: 'rgb', r: c.rgb.r / 255, g: c.rgb.g / 255, b: c.rgb.b / 255 })
}

function distance(x: Lab, y: Lab): number {
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/**
 * أقرب درجة إلى قراءة لون — بحث خطّي على 242 عنصرًا.
 *
 * خطّيّ عمدًا: 242 قياسًا يكلّف ميكروثوانٍ معدودة، وأي بنية تسريع (k-d أو
 * تجزئة مكانية) تُضيف كودًا إلى حزمة محكومة بميزانية 120KB مقابل وفر لا
 * يُقاس في هذا الحجم.
 */
export function nearestTailwind(
  c: ColourReading,
  options: NearestOptions = {},
): { nearest: TailwindMatch; ties: TailwindMatch[] } {
  const palette = options.include42Neutrals ? PALETTE_WITH_4_2 : TAILWIND_PALETTE

  /*
   * تُقاس المسافة إلى **اللون المعروض** (`c.rgb`) لا إلى إحداثياته الخام.
   *
   * لونٌ خارج مدى sRGB — `oklch(70% 0.4 150)` مثلًا — يُعرض مقصوصًا، وهذه
   * هي البكسلات التي يراها المطوّر ويقارن بها. فقياس المسافة من قيمة لا
   * تُعرض يعطي اسمًا لا علاقة له بما على الشاشة. والقصّ معلَن في `inSrgb`.
   */
  const target = labOfReading(c)

  const rows = prepared(palette)
  let best = rows[0]!
  let bestD = distance(target, best.lab)
  for (let i = 1; i < rows.length; i++) {
    const d = distance(target, rows[i]!.lab)
    if (d < bestD) {
      bestD = d
      best = rows[i]!
    }
  }

  const ties: TailwindMatch[] = []
  for (const row of rows) {
    if (row.swatch === best.swatch) continue
    const d = distance(target, row.lab)
    if (Math.abs(d - bestD) <= TIE_DELTA) ties.push({ swatch: row.swatch, deltaE: d, hex: row.hex })
  }

  return { nearest: { swatch: best.swatch, deltaE: bestD, hex: best.hex }, ties }
}

/** مُعدِّل الشفافية كما يكتبه Tailwind: نسبة مئوية صحيحة. */
function alphaSuffix(alpha: number): string {
  if (alpha >= 1) return ''
  return `/${Math.round(clamp01(alpha) * 100)}`
}

/**
 * الحكم الكامل: اسم إن صحّ، وقيمة صريحة دائمًا.
 *
 * **الحكم قرب الأسود متشدِّد عمدًا.** OKLab شديد الانحدار في أسفل سلّم
 * الإضاءة: بايت واحد عند `#000000` يساوي ΔE **0.067** (وعند `#808080`
 * يساوي 0.003 — أي 25 ضعفًا). فلونٌ يبعد بايتًا عن `slate-900` قد يُحكَم
 * `far` رغم أن العينين لا تفرّقان. والانحياز في هذا الاتّجاه هو الصحيح:
 * الخطأ يقع نحو **القيمة الصريحة** لا نحو اسم لا يطابق، وهو الاتّجاه الذي
 * تختاره المرحلة 11 كلّها.
 */
export function tailwindNaming(c: ColourReading, options: NearestOptions = {}): TailwindNaming {
  const { nearest, ties } = nearestTailwind(c, options)
  const formats = formatColour(c)

  // التطابق يُقاس بالبايتات لا بعتبة: `#RRGGBB` واحد على الشاشة.
  const selfHex = formatColour({ ...c, alpha: 1 }).hex
  const verdict: TailwindVerdict =
    selfHex.toLowerCase() === nearest.hex.toLowerCase()
      ? 'exact'
      : nearest.deltaE <= TAILWIND_NEAR_DELTA
        ? 'near'
        : 'far'

  const suffix = alphaSuffix(c.alpha)

  return {
    verdict,
    nearest,
    ties,
    name: verdict === 'far' ? null : `${nearest.swatch.name}${suffix}`,
    // القيمة الصريحة تحمل الشفافية في القيمة نفسها لا في مُعدِّل، فهي قيمة
    // كاملة: `[rgba(…)]` أو `[#RRGGBB]`.
    arbitrary: `[${formats.css.replace(/\s+/g, '')}]`,
    themeValue: formats.oklch,
    version: TAILWIND_VERSION,
  }
}
