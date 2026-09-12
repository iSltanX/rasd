import { IS_DEV, PRODUCT_NAME, VERSION, isIncognitoContext } from '@/shared/env'

import { activateTool, COMMAND_TOOL } from './commands'
import { registerContextMenus } from './context-menus'
import { registerLifecycle } from './lifecycle'
import { registerResume } from './resume'

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
registerContextMenus()
registerResume()

chrome.runtime.onInstalled.addListener((details) => {
  log(`onInstalled: ${details.reason} — v${VERSION}${isIncognitoContext() ? ' (خاص)' : ''}`)
})

chrome.runtime.onStartup.addListener(() => {
  log(`onStartup — v${VERSION}`)
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return
  const tool = COMMAND_TOOL[command]
  if (!tool) return
  log(`أمر: ${command} على التبويب ${String(tab.id)}`)
  void activateTool(tab.id, tool)
})
