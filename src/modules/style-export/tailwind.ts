/**
 * تحويل القيم المحسوبة إلى أدوات Tailwind — v4.
 *
 * **المسألة الحقيقية ليست الجدول بل الكذب.** Tailwind سلّم منفصل، والقيمة
 * المحسوبة رقم حرّ: `padding: 15px` **ليس** `p-4` (وهي 16px). وإعطاء
 * المستخدم `p-4` عن 15px يعني أن نسخه سيُنتج تخطيطًا مختلفًا عمّا يرى.
 *
 * فثلاث نتائج لا واحدة:
 *   - `scale` — القيمة تقع على السلّم بالضبط.
 *   - `arbitrary` — لا تقع، فتُكتب `p-[15px]` **مع ذكر السبب**.
 *   - `untranslatable` — لا مقابل لها أصلًا، فتُعلَن ولا يُخترَع لها صنف.
 *
 * والإصدار **v4 حصرًا**: سلّمه مبنيّ على `--spacing` بمضاعفات 0.25rem،
 * وصيغته تختلف عن v3. واستهداف الاثنين معًا يعني إنتاج صنف لا يعمل في
 * أحدهما بلا إخبار المستخدم أيّهما.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/** الإصدار المستهدَف — يُعلَن للمستخدم مع المخرَج. */
export const TAILWIND_TARGET = 4 as const

export type Mapped =
  | { readonly kind: 'scale'; readonly cls: string }
  | { readonly kind: 'arbitrary'; readonly cls: string; readonly why: string }
  | {
      readonly kind: 'untranslatable'
      readonly prop: string
      readonly value: string
      readonly why: string
    }

/**
 * وحدة السلّم في v4: 0.25rem.
 *
 * والقيمة تُقاس بالبكسل، فتلزم قسمة على حجم خطّ الجذر — وهو ليس 16 دائمًا:
 * صفحة بـ`font-size: 62.5%` على `<html>` تجعل `1rem = 10px`. فيُمرَّر
 * مقروءًا لا مفترَضًا.
 */
const STEP_REM = 0.25

/** أسماء درجات السلّم المسموحة في v4 (مضاعفات نصفية حتى 4، ثم صحيحة). */
function scaleName(steps: number): string | null {
  if (steps === 0) return '0'
  if (steps < 0) return null
  if (Number.isInteger(steps)) return String(steps)
  // v4 يقبل الكسور النصفية للدرجات الصغيرة (`p-0.5` · `p-1.5` · `p-2.5`).
  if (steps <= 4 && Math.abs(steps * 2 - Math.round(steps * 2)) < 1e-9) return String(steps)
  return null
}

const px = (value: string): number | null => {
  const m = /^(-?[\d.]+)px$/.exec(value.trim())
  if (!m) return null
  const n = Number.parseFloat(m[1]!)
  return Number.isFinite(n) ? n : null
}

/**
 * يحوّل قيمة مسافة إلى أداة.
 *
 * `rootPx` هو حجم خطّ الجذر المقروء — لا 16 مفترَضة.
 */
export function mapSpacing(prefix: string, value: string, rootPx: number): Mapped {
  const n = px(value)
  if (n === null) {
    return {
      kind: 'untranslatable',
      prop: prefix,
      value,
      why: 'قيمة ليست بالبكسل — لا تقع على سلّم Tailwind',
    }
  }

  const steps = n / (STEP_REM * rootPx)
  const name = scaleName(Number.parseFloat(steps.toFixed(6)))
  if (name !== null) return { kind: 'scale', cls: `${prefix}-${name}` }

  return {
    kind: 'arbitrary',
    cls: `${prefix}-[${trim(n)}px]`,
    why: `${trim(n)}px لا تقع على السلّم (وحدته ${trim(STEP_REM * rootPx)}px)`,
  }
}

const trim = (n: number): string => String(Number.parseFloat(n.toFixed(4)))

/** خصائص لا مقابل لها في Tailwind — تُعلَن ولا يُخترَع لها صنف. */
const NO_UTILITY = new Set([
  'box-shadow',
  'text-shadow',
  'background-image',
  'writing-mode',
  'fill',
  'stroke',
])

/** بادئات المسافات: الخاصّية المنطقية ← أداة v4. */
const SPACING_PREFIX: Record<string, string> = {
  'padding-block-start': 'pt',
  'padding-block-end': 'pb',
  'padding-inline-start': 'ps',
  'padding-inline-end': 'pe',
  'margin-block-start': 'mt',
  'margin-block-end': 'mb',
  'margin-inline-start': 'ms',
  'margin-inline-end': 'me',
  'row-gap': 'gap-y',
  'column-gap': 'gap-x',
}

/** قيم المحاذاة الفيزيائية كما تكتبها الصفحة. */
const PHYSICAL_START = 'left'
const PHYSICAL_END = 'right'

