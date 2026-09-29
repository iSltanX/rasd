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
 * سبب المنع — أسباب المتصفح، وثلاثة تخصّ البوّابة.
 *
 * `excluded-site`: قرار المستخدم صراحةً.
 * `incognito-off`: قرار المستخدم كذلك، لكنه عن **السياق** لا عن الموقع.
 * `settings-unavailable`: **لم تُقرأ الإعدادات، فلا نعرف قائمته**.
 */
export type GateReason =
  RestrictionReason | 'excluded-site' | 'incognito-off' | 'settings-unavailable'

/**
 * سياق التبويب الذي لا يُقرأ من عنوانه — يُمرَّر ولا يُستنتَج.
 *
 * **ولماذا يُمرَّر `incognito` بدل قراءته هنا.** البديل الوحيد المتاح داخل
 * `shared/` هو `isIncognitoContext()` (‏`shared/env.ts`)، وهي تقرأ
 * `chrome.extension.inIncognitoContext` — واجهةٌ توثّقها أنواع Chrome
 * لـ«صفحات الإضافة» والـservice worker ليس صفحة، فقيمتها داخل العامل **غير
 * مقيسة في هذا المستودع** (‏`Docs/Engineering.md §6` صفّ 121). بينما
 * `chrome.tabs.Tab.incognito` حقلٌ موثَّق على الكائن الذي يقرؤه
 * `background/gate.ts` **أصلًا** قبل كل قرار — فالقرار يقوم على المقيس لا
 * على المفترَض، ويبقى هذا الملفّ خالصًا كما هو.
 */
export interface GateContext {
  /** هل التبويب في نافذة خاصّة؟ من `chrome.tabs.Tab.incognito`. */
  readonly incognito: boolean
  /** `privacy.incognito` كما هي في الإعدادات. */
  readonly incognitoMode: 'allow' | 'no-save' | 'off'
}

const OPEN_CONTEXT: GateContext = { incognito: false, incognitoMode: 'no-save' }

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
  context: GateContext = OPEN_CONTEXT,
): GateDecision {
  const check = checkInjectable(url)
  if (!check.injectable) return deny(check.reason)

  /*
   * **السياق قبل الموقع** حين يصدق الاثنان. كلاهما قرار مستخدم، لكن
   * «عطّلتُ رصدًا في التصفّح الخاص» يفسّر للمستخدم ما يراه الآن، بينما
   * «هذا الموقع مستثنى» يرسله يعدّل قائمةً ليست هي السبب في هذه النافذة.
   */
  if (context.incognito && context.incognitoMode === 'off') return deny('incognito-off')

  // `url` نصٌّ صالح بالضرورة هنا — `checkInjectable` يمنع ما عداه.
  return isSiteExcluded(url as string, excludedSites) ? deny('excluded-site') : ALLOWED
}

/** نصّ عربي يشرح سبب المنع — تعرضه النافذة والالتقاط. */
export function gateMessage(reason: GateReason): string {
  switch (reason) {
    case 'excluded-site':
      return 'هذا الموقع في قائمة المواقع المستثناة. عدّلها من الإعدادات.'
    case 'incognito-off':
      return 'رصد معطَّل في التصفّح الخاص باختيارك. غيّره من إعدادات الخصوصية.'
    case 'settings-unavailable':
      return 'تعذّرت قراءة إعدادات الخصوصية، فأُوقف الفحص احتياطًا. أعد المحاولة.'
    default:
      return restrictionMessage(reason)
  }
}
