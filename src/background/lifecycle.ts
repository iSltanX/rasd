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

import { isIncognitoContext, VERSION } from '@/shared/env'
import { CHANNELS, onMessage, openPortCount, serveChannel } from '@/shared/messaging'
import { PAGE_PATHS } from '@/shared/page-paths'
import { checkInjectable } from '@/shared/restricted'
import { getSettings, patchSettings, resetSettings } from '@/shared/settings'
import { setIncognitoWritePolicy } from '@/shared/storage/db'
import { closeOffscreen, ensureOffscreen } from '@/shared/storage/offscreen'
import { quotaState } from '@/shared/storage/quota'
import { getSession, patchSession } from '@/shared/storage/session'

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

function registerChannels() {
  // قناة صرفة لإبقاء SW مستيقظًا. لا حمولة — وجودها هو الوظيفة.
  serveChannel(CHANNELS.keepalive, () => {
    // النبضة يردّ عليها `port.ts`؛ لا شيء آخر هنا.
  })

  // قناة المهام الطويلة. المهام نفسها تُسجَّل في مراحل لاحقة (10 · 14 · 17).
  serveChannel(CHANNELS.job, (host, message) => {
    if (message.kind === 'cancel') {
      host.post({ kind: 'failed', code: 'cancelled', message: 'أُلغيت العملية.' })
    }
  })

  serveChannel(CHANNELS.inspect, () => {
    // بثّ حالة الفحص — المرحلة 6.
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
