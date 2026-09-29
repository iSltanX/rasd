/**
 * تصدير لوحة الألوان — CSS Variables · JSON · Tailwind Config · نص قابل
 * للنسخ · W3C DTCG.
 *
 * `Rasd_Ar.md §6.14` ينصّ على الصيغ **الأربع** الأولى حرفيًّا، بلا أي تفصيل
 * بنيوي لأيّها: «تصدير اللوحة بصيغ: CSS Variables · JSON · Tailwind Config
 * · نص قابل للنسخ». فالبنية قرار هذا الملفّ وحده، وكل قرار فيه معلَّل أدناه
 * أو عند موضعه.
 *
 * **`dtcg` مصدرها مختلف — نصّ المرحلة 19 لا `§6.14`.** «تصديرات المطوّر:
 * CSS · JSON · Tailwind · Design Tokens (W3C)» (`Docs/Engineering.md` سطر 1250)،
 * وحُسم بناؤها صراحةً في الوحدة 19.2 («الناقص صيغة W3C DTCG وحدها»). وخلافًا
 * لـ`json` (سجلّ `rasd.*` الخاصّ، يحمل `share`/`count`/`neutral`) فـ`dtcg`
 * **مطابقة للمواصفة القياسية بلا امتداد**: `$type`/`$value` فقط، لأن غايتها
 * التشغيل البيني مع أدوات خارجية (Style Dictionary وأمثالها) لا توثيق
 * بيانات رصد الداخلية.
 *
 * **مسار تصدير كود لا مسار معلومة — وهذا يحكم القرار الأهمّ هنا.**
 * `colour/tailwind.ts` **يُسمّي** الألوان (`blue-500`) لأنه مسار معلومة
 * تُعرض في لوحة: «هذا اللون هو blue-500» جواب عن سؤال يُعرض لا يُنسَخ.
 * وهذا الملفّ **يُنسَخ فيُلصَق فيُصرَّف** — أربع صيغه كلّها تُلصَق في مكان
 * آخر حرفيًّا، وصيغة Tailwind Config منها كودٌ حقيقي يدخل بناء المستخدم.
 * فتسري عليه قاعدة `style-export/tailwind.ts` بلا استثناء: **لا تُخمَّن
 * أسماء لوحة Tailwind** لأي درجة مستخرجة. اسم المتغيّر هنا يُبنى من ترتيب
 * اللوحة نفسها (`--palette-1`…)، لا من أقرب درجة في لوحة جاهزة — فالقاعدة
 * الجامعة: **يُسمّى ما يُعرض، ولا يُسمّى ما يُنسَخ كودًا**.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { formatColour, readColour } from './formats'
import { TAILWIND_VERSION } from './tailwind-palette'

import type { ScaleStop } from './scale'
import type { PaletteSwatch } from '@/shared/messaging/contract'

export type PaletteFormat = 'css' | 'json' | 'tailwind' | 'text' | 'dtcg'

export interface ExportOptions {
  /**
   * بادئة اسم المتغيّر — **قرار 1: التسمية**.
   *
   * `--{بادئة}-{رتبة}` لا اسم لون مُخمَّن ولا فهرس صفريّ: رقمٌ بشريّ يبدأ من
   * 1 ويطابق رتبة اللون في اللوحة (الأهمّ أوّلًا، انظر قرار الترتيب أدناه).
   * والبادئة هي الإجابة عن «ماذا لو صدّر المستخدم لوحتين؟» — لا حلّ داخل
   * هذه الوحدة ممكن بلا معرفة قصد المستخدم (هل اللوحتان لمكوّنين مختلفين؟
   * لعلامتين تجاريّتين؟)، فتُرك القرار له: يمرّر بادئتين مختلفتين
   * (`brand`، `accent` مثلًا) فلا يتصادم `--brand-1` مع `--accent-1`.
   * الافتراض `'palette'` حين لا تُمرَّر.
   */
  readonly prefix?: string
}

const DEFAULT_PREFIX = 'palette'

