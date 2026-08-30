/**
 * صيغ اللون الخمس — تحليل وتنسيق، ومع كل قيمة حكمٌ على مداها.
 *
 * **`culori/fn` لا `culori`.** المدخل الجذر يُسجّل كل فضاءات اللون وكل
 * محلِّلات CSS عند الاستيراد (`sideEffects` في حزمته يسمّي
 * `src/bootstrap/all.js`)، فيدخل الحزمة كلّه. ومدخل `fn` لا يسجّل شيئًا:
 * نحن نُسجّل الأربعة التي نحتاجها بـ`useMode` فيبقى الباقي خارج المخرَج.
 * وحزمة `content.js` محكومة بميزانية 120KB مضغوطة (المرحلة 24).
 *
 * **الخروج من المدى (out-of-gamut) يُعلَن ولا يُخفى.** مسار البكسل يعطي
 * sRGB دائمًا بحكم مصدره (لقطة PNG)، لكن مسار CSS قد يعطي
 * `oklch(70% 0.4 150)` أو `color(display-p3 …)` — ألوانًا لا يمثّلها sRGB.
 * عرض قيمة سداسية مقصوصة بلا إخبار يجعل الأداة تكذب على المطوّر في
 * الحالة التي بُنيت من أجلها بالضبط: مقارنة ما يراه بما هو مكتوب.
 *
 * **والقصّ يقلّد المتصفّح لا المواصفة.** CSS Color 4 يوصي بخفض التشبّع في
 * OKLCH (وهو ما يفعله `clampChroma`)، لكن **كروم يقصّ القنوات**. قِيس في
 * متصفّح حقيقي بثلاث درجات خارجة عن المدى من لوحة Tailwind v4:
 *
 * | الدرجة | كروم | قصّ القنوات | `clampChroma` |
 * |---|---|---|---|
 * | `blue-500`  | `#2b7fff` | `#2b7fff` ✓ | `#3280ff` ✗ |
 * | `green-500` | `#00c950` | `#00c950` ✓ | `#00c65a` ✗ |
 * | `fuchsia-500` | `#e12afb` | `#e12afb` ✓ | `#e12afb` ✓ |
 *
 * ولا خيار لنا في ذلك: `rgb` هنا تعني «ما يُرسَم على الشاشة»، وهي القيمة
 * التي ستقرؤها العدسة من اللقطة بايتًا بايت. فلو خالفتها لناقضت الأداةُ
 * نفسَها في اللون الواحد: العدسة تقول `#2b7fff` واللوحة تقول `#3280ff`.
 * والإحداثيات الحقيقية تبقى كاملة في `oklch`، والقصّ معلَن في `inSrgb`.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — يأخذ نصًّا ويُرجع أرقامًا.
 */

import {
  formatHex,
  formatHex8,
  modeHsl,
  modeOklab,
  modeOklch,
  modeRgb,
  parse,
  useMode,
  type Color,
} from 'culori/fn'

/*
 * التسجيل مرّة واحدة عند تحميل الوحدة.
 *
 * `useMode` يُرجع المحوِّل ويُسجّل الفضاء ومحلِّلات CSS الخاصّة به معًا —
 * فبدونه `parse('oklch(…)')` يُرجع `undefined` بلا خطأ، وهو فشل صامت.
 */
const toRgb = useMode(modeRgb)
const toHsl = useMode(modeHsl)
const toOklch = useMode(modeOklch)
useMode(modeOklab)

/**
 * تسامح المدى — **نصف بايت**، ولهذا الرقم سبب لا اعتباط.
 *
 * `inGamut` في `culori` يقارن بصرامة رياضية، فيُعلن `#0000ff` نفسه **خارج
 * sRGB**: تحويله إلى OKLab وعودته يعطي قناةً تساوي `1.0000000000000002`.
 * قِيس ذلك مباشرةً — الأزرق الخالص، وهو لون sRGB بحكم تعريفه.
 *
 * والحكم يُعلَن في `inSrgb`، فلو بُني على المقارنة الصارمة لأعلن الأزرق
 * الخالص نفسَه لونًا لا يمثّله sRGB — وهو خبر كاذب يُعرض للمستخدم.
 *
 * فالسؤال الصحيح ليس «هل هو داخل المدى رياضيًّا؟» بل **«هل يختلف عمّا
 * سيُعرض فعلًا؟»** — ونحن نُقرِّب إلى بايت في كل الأحوال، فما يقلّ فرقه عن
 * نصف بايت لا وجود له في المخرَج أصلًا.
 */
const GAMUT_EPSILON = 0.5 / 255

const channelsWithinSrgb = (c: { r: number; g: number; b: number }): boolean =>
  [c.r, c.g, c.b].every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)

