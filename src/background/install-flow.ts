/**
 * التثبيت والترقية — جولة التعريف و«ما الجديد».
 *
 * **مستمع `onInstalled` وحده يقرّر، لا حالةٌ تُقرأ عند كل إقلاع.** الـservice worker في MV3 يُقلع
 * عشرات المرّات في الساعة، وإعادة تشغيل المتصفّح تُطلق `onStartup` لا `onInstalled` — فقرارٌ مبنيّ
 * على السبب الذي يعطيه المتصفّح لا يقع إلا مرّة لكل تثبيت أو ترقية، بلا علامة تُقرأ فتُخطئ.
 *
 * - `install`: تُفتح صفحة التأهيل. ولا كتابة إعدادات: التثبيت الجديد تخزينه فارغ، وافتراضياته
 *   («لم يُشاهَد»، ولا «ما الجديد» معلَّقة) هي ما يلزمه بالضبط.
 * - `update`: مستخدمٌ قائم **يُعامَل «شوهد»** فلا تفاجئه ترحيبيّة النافذة بعد تحديث، وتُعلَّق بطاقة
 *   «ما الجديد» **إن كانت النسخة أعلى** من السابقة — إعادة تحميل الإضافة بالنسخة نفسها سببها
 *   `update` أيضًا، ولا جديد فيها.
 * - `chrome_update` و`shared_module_update`: لا شيء — تحديث المتصفّح ليس تحديث رصد.
 *
 * والتصفّح الخاص (`incognito: "split"`) نسخةٌ ثانية من العامل تسمع الحدث نفسه: صفحةٌ ثانية فوق
 * الأولى، وكتابةٌ ثانية للإعدادات نفسها. فيُترك الحدث فيها.
 */

import { isIncognitoContext, VERSION } from '@/shared/env'
import { PAGE_PATHS } from '@/shared/page-paths'
import { updateSettings } from '@/shared/settings'
import { compareVersions, isVersion } from '@/shared/version'

/** ما يحتاجه القرار من تفاصيل الحدث — والنوع الكامل في `@types/chrome`. */
export interface InstallDetails {
  reason: string
  previousVersion?: string | undefined
}

/** ما فعله المستمع — للاختبار وللسجلّ. */
export type InstallOutcome = 'onboarding' | 'upgraded' | 'reloaded' | 'ignored' | 'failed'

export function registerInstallFlow(): void {
  chrome.runtime.onInstalled.addListener((details) => void handleInstalled(details))
}

/**
 * **فتح الصفحة أوّل ما يقع في المستمع، قبل أي `await`.** حرّاس كروم تحمّل الإضافة في ملفّ تعريف
 * جديد — أي تثبيتٌ في كل جولة — ثمّ تفتح تبويبها نشطًا وتلتقطه. تبويب التأهيل إن وصل بعد تبويبها
 * سرق التنشيط منه؛ وحين يُطلب متزامنًا مع الحدث يسبق كل ما تفعله بعد ارتباطها بالعامل.
 */
export async function handleInstalled(
  details: InstallDetails,
  version: string = VERSION,
): Promise<InstallOutcome> {
  if (isIncognitoContext()) return 'ignored'

  if (details.reason === 'install') {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL(PAGE_PATHS.onboarding) })
      return 'onboarding'
    } catch (e) {
      console.warn(`[رصد] تعذّر فتح جولة التعريف: ${String(e)}`)
      return 'failed'
    }
  }

  if (details.reason !== 'update') return 'ignored'

  const newer = isNewer(version, details.previousVersion)
  const written = await updateSettings((current) => ({
    ...(current.onboarding.completed
      ? {}
      : { onboarding: { completed: true, completedAt: current.onboarding.completedAt } }),
    ...(newer ? { whatsNew: { pending: version } } : {}),
  }))
  if (!written.ok) {
    // `updateSettings` لا تكتب على قراءة فاشلة — فلا شيء كُتب، والبطاقة تفوت هذه الترقية وحدها.
    console.warn(`[رصد] تعذّر تسجيل الترقية: ${written.error.message}`)
    return 'failed'
  }
  return newer ? 'upgraded' : 'reloaded'
}

/**
 * هل `version` أعلى من السابقة؟ سابقةٌ غائبة أو غير صالحة تُقرأ «لا»: عرض «ما الجديد» على جهلٍ
 * بما كان قبلها وعدٌ بفرقٍ لا نعرفه.
 */
function isNewer(version: string, previous: string | undefined): boolean {
  if (!previous || !isVersion(previous) || !isVersion(version)) return false
  return compareVersions(version, previous) > 0
}
