/**
 * ترتيب `@layer` — **شجرة لا قائمة**، والمقارنة تنعكس مع `!important`.
 *
 * الطبقات تتقدّم على الأولوية في التتالي، فترتيبها يقرّر الفائز قبل أن
 * يُنظَر إلى المحدِّدات. وقائمة مسطّحة من `CSSLayerStatementRule.nameList`
 * **تعطي الجواب الخطأ**: قيس أن
 *
 *     @layer outer { @layer inner { .N { … } } }
 *     @layer outer { .N { … } }
 *
 * يفوز فيه إعلان **`outer`** — لأن محتوى الطبقة يقع **بعد** طبقاتها
 * الفرعية. والقائمة المسطّحة ترتّب `[outer, inner]` فتُعطي `inner` الفوز.
 *
 * ولذلك المفتاح مسار أعداد ينتهي بـ`Infinity`: `outer` هو `[0, ∞]` و
 * `outer.inner` هو `[0, 0, ∞]`، فيقع الأوّل بعد الثاني بالمقارنة المعجمية.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { compareSpecificity, type Specificity } from './specificity'

/**
 * الأنماط خارج كل طبقة تغلب المُطبَّقة — و`!important` يعكس ذلك.
 *
 * تُمثَّل بـ`null` لا برقم: ليست «طبقة أخيرة» بل غياب طبقة، والفرق يظهر
 * حين ينعكس الترتيب.
 */
export type LayerKey = readonly number[] | null

/**
 * يبني ترتيب الطبقات بالتسجيل، لا بقراءة `nameList` وحدها.
 *
 * الترتيب يُحدَّد بأوّل ذكر لكل مسار — سواء أُعلن باسمه في
 * `@layer a, b;` أو ظهر ككتلة. والتسجيل بالمسار الكامل لا بالاسم المفرد،
 * فطبقتان باسم `inner` تحت أبوين مختلفين ليستا واحدة.
 */
export class LayerOrder {
  private readonly index = new Map<string, number>()
  private readonly children = new Map<string, number>()

  /** يسجّل مسارًا وكل آبائه. */
  register(path: string): void {
    if (!path || this.index.has(path)) return

    const parts = path.split('.')
    let prefix = ''
    for (const part of parts) {
      const parent = prefix
      prefix = prefix ? `${prefix}.${part}` : part
      if (this.index.has(prefix)) continue
      const n = this.children.get(parent) ?? 0
      this.children.set(parent, n + 1)
      this.index.set(prefix, n)
    }
  }

  /**
   * مفتاح المسار: أعداد الآباء ثم `Infinity`.
   *
   * `Infinity` هو ما يجعل **محتوى** الطبقة يقع بعد طبقاتها الفرعية كلّها —
   * وهو السلوك المقيس.
   */
  key(path: string): LayerKey {
    if (!path) return null
    this.register(path)

    const out: number[] = []
    const parts = path.split('.')
    let prefix = ''
    for (const part of parts) {
      prefix = prefix ? `${prefix}.${part}` : part
      out.push(this.index.get(prefix) ?? 0)
    }
    out.push(Number.POSITIVE_INFINITY)
    return out
  }

  /**
   * مسار الطبقة لقاعدة، بالمشي على `parentRule`.
   *
   * لا يُقرأ `layerName` من القاعدة مباشرةً: القاعدة قد تكون داخل
   * `@media` داخل `@layer`، فالطبقة عند جدٍّ لا عند الأب.
   */
  qualify(rule: CSSRule): string {
    const names: string[] = []
    let node: CSSRule | null = rule
    let guard = 0

    while (node && guard++ < 64) {
      const name = layerNameOf(node)
      if (name !== null) names.unshift(name)
      node = node.parentRule
    }

    const path = names.filter(Boolean).join('.')
    if (path) this.register(path)
    return path
  }
}

