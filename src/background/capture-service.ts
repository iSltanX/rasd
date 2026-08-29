/**
 * خدمة الالتقاط — الحراسة والالتقاط والقصّ والحفظ.
 *
 * **لماذا في الخلفية:** `chrome.tabs.captureVisibleTab` غير متاح لسكربت
 * المحتوى إطلاقًا. والخلفية كذلك المكان الوحيد الذي يرى كل التبويبات، فحدّ
 * Chrome (نداءان في الثانية) حدّ **عامّ للإضافة** لا لكل تبويب — ومُنظِّم
 * إيقاع داخل كل صفحة لا يحترمه.
 *
 * **أخطر ما في هذا الملفّ:** `captureVisibleTab` **لا يأخذ `tabId`**. يلتقط
 * التبويب النشط في النافذة المذكورة، أيًّا كان. فلو بدأ المستخدم تحديدًا في
 * تبويب ثم بدّل إلى آخر، ونحن نملك `activeTab` على الثاني (لأنه شغّل رصد
 * فيه سابقًا) — لالتُقط **التبويب الخطأ بنجاح وبصمت**. لأداة تبيع نفسها على
 * أنها لا ترى ما لم يُطلب منها، هذا أسوأ صنف عطل ممكن. الحراسة في
 * `assertShootable` هي الجواب، وتُنفَّذ لحظة الضغط لا لحظة التسليح.
 */

import { createRateLimiter, systemClock, type RateLimiter } from '@/modules/capture/rate-limit'
import { sendToTab } from '@/shared/messaging'
import { checkInjectable, restrictionMessage } from '@/shared/restricted'
import { errText, ok, type Result } from '@/shared/result'
import { putCaptureWithBlob } from '@/shared/storage/repository'

import { cropCapture } from './image-ops'

import type { DeviceRect } from '@/shared/geometry'
import type { CaptureKind, CaptureRecord } from '@/shared/storage/schema'

/**
 * فاصل أطول قليلًا من حدّ Chrome (500ms).
 *
 * الحدّ يُقاس بساعة المتصفّح لا بساعتنا، وانحراف بضعة أجزاء من الألف كافٍ
 * لأن يُحسب نداءٌ عند 499ms داخل النافذة السابقة فيُرفَض. الخمسون الزائدة
 * ثمن رخيص مقابل رفض عشوائي يصعب تفسيره للمستخدم.
 */
export const CAPTURE_INTERVAL_MS = 550

/** أقصى انتظار لتسليم اللقطة قبل اعتبارها معلَّقة. */
const CAPTURE_TIMEOUT_MS = 3000

/** مفتاح بذرة المُنظِّم في تخزين الجلسة. */
const LAST_SHOT_KEY = 'rasd:lastShotAt'

let limiter: RateLimiter = createRateLimiter(systemClock, CAPTURE_INTERVAL_MS)

/** للاختبار: يستبدل المُنظِّم بساعة مقودة. */
export function setCaptureLimiter(next: RateLimiter): void {
  limiter = next
}

export interface CaptureInput {
  readonly tabId: number
  readonly kind: CaptureKind
  /** بفضاء الجهاز؛ `null` يعني الجزء الظاهر كاملًا. */
  readonly rect: DeviceRect | null
  /** كثافة البكسل الحيّة، مقروءة في الصفحة لا مخمَّنة هنا. */
  readonly dpr: number
}

export interface CaptureOutput {
  readonly id: string
  readonly width: number
  readonly height: number
}

/**
 * ثلاث حراسات قبل كل ضغطة، **لحظة الضغط لا لحظة التسليح**.
 *
 * 1. التبويب موجود ولم يُفرَغ من الذاكرة (`discarded`) — المُفرَغ لا محتوى
 *    مرسومًا له.
 * 2. **هو التبويب النشط في نافذته** — الحراسة الجوهرية، انظر رأس الملفّ.
 * 3. النافذة ليست مصغَّرة — المصغَّرة لا تُرسَم فتُرجع لقطة سوداء أو ترمي.
 *
 * ولا واحدة منها تحتاج صلاحية `tabs`: الحقول المستعملة (`id`، `windowId`،
 * `active`، `discarded`، `state`) غير محجوبة بدونها.
 *
 * تبقى فجوة زمنية بين الفحص والنداء لا تسدّها الواجهة المتاحة — تُذكَر في
 * `Phase_08.md` بدل ادّعاء إحكام لا وجود له.
 */
