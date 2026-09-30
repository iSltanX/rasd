/**
 * المنطقة المستثناة من المقارنة — شكلها المخزَّن مع مرجعها (ADR 0034).
 *
 * هنا لا في `modules/compare/` لأن `ReferenceRecord` في `shared/storage/schema.ts` يحملها، و`shared/` لا
 * يستورد ممّا فوقه — نفس موضع `issue-schema.ts` وعلّته.
 *
 * **فضاءٌ واحد:** كل مستطيل `DeviceRect` ببكسل صورة المرجع، محاذًى من الزاوية العليا اليسرى كما يحاذي
 * `computeDiff`. لا DPR يُخزَّن.
 */

import type { DeviceRect } from './geometry'
import type { ElementFingerprint } from './issue-schema'

/** مستطيلٌ رُسم فوق المرجع — لمقاسه وحده. */
export interface RectAnchor {
  readonly kind: 'rect'
  readonly rect: DeviceRect
}

/**
 * عنصرٌ اختير من الصفحة — يُعاد العثور عليه بهوية ADR 0031، والمستطيل احتياطٌ حين يغيب.
 *
 * `hosts` مع `selector` لأن المحدِّد لا يعبر حدّ الظلّ؛ والبصمة للإعلام لا للرفض: المحتوى المتجدّد يغيّر
 * بصمة نصّه بطبعه، وهذا سبب استثنائه.
 */
export interface ElementAnchor {
  readonly kind: 'element'
  readonly selector: string
  readonly hosts: readonly string[]
  readonly fingerprint: ElementFingerprint
  readonly rect: DeviceRect
}

export type ExclusionAnchor = RectAnchor | ElementAnchor

export interface ExclusionZone {
  readonly id: string
  /** اسمٌ يضعه المستخدم؛ `null` يُعرض بديلُه (المحدِّد أو المقاس) — لا نصّ من الصفحة يُخزَّن. */
  readonly label: string | null
  readonly createdAt: number
  readonly anchor: ExclusionAnchor
}

/** حدود ما تقبله الخلفية من الصفحة — سقفٌ لا يبلغه استعمالٌ بشري، ويمنع قائمةً تُثقل كل قياس. */
export const EXCLUSION_LIMITS = {
  zones: 32,
  label: 80,
  selector: 2000,
} as const
