import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { egressAllowed, egressFetch, serviceFor } from '@/shared/egress'
import { resetSettingsCache, updateSettings } from '@/shared/settings'

/**
 * مخرج الشبكة الواحد — ADR 0046 §4. الشروط الأربعة بترتيبها، وكلٌّ يُغلق: أصلٌ غير مسمًّى، وإعداداتٌ لم تُقرأ،
 * و«الوضع المحلّي فقط»، وصلاحية المضيف. وفي كلٍّ منها **لا يُستدعى `fetch` أصلًا** — الرفض قبل الطلب لا بعده.
 */

const GITHUB = 'https://api.github.com/user'
let contains: ReturnType<typeof vi.fn>

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  contains = vi.fn().mockResolvedValue(true)
  Object.assign(globalThis.chrome, { permissions: { contains } })
})

const localOnly = (on: boolean) =>
  updateSettings((current) => ({ privacy: { ...current.privacy, localOnly: on } }))
const online = () => localOnly(false)
const fetcher = () => vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

describe('serviceFor', () => {
  it('بالأصل حرفًا لا بالبادئة', () => {
    expect(serviceFor('https://api.github.com/repos/a/b')?.id).toBe('github')
    expect(serviceFor('https://api.github.com.evil.io/x')).toBeNull()
    expect(serviceFor('http://api.github.com/x')).toBeNull()
    expect(serviceFor('https://github.com/x')).toBeNull()
    expect(serviceFor('not a url')).toBeNull()
  })
})

describe('egressFetch — الرفض قبل الطلب', () => {
  it('أصلٌ غير مسمًّى', async () => {
    await online()
    const f = fetcher()
    const sent = await egressFetch('https://evil.example/collect', {}, f)
    expect(sent.ok ? 'sent' : sent.error.refusal).toBe('unnamed-origin')
    expect(f).not.toHaveBeenCalled()
  })

  it('«الوضع المحلّي فقط» — الافتراضي على تثبيتٍ جديد', async () => {
    const f = fetcher()
    const sent = await egressFetch(GITHUB, {}, f)
    expect(sent.ok ? 'sent' : sent.error.refusal).toBe('local-only')
    expect(f).not.toHaveBeenCalled()
  })

  it('إعداداتٌ لم تُقرأ جهلٌ لا سماح', async () => {
    await online()
    resetSettingsCache()
    const local = chrome.storage.local
    Object.assign(globalThis.chrome.storage, {
      local: { ...local, get: vi.fn().mockRejectedValue(new Error('io')) },
    })
    try {
      const f = fetcher()
      const sent = await egressFetch(GITHUB, {}, f)
      expect(sent.ok ? 'sent' : sent.error.refusal).toBe('settings-unreadable')
      expect(f).not.toHaveBeenCalled()
    } finally {
      Object.assign(globalThis.chrome.storage, { local })
    }
  })

  it('صلاحية المضيف غير ممنوحة', async () => {
    await online()
    contains.mockResolvedValue(false)
    const f = fetcher()
    const sent = await egressFetch(GITHUB, {}, f)
    expect(sent.ok ? 'sent' : sent.error.refusal).toBe('host-permission')
    expect(contains).toHaveBeenCalledWith({ origins: ['https://api.github.com/*'] })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('egressFetch — الطلب', () => {
  it('يخرج بعد الشروط، بلا ملفّات تعريف ولا مُحيل ولا ذاكرة', async () => {
    await online()
    const f = fetcher()
    const sent = await egressFetch(GITHUB, { method: 'GET', credentials: 'include' }, f)
    expect(sent.ok).toBe(true)
    expect(f).toHaveBeenCalledWith(GITHUB, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  })

  it('فشل الوصول ⇐ `network` باسم الخطأ وحده، لا برسالته', async () => {
    await online()
    const f = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch https://api.github.com/?t=s3cr3t'))
    const sent = await egressFetch(GITHUB, {}, f)
    expect(sent.ok).toBe(false)
    if (!sent.ok) {
      expect(sent.error).toEqual({ refusal: 'network', service: 'github', detail: 'TypeError' })
    }
  })

  it('«الوضع المحلّي» يُعاد تفعيله فيُغلق من جديد', async () => {
    await online()
    expect((await egressAllowed('github')).ok).toBe(true)
    await localOnly(true)
    const allowed = await egressAllowed('github')
    expect(allowed.ok ? 'allowed' : allowed.error.refusal).toBe('local-only')
  })
})
