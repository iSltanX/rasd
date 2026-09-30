import type { IconName } from '@/ui/icons/Icon'

/**
 * أوامر الالتقاط الأربعة في البيان (`manifest.config.ts`) بترتيب القراءة، وتسمياتها وأيقوناتها كما
 * في ورقة الاختصارات (`292:1691`) وجولة التعريف (`74:142`). **الاختصار نفسه لا يُكتب هنا:** يُقرأ من
 * `chrome.commands.getAll()` — المتصفّح قد يحجز تركيبةً صامتًا، والمستخدم يغيّرها من صفحته
 * (`Docs/Engineering.md §6` الصفّ 99).
 */
export const CAPTURE_COMMANDS: readonly { name: string; label: string; icon: IconName }[] = [
  { name: 'capture-area', label: 'منطقة', icon: 'capture-area' },
  { name: 'capture-element', label: 'عنصر', icon: 'capture-element' },
  { name: 'capture-viewport', label: 'الجزء الظاهر', icon: 'capture-viewport' },
  { name: 'capture-full-page', label: 'صفحة كاملة', icon: 'capture-full' },
]

/**
 * مفاتيح اختصارٍ كما يكتبه المتصفّح، مفتاحًا مفتاحًا: `Ctrl+Shift+T` بالفاصلة، و`⇧⌘T` على macOS
 * رمزًا رمزًا — فهو هناك بلا فاصل.
 */
export function shortcutKeys(shortcut: string): string[] {
  if (!shortcut) return []
  return shortcut.includes('+') ? shortcut.split('+').filter(Boolean) : Array.from(shortcut)
}
