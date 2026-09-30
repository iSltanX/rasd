/**
 * تحميل بيانات النافذة — منطق بلا JSX، منفصل عن `Popup.tsx` عمدًا حتى يُختبر
 * بمحاكاة `chrome.*` (`@webext-core/fake-browser`) بلا تركيب أي مكوّن.
 *
 * القرار الوحيد غير البديهي هنا: قرار البوّابة يُحسَب محليًّا لا عبر رسالة
 * `tab/can-operate` — النافذة تملك عنوان التبويب أصلًا من `chrome.tabs.query`،
 * وتقرأ الإعدادات بنفسها لأسباب أخرى. فـ`evaluateGate` دالّة خالصة على ما
 * بيدها بالفعل، ورحلةٌ إلى الـservice worker لإعادة الحساب نفسه لا تضيف شيئًا
 * سوى زمن انتظار قبل فتح النافذة (المعيار: أقل من 100ms). وللسبب نفسه لا تمرّ
 * قراءة الجلسة والإعدادات بالعامل أصلًا — انظر `Read` أدناه.
 *
 * **وهذا القرار استشاريّ لا حاسم**، وهو ما يجعل الحساب المحلّي سليمًا: ما
 * تعرضه النافذة يختار الحالة المعروضة، ولا يأذن بحقن. كل زرّ فيها يمرّ
 * بـ`tool/activate` ⟵ `canOperateOnTab` في الخلفية — وتلك وحدها تقرأ
 * الإعدادات بفشلٍ ظاهر وتُغلق عند الجهل.
 */

import { findReferenceForPage } from '@/modules/compare/reference'
import { VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { countByStatus } from '@/modules/issues/status'
import { evaluateGate, type GateDecision } from '@/shared/injection-gate'
import { hasHostPermission, originPatternFor } from '@/shared/permissions'
import { getSettingsResult } from '@/shared/settings'
import { annotations, blobs, captures, issues } from '@/shared/storage/repository'
import { getSession } from '@/shared/storage/session'

import type { IssueStatus } from '@/shared/issue-schema'
import type { PopupContext } from '@/shared/popup-state'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { ActiveMode, SessionState } from '@/shared/storage/session'

/** ما تحتاجه النافذة قبل أول عرض ذي معنى: التبويب المستهدَف وحالته وآخر لقطتين ومشكلات صفحته. */
export interface PopupLoad {
  readonly tabId: number
  readonly context: PopupContext
  readonly origin: string
  readonly recent: RecentEntry[]
  /** عدد مشكلات صفحة التبويب بحالاتها — `null` حين لا مشكلات لها أو تعذّرت القراءة. */
  readonly pageIssues: PageIssueCounts | null
}

/** عدد المشكلات في كل حالة — الأعداد وحدها: النافذة لا تعرض المشكلات بل تدلّ عليها. */
export type PageIssueCounts = Readonly<Record<IssueStatus, number>>

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
  const early = { session: readSession(), settings: getSettingsResult() }
  const recentLoad = loadRecent()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  const [partial, recent, pageIssues] = await Promise.all([
    loadPopupContext(tab.id, tab.url, tab.incognito, early),
    recentLoad,
    loadPageIssues(tab.url),
  ])
  performance.mark(POPUP_MARKS.data)
  return {
    tabId: tab.id,
    context: { ...partial, online: navigator.onLine },
    origin: tab.url ?? '',
    recent,
    pageIssues,
  }
}

/**
 * أعداد مشكلات الصفحة المفتوحة — أصلها ومسارها بلا الاستعلام والجزء `#`، كما تُسجَّل (`IssuePage`).
 *
 * الفهرس `origin` يحصر القراءة في مشكلات الموقع، ثمّ يُصفّى المسار محلّيًّا. **`null` لا تعني «صفر»
 * وحدها**: تعني أيضًا تبويبًا بلا رابط http(s) وقراءةً تعذّرت — فالنافذة تعود إلى «الأخيرة» صامتةً، لأن
 * القسم زيادةٌ على النافذة لا جوهرها. ولا يُستورد هنا `values` ولا `observe`: ميزانية الحزمة عند الفتح.
 */
