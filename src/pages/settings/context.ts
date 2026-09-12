/**
 * منطق صفحة الإعدادات — بلا JSX، نفس نمط `library/context.ts` و`popup/context.ts`.
 */

import { patchSettings, watchSettings, type Settings } from '@/shared/settings'

import type { Result } from '@/shared/result'

export { watchSettings }
export type { Settings }

/**
 * يكتب تعديلًا جزئيًا على `appearance` وحدها.
 *
 * `patch` يمرّ إلى `patchSettings` كما هو — لا يُدمَج مع قراءة سابقة هنا.
 * **محاولة سابقة دمجت مع `current` مقروءة في هذه الدالّة نفسها، وكانت خطأً
 * حقيقيًّا لا أسلوبًا**: نقرتان متقاربتان (الوضع ثم الكثافة) تُنتجان قراءتي
 * `current` متزامنتين قبل أن تستقرّ أولاهما، فتكتب الثانية فوق الأولى —
 * فقدان تحديث حقيقي كشفته مراجعة Gate B. `patchSettings` (`shared/settings/index.ts`)
 * تقرأ `current` بنفسها **وقت التنفيذ الفعلي** وتدمج مستوًى واحدًا — وهذا
 * وحده ما يضمن صحّة التزامن، لا قراءةٌ مسبَقة هنا. الطباعة تحتاج `as never`
 * لأن `Settings['appearance']` مخرَجًا كاملًا غير جزئي (نفس نمط
 * `tests/unit/settings.test.ts:78`).
 */
export function saveAppearance(patch: Partial<Settings['appearance']>): Promise<Result<Settings>> {
  return patchSettings({ appearance: patch } as never)
}