/**
 * اسم الطبقة لقاعدة كتلة، أو `null` لغيرها.
 *
 * `@layer { … }` المجهولة طبقة فعلًا ولها موضع في الترتيب، لكنها لا تشارك
 * اسمًا مع غيرها — فتُعطى اسمًا فريدًا بالعدّاد بدل أن تُخلَط بأختها.
 */
let anonymous = 0
const anonymousNames = new WeakMap<CSSRule, string>()

function layerNameOf(rule: CSSRule): string | null {
  /*
   * **الخاصّية اسمها `name` لا `layerName`.**
   *
   * قيس في Chrome 151: `CSSLayerBlockRule` يعرض `name`، و
   * `'layerName' in CSSLayerBlockRule.prototype` يساوي **`false`**. وقراءة
   * الاسم الخطأ لا تُسقط شيئًا ولا ترمي — تُرجع `undefined` فيصير كل
   * إعلان «خارج الطبقات»، فيسقط ترتيب الطبقات إلى ترتيب المستند **صامتًا**
   * ويعطي الجواب الصحيح بالمصادفة أحيانًا. أمسكه `verify-inspect.mjs`
   * حين لاحظ أن الطبقة المبلَّغة `null` لعنصر داخل `@layer`.
   *
   * ولا `instanceof`: قيس أن `rule.type` يساوي صفرًا لستّة أنواع متمايزة
   * (‎LayerStatement · LayerBlock · NestedDeclarations · Container · Scope ·
   * Property)، والبناء قد يجري في بيئة بلا هذه الأصناف أصلًا.
   */
  const r = rule as { name?: unknown; layerName?: unknown }
  const name = typeof r.name === 'string' ? r.name : r.layerName
  if (typeof name !== 'string') return null
  if (name) return name

  let anon = anonymousNames.get(rule)
  if (!anon) {
    anon = ` anon${anonymous++}`
    anonymousNames.set(rule, anon)
  }
  return anon
}

/**
 * يقارن مفتاحَي طبقة. موجب حين `x` **يفوز** (أي يقع لاحقًا).
 *
 * `null` (خارج الطبقات) يفوز على أي طبقة.
 */
export function compareLayer(x: LayerKey, y: LayerKey): number {
  if (x === null && y === null) return 0
  if (x === null) return 1
  if (y === null) return -1

  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) {
    const a = x[i] ?? -1
    const b = y[i] ?? -1
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

/** مرشّح واحد في التتالي. */
export interface Candidate {
  readonly important: boolean
  /** النمط السطري يغلب كل قاعدة عند تساوي الأهمّية. */
  readonly inline: boolean
  readonly layer: LayerKey
  readonly spec: Specificity
  /** ترتيب الظهور في المستند — الفاصل الأخير. */
  readonly order: number
}

/**
 * هل يفوز `x` على `y`؟
 *
 * الترتيب: الأهمّية ← الطبقة ← السطري ← الأولوية ← ترتيب المستند.
 *
 * **و`!important` يعكس مقارنة الطبقات**: قيس أن إعلانًا مُهمًّا داخل طبقة
 * غلب إعلانًا مُهمًّا خارجها — أي أن ما يغلب عاديًّا يُغلَب مُهمًّا. وهي
 * القاعدة الوحيدة في التتالي التي تنقلب، وإغفالها يعطي الجواب الخطأ في كل
 * صفحة تجمع الطبقات مع `!important`.
 */
export function beats(x: Candidate, y: Candidate): boolean {
  if (x.important !== y.important) return x.important

  const layer = compareLayer(x.layer, y.layer)
  if (layer !== 0) return x.important ? layer < 0 : layer > 0

  if (x.inline !== y.inline) return x.inline

  const spec = compareSpecificity(x.spec, y.spec)
  if (spec !== 0) return spec > 0

  return x.order > y.order
}

/** يختار الفائز من مرشّحين. `null` حين لا مرشّح. */
export function winner<T extends Candidate>(candidates: readonly T[]): T | null {
  let best: T | null = null
  for (const c of candidates) if (!best || beats(c, best)) best = c
  return best
}
