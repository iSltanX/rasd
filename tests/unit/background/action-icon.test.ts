import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTIVE_ICON, IDLE_ICON } from '@/background/action-icon'
import { registerLifecycle } from '@/background/lifecycle'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'
import { getSession } from '@/shared/storage/session'

/**
 * أيقونة شريط الأدوات بحالتيها — معيار قبول `STAGES/03`: تصير «نشطة» حين تُفتح أداة في
 * التبويب، وتعود «خاملة» حين تُغلق. المصدر تقرير الطبقة نفسها (`mode/report`)، والأيقونة
 * تُضبط على **ذلك التبويب وحده**.
 */

let setIcon: ReturnType<typeof vi.fn>

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  vi.restoreAllMocks()
  setIcon = vi.fn().mockResolvedValue(undefined)
  // fakeBrowser لا يطبّق `runtime.onConnect` ولا `alarms` ولا `action` — registerLifecycle
  // تستدعي الأوّلين عند التسجيل، والثالث ما يُختبَر هنا.
  Object.assign(globalThis.chrome, {
    runtime: { ...globalThis.chrome.runtime, onConnect: { addListener: vi.fn() } },
    alarms: {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn() },
    },
    action: { ...globalThis.chrome.action, setIcon },
  })
  registerLifecycle()
})

/** تقرير الطبقة كما يصل من سكربت المحتوى في التبويب `tabId`. */
async function report(mode: string, tabId = 7): Promise<unknown> {
  const replies: unknown[] = []
  // ما تعيده المستمعات (`true` لإبقاء القناة) لا يهمّ — الردّ يصل عبر `sendResponse`.
  void (await fakeBrowser.runtime.onMessage.trigger(
    { __rasd: 1, id: `r-${mode}`, type: 'mode/report', payload: { mode } },
    { tab: { id: tabId } } as chrome.runtime.MessageSender,
    (reply: unknown) => replies.push(reply),
  ))
  await vi.waitFor(() => expect(replies).toHaveLength(1))
  return replies[0]
}

describe('أيقونة شريط الأدوات', () => {
  it('تصير «نشطة» حين تُفتح أداة، وتعود «خاملة» حين تُغلق', async () => {
    await report('inspect')
    expect(setIcon).toHaveBeenLastCalledWith({ tabId: 7, path: ACTIVE_ICON })

    await report('idle')
    expect(setIcon).toHaveBeenLastCalledWith({ tabId: 7, path: IDLE_ICON })
  })

  it('كل أداة مفتوحة «نشطة» — لا الفحص وحده', async () => {
    for (const mode of ['area', 'element', 'measure', 'colour', 'compare']) {
      await report(mode)
      expect(setIcon).toHaveBeenLastCalledWith({ tabId: 7, path: ACTIVE_ICON })
    }
  })

  it('على تبويب التقرير وحده — لا تتغيّر أيقونة الإضافة في كل التبويبات', async () => {
    await report('measure', 3)
    await report('idle', 9)
    expect(setIcon.mock.calls).toEqual([
      [{ tabId: 3, path: ACTIVE_ICON }],
      [{ tabId: 9, path: IDLE_ICON }],
    ])
  })

  it('تبويبٌ أُغلق قبل الضبط لا يُفشل التقرير ولا يمنع تسجيل الوضع', async () => {
    setIcon.mockRejectedValueOnce(new Error('No tab with id: 7.'))
    const reply = await report('inspect')
    expect(reply).toMatchObject({ ok: true })
    expect((await getSession()).modes[7]).toBe('inspect')
  })

  it('المسارات الأربعة موجودة في `public/icons`', async () => {
    const { existsSync } = await import('node:fs')
    for (const path of [...Object.values(IDLE_ICON), ...Object.values(ACTIVE_ICON)]) {
      expect(existsSync(`public/${path}`), path).toBe(true)
    }
  })
})