export async function loadPageIssues(url: string | undefined): Promise<PageIssueCounts | null> {
  const page = pageKeyOf(url)
  if (!page) return null
  try {
    const found = await issues.byIndex('origin', page.origin)
    if (!found.ok) return null
    const here = found.value.filter((issue) => issue.page.path === page.path)
    return here.length > 0 ? countByStatus(here) : null
  } catch {
    return null
  }
}

/** الأصل والمسار من رابط http(s) — وغيره (`chrome://` · `file://` · غياب الرابط) لا مشكلات له. */
function pageKeyOf(url: string | undefined): { origin: string; path: string } | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return { origin: parsed.origin, path: parsed.pathname }
  } catch {
    return null
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
  // مؤشّر عكسيّ يتوقّف عند لقطتين، لا قراءة المكتبة كلّها — زمن فتح النافذة لا ينمو بحجمها.
  const list = await captures.latest('createdAt', 2, (r) => r.trashedAt === null)
  if (!list.ok) return []
  const latest = list.value

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
/**
 * قراءة كما وصلت — **`ok: false` حين تتعذّر، لا افتراضيات تبتلع الفشل**.
 *
 * كانت الجلسة والإعدادات تصلان برسالتين إلى الـservice worker (`session/get` · `settings/get`)،
 * وكلتاهما قراءة تخزين خالصة تستطيعها النافذة بنفسها — صفحة إضافة تملك `chrome.storage`. فالرحلتان
 * كانتا تضيفان إلى أول عرض إيقاظ العامل إن كان نائمًا، وهو الغالب حين ينقر المستخدم الأيقونة
 * (`STAGES/04`). والإعدادات تُقرأ بـ`getSettingsResult` لا `getSettings`: الثانية تُعيد الافتراضيات
 * عند تعذّر القراءة — قائمة استثناء فارغة — والنافذة تقرأ التعذّر منعًا (`excludedSitesFrom`).
 */
type Read = { readonly ok: true; readonly value: unknown } | { readonly ok: false }
type SettingsReply = Read
type SessionReply = Read

const readSession = async (): Promise<SessionReply> => ({ ok: true, value: await getSession() })

function excludedSitesFrom(reply: SettingsReply): string[] {
  if (!reply.ok) return ['*']
  const privacy = (reply.value as { privacy?: { excludedSites?: unknown } }).privacy
  return Array.isArray(privacy?.excludedSites) ? (privacy.excludedSites as string[]) : []
}

/**
 * تعذّرت قراءة الإعدادات: منعٌ بسببه الحقيقي كما تقرّره الخلفية (`background/gate.ts`) — لا «هذا
 * الموقع في قائمة المستثناة» الذي كان يعطيه `['*']`. وقيد المنصّة أوّلًا كما في `evaluateGate`: صفحة
 * `chrome://` ممنوعة بسببها أيًّا كانت الإعدادات، وذكرُه أنفع.
 */
function unreadableSettings(url: string | undefined): GateDecision {
  const platform = evaluateGate(url, [])
  return platform.allowed ? { allowed: false, reason: 'settings-unavailable' } : platform
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
    early?.session ?? readSession(),
    early?.settings ?? getSettingsResult(),
    findPermissionNeed(url),
  ])

  /*
   * **يُحسَب السبب في موضعين لا موضع**: الخلفية تقرّر حاسمًا، والنافذة
   * استشاريًّا قبل أول عرض. وانحرافهما يراه المستخدم مباشرةً — نافذةٌ تعرض
   * أدواتٍ يرفضها `tool/activate` بعد نقرة. فـ`incognito` يُمرَّر من
   * `chrome.tabs.query` الذي يملكه المستدعي أصلًا، بنفس مصدر
   * `background/gate.ts` حرفًا بحرف.
   */
  const decision = settingsReply.ok
    ? evaluateGate(url, excludedSitesFrom(settingsReply), {
        incognito,
        incognitoMode: incognitoModeFrom(settingsReply),
      })
    : unreadableSettings(url)
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
