import { afterEach, describe, expect, it, vi } from 'vitest'

import { persistenceState, requestPersistence } from '@/shared/storage/persistence'

/**
 * التخزين الدائم: يُطلب مرّة حين لا يكون ممنوحًا، ولا يُطلب حين يُمنح، والنتيجة كما قرّرها المتصفّح.
 */

function stubStorage(storage: object | undefined) {
  vi.stubGlobal('navigator', { ...globalThis.navigator, storage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('التخزين الدائم', () => {
  it('ممنوحٌ أصلًا: لا طلب', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    stubStorage({ persisted: () => Promise.resolve(true), persist })
    expect(await requestPersistence()).toBe('persisted')
    expect(persist).not.toHaveBeenCalled()
  })

  it('غير ممنوح: يُطلب، والجواب كما قرّره المتصفّح', async () => {
    const persist = vi.fn(() => Promise.resolve(false))
    stubStorage({ persisted: () => Promise.resolve(false), persist })
    expect(await persistenceState()).toBe('not-requested')
    expect(await requestPersistence()).toBe('denied')
    expect(persist).toHaveBeenCalledTimes(1)

    stubStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(true) })
    expect(await requestPersistence()).toBe('persisted')
  })

  it('بلا الواجهة أو برميها: `unsupported` لا استثناء', async () => {
    stubStorage(undefined)
    expect(await requestPersistence()).toBe('unsupported')
    stubStorage({ persisted: () => Promise.reject(new Error('x')) })
    expect(await persistenceState()).toBe('unsupported')
    stubStorage({ persisted: () => Promise.resolve(false) })
    expect(await requestPersistence()).toBe('unsupported')
    stubStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.reject(new Error('x')),
    })
    expect(await requestPersistence()).toBe('unsupported')
  })
})
