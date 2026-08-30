/**
 * مخطّط قاعدة البيانات المحلية.
 *
 * **قرار البنية:** الميتاداتا منفصلة عن الـBlobs. البحث والتصفية في المكتبة
 * (المرحلة 18) يمرّان على آلاف السجلّات؛ لو كانت الصورة داخل السجلّ لحمّل كل
 * استعلام مئات الميغابايت إلى الذاكرة. `captures` تحمل الوصف، و`blobs` تحمل
 * البايتات، والربط بالمعرّف نفسه.
 */

import type { DBSchema } from 'idb'

export const DB_NAME = 'rasd'
export const DB_VERSION = 1

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
  captureIds: string[]
  createdAt: number
}

export interface TagRecord {
  /** مفتاح أساسي: اسم الوسم نفسه. */
  name: string
  count: number
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
] as const

export type StoreName = (typeof STORE_NAMES)[number]
