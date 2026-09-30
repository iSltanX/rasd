/**
 * تحميل بيانات النافذة — منطق بلا JSX، منفصل عن `Popup.tsx` عمدًا حتى يُختبر
 * بمحاكاة `chrome.*` (`@webext-core/fake-browser`) بلا تركيب أي مكوّن.
 *
 * القرار الوحيد غير البديهي هنا: قرار البوّابة يُحسَب محليًّا لا عبر رسالة
 * `tab/can-operate` — النافذة تملك عنوان التبويب أصلًا من `chrome.tabs.query`،
 * وتجلب `settings/get` في الرحلة نفسها لأسباب أخرى. فـ`evaluateGate` دالّة
 * خالصة على ما بيدها بالفعل، ورحلةٌ إضافية إلى الـservice worker لإعادة
 * الحساب نفسه لا تضيف شيئًا سوى زمن انتظار قبل فتح النافذة (المعيار: أقل
 * من 100ms).
 *
 * **وهذا القرار استشاريّ لا حاسم**، وهو ما يجعل الحساب المحلّي سليمًا: ما
 * تعرضه النافذة يختار الحالة المعروضة، ولا يأذن بحقن. كل زرّ فيها يمرّ
 * بـ`tool/activate` ⟵ `canOperateOnTab` في الخلفية — وتلك وحدها تقرأ
 * الإعدادات بفشلٍ ظاهر وتُغلق عند الجهل.
 */

