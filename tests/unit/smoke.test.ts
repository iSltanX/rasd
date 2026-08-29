import { describe, expect, it } from 'vitest'

import { IS_DEV, NAMESPACE, PRODUCT_NAME, VERSION } from '@/shared/env'

describe('سلسلة الاختبار', () => {
  it('تحلّ مسار @/ إلى src/', () => {
    expect(PRODUCT_NAME).toBe('رصد')
    expect(NAMESPACE).toBe('rasd')
  })

  it('تحقن رقم النسخة وقت البناء', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('تعرّف وضع البناء', () => {
    expect(typeof IS_DEV).toBe('boolean')
  })

  it('توفّر بديلًا مزيّفًا لـchrome.*', () => {
    expect(chrome.runtime).toBeDefined()
    expect(typeof chrome.runtime.onInstalled.addListener).toBe('function')
  })
})
