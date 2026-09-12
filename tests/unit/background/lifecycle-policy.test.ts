import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerLifecycle } from '@/background/lifecycle'
import { patchSettings, resetSettingsCache } from '@/shared/settings'
import * as db from '@/shared/storage/db'

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
  // fakeBrowser لا يطبّق `runtime.onConnect` ولا `alarms` — registerLifecycle
  // تستدعيهما (القنوات والحارس) وهما خارج نطاق هذا الاختبار تمامًا.
  Object.assign(globalThis.chrome, {
    runtime: { ...globalThis.chrome.runtime, onConnect: { addListener: vi.fn() } },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  })
})

describe('registerLifecycle — سياسة التصفّح الخاص حيّة', () => {
  it('تغيّر الإعداد بعد الإقلاع يُعيد تطبيق السياسة بلا إعادة تشغيل', async () => {
    const spy = vi.spyOn(db, 'setIncognitoWritePolicy')
    registerLifecycle()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(true))

    await patchSettings({ privacy: { blockIncognitoWrites: false } } as never)
    await vi.waitFor(() => expect(spy).toHaveBeenLastCalledWith(false))
  })
})
