/**
 * تفعيل الأدوات — نقطة الدخول الوحيدة التي تحقن الطبقة وتبدّل وضعها.
 *
 * ثلاثة مسارات تصل إليها: اختصارات `chrome.commands` (أربعة فقط — حدّ
 * Chrome)، قائمة السياق، ونافذة الإضافة. توحيدها هنا يعني أن سلوك «منطقة»
 * واحد بالضبط أيًّا كان مصدر الأمر — لا نسخة في النافذة تنحرف عن نسخة
 * الاختصار بمرور الوقت.
 */

import {
  broadcastChannel,
  CHANNELS,
  sendToTab,
  type ActivationFailure,
  type ChannelDown,
  type ToolName,
} from '@/shared/messaging'
import { checkInjectable } from '@/shared/restricted'

import { saveFullPage } from './capture-service'
import { startFullPage } from './full-page-job'

import type { CaptureKind } from '@/shared/storage/schema'
import type { ActiveMode } from '@/shared/storage/session'

/** أوامر `chrome.commands` الأربعة — الحدّ الأقصى الذي يقبله Chrome. */
export const COMMAND_TOOL: Record<string, ToolName> = {
  'capture-area': 'area',
  'capture-element': 'element',
  'capture-viewport': 'viewport',
  'capture-full-page': 'full-page',
}

/** أدوات الالتقاط الفوري — لا وضع طبقة يقابلها، بل أمر يُنفَّذ. */
const INSTANT = new Set<ToolName>(['viewport', 'full-page'])

/** حارس نوع: يضيّق `ToolName` إلى نوع لقطة صالح. */
function isInstant(tool: ToolName): tool is Extract<CaptureKind, 'viewport' | 'full-page'> {
  return INSTANT.has(tool)
}

function toolToMode(tool: ToolName): ActiveMode | null {
  return isInstant(tool) ? null : tool
}

export type ActivateResult =
  { started: true; mode: ActiveMode | null } | { started: false; reason: ActivationFailure }

/**
 * يُقلع الطبقة في الصفحة بعد حقن ملفّها.
 *
 * **الحقن وحده لا يُشغّل شيئًا.** `content.js` يُبنى حزمةً IIFE تُصدِّر
 * `startOverlay` على `globalThis.__rasdContent` ولا تستدعيه (انظر
 * `vite.content.config.ts`) — وهو قرار سليم: الحقن قد يقع في إطار داخلي أو
 * صفحة لا نريد الرسم فيها. لكن **لا أحد كان يستدعيه في الإنتاج**، فكانت كل
 * نقطة دخول للمستخدم تحقن الملفّ ثم ترسل رسالةً إلى مستقبِلات لا وجود لها،
 * وتردّ «نجح» — قِيس حيًّا: `Receiving end does not exist` بعد إعادة
 * المحاولة، مع `hostCount = 0` في الصفحة. يحرسه الآن
 * `scripts/verify-activate.mjs` من تبويب بارد بلا أي إقلاع يدوي.
 *
 * الإقلاع آمن التكرار: `startOverlay` يحرس جلسته بعلامة على `window`
 * فيعيد القائمة بدل بناء ثانية (انظر `SESSION_FLAG` في `content/index.ts`).
 */
async function bootOverlay(tabId: number): Promise<boolean> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        // النوع غير متاح هنا: هذه الدالّة تُسلسَل وتُنفَّذ في سياق الصفحة،
        // لا في وحدة الخلفية التي تعرف أنواع الطبقة.
        const api = (
          globalThis as unknown as {
            __rasdContent?: { startOverlay: () => Promise<{ ok: boolean }> }
          }
        ).__rasdContent
        if (!api) return false
        return (await api.startOverlay()).ok
      },
    })
    return injection?.result === true
  } catch {
    return false
  }
}

/**
 * يحقن الطبقة ويُقلعها إن غابت، ثم يبدّل وضعها.
 *
 * آمن التكرار في الطبقتين: `host.ts` يعيد المضيف القائم، و`startOverlay`
 * يعيد الجلسة القائمة — فاستدعاء هذه الدالّة على تبويب مفعَّل أصلًا يبدّل
 * وضعه ولا يبني شيئًا ثانيًا.
 */
