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
 * **الجولة تتقدّم إلى الواجهة ما لم يتقدّم إليها شيءٌ آخر.** تبويبٌ نشط يُفتح فوق تبويبٍ في نافذته
 * يُخفيه، وصفحةٌ مخفيّة لا ترسم (`visibilityState: hidden`). وقِيس ذلك على حارسَين يفتحان صفحة
 * رصد لحظة التحميل (`verify-library` و`verify-compare-diff`، ملفّ تعريف جديد = تثبيت في كل جولة):
 * صفحتهما خُبّئت خلف الجولة وجرى الحارس على صفحة لا تُرسم. فالجولة تُفتح **في الخلفية** ثمّ تُقدَّم
 * بشرطين:
 *
 * 1. ما كان في الواجهة لحظة التثبيت ما يزال فيها — لم يُفتح بعدها شيءٌ تقدّم عليها.
 * 2. وليس صفحةً من رصد نفسه — من كان في رصد لا يُنتزع منه.
 *
 * والتثبيت الحقيقي يستوفيهما: في الواجهة صفحة المتجر أو صفحة الإضافات. **وطلبا «ما في الواجهة»
 * و«افتح في الخلفية» يصدران متزامنين مع الحدث قبل أي `await`**، فيُعالَجان قبل أي طلبٍ يصدر من العامل
 * بعدهما — ومنه تبويب حارسٍ يُقيِّم `chrome.tabs.create` داخل العامل بعد ارتباطه به.
 */
export async function handleInstalled(
  details: InstallDetails,
  version: string = VERSION,
): Promise<InstallOutcome> {
  if (isIncognitoContext()) return 'ignored'

  if (details.reason === 'install') {
    const front = chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const created = chrome.tabs.create({
      url: chrome.runtime.getURL(PAGE_PATHS.onboarding),
      active: false,
    })
    try {
      const [[before], tour] = await Promise.all([front, created])
      if (tour.id === undefined) return 'onboarding'
      const [now] = await chrome.tabs.query({ active: true, windowId: tour.windowId })
      if (now && now.id !== tour.id && now.id === before?.id && !isOwnPage(now)) {
        await chrome.tabs.update(tour.id, { active: true })
      }
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
 * صفحةٌ من رصد نفسه؟ عنوان صفحات الإضافة مقروءٌ لها بلا صلاحية `tabs` (قِيس)، وما سواه يصل فارغًا
 * فيُقرأ «ليست منّا». و`pendingUrl` لصفحةٍ ما يزال تنقّلها إليها جاريًا.
 */
function isOwnPage(tab: chrome.tabs.Tab): boolean {
  const origin = chrome.runtime.getURL('')
  return [tab.url, tab.pendingUrl].some((url) => url?.startsWith(origin) === true)
}

/**
 * هل `version` أعلى من السابقة؟ سابقةٌ غائبة أو غير صالحة تُقرأ «لا»: عرض «ما الجديد» على جهلٍ
 * بما كان قبلها وعدٌ بفرقٍ لا نعرفه.
 */
function isNewer(version: string, previous: string | undefined): boolean {
  if (!previous || !isVersion(previous) || !isVersion(version)) return false
  return compareVersions(version, previous) > 0
}
