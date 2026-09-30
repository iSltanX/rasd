/**
 * مفردات المشكلة — الأنواع التي يعبر بها السجلّ القاعدةَ والسلك (ADR 0030 و0031).
 *
 * تعيش في `shared/` لا في `modules/issues/` لأن مخطّط القاعدة (`storage/schema.ts`) وعقد الرسائل
 * يحتاجانها، وكلاهما في الطبقة القاعدية التي لا تستورد ممّا فوقها — نفس علّة `inspect-schema.ts`.
 * والمنطق (الحالة والمقارنة والتحقّق) في `modules/issues/`.
 *
 * `shared/` طبقة قاعدية: لا تستورد من طبقة أعلى منها ولا تلمس `chrome.*`.
 */

import type { DeviceRect } from './geometry'

/** نسخة سجلّ المشكلة. الأحدث منها يُرفض برسالة ولا يُقرأ ناقصًا. */
export const ISSUE_SCHEMA_VERSION = 1

/** أقصى أحداث التاريخ المحفوظة — الأقدم يسقط. */
export const MAX_ISSUE_HISTORY = 20

/** أقصى مشكلات تُفحص في الجولة الواحدة (ADR 0031 §5). */
export const MAX_RECHECK = 100

/** حدود الطول — في النموذج وفي مخطّط الخلفية معًا (ADR 0032). */
export const ISSUE_LIMITS = {
  title: 200,
  body: 4000,
  steps: 20,
  step: 500,
  selector: 2000,
  value: 400,
  snapshot: 24,
} as const

export type IssueStatus = 'open' | 'needs-verification' | 'resolved'

export const ISSUE_STATUSES: readonly IssueStatus[] = ['open', 'needs-verification', 'resolved']

export type CheckKind = 'style' | 'spacing' | 'colour' | 'contrast'

/** خاصيات المسافة: الجوانب الأربعة للفجوة، والفرقان بين حافّتَي العنصرين. */
export const SPACING_PROPERTIES = [
  'gap-top',
  'gap-right',
  'gap-bottom',
  'gap-left',
  'dx',
  'dy',
] as const

export type SpacingProperty = (typeof SPACING_PROPERTIES)[number]

/** خاصية التباين الوحيدة: لون النصّ على خلفيته المركَّبة. */
export const CONTRAST_PROPERTY = 'color/background-color'

export const CHECK_KINDS: readonly CheckKind[] = ['style', 'spacing', 'colour', 'contrast']

/** نتائج الفحص الخمس — الحالة تُشتقّ منها بـ`statusFor` وحدها (ADR 0030 §2). */
export type CheckOutcome = 'match' | 'mismatch' | 'not-found' | 'changed' | 'unreliable'

export const CHECK_OUTCOMES: readonly CheckOutcome[] = [
  'match',
  'mismatch',
  'not-found',
  'changed',
  'unreliable',
]

/** لماذا لم تُقرأ القيمة، أو لماذا لا يُوثق بها — يُعرض للمستخدم سطرًا تحت المشكلة. */
export type RecheckReason =
  | 'missing'
  | 'host-missing'
  | 'invalid-selector'
  | 'multiple'
  | 'fingerprint'
  | 'closed-shadow'
  | 'unlaid'
  | 'animating'
  | 'background-image'
  | 'frame'
  | 'unreadable'
  | 'budget'

export const RECHECK_REASONS: readonly RecheckReason[] = [
  'missing',
  'host-missing',
  'invalid-selector',
  'multiple',
  'fingerprint',
  'closed-shadow',
  'unlaid',
  'animating',
  'background-image',
  'frame',
  'unreadable',
  'budget',
]

/** بصمة العنصر — للمقارنة لا للسرّية، والنصّ الخام لا يُحفظ (ADR 0031 §1). */
export interface ElementFingerprint {
  readonly tag: string
  /** **أسماء** السمات الثابتة مرتَّبة — لا قيمها. */
  readonly attrs: readonly string[]
  /** FNV-1a بـ32 بتًّا على النصّ بعد طيّ المسافات، ستّ عشرية بثماني خانات. */
  readonly textHash: string
  readonly textLength: number
}

