import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

/**
 * يحفظ تعديلًا ويُعلن نتيجته: «حُفظ الإعداد» أو «تعذّر حفظ الإعداد» بإعادة محاولة
 * (`settings / saved` و`settings / save-error`). كل قسم يمرّر عمليّته إليه ولا يعرض
 * فشله بنفسه، فالإعلان واحد في الصفحة كلّها.
 */
export type Persist = (op: () => Promise<Result<Settings>>) => void
