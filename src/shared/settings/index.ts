/**
 * قراءة الإعدادات وكتابتها وبثّ تغيّرها.
 *
 * `chrome.storage.local` مصدر الحقيقة، و`onChanged` يبثّ إلى كل السياقات
 * (النافذة، الصفحات، الـservice worker، الطبقة داخل الصفحة) بلا رسائل يدوية.
 */

import { replaceListener } from '../listener-slot'
import { attempt, ok, type Result } from '../result'

import { defaultSettings, parseSettings, type Settings } from './schema'

export * from './schema'

const KEY = 'rasd:settings'

let cache: Settings | null = null
const listeners = new Set<(settings: Settings) => void>()
let watching = false
/**
 * جيل الذاكرة المؤقّتة — يزيد كلّما حُدِّثت من مصدرٍ أحدث من قراءةٍ جارية: حدث تغيّر، أو كتابة.
 * قراءةٌ بدأت قبل ذلك ووصلت بعده **لا تكتب فوقه** ولا تُسلَّم؛ يُعاد الأحدث بدلها.
 */
let generation = 0

/** يحدّث الذاكرة المؤقّتة من مصدر أحدث من أي قراءة معلّقة. */
function refresh(settings: Settings): void {
  cache = settings
  generation += 1
}

/**
 * يقرأ الإعدادات وفشلُ القراءة **ظاهر** — لا مبتلَعًا في الافتراضيات.
 *
 * **العلّة التي فُصلت لها عن `getSettings`.** كانت القراءة الوحيدة تُفسّر
 * فشل التخزين بـ`{}` فتُنتج الافتراضيات — ومنها `excludedSites: []`، أي
 * «لا موقع مستثنى» — **وتخزّنها في الذاكرة المؤقّتة**. فعطلٌ عابر واحد عند
 * إقلاع بارد كان يُلغي قائمة المستخدم لعمر العامل كلّه، بلا أثر يُقرأ.
 * وهي أسوأ صور الفشل: قرارُ خصوصيةٍ يُنقَض صامتًا ويُبلَّغ نجاحًا.
 *
 * والفرق الذي يحمله هذا الشكل: **«قُرئت وهي فارغة» ≠ «لم تُقرأ»**. الأولى
 * قرار مستخدم، والثانية جهل — وبوّابة الحقن تُغلِق على الثانية.
 */
export async function getSettingsResult(): Promise<Result<Settings>> {
  if (cache) return ok(cache)
  const started = generation
  const stored = await attempt(async () => (await chrome.storage.local.get(KEY))[KEY])
  /*
   * **وصل تغيّرٌ أثناء القراءة؟ فهو الأحدث.** القراءة قد تُحلّ بعد حدث `onChanged` أو كتابة
   * بدأتا بعدها، فتحمل القيمة القديمة — وكتابتها في الذاكرة كانت تُرجع حرف أداة جديدًا إلى
   * القديم حتى التغيّر التالي (`tests/unit/settings-read-race.test.ts`).
   */
  if (generation !== started && cache) return ok(cache)
  if (!stored.ok) return stored
  const { settings, issues } = parseSettings(stored.value)
  if (issues.length > 0) {
    console.warn(`[رصد] إعدادات غير صالحة صُحّحت: ${issues.join(' · ')}`)
  }
  cache = settings
  return ok(settings)
}

/**
 * **قراءةٌ من التخزين لا من الذاكرة** — لقرارٍ يُتّخذ لحظةَ فعلٍ لا يُستردّ، أوّله مخرج الشبكة (ADR 0046 §4).
 *
 * الذاكرة المؤقّتة لا تتجدّد إلا في سياقٍ نادى `watchSettings`؛ وصفحةٌ فُتحت قبل أن يعيد المستخدم «الوضع المحلّي فقط»
 * ولم تشترك كانت ستقرأ `localOnly: false` القديمة فتُرسل — رصدته المراجعة المستقلّة (`STAGES/11`). فهذه تقرأ القرص
 * في كل نداء، ولا تكتب في الذاكرة: لا تنافس قراءةً جارية ولا حدث تغيّر.
 */
export async function readSettingsFresh(): Promise<Result<Settings>> {
  const stored = await attempt(async () => (await chrome.storage.local.get(KEY))[KEY])
  if (!stored.ok) return stored
  return ok(parseSettings(stored.value).settings)
}