export async function activateTool(tabId: number, tool: ToolName): Promise<ActivateResult> {
  const tab = await chrome.tabs.get(tabId)
  const check = checkInjectable(tab.url)
  if (!check.injectable) return { started: false, reason: check.reason }

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })

  // **يُنتظَر قبل أي رسالة**: المستقبِلات كلّها تُسجَّل داخل `startOverlay`،
  // فإرسالٌ قبل تمامه إرسالٌ إلى فراغ.
  if (!(await bootOverlay(tabId))) return { started: false, reason: 'boot-failed' }

  const mode = toolToMode(tool)

  /**
   * إعادة محاولة واحدة **ونتيجتها تُعاد لا تُهمَل**.
   *
   * الإقلاع صار مضمونًا قبل هذه النقطة، فبقاء المحاولة الثانية احتياطٌ
   * لسباقٍ نادر لا شرطٌ للعمل. وكان الإهمال يُنتج أسوأ الأعطال: فشلٌ صامت
   * يُبلَّغ عنه نجاحًا.
   */
  const deliverTwice = async (deliver: () => Promise<{ ok: boolean }>): Promise<boolean> => {
    if ((await deliver()).ok) return true
    await new Promise((r) => setTimeout(r, 60))
    return (await deliver()).ok
  }

  if (tool === 'full-page') {
    /*
     * الالتقاط الكامل **لا يمرّ عبر `capture/start`**.
     *
     * تلك الرسالة تخدم الالتقاط الفوري الذي تقوده الصفحة (عدّاد التأجيل
     * فيها). أمّا هنا فالحلقة تُقاد من الـservice worker — لأن نداءات
     * واجهاته هي ما يمنع إنهاءه، وقيس أن `Port` مفتوحة وحدها لا تمنعه.
     * فتبدأ المهمّة هنا مباشرةً ولا تُنتظَر: عشرون ثانية لا يجوز أن يعلّق
     * فيها الاختصار.
     */
    startFullPage(tabId, {
      broadcast: (message) => void broadcastChannel(CHANNELS.job, message as ChannelDown),
      save: (result) =>
        saveFullPage(
          tabId,
          { blob: result.blob, width: result.width, height: result.height },
          result.width / Math.max(1, result.notes.innerWidth),
        ),
    })
  } else if (isInstant(tool)) {
    // التقاط فوري: يمرّ من الصفحة لا من الخلفية مباشرةً، لأن عدّاد التأجيل
    // يجب أن يُعرَض ويُلغى فيها، وكثافة البكسل الحيّة لا تُقرأ إلا منها.
    const delivered = await deliverTwice(() =>
      sendToTab({ tabId }, 'capture/start', { kind: tool }),
    )
    if (!delivered) return { started: false, reason: 'no-receiver' }
  } else {
    const delivered = await deliverTwice(() => sendToTab({ tabId }, 'mode/set', { mode: tool }))
    if (!delivered) return { started: false, reason: 'no-receiver' }
  }

  return { started: true, mode }
}

/**
 * يستأنف وضع المقارنة تلقائيًّا بعد تنقّل — **بلا إيماءة مستخدم**.
 *
 * لا تستدعيها إلا `background/resume.ts`، وهي وحدها تتحقّق أوّلًا من
 * صلاحية مضيف ممنوحة لأصل التبويب — ADR 0005 يحصر الحقن بلا إيماءة في
 * هذه الحالة تحديدًا («البقاء عبر التنقّل يحتاج صلاحية مضيف اختيارية»).
 *
 * تحقن وتُقلع كما تفعل `activateTool`، ثم ترسل `compare/resume` بدل
 * `mode/set` — الصفحة هي من تقرّر دخول وضع المقارنة، بعد أن تتحقّق من
 * وجود مرجع محفوظ لمسارها تحديدًا (لا لأصلها كلّه). فتنقّلٌ إلى صفحة أخرى
 * على نفس الأصل المصرَّح له لا يقحم المستخدم في وضع لم يطلبه.
 *
 * **بلا `deliverTwice` ولا نتيجة مُعادة**: هذا مسار خلفي صامت — فشله
 * يعني «لا شيء يُستأنَف»، لا خطأً يُبلَّغ عنه أحد.
 */
export async function activateResume(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  if (!checkInjectable(tab.url).injectable) return
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  } catch {
    return
  }
  if (!(await bootOverlay(tabId))) return
  await sendToTab({ tabId }, 'compare/resume', undefined)
}
