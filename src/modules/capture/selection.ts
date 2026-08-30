/**
 * هندسة التحديد — النواة الرياضية لأداة «تصوير منطقة».
 *
 * منطق خالص: يستقبل نقاطًا ومستطيلات في فضاء واحد ويُرجع مستطيلًا، بلا DOM
 * وبلا `chrome.*` وبلا حالة. كل ما يمكن أن ينكسر هنا ينكسر في اختبار وحدة
 * لا في متصفّح — وهو المطلوب: أخطاء القصّ تظهر متأخّرة وبانحراف صغير يصعب
 * ربطه بسببه.
 *
 * **الفضاء واحد داخل النداء، ومعمَّم عبر النداءات.** كل دالّة تعمل في فضاء
 * واحد وتُرجعه كما استقبلته (`<S extends Space>`)، ولا تختار فضاءً بنفسها.
 * أداة «تصوير منطقة» تستدعيها في `viewport` (فضاء المؤشِّر والرسم)،
 * والتحويل إلى `device` للقصّ يحدث مرّة واحدة عند الالتقاط عبر
 * `viewportRectToDevice`. خلط الفضاءين داخل نداء واحد يعطي تحديدًا يبدو
 * صحيحًا على الشاشة ومقصوصًا خطأً في الملفّ — و`NoInfer` على المعامل الثاني
 * هو ما يمنعه وقت الترجمة.
 *
 * **ولماذا عُمِّمت في المرحلة 15:** الاقتصاص في المحرر «بمقابض ونسب جاهزة»
 * هو هذه الهندسة حرفًا بحرف — المقابض الثمانية، وتثبيت النسبة، والانقلاب،
 * والحصر — لكن على مستطيل بفضاء **الجهاز** (اللقطة تُحفَظ بدقّة الجهاز بلا
 * إعادة تحجيم). ونصّ المرحلة يمنع كتابة الهندسة مرّتين. والوسم مزدوج وقت
 * التشغيل، فتمرير `DeviceRect` إلى توقيع مثبَّت على `viewport` **خطأ ترجمة
 * لا تحذير** — أي أن التعميم شرط استعمال لا تحسين أسلوب.
 *
 * `modules/` لا يستورد من `ui/` — تُفرض آليًا.
 */

import {
  normalizeRect,
  pointIn,
  rectIn,
  type Point,
  type Rect,
  type Space,
} from '@/shared/geometry'

/**
 * أصغر تحديد قابل للالتقاط، بالبكسل المنطقي.
 *
 * دونه لا يُعدّ سحبًا بل نقرة: التقاط 2×2 بكسل ليس ما أراده المستخدم، وتركه
 * ممكنًا يعني أن كل نقرة عابرة على الصفحة تُنتج لقطة عديمة المعنى في المكتبة.
 */
export const MIN_SELECTION = 8

/** النسب الجاهزة، مع «مخصَّص» الذي يعني: لا تثبيت. */
export const ASPECT_PRESETS = [
  { id: 'free', label: 'حرّ', ratio: null },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: '1:1', ratio: 1 },
] as const

export type AspectPresetId = (typeof ASPECT_PRESETS)[number]['id']

/** مقابض تغيير الحجم الثمانية — أربع زوايا وأربعة منتصفات. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type Handle = (typeof HANDLES)[number]

/**
 * أي حافّة يحرّكها كل مقبض.
 *
 * المستطيل يُمثَّل بحوافّه الأربع (`x1,y1,x2,y2`) لا بأصله ومقاسه: المقبض
 * يحرّك حافّة أو حافّتين ويترك المقابل ثابتًا، وهي عملية على الحوافّ
 * مباشرةً. التمثيل بالأصل والمقاس يجعل كل مقبض حالة خاصة.
 */
const HANDLE_EDGES: Record<Handle, { readonly x?: 'x1' | 'x2'; readonly y?: 'y1' | 'y2' }> = {
  nw: { x: 'x1', y: 'y1' },
  n: { y: 'y1' },
  ne: { x: 'x2', y: 'y1' },
  e: { x: 'x2' },
  se: { x: 'x2', y: 'y2' },
  s: { y: 'y2' },
  sw: { x: 'x1', y: 'y2' },
  w: { x: 'x1' },
}

