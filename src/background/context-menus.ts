/**
 * قائمة السياق — البنود نفسها على الصفحة والصورة والتحديد.
 *
 * ثلاثة سياقات لثمانية أدوات كانت تعني 24 استدعاءً لولا `contexts` القابلة
 * للتكرار: بند واحد بثلاثة سياقات يكفي، والمعالج نفسه يستقبل الثلاثة
 * فيُفعِّل الأداة عبر `activateTool` — المسار الموحَّد نفسه الذي تستعمله
 * الاختصارات والنافذة.
 */

import { activateTool } from './commands'

import type { ToolName } from '@/shared/messaging'

const PARENT_ID = 'rasd-menu'

/** ثمانية بنود — نفس ترتيب القائمة في النافذة: الالتقاط ثم الفحص. */
const ITEMS: ReadonlyArray<{ id: ToolName; title: string }> = [
  { id: 'area', title: 'تصوير منطقة' },
  { id: 'element', title: 'تصوير عنصر' },
  { id: 'viewport', title: 'تصوير الجزء الظاهر' },
  { id: 'full-page', title: 'تصوير الصفحة كاملة' },
  { id: 'inspect', title: 'فحص عنصر' },
  { id: 'measure', title: 'قياس' },
  { id: 'colour', title: 'اختيار لون' },
  { id: 'compare', title: 'فتح المقارنة' },
]

/**
 * صيغة تحوّل نصّية-حرفية لا مصفوفة عادية — `chrome.contextMenus.create`
 * يشترط عنصرًا واحدًا على الأقلّ في النوع نفسه، لا `ContextType[]` عامّة.
 */
const CONTEXTS: [`${chrome.contextMenus.ContextType}`, ...`${chrome.contextMenus.ContextType}`[]] =
  ['page', 'image', 'selection']

/**
 * يسجّل القائمة. آمن الاستدعاء عند كل `onInstalled`/`onStartup`: البنود
 * القديمة تُزال أوّلًا فلا تتكرّر عبر عمليات التسجيل المتتالية.
 */
export function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: PARENT_ID,
      title: 'رصد',
      contexts: CONTEXTS,
    })
    for (const item of ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        parentId: PARENT_ID,
        title: item.title,
        contexts: CONTEXTS,
      })
    }
  })

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return
    const tool = ITEMS.find((item) => item.id === info.menuItemId)
    if (!tool) return
    void activateTool(tab.id, tool.id)
  })
}
