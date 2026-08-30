/**
 * مفردات الفحص — المجموعات والخصائص وحدود الثقة.
 *
 * تعيش في `shared/` لا في `modules/` لأن أربعة أطراف تحتاجها: قارئ الأنماط
 * (`modules/`)، وأداة الصفحة (`content/`)، واللوحة (`ui/`)، والنافذة
 * (`pages/`). ولو سكنت في `modules/` لاضطرّت `pages/` إلى الاستيراد منها،
 * وهو ما تمنعه قاعدة الطبقات.
 *
 * **المجموعات أربع، من `Rasd_Ar.md §7`**: العنصر · النص · المسافات ·
 * الألوان. ونصّ الخطّة يقول «أربعة تبويبات» ثم يعدّ خمسة بإضافة «الإتاحة» —
 * والمواصفة المنتَجية هي الحَكَم في العدد، وFigma في الشكل.
 *
 * **ولماذا مجموعة منتقاة لا كل شيء**: `getComputedStyle` يعدّد **2461
 * خاصّية** في Chrome اليوم، وقراءتها كلّها قِيست بـ776.67µs مقابل 8.5–12µs
 * للمجموعة المنتقاة — أي **111× أغلى** بلا فائدة للمستخدم: مئات الخصائص
 * بقيمها الابتدائية لا تقول شيئًا عن هذا العنصر بعينه.
 *
 * `shared/` طبقة قاعدية: لا تستورد من طبقة أعلى منها ولا تلمس `chrome.*`.
 */

/** مجموعات اللوحة، بترتيب عرضها. */
export const INSPECT_GROUPS = {
  /** العنصر: التخطيط والموضع والتكديس. `Rasd_Ar.md §7.1` */
  element: [
    'display',
    'position',
    'inset-block-start',
    'inset-inline-start',
    'width',
    'height',
    'z-index',
    'overflow-x',
    'overflow-y',
    'opacity',
    'border-start-start-radius',
    'border-start-end-radius',
    'border-end-start-radius',
    'border-end-end-radius',
    'box-sizing',
    'visibility',
  ],
  /** النص. `Rasd_Ar.md §7.2` */
  text: [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-align',
    'text-decoration-line',
    'text-transform',
    'direction',
    'writing-mode',
    'white-space',
  ],
  /** المسافات. `Rasd_Ar.md §7.3` */
  spacing: [
    'margin-block-start',
    'margin-block-end',
    'margin-inline-start',
    'margin-inline-end',
    'padding-block-start',
    'padding-block-end',
    'padding-inline-start',
    'padding-inline-end',
    'row-gap',
    'column-gap',
    'border-block-start-width',
    'border-block-end-width',
    'border-inline-start-width',
    'border-inline-end-width',
  ],
  /** الألوان. `Rasd_Ar.md §7.4` — ولكلٍّ متغيّره إن وُجد. */
  colour: [
    'color',
    'background-color',
    'background-image',
    'border-block-start-color',
    'border-inline-start-color',
    'outline-color',
    'box-shadow',
    'text-shadow',
    'fill',
    'stroke',
  ],
} as const satisfies Record<string, readonly string[]>

export type InspectGroup = keyof typeof INSPECT_GROUPS

/** ترتيب المجموعات كما تُعرَض. */
export const GROUP_ORDER: readonly InspectGroup[] = ['element', 'text', 'spacing', 'colour']

/** أسماء المجموعات بالعربية. */
export const GROUP_LABELS: Record<InspectGroup, string> = {
  element: 'العنصر',
  text: 'النص',
  spacing: 'المسافات',
  colour: 'الألوان',
}

/** كل الخصائص المقروءة، بلا تكرار. */
export const INSPECT_PROPS: readonly string[] = Object.freeze([
  ...new Set(GROUP_ORDER.flatMap((g) => INSPECT_GROUPS[g])),
])

/**
 * مدى الثقة في القيمة المقروءة.
 *
 * ليست زينة: عنصر بلا تخطيط يُرجع نسبًا خامًا بدل قيم مستعمَلة (قِيس في
 * المرحلة 10 أن `padding: 10%` يعود `"10%"` على `display: none` بينما يعود
 * `"40px"` مخطَّطًا)، وعنصر متحرِّك تتقدّم حركته على تصريحه. وعرض القيمة
 * بلا هذا التمييز يجعل الفاحص يكذب بثقة.
 */
export type Reliability =
  /** قيمة مستعمَلة موثوقة. */
  | 'used'
  /** العنصر بلا صندوق — النسب لم تُحلّ. */
  | 'unlaid'
  /** حركة جارية تتقدّم على التصريح. */
  | 'animating'

export interface StyleValue {
  readonly value: string
  readonly reliability: Reliability
}

/** ما لا يستطيع الفاحص قوله — يُعلَن ولا يُخفى. */
export interface InspectLimits {
  /** العنصر داخل جذر ظلّ مغلق: لا وصول إلى قواعده. */
  readonly closedShadowHost: boolean
  /** داخل إطار عابر للأصل. */
  readonly opaqueFrame: boolean
  /** بلا تخطيط — النسب خام. */
  readonly unlaid: boolean
  /** عدد الحركات الجارية على العنصر. */
  readonly animating: number
  /** أوراق تعذّرت قراءتها، وأصولها. */
  readonly unreadableSheets: number
  readonly unreadableOrigins: readonly string[]
  /** هل اكتمل فهرس القواعد؟ */
  readonly indexComplete: boolean
  /**
   * أصناف زائفة تفاعلية لم تُقيَّم.
   *
   * الدرع يعطّل `:hover`/`:focus`/`:active` تحت الطبقة، فقاعدة تعتمد عليها
   * تبدو غير فائزة وهي التي تفوز حين يمرّ المستخدم فعلًا.
   */
  readonly interactiveStateUnknown: boolean
}

export interface InspectSnapshot {
  readonly at: number
  readonly tag: string
  /** الاسم المختصر المعروض (`#hero` · `.card`). */
  readonly label: string
  readonly selector: string
  readonly unique: boolean
  readonly positional: boolean
  readonly inShadow: boolean
  readonly rect: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    /** الموضع في **المستند** — يفرضه `Rasd_Ar.md §7.1` ولا يعطيه مستطيل النافذة. */
    readonly pageX: number
    readonly pageY: number
  }
  readonly styles: Readonly<Record<string, StyleValue>>
  readonly limits: InspectLimits
}

export const EMPTY_LIMITS: InspectLimits = {
  closedShadowHost: false,
  opaqueFrame: false,
  unlaid: false,
  animating: 0,
  unreadableSheets: 0,
  unreadableOrigins: [],
  indexComplete: false,
  interactiveStateUnknown: false,
}
