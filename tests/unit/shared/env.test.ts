import { afterEach, describe, expect, it } from 'vitest'

import { isIncognitoContext } from '@/shared/env'

/**
 * `chrome.extension.inIncognitoContext` غير متاح في كل السياقات — والغياب يُعامَل
 * «ليس تصفّحًا خاصًّا»، لأن السياقات التي تفتقده (الـservice worker العادي) ليست
 * خاصة أصلًا. خطأ هذه الدالّة يفتح الحفظ في نافذة خاصة أو يمنعه في العادية.
 */

const original = (chrome as { extension?: unknown }).extension

afterEach(() => {
  Object.assign(chrome, { extension: original })
})

describe('isIncognitoContext', () => {
  it('نافذة خاصة → true', () => {
    Object.assign(chrome, { extension: { inIncognitoContext: true } })
    expect(isIncognitoContext()).toBe(true)
  })

  it('نافذة عادية → false', () => {
    Object.assign(chrome, { extension: { inIncognitoContext: false } })
    expect(isIncognitoContext()).toBe(false)
  })

  it('غياب الواجهة كلّها → false لا استثناء', () => {
    Object.assign(chrome, { extension: undefined })
    expect(isIncognitoContext()).toBe(false)
  })

  it('واجهة بلا الحقل → false — لا `undefined` تتسرّب إلى المستهلك', () => {
    Object.assign(chrome, { extension: {} })
    expect(isIncognitoContext()).toBe(false)
  })
})
