/**
 * ذاكرة الرقع المرسومة — سياسة المقياس والمفتاح والميزانية.
 *
 * **الرقعة تُبنى بدقّة الصورة لا بدقّة الشاشة.** الطمس يُطبَّق على بكسلات
 * المصدر، وσ قياسٌ فيها. ولو قُرئت بكسلات المسرح لَتغيّر الضباب مع كل تكبير:
 * يضبط المستخدم الشدّة عند تكبير ويُصدَّر شيء آخر — وهو بالضبط ما يمنعه
 * قرار «محرِّك واحد».
 *
 * **ومع ذلك لا تُبنى دائمًا بمقياس 1.** رقعةٌ تغطّي لقطة 4000×3000 تعني
 * اثني عشر مليون بكسل، وقياس الضباب ‎45ns‎ للبكسل ⇒ **557 مللي ثانية**.
 * فالمقياس يتبع التكبير ما دام لا يُفسد النتيجة.
 *
 * **والحدّ الذي يجعله لا يُفسدها هو الحدّ الحرج في هذا الملفّ كلّه:**
 * ضربُ σ بالمقياس قد يُنزله تحت عتبة صيغة SVG، فيصير الضباب **هوية** —
 * أي تُعرض البكسلات الحسّاسة كما هي. مقيس: عند تكبير الملاءمة 0.22 لِلقطة
 * 4000×3000، تصير σ=2 قيمتها 0.443 ⇒ `d = 1` ⇒ لا شيء. وهو فشلٌ **مفتوح**
 * يبدو كأن الأداة تعمل.
 *
 * فالمقياس يُرفَع حتى تبقى الشدّة فعّالة، وإن لم يُمكن رُفضت الرقعة —
 * والرفض يعني تغطية معتمة، أي فشلًا **مغلقًا**.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { EDITOR_CACHE_BUDGET_BYTES } from './budget'
import { blurRadius, boxPassesForSigma } from './pixel-ops'

import type { ObscureMode, RedactNode } from './scene'

/** حصّة رقع الحجب من ميزانية المخابئ — النصف، والنصف الآخر للنصّ والدبابيس. */
export const REDACT_CACHE_BYTES = EDITOR_CACHE_BUDGET_BYTES / 2

/**
 * سقف الرقعة الواحدة.
 *
 * ثمانية ميغابايت تسع أسوأ حالة مقيسة: الحالة القصوى 2560×28,672 عند تكبير
 * الملاءمة 0.023 تُقرَّب إلى مقياس 0.125 ⇒ 320×3584 ⇒ 4.6 ميغابايت. والسقف
 * يرفض ما فوقها، وهو لا ينشأ إلّا من شدّة غير محدودة.
 */
export const MAX_PATCH_BYTES = 8 * 1024 * 1024

/** أدنى مقياس — دونه تصير الرقعة أصغر من نواة الضباب فيخرج طينًا. */
export const MIN_PATCH_SCALE = 1 / 16

/** درجات المقياس. التكبير متّصل من العجلة، ومفتاحٌ متّصل لا يُصيب أبدًا. */
export const PATCH_SCALE_STEP = 1 / 8

/** أدنى ضلع خليّة يُنتج بكسلةً مرئية. */
export const MIN_EFFECTIVE_CELL = 2

/**
 * أدنى σ يُنتج ضبابًا — **يُشتقّ ولا يُكتب رقمًا**.
 *
 * `1.5/K` تساوي 0.79788456…، وكتابتها عشريةً مقتطعة تقع **تحت** العتبة
 * فتعطي `d = 1` أي لا شيء: أي أن الحدّ الذي وُضع لمنع «شدّة لا تفعل شيئًا»
 * يصير هو نفسه شدّةً لا تفعل شيئًا.
 */
export const MIN_EFFECTIVE_SIGMA = 1.5 / ((3 * Math.sqrt(2 * Math.PI)) / 4)

/** هل هذه الشدّة تُنتج أثرًا فعليًّا بهذا النمط؟ */
export function isEffective(mode: ObscureMode, strength: number): boolean {
  if (mode === 'cover') return true
  if (mode === 'pixelate') return Math.floor(strength) >= MIN_EFFECTIVE_CELL
  return boxPassesForSigma(strength).some((p) => p.size > 1)
}

/** يقرّب المقياس إلى أعلى درجة — لأعلى دائمًا، فلا تُبنى رقعة أخشن من العرض. */
const quantiseUp = (s: number): number =>
  Math.min(1, Math.max(MIN_PATCH_SCALE, Math.ceil(s / PATCH_SCALE_STEP) * PATCH_SCALE_STEP))

/**
 * مقياس الرقعة لعقدة عند تكبير معلوم.
 *
 * يبدأ من التكبير، ثمّ يُرفَع إن كانت الشدّة المضروبة ستفقد أثرها.
 * `null` يعني: لا مقياس يفي — تُرفَض الرقعة وتُرسم تغطية.
 */
export function patchScaleFor(mode: ObscureMode, strength: number, zoom: number): number | null {
  if (mode === 'cover') return 1
  if (!isEffective(mode, strength)) return null

  const need =
    mode === 'blur' ? MIN_EFFECTIVE_SIGMA / strength : MIN_EFFECTIVE_CELL / Math.floor(strength)

  const scale = quantiseUp(Math.max(Math.min(1, zoom), need))
  return isEffective(mode, strength * scale) ? scale : null
}

