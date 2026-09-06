/**
 * «العناصر التي تستخدم هذا اللون» — مسح DOM مُجزَّأ لا يجمّد الصفحة (`§6.10`).
 *
 * المواضع الخمسة التي يفرضها النصّ حرفيًّا: **النص · الخلفية · الحدود ·
 * الأيقونات · الظلال**. وترجمتها إلى خصائص CSS في `SITE_PROPS` أدناه.
 *
 * **الحدود الأربعة كلّها تُقرأ، لا اثنان.** `INSPECT_PROPS` في
 * `shared/inspect-schema.ts` يحمل `border-block-start-color` و
 * `border-inline-start-color` فقط — وهو صحيح لغرضه (لوحة فحص تعرض ملخّصًا)،
 * وخطأ لغرضنا: لونٌ مستعمَل في الحدّ الأيمن وحده كان سيسقط من النتيجة صامتًا.
 * فقائمة هذا الملفّ مستقلّة عن تلك عمدًا.
 *
 * **ولا يمرّ المسح بـ`readInspectStyles`.** تلك تحسب لكل عنصر حكمَ موثوقية
 * (`getClientRects()` لكشف غير المخطَّط، و`getAnimations()` لكشف المتحرِّك) —
 * وهما تخطيطٌ واستعلامُ حركات لكل عنصر. على شجرة بآلاف العقد يكون ذلك ثمنًا
 * لمعلومة لا يستعملها هذا المسح أصلًا: نحن نسأل «هل هذه القيمة هي اللون؟»
 * لا «هل يُوثَق بها؟». فيُقرَأ `getComputedStyle` مباشرةً.
 *
 * **التجزئة: مُحقَنة لا مفروضة.** نصّ الخطّة يقول «`requestIdleCallback`»،
 * ولا وجود لها في المستودع كلّه اليوم (السابقة الوحيدة للعمل الطويل —
 * `content/tools/full-page.ts` — تستعمل ميزانيات زمنية صريحة و`rAF`). وهي
 * وحدها لا تكفي حارسًا: نداء الخمول قد **يُجَوَّع بلا حدّ** على صفحة مشغولة
 * فلا يكتمل المسح أبدًا. فالمُجدوِل هنا **معامل مُحقَن** (نمط `ThumbnailEncoder`
 * و`measureExtent` القائم في المشروع): الإنتاج يمرّر `requestIdleCallback`
 * **بمهلة قصوى** (`timeout`) تكسر التجويع، والاختبار يمرّر مُجدوِلًا متزامنًا
 * فيصير المسح كلّه حتميًّا بلا مؤقّتات. والوحدة لا تعرف أيّهما.
 *
 * `modules/` لا يستورد طبقات تشغيل؛ ولمس DOM هنا مشروع على سابقة
 * [`background.ts`](background.ts) في المجلّد نفسه — الصعود في الشجرة لقراءة
 * الخلفية يلمس DOM بحكم موضوعه، وهذا مثله.
 */

import { deltaE, oklabOf, type Oklab } from './distance'
import { formatColour, readColour, type ColourReading } from './formats'

/** موضع الاستعمال — الخمسة التي يسمّيها `Rasd_Ar.md §6.10` بالضبط. */
export type UsageSite = 'text' | 'background' | 'border' | 'icon' | 'shadow'

/**
 * خصائص كل موضع.
 *
 * `outline-color` تُحسَب حدًّا: هي حدٌّ بصريًّا للمستخدم وإن لم تكن كذلك في
 * صندوق CSS. و`fill`/`stroke` أيقونةً لأن SVG المضمَّن هو ما يحمل الأيقونات
 * في الواجهات الحديثة.
 */
const SITE_PROPS: Readonly<Record<UsageSite, readonly string[]>> = {
  text: ['color'],
  background: ['background-color'],
  border: [
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
  ],
  icon: ['fill', 'stroke'],
  shadow: ['box-shadow', 'text-shadow'],
}

/** كل الخصائص المقروءة، مسطّحةً — تُقرأ مرّة واحدة لكل عنصر. */
export const USAGE_PROPS: readonly string[] = Object.values(SITE_PROPS).flat()

/** الخصائص التي قد تحمل أكثر من لون داخل قيمة واحدة (طبقات ظلّ). */
const COMPOUND_PROPS = new Set(SITE_PROPS.shadow)

