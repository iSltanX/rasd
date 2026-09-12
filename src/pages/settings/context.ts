/**
 * منطق صفحة الإعدادات — بلا JSX، نفس نمط `library/context.ts` و`popup/context.ts`.
 */

import { patchSettings, updateSettings, watchSettings, type Settings } from '@/shared/settings'
import { normalizeSitePattern } from '@/shared/site-match'

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
 * الأوّل ويُفقَد صامتًا. الإصلاح: القراءة الطازجة وقت الكتابة الفعلية لا من
 * لقطة الواجهة.
 *
 * **ورُقِّي الإصلاح في الوحدة 20.3** من `getSettings()` هنا إلى
 * `updateSettings` — فالقراءة تدخل طابور الكتابة معها. القراءة هنا كانت
 * تكفي التتابع ولا تكفي التزامن الحقيقي: نداءان متزامنان فعلًا يقرآن الحالة
 * نفسها قبل أن تكتب أوّلهما. مقيسٌ على القائمة لا على الخريطة (`§6` صفّ
 * 113)، والشكل واحد فسُدّ في الاثنين.
 */
export function saveShortcut(mode: ToolShortcutMode, code: string): Promise<Result<Settings>> {
  return updateSettings((current) => ({
    shortcuts: { toolKeys: { ...current.shortcuts.toolKeys, [mode]: code } },
  }))
}

/** يكتب تعديلًا جزئيًا على `privacy` وحدها — نفس نمط `saveAppearance`. */
export function savePrivacy(patch: Partial<Settings['privacy']>): Promise<Result<Settings>> {
  return patchSettings({ privacy: patch } as never)
}

/**
 * يعدّل قائمة المواقع المستثناة — **بقراءة طازجة وقت الكتابة، إلزامًا**.
 *
 * `patchSettings` تدمج مستوًى واحدًا من الكائنات و**تستبدل المصفوفات
 * استبدالًا** (`shared/settings/index.ts`: الدمج مشروط بـ`!Array.isArray`).
 * فبناء القائمة الجديدة من `props.settings` — وهي لقطةٌ لا تتحدّث إلّا بعد
 * جولة كاملة `chrome.storage.onChanged → watchSettings → إعادة رسم` —
 * يجعل إضافتين متتاليتين تكتب ثانيتُهما مصفوفةً لا تحوي الأولى. وهذا **عين
 * العطل** الذي رصدته مراجعة Gate B في `saveShortcuts` بالوحدة 20.2 وفي
 * `saveAppearance` بالوحدة 20.1، وهنا أخطر: الضحية قائمة خصوصية لا تفضيل
 * عرض، وفقدان إدخالٍ منها يعني حقنًا في موقعٍ ظنّ المستخدم أنه حماه.
 *
 * `mutate` تُنفَّذ **داخل** طابور الكتابة عبر `updateSettings`، على حالةٍ
 * قُرئت بعد استقرار كل كتابة سابقة — لا على لقطة الواجهة ولا على قراءةٍ
 * سبقت الطابور. والفرق مقيس: نقرتان متزامنتان على «أنماط شائعة» كانتا
 * تُسقطان أحد الموقعين صامتًا.
 */
function editExcludedSites(
  mutate: (current: readonly string[]) => string[],
): Promise<Result<Settings>> {
  return updateSettings(
    (current) => ({ privacy: { excludedSites: mutate(current.privacy.excludedSites) } }) as never,
  )
}

/**
 * يضيف نمطًا بعد تطبيعه — ويرفض ما لا يصلح **قبل** الحفظ لا بعده.
 *
 * `normalizeSitePattern` مُصدَّرة من `shared/site-match.ts` لهذا الغرض
 * بالنصّ: «نمطٌ يُرفض هنا يجب أن يُرفض أمام المستخدم بنصٍّ يشرح، لا أن
 * يُحفَظ صامتًا ثمّ يُتخطّى وقت المطابقة — وذاك بعينه هو يظنّ نفسه محميًّا
 * وليس».
 *
 * والمحفوظ هو **المُطبَّع** لا ما كُتب: `HTTPS://Bank.com./login?x=1` يُحفظ
 * `bank.com`، فيرى المستخدم في القائمة ما سيُطابَق فعلًا لا ما كتبه.
 */
export async function addExcludedSite(raw: string): Promise<Result<Settings> | 'invalid'> {
  const pattern = normalizeSitePattern(raw)
  if (pattern === null) return 'invalid'
  const value = patternLabel(pattern)
  return editExcludedSites((current) =>
    current.includes(value) ? [...current] : [...current, value],
  )
}

/** يحذف نمطًا واحدًا بنصّه المحفوظ. */
export function removeExcludedSite(value: string): Promise<Result<Settings>> {
  return editExcludedSites((current) => current.filter((site) => site !== value))
}

/**
 * يدمج قائمة مستوردة — **دمجًا لا استبدالًا، وبتخطّي التالف لا رفض الملفّ**.
 *
 * الاستبدال كان سيمحو ما بناه المستخدم بيده باستيرادٍ واحد؛ والرفض الكامل
 * لملفٍّ فيه سطر تالف كان سيُسقط عشرين نمطًا صحيحًا بسبب واحد. والمُرجَع
 * عدد ما أُضيف فعلًا وعدد ما رُفض، كي تقول الواجهة الحقيقة لا «تمّ».
 */
export async function importExcludedSites(
  raw: readonly unknown[],
): Promise<{ result: Result<Settings>; added: number; rejected: number }> {
  const normalized: string[] = []
  let rejected = 0
  for (const entry of raw) {
    const pattern = typeof entry === 'string' ? normalizeSitePattern(entry) : null
    if (pattern === null) {
      rejected += 1
      continue
    }
    normalized.push(patternLabel(pattern))
  }

  let added = 0
  const result = await editExcludedSites((current) => {
    const merged = [...current]
    for (const value of normalized) {
      if (merged.includes(value)) continue
      merged.push(value)
      added += 1
    }
    return merged
  })
  return { result, added, rejected }
}

/**
 * الشكل المحفوظ لنمطٍ خام، أو `null` إن لم يصلح.
 *
 * **مُصدَّرة كي تقارن الواجهة مِثلًا بمِثل.** قائمة «أنماط شائعة» كانت تقارن
 * النصّ الخام (`*.bank.com`) بالمحفوظ (`bank.com`) فلا يختفي الاقتراح بعد
 * إضافته، والنقر عليه ثانيةً لا يفعل شيئًا بلا إشعار. رصدته مراجعة Gate B.
 */
export function savedFormOf(raw: string): string | null {
  const pattern = normalizeSitePattern(raw)
  return pattern === null ? null : patternLabel(pattern)
}

/**
 * النصّ المحفوظ لنمطٍ مُطبَّع — يُعاد بناؤه من أجزائه لا يُحتفظ بالخام.
 *
 * `SitePattern` تحمل المضيف والمنفذ وبادئة المسار مفكَّكة، فالنصّ يُركَّب
 * منها كي يبقى ما يُعرَض هو ما يُطابَق. و`*` وحدها تعني «كل المواقع»
 * وتُحفَظ كما هي — لها معنًى في المُطابِق، وتركيبها من مضيفٍ فارغ يفقده.
 */
function patternLabel(pattern: ReturnType<typeof normalizeSitePattern>): string {
  if (pattern === null || pattern.everywhere) return '*'
  const port = pattern.port === '' ? '' : `:${pattern.port}`
  const path = pattern.pathPrefix === null ? '' : `${pattern.pathPrefix}*`
  return `${pattern.host}${port}${path}`
}
