/**
 * تفعيل الأدوات — نقطة الدخول الوحيدة التي تحقن الطبقة وتبدّل وضعها.
 *
 * ثلاثة مسارات تصل إليها: اختصارات `chrome.commands` (أربعة فقط — حدّ
 * Chrome)، قائمة السياق، ونافذة الإضافة. توحيدها هنا يعني أن سلوك «منطقة»
 * واحد بالضبط أيًّا كان مصدر الأمر — لا نسخة في النافذة تنحرف عن نسخة
 * الاختصار بمرور الوقت.
 */

import { sendToTab, type ToolName } from '@/shared/messaging'
import { checkInjectable, type RestrictionReason } from '@/shared/restricted'

import type { ActiveMode } from '@/shared/storage/session'

/** أوامر `chrome.commands` الأربعة — الحدّ الأقصى الذي يقبله Chrome. */
export const COMMAND_TOOL: Record<string, ToolName> = {
  'capture-area': 'area',
  'capture-element': 'element',
  'capture-viewport': 'viewport',
  'capture-full-page': 'full-page',
}

/** `viewport` و`full-page` التقاط فوري — لا وضع طبقة يقابلهما بعد. */
function toolToMode(tool: ToolName): ActiveMode | null {
  return tool === 'viewport' || tool === 'full-page' ? null : tool
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
  if (mode) {
    // لا ينتظر تركيب الجلسة قبل الإرسال: `startOverlay` يسجّل مستقبِل
    // `mode/set` قبل أن يُرجع، والرسالة الأولى — إن سبقته — تُعاد بمهلة
    // قصيرة عبر إعادة محاولة واحدة، لا تعليقًا صامتًا.
    const first = await sendToTab({ tabId }, 'mode/set', { mode })
    if (!first.ok) {
      await new Promise((r) => setTimeout(r, 60))
      await sendToTab({ tabId }, 'mode/set', { mode })
    }
  }

  return { started: true, mode }
}
