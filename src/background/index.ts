import { IS_DEV, PRODUCT_NAME, VERSION, isIncognitoContext } from '@/shared/env'
import { checkInjectable } from '@/shared/restricted'

import { registerLifecycle } from './lifecycle'

/**
 * Service Worker — نقطة الإقلاع.
 *
 * التسجيل يتم في المستوى الأعلى وبشكل متزامن: الـservice worker في MV3 يُعاد
 * تشغيله عند كل حدث، والمستمع الذي يُسجَّل داخل `await` قد يفوته الحدث الذي
 * أيقظ العامل أصلًا.
 */

const log = (message: string) => {
  if (IS_DEV) console.debug(`[${PRODUCT_NAME}] ${message}`)
}

registerLifecycle()

chrome.runtime.onInstalled.addListener((details) => {
  log(`onInstalled: ${details.reason} — v${VERSION}${isIncognitoContext() ? ' (خاص)' : ''}`)
})

chrome.runtime.onStartup.addListener(() => {
  log(`onStartup — v${VERSION}`)
})

/**
 * البوّابة الوحيدة للحقن.
 *
 * كل مسار يريد تشغيل شيء داخل صفحة يمرّ من هنا. الحقن الفعلي
 * (`chrome.scripting.executeScript`) يُضاف في المرحلة 6.
 */
export function canOperateOnTab(tab: chrome.tabs.Tab): boolean {
  const check = checkInjectable(tab.url)
  if (!check.injectable) {
    log(`حقن مرفوض (${check.reason}): ${tab.url ?? '—'}`)
    return false
  }
  return true
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab) return
  if (!canOperateOnTab(tab)) return
  log(`أمر: ${command} على التبويب ${String(tab.id)}`)
})
