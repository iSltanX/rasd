/**
 * مخطَّط المشهد — الجسر الوحيد فوق `AnnotationRecord.scene: unknown`.
 *
 * **ما يُقرأ من القرص ليس مشهدًا حتى يُثبَت أنه كذلك.** الحقل مكتوب
 * `unknown` في مخطَّط قاعدة البيانات، وما يعبر `structuredClone` يعود بلا
 * نماذج أوّلية. فبلا تحقّق، مشهدٌ من نسخة أقدم — أو من قرص عُبث به —
 * يُمرَّر إلى المُصيِّر فينهار عند أوّل حقل ناقص، بعيدًا عن سببه بمرحلتين.
 *
 * **والتحقّق لا يُسقط الصفحة.** `parseScene` تُرجع `Result`، والمحرر يعرض
 * حالة «مشهد غير مقروء» ويحتفظ بالأصل بدل أن يكتب فوقه — لأن الكتابة فوق
 * مشهد لم نفهمه تُتلف عمل المستخدم نهائيًّا.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import * as v from 'valibot'

import { errText, ok, type Result } from '@/shared/result'
import { ANNOTATION_COLORS } from '@/shared/settings/schema'

import {
  asNodeId,
  MAX_FREEHAND_POINTS,
  MAX_SCENE_NODES,
  SCENE_SCHEMA_VERSION,
  type Scene,
} from './scene'

/**
 * المعرّف يخرج من المخطَّط **موسومًا** لا نصًّا خامًا.
 *
 * بلا الوسم يمرّ `captureId` — وهو نصّ كذلك — في موضع `NodeId` بلا اعتراض،
 * وهو نوع الخلط الذي بُني الوسم لمنعه. والتحويل هنا هو الموضع **الوحيد**
 * الذي يُسمح فيه بذلك، لأنه حدّ الثقة: ما بعده مُتحقَّق منه.
 */
const NodeIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.transform((raw) => asNodeId(raw)),
)
const ColorSchema = v.picklist(ANNOTATION_COLORS)

const finite = v.pipe(v.number(), v.finite())

const DevicePointSchema = v.object({
  space: v.literal('device'),
  x: finite,
  y: finite,
})

const DeviceRectSchema = v.object({
  space: v.literal('device'),
  x: finite,
  y: finite,
  width: v.pipe(finite, v.minValue(0)),
  height: v.pipe(finite, v.minValue(0)),
})

const StrokeSchema = v.object({
  colorToken: ColorSchema,
  widthPx: v.pipe(finite, v.minValue(0)),
  dash: v.array(v.pipe(finite, v.minValue(0))),
  opacity: v.pipe(finite, v.minValue(0), v.maxValue(1)),
})

/**
 * `letterSpacingPx` يُقبَل صفرًا **حرفيًّا**.
 *
 * القاعدة اللغوية (العربية لا تُباعَد حروفها) مفروضة في النوع، والمخطَّط
 * يفرضها على ما يأتي من القرص كذلك — وإلّا دخلت قيمةٌ غير صفرية من نسخة
 * قديمة فجعلت السطر يُقاس بشيء ويُرسم بآخر.
 */
const FontSchema = v.object({
  family: v.string(),
  sizePx: v.pipe(finite, v.minValue(1)),
  weight: v.pipe(finite, v.minValue(1)),
  letterSpacingPx: v.literal(0),
})

const baseFields = {
  id: NodeIdSchema,
  locked: v.boolean(),
  rotation: finite,
  stroke: StrokeSchema,
}

const hideableFields = { ...baseFields, hidden: v.boolean() }

const NodeSchema = v.variant('kind', [
  v.object({
    ...hideableFields,
    kind: v.literal('rect'),
    rect: DeviceRectSchema,
    radiusPx: v.pipe(finite, v.minValue(0)),
    fill: v.picklist(['none', 'solid']),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('ellipse'),
    rect: DeviceRectSchema,
    fill: v.picklist(['none', 'solid']),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('line'),
    a: DevicePointSchema,
    b: DevicePointSchema,
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('arrow'),
    a: DevicePointSchema,
    b: DevicePointSchema,
    head: v.picklist(['end', 'both']),
    headSizePx: v.pipe(finite, v.minValue(0)),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('freehand'),
    /*
     * زوجيّة الطول شرطٌ لا تجميل: مصفوفة فردية تعني نقطةً بلا إحداثي ثانٍ،
     * والمُصيِّر يقرأ `undefined` فيرسم `NaN` — ولا يرمي.
     */
    points: v.pipe(
      v.array(finite),
      v.maxLength(MAX_FREEHAND_POINTS * 2),
      v.check((p) => p.length % 2 === 0, 'مسار حرّ بعدد إحداثيات فردي'),
    ),
    closed: v.boolean(),
    epsilon: v.pipe(finite, v.minValue(0)),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('text'),
    at: DevicePointSchema,
    text: v.string(),
    font: FontSchema,
    maxWidthPx: v.pipe(finite, v.minValue(0)),
    align: v.picklist(['start', 'center', 'end']),
    dir: v.picklist(['rtl', 'ltr', 'auto']),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('note'),
    at: DevicePointSchema,
    widthPx: v.pipe(finite, v.minValue(1)),
    title: v.string(),
    body: v.string(),
    tag: v.nullable(v.picklist(['type', 'spacing', 'token'])),
    font: FontSchema,
    paddingPx: v.pipe(finite, v.minValue(0)),
    pinId: v.nullable(NodeIdSchema),
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('pin'),
    at: DevicePointSchema,
    shape: v.picklist(['circle', 'square', 'pin']),
    ordinal: v.pipe(finite, v.integer()),
    noteId: v.nullable(NodeIdSchema),
    radiusPx: v.pipe(finite, v.minValue(1)),
  }),
  /*
   * عقدة الحجب **بلا `hidden`** — والمخطَّط يفرض ذلك كما يفرضه النوع.
   * `v.object` في valibot يتجاهل المفاتيح الزائدة، فلو أضافت نسخةٌ لاحقة
   * الحقل لن يُقرأ ولن يؤثّر — وهذا هو المطلوب بالضبط.
   */
  v.object({
    ...baseFields,
    kind: v.literal('redact'),
    rect: DeviceRectSchema,
    mode: v.picklist(['cover', 'pixelate', 'blur']),
    strength: v.pipe(finite, v.minValue(0)),
    coverToken: ColorSchema,
  }),
  v.object({
    ...hideableFields,
    kind: v.literal('measure'),
    a: DeviceRectSchema,
    b: v.nullable(DeviceRectSchema),
    show: v.picklist(['gap', 'size']),
  }),
])

