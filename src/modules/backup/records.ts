/**
 * شكل كل سجلّ في النسخة الاحتياطية — المخطّط الذي يُتحقَّق به قبل أي كتابة (ADR 0039).
 *
 * **سجلّ لكل مخزن، مربوطٌ بواجهته في الترجمة:** `Checked<…>` أسفل الملفّ يُسقط `typecheck` إن أُضيف حقلٌ
 * مطلوب إلى سجلٍّ في `shared/storage/schema.ts` ولم يُضَف هنا — فلا تُكتب نسخةٌ تستعيد سجلًّا ناقصًا يُسقط
 * واجهةً تقرؤه. و`BACKUP_RECORDS` مكتوب النوع لكل اسم في `StoreName`، فمخزنٌ جديد بلا مخطّط خطأ ترجمة.
 *
 * **`looseObject` لا `object`:** الحقل الذي لا يعرفه المخطّط يبقى كما هو ولا يُحذف صامتًا. النسخة تعيد
 * ما كان في القاعدة بايتًا ببايت، وحذفُ حقلٍ قديم كتبته نسخةٌ سابقة من رصد تغييرٌ في بيانات المستخدم لا
 * يطلبه أحد. والتحقّق يقع على ما تقرؤه الواجهات: المفاتيح والأنواع والقيم المغلقة.
 *
 * **ومشهد التعليق `unknown`** كما هو في المخزن: المحرّر يحلّله عند الفتح (`parseScene`) ويبدأ مشهدًا فارغًا
 * إن تعذّر — فرفضُ نسخةٍ كاملة بسبب مشهدٍ يقبله المحرّر نفسه تشدّدٌ يُضيّع مكتبة.
 *
 * والصور ليست في JSON: حقل `Blob` يُكتب مرجعًا إلى ملفٍّ في الحاوية (`BlobRef`)، ويُعاد `Blob` عند الاستعادة.
 */

import * as v from 'valibot'

import { CHECK_KINDS, CHECK_OUTCOMES, ISSUE_STATUSES, RECHECK_REASONS } from '@/shared/issue-schema'

import type { RasdDB, StoreName } from '@/shared/storage/schema'

const id = v.pipe(v.string(), v.minLength(1))
const num = v.number()
const nullableId = v.nullable(v.string())

