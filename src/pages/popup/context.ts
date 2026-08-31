/**
 * تحميل بيانات النافذة — منطق بلا JSX، منفصل عن `Popup.tsx` عمدًا حتى يُختبر
 * بمحاكاة `chrome.*` (`@webext-core/fake-browser`) بلا تركيب أي مكوّن.
 *
 * القرار الوحيد غير البديهي هنا: `checkInjectable(url)` يُستدعى محليًّا لا عبر
 * رسالة `tab/can-operate` — النافذة تملك عنوان التبويب أصلًا من
 * `chrome.tabs.query`، فرحلة رسالة إضافية إلى الـservice worker لإعادة نفس
 * الفحص الخالص لا تضيف شيئًا، فقط زمن انتظار قبل فتح النافذة (المعيار: أقل
 * من 100ms).
 */

import { findReferenceForPage } from '@/modules/compare/reference'
import { VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { send } from '@/shared/messaging'
import { hasHostPermission, originPatternFor } from '@/shared/permissions'
import { checkInjectable } from '@/shared/restricted'
import { annotations, blobs, captures } from '@/shared/storage/repository'

import type { PopupContext } from '@/shared/popup-state'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { ActiveMode, SessionState } from '@/shared/storage/session'

export interface RecentEntry {
  readonly record: CaptureRecord
  readonly thumbUrl: string | null
  /**
   * حُجبت المصغَّرة لأن اللقطة عُلِّق عليها بحجب غير قابل للعكس.
   *
   * تُميَّز عن `thumbUrl === null` الناتج عن بايتات مفقودة: الأولى قرارٌ
   * أمني يُشرَح للمستخدم، والثانية عطل.
   */
  readonly withheld: boolean
}

/** يُعرَض بدل الأصل. */
export const WITHHELD_LABEL = 'معلَّق عليها بحجب — افتح المحرر'

/**
 * يجلب أحدث لقطتين مع صورهما المصغَّرة — الأحدث أولًا.
 *
 * **ولقطةٌ حُجب فيها شيء لا تُعرض بأصلها.** النافذة كانت تعرض بلوب اللقطة
 * **السليم كاملًا** لآخر لقطتين: يفتح المستخدم المحرر، ويغطّي كلمة مرور،
 * ويحفظ — ثمّ تعرضها النافذة مكشوفة على شاشته وعلى أي شاشة يشاركها.
 *
 * والمرحلة 15 هي التي تخلق التوقّع («لا يمكن استرجاع ما تحتها»)، فهي التي
 * تملك واجب إغلاق أوّل مسار حيّ ينقضه. والثمن قراءتان إضافيتان من قاعدة
 * البيانات لصفّين — ويُقرآن من **حقل مسطَّح** لا بفكّ المشهد، وهو الفرق
 * بين حارسٍ يعمل في كل مسار وحارسٍ غالٍ يُتخطّى.
 */
export async function loadRecent(): Promise<RecentEntry[]> {
  const list = await captures.byIndex('createdAt')
  if (!list.ok) return []
  const latest = list.value
    .filter((r) => r.trashedAt === null)
    .slice(-2)
    .reverse()

  return Promise.all(
    latest.map(async (record) => {
      const note = await annotations.get(record.id)
      const withheld = note.ok && (note.value.redaction?.irreversible ?? 0) > 0
      if (withheld) return { record, thumbUrl: null, withheld: true }

      const blob = await blobs.get(record.id)
      return {
        record,
        thumbUrl: blob.ok ? URL.createObjectURL(blob.value.blob) : null,
        withheld: false,
      }
    }),
  )
}

/**
 * يبني `PopupContext` كاملًا لتبويب واحد.
 *
 * `online` وحدها لا تصل من هنا رغم كونها جزءًا من `PopupContext` — القيمة
 * الابتدائية تُقرأ من `navigator.onLine` في `Popup.tsx` نفسها، والمُستدعي
 * يدمجها لاحقًا مع حدثَي `online`/`offline` الحيَّين؛ إعادة قراءتها هنا فقط
 * تُثبّت قيمة قد تفوتها حالة React قبل أول عرض.
 */
export async function loadPopupContext(
  tabId: number,
  url: string | undefined,
): Promise<Omit<PopupContext, 'online'>> {
  const check = checkInjectable(url)
  const restriction = check.injectable ? { injectable: true as const } : check

  // متوازيتان لا متتاليتان: لا تعتمد إحداهما على نتيجة الأخرى، وكل رحلة
  // رسالة إضافية قبل أول عرض تُحتسَب على ميزانية الـ100ms.
  const [sessionReply, settingsReply, permissionNeeded] = await Promise.all([
    send('session/get', undefined),
    send('settings/get', undefined),
    findPermissionNeed(restriction.injectable ? url : undefined),
  ])

  const session = (sessionReply.ok ? sessionReply.value : {}) as Partial<SessionState>
  const liveMode: ActiveMode | null = session.modes?.[tabId] ?? null
  const job = session.job && session.job.tabId === tabId ? session.job : null

  const onboardingCompleted =
    settingsReply.ok &&
    typeof settingsReply.value === 'object' &&
    (settingsReply.value as { onboarding?: { completed?: boolean } }).onboarding?.completed

  return {
    restriction,
    firstRun: restriction.injectable && !onboardingCompleted,
    permissionNeeded,
    job,
    liveMode,
  }
}

/**
 * هل لهذه الصفحة مرجع مقارنة محفوظ، بلا صلاحية مضيف تُبقيه عبر التنقّل؟
 *
 * **ميزةٌ واحدة تشترط الإذن اليوم**: المقارنة («البقاء عبر التنقّل»،
 * `Rasd_Plan.md §8`) — وترويسة `Permission.tsx` القديمة («لا مسار يطلبها
 * تلقائيًا») لم تعد صحيحة؛ هذا هو ذلك المسار.
 *
 * **بلا رسالة `reference/load`**: تلك تعتمد `context.tabId` (مُرسِلٌ من
 * تبويب)، والنافذة صفحة إضافة بلا تبويب خاصّ بها — تحقن `tabId` التبويب
 * *المستهدَف* في الحمولة، لا تشتقّه من نفسها (نفس تمييز `capture/run`
 * بين مُرسِل من أصلنا وآخر). فتُقرأ `references` مباشرةً هنا، مثلما تقرأ
 * `loadRecent` أعلاه `captures` مباشرةً — النافذة صفحة إضافة بحقّها.
 *
 * **الأربعة مقاسات تُفحَص لا `'custom'` وحدها** — النافذة لا تعرف عرض
 * التبويب المستهدَف الحيّ (`chrome.tabs.Tab` لا يحمل أبعاد واجهة العرض)،
 * فلا سبيل لتصنيفه هنا كما يفعل `content/index.ts` (`classifyViewport`
 * على `window.innerWidth`). البديل الصحيح: مرجعٌ محفوظ لهذه الصفحة على
 * **أيّ** من المقاسات الأربعة يكفي لتبرير طلب الصلاحية — البقاء عبر
 * التنقّل يخدم كل مرجع لا مقاسًا بعينه، وأربع قراءات محلّية من `references`
 * أرخص كثيرًا من رحلة رسالة واحدة (ميزانية الـ100ms أعلاه).
 *
 * **بلا حالة «رُفض من قبل» محفوظة**: تُعاد المطالبة في كل فتح للنافذة ما
 * دام المرجع قائمًا والإذن غير ممنوح — نفس نمط ميزة اختيارية لم تُمنَح
 * بعد، وزرّ «اسمح مرّة واحدة» في `Permission.tsx` هو مخرج الرفض الصريح.
 */
async function findPermissionNeed(
  url: string | undefined,
): Promise<PopupContext['permissionNeeded']> {
  if (!url) return null
  const pattern = originPatternFor(url)
  if (!pattern) return null
  if (await hasHostPermission(pattern)) return null

  try {
    const origin = new URL(url).origin
    const path = new URL(url).pathname
    // متوازية لا متتالية — نفس منطق `Promise.all` في `loadPopupContext`
    // أعلاه، لنفس سبب ميزانية الـ100ms.
    const results = await Promise.all(
      VIEWPORT_ORDER.map((viewport) => findReferenceForPage({ origin, path, viewport })),
    )
    return results.some((r) => r.ok && r.value) ? { origin } : null
  } catch {
    return null
  }
}