/** مستطيل في إحداثيات **المستند** بالبكسل المنطقي — للعرض لا للمطابقة. */
export interface PageBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ElementIdentity {
  readonly selector: string
  readonly unique: boolean
  readonly positional: boolean
  readonly inShadow: boolean
  /** محدِّد كل مضيف ظلّ من المستند إلى جذر العنصر — فارغة خارج الظلّ. */
  readonly hosts: readonly string[]
  readonly fingerprint: ElementFingerprint
  readonly rect: PageBox
}

/**
 * ما يُفحص.
 *
 * `property`: خاصية CSS لـ`style` و`colour`؛ و`gap-top` · `gap-right` · `gap-bottom` · `gap-left` · `dx` · `dy`
 * لـ`spacing`؛ و`color/background-color` لـ`contrast`. و`tolerance` بالبكسل للأطوال، وبفرق OKLab ×100
 * للألوان، وبلا معنى للتباين (المتوقَّعة فيه حدٌّ أدنى).
 */
export interface IssueCheck {
  readonly kind: CheckKind
  readonly property: string
  readonly actual: string
  readonly expected: string
  readonly tolerance: number
}

export interface LastCheck {
  readonly at: number
  readonly outcome: CheckOutcome
  readonly observed: string | null
  readonly reason: RecheckReason | null
}

export type IssueHistoryEntry =
  | {
      readonly kind: 'created'
      readonly at: number
      readonly status: IssueStatus
      readonly observed: string
    }
  | {
      readonly kind: 'check'
      readonly at: number
      readonly status: IssueStatus
      readonly outcome: CheckOutcome
      readonly observed: string | null
      readonly reason: RecheckReason | null
    }
  | { readonly kind: 'manual'; readonly at: number; readonly status: IssueStatus }

export interface IssuePage {
  /** بلا جزء `#` — من `sender.tab` لا من الحمولة. */
  readonly url: string
  readonly origin: string
  readonly path: string
  readonly title: string
  readonly viewport: { readonly width: number; readonly height: number; readonly dpr: number }
}

export interface IssueEvidence {
  /** لقطة العنصر في المكتبة. */
  readonly captureId: string
  /** القيم ذات الصلة وقت التسجيل — اسمٌ وقيمة. */
  readonly snapshot: Readonly<Record<string, string>>
  /** موضع العنصر داخل اللقطة، ببكسل الصورة. */
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

export interface IssueRecord {
  readonly id: string
  readonly schemaVersion: number
  readonly projectId: string | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly page: IssuePage
  readonly element: ElementIdentity
  /** العنصر الثاني لفحص المسافة وحده. */
  readonly pair: ElementIdentity | null
  readonly check: IssueCheck
  readonly status: IssueStatus
  readonly lastCheck: LastCheck | null
  readonly history: readonly IssueHistoryEntry[]
  readonly evidence: IssueEvidence
  /** الملاحظة في المحرّر — ربطٌ باتجاه واحد. */
  readonly note: { readonly captureId: string; readonly noteId: string } | null
  readonly title: string
  readonly body: string
  readonly steps: readonly string[]
}

/** ما ترسله الطبقة لتسجيل مشكلة — الرابط والعنوان ليسا منه: الخلفية تقرؤهما من التبويب. */
export interface IssueDraft {
  readonly element: ElementIdentity
  readonly pair: ElementIdentity | null
  readonly check: IssueCheck
  readonly snapshot: Readonly<Record<string, string>>
  readonly title: string
  readonly body: string
  readonly steps: readonly string[]
  readonly projectId: string | null
  /** أنشئ ملاحظة مرتبطة في المحرّر مع لقطة الدليل. */
  readonly withNote: boolean
  readonly shot: {
    /** ما يُلتقط: العنصر وحوله هامش — بفضاء الجهاز. */
    readonly rect: DeviceRect
    /** العنصر نفسه بفضاء الجهاز. */
    readonly element: DeviceRect
    readonly dpr: number
  }
  readonly viewport: { readonly width: number; readonly height: number }
}

/** نتيجة فحص مشكلة واحدة كما تبلّغها الصفحة. الحالة ليست منها (ADR 0030 §2). */
export interface RecheckResult {
  readonly id: string
  readonly outcome: CheckOutcome
  readonly observed: string | null
  readonly reason: RecheckReason | null
}

/** مشروعٌ يعرضه النموذج في قائمته. */
export interface ProjectOption {
  readonly id: string
  readonly name: string
}