/**
 * ينقّي بادئة تعسّفية إلى مقطع اسم متغيّر CSS صالح.
 *
 * اسم الخاصّية المخصَّصة في CSS لا يقبل كل شيء (لا مسافة ولا رمز)، وبادئة
 * غير مُنقّاة تكسر الصيغتين الوحيدتين اللتين تُنتجان CSS فعليًّا هنا (`css`
 * و`tailwind`) — وانكسار البنية في مسار **يُلصَق فيُصرَّف** أسوأ من أي عيب
 * آخر في الوحدة كلّها. فتُستبدَل كل سلسلة أحرف خارج `[A-Za-z0-9_-]` بشرطة
 * واحدة، وتُقصّ الشرطات الطرفية، ويُرَدّ الافتراضي عند فراغ الناتج.
 */
function sanitizePrefix(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || DEFAULT_PREFIX
}

/**
 * قراءة لون سديدة من قيمة سداسية — للوحة مستخرَجة أو سلّم مولَّد سواء.
 *
 * `PaletteSwatch.hex` يأتي من `formatColour().hex` داخل `palette.ts` دومًا
 * (انظر عقد `PaletteExtraction` في `contract.ts`)، و`ScaleStop.hex` من
 * `formatColour().hex` داخل `generateScale` بالمثل (`scale.ts`) — فإخفاق
 * التحليل هنا خطأ في البيانات لا في مدخل المستخدم في الحالتين، يُرمى
 * بوضوح بدل أن يُبتلع صامتًا، على نمط `prepared()` في `tailwind.ts`.
 */
function readSwatch(swatch: { readonly hex: string }) {
  const reading = readColour(swatch.hex)
  if (!reading) throw new Error(`قيمة لون غير صالحة: ${swatch.hex}`)
  return reading
}

/**
 * **قرار 2 — الترتيب: يُحفَظ كما وصل، ولا يُعاد فرزه هنا.**
 *
 * `palette.ts` يضمن وصول `entries` (ومنها `PaletteSwatch[]`) مُرتَّبةً
 * بالحصّة تنازليًّا — الترتيب معلومة لا تفصيلًا عارضًا: الأغلب أوّلًا يعني
 * أن `--{بادئة}-1` هو اللون المهيمن دائمًا، في كل صيغة. وإعادة الفرز هنا
 * ازدواج منطق لعقدٍ مضمون فعلًا من مصدره (`PaletteExtraction`، §6.14 لا
 * تذكر ترتيبًا مستقلًّا)، فالفهرس `i` أدناه هو رتبة العرض مباشرةً.
 */