/** المقبض المقابل — مرساة تثبيت النسبة أثناء سحب مقبض. */
const OPPOSITE: Record<Handle, Handle> = {
  nw: 'se',
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
}

/** حوافّ المستطيل — تمثيل داخلي يجعل عمليات المقابض تفاضلية لا حالات خاصة. */
interface Edges {
  x1: number
  y1: number
  x2: number
  y2: number
}

const toEdges = <S extends Space>(r: Rect<S>): Edges => ({
  x1: r.x,
  y1: r.y,
  x2: r.x + r.width,
  y2: r.y + r.height,
})

/**
 * حوافّ → مستطيل، مع تصحيح الانقلاب.
 *
 * سحب مقبض عبر الحافّة المقابلة يقلب الإشارة. التصحيح هنا بدل منع الانقلاب
 * يجعل السلوك مطابقًا لأدوات التصميم: المستطيل ينقلب ويستمرّ السحب، ولا
 * «يلتصق» المقبض عند الصفر.
 */
const fromEdges = <S extends Space>(space: S, e: Edges): Rect<S> =>
  rectIn(
    space,

    Math.min(e.x1, e.x2),
    Math.min(e.y1, e.y2),
    Math.abs(e.x2 - e.x1),
    Math.abs(e.y2 - e.y1),
  )

/** مركز مستطيل. */
export function centerOf<S extends Space>(r: Rect<S>): Point<S> {
  return pointIn(r.space, r.x + r.width / 2, r.y + r.height / 2)
}

/** موضع مقبض بعينه على المستطيل — تستعمله الواجهة لرسم المقابض. */
export function handlePoint<S extends Space>(r: Rect<S>, handle: Handle): Point<S> {
  const e = toEdges(r)
  const spec = HANDLE_EDGES[handle]
  const x = spec.x === 'x1' ? e.x1 : spec.x === 'x2' ? e.x2 : (e.x1 + e.x2) / 2
  const y = spec.y === 'y1' ? e.y1 : spec.y === 'y2' ? e.y2 : (e.y1 + e.y2) / 2
  return pointIn(r.space, x, y)
}

// ─────────────────────────────────────────────────────────────────
// تثبيت النسبة
// ─────────────────────────────────────────────────────────────────

/**
 * أبعاد تحترم نسبة، من امتدادين مطلقين.
 *
 * **البُعد المهيمن يقود.** لو قاد العرض دائمًا لانكمش التحديد فجأة حين يسحب
 * المستخدم رأسيًا أكثر منه أفقيًا. المقارنة `absW / absH > ratio` تختار البُعد
 * الذي تجاوز النسبة فتجعله المرجع، فيبقى المؤشِّر دائمًا داخل المستطيل أو
 * على حافّته — وهو ما يجعل السحب يبدو «لاصقًا» بالمؤشِّر لا مستقلًّا عنه.
 *
 * القسمة على صفر مستحيلة: `absH === 0` يجعل الشرط `Infinity > ratio` صحيحًا
 * فيؤخذ الفرع الأوّل الذي لا يقسم على `absH`.
 */
function fitRatio(absW: number, absH: number, ratio: number): { w: number; h: number } {
  return absW / absH > ratio ? { w: absW, h: absW / ratio } : { w: absH * ratio, h: absH }
}

// ─────────────────────────────────────────────────────────────────
// السحب الابتدائي
// ─────────────────────────────────────────────────────────────────

export interface DrawOptions {
  /** نسبة مثبَّتة (`⇧` أو نسبة جاهزة)؛ `null` يعني حرّ. */
  readonly ratio?: number | null
  /** الرسم من المركز (`⌥`) بدل الرسم من الركن. */
  readonly fromCenter?: boolean
}

/**
 * مستطيل من مرساة ومؤشِّر — السحب الابتدائي.
 *
 * يغطّي الاتجاهات الأربعة بلا حالات خاصة: الإشارة تُستخرَج من الفرق، والمقاس
 * من قيمته المطلقة، ثم يُبنى الأصل من الاثنين. `normalizeRect` تكفي في الحالة
 * الحرّة وحدها؛ مع النسبة يجب حساب المقاس أوّلًا ثم اشتقاق الأصل منه، وإلا
 * انزاح المستطيل عن المرساة عند السحب لأعلى أو لليسار.
 */
