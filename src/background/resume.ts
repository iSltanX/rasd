/**
 * استئناف تلقائي لوضع المقارنة عبر التنقّل — «البقاء عبر التنقّل»
 * (`Docs/Rasd_Ar.md §8`، تنفيذ المرحلة 16).
 *
 * **لا `webNavigation`**: `chrome.tabs.onUpdated` يكفي، ولا صلاحية إضافية
 * تُطلَب — الحارس الفعلي هو صلاحية مضيف **ممنوحة لهذا الأصل تحديدًا**،
 * لا وجود المستمع نفسه. المستمع يستمع لكل تنقّل على كل تبويب، ثم يتحقّق؛
 * والتحقّق رخيص (`chrome.permissions.contains` محليّ بلا شبكة).
 *
 * **ولا فحص حقنٍ هنا.** كان هذا الموضع ينادي `checkInjectable` بنفسه، فصار
 * القرار كلّه في `activateResume` ⟵ `canOperateOnTab` — بوّابةً واحدة. ولا
 * يضيع بذلك ترشيح مبكّر: `originPatternFor` يعيد `null` لكل مخطّط غير
 * `http(s)`، فالصفحات الداخلية تتوقّف هنا كما كانت.
 *
 * **وصلاحية المضيف لا تعلو على استثناء المستخدم.** الصلاحية تُمنح مرّةً
 * ثم تبقى؛ ومن منح أصلًا ثم أضاف الموقع إلى المستثناة كان يُحقَن فيه رغم
 * ذلك — لأن هذا المسار كان يسأل عن الإذن ولا يسأل عن القائمة. البوّابة
 * تسأل عن الاثنين، والمنع يغلب.
 *
 * **بلا تتبّع حالة لكل تبويب**: لا `Map<tabId, …>` هنا. كل حدث `complete`
 * مستقلّ، وقرار الاستئناف من الصلاحية وحدها — لا من كون الطبقة كانت
 * مُقلَعة سابقًا على هذا التبويب أو لا. أبسط، وصحيح: الحقن والإقلاع كلاهما
 * آمن التكرار (`host.ts`، `SESSION_FLAG` في `content/index.ts`).
 */
import { originPatternFor } from '@/shared/permissions'

import { activateResume } from './commands'

export function registerResume(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return
    if (!tab.url) return

    const pattern = originPatternFor(tab.url)
    if (!pattern) return

    void chrome.permissions.contains({ origins: [pattern] }).then((granted) => {
      if (granted) void activateResume(tabId)
    })
  })
}