function variableName(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

/**
 * CSS Variables — تصريحات فقط، بلا أي بيانات وصفية.
 *
 * **قرار 3 و4 — `neutral`/`share`/`count` لا تظهر هنا.** هذه الصيغة تُلصَق
 * في ورقة أنماط فتُصرَّف حرفيًّا؛ وبيانات وصفية كـ«حصّة 12%» ليست قيمة CSS
 * ولا مكان صريحًا لها في تصريح خاصّية. مكانها الصيغة التي **تحمل بنية بلا
 * أن تكون كودًا مصرَّفًا مباشرة** — أي JSON (قرار أدناه).
 *
 * **لوحة فارغة**: `:root {}` — قاعدة CSS صالحة بلا تصريحات، لا استثناء.
 */
/**
 * **موسَّعة لتقبل أيّ مصدرٍ يحمل `hex` — لا `PaletteSwatch` وحدها.**
 *
 * الصيغة لا تستعمل من كل مدخل غير قيمته السداسية، فتوسيع النوع إلى
 * `{hex}[]` توسيعٌ صريح بلا تغيير سلوك لمستدعيها الحاليين (`PaletteSwatch`
 * يحقّق هذا الشكل أصلًا)، ويسمح لـ`exportScale` أدناه بإعادة الدالّة نفسها
 * لا نسخها — «الدالّة نفسها لا مثيلها».
 */
function cssVariables(
  swatches: readonly { readonly hex: string }[],
  prefix: string,
  nameOf: (index: number) => string = (i) => variableName(prefix, i),
): string {
  const lines = swatches.map((s, i) => `  --${nameOf(i)}: ${s.hex};`)
  return [':root {', ...lines, '}'].join('\n')
}

/** صيغة عنصر واحد في مخرَج JSON — تحمل اسم المتغيّر نفسه فتُقرَن بمخرَج CSS. */
export interface PaletteExportSwatch {
  /** بلا `--` — لتلصَق كما هي في `var(--…)` أو تُقرأ مباشرةً. */
  readonly variable: string
  readonly hex: string
  /** حصّة اللون من البكسلات، 0..1 — بيانات وصفية، انظر قرار 4 في الترويسة. */
  readonly share: number
  readonly count: number
  /** انظر `PaletteSwatch.neutral` في `contract.ts`. */
  readonly neutral: boolean
}

/** الشكل الكامل لمخرَج JSON. */
export interface PaletteExportJson {
  readonly schema: 'rasd.palette-export/1'
  readonly prefix: string
  readonly swatches: readonly PaletteExportSwatch[]
}

/**
 * JSON — الصيغة الوحيدة التي تحمل البيانات الوصفية كاملةً.
 *
 * **قرار 3 و4 (تتمّة): JSON يُقرأ آليًّا لا يُصرَّف مباشرة**، فحمل `share`
 * و`count` و`neutral` فيه لا يُخاطر بلون خاطئ — على نقيض CSS وTailwind حيث
 * القيمة اللونية وحدها يصحّ أن تظهر. ومن يقرأ JSON قد يحتاج التمييز بين
 * لون مهيمن ولون هامشي، أو إسقاط الحياديات في عرضه هو، بلا إعادة حساب
 * التشبّع من `hex` من جديد.
 */
function jsonExport(swatches: readonly PaletteSwatch[], prefix: string): PaletteExportJson {
  return {
    schema: 'rasd.palette-export/1',
    prefix,
    swatches: swatches.map((s, i) => ({
      variable: variableName(prefix, i),
      hex: s.hex,
      share: s.share,
      count: s.count,
      neutral: s.neutral,
    })),
  }
}

/**
 * Tailwind Config — v4 حصرًا، `@theme` بـOKLCH.
 *
 * **قرار 5 — لماذا v4 لا v3.** `TAILWIND_VERSION` في `tailwind-palette.ts`
 * ثابتة على 4 في هذا المستودع (وتطابق `TAILWIND_TARGET` في
 * `style-export/tailwind.ts`)، وv4 تكتب لوحتها في `@theme` بصيغة OKLCH لا
 * ككائن JS — فإخراج v3 هنا كان سيعني صيغتين متوازيتين لخاصّية واحدة غير
 * مطلوبتين في §6.14، ويُخالف الإصدار الذي تستهدفه الوحدة الشقيقة فعلًا.
 *
 * **ولا تُسمَّى الدرجات بأسماء لوحة Tailwind الجاهزة** (انظر ترويسة
 * الملفّ): متغيّر كل لون مبنيّ من رتبته في اللوحة المستخرَجة نفسها
 * (`--color-{بادئة}-{رتبة}`)، لا من أقرب اسم كـ`blue-500` — فتسمية خاطئة
 * هنا تُصرَّف إلى صنف Tailwind يُنتج لونًا آخر في المنتج، وهي بالضبط
 * الكذبة التي يرفضها `style-export/tailwind.ts`. وبادئة `color-` قبل
 * البادئة القابلة للضبط **إلزامية لا اختيارية**: هي مجال الأسماء
 * (namespace) الذي تشترط v4 كتابته في `@theme` كي تُنتَج أدوات لونية
 * (`bg-*`/`text-*`) من المتغيّر أصلًا؛ حذفها يُبطل الغرض من الصيغة كلّها.
 *
 * والقيمة `formatColour(...).oklch` — نفس الحقل الذي تُبنى منه
 * `TailwindNaming.themeValue` في `tailwind.ts`، فمصدر تنسيق القيمة واحد
 * لا اثنان عبر الوحدة.
 */
function tailwindConfig(
  swatches: readonly { readonly hex: string }[],
  prefix: string,
  nameOf: (index: number) => string = (i) => variableName(prefix, i),
): string {
  const lines = swatches.map((s, i) => {
    const oklch = formatColour(readSwatch(s)).oklch
    return `  --color-${nameOf(i)}: ${oklch};`
  })
  // الإصدار يُعلَن تعليقًا في رأس المخرَج نفسه — القيمة من `TAILWIND_VERSION`
  // لا رقمًا مكتوبًا هنا مرّتين، فلا يُنسى تحديثه لو تغيّر مصدره يومًا.
  return [`/* Tailwind v${TAILWIND_VERSION} */`, '@theme {', ...lines, '}'].join('\n')
}

/**
 * نص قابل للنسخ — قائمة بشرية، لا كود ولا بنية آلية.
 *
 * **قرار 6 — ما الذي يميّزها عن الثلاث الأخرى؟** الثلاث الأخرى كلّها
 * تُلصَق في ملفّ من نوع محدَّد (ورقة أنماط، ملفّ JSON، إعداد Tailwind).
 * وهذه الصيغة الوحيدة التي لا وجهة كودية لها: تُنسَخ إلى محادثة، أو ملاحظة،
 * أو تقرير — فلا داعي لبناء متغيّر ولا لبنية يُفكّها محلِّل. فهي رتبة، ثم
 * القيمة السداسية (أكثر ما يُعرَف به لون في حديث بشري)، ثم حصّته المئوية
 * (رقم واحد بعد الفاصلة — يكفي للمقارنة البصرية بين درجتين ولا يُغرق
 * القارئ بدقّة زائدة)، ثم وسم «حيادي» حين ينطبق — البيانات الوصفية التي
 * يفيد ظهورها لقارئ بشري تحديدًا (لا لمصرِّف كود، ولا لمحلِّل CSS).
 *
 * **لوحة فارغة**: سلسلة فارغة — لا شيء يُنسَخ لأن لا لون وصل أصلًا.
 */
function copyText(swatches: readonly PaletteSwatch[]): string {
  return swatches
    .map((s, i) => {
      const pct = (s.share * 100).toFixed(1)
      const tag = s.neutral ? ' (حيادي)' : ''
      return `${i + 1}. ${s.hex} — ${pct}%${tag}`
    })
    .join('\n')
}

/** توكن لون واحد — `$type`/`$value` فقط، مطابقةً للمواصفة بلا امتداد. */
export interface DtcgColorToken {
  readonly $type: 'color'
  readonly $value: string
}

/** الشكل الكامل لمخرَج DTCG — كائن مسطَّح، اسم المتغيّر مفتاحًا. */
export type DtcgExport = Readonly<Record<string, DtcgColorToken>>

/**
 * W3C DTCG — مسطَّحة بلا مجموعات متداخلة، واسم المتغيّر نفسه مفتاحَ التوكن.
 *
 * **لا `share`/`count`/`neutral` هنا** — انظر ترويسة الملفّ: هذه الصيغة
 * للتشغيل البيني مع أدوات خارجية تقرأ `$type`/`$value` وحدهما، فحقلٌ زائد
 * غير معياري يخاطر بكسر محلِّلها. ومصدر القيمة `s.hex` مباشرةً كـ`cssVariables`
 * لا `readSwatch(s).oklch` — DTCG هنا سداسي كـCSS Variables لا مُحوَّل كـTailwind.
 */
function dtcgTokens(
  swatches: readonly { readonly hex: string }[],
  prefix: string,
  nameOf: (index: number) => string = (i) => variableName(prefix, i),
): DtcgExport {
  const out: Record<string, DtcgColorToken> = {}
  swatches.forEach((s, i) => {
    out[nameOf(i)] = { $type: 'color', $value: s.hex }
  })
  return out
}

/**
 * يصدّر لوحةً بصيغة واحدة من الخمس.
 *
 * **قرار 7 — لوحة فارغة (`swatches.length === 0`) لا تُرمى في أي صيغة**:
 * كل دالّة فرعية أعلاه تبني من مصفوفة فارغة بنيةً خاليةً صالحة لصيغتها
 * (`:root {}` · `{"swatches":[]}` · `@theme {}` · سلسلة فارغة · `{}`) — لا
 * حالة خاصّة إضافية هنا، لأن كل دالّة صحيحة أصلًا عند طول صفر.
 */
export function exportPalette(
  swatches: readonly PaletteSwatch[],
  format: PaletteFormat,
  options: ExportOptions = {},
): string {
  const prefix = sanitizePrefix(options.prefix)

  switch (format) {
    case 'css':
      return cssVariables(swatches, prefix)
    case 'json':
      return JSON.stringify(jsonExport(swatches, prefix), null, 2)
    case 'tailwind':
      return tailwindConfig(swatches, prefix)
    case 'text':
      return copyText(swatches)
    case 'dtcg':
      return JSON.stringify(dtcgTokens(swatches, prefix), null, 2)
  }
}

/** صيغة عنصر واحد في مخرَج JSON لسلّم — تحمل رقم الدرجة لا حصّة بكسلات. */
export interface ScaleExportStop {
  readonly variable: string
  readonly step: number
  readonly hex: string
  /** OKLCH منسَّقة مضغوطة — نفس صيغة `ScaleSampleRow.oklch` في `ScalePanel`. */
  readonly oklch: string
}

export interface ScaleExportJson {
  readonly schema: 'rasd.scale-export/1'
  readonly prefix: string
  readonly stops: readonly ScaleExportStop[]
}

/**
 * يصدّر سلّمًا مولَّدًا (`generateScale`) — لا `exportPalette` يخدمه.
 *
 * **لماذا دالّة مستقلّة لا استدعاءً لـ`exportPalette` بمدخل مُطابَق شكلًا.**
 * `PaletteSwatch` يحمل `share`/`count`/`neutral` — معنًى حقيقي لمصفوفة
 * *مُستخرَجة* من بكسلات (كم بكسلًا انتمى لهذا اللون، أهو حياديّ). وسلّمٌ
 * *مولَّد* حسابيًّا (`generateScale`) لا بكسل وراءه أصلًا: تلفيق `share: 0`
 * أو `count: 0` لكل درجة كان يكتب في مخرَج JSON بياناتٍ لا يسندها شيء —
 * «لا تدّعِ ما لا يسنده الكود» بالحرف. فحقل JSON هنا `step` الحقيقي بدل
 * ذلك، **وصيغتا CSS وTailwind وحدهما مُعاد استعمالهما** حرفيًّا
 * (`cssVariables`/`tailwindConfig`) لأنهما لا تستعملان من كل مدخل غير
 * `hex` — الحقل الوحيد المشترك فعلًا بين النوعين.
 *
 * **التسمية بالدرجة لا بالرتبة**: `--{بادئة}-{step}` (مثل `--brand-500`)
 * لا `--{بادئة}-{i+1}` كما في اللوحة المستخرَجة. لا `§6.14` ولا أي مرجع
 * بصري يحسم تسمية تصدير السلّم تحديدًا — فجوة في المصدر لا قرارًا جاهزًا.
 * واختير رقم الدرجة لأنه المعيار الفعلي لتسمية سلالم الألوان في كل نظام
 * تصميم مرجعي في هذا المستودع (`tailwind-palette.ts` نفسها: `blue-500`)،
 * خلافًا لرتبة اللوحة المستخرَجة التي تعني «الأكثر هيمنة» — مفهومٌ لا
 * ينطبق على سلّمٍ لا تنافس حصص فيه بين درجاته أصلًا.
 *
 * `text` غير مدعومة: `ScalePanel.tsx` يُسقطها عمدًا («صيغة نصّ قابل للنسخ
 * مُستبعَدة»، انظر ترويسة ذاك الملفّ) فلا مستدعٍ يطلبها هنا.
 */
export function exportScale(
  stops: readonly ScaleStop[],
  format: Exclude<PaletteFormat, 'text'>,
  options: ExportOptions = {},
): string {
  const prefix = sanitizePrefix(options.prefix)
  const nameOf = (i: number): string => `${prefix}-${String(stops[i]!.step)}`

  switch (format) {
    case 'css':
      return cssVariables(stops, prefix, nameOf)
    case 'tailwind':
      return tailwindConfig(stops, prefix, nameOf)
    case 'json': {
      const json: ScaleExportJson = {
        schema: 'rasd.scale-export/1',
        prefix,
        stops: stops.map((s, i) => ({
          variable: nameOf(i),
          step: s.step,
          hex: s.hex,
          oklch: formatColour(readSwatch(s)).oklch,
        })),
      }
      return JSON.stringify(json, null, 2)
    }
    case 'dtcg':
      return JSON.stringify(dtcgTokens(stops, prefix, nameOf), null, 2)
  }
}
