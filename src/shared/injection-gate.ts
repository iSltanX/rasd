/**
 * **البوّابة الواحدة للحقن** — القرار الخالص.
 *
 * كل مسار يريد تشغيل شيء داخل صفحة يمرّ من هنا: الاختصارات، وقائمة السياق،
 * والنافذة، والالتقاط، والاستئناف التلقائي. لا أحد ينادي `checkInjectable`
 * مباشرةً — ويحرس ذلك محدِّد لنت لا اتفاق (‏`eslint.config.js`، وبرهانه في
 * `tests/unit/architecture-boundaries.test.ts`).
 *
 * **لماذا بوّابة واحدة أصلًا.** كان الفحص منسوخًا في ثمانية مواضع، وكان
 * `canOperateOnTab` **بلا مستدعٍ واحد** — لا سهوًا بل لأنها سكنت
 * `background/index.ts`، أي نقطة إقلاع الـservice worker التي تستورد
 * `commands` و`lifecycle` و`resume` و`context-menus` وتُسجّل مستمعاتها في
 * مستواها الأعلى. فأيُّ مستدعٍ منها يُنتج دورة استيراد يُسقطها
 * `import-x/no-cycle`. بوّابةٌ غير قابلة للنداء من موضعها ليست بوّابة.
 * ولذلك فُصل القرار إلى هنا — خالصًا في `shared/` — وفُصل غلافه غير الخالص
 * إلى `background/gate.ts`.
 *
 * **ولماذا يهمّ التوحيد أمنيًّا.** المستثنى يُنفَّذ في موضع واحد، فإضافة
 * شرط لاحق (وضع خاص، قفل مكتبة، سياسة مؤسسة) تُورَّث لكل مسار دفعةً واحدة
 * بدل ثمانية تعديلات يُنسى أحدها.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import { checkInjectable, restrictionMessage, type RestrictionReason } from './restricted'
import { isSiteExcluded } from './site-match'

/**
 * سبب المنع — أسباب المتصفح، وسببان يخصّان البوّابة.
 *
 * `excluded-site`: قرار المستخدم صراحةً.
 * `settings-unavailable`: **لم تُقرأ الإعدادات، فلا نعرف قائمته**.
 */
export type GateReason = RestrictionReason | 'excluded-site' | 'settings-unavailable'

export type GateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: GateReason }

const ALLOWED: GateDecision = { allowed: true }
const deny = (reason: GateReason): GateDecision => ({ allowed: false, reason })

/**
 * القرار الخالص: عنوانٌ وقائمة استثناء ⟵ يُسمح أو يُمنع ولماذا.
 *
 * **الترتيب مقصود: قيد المنصّة أوّلًا.** `chrome://` و`view-source:` وعارض
 * PDF تمنع الحقن أيًّا كانت الإعدادات — فالحقن فيها يرمي خطأً على كل حال،
 * وذكرُ السبب الحقيقي أنفع للمستخدم من «موقع مستثنى».
 *
 * **ولا اختصار عند قائمةٍ فارغة.** الفراغ يُفحَص داخل `isSiteExcluded`
 * لا هنا: شرطٌ مثل `if (excluded.length) …` يغري من يقرأه لاحقًا بأن يجعل
 * البوّابة كلّها مشروطة بوجود قائمة.
 */
export function evaluateGate(
  url: string | undefined | null,
  excludedSites: readonly string[],
): GateDecision {
  const check = checkInjectable(url)
  if (!check.injectable) return deny(check.reason)
  // `url` نصٌّ صالح بالضرورة هنا — `checkInjectable` يمنع ما عداه.
  return isSiteExcluded(url as string, excludedSites) ? deny('excluded-site') : ALLOWED
}

/** نصّ عربي يشرح سبب المنع — تعرضه النافذة والالتقاط. */
export function gateMessage(reason: GateReason): string {
  switch (reason) {
    case 'excluded-site':
      return 'هذا الموقع في قائمة المواقع المستثناة. عدّلها من الإعدادات.'
    case 'settings-unavailable':
      return 'تعذّرت قراءة إعدادات الخصوصية، فأُوقف الفحص احتياطًا. أعد المحاولة.'
    default:
      return restrictionMessage(reason)
  }
}
