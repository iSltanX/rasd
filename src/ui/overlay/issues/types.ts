/**
 * ما تعرضه واجهات المشكلة في الطبقة — يبنيه `content/tools/issues.ts` ويعرضه هذا المجلّد.
 *
 * الأنواع هنا لا في `content/`: الطبقة `ui/` لا تستورد من طبقة التشغيل، و`content/` تستورد منها.
 */

import type { CheckKind } from '@/shared/issue-schema'

/** خيارٌ في قائمة «الخاصية» — ونوع الفحص منه: لون العنصر وتباينه في قائمة واحدة لا تبويبين. */
export interface FormOption {
  readonly kind: CheckKind
  readonly property: string
  readonly label: string
  /** القيمة الآن كما تُعرض — والألوان بصيغة `#RRGGBB`. */
  readonly value: string
}

export interface IssueFormModel {
  readonly options: readonly FormOption[]
  /** `.cta-btn` أو `.ghost-btn · .cta-btn` للمسافة. */
  readonly subject: string
}

export interface IssueFormValues {
  readonly option: FormOption
  readonly expected: string
  readonly tolerance: number
  readonly title: string
  readonly body: string
  readonly withNote: boolean
}