async function assertShootable(tabId: number): Promise<Result<chrome.tabs.Tab>> {
  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return errText('not-found', 'أُغلق التبويب قبل اكتمال الالتقاط.')
  }

  if (tab.discarded) {
    return errText('cancelled', 'أُفرِغ التبويب من الذاكرة. افتحه من جديد ثم أعد المحاولة.')
  }

  const check = checkInjectable(tab.url)
  if (!check.injectable) return errText('not-injectable', restrictionMessage(check.reason))

  const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
  if (activeTab?.id !== tabId) {
    return errText('cancelled', 'انتقل التبويب إلى الخلفية. اعرضه ثم أعد المحاولة.')
  }

  try {
    const win = await chrome.windows.get(tab.windowId)
    if (win.state === 'minimized') {
      return errText('cancelled', 'النافذة مصغَّرة. اعرضها ثم أعد المحاولة.')
    }
  } catch {
    // نافذة اختفت بين النداءين — النداء التالي سيفشل برسالته الخاصة.
  }

  return ok(tab)
}

/** مهلة صريحة: نداء معلَّق يُبقي الطابور محجوزًا إلى الأبد. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), ms)),
  ])
}

/**
 * ينتظر ما تبقّى من الفاصل بحسب آخر ضغطة **مسجَّلة في تخزين الجلسة**.
 *
 * الـservice worker يُنهى بعد 30 ثانية خمول ويعود بذاكرة فارغة، فيظنّ أن لا
 * نداء سبقه — ويخرق الحدّ في أوّل نداء بعد العودة. تخزين الجلسة ينجو من
 * الإنهاء ولا ينجو من إغلاق المتصفّح، وهو بالضبط عمر الحدّ.
 */
async function awaitSessionInterval(): Promise<void> {
  try {
    const stored = (await chrome.storage.session.get(LAST_SHOT_KEY))[LAST_SHOT_KEY]
    if (typeof stored !== 'number') return
    const waitMs = stored + CAPTURE_INTERVAL_MS - Date.now()
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
  } catch {
    // بلا بذرة يبقى المُنظِّم صحيحًا داخل هذه النسخة — تدهور لا فشل.
  }
}

async function markShot(): Promise<void> {
  try {
    await chrome.storage.session.set({ [LAST_SHOT_KEY]: Date.now() })
  } catch {
    /* لا شيء */
  }
}

/**
 * يخفي الطبقة ويضمن أن رسمة وقعت قبل الالتقاط.
 *
 * الطبقة تعيش في DOM الصفحة وفي طبقتها العليا، و`captureVisibleTab` يلتقط
 * ما رُسم فعلًا — فبلا هذه الخطوة تظهر أدوات رصد داخل لقطة المستخدم.
 *
 * غياب المستقبِل **ليس فشلًا**: لا طبقة تعني لا شيء يُخفى.
 */
async function hideOverlay(tabId: number): Promise<boolean> {
  const reply = await sendToTab({ tabId }, 'capture/hide-overlay', undefined, { timeoutMs: 1500 })
  return reply.ok && reply.value.hidden
}

async function showOverlay(tabId: number): Promise<void> {
  await sendToTab({ tabId }, 'capture/show-overlay', undefined, { timeoutMs: 1500 })
}

/**
 * يترجم رمي `captureVisibleTab` إلى سبب مفهوم.
 *
 * «فشل الالتقاط» عديم النفع: لكلّ سبب فعلٌ مختلف يفعله المستخدم — إعادة
 * تشغيل الأداة، أو الانتظار لحظة، أو عرض التبويب.
 */