/** قناة sRGB بعد التقريب إلى بايت — ما يُكتب في `#RRGGBB` و`rgb()`. */
export interface Rgb255 {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** إحداثيات OKLCH الحقيقية — **قبل** أي قصّ إلى مدى sRGB. */
export interface Oklch {
  /** الإضاءة 0..1 (تُعرض نسبةً مئوية). */
  readonly l: number
  /** التشبّع — بلا حدّ أعلى نظري. */
  readonly c: number
  /** الزاوية بالدرجات 0..360؛ `0` للرماديات التي لا زاوية لها. */
  readonly h: number
}

export interface ColourReading {
  /**
   * **البايتات التي يرسمها المتصفّح** — مقصوصة إلى sRGB عند اللزوم.
   *
   * القصّ على القنوات لا على التشبّع، لأن هذا ما يفعله كروم: انظر جدول
   * القياس في ترويسة الملفّ. وهي القيمة التي تقرؤها العدسة من اللقطة، فلا
   * يجوز أن تخالفها. والإحداثيات الحقيقية غير المقصوصة في `oklch`.
   */
  readonly rgb: Rgb255
  /** 0..1؛ `1` حين لا شفافية. */
  readonly alpha: number
  /** الإحداثيات الحقيقية بلا قصّ — هي ما يُعرض في صيغة OKLCH. */
  readonly oklch: Oklch
  /** هل اللون الأصلي داخل مدى sRGB؟ `false` يعني أن `rgb` تقريبٌ معلَن. */
  readonly inSrgb: boolean
}

/** المخرجات الخمس التي تفرضها `Rasd_Ar.md §6.7`. */
export interface ColourFormats {
  readonly hex: string
  readonly rgb: string
  readonly hsl: string
  readonly oklch: string
  /** «قيمة CSS جاهزة» — تُلصق كما هي في تصريح. */
  readonly css: string
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** إلى بايت — `Math.round` لا بتر: البتر يُنقص كل قناة بمقدار نصف بايت. */
const byte = (v: number): number => clamp(Math.round(v * 255), 0, 255)

/** تقريب ثابت الخانات — يمنع `0.30000000000000004` في المخرَج. */
const fixed = (v: number, places: number): number => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

/**
 * يحلّل أي قيمة لون CSS إلى قراءة كاملة.
 *
 * `null` حين لا تكون القيمة لونًا أصلًا — وهي الحالة الشائعة لا الطرفية:
 * `background-image` قد يكون `none` أو تدرّجًا، و`border-color` قد يكون
 * `currentcolor` قبل الحلّ. الفشل يُرجَع قيمةً لا يُرمى.
 */
export function readColour(css: string): ColourReading | null {
  const parsed = parse(css.trim())
  if (!parsed) return null
  return fromColor(parsed)
}

/** يبني قراءة من بكسل خام — المسار الذي تسلكه العيّنة من اللقطة. */
export function fromPixel(r: number, g: number, b: number, a = 255): ColourReading {
  return fromColor({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255, alpha: a / 255 })
}

function fromColor(input: Color): ColourReading {
  const alpha = clamp(input.alpha ?? 1, 0, 1)
  const oklchRaw = toOklch(input)

  const rgb = toRgb(input)
  // الحكم وحده يحتاج التسامح؛ القصّ نفسه يقع في `byte` على كل حال.
  const within = channelsWithinSrgb(rgb)

  return {
    // `byte` يقصّ إلى [0,255] — وهو قصّ القنوات نفسه الذي يفعله كروم.
    rgb: { r: byte(rgb.r), g: byte(rgb.g), b: byte(rgb.b) },
    alpha,
    oklch: {
      l: oklchRaw.l ?? 0,
      c: oklchRaw.c ?? 0,
      // رماديّ خالص لا زاوية له — `culori` يُرجع `undefined` لا صفرًا.
      h: oklchRaw.h ?? 0,
    },
    inSrgb: within,
  }
}

/**
 * الصيغ الخمس من قراءة واحدة.
 *
 * **الدقّة مختارة لا اعتباطية**: `hex` و`rgb` أعداد صحيحة لأن المصدر
 * بايتات؛ و`hsl` بخانة عشرية واحدة لأن أكثر منها ضجيج لا معلومة؛ و`oklch`
 * بأربع خانات للتشبّع لأن مداه 0..~0.4 فثلاث خانات تفقد تمييزًا مرئيًّا —
 * وهو ما يجعل جولة `hex → oklch → hex` ترجع القيمة نفسها (مُختبَر).
 */
export function formatColour(c: ColourReading): ColourFormats {
  const { r, g, b } = c.rgb
  const a = fixed(c.alpha, 3)
  const opaque = c.alpha >= 1

  const hsl = toHsl({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
  const hDeg = fixed(hsl.h ?? 0, 1)
  const sPct = fixed((hsl.s ?? 0) * 100, 1)
  const lPct = fixed((hsl.l ?? 0) * 100, 1)

  const okL = fixed(c.oklch.l * 100, 2)
  const okC = fixed(c.oklch.c, 4)
  const okH = fixed(c.oklch.h, 2)

  const hex = opaque
    ? formatHex({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
    : formatHex8({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255, alpha: c.alpha })

  return {
    hex,
    // الصيغة القديمة بفواصل: أوسع دعمًا وأشيع في الشيفرة القائمة.
    rgb: opaque ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`,
    hsl: opaque
      ? `hsl(${hDeg}, ${sPct}%, ${lPct}%)`
      : `hsla(${hDeg}, ${sPct}%, ${lPct}%, ${a})`,
    // OKLCH بلا صيغة قديمة — لا وجود لها؛ والفراغات هي نحو CSS Color 4.
    oklch: opaque ? `oklch(${okL}% ${okC} ${okH})` : `oklch(${okL}% ${okC} ${okH} / ${a})`,
    css: opaque ? hex : `rgba(${r}, ${g}, ${b}, ${a})`,
  }
}

/** اختصار: نصّ ← الصيغ الخمس. `null` حين لا يكون النصّ لونًا. */
export function formatsOf(css: string): ColourFormats | null {
  const reading = readColour(css)
  return reading ? formatColour(reading) : null
}
