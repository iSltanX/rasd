/**
 * مسار التنزيل — أيّ طريقٍ يُسلَك، ومتى يُسأل، وماذا يُقال عند الرفض.
 *
 * **صلاحية `downloads` اختيارية بقرارٍ سابق**: `permission-policy.ts` ينقلها
 * من الدائمة لأنها تُظهر تحذير «إدارة تنزيلاتك» عند التثبيت. فالمنتج يعمل
 * بدونها، ويعمل **أفضل** معها — وهذا الملفّ يحسم الفرق بلا أن يخفيه.
 *
 * | الطريق | يحتاج الصلاحية | ما يعطيه |
 * | --- | --- | --- |
 * | `managed` | نعم | اختيار المجلّد والاسم · «افتح المجلّد» · مسارٌ يُعرض |
 * | `anchor` | لا | ينزل إلى مجلّد التنزيلات الافتراضي باسمٍ مقترَح |
 *
 * **ولا يُعاد السؤال في الجلسة نفسها.** رفضٌ واحد يعني رفضًا، وإعادةُ
 * البطاقة عند كل نقرة تحويلُ الاختيار إلى مضايقة. والرفض **لا يُفشل
 * التصدير**: يُسلَك `anchor` فورًا ويُعلَن ما فُقد.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

/** ما نعرفه عن الصلاحية الآن — حالةٌ لا نتيجةُ نداء. */
export type PermissionState = 'granted' | 'denied' | 'unknown'

export type DownloadRoute = 'managed' | 'anchor'

export interface DownloadDecision {
  readonly route: DownloadRoute
  /**
   * هل تُطلَب الصلاحية الآن؟
   *
   * **يُقرأ داخل معالج النقرة ويُنفَّذ متزامنًا.** `chrome.permissions.request`
   * يرمي إن استُدعي خارج سلسلة إيماءة المستخدم، وانتظارُ الخبز قبله يكسرها —
   * وهو عين ما يحذّر منه تعليق `permissions.ts` وما تفعله `Popup.tsx` صوابًا.
   */
  readonly ask: boolean
  /** ما فُقد بسلوك هذا الطريق، أو `null` إن لم يُفقَد شيء. */
  readonly note: string | null
}

/**
 * ما يُعلَن عند التدهور.
 *
 * **يسمّي المفقود بعينه** لا «تعذّر». والمستخدم الذي رفض عن قصد يستحقّ أن
 * يعرف ما اشتراه رفضه، لا أن يظنّ أن شيئًا تعطّل.
 */
export const DEGRADE_NOTE =
  'بلا صلاحية التنزيل يذهب الملفّ إلى مجلّد التنزيلات الافتراضي مباشرةً — بلا اختيار مكانٍ ولا زرّ «افتح المجلّد».'

/**
 * الطريق المناسب لحالة الصلاحية.
 *
 * `unknown` هي الحالة الوحيدة التي تُسأل فيها: `granted` لا تحتاج سؤالًا،
 * و`denied` سُئلت وأُجيبت — والسؤال ثانيةً نقضٌ لجوابها.
 */
export function planDownload(state: PermissionState): DownloadDecision {
  switch (state) {
    case 'granted':
      return { route: 'managed', ask: false, note: null }
    case 'denied':
      return { route: 'anchor', ask: false, note: DEGRADE_NOTE }
    case 'unknown':
      return { route: 'anchor', ask: true, note: null }
  }
}

/**
 * الطريق بعد أن يُجيب المستخدم على البطاقة.
 *
 * **و`error` تُعامَل معاملة `denied` في الطريق لا في الذاكرة**: التصدير يمضي
 * على `anchor` كما في الرفض، لكن عطلًا تقنيًّا ليس قرارًا من المستخدم — فلا
 * يُسجَّل رفضًا للجلسة، ويُسأل مرّةً أخرى في المرّة التالية.
 */
export function afterAsk(outcome: 'granted' | 'denied' | 'error'): {
  readonly decision: DownloadDecision
  readonly remember: PermissionState | null
} {
  if (outcome === 'granted') {
    return { decision: { route: 'managed', ask: false, note: null }, remember: 'granted' }
  }
  if (outcome === 'denied') {
    return { decision: { route: 'anchor', ask: false, note: DEGRADE_NOTE }, remember: 'denied' }
  }
  return { decision: { route: 'anchor', ask: false, note: DEGRADE_NOTE }, remember: null }
}
