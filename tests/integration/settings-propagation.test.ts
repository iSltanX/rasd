import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettings, patchSettings, resetSettingsCache, watchSettings } from '@/shared/settings'
import { applyTheme } from '@/ui/theme'

/**
 * الانتشار الحيّ — الوحدة 20.1.
 *
 * `watchSettings`/`applyTheme` مكتوبتان منذ مراحل سابقة وبصفر توصيل إنتاجي؛
 * هذا الملفّ يثبت **التوصيل نفسه**: تغيّر إعداد في سياق ينعكس في سياق آخر
 * بلا نداء صريح وبلا إعادة تحميل — وأن فكّ المستمع يُسقط الانتشار، لا يُبقيه
 * صامدًا بالحظّ. كل سياق إنتاجي (نافذة · طبقة · خلفية) هو حزمة مستقلّة تحمل
 * نسخته الخاصّة من وحدة `shared/settings` — فذاكرتها المؤقّتة و`chrome.storage.onChanged`
 * الخاصّ بها مستقلّان عن السياقات الأخرى، ولو شارك الجميع مخزن `chrome.storage` الفعلي.
 */

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

describe('انتشار السمة إلى جذر مطبَّق عليه', () => {
  it('تغيّر السمة يُطبَّق على الجذر تلقائيًا بلا استدعاء applyTheme صريح', async () => {
    const root = document.createElement('html')
    watchSettings((settings) => applyTheme(settings, root))
    await vi.waitFor(() => expect(root.hasAttribute('lang')).toBe(true))

    await patchSettings({ appearance: { theme: 'dark' } } as never)
    await vi.waitFor(() => expect(root.getAttribute('data-theme')).toBe('dark'))

    await patchSettings({ appearance: { theme: 'light' } } as never)
    await vi.waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'))
  })

  it('جذران مستقلّان — يحاكيان النافذة والطبقة معًا — يتحدّثان كلاهما من التغيّر نفسه', async () => {
    const windowRoot = document.createElement('html')
    const layerRoot = document.createElement('div')
    watchSettings((settings) => applyTheme(settings, windowRoot))
    watchSettings((settings) => applyTheme(settings, layerRoot))
    await vi.waitFor(() => expect(windowRoot.hasAttribute('lang')).toBe(true))

    await patchSettings({ appearance: { density: 'compact' } } as never)
    await vi.waitFor(() => {
      expect(windowRoot.getAttribute('data-density')).toBe('compact')
      expect(layerRoot.getAttribute('data-density')).toBe('compact')
    })
  })

  it('فكّ المستمع يُسقط الانتشار — الحارس السالب لمعيار الاكتمال', async () => {
    const root = document.createElement('html')
    const stop = watchSettings((settings) => applyTheme(settings, root))
    await vi.waitFor(() => expect(root.hasAttribute('lang')).toBe(true))

    stop()
    await patchSettings({ appearance: { theme: 'dark' } } as never)

    // إن كان الانتشار موصولًا لظهرت `dark` هنا — الفكّ يجب أن يُبقي الجذر
    // على حالته قبل التغيّر لا أن يلتقطه على أي حال.
    expect(root.hasAttribute('data-theme')).toBe(false)
  })
})

describe('انتشار الإعداد إلى ذاكرة سياق بلا واجهة — الخلفية', () => {
  it('الاشتراك يُبقي getSettings طريًّا بعد تغيّر مصدره سياقٌ آخر', async () => {
    // يحاكي أوّل قراءة في الـservice worker عند الإقلاع — تُخزَّن مؤقّتًا.
    await getSettings()
    // يحاكي التوصيل: تسجيل مستمع تغيّر واحد — الإصلاح الذي تضيفه 20.1.
    watchSettings(() => undefined)

    // كتابة مباشرة إلى التخزين المموَّه — تحاكي سياقًا آخر (صفحة الإعدادات)
    // يكتب عبر `patchSettings` في **نسخته** المستقلّة من الوحدة، لا هذه.
    await fakeBrowser.storage.local.set({
      'rasd:settings': { capture: { format: 'webp' } },
    })

    await vi.waitFor(async () => expect((await getSettings()).capture.format).toBe('webp'))
  })

  it('بلا اشتراك، الذاكرة المؤقّتة تبقى قديمة بعد تغيّر خارجي — العطل الذي توصله هذه الوحدة', async () => {
    await getSettings()
    // لا `watchSettings` هنا — يحاكي الحالة قبل توصيل 20.1.

    await fakeBrowser.storage.local.set({
      'rasd:settings': { capture: { format: 'webp' } },
    })

    // بلا مستمع `onChanged` في هذا السياق، `cache` لا تتحدَّث: القراءة التالية
    // تعيد القيمة القديمة إلى أن يُعاد تشغيل السياق كاملًا.
    expect((await getSettings()).capture.format).toBe('png')
  })
})
