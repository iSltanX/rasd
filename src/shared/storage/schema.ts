/**
 * مخطّط قاعدة البيانات المحلية.
 *
 * **قرار البنية:** الميتاداتا منفصلة عن الـBlobs. البحث والتصفية في المكتبة
 * (المرحلة 18) يمرّان على آلاف السجلّات؛ لو كانت الصورة داخل السجلّ لحمّل كل
 * استعلام مئات الميغابايت إلى الذاكرة. `captures` تحمل الوصف، و`blobs` تحمل
 * البايتات، والربط بالمعرّف نفسه. و`thumbnails` (النسخة 2) نفس المنطق
 * درجةً أخرى: شبكة المكتبة لا تحمِّل `blobs` الكاملة لكل بطاقة، بل مصغَّرة
 * مولَّدة كسولًا ومخزَّنة مرّة واحدة — انظر `ThumbnailRecord`. و`issues` (النسخة 3) سجلّ المشكلة
 * المرتبطة بعنصر — [ADR 0030](../../../Docs/ADR/0030-issue-record.md): مستقلّ عن المشهد، يشير إلى
 * لقطته وملاحظته ولا يشيران إليه. والنسخة 4 تضيف حقلًا لا مخزنًا: `ReferenceRecord.exclusions`. والنسخة 5
 * تضيف نصّ خطوات الدليل (`GuideRecord.stepText`) ومخزن قوالب التصدير (`templates`) —
 * [ADR 0041](../../../Docs/ADR/0041-guide-record-and-exports.md).
 */

import type { ExclusionZone } from '../exclusion-schema'
import type { GuideStepText, TemplateRecord } from '../guide-schema'
import type { IssueRecord } from '../issue-schema'
import type { DBSchema } from 'idb'

export const DB_NAME = 'rasd'
export const DB_VERSION = 6

export type CaptureKind = 'area' | 'element' | 'viewport' | 'full-page' | 'window'
export type CaptureStatus = 'ready' | 'processing' | 'failed'
export type ColorSource = 'pixel' | 'css' | 'manual'
export type Viewport = 'desktop' | 'tablet' | 'phone' | 'custom'

export interface CaptureRecord {
  id: string
  createdAt: number
  /** أصل الصفحة — للتصفية حسب الموقع بلا تحليل الرابط في كل استعلام. */
  origin: string
  url: string
  title: string
  kind: CaptureKind
  status: CaptureStatus
  projectId: string | null
  tags: string[]
  width: number
  height: number
  devicePixelRatio: number
  favorite: boolean
  archived: boolean
  /** وقت الحذف إلى المهملات؛ `null` يعني حيّ. الحذف النهائي بعد 30 يومًا (المرحلة 18). */
  trashedAt: number | null
}

export interface BlobRecord {
  id: string
  blob: Blob
  mime: string
  bytes: number
}

export interface ProjectRecord {
  id: string
  name: string
  color: string
  createdAt: number
  updatedAt: number
}

export interface ColorRecord {
  id: string
  hex: string
  name: string
  note: string
  source: ColorSource
  projectId: string | null
  sourceUrl: string | null
  createdAt: number
}

export interface PaletteRecord {
  id: string
  name: string
  colors: string[]
  projectId: string | null
  createdAt: number
}

export interface ReferenceRecord {
  id: string
  projectId: string | null
  origin: string
  path: string
  viewport: Viewport
  blobId: string
  createdAt: number
  /**
   * مناطق لا تدخل حساب الفرق — الوقت والإعلانات والمحتوى المتجدّد (النسخة 4،
   * [ADR 0034](../../../Docs/ADR/0034-comparison-exclusions.md)). للمرجع لا للصورة: استبدال صورته يُبقيها.
   */
  exclusions: ExclusionZone[]
}

export interface AnnotationRecord {
  /** مفتاح أساسي: لقطة واحدة ← مشهد تعليق واحد. */
  captureId: string
  /** رسم المشهد كما يحفظه محرّك التحرير (المرحلة 15). */
  scene: unknown
  updatedAt: number
  /**
   * نسخة مخطَّط المشهد — تُقرأ **بلا فكّ المشهد**.
   *
   * `scene` مكتوب `unknown`، ونظام الترحيل يعمل على المخازن لا على شكل حقل
   * داخلها. فالنسخة هنا تسمح بفرز ما يحتاج ترحيلًا قبل تحميله، والغياب
   * يُقرأ «النسخة الأولى» — فالسجلّات المكتوبة قبل هذا الحقل تبقى مقروءة.
   */
  schemaVersion?: number
  /**
   * ملخّص الحجب — **يُقرأ بلا فكّ المشهد ولا تحليله**.
   *
   * ثلاثة أطراف تحتاجه ولا تحتاج المشهد: نافذة الإضافة (كي لا تعرض مصغَّرة
   * الأصل غير المحجوب لِلقطة عُلِّق عليها بحجب)، والمكتبة في المرحلة 18،
   * والتصدير في 19. وفكّ مشهدٍ كامل لقراءة رقمين عبءٌ يُدفع في كل عرض قائمة.
   *
   * `irreversible` يعدّ **التغطية وحدها** — انظر ADR 0015: البكسلة والضبابي
   * يُدمَجان في الملفّ لكنّهما لا يُوعَد بعدم عكسهما.
   */
  redaction?: { total: number; irreversible: number }
}

export interface GuideRecord {
  id: string
  title: string
  projectId: string | null
  /** اللقطات بترتيب الخطوات — مصدر الترتيب والعضوية وحده. */
  captureIds: string[]
  createdAt: number
  /**
   * نصّ كل خطوة بمعرّف لقطتها (النسخة 5). والخطوة بلا نصّ غائبةٌ منه، فتُقرأ بـ`guideSteps` في
   * `shared/guide-schema.ts` لا مباشرةً.
   */
  stepText: Record<string, GuideStepText>
  /** آخر تعديل — يرتّب الأدلّة ويؤرّخ ما يُصدَّر (النسخة 5). */
  updatedAt: number
}