/**
 * عتبة المطابقة — **0.01، مسنَدة إلى قياسين مسجَّلين في `tailwind.ts`**:
 *
 *   - **أرضية الضجيج ‎0.00097‎**: لونان متطابقان تمامًا يفترقان بهذا القدر
 *     لمجرّد مرورهما بتقريب البايت (القياس منقول هناك على `red-500`). فعتبة
 *     صفرية كانت سترفض مطابقاتٍ صحيحة لفارقٍ لا وجود له بصريًّا.
 *   - **أضيق فجوة بين درجتين متجاورتين في لوحة حقيقية ‎0.0149‎**
 *     (`neutral-50`→`neutral-100`). فعتبةٌ تبلغها كانت ستدمج درجتين
 *     متجاورتين في نظام تصميم فتقول «هذا العنصر يستعمل لونك» عن عنصر يستعمل
 *     الدرجة المجاورة.
 *
 * فـ‎0.01‎ تقع بين الحدّين: أعلى من الضجيج بعشرة أضعاف، ودون أضيق فجوة
 * تصميمية. وهي **قابلة للضبط** لأن السؤال نفسه يتغيّر بالسياق: «أرِني ما
 * يشبهه» عتبةٌ أوسع من «أرِني ما هو هو».
 */
export const USAGE_DELTA = 0.01

/**
 * لونٌ مصرَّح في ورقة أنماط، بموضع تصريحه — ناتج `collectDeclaredColours`،
 * ومدخل `classifyPaletteSources` في [`sources.ts`](./sources.ts).
 *
 * يعيش هنا لا هناك لأنه **ناتج هذا الملفّ**: وضعُه في المستهلك كان يُنشئ
 * دورة استيراد بين الوحدتين لا يبرّرها شيء.
 */
export interface DeclaredColour {
  readonly colour: ColourReading
  readonly site: UsageSite
}

/** لونٌ مطابق في موضع بعينه. */
export interface UsageMatch {
  readonly site: UsageSite
  readonly property: string
  /** القيمة كما قرأها `getComputedStyle` — تُعرَض كما هي لا مُعاد تنسيقها. */
  readonly value: string
  readonly deltaE: number
}

export interface UsageHit {
  readonly element: Element
  readonly matches: readonly UsageMatch[]
  /** المواضع المتمايزة التي وقع فيها التطابق — بلا تكرار. */
  readonly sites: readonly UsageSite[]
}

/**
 * يستخرج كل ألوان قيمة مركّبة (ظلّ أو أكثر).
 *
 * `box-shadow` قد يحمل طبقات مفصولة بفواصل، وكل طبقة قد تحمل لونًا في أيّ
 * موضع منها (`0 1px 2px rgb(0 0 0 / .1)` أو `inset 0 0 0 1px #fff`). فبدل
 * محاولة تحليل نحو الظلّ كاملًا — وهو نحوٌ أوسع ممّا يلزم — تُلتقط الرموز
 * المرشَّحة للّون وتُعرَض على `readColour`: ما قرأته لون، وما ردّته `null`
 * ليس لونًا. **المحلِّل القائم هو الحَكَم، فلا نحو ثانٍ يُكتب هنا.**
 */
export function coloursInValue(value: string): ColourReading[] {
  const out: ColourReading[] = []
  // دوالّ لونية بأقواسها · سداسي · كلمات (`red`, `currentcolor`, `transparent`)
  const candidates = value.match(/[a-z]+\([^()]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+/g)
  if (!candidates) return out
  for (const token of candidates) {
    const reading = readColour(token)
    if (reading) out.push(reading)
  }
  return out
}

/**
 * يطابق قيم خصائص مقروءة سلفًا مع لون هدف — **دالّة خالصة بلا DOM**، وهي
 * التي تُختبَر عليها «المواضع الخمسة» التي يفرضها النصّ.
 */
export function matchDeclarations(
  declarations: Readonly<Record<string, string>>,
  target: Oklab,
  threshold: number = USAGE_DELTA,
): UsageMatch[] {
  const matches: UsageMatch[] = []
  for (const [site, props] of Object.entries(SITE_PROPS) as [UsageSite, readonly string[]][]) {
    for (const prop of props) {
      const value = declarations[prop]
      if (!value) continue
      const readings = COMPOUND_PROPS.has(prop)
        ? coloursInValue(value)
        : ((r) => (r ? [r] : []))(readColour(value))
      let best: number | null = null
      for (const reading of readings) {
        /*
         * الشفّاف تمامًا ليس استعمالًا للّون.
         * `border-color` لعنصر بلا حدّ يُحسَب `rgba(0,0,0,0)` في كروم —
         * فلولا هذا الشرط لطابق كلُّ عنصر في الصفحة اللونَ الأسود الشفّاف.
         */
        if (reading.alpha === 0) continue
        const d = deltaE(oklabOf(reading), target)
        if (d <= threshold && (best === null || d < best)) best = d
      }
      if (best !== null) matches.push({ site, property: prop, value, deltaE: best })
    }
  }
  return matches
}

/** يقرأ خصائص الاستعمال لعنصر واحد — نداء `getComputedStyle` واحد. */
function declarationsOf(el: Element, win: Window): Record<string, string> {
  const cs = win.getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const prop of USAGE_PROPS) out[prop] = cs.getPropertyValue(prop)
  return out
}

