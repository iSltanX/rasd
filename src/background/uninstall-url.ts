import { OWNER_PAGES_LIVE, UNINSTALL_SURVEY_URL } from '@/shared/links'

/**
 * رابط ما بعد الإزالة (`chrome.runtime.setUninstallURL`) — بلا صلاحية، ويحفظه المتصفّح لا العامل. ويُضبط حين
 * تكون صفحات المالك منشورة وحده (`OWNER_PAGES_LIVE`).
 *
 * يُضبط عند كل إقلاع للعامل لا عند `onInstalled` وحده: الإقلاع رخيص، والنداء يستبدل ما قبله، فبناءٌ
 * أطفأ الصفحة يمحو رابطًا ضبطه بناءٌ سابق (`''` يلغي الرابط). والرابط يُمرَّر حرفًا كما هو في
 * `shared/links.ts`: لا معرّف ولا نسخة ولا لغة تُلحق به.
 */
export function registerUninstallUrl(enabled: boolean = OWNER_PAGES_LIVE): void {
  chrome.runtime.setUninstallURL(enabled ? UNINSTALL_SURVEY_URL : '').catch(() => {
    /* المتصفّح رفض الرابط — لا شيء يُفعل في العامل، والإزالة تمضي بلا صفحة */
  })
}