export interface TagRecord {
  /** مفتاح أساسي: اسم الوسم نفسه. */
  name: string
  count: number
}

/**
 * مصغَّرة مخزَّنة — لا مشتقَّة عند العرض (المرحلة 18).
 *
 * شبكة المكتبة تحمل آلاف اللقطات، واللقطة الكاملة قد تبلغ عشرات
 * الميغابايتات (تجميع صفحة كاملة، المرحلة 10). تحميل كل بطاقة من `blobs`
 * مباشرة يُحمِّل مئات الميغابايتات في كل تمرير — فالمصغَّرة تُولَّد **مرّة
 * واحدة** كسولًا (عند أوّل عرض لعنصر يفتقدها) وتُخزَّن هنا بمفتاحها نفسه
 * (`id` اللقطة)، منفصلة عن `blobs` بنفس منطق الفصل أعلاه.
 */
export interface ThumbnailRecord {
  id: string
  blob: Blob
  width: number
  height: number
}

/** نوع البلاغ — يقابل `kind` في عقد قناة الاستقبال (`Docs/Support.md`). */
export type ReportKind = 'bug' | 'crash' | 'suggestion' | 'other'

/**
 * مسودة بلاغ لم تصل — تُحفظ عند الفشل أو الإلغاء، وتُحذف بعد نجاح الإرسال (النسخة 6، ADR 0050).
 *
 * **الصورة مخبوزة لا أصلها:** ما يُحفظ هو ما سيُرسَل، بعد القصّ والحجب من البوّابة الواحدة (ADR 0015) — فلا
 * تبقى على القرص نسخةٌ غير محجوبة من صورةٍ أرفقها المستخدم ليُرسلها. والمعرّف نفسه مفتاح عدم التكرار الذي يُرسَل
 * مع كل محاولة، فإعادة المحاولة بعد فشلٍ لا تفتح بلاغين.
 */
export interface ReportDraftRecord {
  /** UUID عشوائي لكل بلاغ — `Idempotency-Key` في كل محاولة إرسال. لا يعرّف المستخدم ولا الجهاز. */
  id: string
  createdAt: number
  updatedAt: number
  kind: ReportKind
  title: string
  /** «ماذا حدث؟» */
  what: string
  steps: string
  expected: string
  /** الأداة المتأثّرة إن فُتح النموذج من رسالة خطأ. */
  tool: string | null
  errorCode: string | null
  image: { blob: Blob; width: number; height: number; redactions: number } | null
  /**
   * بصمة SHA-256 لجسم آخر محاولة خرجت بهذا المعرّف، أو `null`/غائب حين لم يخرج شيء. جسمٌ مختلف بعدها بلاغٌ معدَّل
   * يُرسَل بمعرّفٍ جديد. اختياريٌّ في السجلّ فلا ترحيل له: الغياب «لم يُحاوَل».
   */
  attempted?: string | null
}

export interface RasdDB extends DBSchema {
  captures: {
    key: string
    value: CaptureRecord
    indexes: {
      createdAt: number
      projectId: string
      origin: string
      kind: string
      status: string
    }
  }
  blobs: { key: string; value: BlobRecord }
  projects: { key: string; value: ProjectRecord; indexes: { name: string; updatedAt: number } }
  colors: {
    key: string
    value: ColorRecord
    indexes: { hex: string; projectId: string; source: string }
  }
  palettes: { key: string; value: PaletteRecord; indexes: { projectId: string; createdAt: number } }
  references: {
    key: string
    value: ReferenceRecord
    indexes: { projectId: string; viewport: string; origin: string }
  }
  annotations: { key: string; value: AnnotationRecord }
  guides: { key: string; value: GuideRecord; indexes: { projectId: string } }
  tags: { key: string; value: TagRecord }
  thumbnails: { key: string; value: ThumbnailRecord }
  templates: { key: string; value: TemplateRecord; indexes: { name: string } }
  issues: {
    key: string
    value: IssueRecord
    indexes: {
      projectId: string
      origin: string
      status: string
      updatedAt: number
      captureId: string
    }
  }
  reportDrafts: { key: string; value: ReportDraftRecord; indexes: { updatedAt: number } }
}

/**
 * أسماء المخازن كاتحاد حرفي.
 *
 * لا تُشتقّ بـ`keyof RasdDB` لأن `DBSchema` يحمل توقيع فهرسة نصيًّا يوسّع
 * النتيجة إلى `string` ويُفقد التحقّق.
 */
export const STORE_NAMES = [
  'captures',
  'blobs',
  'projects',
  'colors',
  'palettes',
  'references',
  'annotations',
  'guides',
  'tags',
  'thumbnails',
  'issues',
  'templates',
] as const

export type StoreName = (typeof STORE_NAMES)[number]

/**
 * مخازن ليست من المكتبة — **لا** تُصدَّر في النسخة الاحتياطية ولا تُعدّ في عدّادات المكتبة. والحذف الكامل يمسحها
 * لأنه يمسح بأسماء القاعدة المفتوحة (`clearAllStores`). مسودة البلاغ مؤقّتة ومحلّية وتُحذف بعد الإرسال.
 */
export const TRANSIENT_STORE_NAMES = ['reportDrafts'] as const

/** كل مخازن القاعدة — ما يطابق `objectStoreNames` بعد آخر ترحيل. */
export const ALL_STORE_NAMES = [...STORE_NAMES, ...TRANSIENT_STORE_NAMES] as const

export type AnyStoreName = (typeof ALL_STORE_NAMES)[number]