/**
 * يقرأ الإعدادات. القيمة التالفة تُصحَّح ولا تُسقط شيئًا.
 *
 * **ولا تُخزَّن نتيجة فشل**: الافتراضيات تُعاد للمستدعي هذه المرّة وحدها،
 * فالقراءة التالية تحاول ثانيةً بدل أن ترث جهلًا مُثبَّتًا.
 */
export async function getSettings(): Promise<Settings> {
  const result = await getSettingsResult()
  return result.ok ? result.value : defaultSettings()
}

/**
 * طابور الكتابة — نداءان متزامنان يُنفَّذان تتابعًا لا تسابقًا.
 *
 * **العطل، مقيسًا بالاختبار لا مفترَضًا** (‏`Docs/Engineering.md §6` صفّ 113، وقد
 * كان مفتوحًا بلا وحدةٍ مالكة): `patchSettings` تقرأ `current` ثمّ تكتب،
 * وبلا شيءٍ بينهما. فنداءان متزامنان فعلًا يقرآن الحالة نفسها، ويكتب
 * ثانيهما فوق أوّلهما. وكان ذلك يبدو حدًّا نظريًّا ما دام الضحيّةُ تفضيلَ
 * عرض — حتى بنت الوحدة 20.3 **قائمة المواقع المستثناة** فوقه: صفوف
 * «أنماط شائعة» تُضاف كلٌّ منها بنقرة لا تنتظر سابقتها، ونقرتان متلاحقتان
 * كانتا تُسقطان أحد الموقعين صامتًا — أي حقنًا في موقعٍ ظنّ المستخدم أنه
 * حماه، وهو بعينه صنف العطل الذي بُني له `site-match.ts` كلّه.
 *
 * والحلّ سلسلة وعود لا قفل: كل كتابة تنتظر ما قبلها، فتقرأ `current` بعد
 * استقرارها. والسلسلة تُمسك بالنتيجة لا بالخطأ — كتابةٌ فاشلة لا يجوز أن
 * تُجمّد الطابور بعدها.
 *
 * **وحدُّه مُعلَن**: يُسلسِل داخل سياق JS واحد. كتابتان من سياقين مختلفين
 * (النافذة وصفحة الإعدادات معًا) تبقيان على سباق `chrome.storage` نفسه —
 * سطحٌ أضيق بكثير ولا يبلغه نقرٌ مزدوج، ويحتاج حسمه معاملةً على مستوى
 * التخزين لا طابورًا في الذاكرة.
 */
let writeQueue: Promise<unknown> = Promise.resolve()

/** يدمج تعديلًا جزئيًا (دمج عميق بمستوى واحد يكفي بنية المخطّط). */
export function patchSettings(patch: Partial<Settings>): Promise<Result<Settings>> {
  return enqueue(() => applyPatch(patch))
}

/**
 * قراءةٌ فتعديلٌ فكتابة **ذرّيّة** — الطريق الوحيد الصحيح لتعديل مصفوفة.
 *
 * **ولماذا لا تكفي `patchSettings` هنا.** طابور الكتابة يُسلسِل الكتابات،
 * لكنّ المستدعي الذي يقرأ الحالة **قبل** أن يستدعيها يكون قد بنى قيمته على
 * قراءةٍ سبقت الطابور — فنداءان متزامنان يقرآن الحالة نفسها ثمّ يدخلان
 * الطابور بقيمتين كلتاهما مبنيّة على الماضي، والثانية تدهس الأولى. والفرق
 * ملموس لأن `patchSettings` **تستبدل المصفوفات ولا تدمجها**: مع كائنٍ يضيع
 * حقل، ومع مصفوفةٍ يضيع عنصر كامل.
 *
 * فهذه الدالّة تُدخل **القراءة والتعديل** الطابورَ معهما: `mutate` تُنفَّذ
 * على حالةٍ قُرئت بعد استقرار كل كتابة سابقة.
 */
export function updateSettings(
  mutate: (current: Settings) => Partial<Settings>,
): Promise<Result<Settings>> {
  return enqueue(async () => {
    const current = await getSettingsResult()
    if (!current.ok) return current
    return applyPatch(mutate(current.value), current.value)
  })
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task)
  writeQueue = next.catch(() => undefined)
  return next
}