/** يُجدوِل شريحةً من العمل. الإنتاج يمرّر خمولًا بمهلة؛ الاختبار يمرّر متزامنًا. */
export type Scheduler = (run: () => void) => void

export interface ScanOptions {
  readonly threshold: number
  /** عدد العناصر في الشريحة الواحدة قبل التنازل عن الخيط. */
  readonly chunkSize: number
  /** جذر المسح — الوثيقة كلّها افتراضًا. */
  readonly root: ParentNode
  /** عنصرٌ يُستبعَد هو وذرّيّته — مضيف طبقتنا، فلا نجد أنفسنا. */
  readonly skip: Element | null
  readonly win: Window
  readonly schedule: Scheduler
  readonly onProgress: ((scanned: number, total: number) => void) | null
}

export interface ScanHandle {
  readonly done: Promise<readonly UsageHit[]>
  /** يوقف المسح؛ ما وُجد حتى اللحظة يُسلَّم لا يُهدَر. */
  cancel(): void
}

/**
 * حجم الشريحة الافتراضي.
 *
 * `getComputedStyle` + قراءة تسع خصائص تكلّف عشرات الميكروثواني لكل عنصر
 * (القياس المسجَّل في `modules/computed-style/read.ts`: ‎8.5–12µs‎ للمجموعة
 * المنتقاة، مقابل ‎776µs‎ لقراءة الخصائص كلّها). فمئتا عنصر تبقى في حدود
 * بضعة ميلي‌ثوانٍ — دون إطار العرض الواحد (‎16.7ms‎) بهامش مريح، وهو المعنى
 * العملي لـ«لا يجمّد الصفحة».
 */
export const CHUNK_SIZE = 200

const DEFAULT_OPTIONS: Omit<ScanOptions, 'root' | 'win'> = {
  threshold: USAGE_DELTA,
  chunkSize: CHUNK_SIZE,
  skip: null,
  schedule: (run) => {
    run()
  },
  onProgress: null,
}

/**
 * يمسح الشجرة بحثًا عن مستعملي لون، شريحةً شريحة.
 *
 * **التعداد يقع مرّة واحدة في البداية** (`querySelectorAll('*')`) لا شريحةً
 * شريحة: قائمة ثابتة تجعل التقدّم معلوم المقام (`scanned/total`)، وتحمي من
 * شجرة تتغيّر أثناء المسح فتُعيد زيارة عناصر أو تقفز فوق أخرى. وثمنها لقطة
 * ذاكرة واحدة، وهو أرخص من إعادة الاستعلام في كل شريحة.
 */
export function scanColourUsage(
  target: ColourReading,
  options: Partial<ScanOptions> & Pick<ScanOptions, 'root' | 'win'>,
): ScanHandle {
  const opts: ScanOptions = { ...DEFAULT_OPTIONS, ...options }
  const targetLab = oklabOf(target)
  const all = [...opts.root.querySelectorAll('*')].filter(
    (el) => !(opts.skip && (el === opts.skip || opts.skip.contains(el))),
  )

  const hits: UsageHit[] = []
  let index = 0
  let cancelled = false
  let settle: (value: readonly UsageHit[]) => void = () => undefined
  const done = new Promise<readonly UsageHit[]>((resolve) => {
    settle = resolve
  })

  const step = (): void => {
    if (cancelled) {
      settle(hits)
      return
    }
    const end = Math.min(index + opts.chunkSize, all.length)
    for (; index < end; index++) {
      const el = all[index]!
      const matches = matchDeclarations(declarationsOf(el, opts.win), targetLab, opts.threshold)
      if (matches.length > 0) {
        hits.push({ element: el, matches, sites: [...new Set(matches.map((m) => m.site))] })
      }
    }
    opts.onProgress?.(index, all.length)
    if (index >= all.length) {
      settle(hits)
      return
    }
    opts.schedule(step)
  }

  opts.schedule(step)

  return {
    done,
    cancel: () => {
      cancelled = true
    },
  }
}

