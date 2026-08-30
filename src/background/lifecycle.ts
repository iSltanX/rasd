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

import { runCapture } from '@/background/capture-service'
import { activateTool } from '@/background/commands'
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
import { blobs } from '@/shared/storage/repository'
import { getSession, patchSession, setTabMode } from '@/shared/storage/session'

import { cancelFullPage } from './full-page-job'

import type { InspectSnapshot } from '@/shared/inspect-schema'

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

  onMessage('page/open', async ({ page, active }) => {
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL(PAGE_PATHS[page]),
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