export interface PatchPlan {
  /** المنطقة بفضاء الصورة — تُقرأ من المصدر بهذا المستطيل. */
  readonly sample: { x: number; y: number; w: number; h: number }
  /** الوجهة داخل الرقعة، بعد المقياس والهامش. */
  readonly dest: { x: number; y: number; w: number; h: number }
  readonly scale: number
  /** الشدّة **بعد** الضرب بالمقياس — هي ما يُنفَّذ. */
  readonly strength: number
  readonly width: number
  readonly height: number
  readonly bytes: number
}

/**
 * يخطّط رقعة لعقدة. `null` يعني: ارسم التغطية.
 *
 * الهامش من `blurRadius` لا من `ceil(2σ)`: الأخير ينقص أربعة عشر بكسلًا عند
 * σ=18، فيُخدَم 2.77% من كتلة النواة ببكسلات حافّة مكرّرة — هالةٌ عند حدّ
 * المنطقة، **وتباعدُ المعاينة عن الخبز** إن اختلف الهامشان.
 */
export function planPatch(node: RedactNode, zoom: number): PatchPlan | null {
  if (node.mode === 'cover') return null

  const scale = patchScaleFor(node.mode, node.strength, zoom)
  if (scale === null) return null

  const strength = node.strength * scale
  const margin = node.mode === 'blur' ? blurRadius(strength) : 0

  const w = Math.max(1, Math.round(node.rect.width * scale))
  const h = Math.max(1, Math.round(node.rect.height * scale))
  const width = w + margin * 2
  const height = h + margin * 2
  const bytes = width * height * 4
  if (bytes > MAX_PATCH_BYTES) return null

  return {
    sample: {
      x: node.rect.x - margin / scale,
      y: node.rect.y - margin / scale,
      w: node.rect.width + (margin * 2) / scale,
      h: node.rect.height + (margin * 2) / scale,
    },
    dest: { x: margin, y: margin, w, h },
    scale,
    strength,
    width,
    height,
    bytes,
  }
}

/**
 * مفتاح الرقعة — **كل ما يغيّر بكسلاتها**.
 *
 * `underlayEpoch` بصمة ما **تحتها** في ترتيب الرسم. الخبز يدمّر المركَّب عند
 * تلك النقطة لا الصورة الخام، فسهمٌ رُسم تحت الحجب يُطمَس معه — وتغييره يجب
 * أن يُبطل الرقعة، ولو لم تُمَسّ عقدة الحجب نفسها.
 */
export function patchKey(node: RedactNode, plan: PatchPlan, underlayEpoch: string): string {
  return [
    node.id,
    node.mode,
    plan.strength.toFixed(4),
    plan.scale.toFixed(4),
    Math.round(node.rect.x),
    Math.round(node.rect.y),
    Math.round(node.rect.width),
    Math.round(node.rect.height),
    underlayEpoch,
  ].join('|')
}

export interface CacheEntry<T> {
  readonly value: T
  readonly bytes: number
}

export interface RasterCache<T> {
  get(key: string): T | null
  put(key: string, value: T, bytes: number): boolean
  /** هل هذا المفتاح قيد البناء؟ يمنع إطلاق الطلب نفسه في كل إطار. */
  claim(key: string): boolean
  release(key: string): void
  clear(): void
  readonly bytes: number
  readonly size: number
}

/**
 * ذاكرة LRU بميزانية بايتات.
 *
 * `Map` في JavaScript تحفظ ترتيب الإدخال، فالأقدم أوّل مفاتيحها — وإعادة
 * الإدخال عند كل إصابة تكفي لجعل الترتيب ترتيبَ الاستعمال، بلا قائمة
 * مزدوجة الوصل تُدار يدويًّا.
 */
export function createRasterCache<T>(
  budgetBytes: number = REDACT_CACHE_BYTES,
  dispose: (value: T) => void = () => undefined,
): RasterCache<T> {
  const store = new Map<string, CacheEntry<T>>()
  const building = new Set<string>()
  let bytes = 0

  const evictUntil = (room: number): void => {
    for (const key of store.keys()) {
      if (bytes + room <= budgetBytes) return
      const entry = store.get(key)
      if (!entry) continue
      store.delete(key)
      bytes -= entry.bytes
      dispose(entry.value)
    }
  }

  return {
    get bytes() {
      return bytes
    },
    get size() {
      return store.size
    },

    get(key) {
      const entry = store.get(key)
      if (!entry) return null
      // إعادة الإدخال ترفعه إلى آخر الترتيب — أي أحدث استعمالًا.
      store.delete(key)
      store.set(key, entry)
      return entry.value
    },

    put(key, value, entryBytes) {
      if (entryBytes > MAX_PATCH_BYTES || entryBytes > budgetBytes) {
        dispose(value)
        return false
      }
      const old = store.get(key)
      if (old) {
        store.delete(key)
        bytes -= old.bytes
        dispose(old.value)
      }
      evictUntil(entryBytes)
      store.set(key, { value, bytes: entryBytes })
      bytes += entryBytes
      building.delete(key)
      return true
    },

    claim(key) {
      if (building.has(key) || store.has(key)) return false
      building.add(key)
      return true
    },

    release(key) {
      building.delete(key)
    },

    clear() {
      for (const entry of store.values()) dispose(entry.value)
      store.clear()
      building.clear()
      bytes = 0
    },
  }
}
