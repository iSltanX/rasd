/**
 * استخراج لوحة ألوان من بكسلات — تجميع عنقودي خالص، بلا قماش ولا شبكة.
 *
 * **الخوارزمية: median-cut في OKLab، لا k-means.** الخطّة تُخيِّر بينهما
 * (`§14`)، واختبارها يفرض شرطًا واحدًا: «نتائج ثابتة (deterministic) عند
 * البذرة نفسها». و**median-cut يفي بالشرط أقوى ممّا يطلبه**: لا بذرة فيه
 * أصلًا — لا تهيئة عشوائية ولا تكرار حتى الاستقرار، بل قسمة حتمية للصندوق
 * على محوره الأطول عند الوسيط. فالنتيجة واحدة للمدخل الواحد **دائمًا**، لا
 * «واحدة لكل بذرة». وk-means كان سيشتري جودة عناقيد أفضل قليلًا بثمن
 * لا-حتمية تُدار ببذرة مُمرَّرة، وتكرارٍ غير مقيَّد الزمن على 12 مليون بكسل.
 *
 * **وفي OKLab لا sRGB.** median-cut الكلاسيكي (Heckbert 1982) يقسم مكعّب
 * RGB، و«المحور الأطول» فيه لا يعني شيئًا إدراكيًّا: مدى الأزرق الرقمي
 * يساوي مدى الأخضر عددًا ويقلّ عنه رؤيةً بكثير. وOKLab مبنيّ ليكون البُعد
 * فيه تقريبًا للفرق المُدرَك (انظر [`distance.ts`](distance.ts))، فالقسمة
 * على محوره الأطول تفصل ما تفصله العين.
 *
 * **مرّتان: عيّنة ثم صقل** (نصّ الخطّة حرفيًّا: «على عيّنة منخفضة الدقة
 * (سرعة)، ثم تحسين على الدقة الكاملة للألوان المرشّحة»). المرّة الأولى
 * تعنقد عيّنة مُخطّاة، والثانية تعيد حساب مركز كل عنقود من **كل** بكسلات
 * الصورة المنتمية إليه. فالسرعة من الأولى والدقّة من الثانية.
 *
 * **والتخطّي حتميّ لا عشوائي**: خطوة ثابتة محسوبة من حجم الصورة، لا
 * `Math.random()`. عيّنة عشوائية كانت ستُعيد الّلا-حتمية من الباب الذي
 * أُغلق باختيار median-cut.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — يُستدعى من الـservice worker
 * ([ADR 0017](../../../Docs/ADR/0017-palette-extraction-host.md)) بعد أن
 * يفكّ البكسلات بـ`OffscreenCanvas`.
 */

import { deltaE, oklabOfBytes, type Oklab } from './distance'
import { fromPixel, type ColourReading } from './formats'

