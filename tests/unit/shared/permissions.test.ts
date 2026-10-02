import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hasWithConsent, primeDataConsent, requestWithConsent } from '@/shared/permissions'

/**
 * الطلب المدمج: أصلٌ **وموافقة جمع البيانات** في نداءٍ واحد حين يعرفها المتصفّح، وبالأصل وحده حين لا.
 *
 * ودعم الموافقة يُخبَّأ قبل النقرة (`primeDataConsent`): قراءته داخل النقرة `await` يسبق `permissions.request`،
 * فيُسقط Firefox الإيماءة. والاختبار الأوّل أدناه يثبت أن النداء يقع **قبل أول microtask**.
 */

const ORIGIN = 'https://reports.example/*'

interface Api {
  request: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  getAll: ReturnType<typeof vi.fn>
}

function install(getAll: unknown): Api {
  const api: Api = {
    request: vi.fn().mockResolvedValue(true),
    contains: vi.fn().mockResolvedValue(true),
    getAll: vi.fn().mockResolvedValue(getAll),
  }
  Object.assign(globalThis.chrome, { permissions: api })
  return api
}

const WITH_CONSENT = { permissions: [], origins: [], data_collection: [] }
const WITHOUT_CONSENT = { permissions: [], origins: [] }

describe('requestWithConsent', () => {
  let api: Api
  beforeEach(() => {
    api = install(WITHOUT_CONSENT)
  })

  it('تدعم الموافقة ⇒ نداءٌ واحد بالمفتاحين', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    await expect(
      requestWithConsent({
        origins: [ORIGIN],
        dataCollection: ['technicalAndInteraction', 'websiteContent'],
      }),
    ).resolves.toBe('granted')
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(api.request).toHaveBeenCalledWith({
      origins: [ORIGIN],
      data_collection: ['technicalAndInteraction', 'websiteContent'],
    })
  })

  it('لا تدعم الموافقة ⇒ الأصل وحده، ولا مفتاح data_collection', async () => {
    await primeDataConsent()
    await expect(
      requestWithConsent({ origins: [ORIGIN], dataCollection: ['technicalAndInteraction'] }),
    ).resolves.toBe('granted')
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(api.request).toHaveBeenCalledWith({ origins: [ORIGIN] })
  })

  it('الدعم لم يُخبَّأ بعد ⇒ الأصل وحده (الإخفاق إلى الأضيق)', async () => {
    api = install(WITH_CONSENT)
    // تخبئةٌ سابقة بـ«لا» تُعاد إلى حال «غير مقروء» بوحدةٍ جديدة.
    vi.resetModules()
    const fresh = await import('@/shared/permissions')
    await fresh.requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] })
    expect(api.request).toHaveBeenCalledWith({ origins: [ORIGIN] })
  })

  it('بلا فئات ⇒ الأصل وحده ولو دُعمت الموافقة', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    await requestWithConsent({ origins: [ORIGIN] })
    expect(api.request).toHaveBeenCalledWith({ origins: [ORIGIN] })
  })

  it('النداء يقع متزامنًا — قبل أول microtask (وإلا سقطت الإيماءة)', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    const pending = requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] })
    expect(api.request).toHaveBeenCalledTimes(1)
    await pending
  })

  it('الرفض ⇒ denied', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    api.request.mockResolvedValue(false)
    await expect(
      requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe('denied')
  })

  it('رفض الشكل المدمج (يرمي) ⇒ يُطلبان متتاليين: الأصل ثمّ الموافقة', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    api.request
      .mockRejectedValueOnce(new Error('Unexpected property "data_collection"'))
      .mockResolvedValue(true)
    await expect(
      requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe('granted')
    expect(api.request.mock.calls.map(([arg]) => arg as unknown)).toEqual([
      { origins: [ORIGIN], data_collection: ['websiteContent'] },
      { origins: [ORIGIN] },
      { data_collection: ['websiteContent'] },
    ])
  })

  it('المتتاليان: رفض الأصل يوقف الطلب قبل الموافقة', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    api.request.mockRejectedValueOnce(new Error('shape')).mockResolvedValueOnce(false)
    await expect(
      requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe('denied')
    expect(api.request).toHaveBeenCalledTimes(2)
  })

  it('المتتاليان: رفض الموافقة بعد منح الأصل ⇒ denied (الإرسال يتوقّف)', async () => {
    api = install(WITH_CONSENT)
    await primeDataConsent()
    api.request
      .mockRejectedValueOnce(new Error('shape'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    await expect(
      requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe('denied')
  })

  it('الرمي في طلب الأصل وحده ⇒ error لا استثناء', async () => {
    await primeDataConsent()
    api.request.mockRejectedValue(new Error('must be called during a user gesture'))
    await expect(requestWithConsent({ origins: [ORIGIN] })).resolves.toBe('error')
  })
})

describe('hasWithConsent', () => {
  it('الأصل ممنوح والموافقة مدعومة وممنوحة ⇒ true، وتُسأل الموافقة بمفتاحها', async () => {
    const api = install(WITH_CONSENT)
    await expect(
      hasWithConsent({ origins: [ORIGIN], dataCollection: ['technicalAndInteraction'] }),
    ).resolves.toBe(true)
    expect(api.contains).toHaveBeenCalledWith({ origins: [ORIGIN] })
    expect(api.contains).toHaveBeenCalledWith({ data_collection: ['technicalAndInteraction'] })
  })

  it('الأصل ممنوح والموافقة غير ممنوحة ⇒ false فيُطلب عند «أرسل»', async () => {
    const api = install(WITH_CONSENT)
    // الأصل أوّلًا ثمّ الموافقة: الأصل ممنوح والموافقة لا.
    api.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(
      hasWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe(false)
  })

  it('الموافقة غير مدعومة ⇒ يكفي الأصل ولا تُسأل الموافقة', async () => {
    const api = install(WITHOUT_CONSENT)
    await expect(
      hasWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] }),
    ).resolves.toBe(true)
    expect(api.contains).toHaveBeenCalledTimes(1)
  })

  it('الأصل غير ممنوح ⇒ false', async () => {
    const api = install(WITH_CONSENT)
    api.contains.mockResolvedValue(false)
    await expect(hasWithConsent({ origins: [ORIGIN] })).resolves.toBe(false)
  })

  it('القراءة ترمي ⇒ false لا استثناء', async () => {
    const api = install(WITH_CONSENT)
    api.contains.mockRejectedValue(new Error('boom'))
    await expect(hasWithConsent({ origins: [ORIGIN] })).resolves.toBe(false)
  })

  it('تخبئ دعم الموافقة في الطريق: الطلب بعدها يحمل المفتاحين', async () => {
    const api = install(WITH_CONSENT)
    await hasWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] })
    await requestWithConsent({ origins: [ORIGIN], dataCollection: ['websiteContent'] })
    expect(api.request).toHaveBeenCalledWith({
      origins: [ORIGIN],
      data_collection: ['websiteContent'],
    })
  })
})