/**
 * مُجدوِل الإنتاج — خمولٌ **بمهلة قصوى**.
 *
 * المهلة ليست تفصيلًا: بلا `timeout` قد لا يُنادى الخمول إطلاقًا على صفحة
 * مشغولة (فيديو، حركة دائمة، سكربت طرف ثالث)، فيتوقّف المسح عند شريحته
 * الأولى بلا خطأ ولا نتيجة — أسوأ أنواع الفشل: صامت. والمهلة تحوّله إلى
 * «متى تيسّر، وعلى الأكثر بعد نصف ثانية».
 *
 * ويسقط إلى `setTimeout` حيث `requestIdleCallback` غائبة (Safari قديم، أو
 * بيئة اختبار) — فالسلوك يتدهور إلى «أبطأ قليلًا» لا إلى «لا يعمل».
 */
export const IDLE_TIMEOUT_MS = 500

export function idleScheduler(win: Window): Scheduler {
  const ric = (win as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number })
    .requestIdleCallback
  if (typeof ric !== 'function') return (run) => void win.setTimeout(run, 0)
  return (run) => void ric.call(win, run, { timeout: IDLE_TIMEOUT_MS })
}

/**
 * يجمع **كل** الألوان المصرَّحة في الشجرة — أساسُ التصنيف في `§6.5`.
 *
 * **لا نسخةٌ ثانية من `scanColourUsage`**: تلك تسأل «مَن يستعمل هذا اللون؟»
 * فتحمل هدفًا وتقارن، وهذه تسأل «ما الألوان المصرَّح بها أصلًا؟» فتجمع بلا
 * هدف. لكنّهما تتقاسمان ما يمكن أن ينحرف لو كُتب مرّتين: `SITE_PROPS` وقراءة
 * التصريحات (`declarationsOf`) والتجزئة والمُجدوِل المحقون. فالمشترك مشترك
 * فعلًا، والمختلف سؤالٌ واحد لا خوارزمية.
 *
 * **والتفريد بالسلسلة المنسَّقة لا بالكائن**: `getComputedStyle` تُرجع
 * `rgb(124, 58, 237)` لكل عنصر يستعمل اللون نفسه، فألف عنصر يعطون مدخلًا
 * واحدًا. وبلا تفريد كانت القائمة تتضخّم بعدد العناصر لا بعدد الألوان،
 * فتصير المقاطعة في `classifyPaletteSources` تربيعية بلا داعٍ.
 */
export function collectDeclaredColours(
  options: Partial<Omit<ScanOptions, 'threshold'>> & Pick<ScanOptions, 'root' | 'win'>,
): { readonly done: Promise<readonly DeclaredColour[]>; cancel(): void } {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const all = [...opts.root.querySelectorAll('*')].filter(
    (el) => !(opts.skip && (el === opts.skip || opts.skip.contains(el))),
  )

  /** مفتاح التفريد: `الموضع|القيمة المنسَّقة` — لا الكائن. */
  const seen = new Set<string>()
  const found: DeclaredColour[] = []
  let index = 0
  let cancelled = false
  let settle: (value: readonly DeclaredColour[]) => void = () => undefined
  const done = new Promise<readonly DeclaredColour[]>((resolve) => {
    settle = resolve
  })

  const step = (): void => {
    if (cancelled) {
      settle(found)
      return
    }
    const end = Math.min(index + opts.chunkSize, all.length)
    for (; index < end; index++) {
      const el = all[index]!
      const declarations = declarationsOf(el, opts.win)
      for (const [site, props] of Object.entries(SITE_PROPS) as [UsageSite, readonly string[]][]) {
        for (const prop of props) {
          const raw = declarations[prop]
          if (!raw) continue
          for (const colour of COMPOUND_PROPS.has(prop) ? coloursInValue(raw) : readOne(raw)) {
            // الشفّاف تمامًا ليس لونًا مصرَّحًا بل غيابه — و`transparent`
            // تُقرأ `rgba(0,0,0,0)` فتُصنَّف سوادًا لو مرّت.
            if (colour.alpha === 0) continue
            const key = `${site}|${formatColour(colour).hex}`
            if (seen.has(key)) continue
            seen.add(key)
            found.push({ colour, site })
          }
        }
      }
    }
    opts.onProgress?.(index, all.length)
    if (index >= all.length) {
      settle(found)
      return
    }
    opts.schedule(step)
  }

  opts.schedule(step)

  return {
    done,
    cancel: () => {
      cancelled = true
    },
  }
}

/** قراءةٌ مفردة كمصفوفة — يوحّد الشكل مع `coloursInValue` بلا تفريع. */
function readOne(value: string): ColourReading[] {
  const reading = readColour(value)
  return reading ? [reading] : []
}
