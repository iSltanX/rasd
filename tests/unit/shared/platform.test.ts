import { afterEach, describe, expect, it, vi } from 'vitest'

import { isMacPlatform } from '@/shared/platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMacPlatform', () => {
  it('يقرأ userAgentData.platform أوّلًا', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' } })).toBe(true)
    expect(isMacPlatform({ userAgentData: { platform: 'Windows' } })).toBe(false)
  })

  it('يعود إلى navigator.platform حين يغيب userAgentData', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false)
  })

  it('بلا أي مصدر يُعامَل غير-ماك', () => {
    expect(isMacPlatform({})).toBe(false)
  })

  it('userAgentData بلا platform يعود إلى navigator.platform لا إلى نصّ فارغ', () => {
    expect(isMacPlatform({ userAgentData: {}, platform: 'MacIntel' })).toBe(true)
  })

  it('بلا وسيط يقرأ `navigator` العامّ', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(isMacPlatform()).toBe(true)

    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(isMacPlatform()).toBe(false)
  })

  it('بيئة بلا `navigator` أصلًا تُعامَل غير-ماك ولا ترمي', () => {
    // بيئة تشغيل بلا كائن عامّ (Node مثلًا): `navigator` غائب لا كائنًا فارغًا.
    vi.stubGlobal('navigator', undefined)
    expect(isMacPlatform()).toBe(false)
  })
})
