/**
 * غلاف البوّابة في الخلفية — يجلب ما يحتاجه القرار الخالص ثم يستدعيه.
 *
 * **ملفٌّ مستقلّ لا دالّة في `index.ts`.** البوّابة كانت تسكن هناك وهي
 * **بلا مستدعٍ واحد**: `index.ts` نقطة إقلاع الـservice worker، تستورد
 * `commands` و`lifecycle` و`resume` و`context-menus` وتُسجّل مستمعاتها في
 * مستواها الأعلى — فأيُّ استيراد عكسي منها دورةٌ يُسقطها `import-x/no-cycle`،
 * ولو مرّت لأعادت تسجيل المستمعات. فالموضع هو العلّة، لا الإغفال.
 *
 * **ولماذا `tabId` لا `Tab`.** المستدعي قد يحمل كائن تبويب التُقط قبل
 * انتظارٍ أو اثنين، وعنوانه حينها ماضٍ. فيُقرأ التبويب هنا طازجًا، مباشرةً
 * قبل القرار الذي يسبق الحقن. تبقى فجوة بين القرار والحقن لا تسدّها
 * الواجهة المتاحة — تُذكَر كما تُذكَر في `capture-service.ts` بدل ادّعاء
 * إحكام لا وجود له.
 */
import { evaluateGate, type GateDecision } from '@/shared/injection-gate'
import { getSettingsResult } from '@/shared/settings'

/**
 * هل يُسمح بالتشغيل داخل هذا التبويب الآن؟
 *
 * **يُغلَق عند الجهل لا عند الخطأ وحده.** تبويبٌ اختفى، أو إعدادات لم
 * تُقرأ — كلاهما «لا أعرف»، والحقن على «لا أعرف» هو بعينه نقضُ وعد
 * الاستثناء. والثمن مقبول: الفشل يظهر للمستخدم بنصٍّ يشرح ويطلب إعادة
 * المحاولة، لا صمتًا.
 */
export async function canOperateOnTab(tabId: number): Promise<GateDecision> {
  let tab: chrome.tabs.Tab
  try {
    // قراءةٌ طازجة واحدة تحمل الحقلين — لا نداء ثانٍ ولا استنتاج سياق.
    tab = await chrome.tabs.get(tabId)
  } catch {
    return { allowed: false, reason: 'invalid-url' }
  }

  const settings = await getSettingsResult()
  if (!settings.ok) return { allowed: false, reason: 'settings-unavailable' }

  const { privacy } = settings.value
  return evaluateGate(tab.url, privacy.excludedSites, {
    incognito: tab.incognito,
    incognitoMode: privacy.incognito,
  })
}
