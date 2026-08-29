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
  type ChannelDown,
  type ToolName,
} from '@/shared/messaging'
import { checkInjectable, type RestrictionReason } from '@/shared/restricted'

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
  { started: true; mode: ActiveMode | null } | { started: false; reason: RestrictionReason }

/**
 * يحقن الطبقة إن غابت، ثم يبدّل وضعها.
 *
 * الحقن آمن التكرار — `host.ts` يعيد تنشيط الجلسة القائمة بدل بناء ثانية،
 * فاستدعاء هذه الدالّة على تبويب مفعَّل أصلًا لا يكسر شيئًا.
 */
export async function activateTool(tabId: number, tool: ToolName): Promise<ActivateResult> {
  const tab = await chrome.tabs.get(tabId)
  const check = checkInjectable(tab.url)
  if (!check.injectable) return { started: false, reason: check.reason }

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })

  const mode = toolToMode(tool)

  // لا ينتظر تركيب الجلسة قبل الإرسال: `startOverlay` يسجّل مستقبِلاته قبل
  // أن يُرجع، والرسالة الأولى — إن سبقته — تُعاد بمهلة قصيرة عبر إعادة
  // محاولة واحدة، لا تعليقًا صامتًا.
  const retryOnce = async (deliver: () => Promise<{ ok: boolean }>) => {
    const first = await deliver()
    if (first.ok) return
    await new Promise((r) => setTimeout(r, 60))
    await deliver()
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
    await retryOnce(() => sendToTab({ tabId }, 'capture/start', { kind: tool }))
  } else {
    await retryOnce(() => sendToTab({ tabId }, 'mode/set', { mode: tool }))
  }

  return { started: true, mode }
}