/** صورة بكسلية مسطّحة RGBA — نفس شكل `ImageData` بلا الارتباط بالـDOM. */
export interface PixelSource {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface PaletteEntry {
  /** لون العنقود — مركزه محسوبًا على الدقّة الكاملة. */
  readonly colour: ColourReading
  /** عدد البكسلات المعتمة التي انتمت إليه في الدقّة الكاملة. */
  readonly count: number
  /** حصّته من البكسلات المحسوبة، 0..1. */
  readonly share: number
  /** `true` إن كان تشبّعه دون عتبة الحياد — يُخفى حين يُطلب ذلك (`§6.3`). */
  readonly neutral: boolean
}

export interface PaletteResult {
  readonly entries: readonly PaletteEntry[]
  /** البكسلات المعتمة التي دخلت الحساب فعلًا (بعد إسقاط الشفّاف). */
  readonly countedPixels: number
  /** عدد البكسلات في العيّنة الأولى — للإفصاح عن أن الحساب لم يمرّ على الكلّ. */
  readonly sampledPixels: number
  /** عناقيد أُسقطت لأنها حيادية، حين `dropNeutrals` — لا تُخفى بصمت. */
  readonly droppedNeutrals: number
}

export interface PaletteOptions {
  /** عدد الألوان المطلوب (`§6.2`: 5 · 8 · 12 · مخصَّص). */
  readonly count: number
  /** يُسقط الحياديات من الناتج بدل وسمها فقط (`§6.3`). */
  readonly dropNeutrals: boolean
  /** عتبة التشبّع التي دونها يُعدّ اللون حياديًّا. */
  readonly neutralChroma: number
  /** أقصى عدد بكسلات في عيّنة المرّة الأولى. */
  readonly sampleTarget: number
  /** ألفا التي دونها يُهمَل البكسل — الشفّاف لا لون له يُعتدّ به. */
  readonly minAlpha: number
}

/**
 * عتبة الحياد — **0.03، مقيسة من نظام رصد نفسه لا مُقدَّرة**.
 *
 * `Rasd_Ar.md §6.3` يطلب إخفاء «الأبيض والأسود والرماديات ودرجات الخلفيات
 * المحايدة» ولا يذكر رقمًا واحدًا. والرقم هنا مأخوذ من `tokens.css`:
 *
 *   - سلّم **`ink`** — وهو سلّم الحياديات في نظام رصد — أقصى تشبّع فيه
 *     **0.0299** (عند الدرجة 500). أي أن هذا النظام نفسه يسمّي كلّ ما دون
 *     هذا الحدّ «حياديًّا» ويشحنه كذلك.
 *   - وأقلّ العائلات اللونية تشبّعًا (`signal`) تبلغ **0.1607**.
 *
 * فبين أعلى حيادي وأدنى ملوَّن فجوة تزيد على خمسة أضعاف، والعتبة تقع عند
 * سقف الحياديات لا في منتصف الفراغ اعتباطًا: **ما لا يزيد تشبّعًا على أكثر
 * رماديات رصد تشبّعًا، حياديٌّ بحكم النظام الذي يعرضه**.
 *
 * والأبيض والأسود الخالصان (`c = 0`) داخلان بداهةً — فالبند الصريح مُغطًّى
 * بلا حاجة إلى حدٍّ ثانٍ على الإضاءة.
 */
export const NEUTRAL_CHROMA = 0.03

/**
 * سقف عيّنة المرّة الأولى — 65,536 بكسل (256×256 مكافئًا).
 *
 * ليس رقمًا مستديرًا لذاته: median-cut يقسم حتى `count` عنقودًا، وكلفته
 * تُهيمن عليها الفرزات داخل الصناديق (`O(n log n)` لكل قسمة). و65,536 يبقي
 * المرّة الأولى في حدود ميلي‌ثوانٍ معدودة حتى على لقطة صفحة كاملة
 * (4000×3000 = 12 مليون بكسل، أي تخطٍّ بخطوة ≈ 13)، ويبقى وفيرًا لتمثيل
 * توزيع الألوان: لوحةٌ من 12 لونًا تُبنى على أكثر من خمسة آلاف بكسل للعنقود.
 * والدقّة لا تُشترى هنا أصلًا — المرّة الثانية تعيد المراكز من الدقّة الكاملة.
 */
export const SAMPLE_TARGET = 65_536

export const DEFAULT_PALETTE_OPTIONS: PaletteOptions = {
  count: 8,
  dropNeutrals: false,
  neutralChroma: NEUTRAL_CHROMA,
  sampleTarget: SAMPLE_TARGET,
  minAlpha: 128,
}

/** بكسل معنقَد: إحداثياته الإدراكية وبايتاته الأصلية. */
interface Sample {
  readonly lab: Oklab
  readonly r: number
  readonly g: number
  readonly b: number
}

interface Box {
  readonly samples: Sample[]
  /** أطول محور وامتداده — يُحسب مرّة عند البناء لا عند كل مقارنة. */
  readonly axis: 'l' | 'a' | 'b'
  readonly extent: number
}

/** يبني صندوقًا ويحسب محوره الأطول — الأساس الذي تُختار عليه القسمة التالية. */
function boxOf(samples: Sample[]): Box {
  let lMin = Infinity
  let lMax = -Infinity
  let aMin = Infinity
  let aMax = -Infinity
  let bMin = Infinity
  let bMax = -Infinity
  for (const s of samples) {
    if (s.lab.l < lMin) lMin = s.lab.l
    if (s.lab.l > lMax) lMax = s.lab.l
    if (s.lab.a < aMin) aMin = s.lab.a
    if (s.lab.a > aMax) aMax = s.lab.a
    if (s.lab.b < bMin) bMin = s.lab.b
    if (s.lab.b > bMax) bMax = s.lab.b
  }
  const dl = lMax - lMin
  const da = aMax - aMin
  const db = bMax - bMin
  /*
   * **الترجيح غائب عمدًا.** بعض تطبيقات median-cut ترجّح المحاور (لأن قنوات
   * RGB غير متكافئة إدراكيًّا). وOKLab متكافئ المحاور بحكم بنائه — وهو سبب
   * اختياره هنا أصلًا — فالترجيح كان سيُفسد ما جاء الفضاء ليُصلحه.
   */
  if (dl >= da && dl >= db) return { samples, axis: 'l', extent: dl }
  if (da >= db) return { samples, axis: 'a', extent: da }
  return { samples, axis: 'b', extent: db }
}

/**
 * يقسم صندوقًا عند **وسيط** محوره الأطول.
 *
 * الوسيط لا المتوسّط: المتوسّط ينجرف مع لون واحد شاذّ فيُنتج صندوقًا شبه
 * فارغ وآخر يحمل كل شيء، والوسيط يقسم العدد نصفين دائمًا مهما كان التوزيع.
 * وهذا هو معنى الاسم — `median`-cut.
 */
function split(box: Box): [Box, Box] | null {
  if (box.samples.length < 2) return null
  const axis = box.axis
  const sorted = [...box.samples].sort((x, y) => x.lab[axis] - y.lab[axis])
  const mid = sorted.length >> 1
  const left = sorted.slice(0, mid)
  const right = sorted.slice(mid)
  if (left.length === 0 || right.length === 0) return null
  return [boxOf(left), boxOf(right)]
}

/** يخطو على البكسلات بخطوة حتمية ويُسقط الشفّاف. */
function sample(src: PixelSource, target: number, minAlpha: number): Sample[] {
  const total = src.width * src.height
  const step = Math.max(1, Math.floor(total / Math.max(1, target)))
  const out: Sample[] = []
  for (let i = 0; i < total; i += step) {
    const p = i * 4
    const a = src.data[p + 3] ?? 0
    if (a < minAlpha) continue
    const r = src.data[p] ?? 0
    const g = src.data[p + 1] ?? 0
    const b = src.data[p + 2] ?? 0
    out.push({ lab: oklabOfBytes(r, g, b), r, g, b })
  }
  return out
}

/**
 * يستخرج لوحة من بكسلات.
 *
 * يُرجع لوحةً بعدد `count` أو أقلّ — أقلّ حين لا تكفي الألوان المتمايزة في
 * الصورة (صورة من لونين لا تُنتج ثمانية مهما طُلبت)، ولا تُختلَق ألوان
 * لملء العدد.
 */
export function extractPalette(
  src: PixelSource,
  options: Partial<PaletteOptions> = {},
): PaletteResult {
  const opts: PaletteOptions = { ...DEFAULT_PALETTE_OPTIONS, ...options }
  const wanted = Math.max(1, Math.floor(opts.count))

  const samples = sample(src, opts.sampleTarget, opts.minAlpha)
  if (samples.length === 0) {
    return { entries: [], countedPixels: 0, sampledPixels: 0, droppedNeutrals: 0 }
  }

  // ── المرّة الأولى: قسمة حتمية حتى العدد المطلوب ────────────────
  let boxes: Box[] = [boxOf(samples)]
  while (boxes.length < wanted) {
    /*
     * يُقسَم الصندوق **الأوسع امتدادًا** لا الأكثر بكسلات: الهدف تمييز
     * ألوان لا موازنة أحجام. مساحةٌ شاسعة من تدرّج واحد تستحقّ القسمة أكثر
     * من كتلة ضخمة من لون واحد بالضبط — وتلك الكتلة امتدادها صفر أصلًا.
     */
    let target = -1
    let best = 0
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!
      if (b.samples.length > 1 && b.extent > best) {
        best = b.extent
        target = i
      }
    }
    if (target < 0) break // كل الصناديق أحادية اللون — لا قسمة ممكنة
    const parts = split(boxes[target]!)
    if (!parts) break
    boxes = [...boxes.slice(0, target), ...parts, ...boxes.slice(target + 1)]
  }