const SceneSchema = v.object({
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  captureId: v.pipe(v.string(), v.minLength(1)),
  source: v.object({
    width: v.pipe(finite, v.minValue(1)),
    height: v.pipe(finite, v.minValue(1)),
    /*
     * كثافة البكسل **إلزامية وموجبة**. لقطةٌ محفوظة بكثافة صفر أو مفقودة
     * تجعل كل تحويل CSS↔صورة يقسم على صفر أو يضرب في `undefined` — والنتيجة
     * `NaN` تنتشر في المشهد كلّه بلا رسالة واحدة.
     */
    dpr: v.pipe(finite, v.minValue(0.1)),
  }),
  meta: v.object({
    crop: v.nullable(DeviceRectSchema),
    pinStart: v.pipe(finite, v.integer()),
    pinShape: v.picklist(['circle', 'square', 'pin']),
  }),
  nodes: v.pipe(v.array(NodeSchema), v.maxLength(MAX_SCENE_NODES)),
  revision: v.pipe(finite, v.integer(), v.minValue(0)),
})

export interface EmptySceneInput {
  readonly captureId: string
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly pinStart?: number
  readonly pinShape?: Scene['meta']['pinShape']
}

/** مشهد فارغ صالح — نقطة البداية لكل لقطة لم تُعلَّق بعد. */
export function emptyScene(input: EmptySceneInput): Scene {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    captureId: input.captureId,
    source: { width: input.width, height: input.height, dpr: input.dpr },
    meta: {
      crop: null,
      pinStart: input.pinStart ?? 1,
      pinShape: input.pinShape ?? 'circle',
    },
    nodes: [],
    revision: 0,
  }
}

/**
 * يرحّل مشهدًا من نسخة أقدم.
 *
 * فارغةٌ اليوم عمدًا — النسخة واحدة. وموجودة لأن الترحيل الذي يُكتب بعد
 * شحن النسخة الثانية يحتاج نقطةً يُعلَّق عليها، وإضافتها لاحقًا تعني تعديل
 * كل مستدعٍ. والنسخة الأحدث من قارئها تُرفَض صراحةً: قراءتها بقارئ قديم
 * تُسقط حقولًا لا يعرفها ثمّ **تكتبها ناقصةً** عند أوّل حفظ.
 */
export function migrateScene(raw: Scene): Result<Scene> {
  if (raw.schemaVersion > SCENE_SCHEMA_VERSION) {
    return errText(
      'invalid-data',
      'هذا التعليق أُنشئ بنسخة أحدث من رصد. حدِّث الإضافة لفتحه.',
      `scene v${raw.schemaVersion} > reader v${SCENE_SCHEMA_VERSION}`,
    )
  }
  return ok(raw)
}

/**
 * يقرأ مشهدًا من قيمة مجهولة.
 *
 * **`Result` لا استثناء**: مشهد تالف حالةٌ متوقَّعة لا عطل برمجي، والمحرر
 * يعرضها ويحتفظ بالأصل. والرمي هنا كان سيُسقط الصفحة كاملةً ويُخفي بقيّة
 * الأدلّة — وهي العلّة نفسها التي بُني لأجلها `ErrorBoundary` في المكتبة.
 */
export function parseScene(raw: unknown): Result<Scene> {
  const parsed = v.safeParse(SceneSchema, raw)
  if (!parsed.success) {
    const first = parsed.issues[0]
    return errText(
      'invalid-data',
      'تعذّرت قراءة التعليق المحفوظ لهذه اللقطة.',
      first ? `${first.message} @ ${v.getDotPath(first) ?? '<root>'}` : 'unknown issue',
    )
  }
  return migrateScene(parsed.output)
}

/**
 * حجم المشهد مُسلسَلًا — يُمرَّر إلى حارس الحصّة ويُقارَن بالسقف.
 *
 * `put(value, sizeHint = 0)` يعني أن الحارس يرى **صفر بايت** لمشهد قد يبلغ
 * ميغابايتات. الحساب هنا تقديرٌ صادق: طول النصّ المُسلسَل بالمحارف، وهو
 * الحدّ الأدنى لبايتات UTF-8.
 */
export function estimateSceneBytes(scene: Scene): number {
  return JSON.stringify(scene).length
}