export function drawRect<S extends Space>(
  anchor: Point<S>,
  pointer: Point<NoInfer<S>>,
  options: DrawOptions = {},
): Rect<S> {
  const space = anchor.space
  const { ratio = null, fromCenter = false } = options

  const dx = pointer.x - anchor.x
  const dy = pointer.y - anchor.y

  if (fromCenter) {
    // المرساة هي المركز: الامتداد نصف المقاس في كل اتجاه.
    const half = ratio
      ? fitRatio(Math.abs(dx), Math.abs(dy), ratio)
      : { w: Math.abs(dx), h: Math.abs(dy) }
    return rectIn(space, anchor.x - half.w, anchor.y - half.h, half.w * 2, half.h * 2)
  }

  if (!ratio) return normalizeRect(anchor, pointer)

  const { w, h } = fitRatio(Math.abs(dx), Math.abs(dy), ratio)
  // الإشارة تحدّد أي جهة من المرساة يمتدّ إليها المستطيل. `dx === 0` يُعامَل
  // كموجب: عرضه صفر أصلًا فلا فرق بصريًّا، والاتّساق أهمّ من الحالة الحدّية.
  const x = dx >= 0 ? anchor.x : anchor.x - w
  const y = dy >= 0 ? anchor.y : anchor.y - h
  return rectIn(space, x, y, w, h)
}

// ─────────────────────────────────────────────────────────────────
// سحب المقابض
// ─────────────────────────────────────────────────────────────────

/**
 * مستطيل بعد سحب مقبض إلى نقطة.
 *
 * **بلا نسبة:** المقبض يكتب إحداثيات المؤشِّر في الحافّة (أو الحافّتين) التي
 * يملكها، ويترك البقيّة. `fromEdges` تصحّح الانقلاب.
 *
 * **مع نسبة:** المرساة هي المقبض المقابل، فتصير العملية سحبًا ابتدائيًا من
 * تلك المرساة — وهذا يجعل مقابض الزوايا صحيحة تلقائيًا. مقابض المنتصفات
 * (`n`·`s`·`e`·`w`) تملك محورًا واحدًا، فالمحور الآخر ينمو **متمركزًا** على
 * الحافّة المقابلة: هذا سلوك أدوات التصميم، وبديله (النمو من ركن) يجعل
 * المستطيل يقفز جانبيًا عند أوّل تحريك.
 */
export function resizeRect<S extends Space>(
  rect: Rect<S>,
  handle: Handle,
  pointer: Point<NoInfer<S>>,
  options: DrawOptions = {},
): Rect<S> {
  const space = rect.space
  const { ratio = null } = options
  const spec = HANDLE_EDGES[handle]

  if (!ratio) {
    const e = toEdges(rect)
    if (spec.x) e[spec.x] = pointer.x
    if (spec.y) e[spec.y] = pointer.y
    return fromEdges(space, e)
  }

  const anchor = handlePoint(rect, OPPOSITE[handle])

  // مقبض زاوية: يملك المحورين، فهو سحب ابتدائي من الركن المقابل.
  if (spec.x && spec.y) return drawRect(anchor, pointer, { ratio })

  const e = toEdges(rect)

  // مقبض أفقي (`e`/`w`): العرض يتبع المؤشِّر، والارتفاع يُشتقّ ويتمركز.
  if (spec.x) {
    const w = Math.abs(pointer.x - anchor.x)
    const h = w / ratio
    const cy = (e.y1 + e.y2) / 2
    const x = pointer.x >= anchor.x ? anchor.x : anchor.x - w
    return rectIn(space, x, cy - h / 2, w, h)
  }

  // مقبض رأسي (`n`/`s`): بالعكس.
  const h = Math.abs(pointer.y - anchor.y)
  const w = h * ratio
  const cx = (e.x1 + e.x2) / 2
  const y = pointer.y >= anchor.y ? anchor.y : anchor.y - h
  return rectIn(space, cx - w / 2, y, w, h)
}

