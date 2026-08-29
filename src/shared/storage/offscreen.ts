/**
 * دورة حياة المستند خارج الشاشة.
 *
 * الـservice worker في MV3 بلا DOM: لا `document`، ولا `Image`، ولا كتابة صورة
 * إلى الحافظة. المستند خارج الشاشة هو المخرج الرسمي — يُنشأ عند الحاجة ويُغلق
 * بعد خمول، لأن بقاءه مفتوحًا يمنع إنهاء الـservice worker ويستهلك ذاكرة.
 */

import { PAGE_PATHS } from '../page-paths'
import { attempt, ok, type Result } from '../result'

/** يُغلق المستند بعد هذه المدّة من آخر استخدام. */
export const OFFSCREEN_IDLE_MS = 30_000

let idleTimer: ReturnType<typeof setTimeout> | null = null

async function exists(): Promise<boolean> {
  // `getContexts` هو الطريق الموثوق؛ محاولة الإنشاء مرّتين ترمي.
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  })
  return contexts.length > 0
}

/** ينشئ المستند إن لم يكن موجودًا. يُرجع `created` للتشخيص. */
export async function ensureOffscreen(): Promise<Result<{ created: boolean }>> {
  const present = await attempt(() => exists())
  if (!present.ok) return present
  if (present.value) {
    touchOffscreen()
    return ok({ created: false })
  }

  const created = await attempt(() =>
    chrome.offscreen.createDocument({
      url: PAGE_PATHS.offscreen,
      reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.BLOBS],
      justification:
        'نسخ الصور إلى الحافظة ومعالجة Canvas الثقيلة — لا يملك الـservice worker وصولًا إلى DOM.',
    }),
  )
  if (!created.ok) {
    // سباق: سياق آخر أنشأه بيننا. وجوده هو المطلوب.
    if (await exists()) {
      touchOffscreen()
      return ok({ created: false })
    }
    return created
  }
  touchOffscreen()
  return ok({ created: true })
}

export async function closeOffscreen(): Promise<Result<{ closed: boolean }>> {
  cancelIdleTimer()
  const present = await attempt(() => exists())
  if (!present.ok) return present
  if (!present.value) return ok({ closed: false })
  const closed = await attempt(() => chrome.offscreen.closeDocument())
  if (!closed.ok) return closed
  return ok({ closed: true })
}

function cancelIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

/** يجدّد مهلة الخمول — يُستدعى مع كل استخدام. */
export function touchOffscreen() {
  cancelIdleTimer()
  idleTimer = setTimeout(() => {
    void closeOffscreen()
  }, OFFSCREEN_IDLE_MS)
}