/**
 * **لا تُكتب افتراضيات على القرص حين تتعذّر القراءة** — رصدته مراجعة Gate B.
 *
 * كانت تقرأ `current` بـ`getSettings()`، وتلك تبتلع فشل التخزين وتُعيد
 * `defaultSettings()`. فكتابةٌ تالية — تبديل المظهر مثلًا — كانت تدمج التعديل
 * فوق الافتراضيات وتكتب الناتج كاملًا، فتمحو `privacy.excludedSites` من القرص
 * **نهائيًّا وتُبلّغ نجاحًا**. وهو بعينه ما وُجدت `getSettingsResult` للتفريق
 * فيه: «قُرئت وهي فارغة ≠ لم تُقرأ» ([ADR 0020](../../../Docs/ADR/0020-injection-gate.md)
 * البند 5) — أُغلق ذلك الباب عند **التحليل** في هذه الوحدة (‏`§6` صفّ 119)
 * وبقي مفتوحًا عند **القراءة** حتى فتحته المراجعة. (‏`§6` صفّ 128.)
 *
 * و`known` تُمرَّر حين يكون المستدعي قد قرأ أصلًا (`updateSettings`) — كي لا
 * تُقرأ الحالة مرّتين داخل الطابور نفسه.
 */
async function applyPatch(patch: Partial<Settings>, known?: Settings): Promise<Result<Settings>> {
  let current = known
  if (current === undefined) {
    const read = await getSettingsResult()
    if (!read.ok) return read
    current = read.value
  }
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key]
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value) && existing
        ? { ...existing, ...(value as object) }
        : value
  }
  const { settings } = parseSettings(merged)
  const written = await attempt(() => chrome.storage.local.set({ [KEY]: settings }))
  if (!written.ok) return written
  refresh(settings)
  return ok(settings)
}

export interface ResetOptions {
  /** «أبقِ قائمة المواقع المستثناة» في تأكيد إعادة الضبط — محدَّدٌ ابتداءً (`data / reset-confirm`). */
  readonly keepExcludedSites: boolean
}

/**
 * يعيد التفضيلات إلى قيمها الأولى — **بخيارٍ صريح في قائمة المواقع المستثناة، وبلا مسّ حالة التطبيق**.
 *
 * كانت تكتب `defaultSettings()` كاملةً: تمحو القائمة بلا سؤال، وقد صارت بياناتٍ أنشأها المستخدم بيده لا
 * تفضيلَ عرض (`Docs/Engineering.md §6` الصفّ 118)؛ وتمحو علامة جولة التعريف فتعود الترحيبيّة كأنه تثبيتٌ
 * جديد، و«ما الجديد» المنتظرة. فالقائمة تبقى أو تُمحى بقرار المستخدم في التأكيد، والجولة و«ما الجديد» حالةٌ لا
 * تفضيل فتبقيان دائمًا.
 *
 * **وتقرأ قبل أن تكتب، في الطابور:** إبقاء القائمة يحتاج قراءتها، والقراءة الفاشلة لا تُكتب فوقها
 * افتراضيات (الثابت الثاني، الصفّ 128) — ولا حتى حين يُطلب محو القائمة: ما لا يُقرأ لا يُعرف ما فيه.
 */
export function resetSettings(options: ResetOptions): Promise<Result<Settings>> {
  return enqueue(async () => {
    const current = await getSettingsResult()
    if (!current.ok) return current
    const fresh = defaultSettings()
    const settings: Settings = {
      ...fresh,
      privacy: options.keepExcludedSites
        ? { ...fresh.privacy, excludedSites: [...current.value.privacy.excludedSites] }
        : fresh.privacy,
      onboarding: current.value.onboarding,
      whatsNew: current.value.whatsNew,
    }
    const written = await attempt(() => chrome.storage.local.set({ [KEY]: settings }))
    if (!written.ok) return written
    refresh(settings)
    return ok(settings)
  })
}

/** يشترك في تغيّر الإعدادات — يُستدعى فورًا بالقيمة الحالية. */
export function watchSettings(listener: (settings: Settings) => void): () => void {
  listeners.add(listener)
  ensureWatcher()
  void getSettings().then(listener)
  return () => listeners.delete(listener)
}

function ensureWatcher() {
  if (watching) return
  watching = true
  // مقعدٌ واحد لكل عالم: إعادة تنفيذ `content.js` تبني وحدةً جديدة ومستمعُ السابقة حيّ (`STAGES/21`).
  replaceListener('settings.storage.onChanged', chrome.storage.onChanged, (changes, area) => {
    if (area !== 'local' || !(KEY in changes)) return
    const { settings } = parseSettings(changes[KEY]?.newValue)
    refresh(settings)
    for (const listener of listeners) listener(settings)
  })
}

/** للاختبارات: يُفرِغ الذاكرة المؤقّتة والمشتركين. */
export function resetSettingsCache() {
  cache = null
  listeners.clear()
  watching = false
}
