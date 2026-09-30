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

import { filenameStem } from './filename'
import { extensionFor, type ExportFormat } from './format'

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

/**
 * ما يُفعَل بنسخة التنزيلات لحظةَ حفظ لقطة في المكتبة.
 *
 * - `off` — الوجهة «المكتبة وحدها»: لا نسخة، ولا يُسأل عن الصلاحية أصلًا.
 * - `download` — الوجهة تطلبها والصلاحية ممنوحة: تُنزَّل نسخة.
 * - `no-permission` — الوجهة تطلبها والصلاحية مفقودة (رُفضت أو سُحبت لاحقًا من
 *   `chrome://extensions`): تُتخطّى النسخة **والالتقاط ينجح**. المكتبة هي الحفظ الأصلي
 *   والنسخة زيادةٌ عليه، فغيابها لا يجوز أن يُسقط الأصل.
 */
export type MirrorDecision = 'off' | 'download' | 'no-permission'

/**
 * قرار النسخة من قيمة `capture.saveLocation` وحالة الصلاحية.
 *
 * **لا يُسأل عن الصلاحية حين تكون الوجهة المكتبة** — ذلك قرار المنادي: يمرّر `granted`
 * جاهزةً فقط إن كانت الوجهة تطلب النسخة. والدالة خالصة: لا تقرأ `chrome.*` ولا تطلب شيئًا.
 */
export function planMirror(
  location: 'library' | 'library-and-downloads',
  granted: boolean,
): MirrorDecision {
  if (location === 'library') return 'off'
  return granted ? 'download' : 'no-permission'
}

/** مجلّد النسخ داخل مجلّد التنزيلات — اسم المنتج بالعربية. */
export const MIRROR_FOLDER = 'رصد'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * اسم ملفّ النسخة نسبةً إلى مجلّد التنزيلات: `رصد/<الجذع>-<YYYYMMDD-HHmmss>.<امتداد>`.
 *
 * **لماذا مجلّد فرعي.** عشرات اللقطات تتراكم، وإلقاؤها في جذر التنزيلات بين ملفّات المستخدم
 * الأخرى يجعل «أين لقطاتي؟» سؤالًا بلا جواب. المجلّد يجمعها ويُعرف باسم المنتج. و`/` هنا
 * فاصل مسار نسبيّ تقبله `chrome.downloads` (لا يقبل مساراتٍ مطلقة ولا `..`)؛ والعنوان نفسه
 * لا يستطيع أن يُنتج مجلّدًا آخر لأن `filenameStem` يستبدل `/` و`\` بمسافة.
 *
 * **لماذا الختم الزمني.** لقطتان لصفحة واحدة عنوانهما واحد، وبلا الختم تتطابق الأسماء
 * فتُستبدَل الثانيةُ بالأولى أو تُرقَّم صامتةً بحسب إعداد المتصفّح. والختم بالثانية يكفي لأن
 * حدّ Chrome نداءان في الثانية وفاصلنا 550ms. و`conflictAction: 'uniquify'` في النداء خطّ
 * الدفاع الثاني لا الأوّل.
 *
 * **بتوقيت الجهاز المحلّي لا UTC**: الاسم يقرؤه صاحب اللقطة بساعته، و«٢٣:٠٠» عنده لا
 * يصير «٠٢:٠٠» من اليوم التالي. والأرقام لاتينية — قيمة تقنية في اسم ملفّ لا عدٌّ بشري.
 */
export function mirrorFilename(title: string, createdAt: number, format: ExportFormat): string {
  const d = new Date(createdAt)
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  return `${MIRROR_FOLDER}/${filenameStem(title)}-${date}-${time}.${extensionFor(format)}`
}