import { findReferenceForPage } from '@/modules/compare/reference'
import { VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { evaluateGate } from '@/shared/injection-gate'
import { send } from '@/shared/messaging'
import { hasHostPermission, originPatternFor } from '@/shared/permissions'
import { annotations, blobs, captures } from '@/shared/storage/repository'

import type { PopupContext } from '@/shared/popup-state'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { ActiveMode, SessionState } from '@/shared/storage/session'

/** ما تحتاجه النافذة قبل أول عرض ذي معنى: التبويب المستهدَف وحالته وآخر لقطتين. */
export interface PopupLoad {
  readonly tabId: number
  readonly context: PopupContext
  readonly origin: string
  readonly recent: RecentEntry[]
}

/**
 * علامات زمن النافذة في جدول أداء الصفحة — يقرؤها `scripts/verify-popup.mjs`
 * ليطبع مكوّنات «زمن أول عرض» لا مجموعه وحده: تحميل الحزمة (`boot`)، وقراءة
 * التبويب والإعدادات والجلسة والمكتبة (`data`)، والتركيب بالبيانات (`commit`)،
 * ثمّ أول رسم من جدول الرسم نفسه. علامةٌ لا تكلّف شيئًا ولا تغيّر ما يُقاس.
 */
export const POPUP_MARKS = {
  boot: 'rasd:popup:boot',
  data: 'rasd:popup:data',
  commit: 'rasd:popup:commit',
} as const

/**
 * يجلب كل ما يلزم أول عرض — ويُستدعى **عند تقييم الوحدة لا بعد التركيب**.
 *
 * كان الجلب داخل `useEffect`، وPreact يؤجّل `useEffect` إلى ما بعد الإطار
 * التالي (`requestAnimationFrame` ثمّ مهمّة): فتُرسَم قشرة فارغة، وينتظر أول
 * طلب إطارًا كاملًا قبل أن يبدأ. قِيس محلّيًّا: البيانات جاهزة بعد تقييم
 * الحزمة بـ12–14ms، منها نحو 10ms انتظار الإطار وحده. فيبدأ الجلب هنا مع
 * تقييم الحزمة، ويتركّب العرض ساعة وصولها.
 *
 * `null` حين لا تبويب نشِطًا بمعرّف — القشرة الفارغة تبقى كما كانت.
 */
export async function loadPopup(): Promise<PopupLoad | null> {
  // الجلسة والإعدادات والمكتبة لا تحتاج التبويب، فتُطلَب مع استعلامه لا بعده —
  // وحدها حاجة الإذن تنتظر عنوانه.
  const early = {
    session: send('session/get', undefined),
    settings: send('settings/get', undefined),
  }
  const recentLoad = loadRecent()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  const [partial, recent] = await Promise.all([
    loadPopupContext(tab.id, tab.url, tab.incognito, early),
    recentLoad,
  ])
  performance.mark(POPUP_MARKS.data)
  return {
    tabId: tab.id,
    context: { ...partial, online: navigator.onLine },
    origin: tab.url ?? '',
    recent,
  }
}

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
 * قائمة الاستثناء كما وصلت من الخلفية — **والفشل يُقرأ منعًا لا فراغًا**.
 *
 * ردٌّ ساقط يعني «لا نعرف قائمته»، لا «قائمته فارغة». فتُعاد `['*']`: نمطٌ
 * يطابق كل موقع، فتعرض النافذة حالة منعٍ تشرح بدل أن تعرض أدواتٍ قد لا
 * يُسمَح بها. والثمن لحظةٌ متحفّظة في عطلٍ نادر، مقابل ألّا تَعِد النافذة
 * بما تمنعه البوّابة بعدها.
 */
type SettingsReply = Awaited<ReturnType<typeof send<'settings/get'>>>
type SessionReply = Awaited<ReturnType<typeof send<'session/get'>>>

function excludedSitesFrom(reply: SettingsReply): string[] {
  if (!reply.ok) return ['*']
  const privacy = (reply.value as { privacy?: { excludedSites?: unknown } }).privacy
  return Array.isArray(privacy?.excludedSites) ? (privacy.excludedSites as string[]) : []
}

/**
 * وضع التصفّح الخاص كما وصل — وردٌّ ساقط يُقرأ `no-save` لا `off`.
 *
 * **والاتجاه المتحفّظ هنا معكوسٌ عمدًا** عن `excludedSitesFrom` أعلاه، ولسببٍ
 * واحد: هذا القرار في النافذة **استشاريّ لا حاسم** (‏ADR 0020 الحقيقة 1)،
 * والردّ الساقط يُنتج `['*']` فيمنع كل شيء أصلًا — فلا حاجة لمنعٍ ثانٍ فوقه،
 * وادّعاءُ `off` على ردٍّ لم يصل يعرض للمستخدم سببًا لم يختره.
 */
function incognitoModeFrom(reply: SettingsReply): 'allow' | 'no-save' | 'off' {
  if (!reply.ok) return 'no-save'
  const privacy = (reply.value as { privacy?: { incognito?: unknown } }).privacy
  const mode = privacy?.incognito
  return mode === 'allow' || mode === 'off' ? mode : 'no-save'
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
  incognito = false,
  early?: { readonly session: Promise<SessionReply>; readonly settings: Promise<SettingsReply> },
): Promise<Omit<PopupContext, 'online'>> {
  // ثلاثتها متوازية لا متتالية: لا تعتمد إحداها على نتيجة الأخرى، وكل رحلة
  // إضافية قبل أول عرض تُحتسَب على ميزانية الـ100ms. ولهذا تُطلَب حاجة الإذن
  // للعنوان دائمًا ثم تُهمَل إن مُنع — ترتيبها بعد الإعدادات كان سيسلسل
  // رحلتين ويكسر الميزانية، مقابل عملٍ محليٍّ ضئيل يُرمى أحيانًا.
  const [sessionReply, settingsReply, permissionForUrl] = await Promise.all([
    early?.session ?? send('session/get', undefined),
    early?.settings ?? send('settings/get', undefined),
    findPermissionNeed(url),
  ])

  /*
   * **يُحسَب السبب في موضعين لا موضع**: الخلفية تقرّر حاسمًا، والنافذة
   * استشاريًّا قبل أول عرض. وانحرافهما يراه المستخدم مباشرةً — نافذةٌ تعرض
   * أدواتٍ يرفضها `tool/activate` بعد نقرة. فـ`incognito` يُمرَّر من
   * `chrome.tabs.query` الذي يملكه المستدعي أصلًا، بنفس مصدر
   * `background/gate.ts` حرفًا بحرف.
   */
  const decision = evaluateGate(url, excludedSitesFrom(settingsReply), {
    incognito,
    incognitoMode: incognitoModeFrom(settingsReply),
  })
  const restriction = decision.allowed
    ? { injectable: true as const }
    : { injectable: false as const, reason: decision.reason }
  const permissionNeeded = decision.allowed ? permissionForUrl : null

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
 * `Docs/Rasd_Ar.md §8`) — وترويسة `Permission.tsx` القديمة («لا مسار يطلبها
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

/** نتيجة نسخ اللقطة من شاشة النجاح. */
export type CopyOutcome = 'copied' | 'unsupported' | 'failed'

/**
 * ينسخ لقطة التُقطت للتوّ إلى الحافظة — من النافذة، وهي مركَّزة بإيماءة النقر نفسها.
 *
 * البايتات كما حُفظت بلا إعادة ترميز: شاشة النجاح تسبق أي تعليق، فلا حجب يُتجاوَز
 * (ADR 0015)، وإعادة الترميز لها مخرجها الواحد في التصدير (ADR 0021). والحافظة في
 * Chrome تقبل PNG وحدها، فلقطة بصيغة أخرى تُحال إلى المحرّر بدل فشل صامت.
 */
export async function copyCaptureImage(id: string): Promise<CopyOutcome> {
  const stored = await blobs.get(id)
  if (!stored.ok) return 'failed'
  if (stored.value.blob.type !== 'image/png') return 'unsupported'
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': stored.value.blob })])
    return 'copied'
  } catch {
    return 'failed'
  }
}
