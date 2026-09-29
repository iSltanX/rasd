import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettings, resetSettingsCache, watchSettings } from '@/shared/settings'

/**
 * قراءةٌ بدأت قبل تغيّرٍ ووصلت بعده لا تُعيد القيمة القديمة.
 *
 * `watchSettings` يقرأ لقطة أولى ويشترك في التغيّر معًا. فإن كتب سياقٌ آخر (صفحة الإعدادات)
 * بينما القراءة الأولى معلّقة، وصل حدث التغيّر أوّلًا بالقيمة الجديدة، ثمّ وصلت القراءة
 * بالقديمة — فكتبتها في الذاكرة المؤقّتة وسلّمتها للمستمع آخرًا: حرف أداة جديد يرتدّ إلى
 * القديم حتى التغيّر التالي. كشفه اختبار الاختصار الحيّ (`shortcut-live.test.ts`).
 */
beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

describe('سباق القراءة الأولى مع التغيّر', () => {
  it('المستمع والذاكرة المؤقّتة ينتهيان على القيمة الجديدة لا القديمة', async () => {
    const seen: string[] = []
    watchSettings((s) => seen.push(s.shortcuts.toolKeys.inspect ?? ''))
    // الكتابة فورًا — والقراءة الأولى لم تُحلّ بعد.
    await fakeBrowser.storage.local.set({
      'rasd:settings': { shortcuts: { toolKeys: { inspect: 'KeyJ' } } },
    })
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    await new Promise((r) => setTimeout(r, 20))

    expect(seen.at(-1)).toBe('KeyJ')
    expect((await getSettings()).shortcuts.toolKeys.inspect).toBe('KeyJ')
  })
})
