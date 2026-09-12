import { describe, expect, it } from 'vitest'

import { isMacPlatform } from '@/shared/platform'

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
})