// ─────────────────────────────────────────────────────────────────
// التحريك
// ─────────────────────────────────────────────────────────────────

/** يزيح المستطيل بلا تغيير مقاسه. */
export function moveRect<S extends Space>(rect: Rect<S>, dx: number, dy: number): Rect<S> {
  return rectIn(rect.space, rect.x + dx, rect.y + dy, rect.width, rect.height)
}

// ─────────────────────────────────────────────────────────────────
// حلّ السحب الحيّ — الحصر مرساةً لا زاوية عليا
// ─────────────────────────────────────────────────────────────────

/** يحصر نقطة داخل مستطيل. */
function clampPoint<S extends Space>(p: Point<S>, b: Rect<NoInfer<S>>): Point<S> {
  return pointIn(
    p.space,

    Math.min(Math.max(p.x, b.x), b.x + b.width),
    Math.min(Math.max(p.y, b.y), b.y + b.height),
  )
}

/**
 * يحلّ سحبًا حيًّا **ويحصره حول المرساة**.
 *
 * **لماذا لا يكفي `clampRect`/`clampRatioRect` هنا:** كلاهما يعمل على مستطيل
 * جاهز، ويحصره بإزاحته أو بتصغيره حول زاويته العليا اليسرى. وفي سحب إلى
 * أعلى أو إلى اليسار تكون تلك الزاوية هي **المؤشِّر** لا المرساة — فالتصغير
 * يزحزح المستطيل عن النقطة التي أمسكها المستخدم، ويبدو كأنه ينزلق من تحت
 * يده. والأسوأ: الإطار التالي يعيد الحلّ من المرساة الأصلية فيرتدّ المستطيل،
 * فيرتجف بتردّد الإطار وترفّ رقاقة النسبة بين قيمتين.
 *
 * الحلّ هنا يقلب الترتيب: يُحصر **المؤشِّر** أوّلًا، ثم تُحسب المساحة المتاحة
 * من المرساة في اتجاه السحب، ثم يُصغَّر المقاس داخلها بمعامل واحد يحفظ
 * النسبة. المرساة لا تتحرّك أبدًا، فلا انزلاق ولا ارتجاف.
 */
export function solveDrag<S extends Space>(
  anchor: Point<S>,
  pointer: Point<NoInfer<S>>,
  bounds: Rect<NoInfer<S>>,
  options: DrawOptions = {},
): Rect<S> {
  const space = anchor.space
  const { ratio = null, fromCenter = false } = options
  const p = clampPoint(pointer, bounds)
  const solved = drawRect(anchor, p, options)

  // المساحة المتاحة من المرساة، في اتجاه السحب وحده.
  const dx = p.x - anchor.x
  const dy = p.y - anchor.y
  const maxW = fromCenter
    ? Math.min(anchor.x - bounds.x, bounds.x + bounds.width - anchor.x) * 2
    : dx >= 0
      ? bounds.x + bounds.width - anchor.x
      : anchor.x - bounds.x
  const maxH = fromCenter
    ? Math.min(anchor.y - bounds.y, bounds.y + bounds.height - anchor.y) * 2
    : dy >= 0
      ? bounds.y + bounds.height - anchor.y
      : anchor.y - bounds.y

  if (solved.width <= maxW && solved.height <= maxH) return solved

  // معامل واحد على المحورين: تصغير محور واحد يكسر النسبة التي طلبها المستخدم.
  const scale = Math.min(
    solved.width > 0 ? maxW / solved.width : 1,
    solved.height > 0 ? maxH / solved.height : 1,
  )
  const w = solved.width * Math.max(0, scale)
  const h = ratio ? w / ratio : solved.height * Math.max(0, scale)

  if (fromCenter) return rectIn(space, anchor.x - w / 2, anchor.y - h / 2, w, h)
  return rectIn(space, dx >= 0 ? anchor.x : anchor.x - w, dy >= 0 ? anchor.y : anchor.y - h, w, h)
}

// ─────────────────────────────────────────────────────────────────
// الحصر داخل النافذة
// ─────────────────────────────────────────────────────────────────