/** مرجعٌ إلى صورة داخل الحاوية — بدل `Blob` في JSON. */
export const BlobRefSchema = v.strictObject({
  file: v.string(),
  type: v.string(),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
export type BlobRef = v.InferOutput<typeof BlobRefSchema>

const rect = <S extends string>(space: S) =>
  v.looseObject({ space: v.literal(space), x: num, y: num, width: num, height: num })

const fingerprint = v.looseObject({
  tag: v.string(),
  attrs: v.array(v.string()),
  textHash: v.string(),
  textLength: num,
})

const CaptureSchema = v.looseObject({
  id,
  createdAt: num,
  origin: v.string(),
  url: v.string(),
  title: v.string(),
  kind: v.picklist(['area', 'element', 'viewport', 'full-page', 'window']),
  status: v.picklist(['ready', 'processing', 'failed']),
  projectId: nullableId,
  tags: v.array(v.string()),
  width: num,
  height: num,
  devicePixelRatio: num,
  favorite: v.boolean(),
  archived: v.boolean(),
  trashedAt: v.nullable(num),
})

const BlobSchema = v.looseObject({ id, blob: BlobRefSchema, mime: v.string(), bytes: num })

const ProjectSchema = v.looseObject({
  id,
  name: v.string(),
  color: v.string(),
  createdAt: num,
  updatedAt: num,
})

const ColorSchema = v.looseObject({
  id,
  hex: v.string(),
  name: v.string(),
  note: v.string(),
  source: v.picklist(['pixel', 'css', 'manual']),
  projectId: nullableId,
  sourceUrl: v.nullable(v.string()),
  createdAt: num,
})

const PaletteSchema = v.looseObject({
  id,
  name: v.string(),
  colors: v.array(v.string()),
  projectId: nullableId,
  createdAt: num,
})

const ExclusionSchema = v.looseObject({
  id,
  label: v.nullable(v.string()),
  createdAt: num,
  anchor: v.variant('kind', [
    v.looseObject({ kind: v.literal('rect'), rect: rect('device') }),
    v.looseObject({
      kind: v.literal('element'),
      selector: v.string(),
      hosts: v.array(v.string()),
      fingerprint,
      rect: rect('device'),
    }),
  ]),
})

const ReferenceSchema = v.looseObject({
  id,
  projectId: nullableId,
  origin: v.string(),
  path: v.string(),
  viewport: v.picklist(['desktop', 'tablet', 'phone', 'custom']),
  blobId: v.string(),
  createdAt: num,
  exclusions: v.array(ExclusionSchema),
})

const AnnotationSchema = v.looseObject({
  captureId: id,
  // `unknown` يجعل المفتاح اختياريًّا في النوع المستنتَج؛ والمشهد مطلوبٌ في السجلّ — حاضرٌ بأيّ قيمة.
  scene: v.custom<NonNullable<unknown> | null>((value) => value !== undefined, 'مشهدٌ مفقود'),
  updatedAt: num,
  schemaVersion: v.exactOptional(num),
  redaction: v.exactOptional(v.looseObject({ total: num, irreversible: num })),
})

const GuideSchema = v.looseObject({
  id,
  title: v.string(),
  projectId: nullableId,
  captureIds: v.array(v.string()),
  createdAt: num,
})

const TagSchema = v.looseObject({
  name: id,
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

const ThumbnailSchema = v.looseObject({ id, blob: BlobRefSchema, width: num, height: num })

const identity = v.looseObject({
  selector: v.string(),
  unique: v.boolean(),
  positional: v.boolean(),
  inShadow: v.boolean(),
  hosts: v.array(v.string()),
  fingerprint,
  rect: v.looseObject({ x: num, y: num, width: num, height: num }),
})

const status = v.picklist(ISSUE_STATUSES)
const outcome = v.picklist(CHECK_OUTCOMES)
const reason = v.nullable(v.picklist(RECHECK_REASONS))

const IssueSchema = v.looseObject({
  id,
  schemaVersion: num,
  projectId: nullableId,
  createdAt: num,
  updatedAt: num,
  page: v.looseObject({
    url: v.string(),
    origin: v.string(),
    path: v.string(),
    title: v.string(),
    viewport: v.looseObject({ width: num, height: num, dpr: num }),
  }),
  element: identity,
  pair: v.nullable(identity),
  check: v.looseObject({
    kind: v.picklist(CHECK_KINDS),
    property: v.string(),
    actual: v.string(),
    expected: v.string(),
    tolerance: num,
  }),
  status,
  lastCheck: v.nullable(
    v.looseObject({ at: num, outcome, observed: v.nullable(v.string()), reason }),
  ),
  history: v.array(
    v.variant('kind', [
      v.looseObject({ kind: v.literal('created'), at: num, status, observed: v.string() }),
      v.looseObject({
        kind: v.literal('check'),
        at: num,
        status,
        outcome,
        observed: v.nullable(v.string()),
        reason,
      }),
      v.looseObject({ kind: v.literal('manual'), at: num, status }),
    ]),
  ),
  evidence: v.looseObject({
    captureId: v.string(),
    snapshot: v.record(v.string(), v.string()),
    crop: v.looseObject({ x: num, y: num, width: num, height: num }),
  }),
  note: v.nullable(v.looseObject({ captureId: v.string(), noteId: v.string() })),
  title: v.string(),
  body: v.string(),
  steps: v.array(v.string()),
})

/** مخطّط كل مخزن باسمه — مفتاحٌ لكل `StoreName`، فالمخزن الجديد بلا مخطّط خطأ ترجمة. */
export const BACKUP_RECORDS = {
  captures: CaptureSchema,
  blobs: BlobSchema,
  projects: ProjectSchema,
  colors: ColorSchema,
  palettes: PaletteSchema,
  references: ReferenceSchema,
  annotations: AnnotationSchema,
  guides: GuideSchema,
  tags: TagSchema,
  thumbnails: ThumbnailSchema,
  issues: IssueSchema,
} as const satisfies Record<StoreName, v.GenericSchema>

/** المخازن التي تحمل صورةً في حقل `blob` — تُكتب ملفّاتٍ في الحاوية. */
export const BLOB_STORES = ['blobs', 'thumbnails'] as const satisfies readonly StoreName[]
export type BlobStore = (typeof BLOB_STORES)[number]

// ─────────────────────────────────────────────────────────────────
// ربط المخطّط بالواجهة في الترجمة
// ─────────────────────────────────────────────────────────────────

/** سجلّ المخزن كما يُكتب في JSON: الصورة مرجعٌ لا `Blob`. */
export type BackupRecord<S extends StoreName> = S extends BlobStore
  ? Omit<RasdDB[S]['value'], 'blob'> & { blob: BlobRef }
  : RasdDB[S]['value']

/**
 * `true` إن كان ناتج المخطّط يصلح سجلًّا للمخزن — حقلٌ مطلوب في الواجهة غائبٌ عن المخطّط يجعله `never`
 * فيسقط التعيين أدناه. (والاتجاه الآخر — كل سجلٍّ حقيقي يمرّ بالمخطّط — تثبته الاختبارات على العيّنة.)
 */
type Checked<S extends StoreName> =
  v.InferOutput<(typeof BACKUP_RECORDS)[S]> extends BackupRecord<S> ? true : never

const _checked: { [S in StoreName]: Checked<S> } = {
  captures: true,
  blobs: true,
  projects: true,
  colors: true,
  palettes: true,
  references: true,
  annotations: true,
  guides: true,
  tags: true,
  thumbnails: true,
  issues: true,
}
void _checked
