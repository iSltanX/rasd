import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadPopupContext } from '@/pages/popup/context'
import { onMessage, resetHandlers } from '@/shared/messaging'
import { selectPopupState, type PopupContext } from '@/shared/popup-state'
import { getSession, setTabMode } from '@/shared/storage/session'

/**
 * تحميل سياق النافذة عبر رسائل حقيقية (لا اختلاق) — `session/get` و
 * `settings/get` يمرّان بمسار `send`/`onMessage` الفعلي، بمستقبِلات مبسّطة
 * تحاكي `lifecycle.ts` بما يكفي هذا الاختبار: هل تُشغِّل نتيجتا الرسالتين
 * الحالتين `restricted` و`offline` فعليًّا عبر `selectPopupState`، لا فقط
 * تُعيدان الحقول الصحيحة بمعزل عن بقية الأنبوب.
 */

function toContext(
  partial: Awaited<ReturnType<typeof loadPopupContext>>,
  online: boolean,
): PopupContext {
  return { ...partial, online }
}

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  onMessage('settings/get', () => ({ onboarding: { completed: true, completedAt: 1 } }))
  onMessage('session/get', async () => (await getSession()) as unknown as Record<string, unknown>)
})

describe('loadPopupContext — restricted', () => {
  it('صفحة chrome:// تُنتج restriction محظورة تُشغِّل حالة restricted', async () => {
    const partial = await loadPopupContext(1, 'chrome://settings')
    expect(partial.restriction).toEqual({ injectable: false, reason: 'browser-internal' })
    expect(selectPopupState(toContext(partial, true))).toBe('restricted')
  })

  it('صفحة عادية تُنتج restriction مسموحة — لا تُشغِّل restricted', async () => {
    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.restriction).toEqual({ injectable: true })
    expect(selectPopupState(toContext(partial, true))).not.toBe('restricted')
  })

  it('عنوان غائب (تبويب بلا url) يُعامَل كمحظور — الافتراض الآمن', async () => {
    const partial = await loadPopupContext(1, undefined)
    expect(partial.restriction).toEqual({ injectable: false, reason: 'invalid-url' })
  })
})

describe('loadPopupContext — offline', () => {
  it('online:false في السياق المُدمَج تُشغِّل حالة offline بصرف النظر عن القناة', async () => {
    const partial = await loadPopupContext(1, 'https://example.com/')
    // `online` لا تصل من `loadPopupContext` — النافذة تدمجها من `navigator.onLine`
    // الحيّ (انظر تعليق الدالّة). المحاكاة هنا تمثّل تلك الخطوة.
    expect(selectPopupState(toContext(partial, false))).toBe('offline')
    expect(selectPopupState(toContext(partial, true))).not.toBe('offline')
  })
})

describe('loadPopupContext — الجولة الأولى والوضع الحيّ', () => {
  it('onboarding.completed=false على صفحة مسموحة يُنتج firstRun', async () => {
    onMessage('settings/get', () => ({ onboarding: { completed: false, completedAt: null } }))

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.firstRun).toBe(true)
    expect(selectPopupState(toContext(partial, true))).toBe('first-run')
  })

  it('صفحة مقيّدة لا تُنتج firstRun أبدًا — restricted أولى', async () => {
    onMessage('settings/get', () => ({ onboarding: { completed: false, completedAt: null } }))

    const partial = await loadPopupContext(1, 'chrome://settings')
    expect(partial.firstRun).toBe(false)
    expect(selectPopupState(toContext(partial, true))).toBe('restricted')
  })

  it('وضع فحص محفوظ لهذا التبويب في الجلسة يصل عبر liveMode', async () => {
    await setTabMode(7, 'inspect')
    const partial = await loadPopupContext(7, 'https://example.com/')
    expect(partial.liveMode).toBe('inspect')
    expect(selectPopupState(toContext(partial, true))).toBe('inspect-active')
  })

  it('وضع تبويب آخر لا يُقرأ — كل تبويب معزول', async () => {
    await setTabMode(7, 'inspect')
    const partial = await loadPopupContext(8, 'https://example.com/')
    expect(partial.liveMode).toBeNull()
  })
})