/**
 * يحصر المستطيل داخل الحدود **بالإزاحة أوّلًا**.
 *
 * الترتيب مقصود: مستطيل خرج جزئيًا يُعاد إلى الداخل بلا تغيير مقاسه، ولا
 * يُقصّ إلا إن كان أكبر من الحدود أصلًا. القصّ أوّلًا يعني أن تحريك تحديد
 * إلى حافّة الشاشة يُنقصه تدريجيًا — وهو سلوك يفقد المستخدم عمله بلا سبب.
 */
export function clampRect<S extends Space>(rect: Rect<S>, bounds: Rect<NoInfer<S>>): Rect<S> {
  const width = Math.min(rect.width, bounds.width)
  const height = Math.min(rect.height, bounds.height)
  const maxX = bounds.x + bounds.width - width
  const maxY = bounds.y + bounds.height - height
  return rectIn(
    rect.space,
    Math.min(Math.max(rect.x, bounds.x), maxX),
    Math.min(Math.max(rect.y, bounds.y), maxY),
    width,
    height,
  )
}

/**
 * يحصر مع **حفظ النسبة** — للمستطيل الساكن وحده.
 *
 * يُصغِّر حول الزاوية العليا اليسرى ثم يُزيح إلى الداخل. يصلح لإعادة ملاءمة
 * تحديد **قائم** بعد تغيّر مقاس النافذة أو كثافة البكسل، حيث لا مرساة تُحفَظ.
 *
 * **لا يُستعمل أثناء سحب حيّ** — انظر `solveDrag` وتعليقها: الزاوية العليا
 * ليست المرساة في نصف اتجاهات السحب.
 */
export function clampRatioRect<S extends Space>(
  rect: Rect<S>,
  bounds: Rect<NoInfer<S>>,
  ratio: number,
): Rect<S> {
  const space = rect.space
  const scale = Math.min(1, bounds.width / rect.width, bounds.height / rect.height)
  const width = rect.width * scale
  const height = width / ratio
  const anchored = rectIn(space, rect.x, rect.y, width, height)
  return clampRect(anchored, bounds)
}

// ─────────────────────────────────────────────────────────────────
// أسئلة عن التحديد
// ─────────────────────────────────────────────────────────────────

/** هل التحديد كبير بما يكفي ليُلتقَط؟ */
export function isCapturable<S extends Space>(rect: Rect<S>): boolean {
  return rect.width >= MIN_SELECTION && rect.height >= MIN_SELECTION
}

/** أكبر قاسم مشترك — لتبسيط النسبة إلى أعداد صحيحة. */
function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y > 0) [x, y] = [y, x % y]
  return x
}

/**
 * أكبر حدّ مقبول في النسبة المبسَّطة.
 *
 * `1920:1079` نسبة صحيحة رياضيًا وعديمة النفع بصريًا. ما لا يُختصر إلى
 * حدَّين صغيرين يُعرَض عشريًا — وهو أصدق من كسر لا يقرأه أحد.
 */
const MAX_RATIO_TERM = 40

/**
 * وصف النسبة كما يعرضها `capture / area-select`.
 *
 * Figma يعرض `16 : 7` لتحديد 768×336 — أي **نسبة صحيحة مختصرة**، لا القيمة
 * العشرية. الاختصار بالقاسم المشترك يعطيها بالضبط (768 ÷ 48 = 16، 336 ÷ 48
 * = 7)، ويعطي `16 : 9` و`4 : 3` و`1 : 1` مجّانًا بلا قائمة حالات خاصّة.
 *
 * والسقوط إلى العشري ليس تنازلًا بل صدق: تحديد حرّ نادرًا ما يختصر إلى
 * حدَّين صغيرين، وادّعاء نسبة أنيقة عليه كذب على المستخدم.
 */
export function describeRatio<S extends Space>(rect: Rect<S>): string {
  if (rect.height === 0 || rect.width === 0) return '—'

  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  if (w > 0 && h > 0) {
    const g = gcd(w, h)
    const a = w / g
    const b = h / g
    if (a <= MAX_RATIO_TERM && b <= MAX_RATIO_TERM) return `${a} : ${b}`
  }

  return `${(rect.width / rect.height).toFixed(2)} : 1`
}