  // ── المرّة الثانية: مراكز من الدقّة الكاملة ────────────────────
  const centres = boxes.map((b) => centreOf(b.samples))
  const totals = centres.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
  const total = src.width * src.height
  let counted = 0
  for (let i = 0; i < total; i++) {
    const p = i * 4
    if ((src.data[p + 3] ?? 0) < opts.minAlpha) continue
    const r = src.data[p] ?? 0
    const g = src.data[p + 1] ?? 0
    const b = src.data[p + 2] ?? 0
    const lab = oklabOfBytes(r, g, b)
    let nearest = 0
    let nearestD = Infinity
    for (let c = 0; c < centres.length; c++) {
      const d = deltaE(lab, centres[c]!)
      if (d < nearestD) {
        nearestD = d
        nearest = c
      }
    }
    const acc = totals[nearest]!
    acc.r += r
    acc.g += g
    acc.b += b
    acc.n++
    counted++
  }

  const entries: PaletteEntry[] = []
  let dropped = 0
  for (const acc of totals) {
    if (acc.n === 0) continue // عنقود لم ينتمِ إليه بكسل في الدقّة الكاملة
    const colour = fromPixel(
      Math.round(acc.r / acc.n),
      Math.round(acc.g / acc.n),
      Math.round(acc.b / acc.n),
    )
    const neutral = colour.oklch.c <= opts.neutralChroma
    if (neutral && opts.dropNeutrals) {
      dropped++
      continue
    }
    entries.push({
      colour,
      count: acc.n,
      share: counted === 0 ? 0 : acc.n / counted,
      neutral,
    })
  }

  /*
   * الترتيب بالحصّة تنازليًّا — وعند التعادل بالإضاءة، فالترتيب حتميّ تمامًا
   * ولا يتبع ترتيب الصناديق العارض. لوحةٌ تتغيّر ترتيبًا بين تشغيلين على
   * المدخل نفسه تنقض شرط الحتمية ولو كانت ألوانها هي هي.
   */
  entries.sort((x, y) => y.count - x.count || x.colour.oklch.l - y.colour.oklch.l)

  return {
    entries,
    countedPixels: counted,
    sampledPixels: samples.length,
    droppedNeutrals: dropped,
  }
}

/** مركز مجموعة عيّنات في OKLab — للمقارنة في المرّة الثانية. */
function centreOf(samples: readonly Sample[]): Oklab {
  let l = 0
  let a = 0
  let b = 0
  for (const s of samples) {
    l += s.lab.l
    a += s.lab.a
    b += s.lab.b
  }
  const n = Math.max(1, samples.length)
  return { l: l / n, a: a / n, b: b / n }
}
