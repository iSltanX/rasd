import { ok, type Result } from '@/shared/result'
import { patchSettings } from '@/shared/settings'

/**
 * إنهاء الجولة — «ابدأ» في آخرها و«تخطَّ» في أيّ خطوة سواء: تُكتب علامة «شوهد» ثمّ يُغلق التبويب
 * فيعود المستخدم إلى صفحته. **والكتابة تسبق الإغلاق وتشترطه:** تبويبٌ أُغلق على كتابة فاشلة يعيد
 * ترحيبيّة النافذة لاحقًا بلا أثر يُفهم، فيبقى مفتوحًا بسبب الفشل وزرّ إعادة.
 */
export async function finishOnboarding(
  now: number = Date.now(),
): Promise<Result<'closed' | 'open'>> {
  const written = await patchSettings({ onboarding: { completed: true, completedAt: now } })
  if (!written.ok) return written
  try {
    await closeOwnTab()
    return ok('closed')
  } catch {
    // «شوهد» كُتبت، والإغلاق وحده تعذّر: تقول الصفحة ذلك ولا تبقى بزرّ لا يفعل شيئًا ظاهرًا.
    return ok('open')
  }
}

/**
 * يُغلق تبويب الجولة. `window.close()` لا يُغلق تبويبًا لم يفتحه سكربت، فالإغلاق بـ`chrome.tabs`.
 * و**التبويب الوحيد في نافذته لا يُغلق وحده** — إغلاقه يُغلق النافذة كلّها — فيُفتح قبله تبويبٌ
 * جديد فارغ في النافذة نفسها.
 */
async function closeOwnTab(): Promise<void> {
  const tab = await chrome.tabs.getCurrent()
  if (tab?.id === undefined) {
    window.close()
    return
  }
  const siblings = await chrome.tabs.query({ windowId: tab.windowId })
  if (siblings.length <= 1) {
    await chrome.tabs.create({ windowId: tab.windowId, url: 'chrome://newtab/' })
  }
  await chrome.tabs.remove(tab.id)
}