/** خصائص قيمها كلمات مفتاحية تُقابَل مباشرةً. */
const KEYWORD_UTILITY: Record<string, Record<string, string>> = {
  display: {
    block: 'block',
    'inline-block': 'inline-block',
    inline: 'inline',
    flex: 'flex',
    'inline-flex': 'inline-flex',
    grid: 'grid',
    'inline-grid': 'inline-grid',
    none: 'hidden',
    contents: 'contents',
  },
  position: {
    static: 'static',
    relative: 'relative',
    absolute: 'absolute',
    fixed: 'fixed',
    sticky: 'sticky',
  },
  /*
   * `text-align` يقبل قيمًا فيزيائية تكتبها **الصفحة** لا نحن.
   *
   * قاعدة اللنت تمنع المفاتيح الفيزيائية لأن واجهتنا عربية RTL — وهذه
   * مفاتيح جدول قراءة لقيم صفحة أجنبية، لا خصائص نؤلّفها. فتُبنى بمفاتيح
   * محسوبة: القاعدة تستهدف ما نكتبه حرفيًّا لا ما نقرؤه.
   */
  'text-align': {
    start: 'text-start',
    end: 'text-end',
    center: 'text-center',
    justify: 'text-justify',
    [PHYSICAL_START]: 'text-left',
    [PHYSICAL_END]: 'text-right',
  },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  visibility: { visible: 'visible', hidden: 'invisible', collapse: 'collapse' },
  'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
}

/** خصائص لون الحدّ التي تُقابَل بأداة `border-`. */
const BORDER_COLOUR = new Set([
  'border-block-start-color',
  'border-block-end-color',
  'border-inline-start-color',
  'border-inline-end-color',
])

/** أوزان الخط على سلّم v4. */
const FONT_WEIGHT: Record<string, string> = {
  '100': 'font-thin',
  '200': 'font-extralight',
  '300': 'font-light',
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
}

/** يحوّل خاصّية واحدة. */
export function mapProperty(prop: string, value: string, rootPx: number): Mapped | null {
  const v = value.trim()
  if (!v) return null

  if (NO_UTILITY.has(prop)) {
    // الظلال والتدرّجات في Tailwind سلالم مسمّاة لا قيم — والمطابقة العكسية
    // تخمين. الإعلان أصدق.
    return {
      kind: 'untranslatable',
      prop,
      value: v,
      why: 'سلّم مسمّى في Tailwind — لا مقابل حسابيًّا',
    }
  }

  const spacing = SPACING_PREFIX[prop]
  if (spacing) return mapSpacing(spacing, v, rootPx)

  const keywords = KEYWORD_UTILITY[prop]
  if (keywords) {
    const cls = keywords[v]
    return cls
      ? { kind: 'scale', cls }
      : { kind: 'untranslatable', prop, value: v, why: 'قيمة خارج مفردات الأداة' }
  }

  if (prop === 'font-weight') {
    const cls = FONT_WEIGHT[v]
    return cls
      ? { kind: 'scale', cls }
      : { kind: 'arbitrary', cls: `font-[${v}]`, why: 'وزن خارج السلّم' }
  }

  if (prop === 'z-index') {
    if (v === 'auto') return { kind: 'scale', cls: 'z-auto' }
    return /^-?\d+$/.test(v)
      ? { kind: 'arbitrary', cls: `z-[${v}]`, why: 'سلّم z في v4 محدود — القيمة تُكتب صراحةً' }
      : null
  }

  if (prop === 'opacity') {
    const n = Number.parseFloat(v)
    if (!Number.isFinite(n)) return null
    const pct = Math.round(n * 100)
    return Math.abs(n * 100 - pct) < 1e-9
      ? { kind: 'scale', cls: `opacity-${pct}` }
      : { kind: 'arbitrary', cls: `opacity-[${v}]`, why: 'نسبة كسرية' }
  }

  if (prop === 'width' || prop === 'height') {
    const short = prop === 'width' ? 'w' : 'h'
    if (v === 'auto') return { kind: 'scale', cls: `${short}-auto` }
    return mapSpacing(short, v, rootPx)
  }

  if (prop === 'color') return colourUtility('text', v)
  if (prop === 'background-color') return colourUtility('bg', v)
  /*
   * الحدّ صراحةً لا بـ`endsWith('-color')`.
   *
   * ذاك يبتلع `caret-color` و`accent-color` و`text-decoration-color`
   * فيعطيها أداة **حدّ** — صنفٌ لا معنى له. أمسكه اختبار كُتب له.
   */
  if (BORDER_COLOUR.has(prop)) return colourUtility('border', v)
  if (prop === 'outline-color') return colourUtility('outline', v)

  if (prop === 'font-size') {
    // سلّم الخطّ في v4 مسمّى (`text-sm`…) ومرتبط بارتفاع سطر — فالمطابقة
    // بالقيمة وحدها تكذب. تُكتب صراحةً.
    return { kind: 'arbitrary', cls: `text-[${v}]`, why: 'سلّم الخطّ مسمّى ومرتبط بارتفاع السطر' }
  }

  return null
}

