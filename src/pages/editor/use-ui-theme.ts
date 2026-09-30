import { useLayoutEffect, useState } from 'preact/hooks'

import { effectiveTheme, watchSystemTheme } from '@/ui/theme'

/**
 * السمة الفعّالة للواجهة الآن، وتتبّعها: اختيار المستخدم الصريح (`data-theme` على الجذر، يكتبه
 * `applyTheme` عند كل تغيّر في الإعدادات) وتفضيل النظام حين لا اختيار.
 *
 * لألوان الواجهة فوق القماش وحدها — التحديد والمقابض وحدّ الحجب (`colors.ts`). ألوان التعليق
 * مثبَّتة لأنها تُخبَز في الصورة.
 */
export function useUiTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState(effectiveTheme)

  // عند الإثبات لا بعد الرسم: `useEffect` يتأخّر إلى ما بعد الإطار، فتغييرٌ يقع بينهما يضيع.
  useLayoutEffect(() => {
    const sync = () => setTheme(effectiveTheme())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const stopSystem = watchSystemTheme(sync)
    return () => {
      observer.disconnect()
      stopSystem()
    }
  }, [])

  return theme
}
