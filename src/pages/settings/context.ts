/**
 * منطق صفحة الإعدادات — بلا JSX، نفس نمط `library/context.ts` و`popup/context.ts`.
 */

import { getSettings, patchSettings, watchSettings, type Settings } from '@/shared/settings'

import type { ToolShortcutMode } from '@/shared/modes'
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

/** يكتب تعديلًا جزئيًا على `capture` وحدها — نفس نمط `saveAppearance` أعلاه. */
export function saveCapture(patch: Partial<Settings['capture']>): Promise<Result<Settings>> {
  return patchSettings({ capture: patch } as never)
}

/** يكتب تعديلًا جزئيًا على `annotation` وحدها. */
export function saveAnnotation(patch: Partial<Settings['annotation']>): Promise<Result<Settings>> {
  return patchSettings({ annotation: patch } as never)
}

/** يكتب تعديلًا جزئيًا على `colors` وحدها. */
export function saveColors(patch: Partial<Settings['colors']>): Promise<Result<Settings>> {
  return patchSettings({ colors: patch } as never)
}

/**
 * يكتب حرف اختصار أداة واحدة — لا خريطة كاملة.
 *
 * **نفس علّة `saveAppearance` بالضبط، رصدتها مراجعة Gate B للوحدة 20.2 لا
 * تخمينًا.** المحاولة الأولى كانت تأخذ الخريطة الكاملة وتشترط على المستدعي
 * دمجها من `props.settings` قبل النداء — وتلك اللقطة **ليست حيّة**: لا
 * تتحدّث إلا بعد جولة كاملة `chrome.storage.onChanged → watchSettings →
 * إعادة رسم`. فتعديلان متتاليان لأداتين مختلفتين، حتى لو `await` كامل بينهما،
 * يريان نفس اللقطة القديمة إن لم تُعِد إعادة الرسم اللحاق — فيكتب الثاني فوق
 * الأوّل ويُفقَد صامتًا. الإصلاح: القراءة الطازجة **هنا**، وقت الكتابة
 * الفعلية، عبر `getSettings()` (تُرجع الذاكرة المؤقّتة التي حدّثها آخر
 * `patchSettings` تزامنيًّا) — لا من لقطة الواجهة.
 */
export async function saveShortcut(
  mode: ToolShortcutMode,
  code: string,
): Promise<Result<Settings>> {
  const current = await getSettings()
  return patchSettings({
    shortcuts: { toolKeys: { ...current.shortcuts.toolKeys, [mode]: code } },
  })
}