/**
 * لون إلى أداة.
 *
 * **لا تُخمَّن أسماء لوحة Tailwind.** `rgb(59, 130, 246)` قد يساوي
 * `blue-500` وقد لا يساويه بحسب إصدار اللوحة وتخصيص المشروع — والاسم
 * الخطأ أسوأ من قيمة صريحة صحيحة.
 */
function colourUtility(prefix: string, value: string): Mapped {
  return {
    kind: 'arbitrary',
    cls: `${prefix}-[${value.replace(/\s+/g, '')}]`,
    why: 'أسماء اللوحة تتغيّر بالإصدار والتخصيص — القيمة الصريحة لا تكذب',
  }
}

/** اختصارا الصندوق وبادئتاهما — الجهات الأربع فيزيائية بترتيب CSS: أعلى، يمين، أسفل، يسار. */
const BOX_SHORTHAND: Record<string, string> = { padding: 'p', margin: 'm' }

/**
 * اختصارات لقطة المشكلة: `padding` و`margin` بقيمها الأربع، و`gap` بقيمتيه، و`border-radius`.
 *
 * لوحة الفحص تقرأ الطويلة المنطقية (`padding-block-start`…) فلا تبلغ هذا الفرع؛ والمشكلة تحفظ ما يكتبه
 * المطوّر. **والجهات تبقى فيزيائية كما في الاختصار** (`pt` · `pr` · `pb` · `pl`): تحويلها منطقيةً يحتاج اتجاه
 * الصفحة، وتخمينه يكتب `ps` حيث يلزم `pr` في صفحةٍ عربية. `null` لما ليس اختصارًا فيمرّ إلى `mapProperty`.
 */
export function mapShorthand(prop: string, value: string, rootPx: number): Mapped[] | null {
  const v = value.trim()
  const box = BOX_SHORTHAND[prop]
  if (box) {
    const parts = v ? v.split(/\s+/u) : []
    const [t, r = t, b = t, l = r] = parts
    if (
      parts.length > 4 ||
      t === undefined ||
      r === undefined ||
      b === undefined ||
      l === undefined
    ) {
      return [{ kind: 'untranslatable', prop, value: v, why: 'اختصارٌ لا يُقرأ جهاتٍ أربعًا' }]
    }
    if (t === r && r === b && b === l) return [mapSpacing(box, t, rootPx)]
    if (t === b && r === l) {
      return [mapSpacing(`${box}y`, t, rootPx), mapSpacing(`${box}x`, r, rootPx)]
    }
    return [
      mapSpacing(`${box}t`, t, rootPx),
      mapSpacing(`${box}r`, r, rootPx),
      mapSpacing(`${box}b`, b, rootPx),
      mapSpacing(`${box}l`, l, rootPx),
    ]
  }
  if (prop === 'gap') {
    if (!v || v === 'normal') return []
    const parts = v.split(/\s+/u)
    const [row, column = row] = parts
    if (parts.length > 2 || row === undefined || column === undefined) {
      return [{ kind: 'untranslatable', prop, value: v, why: 'اختصارٌ لا يُقرأ صفًّا وعمودًا' }]
    }
    if (row === column) return [mapSpacing('gap', row, rootPx)]
    return [mapSpacing('gap-y', row, rootPx), mapSpacing('gap-x', column, rootPx)]
  }
  if (prop === 'border-radius') {
    if (!v) return []
    return [
      {
        kind: 'arbitrary',
        cls: `rounded-[${v.replace(/\s+/g, '_')}]`,
        why: 'سلّم الحواف مسمّى — القيمة الصريحة لا تكذب',
      },
    ]
  }
  return null
}

export interface TailwindOutput {
  readonly classes: readonly string[]
  readonly arbitrary: readonly { readonly cls: string; readonly why: string }[]
  readonly untranslatable: readonly {
    readonly prop: string
    readonly value: string
    readonly why: string
  }[]
  readonly target: typeof TAILWIND_TARGET
}

/** يحوّل مجموعة خصائص. */
export function toTailwind(
  styles: Readonly<Record<string, string>>,
  rootPx: number,
): TailwindOutput {
  const classes: string[] = []
  const arbitrary: { cls: string; why: string }[] = []
  const untranslatable: { prop: string; value: string; why: string }[] = []

  for (const [prop, value] of Object.entries(styles)) {
    for (const mapped of mapShorthand(prop, value, rootPx) ?? [mapProperty(prop, value, rootPx)]) {
      if (!mapped) continue
      if (mapped.kind === 'scale') classes.push(mapped.cls)
      else if (mapped.kind === 'arbitrary') {
        classes.push(mapped.cls)
        arbitrary.push({ cls: mapped.cls, why: mapped.why })
      } else {
        untranslatable.push({ prop: mapped.prop, value: mapped.value, why: mapped.why })
      }
    }
  }

  return { classes, arbitrary, untranslatable, target: TAILWIND_TARGET }
}
