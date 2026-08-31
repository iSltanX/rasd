/**
 * دورة حياة الـservice worker.
 *
 * ثلاث مسؤوليات:
 *   1. تسجيل مستقبِلات الرسائل ومعالجات القنوات.
 *   2. إبقاء الـSW حيًّا ما دامت قناة مفتوحة (النبضة في `port.ts`).
 *   3. حارس `chrome.alarms` ينهي المهام المعلَّقة.
 *
 * **لماذا `alarms` لا `setTimeout`:** المؤقّت يموت مع الـservice worker،
 * فالمهمة التي علقت لأن SW أُنهي تبقى «جارية» للأبد. المنبّه ينجو ويوقظ SW.
 */

import { captureTile, runCapture } from '@/background/capture-service'
import { activateTool } from '@/background/commands'
import {
  assignCaptureAsReference,
  assignImageAsReference,
  findReferenceForPage,
} from '@/modules/compare/reference'
import { base64ToBlob, blobToBase64 } from '@/shared/base64'
import { isIncognitoContext, VERSION } from '@/shared/env'
import {
  broadcastChannel,
  CHANNELS,
  onMessage,
  openPortCount,
  serveChannel,
} from '@/shared/messaging'
import { PAGE_PATHS } from '@/shared/page-paths'
import { checkInjectable } from '@/shared/restricted'
import { RasdThrow } from '@/shared/result'
import { getSettings, patchSettings, resetSettings } from '@/shared/settings'
import { setIncognitoWritePolicy } from '@/shared/storage/db'
import { closeOffscreen, ensureOffscreen } from '@/shared/storage/offscreen'
import { quotaState } from '@/shared/storage/quota'
import { blobs, captures, colors } from '@/shared/storage/repository'
import { getSession, patchSession, setTabMode } from '@/shared/storage/session'

import { cancelFullPage } from './full-page-job'

import type { PageKey } from '@/modules/compare/reference'
import type { InspectSnapshot } from '@/shared/inspect-schema'
import type { Viewport } from '@/shared/storage/schema'

/** اسم منبّه الحارس. */
const WATCHDOG_ALARM = 'rasd:watchdog'
/** أقصر فاصل يقبله Chrome للمنبّهات المتكرّرة. */
const WATCHDOG_MINUTES = 1
/** مهمة تجاوزت هذه المدّة بلا تقدّم تُعدّ معلَّقة. */
export const JOB_STALL_MS = 90_000

/** لحظة إقلاع نسخة الـservice worker الحالية. */
const bootedAt = Date.now()

export function registerLifecycle() {
  registerRequestHandlers()
  registerChannels()
  registerFullPage()
  registerInspect()
  registerWatchdog()
  void syncIncognitoPolicy()
}

async function syncIncognitoPolicy() {
  const settings = await getSettings()
  setIncognitoWritePolicy(settings.privacy.blockIncognitoWrites)
}

/**
 * يبني مفتاح صفحةٍ **موثوقًا** لمرجع المقارنة.
 *
 * الأصل والمسار من التبويب لا من الحمولة — نفس قاعدة `colour/save`. وخلافًا
 * لها **يُرمى عند تعذّر القراءة** ولا يُترَك فارغًا: هناك حقلٌ وصفي غيابه
 * يعني «مصدر مجهول»، وهنا **مفتاح السجلّ نفسه** — مفتاحٌ خاطئ يُطابق سجلّ
 * موقعٍ آخر أو يستبدله، وذلك أسوأ من فشلٍ معلَن.
 *
 * بلا معامِلات بحث ولا جزء تجزئة: كلاهما لا يغيّر الشكل المرئي عادةً،
 * وتفريق المرجع بهما يجزّئ صفحةً واحدة إلى مراجع زائفة متعدّدة.
 */