function captureFailureMessage(thrown: unknown): string {
  const text = String((thrown as { message?: unknown })?.message ?? thrown).toLowerCase()
  if (text.includes('capture_timeout')) {
    return 'تأخّر المتصفّح في تسليم اللقطة. أعد المحاولة.'
  }
  if (text.includes('activetab') || text.includes('permission') || text.includes('cannot access')) {
    return 'انتهت صلاحية الإذن لهذه الصفحة. أعد تشغيل الأداة من الأيقونة أو الاختصار.'
  }
  if (text.includes('max_capture_visible_tab_calls_per_second')) {
    return 'طلبات التقاط متلاحقة أكثر مما يسمح المتصفّح. أعد المحاولة بعد لحظة.'
  }
  return 'تعذّر على المتصفّح تسليم اللقطة. تأكّد أن التبويب ظاهر وأعد المحاولة.'
}

/**
 * `captureVisibleTab` عبر المُنظِّم، **بصيغة PNG دائمًا**.
 *
 * الواجهة لا تقبل إلا `jpeg` أو `png` — لا `webp` رغم أن إعدادات رصد تعرضه.
 * فتُلتقَط بلا فقد، وأي تحويل لاحق يقع فوق بايتات سليمة لا فوق فقدٍ سابق.
 */
async function grabVisible(tab: chrome.tabs.Tab): Promise<Result<string>> {
  try {
    const dataUrl = await limiter.run(async () => {
      await awaitSessionInterval()
      const shot = await withTimeout(
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
        CAPTURE_TIMEOUT_MS,
      )
      await markShot()
      return shot
    })
    if (!dataUrl) return errText('handler-failed', 'أعاد المتصفّح لقطة فارغة.')
    return ok(dataUrl)
  } catch (thrown) {
    return errText('permission-denied', captureFailureMessage(thrown), String(thrown))
  }
}

/**
 * ينفّذ التقاطًا كاملًا: حراسة ← إخفاء ← التقاط ← قصّ ← حفظ.
 *
 * الطبقة تعود للظهور في `finally` مهما كان المآل: تركها مخفيّة بعد فشل يترك
 * الصفحة تحت طبقة غير مرئية تبتلع المؤشِّر — عطل أسوأ من الفشل الأصلي.
 */
export async function runCapture(input: CaptureInput): Promise<Result<CaptureOutput>> {
  const guarded = await assertShootable(input.tabId)
  if (!guarded.ok) return guarded

  const hidden = await hideOverlay(input.tabId)

  try {
    const grabbed = await grabVisible(guarded.value)
    if (!grabbed.ok) return grabbed

    const cropped = await cropCapture(grabbed.value, input.rect)
    if (!cropped.ok) return cropped

    const record = buildRecord(input.kind, cropped.value, guarded.value, input.dpr)

    const saved = await putCaptureWithBlob(record, cropped.value.blob)
    if (!saved.ok) return saved

    return ok({ id: record.id, width: cropped.value.width, height: cropped.value.height })
  } finally {
    if (hidden) await showOverlay(input.tabId)
  }
}

/**
 * يبني سجلّ اللقطة.
 *
 * `Rasd_Ar.md §10.1` يفرض: الرابط، العنوان، وقت الالتقاط، اسم الموقع، **حجم
 * نافذة العرض**، ونوع الالتقاط. الأربعة الأولى ونوع الالتقاط في المخطّط منذ
 * المرحلة 3؛ وحجم نافذة العرض يُشتقّ من أبعاد اللقطة وكثافة البكسل، فلا
 * يحتاج حقلًا جديدًا ولا ترحيلًا للمخطّط.
 */
function buildRecord(
  kind: CaptureKind,
  image: { width: number; height: number },
  tab: chrome.tabs.Tab,
  dpr: number,
): CaptureRecord {
  const url = tab.url ?? ''
  let origin = ''
  try {
    origin = new URL(url).origin
  } catch {
    // تبويب بلا عنوان صالح لا يصل إلى هنا (`assertShootable` يمنعه)، لكن
    // السجلّ لا يجوز أن يحمل `undefined` في حقل مفهرَس.
  }

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    origin,
    url,
    title: tab.title ?? '',
    kind,
    status: 'ready',
    projectId: null,
    tags: [],
    width: image.width,
    height: image.height,
    devicePixelRatio: dpr,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}