async function pageKeyFromTab(tabId: number | undefined, viewport: Viewport): Promise<PageKey> {
  if (tabId === undefined) throw new Error('لا تبويب مستهدَف لمرجع المقارنة.')
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) throw new Error('تعذّرت قراءة عنوان التبويب — لا مفتاح موثوق للمرجع.')
  const url = new URL(tab.url)
  return { origin: url.origin, path: url.pathname, viewport }
}

function registerRequestHandlers() {
  onMessage('diagnostics/ping', () => ({
    version: VERSION,
    uptimeMs: Date.now() - bootedAt,
    openPorts: openPortCount(),
    incognito: isIncognitoContext(),
  }))

  onMessage('diagnostics/storage', async () => {
    const state = await quotaState()
    return {
      usageBytes: state.usageBytes,
      quotaBytes: state.quotaBytes,
      ratio: state.ratio,
      level: state.level,
    }
  })

  onMessage('tab/can-operate', async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId)
    const check = checkInjectable(tab.url)
    return check.injectable ? { allowed: true } : { allowed: false, reason: check.reason }
  })

  onMessage('settings/get', async () => (await getSettings()) as unknown as Record<string, unknown>)

  onMessage('settings/patch', async ({ patch }) => {
    const result = await patchSettings(patch)
    if (!result.ok) throw new Error(result.error.message)
    setIncognitoWritePolicy(result.value.privacy.blockIncognitoWrites)
    return result.value
  })

  onMessage('settings/reset', async () => {
    const result = await resetSettings()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })

  onMessage('session/get', async () => (await getSession()) as unknown as Record<string, unknown>)

  onMessage('session/patch', async ({ patch }) => {
    const result = await patchSession(patch)
    if (!result.ok) throw new Error(result.error.message)
    return result.value as unknown as Record<string, unknown>
  })

  onMessage('tool/activate', async ({ tool, tabId }) => activateTool(tabId, tool))

  /**
   * الالتقاط يعبر الخلفية لا الصفحة: `captureVisibleTab` غير متاح لسكربت
   * المحتوى، ومُنظِّم الإيقاع يجب أن يكون واحدًا لكل التبويبات لا لكل تبويب.
   *
   * الرمي يتحوّل إلى ردّ خطأ في غلاف `onMessage`، لكن `runCapture` لا ترمي
   * أصلًا — ترجع `Result`. الرفع هنا صريح ليصل نصّ السبب المحدَّد إلى الصفحة
   * بدل رسالة الرمز العامّة.
   */
  onMessage('capture/run', async ({ tabId, kind, rect, dpr }, context) => {
    /*
     * **صفحة الإضافة تبويبٌ أيضًا.**
     *
     * `sender.tab` مضبوط لكل مُرسِل يعيش في تبويب — بما فيه صفحات الإضافة
     * نفسها (المكتبة، المحرّر). فتفضيل `sender.tab.id` مطلقًا كان يوجّه
     * الالتقاط إلى صفحة الإضافة بدل الصفحة المقصودة.
     *
     * التمييز بالأصل: مُرسِل من أصلنا صفحةُ إضافة تعرف أي تبويب تقصد
     * (النافذة تمرّره صراحةً)؛ وأي مُرسِل آخر سكربتُ محتوى **لا يُصدَّق** في
     * تحديد تبويب غير تبويبه.
     */
    const fromOwnPage = context.origin?.startsWith('chrome-extension://') ?? false
    const target = fromOwnPage ? (tabId ?? context.tabId) : (context.tabId ?? tabId)
    if (target === undefined) throw new Error('لا تبويب مستهدَف للالتقاط.')
    const result = await runCapture({ tabId: target, kind, rect, dpr })
    // `RasdThrow` لا `Error`: الرسالة المحدَّدة يجب أن تصل إلى المستخدم كما
    // كُتبت، لا مطويّةً تحت رسالة الرمز العامّة.
    if (!result.ok) throw new RasdThrow(result.error)
    return result.value
  })

  onMessage('mode/report', async ({ mode }, { tabId }) => {
    // بلا تبويب مُرسِل لا معنى للتقرير — لا يُرمى، يُهمَل بصمت. هذا يقع فقط
    // لو استُدعي `send()` بدل `sendToTab()` من سياق ليس تبويبًا.
    if (tabId !== undefined) await setTabMode(tabId, mode)
    return { ok: true }
  })

  /**
   * بايتات لقطة، لتنسخها الصفحة إلى الحافظة.
   *
   * الترميز هنا لا في الصفحة: الخلفية وحدها تصل إلى المخزن، والصفحة لا
   * تصل إلى IndexedDB الخاصة بالإضافة إطلاقًا.
   */
  onMessage('capture/blob', async ({ id }) => {
    const found = await blobs.get(id)
    if (!found.ok) throw new RasdThrow(found.error)
    const buffer = await found.value.blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    // على دفعات: `String.fromCharCode(...bytes)` على صورة بحجم ميغابايت
    // يتجاوز حدّ وسائط النداء ويرمي `RangeError`.
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    return { base64: btoa(binary), mime: found.value.mime, bytes: found.value.bytes }
  })

  /**
   * لقطة خام للعيّنة اللونية — بلا حفظ، وبلا سجلّ.
   *
   * تُبنى على `captureTile` القائمة منذ المرحلة 10: هي التي تحترم مُنظِّم
   * الإيقاع وتُخفي الطبقة قبل اللقطة وتُعيدها في `finally` — فلا تلتقط
   * العدسةُ نفسَها.
   *
   * **التبويب من المُرسِل لا من الحمولة**: سكربت المحتوى لا يُصدَّق في
   * تحديد تبويب غير تبويبه (القاعدة نفسها في `capture/run` أعلاه)، وهذه
   * الرسالة لا تأتي إلا منه.
   */
  onMessage('colour/frame', async (_payload, { tabId }) => {
    if (tabId === undefined) throw new Error('لا تبويب مستهدَف للعيّنة.')
    const shot = await captureTile(tabId)
    if (!shot.ok) throw new RasdThrow(shot.error)
    return { dataUrl: shot.value }
  })

  /**
   * حفظ لون في المكتبة (`§6.15`).
   *
   * **العنوان من `sender` لا من الحمولة**: الصفحة قد تكذب على عنوانها،
   * والمصدر الموثوق الوحيد هو ما يعرفه المتصفّح عن التبويب. وهذا هو نفسه
   * ما يفعله مسار الالتقاط في المرحلة 8.
   *
   * و`projectId` يبقى `null` هنا: ربط اللون بمشروع قرارٌ يقع في المكتبة
   * (المرحلة 15) لا في لحظة الأخذ، وإسناد مشروع تلقائيًّا هو تخمين.
   */
  onMessage('colour/save', async ({ hex, name, note, source }, { tabId }) => {
    /*
     * العنوان يُقرأ من المتصفّح لا من الحمولة — `MessageContext` يحمل
     * `tabId` وحده، والقراءة قد تفشل إن أُغلق التبويب بين النقرة والحفظ.
     * وفشلها لا يُسقط الحفظ: لون بلا مصدر أنفع من لا لون.
     */
    let sourceUrl: string | null = null
    if (tabId !== undefined) {
      try {
        sourceUrl = (await chrome.tabs.get(tabId)).url ?? null
      } catch {
        sourceUrl = null
      }
    }

    const record = {
      id: crypto.randomUUID(),
      hex,
      name,
      note,
      source,
      projectId: null,
      sourceUrl,
      createdAt: Date.now(),
    }
    const saved = await colors.put(record)
    if (!saved.ok) throw new RasdThrow(saved.error)
    return { id: record.id }
  })

  /**
   * مرجع المقارنة — قراءةً وكتابةً **من الخلفية وحدها**.
   *
   * الصفحة لا تصل إلى IndexedDB الخاصة بالإضافة إطلاقًا (نفس علّة
   * `capture/blob`)، فكان `modules/compare/reference.ts` — حين كان يُستدعى
   * من سكربت المحتوى — يكتب في قاعدة **الموقع المزار**: مراجع لا تصل
   * المكتبة أبدًا، و«استخدم آخر لقطة» تُخفق دومًا، وبايتات صور تُخزَّن في
   * مساحة موقعٍ لا نملكها. الصفّ 78 في `Rasd_Plan.md §6`.
   *
   * المنطق نفسه لم يتغيّر — **موضع ندائه هو ما تغيّر**.
   */
  /** أحدث لقطة غير محذوفة — انظر تعليل `capture/latest` في `contract.ts`. */
  onMessage('capture/latest', async () => {
    const list = await captures.byIndex('createdAt')
    if (!list.ok) throw new RasdThrow(list.error)
    const latest = list.value.filter((r) => r.trashedAt === null).at(-1)
    if (!latest) return null
    return { id: latest.id, width: latest.width, height: latest.height }
  })

  onMessage('reference/load', async ({ viewport }, { tabId }) => {
    const key = await pageKeyFromTab(tabId, viewport)
    const found = await findReferenceForPage(key)
    if (!found.ok) throw new RasdThrow(found.error)
    if (!found.value) return null
    const blob = await blobs.get(found.value.blobId)
    // سجلّ يتيم (مرجع بلا بايتات) يُقرأ «لا مرجع» لا خطأً — نفس تساهل
    // المسار السابق، فلا تُعطَّل الأداة بسبب سجلّ تالف واحد.
    if (!blob.ok) return null
    return {
      base64: await blobToBase64(blob.value.blob),
      mime: blob.value.mime,
      bytes: blob.value.bytes,
    }
  })

  /**
   * `projectId` يبقى `null` هنا — نفس تعليل `colour/save`: الربط بمشروع
   * قرارٌ يقع في المكتبة لا في لحظة التعيين، وإسناده تلقائيًّا تخمين.
   */
  onMessage('reference/set', async ({ viewport, source }, { tabId }) => {
    const key = await pageKeyFromTab(tabId, viewport)
    const written =
      source.kind === 'capture'
        ? await assignCaptureAsReference(source.captureId, key, null)
        : await assignImageAsReference(base64ToBlob(source.base64, source.mime), key, null)
    if (!written.ok) throw new RasdThrow(written.error)

    const blob = await blobs.get(written.value.blobId)
    if (!blob.ok) throw new RasdThrow(blob.error)
    return {
      base64: await blobToBase64(blob.value.blob),
      mime: blob.value.mime,
      bytes: blob.value.bytes,
    }
  })

  onMessage('page/open', async ({ page, active, params }) => {
    /*
     * المعاملات تُلحَق استعلامًا، و`URLSearchParams` هي التي ترمّزها — لا
     * تسلسل يدوي. معرّف اللقطة `crypto.randomUUID()` فلا يحتاج ترميزًا
     * اليوم، لكن الرسالة عقد عامّ: أوّل معامل يحمل مسافة أو `&` يكسر
     * العنوان بصمت لو بُني بالضمّ.
     *
     * **والتبويب يُفتح نشِطًا افتراضيًّا** — وهذا شرط عملي لا تفضيل: نسخ
     * الصورة إلى الحافظة من المحرر يشترط مستندًا **مركَّزًا**، والفتح
     * بـ`active: false` يعطي `NotAllowedError` (ADR 0009).
     */
    const query = params ? `?${new URLSearchParams(params).toString()}` : ''
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL(`${PAGE_PATHS[page]}${query}`),
      active: active ?? true,
    })
    return { tabId: tab.id ?? -1 }
  })

  onMessage('offscreen/ensure', async () => {
    const result = await ensureOffscreen()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })

  onMessage('offscreen/close', async () => {
    const result = await closeOffscreen()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
}

/**
 * آخر لقطة فحص مثبَّتة، لكل تبويب.
 *
 * **في الذاكرة لا في التخزين**: اللقطة محتوى صفحة المستخدم (محدِّدات وقيم
 * وألوان)، وحفظها على القرص يجعلها تنجو من الجلسة بلا سبب. وهي تُمسَح مع
 * إنهاء الـservice worker، وهو بالضبط عمرها الصحيح.
 */
const inspectByTab = new Map<number, InspectSnapshot>()

function registerInspect() {
  onMessage('inspect/report', ({ snapshot }, { tabId }) => {
    if (typeof tabId === 'number') {
      if (snapshot) inspectByTab.set(tabId, snapshot)
      else inspectByTab.delete(tabId)
    }
    // البثّ إلى كل عميل مشترك — النافذة قد تُفتح بعد التثبيت.
    broadcastChannel(CHANNELS.inspect, {
      kind: 'progress',
      done: snapshot ? 1 : 0,
      total: 1,
      ...(snapshot ? { note: snapshot.selector } : {}),
    })
    return { ok: true } as const
  })

  onMessage('inspect/get', ({ tabId }) => ({ snapshot: inspectByTab.get(tabId) ?? null }))

  // التبويب أُغلق ⇒ لقطته تذهب معه.
  chrome.tabs.onRemoved.addListener((tabId) => inspectByTab.delete(tabId))
}

function registerFullPage() {
  // الإلغاء من الصفحة: `Esc` أو زرّ اللوحة. الاستعادة تقع في `finally`
  // داخل الحلقة، فالردّ هنا لا يعني أن الصفحة استُعيدت بعد.
  onMessage('fullpage/cancel', () => ({ cancelled: cancelFullPage() }))
}

function registerChannels() {
  // قناة صرفة لإبقاء SW مستيقظًا. لا حمولة — وجودها هو الوظيفة.
  serveChannel(CHANNELS.keepalive, () => {
    // النبضة يردّ عليها `port.ts`؛ لا شيء آخر هنا.
  })

  /*
   * قناة المهام الطويلة. المرحلة 10 هي أوّل مسجِّل فيها.
   *
   * الإلغاء **يُجهض المهمّة فعلًا** لا يكتفي بإبلاغ العميل: الحلقة تملك
   * `AbortController`، واستعادة الصفحة تقع في `finally` داخلها. وردّ
   * «أُلغيت» يأتي من الحلقة نفسها حين تُحسم، لا من هنا — وإلا أُبلغ
   * المستخدم بالإلغاء قبل أن تُستعاد صفحته.
   */
  serveChannel(CHANNELS.job, (host, message) => {
    if (message.kind !== 'cancel') return
    if (!cancelFullPage()) {
      host.post({ kind: 'failed', code: 'cancelled', message: 'لا عملية جارية.' })
    }
  })

  // بثّ حالة الفحص — المرحلة 11 هي أوّل من يملؤها.
  serveChannel(CHANNELS.inspect, () => {
    // لا رسائل صاعدة على هذه القناة: البثّ من الصفحة إلى بقيّة الإضافة
    // وحده، عبر `inspect/report`.
  })
}

function registerWatchdog() {
  void chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: WATCHDOG_MINUTES })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== WATCHDOG_ALARM) return
    void sweepStalledJobs()
  })
}

/**
 * ينهي المهام التي توقّف تقدّمها.
 *
 * تُصدَّر للاختبار: منطق الكشف أهمّ من جدولته.
 */
export async function sweepStalledJobs(now = Date.now()): Promise<boolean> {
  const session = await getSession()
  const job = session.job
  if (!job) return false
  if (now - job.startedAt < JOB_STALL_MS) return false

  await patchSession({ job: null })
  console.warn(`[رصد] مهمة معلَّقة أُنهيت: ${job.kind} (${job.id})`)
  return true
}

/** لحظة إقلاع النسخة الحالية — للتشخيص والاختبار. */
export function serviceWorkerBootedAt(): number {
  return bootedAt
}
